#!/usr/bin/env python3
"""NOBU Companion operational runtime overlay.

The canonical archive and ``02_ENGINE/battle_simulator.py`` are protected by
``canonical/LOCK.json``.  This module fixes app-runtime wiring defects without
editing either protected artifact.  Every rule below is keyed by an exact
canonical ID and is sourced from the canonical skill/trait rows bundled with
the app.

Rules whose public/canonical text does not contain enough information for a
numeric implementation are deliberately reported as unresolved instead of
being guessed.  They remain available for operational simulations, but the
adapter labels the resulting formation as operational-only.
"""

from __future__ import annotations

from collections import Counter
from typing import Any


OVERLAY_VERSION = "nobu-companion-runtime-overlay-v1"

# Officer rows contain a small set of historical intrinsic IDs while the
# executable tactic rows live under the canonical IDs on the right.  These are
# semantic delegates only; they must never turn the historical IDs into
# attachable candidates.
INTRINSIC_SKILL_ID_DELEGATES = {
    "KNP_10030": "KNY_ADD_0178",  # 鬼庭左月斎 / 生死一顧
    "KNP_10033": "KNY_ADD_0179",  # 斎藤利三 / 全力戦闘
    "KNP_10039": "KNY_ADD_0134",  # 鈴木重朝 / 鉄砲猛撃
    "KNP_10043": "KNY_ADD_0147",  # 池田せん / 不意打ち
    "KNY_ADD_0163": "KNP_10057",  # 内藤信成 / 嘲罵
    "KNY_ADD_0168": "KNY_ADD_0183",  # 武田義信 / 一触即発
    "KNY_ADD_0172": "KNP_10056",  # 長野業盛 / 不退転
}

# These rows do not expose a complete battle formula in the protected DB.
# Keeping them explicit prevents a generic fallback from being mistaken for a
# verified implementation.
UNRESOLVED_SKILL_RULES = {
    "KNY_ADD_0160": "捨て身の義: 対象条件と0.2/0.6の分岐条件が正本DBに未収録",
}
UNRESOLVED_TRAIT_RULES = {
    "淑徳": "効果本文が正本DBで「確定済み」のみ",
    "手足之愛": "効果本文が正本DBで「確定済み」のみ",
}


def _skill_ids_for_actor(bs, side, actor_idx: int) -> set[str]:
    skills = getattr(side, "_runtime_skills_by_actor_v1305", None)
    if skills is None:
        skills = bs.skill_assignment(side.best, bs.__dict__.get("_CTX_FOR_TICK", {}))
    return {str(skill.get("skill_id", "")) for skill in skills.get(actor_idx, [])}


def _actor_has_skill(bs, side, actor_idx: int, skill_id: str) -> bool:
    return skill_id in _skill_ids_for_actor(bs, side, actor_idx)


def _normalize_intrinsic_ids(best: dict[str, Any]) -> None:
    for officer in best.get("_officer_rows") or []:
        source_id = str(officer.get("固有戦法ID") or "")
        canonical_id = INTRINSIC_SKILL_ID_DELEGATES.get(source_id)
        if not canonical_id:
            continue
        officer.setdefault("runtime_source_intrinsic_skill_id", source_id)
        officer["固有戦法ID"] = canonical_id
    # The canonical assignment cache is fingerprinted by officer IDs.  Remove a
    # possible pre-normalization side cache; the context-level cache remains safe.
    best.pop("_runtime_skills_by_actor_v1305", None)


def _ensure_list_attr(side, name: str, default: Any) -> list[Any]:
    size = len(getattr(side, "officers", []) or [])
    current = list(getattr(side, name, []) or [])
    while len(current) < size:
        current.append(default() if callable(default) else default)
    current = current[:size]
    setattr(side, name, current)
    return current


def _fixed_physical_row(ratio: float, note: str) -> dict[str, Any]:
    return {
        "effect_type": "DAMAGE_PHYSICAL",
        "coefficient_type": "兵刃火力",
        "coefficient_value": float(ratio),
        "dependency_stat": "武勇",
        "target_side": "敵軍",
        "target_count": 1,
        "notes": note,
    }


def _direct_control(bs, ctx, source_side, target_side, source_idx: int, target_idx: int,
                    control: str, turns: int, rng, logs, turn: int, source_name: str) -> bool:
    helper = getattr(bs, "_apply_control_direct", None)
    if helper is not None:
        return bool(helper(ctx, source_side, target_side, source_idx, target_idx,
                           control, turns, rng, logs, turn, source_name))
    if target_idx not in target_side.alive() or bs.has_insight(ctx, target_side, target_idx):
        return False
    if bs.maybe_nullify_control_by_v1175_trait(
        ctx, target_side, target_idx, control, rng, logs, turn, source_name
    ):
        return False
    target_side.controls[target_idx][control] = max(
        int(target_side.controls[target_idx].get(control, 0) or 0), int(turns)
    )
    logs.append(
        f"T{turn} {source_side.label}:{source_name} -> "
        f"{target_side.label}:{target_side.officers[target_idx].get('武将名')} {control}{turns}T"
    )
    return True


def _select_targets(side, rng, count: int) -> list[int]:
    targets = list(side.alive())
    rng.shuffle(targets)
    return targets[: min(max(0, int(count)), len(targets))]


def _execute_overlay_skill(bs, original, ctx, actor_idx, skill, ally, enemy, rng,
                           logs, turn, phase="active_execute"):
    sid = str(skill.get("skill_id") or "")

    # Dedicated passive/event hooks below own these IDs.  Suppress generic rows
    # so a metadata row cannot add a second pseudo-effect.
    if sid in {"KNP_10009", "KNP_10044", "KNY_0015", "KNY_0017"}:
        return 0

    if sid == "KNY_ADD_0160":
        if phase == "battle_start":
            unresolved = list(getattr(ally, "runtime_overlay_unresolved", []) or [])
            item = {"type": "skill", "id": sid, "name": "捨て身の義",
                    "reason": UNRESOLVED_SKILL_RULES[sid]}
            if item not in unresolved:
                unresolved.append(item)
            ally.runtime_overlay_unresolved = unresolved
            logs.append(
                f"T{turn} {ally.label}:{ally.officers[actor_idx].get('武将名')} "
                "捨て身の義 FORMAL_UNRESOLVED_NO_NUMERIC_FALLBACK"
            )
        return 0

    if sid == "KNP_10021":  # 弓調馬服
        if phase != "active_execute" or actor_idx not in ally.alive() or not enemy.alive():
            return 0
        target = rng.choice(list(enemy.alive()))
        force = bs._effective_stat(enemy, target, "武勇", ctx)
        intel = bs._effective_stat(enemy, target, "知略", ctx)
        primary = "武勇" if force >= intel else "知略"
        both = rng.random() < 0.20
        stats = ["武勇", "知略"] if both else [primary]
        for stat in stats:
            bs.grant_timed_flat_stat_delta(
                enemy, target, stat, -100.0, 2, "弓調馬服", logs=logs, turn=turn
            )
        logs.append(
            f"T{turn} {ally.label}:{ally.officers[actor_idx].get('武将名')} 弓調馬服 strict -> "
            f"{enemy.label}:{enemy.officers[target].get('武将名')} stats={','.join(stats)} "
            f"both20={str(both).lower()} operational_base_rate=0.20"
        )
        return len(stats)

    if sid == "KNP_10034":  # 槍の鈴
        if phase != "after_normal_attack" or actor_idx not in ally.alive() or not enemy.alive():
            return 0
        target = (getattr(ally, "last_normal_targets", [None] * 3) or [None] * 3)[actor_idx]
        if target not in enemy.alive():
            logs.append(f"T{turn} {ally.label}:槍の鈴 skip_dead_last_normal_target")
            return 0
        damage = bs.direct_damage_to(
            _fixed_physical_row(2.32, "槍の鈴 strict 直前通常対象兵刃232%"),
            actor_idx, ally, enemy, target, rng, logs, turn, "槍の鈴",
            kind_label="兵刃", ctx=ctx,
        )
        fired = 1
        if int(turn) >= 3 and actor_idx in ally.alive():
            heal_row = {
                "coefficient_value": 0.54,
                "dependency_stat": "武勇",
                "target_side": "自軍",
                "target_type": "自身",
                "target_count": 1,
                "_fixed_targets": [actor_idx],
            }
            bs.apply_heal(heal_row, actor_idx, ally, rng, logs, turn, "槍の鈴")
            fired += 1
        logs.append(
            f"T{turn} {ally.label}:{ally.officers[actor_idx].get('武将名')} "
            f"槍の鈴 strict damage={damage:.0f} t3_heal={str(int(turn) >= 3).lower()}"
        )
        return fired

    if sid == "KNP_10045":  # 奮戦
        if phase != "active_execute" or actor_idx not in ally.alive():
            return 0
        ally.zengo_combo_turns[actor_idx] = max(
            int(ally.zengo_combo_turns[actor_idx] or 0), 1
        )
        bs.grant_timed_general_damage_dealt_mult(
            ally, actor_idx, 0.85, 1, "奮戦", logs=logs, turn=turn
        )
        logs.append(
            f"T{turn} {ally.label}:{ally.officers[actor_idx].get('武将名')} "
            "奮戦 strict 連撃1T/与ダメx0.85_1T"
        )
        return 2

    if sid == "KNP_10052":  # 反撃
        if phase != "active_execute" or actor_idx not in ally.alive():
            return 0
        states = _ensure_list_attr(ally, "runtime_counter_60_states", lambda: None)
        states[actor_idx] = {"turns": 1, "source": "反撃"}
        ally.runtime_counter_60_states = states
        logs.append(
            f"T{turn} {ally.label}:{ally.officers[actor_idx].get('武将名')} "
            "反撃 strict 兵刃60%反撃状態1T"
        )
        return 1

    if sid == "KNY_ADD_0147":  # 不意打ち
        if phase != "active_execute" or actor_idx not in ally.alive() or not enemy.alive():
            return 0
        targets = _select_targets(enemy, rng, 2)
        duration = 2 if rng.random() < 0.65 else 1
        applied = 0
        for target in targets:
            control = rng.choice(["無策", "封撃"])
            applied += int(_direct_control(
                bs, ctx, ally, enemy, actor_idx, target, control, duration,
                rng, logs, turn, "不意打ち",
            ))
        logs.append(
            f"T{turn} {ally.label}:{ally.officers[actor_idx].get('武将名')} 不意打ち strict "
            f"targets={len(targets)} duration={duration}T duration_scope=bundle_shared applied={applied}"
        )
        return max(1, applied)

    if sid == "KNY_ADD_0181":  # 荒切
        if phase != "after_normal_attack" or actor_idx not in ally.alive():
            return 0
        # The state is granted after the current normal-action repeat count was
        # fixed.  Store 2 ticks so it survives this turn's tick_end and supplies
        # the disclosed one-turn combo window on the next action.
        ally.zengo_combo_turns[actor_idx] = max(
            int(ally.zengo_combo_turns[actor_idx] or 0), 2
        )
        logs.append(
            f"T{turn} {ally.label}:{ally.officers[actor_idx].get('武将名')} "
            "荒切 strict 次回行動連撃1T internal_ticks=2"
        )
        return 1

    if sid == "KNY_ADD_0189":  # 威圧（戦法。制御状態とは別）
        if phase != "active_execute" or actor_idx not in ally.alive() or not enemy.alive():
            return 0
        targets = _select_targets(enemy, rng, 2)
        for target in targets:
            bs.grant_timed_general_damage_dealt_mult(
                enemy, target, 0.85, 3, "威圧_戦法", logs=logs, turn=turn
            )
        logs.append(
            f"T{turn} {ally.label}:{ally.officers[actor_idx].get('武将名')} "
            f"威圧 strict targets={len(targets)} outgoing=x0.85 public2T/internal3"
        )
        return len(targets)

    if sid == "TRN_0112":  # 深慮遠謀
        if phase != "battle_start" or actor_idx not in ally.alive() or not enemy.alive():
            return 0
        targets = _select_targets(enemy, rng, 2)
        for target in targets:
            bs.grant_timed_general_damage_dealt_mult(
                enemy, target, 0.72, 3, "深慮遠謀", logs=logs, turn=turn
            )
        logs.append(
            f"T{turn} {ally.label}:{ally.officers[actor_idx].get('武将名')} "
            f"深慮遠謀 strict targets={len(targets)} outgoing=x0.72 T1-T3 "
            "operational_disclosed_base_intel_formula_unpublished"
        )
        return len(targets)

    if sid == "KNP_10057":  # 嘲罵
        if phase != "active_execute" or actor_idx not in ally.alive() or not enemy.alive():
            return 0
        applied = 0
        for target in list(enemy.alive()):
            if not _direct_control(
                bs, ctx, ally, enemy, actor_idx, target, "挑発", 1,
                rng, logs, turn, "嘲罵",
            ):
                continue
            old = (getattr(enemy, "taunt_redirect_states", [None] * 3)[target] or {})
            if int(old.get("turns", 0) or 0) <= 1:
                enemy.taunt_redirect_states[target] = {
                    "target_idx": actor_idx,
                    "turns": 1,
                    "source_side": ally,
                    "source": "嘲罵",
                }
            applied += 1
        logs.append(
            f"T{turn} {ally.label}:{ally.officers[actor_idx].get('武将名')} "
            f"嘲罵 strict all_enemy_taunt applied={applied}"
        )
        return max(1, applied)

    if sid == "KNY_ADD_0183":  # 一触即発
        if phase != "after_normal_attack" or actor_idx not in ally.alive() or not enemy.alive():
            return 0
        target = (getattr(ally, "last_normal_targets", [None] * 3) or [None] * 3)[actor_idx]
        if target not in enemy.alive():
            return 0
        bs.grant_timed_flat_stat_delta(
            enemy, target, "統率", -140.0, 1, "一触即発", logs=logs, turn=turn
        )
        _direct_control(
            bs, ctx, ally, enemy, actor_idx, target, "無策", 1,
            rng, logs, turn, "一触即発",
        )
        logs.append(
            f"T{turn} {ally.label}:{ally.officers[actor_idx].get('武将名')} "
            f"一触即発 strict -> {enemy.label}:{enemy.officers[target].get('武将名')} 統率-140/無策1T"
        )
        return 2

    if sid == "KNP_10056":  # 不退転
        if phase != "after_normal_attack" or actor_idx not in ally.alive() or not enemy.alive():
            return 0
        target = (getattr(ally, "last_normal_targets", [None] * 3) or [None] * 3)[actor_idx]
        if target not in enemy.alive():
            return 0
        damage = bs.direct_damage_to(
            _fixed_physical_row(1.40, "不退転 strict 直前通常対象兵刃140%"),
            actor_idx, ally, enemy, target, rng, logs, turn, "不退転",
            kind_label="兵刃", ctx=ctx,
        )
        logs.append(
            f"T{turn} {ally.label}:{ally.officers[actor_idx].get('武将名')} "
            f"不退転 strict damage={damage:.0f}"
        )
        return 1

    return original(ctx, actor_idx, skill, ally, enemy, rng, logs, turn, phase=phase)


def _trigger_runtime_normal_counters(bs, ctx, defender_side, attacker_side,
                                     defender_idx: int, attacker_idx: int,
                                     actual_damage: float, rng, logs, turn: int) -> None:
    if actual_damage <= 0:
        return

    # 腹中鱗甲: passive, every positive normal hit, role-sensitive 52/62%.
    if (defender_idx in defender_side.alive() and attacker_idx in attacker_side.alive()
            and _actor_has_skill(bs, defender_side, defender_idx, "KNP_10044")):
        ratio = 0.52 if defender_idx == 0 else 0.62
        damage = bs.direct_damage_to(
            _fixed_physical_row(ratio, "腹中鱗甲 strict normal counter"),
            defender_idx, defender_side, attacker_side, attacker_idx, rng, logs,
            turn, "腹中鱗甲", kind_label="兵刃", ctx=ctx, trigger_events=False,
        )
        logs.append(
            f"T{turn} {defender_side.label}:{defender_side.officers[defender_idx].get('武将名')} "
            f"腹中鱗甲 strict role={'大将' if defender_idx == 0 else '副将'} ratio={ratio:.2f} "
            f"counter={damage:.0f}"
        )

    # 反撃: active one-turn state, every positive normal hit during the window.
    states = _ensure_list_attr(defender_side, "runtime_counter_60_states", lambda: None)
    state = states[defender_idx] or {}
    if (defender_idx in defender_side.alive() and attacker_idx in attacker_side.alive()
            and int(state.get("turns", 0) or 0) > 0):
        damage = bs.direct_damage_to(
            _fixed_physical_row(0.60, "反撃 strict armed normal counter"),
            defender_idx, defender_side, attacker_side, attacker_idx, rng, logs,
            turn, "反撃", kind_label="兵刃", ctx=ctx, trigger_events=False,
        )
        logs.append(
            f"T{turn} {defender_side.label}:{defender_side.officers[defender_idx].get('武将名')} "
            f"反撃 strict counter={damage:.0f}"
        )

    # 月華鶴影: only the holder's two friends count as 友軍.  One 35% roll per
    # positive friend normal-hit event; every fourth event grants permanent
    # critical +25%, capped at two stacks.
    counts = _ensure_list_attr(defender_side, "runtime_gekka_friend_hit_counts", 0)
    stacks = _ensure_list_attr(defender_side, "runtime_gekka_critical_stacks", 0)
    for holder in list(defender_side.alive()):
        if holder == defender_idx or not _actor_has_skill(bs, defender_side, holder, "KNY_0017"):
            continue
        counts[holder] = int(counts[holder] or 0) + 1
        if counts[holder] % 4 == 0 and int(stacks[holder] or 0) < 2:
            stacks[holder] = int(stacks[holder] or 0) + 1
            defender_side.persistent_critical_rate_bonus[holder] = min(
                1.0,
                float(defender_side.persistent_critical_rate_bonus[holder] or 0.0) + 0.25,
            )
            logs.append(
                f"T{turn} {defender_side.label}:{defender_side.officers[holder].get('武将名')} "
                f"月華鶴影 友軍通常被弾count={counts[holder]} 会心+25% stack={stacks[holder]}/2"
            )
        if attacker_idx not in attacker_side.alive() or rng.random() >= 0.35:
            continue
        targets = _select_targets(attacker_side, rng, 2)
        for target in targets:
            if holder not in defender_side.alive():
                break
            bs.direct_damage_to(
                _fixed_physical_row(1.02, "月華鶴影 strict friend-hit counter"),
                holder, defender_side, attacker_side, target, rng, logs, turn,
                "月華鶴影", kind_label="兵刃", ctx=ctx, trigger_events=False,
            )
        logs.append(
            f"T{turn} {defender_side.label}:{defender_side.officers[holder].get('武将名')} "
            f"月華鶴影 strict proc35 targets={len(targets)} friend_hit_count={counts[holder]}"
        )
    defender_side.runtime_gekka_friend_hit_counts = counts
    defender_side.runtime_gekka_critical_stacks = stacks


def _gunshin_holders(bs, side) -> list[int]:
    return [idx for idx in side.alive() if _actor_has_skill(bs, side, idx, "KNY_0015")]


def _grant_gunshin_charge_from_friend_action(bs, side, actor_idx: int, rng, logs,
                                             turn: int, action_kind: str) -> None:
    for holder in _gunshin_holders(bs, side):
        if holder == actor_idx:
            continue
        roll = rng.random()
        if roll >= 0.66:
            logs.append(
                f"T{turn} {side.label}:{side.officers[holder].get('武将名')} 軍神 "
                f"友軍{action_kind}溜め不発 rate=0.66 roll={roll:.4f}"
            )
            continue
        old = max(0, min(12, int(side.charge_counts[holder] or 0)))
        side.charge_counts[holder] = min(12, old + 1)
        logs.append(
            f"T{turn} {side.label}:{side.officers[holder].get('武将名')} 軍神 "
            f"友軍{action_kind}溜め+1 {old}->{side.charge_counts[holder]} "
            f"operational_base_rate=0.66 roll={roll:.4f}"
        )


def _apply_old_fox_conversion(bs, ctx, side, logs) -> None:
    for idx, officer in enumerate(side.officers):
        if not bs.officer_has_unlocked_trait(ctx, officer, "古狸"):
            continue
        allies = [str(row.get("勢力") or "").strip()
                  for other, row in enumerate(side.officers) if other != idx]
        shared = next((faction for faction, count in Counter(allies).items()
                       if faction and count >= 2), "")
        if not shared:
            logs.append(
                f"{side.label}:{officer.get('武将名')} 凸特性runtime 古狸 条件不成立 "
                f"ally_factions={allies}"
            )
            continue
        before = str(officer.get("勢力") or "").strip()
        officer["勢力"] = shared
        # The formation coefficients were precomputed before battle state
        # creation.  Reconnect the now-unified faction to the exact central
        # faction lanes used by the damage formula.
        side.best.update({
            "faction_buff_active": True,
            "faction_buff_name": shared,
            "faction_buff_coef": 1.07,
            "faction_buff_attack_coef": 1.07,
            "faction_buff_defense_taken_coef": 0.93,
        })
        logs.append(
            f"{side.label}:{officer.get('武将名')} 凸特性runtime 古狸 "
            f"勢力変換 {before or '空欄'}->{shared} 群勢バフON"
        )


def audit_best(best: dict[str, Any], ctx: dict[str, Any] | None = None) -> dict[str, Any]:
    """Return the adapter-visible operational/formal audit for one formation."""
    unresolved: list[dict[str, str]] = []
    officers = best.get("_officer_rows") or []
    for officer in officers:
        sid = str(officer.get("固有戦法ID") or "")
        if sid in UNRESOLVED_SKILL_RULES:
            unresolved.append({
                "type": "skill", "id": sid,
                "name": str(officer.get("固有戦法名") or sid),
                "reason": UNRESOLVED_SKILL_RULES[sid],
            })
    for assignment in best.get("attach_assignment") or []:
        sid = str(assignment.get("skill_id") or "")
        if sid in UNRESOLVED_SKILL_RULES:
            unresolved.append({
                "type": "skill", "id": sid,
                "name": str(assignment.get("skill_name") or sid),
                "reason": UNRESOLVED_SKILL_RULES[sid],
            })
    if ctx is not None:
        try:
            import battle_simulator as bs
            for officer in officers:
                for trait in bs.cumulative_traits_for_officer(ctx, officer):
                    name = str(trait.get("特性名") or "")
                    if name in UNRESOLVED_TRAIT_RULES:
                        unresolved.append({
                            "type": "trait", "id": name, "name": name,
                            "reason": UNRESOLVED_TRAIT_RULES[name],
                        })
        except Exception as error:
            unresolved.append({
                "type": "audit", "id": "TRAIT_RUNTIME_AUDIT_ERROR",
                "name": "凸特性runtime監査",
                "reason": f"{type(error).__name__}: {error}",
            })
    deduped = []
    seen = set()
    for item in unresolved:
        key = (item["type"], item["id"], item["reason"])
        if key not in seen:
            seen.add(key)
            deduped.append(item)
    return {
        "overlayVersion": OVERLAY_VERSION,
        "formalReady": not deduped,
        "unresolved": deduped,
        "canonicalArchiveModified": False,
        "protectedBattleRuntimeModified": False,
    }


def install_runtime_overlay(ctx: dict[str, Any] | None = None) -> str:
    """Install exact-ID wrappers into the imported canonical runtime once."""
    import battle_simulator as bs

    if getattr(bs, "_nobu_companion_runtime_overlay_version", None) == OVERLAY_VERSION:
        return OVERLAY_VERSION

    original_find_skill = bs.find_skill
    original_side_state = bs.side_state
    original_activation_bonus = bs.activation_bonus_for
    original_row_phase_kind = bs.row_phase_kind
    original_execute_core = bs._execute_skill_core
    original_normal_counter = bs.maybe_trigger_dousatsu_hangeki_normal_counter
    original_tick_end = bs.tick_end
    original_apply_phase_effects = bs.apply_phase_effects
    original_normal_attack = bs.normal_attack
    original_single_normal_hit = bs._resolve_single_normal_attack_hit
    original_execute_skill = bs.execute_skill
    original_grant_ranbu = bs.grant_ichiriki_ranbu_state
    original_initialize_traits = bs.initialize_generic_awaken_trait_runtime

    def find_skill(ctx_arg, name_or_id):
        return original_find_skill(ctx_arg, INTRINSIC_SKILL_ID_DELEGATES.get(str(name_or_id), name_or_id))

    def side_state(best, label):
        _normalize_intrinsic_ids(best)
        return original_side_state(best, label)

    def activation_bonus_for(actor_idx, skill, side, ctx_arg):
        bonus = float(original_activation_bonus(actor_idx, skill, side, ctx_arg) or 0.0)
        assignments = side.best.get("attach_assignment") or []
        role = bs.ROLES[actor_idx] if actor_idx < len(bs.ROLES) else ""
        attached = any(
            assignment.get("role") == role
            and (str(assignment.get("skill_id") or "") == "KNP_10009"
                 or str(assignment.get("skill_name") or "") == "独立独歩")
            for assignment in assignments
        )
        if attached:
            skill_type = str(skill.get("skill_type") or "")
            if "突撃" in skill_type:
                bonus += 0.17
            elif "能動" in skill_type:
                # Remove the legacy generic-scanner misroute to active skills.
                bonus -= 0.17
        return max(0.0, bonus)

    def row_phase_kind(row):
        if str(row.get("skill_id") or "") == "KNP_10034":
            return "after_normal_attack"
        return original_row_phase_kind(row)

    def execute_core(ctx_arg, actor_idx, skill, ally, enemy, rng, logs, turn,
                     phase="active_execute"):
        return _execute_overlay_skill(
            bs, original_execute_core, ctx_arg, actor_idx, skill, ally, enemy,
            rng, logs, turn, phase=phase,
        )

    def normal_counter(ctx_arg, defender_side, attacker_side, defender_idx,
                       attacker_idx, actual_damage, rng, logs=None, turn=0):
        result = original_normal_counter(
            ctx_arg, defender_side, attacker_side, defender_idx, attacker_idx,
            actual_damage, rng, logs, turn,
        )
        _trigger_runtime_normal_counters(
            bs, ctx_arg, defender_side, attacker_side, defender_idx, attacker_idx,
            actual_damage, rng, logs if logs is not None else [], int(turn),
        )
        return result

    def tick_end(side):
        result = original_tick_end(side)
        states = _ensure_list_attr(side, "runtime_counter_60_states", lambda: None)
        for idx, state in enumerate(states):
            if not state:
                continue
            payload = dict(state)
            payload["turns"] = int(payload.get("turns", 0) or 0) - 1
            states[idx] = payload if payload["turns"] > 0 else None
        side.runtime_counter_60_states = states
        return result

    def apply_phase_effects(ctx_arg, side, enemy, skills, phase, turn, rng, logs,
                            only_actor=None):
        if phase == "before_action" and only_actor == 0 and 0 in side.alive() \
                and _actor_has_skill(bs, side, 0, "KNY_0015"):
            old = max(0, min(12, int(side.charge_counts[0] or 0)))
            side.charge_counts[0] = min(12, old + 1)
            logs.append(
                f"T{turn} {side.label}:{side.officers[0].get('武将名')} "
                f"軍神 大将行動前溜め+1 {old}->{side.charge_counts[0]}"
            )
        return original_apply_phase_effects(
            ctx_arg, side, enemy, skills, phase, turn, rng, logs,
            only_actor=only_actor,
        )

    def single_normal_hit(ctx_arg, actor_idx, ally, enemy, target_idx, rng, logs,
                          turn, enemy_skills=None, coefficient_value=1.00):
        mults = getattr(ally, "runtime_gunshin_normal_mult", {}) or {}
        coefficient_value = float(coefficient_value) * float(mults.get(actor_idx, 1.0))
        return original_single_normal_hit(
            ctx_arg, actor_idx, ally, enemy, target_idx, rng, logs, turn,
            enemy_skills=enemy_skills, coefficient_value=coefficient_value,
        )

    def normal_attack(ctx_arg, actor_idx, ally, enemy, rng, logs, turn,
                      enemy_skills=None):
        charge = 0
        if _actor_has_skill(bs, ally, actor_idx, "KNY_0015"):
            charge = max(0, min(12, int(ally.charge_counts[actor_idx] or 0)))
            mult = 2.60 if charge >= 12 else 1.0 + 0.10 * charge
            current = dict(getattr(ally, "runtime_gunshin_normal_mult", {}) or {})
            current[actor_idx] = mult
            ally.runtime_gunshin_normal_mult = current
            logs.append(
                f"T{turn} {ally.label}:{ally.officers[actor_idx].get('武将名')} "
                f"軍神 通常攻撃補正 charge={charge}/12 mult={mult:.2f}"
            )
        try:
            fired = original_normal_attack(
                ctx_arg, actor_idx, ally, enemy, rng, logs, turn,
                enemy_skills=enemy_skills,
            )
        finally:
            current = dict(getattr(ally, "runtime_gunshin_normal_mult", {}) or {})
            current.pop(actor_idx, None)
            ally.runtime_gunshin_normal_mult = current
        if fired and charge > 0:
            ally.charge_counts[actor_idx] = 0
            logs.append(
                f"T{turn} {ally.label}:{ally.officers[actor_idx].get('武将名')} "
                f"軍神 通常攻撃後溜めリセット {charge}->0"
            )
        if fired:
            _grant_gunshin_charge_from_friend_action(
                bs, ally, actor_idx, rng, logs, int(turn), "通常攻撃"
            )
        return fired

    def execute_skill(ctx_arg, actor_idx, skill, ally, enemy, rng, logs, turn,
                      phase="active_execute"):
        fired = original_execute_skill(
            ctx_arg, actor_idx, skill, ally, enemy, rng, logs, turn, phase=phase
        )
        skill_type = str(skill.get("skill_type") or "")
        if fired and phase in {"active_execute", "active_recast", "after_normal_attack"} \
                and ("能動" in skill_type or "突撃" in skill_type):
            _grant_gunshin_charge_from_friend_action(
                bs, ally, actor_idx, rng, logs, int(turn),
                "突撃" if "突撃" in skill_type else "能動",
            )
        return fired

    def grant_ranbu(side, idx, rate, turns, source="一力当先", logs=None, turn=0):
        if _actor_has_skill(bs, side, idx, "KNY_0015"):
            if logs is not None:
                logs.append(
                    f"T{turn} {side.label}:{side.officers[idx].get('武将名')} "
                    f"軍神 乱舞獲得不可 source={source}"
                )
            return None
        return original_grant_ranbu(side, idx, rate, turns, source, logs, turn)

    def initialize_traits(ctx_arg, side, logs=None):
        target_logs = logs if logs is not None else []
        _apply_old_fox_conversion(bs, ctx_arg, side, target_logs)
        result = original_initialize_traits(ctx_arg, side, logs)
        unresolved = list(getattr(side, "trait_runtime_unresolved", []) or [])
        for officer in side.officers:
            for trait in bs.cumulative_traits_for_officer(ctx_arg, officer):
                name = str(trait.get("特性名") or "")
                if name not in UNRESOLVED_TRAIT_RULES:
                    continue
                item = {
                    "officer": officer.get("武将名"),
                    "trait": name,
                    "reason": UNRESOLVED_TRAIT_RULES[name],
                }
                if item not in unresolved:
                    unresolved.append(item)
                target_logs.append(
                    f"{side.label}:{officer.get('武将名')} 凸特性runtime {name} "
                    "FORMAL_UNRESOLVED_NO_NUMERIC_FALLBACK"
                )
        side.trait_runtime_unresolved = unresolved
        return result

    bs.find_skill = find_skill
    bs.side_state = side_state
    bs.activation_bonus_for = activation_bonus_for
    bs.row_phase_kind = row_phase_kind
    bs._execute_skill_core = execute_core
    bs.maybe_trigger_dousatsu_hangeki_normal_counter = normal_counter
    bs.tick_end = tick_end
    bs.apply_phase_effects = apply_phase_effects
    bs._resolve_single_normal_attack_hit = single_normal_hit
    bs.normal_attack = normal_attack
    bs.execute_skill = execute_skill
    bs.grant_ichiriki_ranbu_state = grant_ranbu
    bs.initialize_generic_awaken_trait_runtime = initialize_traits
    bs._nobu_companion_runtime_overlay_version = OVERLAY_VERSION

    if ctx is not None:
        ctx["nobu_companion_runtime_overlay_version"] = OVERLAY_VERSION
    return OVERLAY_VERSION


__all__ = [
    "OVERLAY_VERSION",
    "INTRINSIC_SKILL_ID_DELEGATES",
    "UNRESOLVED_SKILL_RULES",
    "UNRESOLVED_TRAIT_RULES",
    "audit_best",
    "install_runtime_overlay",
]

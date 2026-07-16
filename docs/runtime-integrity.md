# b223 runtime integration record

## Verified inputs

- Bootstrap archive SHA-256: `00f9305903d58bc3d1e292ce675d66c5a2256ac31174719fcc699251c0526d0d`
- Canonical archive SHA-256: `fe0086eb5797e6c32b1156e736fe432a500dce7dfcb8921fed28c336a17b0fa3`
- Canonical `02_ENGINE/battle_simulator.py` SHA-256: `4f308f4bcd297ee292e41b0ad13243fa3df61df49b1b8f68926eba70843bcecc`
- Generated runtime bundle SHA-256: `b23ba268b67395df4e2669ba0eb7b4081ecad0d22f2b1dee8d3c567e41a84756`
- Canonical ZIP members: 1366 unique, 0 duplicate names
- Generated bundle members: 1368 unique, 0 duplicate names
- Supplied legacy runtime bundle: 2687 members, 1223 duplicate names; it is not used as the production bundle

## Boundary

`canonical/NOBU_ONE_v1326p15e2b223.zip` is immutable input. The build script verifies its archive and battle runtime hashes, extracts it to a temporary directory, and overlays `runtime/adapter/browser_runtime_api.py` plus `runtime/adapter/operational_runtime_overlay.py`. The canonical archive is never rewritten. The operational overlay uses exact skill IDs, normalizes seven historical intrinsic-ID delegates, and reports rules with missing source text as operational-only instead of inventing numeric effects.

Public operations are `calculate`, `search`, and `formal`. The 100-battle calculate path invokes an internal `calculateBatch` lane for 10 forward and 10 reverse battles at a time and streams all five batches through one Pyodide worker. Successful batches retain their JavaScript-side checkpoint; only a fatal Wasm batch restarts and adaptively splits. Win/loss detail traces reuse the same worker and collect only the action order, scoreboards, selected events, and logs required by the T1-T8 UI. TypeScript validates and maps application formations before every request. The worker wraps every Python exception with its type, message, traceback, operation, request context, and seed before Safari can reduce it to bare Wasm frames.

The default search lane inspects all 146 canonical officers and all 236 canonical skills, including all 34,456 officer-skill relations, with a deterministic lightweight prefilter. Of the 115 attachable skills, 112 currently enter formal candidate generation; three source-quarantined skills remain visible with their exact exclusion reasons. Unknown ownership defaults to zero awaken and explicit owned records override that value. This is a coverage-and-quality staged search, not an exhaustive Cartesian search and not a global-optimum claim. The prior owned-only lane remains available as a lower-cost option.

The search adapter evaluates one placement for every coverage/quality family first, then admits the shortlisted commander/deputy permutations as atomic six-placement families. Shortlisted families run every formal-ready role order with common random seeds; ranking uses win rate, remaining-troop difference, and structural score, then returns the best role order plus all evaluated variants for manual switching in the UI. This keeps full-catalog coverage within the iPhone memory envelope without weakening the six-role comparison for displayed candidates.

The release lock in `canonical/LOCK.json` pins the canonical archive, battle runtime, and generated runtime bundle hashes. Build, Python integrity tests, offline asset verification, and the post-deploy Pages smoke test all read or validate the same release lock. A bundle hash drift fails the build.

## Reproducible fixture

- Candidate: 山本騎馬
- Target: 黒田弓
- Seed: `1326230000`
- Trials: `2`
- Blocks: `1`
- Win rate: `0.25`
- Balanced HP difference: `-7864.35`

## Browser verification

- Chromium iPhone viewport verifies import, IndexedDB persistence, online 100-battle calculation, complete offline reload, runtime identity, and the saved Battle Log.
- WebKit iPhone environment verifies the real 50+50 calculation through one persistent vendored-Pyodide worker.
- Chromium and WebKit iPhone environments verify the full-catalog staged optimizer, its 146/236 coverage report, and four shortlisted unit families with all six role orders.
- Service Worker and full offline automation remain on Chromium because Playwright Service Worker routing and inspection are Chromium-specific.
- The streamed-worker and compact-trace fix remains subject to final physical-iPhone confirmation on the deployed Pages build; CI cannot claim the device memory gate from desktop WebKit alone.

## CI release gates

- Production dependency audit: `npm audit --omit=dev`
- Deterministic runtime bundle build and fixed bundle SHA
- Python runtime integrity and calculate/search/formal E2E
- Vitest unit/component tests
- TypeScript and Vite production build
- Offline precache and manifest verification
- Serialized Chromium and WebKit Playwright E2E
- 45-minute job limit, same-ref run cancellation, browser cache, and retained failure traces/reports

## External evidence

Game8 is registered in `external-source-policy.json` as supplementary evidence. Its own notice states that updates have stopped and coverage ends on 2026-05-31. It cannot directly modify the canonical runtime or silently override canonical database values.

# b223 runtime integration record

## Verified inputs

- Bootstrap archive SHA-256: `00f9305903d58bc3d1e292ce675d66c5a2256ac31174719fcc699251c0526d0d`
- Canonical archive SHA-256: `fe0086eb5797e6c32b1156e736fe432a500dce7dfcb8921fed28c336a17b0fa3`
- Canonical `02_ENGINE/battle_simulator.py` SHA-256: `4f308f4bcd297ee292e41b0ad13243fa3df61df49b1b8f68926eba70843bcecc`
- Generated runtime bundle SHA-256: `484dc59a1c34a413049a3ead4f4b4f1670629c479345e9c93ae653717dba0aec`
- Canonical ZIP members: 1366 unique, 0 duplicate names
- Generated bundle members: 1367 unique, 0 duplicate names
- Supplied legacy runtime bundle: 2687 members, 1223 duplicate names; it is not used as the production bundle

## Boundary

`canonical/NOBU_ONE_v1326p15e2b223.zip` is immutable input. The build script verifies its archive and battle runtime hashes, extracts it to a temporary directory, and overlays only `runtime/adapter/browser_runtime_api.py`. The adapter now adds the 100-battle result summary and compact win/loss representative traces with T1-T8 action and troop-change evidence. The canonical archive and protected battle runtime are never rewritten.

Public operations are `calculate`, `search`, and `formal`. TypeScript validates and maps application formations before sending requests to the isolated Web Worker.

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

- Chromium iPhone viewport verifies import, IndexedDB persistence, a 100-battle online calculation, complete offline reload, runtime identity, and offline viewing of the saved win/loss T1-T8 Battle Log.
- WebKit iPhone environment verifies import and real b223 calculation through vendored Pyodide.
- Service Worker and full offline automation remain on Chromium because Playwright Service Worker routing and inspection are Chromium-specific.
- Physical iPhone Safari, home-screen installation, standalone launch, and airplane-mode use remain unverified until measured on the deployed Pages build.

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

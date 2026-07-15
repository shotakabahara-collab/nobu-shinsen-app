# b223 runtime integration record

## Verified inputs

- Bootstrap archive SHA-256: `00f9305903d58bc3d1e292ce675d66c5a2256ac31174719fcc699251c0526d0d`
- Canonical archive SHA-256: `fe0086eb5797e6c32b1156e736fe432a500dce7dfcb8921fed28c336a17b0fa3`
- Canonical `02_ENGINE/battle_simulator.py` SHA-256: `4f308f4bcd297ee292e41b0ad13243fa3df61df49b1b8f68926eba70843bcecc`
- Generated runtime bundle SHA-256: `42910f235511f5b54ec84802f072836b40935b7349455d08e36b4d5815ff423b`
- Canonical ZIP members: 1366 unique, 0 duplicate names
- Generated bundle members: 1367 unique, 0 duplicate names
- Supplied legacy runtime bundle: 2687 members, 1223 duplicate names; it is not used as the production bundle

## Boundary

`canonical/NOBU_ONE_v1326p15e2b223.zip` is immutable input. The build script verifies its archive and battle runtime hashes, extracts it to a temporary directory, and overlays only `runtime/adapter/browser_runtime_api.py`. The canonical archive is never rewritten.

Public operations are `calculate`, `search`, and `formal`. The 100-battle calculate path invokes an internal `calculateBatch` lane for 10 forward and 10 reverse battles at a time, terminates that Pyodide worker, and repeats until 50+50 canonical `simulate_once` results are complete. Win/loss detail traces run in separate fresh workers. TypeScript validates and maps application formations before every request.

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
- WebKit iPhone environment verifies the real 50+50 calculation through recycled vendored-Pyodide workers.
- Service Worker and full offline automation remain on Chromium because Playwright Service Worker routing and inspection are Chromium-specific.
- The recycled-worker fix remains subject to final physical-iPhone confirmation on the deployed Pages build; CI cannot claim the device memory gate from desktop WebKit alone.

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

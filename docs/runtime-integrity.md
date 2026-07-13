# b223 runtime integration record

## Verified inputs

- Bootstrap archive SHA-256: `00f9305903d58bc3d1e292ce675d66c5a2256ac31174719fcc699251c0526d0d`
- Canonical archive SHA-256: `fe0086eb5797e6c32b1156e736fe432a500dce7dfcb8921fed28c336a17b0fa3`
- Canonical `02_ENGINE/battle_simulator.py` SHA-256: `4f308f4bcd297ee292e41b0ad13243fa3df61df49b1b8f68926eba70843bcecc`
- Canonical ZIP members: 1366 unique, 0 duplicate names
- Supplied legacy runtime bundle: 2687 members, 1223 duplicate names; it is not used as the production bundle

## Boundary

`canonical/NOBU_ONE_v1326p15e2b223.zip` is immutable input. The build script verifies its archive and battle runtime hashes, extracts it to a temporary directory, and overlays only `runtime/adapter/browser_runtime_api.py`. The canonical archive is never rewritten.

Public operations are `calculate`, `search`, and `formal`. TypeScript validates and maps application formations before sending requests to the isolated Web Worker.

The generated `public/runtime_bundle_b223.tgz` SHA-256 is `42910f235511f5b54ec84802f072836b40935b7349455d08e36b4d5815ff423b`. Its build is deterministic and guarded by the canonical archive and battle runtime hashes above.

## Reproducible fixture

`fixtures/runtime/calculate_request.json` evaluates registered Yamamoto cavalry against Kuroda bow with seed `1326230000`, 2 trials, and 1 block. The locked result is win rate `0.25` and balanced HP difference `-7864.35`.

## Unverified

- Pyodide execution in iPhone Safari
- first-install and offline behavior on a physical iPhone

## Verified execution

- Python runtime E2E executes reproducible `calculate`, `search`, and `formal` fixtures.
- Playwright runs the production build at an iPhone viewport, imports a real formation backup, executes b223 through the vendored Pyodide worker, and verifies the result and Battle Log.
- The production service worker precaches all 11 required application, Pyodide, runtime, manifest, and icon assets; the runtime worker contains no external URL.
- GitHub Actions runs unit, runtime integrity/E2E, production build, offline, and browser E2E checks.

## External evidence

Game8 is registered in `external-source-policy.json` as supplementary evidence. Its own notice states that updates have stopped and coverage ends on 2026-05-31. It cannot directly modify the canonical runtime or silently override canonical database values.

# AGENTS.md

## Scope
These instructions apply to the full repository at `/Users/cwang/Downloads/3js-follow-along-demo-master 2`.

## Project Snapshot
- Minimal browser-only Three.js lane runner.
- No bundler, transpiler, or package-managed runtime pipeline.
- `three` is loaded via an import map in `index.html` from CDN (`unpkg`).
- Local HTTP server is required for module loading and assets.

## Key Files
- `index.html`: DOM shell, HUD (`#scoreboard`, `#game-over`), styles, import map, entry script tag.
- `script.js`: Main game loop, rendering, controls, spawning, collisions, difficulty scaling, reset flow.
- `src/score.mjs`: Pure score-state helpers used by runtime and tests.
- `tests/score.test.mjs`: Node test coverage for score behavior.
- `assets/`: Runtime image assets (currently `horizon-terminal.png`).

## Run And Verify
1. Start a local server from repo root:
   - `python3 -m http.server 8080`
2. Open `http://localhost:8080`.
3. Run tests after score logic changes:
   - `node --test tests/score.test.mjs`

## Implementation Conventions
- Keep `src/score.mjs` framework-agnostic and side-effect free; mutate only the passed score state object.
- Keep gameplay logic in `script.js`; avoid scattering runtime state across new globals/files unless there is clear modular benefit.
- Preserve keyboard controls unless explicitly changing UX:
  - Left: `ArrowLeft` or `A`
  - Right: `ArrowRight` or `D`
  - Jump: `Space`
  - Duck: `ArrowDown` or `S`
- Dispose Three.js resources when removing meshes (`geometry.dispose()`, `material.dispose()`).
- Keep HUD IDs stable (`score`, `best-score`, `final-score`, `play-again`, `game-over`) because runtime code queries them directly.

## Change Guidelines For Agents
- Prefer small, targeted edits that preserve existing game feel unless behavior changes are requested.
- When adjusting difficulty, keep min/max clamp relationships consistent to avoid invalid spawn ranges.
- When changing collision or runner bounds, verify both jump and duck obstacle interactions.
- If adding new modules, keep ES module imports browser-compatible (no Node-only APIs in runtime files).

## Definition Of Done
- Runtime still loads in browser via local HTTP server.
- No console errors at startup.
- Game over and reset cycle still work.
- Score and best score display correctly.
- `node --test tests/score.test.mjs` passes.

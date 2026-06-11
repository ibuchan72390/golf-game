# Golf Game

A web-based 3D golf game — low-poly cartoon style, deterministic physics.
Play it: `https://<username>.github.io/golf-game/`

## Develop

- `npm install` then `npm run dev`
- Controls: ←/→ aim · space/click/tap drives the 3-click meter · 1–4 select club
- `?seed=N` fixes the RNG seed; `&instant=1` skips flight animation

## Test

- `npm test` — unit (sim core is pure + deterministic; golden tests are exact)
- `npm run test:e2e` — Playwright playthrough; visual snapshots run in CI only
  (re-baseline via the "Update visual snapshots" workflow)

## Architecture

See `docs/superpowers/specs/2026-06-11-golf-game-design.md`. Load-bearing rule:
`src/sim/` never imports DOM or Three.js, and never calls `Math.random()`.

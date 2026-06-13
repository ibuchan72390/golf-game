# Golf Game

A web-based 3D golf game — low-poly cartoon style, deterministic physics.
Play it: `https://<username>.github.io/golf-game/`

## Develop

- `npm install` then `npm run dev`
- Menu → Play a Round (curated course or random) → 9 holes with a scorecard → round summary
- Menu → Upgrade Clubs spends skill points earned per round on the 8-club bag
- Controls in a hole: ←/→ aim · hold-release (default): hold to charge, release, tap the band · 1–4 or tap to select club · ⚙ settings
- `?round=N` boots straight into a round on seed N; `&instant=1` skips flight animation; `?dev=courses` shows the generator gallery

## Test

- `npm test` — unit (sim core is pure + deterministic; golden tests are exact)
- `npm run test:e2e` — Playwright playthrough; visual snapshots run in CI only
  (re-baseline via the "Update visual snapshots" workflow)

## Architecture

See `docs/superpowers/specs/`. Load-bearing rules: `src/sim/` and `src/course/` never import DOM/Three and never call `Math.random()`/`Date.now()`; `resolveShot` is deterministic given `(state, intent, loadout)`; the `Round` orchestrates the single-hole `Game`; progression lives in the versioned save profile.

## License

MIT — see `LICENSE`.

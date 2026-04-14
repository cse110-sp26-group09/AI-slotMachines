# AI Token Slot Machine

A tiny slot machine app built with vanilla HTML/CSS/JavaScript that makes fun of AI hype cycles: you **spend tokens** to spin and sometimes **win tokens** back.

## Run

- Easiest: open `index.html` in a browser.
- Or serve locally:
  - `python3 -m http.server 8000`
  - then visit `http://localhost:8000`

## Features

- Persistent balance + stats via `localStorage`
- “Temperature” slider that changes symbol odds
- Seeded RNG per spin (copy the seed to reproduce outcomes)
- Web Audio API sounds (toggleable), Vibration API feedback (if supported)
- Keyboard shortcuts: `Space` to spin, `A` to toggle auto-spin

## Note

This is a toy. No real money, no gambling, and definitely no financial advice.


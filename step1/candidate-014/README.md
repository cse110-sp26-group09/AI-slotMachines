# Token Tombola — AI Slot Machine (Vanilla Web)

Satirical slot machine where you *win tokens* and *spend tokens* in a suspiciously familiar AI economy.

## Run

- Easiest: open `index.html` in a browser.
- Better (avoids some browser restrictions): serve this folder, e.g. `npx serve` or any static server.

## What it uses

- Vanilla HTML/CSS/JS
- `localStorage` persistence (balance + stats)
- Web Audio API sound effects (optional mute)
- Vibration API (mobile-friendly haptics)
- Notifications API (optional; used for rate-limit messages)
- Clipboard + Share APIs for “brag” export


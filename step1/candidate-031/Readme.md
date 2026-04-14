# Prompt Casino — Vanilla Slot Machine

A tiny slot machine made with plain HTML/CSS/JavaScript that pokes fun at AI token economies:

- You **spend tokens** to “run inference” (spin).
- You **win tokens** when the symbols align.
- It uses platform APIs: `localStorage`, `crypto.getRandomValues`, Web Audio, Vibration, Clipboard/Web Share, and a service worker (PWA) on `https://` or `localhost`.

## Run

Any static server works. Examples:

- VS Code Live Server
- `python -m http.server` (then open `http://localhost:8000/ai-slot-machine/`)

Open `ai-slot-machine/index.html` in your browser.


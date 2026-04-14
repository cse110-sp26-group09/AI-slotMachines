# Token Burn Slot Machine

A tiny vanilla web slot machine that makes fun of AI: you win tokens, spend tokens, and occasionally get rate-limited mid-spin.

## Run

- Quick: open `index.html` in a browser (Chrome/Edge/Firefox/Safari).
- Best (enables Share/Clipboard reliably): run a local server, then open `http://localhost:8000`:
  - Python: `python -m http.server 8000`
  - Node: `npx http-server -p 8000`
- Controls:
  - `Space`: spin
  - `A`: toggle auto-spin
  - `S`: open “spend tokens”

## Notes

- State persists via `localStorage`.
- Uses platform APIs: Web Audio, Speech Synthesis (optional), Vibration (optional), Web Share/Clipboard (optional).

# AI Token Slots

A tiny vanilla-web slot machine that makes fun of AI: you win tokens, spend tokens, and occasionally hallucinate.

## Run

Open `index.html` directly, or serve the folder:

```powershell
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Notes

- Tokens and settings persist via `localStorage`.
- Optional extras: haptics (`navigator.vibrate`), sounds (Web Audio), share/clipboard, and a basic PWA cache (service worker).


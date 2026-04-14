# Token Tumbler 9000

A tiny vanilla HTML/CSS/JS “slot machine” that makes fun of AI token economics.

## Run

Simplest: open `index.html` in your browser.

Best (for service worker / install prompt): serve locally:

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## Notes

- Balance is saved in `localStorage`.
- Uses platform APIs: `crypto.getRandomValues`, Web Audio, Vibration, Clipboard, Web Share, Service Worker, Wake Lock (when available).


# AI Token Slot Machine (Vanilla Web)

Open `ai-slot-machine/index.html` in a browser and press **Spin** (or hit `Space`).

If your browser blocks some features on `file://` (service worker, share sheet), run a tiny local server:

```bash
cd ai-slot-machine
python3 -m http.server 8000
```

Then open `http://localhost:8000/index.html`.

What it does
- Spend tokens to spin, win tokens on matches, and watch your “API bill” grow anyway.
- Temperature slider changes symbol distribution (more chaos at higher temperature).
- “Compliance tax” reduces payouts and adds fees, for realism.
- Uses platform APIs: `crypto.getRandomValues`, `localStorage`, Web Audio (optional), `navigator.vibrate` (optional), Share Sheet / Clipboard, and a Service Worker for offline.
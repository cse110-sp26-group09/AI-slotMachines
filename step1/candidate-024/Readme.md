## Token Fortune — AI Slot Machine (Vanilla Web)

A tiny slot machine app made with plain **HTML + CSS + JavaScript**.

- You **spend tokens** (bet + a satirical “prompt tax”) to spin
- You **win tokens** via the payout table
- If you go broke, you can **Raise Seed** (because of course you can)

### Run it

Because it uses a Service Worker for offline caching, run it from a local server (not `file://`):

```bash
python3 -m http.server 8000
```

Then open:

- `http://localhost:8000/`

### Controls

- Click **Spin** or press **Space**
- Adjust bet with the slider or **↑/↓**
- Toggle **Sound**, **Haptics**, and **Auto-spin**
- **Share** copies a braggy message to the clipboard (with a fallback prompt)

### Files

- `index.html` — UI
- `styles.css` — styling/animation
- `app.js` — game logic, localStorage, Web Audio, vibration
- `sw.js` + `manifest.webmanifest` — offline/PWA bits

## Token Fortune — AI Slot Machine (Vanilla Web)

A slot machine web app made with plain **HTML + CSS + JavaScript**.

- You **spend tokens** (bet + a satirical “prompt tax”) to spin
- You **win tokens** with big win animations, sound, and haptics
- You can **shop** to spend tokens on cosmetics and small upgrades

### Run it

Because it uses a Service Worker for offline caching, run it from a local server (not `file://`):

```bash
python3 -m http.server 8000
```

Then open:

- `http://localhost:8000/token-fortune/`

### Controls

- Click **Spin** or press **Space**
- Adjust bet with the slider, number input, quick chips, or **↑/↓**
- **Hold Spin** to auto‑spin while held
- Open **Settings** for sound/haptics/volume

### Files

- `token-fortune/index.html` — UI
- `token-fortune/styles.css` — theme + animation
- `token-fortune/app.js` — game logic, effects, localStorage, WebAudio, vibration
- `token-fortune/sw.js` + `token-fortune/manifest.webmanifest` — offline/PWA bits


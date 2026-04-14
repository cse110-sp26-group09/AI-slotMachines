## TokenGambit (Vanilla Web Slot Machine)

A tiny slot machine built with plain **HTML + CSS + JavaScript** that pokes fun at AI economics:
you **spend tokens**, **win tokens**, and occasionally get **rate-limited for emotional realism**.

### Run it

This is a static site. Any simple local server works.

```bash
python3 -m http.server 5173
```

Then open:

`http://localhost:5173/`

### Controls

- `Spin`: click or press `Space` / `Enter`
- `Auto-spin`: click or press `A`
- `Claim daily drip`: click or press `D`
- `Settings`: click or press `S`

### Tech used (platform APIs)

- `localStorage` for balance/stats/settings
- `crypto.getRandomValues()` for randomness
- Web Audio API (tiny beeps)
- `navigator.vibrate()` (optional haptics)
- Clipboard + Web Share (copy/share brags)
- Service worker for offline caching

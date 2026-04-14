<<<<<<< HEAD
- `Space`: Spin
- `M`: Max Spin
- `A`: Auto ×5

## Token Sink

There’s a small in-app store that lets you spend tokens on silly “upgrades” like a luck buff or a one-spin shield.
=======
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
>>>>>>> 15850032c97bdc0971805f62c0642c434c5aaefa

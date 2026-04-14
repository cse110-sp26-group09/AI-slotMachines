# TokenBurner 3000 (Vanilla AI Slot Machine)

A tiny, dependency-free slot machine app that makes fun of AI economics: you **spend tokens to spin**, **win tokens on matches**, and occasionally get punished for **hallucinations** and **rate limits**.

## Run it

Because Service Workers require `http://` (or `https://`), run with a local server:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/index.html`.

## Controls

- Click **Spin** or press `Space`
- Toggle auto-spin with **Auto** or press `A`
- Toggle sound with **Sound** or press `M`

## What it uses

- Vanilla `index.html`, `styles.css`, `app.js`
- Platform APIs: `localStorage`, Web Audio, Clipboard, Web Share, Vibration, Service Worker (`sw.js`)


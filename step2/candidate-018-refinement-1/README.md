# Token Slots: The AI Casino

Vanilla HTML/CSS/JS slot machine that makes fun of AI economics: you **spend tokens** to spin and (sometimes) **win tokens** back.

## Run

- Open `index.html` in a browser, or serve this folder with any static server.

## Features

- Token balance + betting (“prompt budget”) + stats saved via `localStorage`
- Reel animations (respects `prefers-reduced-motion`)
- Sound effects (Web Audio) with volume + spin ticks
- Optional haptics (Vibration API) + optional announcer (SpeechSynthesis)
- Token shop: spend tokens on “upgrades” (luck patch, outage insurance, turbo unlock)
- Big-win FX: banner + fireworks/confetti burst that scales with payout
- Share + copy buttons (Web Share / Clipboard APIs)
- Offline-friendly via `sw.js` + `manifest.webmanifest`

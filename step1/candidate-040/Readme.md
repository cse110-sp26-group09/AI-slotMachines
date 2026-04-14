## Token Temple (Vanilla AI Slot Machine)

A tiny, local-only slot machine web app that roasts AI economics: you **spend tokens** to “run inference” and sometimes **win tokens** back (or lose them to *Terms updates* and *Hallucination audits*).

### Run it

- Open `index.html` in a browser (Chrome/Edge recommended).
- Press `Space` or click **Spin**.

### Features

- Vanilla HTML/CSS/JS (no frameworks)
- Token balance persists via `localStorage`
- “Inference settings” that affect costs/odds (Model, Prompt length, Temperature)
- Optional platform APIs:
  - Web Audio (beeps/arpeggios)
  - Speech Synthesis (AI commentator)
  - Vibration (on supported devices)

### Reset

- Click **Factory Reset** to wipe the local save (`localStorage`).

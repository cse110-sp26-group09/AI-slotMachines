# AI Token Slots (vanilla)

Open `index.html` to play, or run a local server (recommended for the PWA/service worker):

```sh
python -m http.server 8000
```

Then visit `http://localhost:8000/`.

Gameplay:
- Each spin costs your bet in tokens.
- Two-of-a-kind pays `2×` bet.
- Three-of-a-kind pays the paytable multiplier.
- “Hallucination” adds an extra penalty (unless you buy Guardrails).


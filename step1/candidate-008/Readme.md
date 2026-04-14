LLM Slot Machine — Token Tyranny
================================

A tiny vanilla HTML/CSS/JS slot machine parody: you **spend tokens** to spin, and sometimes **win tokens** back.

Run it
------

- Open `index.html` in a browser (double-click it, or drag it into a tab).
- Optional: serve locally (recommended for Web Share / Clipboard reliability):
  - `python -m http.server` then open `http://localhost:8000`

How it works
------------

- Balance + stats are stored in `localStorage`.
- “Temperature” changes the symbol weight distribution (higher = more uniform/chaotic).
- The “Prompt” input is intentionally ignored for comedy.
- “Claim Daily Tokens” grants a once-per-day stipend (based on your local date).

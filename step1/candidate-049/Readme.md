<<<<<<< HEAD
Open `index.html` in a browser. 

- "Token per spin" slider
- payouts for each combination
- kind of funny (with payouts - scientifically questionable)
- "All payouts are multiple of your bet."
- v1.0 • spins: 3 • biggest: 80
=======
## LLM Casino: Token Burner 9000

A tiny vanilla web slot machine that makes fun of AI token economics: spend tokens to spin, win tokens to spin more.

### Run

Open `index.html` in a browser.

If your browser blocks some APIs (clipboard/audio) for `file://` pages, run a local server instead:

- `python3 -m http.server 8000`
- then visit `http://localhost:8000`

### Controls

- Click **Spin** or press `Space`
- Press `R` to **Request more tokens**
- Toggle **Auto-spin**, **Mute**, or **Announce wins**

### Files

- `index.html` — UI
- `styles.css` — styling/animation
- `app.js` — game logic + localStorage persistence + Web Audio / Speech APIs
>>>>>>> 15850032c97bdc0971805f62c0642c434c5aaefa

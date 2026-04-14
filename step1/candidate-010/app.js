/* global navigator, crypto */
(() => {
  const STORAGE_KEY = "ai_token_slot_v1";

  const els = {
    balance: document.querySelector("#balance"),
    bet: document.querySelector("#bet"),
    temp: document.querySelector("#temp"),
    tempLabel: document.querySelector("#tempLabel"),
    status: document.querySelector("#status"),
    machine: document.querySelector(".machine"),
    logList: document.querySelector("#logList"),
    spinBtn: document.querySelector("#spinBtn"),
    betDownBtn: document.querySelector("#betDownBtn"),
    betUpBtn: document.querySelector("#betUpBtn"),
    muteToggle: document.querySelector("#muteToggle"),
    fineTuneBtn: document.querySelector("#fineTuneBtn"),
    claimBtn: document.querySelector("#claimBtn"),
    shareBtn: document.querySelector("#shareBtn"),
    resetBtn: document.querySelector("#resetBtn"),
    reels: [0, 1, 2].map((i) => document.querySelector(`#reel${i}`)),
    syms: [0, 1, 2].map((i) => document.querySelector(`#sym${i}`)),
  };

  const BETS = [1, 5, 10, 25, 50];
  const DAILY_GRANT = 100;
  const FINE_TUNE_COST = 50;

  const SYMBOLS = [
    { s: "🪙", w: 7, name: "Token" },
    { s: "🤖", w: 6, name: "Agent" },
    { s: "🧠", w: 5, name: "Brain" },
    { s: "📈", w: 4, name: "Hype" },
    { s: "🧵", w: 4, name: "Context window" },
    { s: "🧪", w: 3, name: "Benchmark" },
    { s: "🧯", w: 3, name: "Fire drill" },
    { s: "🐛", w: 3, name: "Bug" },
    { s: "🔒", w: 2, name: "Safety" },
    { s: "📉", w: 2, name: "Rate limit" },
  ];

  let state = {
    balance: 200,
    betIndex: 2,
    temperature: 0.7,
    mute: false,
    isSpinning: false,
    lastGrantDay: null, // YYYY-MM-DD
    lastResult: null, // { reels: [..], delta: number, message: string }
  };

  // ---- Platform helpers ----
  function todayKey() {
    const d = new Date();
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function randU32() {
    const c = globalThis.crypto;
    if (c?.getRandomValues) {
      const buf = new Uint32Array(1);
      c.getRandomValues(buf);
      return buf[0];
    }
    // Fallback (older environments).
    return Math.floor(Math.random() * 2 ** 32);
  }

  function randFloat() {
    // Uniform [0,1)
    return randU32() / 2 ** 32;
  }

  function safeVibrate(pattern) {
    if (typeof navigator === "undefined") return;
    if (typeof navigator.vibrate !== "function") return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore.
    }
  }

  // Web Audio: tiny synth, no external assets.
  const audio = (() => {
    let ctx = null;
    let enabled = true;

    function ensure() {
      if (!enabled) return null;
      if (ctx) return ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      return ctx;
    }

    function blip({ freq = 440, dur = 0.07, type = "sine", gain = 0.05 } = {}) {
      const c = ensure();
      if (!c) return;
      const t0 = c.currentTime;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    function chordWin() {
      blip({ freq: 523.25, dur: 0.12, type: "triangle", gain: 0.06 });
      setTimeout(() => blip({ freq: 659.25, dur: 0.12, type: "triangle", gain: 0.05 }), 40);
      setTimeout(() => blip({ freq: 783.99, dur: 0.14, type: "triangle", gain: 0.045 }), 90);
    }

    function thudLose() {
      blip({ freq: 140, dur: 0.10, type: "sawtooth", gain: 0.06 });
      setTimeout(() => blip({ freq: 92, dur: 0.12, type: "square", gain: 0.04 }), 60);
    }

    function setEnabled(on) {
      enabled = on;
      if (!enabled && ctx) {
        try {
          ctx.close();
        } catch {
          // Ignore.
        }
        ctx = null;
      }
    }

    return { blip, chordWin, thudLose, setEnabled };
  })();

  // ---- Persistence ----
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      state = {
        ...state,
        ...parsed,
        balance: Number.isFinite(parsed.balance) ? parsed.balance : state.balance,
        betIndex: Number.isFinite(parsed.betIndex) ? parsed.betIndex : state.betIndex,
        temperature: Number.isFinite(parsed.temperature) ? parsed.temperature : state.temperature,
        mute: Boolean(parsed.mute),
      };
      state.betIndex = clamp(state.betIndex, 0, BETS.length - 1);
      state.temperature = clamp(state.temperature, 0, 2);
      if (typeof state.lastGrantDay !== "string") state.lastGrantDay = null;
    } catch {
      // Ignore.
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore.
    }
  }

  // ---- UI ----
  function setStatus(msg) {
    els.status.textContent = msg;
  }

  function addLog(html) {
    const li = document.createElement("li");
    li.innerHTML = html;
    els.logList.prepend(li);
    while (els.logList.children.length > 30) els.logList.lastElementChild?.remove();
  }

  function render() {
    els.balance.textContent = String(state.balance);
    els.bet.textContent = String(BETS[state.betIndex]);
    els.temp.value = String(state.temperature);
    els.tempLabel.textContent = state.temperature.toFixed(2);
    els.muteToggle.checked = state.mute;
    els.spinBtn.disabled = state.isSpinning || state.balance < BETS[state.betIndex];
    els.fineTuneBtn.disabled = state.isSpinning || state.balance < FINE_TUNE_COST;

    const canClaim = state.lastGrantDay !== todayKey();
    els.claimBtn.disabled = state.isSpinning || !canClaim;
    els.claimBtn.textContent = canClaim
      ? `Claim daily grant (+${DAILY_GRANT} 🪙)`
      : "Daily grant claimed (come back tomorrow)";
  }

  function setMachineMood(mood /* "win" | "lose" | null */) {
    els.machine.classList.remove("is-win", "is-lose");
    if (mood === "win") els.machine.classList.add("is-win");
    if (mood === "lose") els.machine.classList.add("is-lose");
  }

  function pickSymbol() {
    // “Model temperature” joke: higher temp flattens distribution.
    const t = clamp(state.temperature, 0, 2);
    const flatten = 1 + t * 1.3; // 1..3.6
    const weights = SYMBOLS.map((x) => Math.pow(x.w, 1 / flatten));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = randFloat() * total;
    for (let i = 0; i < SYMBOLS.length; i++) {
      r -= weights[i];
      if (r <= 0) return SYMBOLS[i].s;
    }
    return SYMBOLS[SYMBOLS.length - 1].s;
  }

  function briefSymbolName(sym) {
    return SYMBOLS.find((x) => x.s === sym)?.name ?? "Mystery";
  }

  function evaluate(reels, bet) {
    const [a, b, c] = reels;
    const counts = new Map();
    for (const s of reels) counts.set(s, (counts.get(s) ?? 0) + 1);
    const isThree = counts.size === 1;
    const isTwo = counts.size === 2;

    if (isThree) {
      const sym = a;
      const mult =
        sym === "🪙" ? 50 : sym === "🤖" ? 30 : sym === "🐛" ? 25 : sym === "🔒" ? 22 : 20;
      const payout = bet * mult;
      return {
        delta: payout,
        mood: "win",
        message: `Triple ${briefSymbolName(sym)}. Model confidently pays out.`,
      };
    }

    if (isTwo) {
      const pair = [...counts.entries()].find(([, n]) => n === 2)?.[0] ?? a;
      const payout = bet * 3;
      return {
        delta: payout,
        mood: "win",
        message: `Two ${briefSymbolName(pair)}. Partial credit accepted.`,
      };
    }

    // No match: add a couple “AI economy” jokes.
    if (reels.includes("🐛")) {
      const refund = bet;
      return {
        delta: refund,
        mood: "win",
        message: "Bug bounty! Your bet is refunded. Please don’t disclose the exploit.",
      };
    }

    if (reels.includes("📉")) {
      const penalty = -bet; // extra loss on top of the bet already spent
      return {
        delta: penalty,
        mood: "lose",
        message: "Rate limited. You pay the Hallucination Tax (again).",
      };
    }

    return {
      delta: 0,
      mood: "lose",
      message: "No match. The model asks you to try prompting differently.",
    };
  }

  function animateMachine(kind) {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) return;

    const keyframes =
      kind === "win"
        ? [
            { transform: "translateY(0)" },
            { transform: "translateY(-2px)" },
            { transform: "translateY(0)" },
          ]
        : [
            { transform: "translateX(0)" },
            { transform: "translateX(-6px)" },
            { transform: "translateX(5px)" },
            { transform: "translateX(-3px)" },
            { transform: "translateX(0)" },
          ];

    els.machine.animate(keyframes, { duration: kind === "win" ? 240 : 260, easing: "ease-out" });
  }

  function pulseSpinButton() {
    els.spinBtn.classList.remove("spinPulse");
    // Force reflow so animation restarts.
    // eslint-disable-next-line no-unused-expressions
    els.spinBtn.offsetWidth;
    els.spinBtn.classList.add("spinPulse");
  }

  function formatResultLine(reels) {
    return reels.join(" ");
  }

  async function spin() {
    if (state.isSpinning) return;
    const bet = BETS[state.betIndex];
    if (state.balance < bet) {
      setStatus("Out of tokens. Consider “claim daily grant” or “fine‑tune” (just kidding).");
      audio.thudLose();
      safeVibrate([30, 40, 30]);
      return;
    }

    state.isSpinning = true;
    setMachineMood(null);
    setStatus("Spinning… generating value from vibes.");
    pulseSpinButton();
    audio.blip({ freq: 420, dur: 0.06, type: "sine", gain: 0.04 });

    // Spend bet up front.
    state.balance = Math.max(0, state.balance - bet);
    render();
    save();

    const stops = [800, 1050, 1320];

    const spinOne = (i) =>
      new Promise((resolve) => {
        const reelEl = els.reels[i];
        const symEl = els.syms[i];
        reelEl.classList.add("is-spinning");
        let last = symEl.textContent;
        const interval = setInterval(() => {
          last = pickSymbol();
          symEl.textContent = last;
        }, 55);

        setTimeout(() => {
          clearInterval(interval);
          reelEl.classList.remove("is-spinning");
          resolve(last);
        }, stops[i]);
      });

    const reels = await Promise.all([0, 1, 2].map((i) => spinOne(i)));

    const outcome = evaluate(reels, bet);

    // Apply additional delta from outcome.
    if (outcome.delta < 0) {
      state.balance = Math.max(0, state.balance + outcome.delta);
    } else {
      state.balance += outcome.delta;
    }

    state.lastResult = { reels, delta: outcome.delta, message: outcome.message };
    setMachineMood(outcome.mood);
    animateMachine(outcome.mood);

    if (outcome.mood === "win") {
      audio.chordWin();
      safeVibrate([20, 30, 50]);
    } else {
      audio.thudLose();
      safeVibrate(25);
    }

    const deltaText = outcome.delta === 0 ? "±0" : outcome.delta > 0 ? `+${outcome.delta}` : `${outcome.delta}`;
    addLog(
      `<b>${formatResultLine(reels)}</b> — <b>${deltaText} 🪙</b>. ${escapeHtml(outcome.message)}`
    );

    setStatus(`${formatResultLine(reels)} · ${outcome.message} (${deltaText} 🪙)`);

    state.isSpinning = false;
    render();
    save();
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function adjustBet(dir) {
    if (state.isSpinning) return;
    state.betIndex = clamp(state.betIndex + dir, 0, BETS.length - 1);
    setStatus(`Bet set to ${BETS[state.betIndex]} 🪙. (Budget: vibes.)`);
    audio.blip({ freq: dir > 0 ? 520 : 360, dur: 0.05, type: "triangle", gain: 0.035 });
    render();
    save();
  }

  function fineTune() {
    if (state.isSpinning) return;
    if (state.balance < FINE_TUNE_COST) return;
    state.balance -= FINE_TUNE_COST;
    const improvements = [
      "0.7% less wrong",
      "2% more confident",
      "now with 13% fewer vibes",
      "still hallucinating, but politely",
      "benchmark-optimized (real-world not included)",
    ];
    const msg = `Fine‑tune complete. The model is ${improvements[Math.floor(randFloat() * improvements.length)]}.`;
    setStatus(msg);
    addLog(`<b>🧪 🧵 🔒</b> — <b>−${FINE_TUNE_COST} 🪙</b>. ${escapeHtml(msg)}`);
    audio.blip({ freq: 880, dur: 0.08, type: "sine", gain: 0.045 });
    safeVibrate(12);
    render();
    save();
  }

  function claimDaily() {
    if (state.isSpinning) return;
    const key = todayKey();
    if (state.lastGrantDay === key) return;
    state.lastGrantDay = key;
    state.balance += DAILY_GRANT;
    const msg = "Daily grant approved. Please accept the terms: we keep your soul and your gradients.";
    setStatus(msg);
    addLog(`<b>🤝 📈 🪙</b> — <b>+${DAILY_GRANT} 🪙</b>. ${escapeHtml(msg)}`);
    audio.chordWin();
    safeVibrate([10, 20, 10, 30]);
    render();
    save();
  }

  async function shareLast() {
    const r = state.lastResult;
    const text = r
      ? `AI Token Slot: ${r.reels.join(" ")} · ${r.message} (${r.delta >= 0 ? "+" : ""}${r.delta} 🪙)`
      : "AI Token Slot: I spun the reels and the model asked me to try again.";

    try {
      if (navigator.share) {
        await navigator.share({ title: "AI Token Slot", text });
        setStatus("Shared. Viral growth achieved. Ethics pending.");
        return;
      }
    } catch {
      // fall through to clipboard
    }

    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied to clipboard. Please paste responsibly.");
      audio.blip({ freq: 740, dur: 0.06, type: "triangle", gain: 0.04 });
      return;
    } catch {
      setStatus(text);
    }
  }

  function reset() {
    if (state.isSpinning) return;
    state = {
      balance: 200,
      betIndex: 2,
      temperature: 0.7,
      mute: state.mute,
      isSpinning: false,
      lastGrantDay: null,
      lastResult: null,
    };
    els.syms[0].textContent = "🤖";
    els.syms[1].textContent = "🪙";
    els.syms[2].textContent = "🧠";
    setMachineMood(null);
    setStatus("Reset complete. Fresh model. Same old hype.");
    els.logList.innerHTML = "";
    render();
    save();
  }

  function wire() {
    els.spinBtn.addEventListener("click", () => spin());
    els.betDownBtn.addEventListener("click", () => adjustBet(-1));
    els.betUpBtn.addEventListener("click", () => adjustBet(1));
    els.fineTuneBtn.addEventListener("click", () => fineTune());
    els.claimBtn.addEventListener("click", () => claimDaily());
    els.shareBtn.addEventListener("click", () => shareLast());
    els.resetBtn.addEventListener("click", () => reset());

    els.temp.addEventListener("input", () => {
      state.temperature = Number(els.temp.value);
      render();
      save();
    });

    els.muteToggle.addEventListener("change", () => {
      state.mute = Boolean(els.muteToggle.checked);
      audio.setEnabled(!state.mute);
      setStatus(state.mute ? "Muted. Silence is safer than speech." : "Sound on. Let the vibes compile.");
      render();
      save();
    });

    document.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        spin();
      } else if (e.key === "ArrowUp") {
        adjustBet(+1);
      } else if (e.key === "ArrowDown") {
        adjustBet(-1);
      } else if (e.key === "Enter") {
        spin();
      }
    });
  }

  function init() {
    load();
    audio.setEnabled(!state.mute);
    render();
    wire();
    setStatus("Ready. Spin to convert electricity into tokens.");
    addLog("<b>📜</b> — Booted. No user data collected (this message is a lie).");
  }

  init();
})();

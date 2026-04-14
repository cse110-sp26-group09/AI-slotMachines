(() => {
  "use strict";

  const STORAGE_KEY = "ai_slotmachine_v1";

  const START_TOKENS = 100;
  const SPIN_COST = 5;
  const DAILY_CLAIM = 25;

  const symbols = [
    { emoji: "🪙", name: "Token", weight: 10 },
    { emoji: "🧠", name: "Brain", weight: 12 },
    { emoji: "🤖", name: "Bot", weight: 15 },
    { emoji: "💾", name: "Dataset", weight: 16 },
    { emoji: "🔥", name: "Hype", weight: 18 },
    { emoji: "🧾", name: "Invoice", weight: 20 },
    { emoji: "🕳️", name: "GPU Void", weight: 9 },
  ];

  const triplePayout = new Map([
    ["🪙", 250],
    ["🧠", 120],
    ["🤖", 80],
    ["💾", 60],
    ["🔥", 40],
    ["🧾", -80],
    ["🕳️", -150],
  ]);

  const doublePayout = new Map([
    ["🪙", 15],
    ["🧠", 10],
    ["🤖", 8],
    ["💾", 6],
    ["🔥", 5],
    ["🧾", -10],
    ["🕳️", -20],
  ]);

  const ui = {
    tokenCount: byId("tokenCount"),
    spinBtn: byId("spinBtn"),
    spinCostText: byId("spinCostText"),
    dailyBtn: byId("dailyBtn"),
    shareBtn: byId("shareBtn"),
    resetBtn: byId("resetBtn"),
    readout: byId("readout"),
    headline: byId("headline"),
    detail: byId("detail"),
    reels: [byId("reel0"), byId("reel1"), byId("reel2")],
    symbols: [byId("sym0"), byId("sym1"), byId("sym2")],
    statSpins: byId("statSpins"),
    statWins: byId("statWins"),
    statLosses: byId("statLosses"),
    statNet: byId("statNet"),
    statBig: byId("statBig"),
  };

  /** @type {{tokens:number, stats:{spins:number,wins:number,losses:number,net:number,biggestWin:number}, lastDailyClaimYMD:string|null, lastResult:{combo:string, delta:number, ts:number}|null}} */
  let state = loadState();
  let spinning = false;

  ui.spinCostText.textContent = `(-${SPIN_COST})`;

  ui.spinBtn.addEventListener("click", () => spinOnce());
  ui.dailyBtn.addEventListener("click", () => claimDaily());
  ui.shareBtn.addEventListener("click", () => copyBrag());
  ui.resetBtn.addEventListener("click", () => resetSave());

  // Space/Enter triggers the focused button by default, but this keeps it snappy.
  document.addEventListener("keydown", (event) => {
    if (event.key !== " " || spinning) return;
    if (document.activeElement && document.activeElement.tagName === "BUTTON") return;
    event.preventDefault();
    spinOnce();
  });

  renderAll();

  function byId(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element: #${id}`);
    return el;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshState();
      const parsed = JSON.parse(raw);
      return sanitizeState(parsed);
    } catch {
      return freshState();
    }
  }

  function freshState() {
    return {
      tokens: START_TOKENS,
      stats: { spins: 0, wins: 0, losses: 0, net: 0, biggestWin: 0 },
      lastDailyClaimYMD: null,
      lastResult: null,
    };
  }

  function sanitizeState(maybe) {
    const safe = freshState();
    if (!maybe || typeof maybe !== "object") return safe;
    if (Number.isFinite(maybe.tokens)) safe.tokens = clampInt(maybe.tokens, 0, 1_000_000);

    const st = maybe.stats;
    if (st && typeof st === "object") {
      if (Number.isFinite(st.spins)) safe.stats.spins = clampInt(st.spins, 0, 50_000_000);
      if (Number.isFinite(st.wins)) safe.stats.wins = clampInt(st.wins, 0, 50_000_000);
      if (Number.isFinite(st.losses)) safe.stats.losses = clampInt(st.losses, 0, 50_000_000);
      if (Number.isFinite(st.net)) safe.stats.net = clampInt(st.net, -1_000_000_000, 1_000_000_000);
      if (Number.isFinite(st.biggestWin))
        safe.stats.biggestWin = clampInt(st.biggestWin, 0, 1_000_000_000);
    }

    if (typeof maybe.lastDailyClaimYMD === "string") safe.lastDailyClaimYMD = maybe.lastDailyClaimYMD;
    if (maybe.lastResult && typeof maybe.lastResult === "object") {
      const { combo, delta, ts } = maybe.lastResult;
      if (typeof combo === "string" && Number.isFinite(delta) && Number.isFinite(ts)) {
        safe.lastResult = {
          combo: combo.slice(0, 20),
          delta: clampInt(delta, -1_000_000, 1_000_000),
          ts: clampInt(ts, 0, 9_999_999_999_999),
        };
      }
    }
    return safe;
  }

  function clampInt(value, min, max) {
    const n = Math.trunc(value);
    return Math.min(max, Math.max(min, n));
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function renderAll() {
    ui.tokenCount.textContent = String(state.tokens);
    ui.statSpins.textContent = String(state.stats.spins);
    ui.statWins.textContent = String(state.stats.wins);
    ui.statLosses.textContent = String(state.stats.losses);
    ui.statNet.textContent = String(state.stats.net);
    ui.statBig.textContent = String(state.stats.biggestWin);

    ui.spinBtn.disabled = spinning || state.tokens < SPIN_COST;
    const claimed = alreadyClaimedToday();
    ui.dailyBtn.disabled = spinning || claimed;
    ui.dailyBtn.textContent = claimed ? "Daily claimed" : "Claim daily tokens";
    ui.shareBtn.disabled = !state.lastResult;

    if (state.tokens < SPIN_COST) {
      setReadoutMood("bad");
      setReadout(
        "Out of tokens.",
        "Try claiming daily tokens. Or rename your failure as a ‘research preview’."
      );
    }
  }

  async function spinOnce() {
    if (spinning) return;
    if (state.tokens < SPIN_COST) {
      renderAll();
      return;
    }

    spinning = true;
    state.tokens -= SPIN_COST;
    state.stats.net -= SPIN_COST;
    state.stats.spins += 1;

    const finalCombo = [pickWeighted(), pickWeighted(), pickWeighted()];

    setReadoutMood("neutral");
    setReadout("Spinning…", pickSpinOneLiner());
    renderAll();

    const preferReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (preferReducedMotion) {
      setCombo(finalCombo);
      finishSpin(finalCombo);
      return;
    }

    playTick();
    for (const reel of ui.reels) reel.classList.add("is-spinning");

    const stopPromises = finalCombo.map((finalSym, idx) =>
      animateReel(idx, finalSym, 650 + idx * 250)
    );
    await Promise.all(stopPromises);

    for (const reel of ui.reels) reel.classList.remove("is-spinning");
    finishSpin(finalCombo);
  }

  function setCombo(combo) {
    for (let i = 0; i < ui.symbols.length; i++) ui.symbols[i].textContent = combo[i];
  }

  function animateReel(index, finalSymbol, durationMs) {
    return new Promise((resolve) => {
      const el = ui.symbols[index];
      const start = performance.now();
      let lastSwap = 0;
      const intervalMs = 55;

      function frame(now) {
        if (now - lastSwap >= intervalMs) {
          lastSwap = now;
          el.textContent = pickUniform();
        }
        if (now - start >= durationMs) {
          el.textContent = finalSymbol;
          resolve();
          return;
        }
        requestAnimationFrame(frame);
      }

      requestAnimationFrame(frame);
    });
  }

  function finishSpin(combo) {
    const { delta, headline, detail } = scoreCombo(combo);
    state.tokens = clampInt(state.tokens + delta, 0, 1_000_000);
    state.stats.net = clampInt(state.stats.net + delta, -1_000_000_000, 1_000_000_000);

    if (delta > 0) {
      setReadoutMood("good");
      state.stats.wins += 1;
      state.stats.biggestWin = Math.max(state.stats.biggestWin, delta);
      playWin();
      vibrate([30, 20, 30]);
    } else if (delta < 0) {
      setReadoutMood("bad");
      state.stats.losses += 1;
      playLose();
      vibrate([80]);
    } else {
      setReadoutMood("neutral");
      playThud();
      vibrate([20]);
    }

    state.lastResult = { combo: combo.join(""), delta, ts: Date.now() };
    saveState();

    setReadout(headline, detail);
    spinning = false;
    renderAll();
  }

  function scoreCombo(combo) {
    const a = combo[0];
    const b = combo[1];
    const c = combo[2];

    if (a === b && b === c) {
      const base = triplePayout.get(a) ?? 0;
      return {
        delta: base,
        headline: base >= 0 ? `Triple hit: ${a}${b}${c}` : `Triple bill: ${a}${b}${c}`,
        detail: payoutLine(base),
      };
    }

    // two-of-a-kind
    const counts = new Map();
    for (const sym of combo) counts.set(sym, (counts.get(sym) ?? 0) + 1);
    let pairSym = null;
    for (const [sym, n] of counts.entries()) {
      if (n === 2) pairSym = sym;
    }
    if (pairSym) {
      const base = doublePayout.get(pairSym) ?? 0;
      const spicy = spiceForPair(pairSym, base);
      return {
        delta: base,
        headline: spicy.headline,
        detail: spicy.detail,
      };
    }

    // no match
    const oneLiner = pickNoWinOneLiner();
    return {
      delta: 0,
      headline: "Model says: ‘It depends.’",
      detail: oneLiner,
    };
  }

  function payoutLine(delta) {
    if (delta > 0) return `You win +${delta} tokens. (The GPU approves.)`;
    if (delta < 0) return `You lose ${delta} tokens. (Finance calls this “usage-based delight”.)`;
    return "No payout.";
  }

  function spiceForPair(sym, base) {
    if (sym === "🧾") {
      return {
        headline: "Partial invoice detected.",
        detail: `Two invoices: ${base} tokens. Your model is ‘cost-aware’.`,
      };
    }
    if (sym === "🕳️") {
      return {
        headline: "Two GPUs entered. No GPUs returned.",
        detail: `GPU void tax: ${base} tokens. At least it was fast.`,
      };
    }
    if (sym === "🪙") {
      return {
        headline: "Token drip.",
        detail: `Two tokens: +${base}. Please don’t spend it all on system prompts.`,
      };
    }
    return {
      headline: "Nice! Two-of-a-kind.",
      detail: `${sym}${sym} pays +${base} tokens. Not AGI, but it ships.`,
    };
  }

  function pickSpinOneLiner() {
    return pick([
      "Sampling temperature=1.0. Blame the seed.",
      "Rerolling until the demo looks good.",
      "Compiling vibes…",
      "Crunching tokens into smaller tokens.",
      "Calculating ‘alignment’ surcharge…",
    ]);
  }

  function pickNoWinOneLiner() {
    return pick([
      "No match. The model recommends: “try again with more context.”",
      "Nothing. The output is ‘non-deterministic’.",
      "No payout. Please file a bug report to yourself.",
      "Zero tokens. Add a better system prompt next time.",
      "No match. Consider upgrading to SlotGPT Pro Max.",
    ]);
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function pickUniform() {
    const idx = Math.floor(Math.random() * symbols.length);
    return symbols[idx].emoji;
  }

  function pickWeighted() {
    const total = symbols.reduce((sum, s) => sum + s.weight, 0);
    let r = Math.random() * total;
    for (const s of symbols) {
      r -= s.weight;
      if (r <= 0) return s.emoji;
    }
    return symbols[symbols.length - 1].emoji;
  }

  function setReadout(headline, detail) {
    ui.headline.textContent = headline;
    ui.detail.textContent = detail;
  }

  function setReadoutMood(mood) {
    ui.readout.classList.remove("readout--good", "readout--bad");
    if (mood === "good") ui.readout.classList.add("readout--good");
    if (mood === "bad") ui.readout.classList.add("readout--bad");
  }

  function ymdLocal(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function alreadyClaimedToday() {
    return state.lastDailyClaimYMD === ymdLocal(new Date());
  }

  function claimDaily() {
    if (spinning) return;
    if (alreadyClaimedToday()) {
      setReadoutMood("neutral");
      setReadout("Daily already claimed.", "Come back tomorrow for more ethically sourced tokens.");
      renderAll();
      return;
    }

    state.lastDailyClaimYMD = ymdLocal(new Date());
    state.tokens = clampInt(state.tokens + DAILY_CLAIM, 0, 1_000_000);
    state.stats.net = clampInt(state.stats.net + DAILY_CLAIM, -1_000_000_000, 1_000_000_000);
    saveState();

    playWin();
    setReadoutMood("good");
    setReadout("Daily tokens claimed.", `+${DAILY_CLAIM} tokens. A mysterious benefactor whispers: “ship it.”`);
    renderAll();
  }

  async function copyBrag() {
    if (!state.lastResult) return;
    const { combo, delta } = state.lastResult;
    const vibe = delta > 0 ? `+${delta}` : String(delta);
    const text = `I spun ${combo} and got ${vibe} tokens in the AI Token Slot Machine. The model is definitely “aligned”.`;

    try {
      await navigator.clipboard.writeText(text);
      setReadoutMood("good");
      setReadout("Copied.", "Paste it somewhere and let the market do the rest.");
    } catch {
      // Clipboard can fail outside secure contexts; fall back to prompt.
      window.prompt("Copy brag text:", text);
      setReadoutMood("neutral");
      setReadout("Copy manually.", "Clipboard API wasn’t available, so we did it the 2010 way.");
    }
  }

  function resetSave() {
    if (spinning) return;
    const ok = window.confirm("Reset tokens and stats? This cannot be un-spun.");
    if (!ok) return;
    localStorage.removeItem(STORAGE_KEY);
    state = freshState();
    saveState();
    setReadoutMood("neutral");
    setReadout("Reset complete.", "Fresh tokens, fresh mistakes.");
    renderAll();
  }

  function vibrate(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }

  // Minimal Web Audio bleeps (no external assets).
  let audioCtx = null;
  function ensureAudio() {
    if (audioCtx) return audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  }

  function beep({ type = "sine", freq = 440, durMs = 80, gain = 0.04 }) {
    const ctx = ensureAudio();
    if (!ctx) return;
    // Browsers may suspend until user gesture; calling on click is fine.
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;

    osc.connect(g);
    g.connect(ctx.destination);

    const t0 = ctx.currentTime;
    const t1 = t0 + durMs / 1000;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.start(t0);
    osc.stop(t1);
  }

  function playTick() {
    beep({ type: "square", freq: 520, durMs: 70, gain: 0.02 });
  }
  function playWin() {
    beep({ type: "triangle", freq: 784, durMs: 90, gain: 0.04 });
    setTimeout(() => beep({ type: "triangle", freq: 988, durMs: 110, gain: 0.04 }), 70);
  }
  function playLose() {
    beep({ type: "sawtooth", freq: 220, durMs: 130, gain: 0.04 });
  }
  function playThud() {
    beep({ type: "sine", freq: 150, durMs: 70, gain: 0.03 });
  }
})();

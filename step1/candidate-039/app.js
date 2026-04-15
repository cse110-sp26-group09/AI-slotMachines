(() => {
  "use strict";

  const STORAGE_KEY = "tokenGacha3000:v1";

  const COST_PER_SPIN = 5;
  const START_TOKENS = 60;
  const SELL_DATA_COOLDOWN_MS = 60_000; // once per minute
  const SELL_DATA_REWARD = 20;

  const SYMBOLS = [
    { glyph: "🤖", name: "Bot", weight: 10 },
    { glyph: "🧠", name: "Brain", weight: 9 },
    { glyph: "💾", name: "Dataset", weight: 9 },
    { glyph: "🪙", name: "Token", weight: 8 },
    { glyph: "🔥", name: "Hype", weight: 7 },
    { glyph: "🧪", name: "Eval", weight: 7 },
    { glyph: "📉", name: "Bench dip", weight: 6 },
    { glyph: "📈", name: "Bench pump", weight: 6 },
    { glyph: "🧻", name: "Paper", weight: 5 },
    { glyph: "🫠", name: "Hallucination", weight: 4 },
    { glyph: "🧨", name: "Prod incident", weight: 3 },
  ];

  const els = {
    tokens: document.getElementById("tokens"),
    cost: document.getElementById("cost"),
    reels: [document.getElementById("r0"), document.getElementById("r1"), document.getElementById("r2")],
    spin: document.getElementById("spin"),
    autospin: document.getElementById("autospin"),
    sellData: document.getElementById("sellData"),
    reset: document.getElementById("reset"),
    message: document.getElementById("message"),
    spins: document.getElementById("spins"),
    bigWin: document.getElementById("bigWin"),
    net: document.getElementById("net"),
    log: document.getElementById("log"),
    copy: document.getElementById("copy"),
  };

  const state = loadState();

  let autoSpinTimer = null;
  let lastSpinResult = { symbols: ["?", "?", "?"], delta: 0, payout: 0, cost: 0 };

  els.cost.textContent = String(COST_PER_SPIN);

  seedReels();
  renderAll();
  setMessage("Welcome to TokenGacha 3000. Please keep your hands inside the hype cycle.", "neutral");

  els.spin.addEventListener("click", () => spinOnce());
  els.autospin.addEventListener("click", () => toggleAutospin());
  els.sellData.addEventListener("click", () => sellData());
  els.reset.addEventListener("click", () => hardReset());
  els.copy.addEventListener("click", () => copyLastResult());

  document.addEventListener("keydown", (ev) => {
    if (ev.code === "Space") {
      ev.preventDefault();
      spinOnce();
    }
    if (ev.key === "a" || ev.key === "A") toggleAutospin();
  });

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshState();
      const parsed = JSON.parse(raw);
      const safe = {
        tokens: clampInt(parsed.tokens, 0, 1_000_000, START_TOKENS),
        spins: clampInt(parsed.spins, 0, 1_000_000, 0),
        biggestWin: clampInt(parsed.biggestWin, 0, 1_000_000, 0),
        net: clampInt(parsed.net, -1_000_000, 1_000_000, 0),
        lastSellAt: clampInt(parsed.lastSellAt, 0, Number.MAX_SAFE_INTEGER, 0),
        log: Array.isArray(parsed.log) ? parsed.log.slice(0, 30) : [],
      };
      return safe;
    } catch {
      return freshState();
    }
  }

  function freshState() {
    return { tokens: START_TOKENS, spins: 0, biggestWin: 0, net: 0, lastSellAt: 0, log: [] };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function renderAll() {
    els.tokens.textContent = String(state.tokens);
    els.spins.textContent = String(state.spins);
    els.bigWin.textContent = String(state.biggestWin);
    els.net.textContent = formatSigned(state.net);
    els.log.innerHTML = "";
    for (const item of state.log) {
      const li = document.createElement("li");
      li.textContent = item;
      els.log.appendChild(li);
    }
    els.spin.disabled = state.tokens < COST_PER_SPIN;
  }

  function setMessage(text, kind) {
    els.message.textContent = text;
    els.message.classList.remove("is-win", "is-loss");
    if (kind === "win") els.message.classList.add("is-win");
    if (kind === "loss") els.message.classList.add("is-loss");
  }

  function pushLog(line) {
    const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    state.log.unshift(`[${stamp}] ${line}`);
    state.log = state.log.slice(0, 18);
  }

  async function spinOnce() {
    if (state.tokens < COST_PER_SPIN) {
      setMessage("Out of tokens. Try selling your data. (We call it “training.”)", "loss");
      beep("sad");
      return;
    }

    const result = await animateSpin();
    const outcome = score(result);

    state.tokens -= COST_PER_SPIN;
    state.tokens += outcome.payout;
    state.spins += 1;
    state.net += outcome.payout - COST_PER_SPIN;
    state.biggestWin = Math.max(state.biggestWin, outcome.payout);

    lastSpinResult = {
      symbols: result,
      delta: outcome.payout - COST_PER_SPIN,
      payout: outcome.payout,
      cost: COST_PER_SPIN,
    };

    const text = outcome.message;
    setMessage(text, outcome.payout > 0 ? "win" : "loss");
    pushLog(formatLogLine(result, outcome.payout, COST_PER_SPIN, outcome.message));
    saveState();
    renderAll();

    if (navigator.vibrate) navigator.vibrate(outcome.payout > 0 ? [20, 25, 35] : 40);
    beep(outcome.payout > 0 ? "win" : "loss");
  }

  function toggleAutospin() {
    const isOn = autoSpinTimer != null;
    if (isOn) {
      clearInterval(autoSpinTimer);
      autoSpinTimer = null;
      els.autospin.setAttribute("aria-pressed", "false");
      els.autospin.textContent = "Auto-spin: Off";
      setMessage("Auto-spin disabled. Humans regain control (temporarily).", "neutral");
      return;
    }

    autoSpinTimer = setInterval(() => {
      if (document.hidden) return; // don't burn tokens in background
      spinOnce();
    }, 1100);
    els.autospin.setAttribute("aria-pressed", "true");
    els.autospin.textContent = "Auto-spin: On";
    setMessage("Auto-spin enabled. Congrats, you invented an agent loop.", "neutral");
  }

  function sellData() {
    const now = Date.now();
    const remaining = Math.max(0, state.lastSellAt + SELL_DATA_COOLDOWN_MS - now);
    if (remaining > 0) {
      const secs = Math.ceil(remaining / 1000);
      setMessage(`Regulators say “slow down.” Try again in ${secs}s.`, "loss");
      beep("tick");
      return;
    }

    state.lastSellAt = now;
    state.tokens += SELL_DATA_REWARD;
    state.net += SELL_DATA_REWARD;
    pushLog(`Sold “anonymized” data: +${SELL_DATA_REWARD} tokens. Consent not found.`);
    saveState();
    renderAll();
    setMessage(`You sold your data for +${SELL_DATA_REWARD} tokens. The model says: “Thanks, bestie.”`, "win");
    beep("win");
  }

  function hardReset() {
    if (autoSpinTimer) toggleAutospin();
    const ok = confirm("Reset tokens and telemetry? This cannot be un-hallucinated.");
    if (!ok) return;
    localStorage.removeItem(STORAGE_KEY);
    const fresh = freshState();
    Object.assign(state, fresh);
    lastSpinResult = { symbols: ["?", "?", "?"], delta: 0, payout: 0, cost: 0 };
    seedReels();
    renderAll();
    setMessage("Reset complete. You are now “baseline.”", "neutral");
    pushLog("Reset performed. New run started.");
    saveState();
    renderAll();
  }

  async function copyLastResult() {
    const { symbols, payout, cost, delta } = lastSpinResult;
    const text = `TokenGacha 3000: ${symbols.join(" ")} | payout=${payout} | cost=${cost} | delta=${formatSigned(delta)}`;
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copied to clipboard. Please deploy this to production without tests.", "neutral");
      beep("tick");
    } catch {
      setMessage("Clipboard blocked. Your browser is more aligned than this casino.", "loss");
      beep("sad");
    }
  }

  function score([a, b, c]) {
    const same3 = a === b && b === c;
    const same2 = a === b || b === c || a === c;

    const jackpot = (sym) => {
      switch (sym) {
        case "🫠":
          return { payout: 80, message: "Three hallucinations! The demo looks amazing. Investors throw tokens at you." };
        case "🤖":
          return { payout: 70, message: "Triple bot. You achieved model collapse. Tokens rain from the cloud." };
        case "💾":
          return { payout: 65, message: "Dataset trilogy. You found a secret CSV. Congrats: instant “breakthrough.”" };
        case "🧨":
          return { payout: 90, message: "Three prod incidents. Somehow, leadership calls this “learning.” Huge payout." };
        case "🪙":
          return { payout: 75, message: "Triple token token token. This is either destiny or a rounding error." };
        default:
          return { payout: 55, message: "Three of a kind! The model is… oddly coherent. Take your tokens." };
      }
    };

    // Special “emergent” combos
    if (a === "📈" && b === "📈" && c === "📉") {
      return { payout: 45, message: "Benchmark pump then dip. You optimized for the leaderboard, not reality. Nice." };
    }
    if (a === "🧻" && b === "🧻" && c === "🧠") {
      return { payout: 40, message: "Two papers and a brain. You published a “novel” method (it’s just dropout)." };
    }
    if (a === "🔥" && b === "🔥" && c === "🧨") {
      return { payout: 50, message: "Hype, hype, incident. The press release is scheduled for five minutes ago." };
    }

    if (same3) return jackpot(a);

    if (same2) {
      const twoPayout = 12;
      return { payout: twoPayout, message: `Pair detected. Weak signal, strong confidence: +${twoPayout} tokens.` };
    }

    const nearMiss = isNearMiss([a, b, c]);
    if (nearMiss) {
      return { payout: 0, message: "Near miss! Just add more GPUs and it will work next time. (It won’t.)" };
    }

    return { payout: 0, message: "No match. The model says: “I’m just a probabilistic parrot.” Pay up." };
  }

  function isNearMiss([a, b, c]) {
    // “Near miss” if you have the same symbol separated (a==c) or any two are rare.
    if (a === c) return true;
    const rarity = (sym) => {
      const w = SYMBOLS.find((s) => s.glyph === sym)?.weight ?? 10;
      return w <= 4;
    };
    return rarity(a) + rarity(b) + rarity(c) >= 2;
  }

  function weightedPick() {
    const total = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
    let r = Math.random() * total;
    for (const s of SYMBOLS) {
      r -= s.weight;
      if (r <= 0) return s.glyph;
    }
    return SYMBOLS[0].glyph;
  }

  function seedReels() {
    const seeded = [weightedPick(), weightedPick(), weightedPick()];
    for (let i = 0; i < 3; i++) els.reels[i].textContent = seeded[i];
    lastSpinResult = { symbols: seeded, delta: 0, payout: 0, cost: 0 };
  }

  async function animateSpin() {
    els.spin.disabled = true;
    const durations = [520, 740, 920];
    const results = ["?", "?", "?"];

    const tickEveryMs = 70;
    const timers = [];

    for (let i = 0; i < 3; i++) {
      els.reels[i].classList.add("spinning");
      timers[i] = window.setInterval(() => {
        els.reels[i].textContent = weightedPick();
      }, tickEveryMs);
    }

    for (let i = 0; i < 3; i++) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(durations[i]);
      window.clearInterval(timers[i]);
      results[i] = weightedPick();
      els.reels[i].textContent = results[i];
      els.reels[i].classList.remove("spinning");
      beep("tick", 0.02 + i * 0.01);
    }

    els.spin.disabled = state.tokens < COST_PER_SPIN;
    return results;
  }

  function formatLogLine(symbols, payout, cost, msg) {
    const delta = payout - cost;
    const head = `${symbols.join(" ")}  payout=${payout} cost=${cost} delta=${formatSigned(delta)}`;
    const tail = msg.length > 72 ? `${msg.slice(0, 72)}…` : msg;
    return `${head}  |  ${tail}`;
  }

  function formatSigned(n) {
    const s = n >= 0 ? `+${n}` : String(n);
    return s;
  }

  function clampInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(n)));
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function beep(kind, extraDelay = 0) {
    // Keep it lightweight; if AudioContext is blocked, silently skip.
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = beep._ctx || (beep._ctx = new Ctx());
      const now = ctx.currentTime + extraDelay;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const preset =
        kind === "win"
          ? { f0: 520, f1: 880, dur: 0.11, vol: 0.06 }
          : kind === "loss"
            ? { f0: 180, f1: 120, dur: 0.13, vol: 0.07 }
            : kind === "sad"
              ? { f0: 140, f1: 90, dur: 0.18, vol: 0.07 }
              : { f0: 340, f1: 340, dur: 0.05, vol: 0.035 };

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(preset.vol, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + preset.dur);

      osc.frequency.setValueAtTime(preset.f0, now);
      osc.frequency.exponentialRampToValueAtTime(preset.f1, now + preset.dur);
      osc.type = "triangle";

      osc.start(now);
      osc.stop(now + preset.dur + 0.02);
    } catch {
      // ignore
    }
  }
})();

/* TokenBurner 3000 — vanilla slot machine that mocks AI economics.
   No dependencies. Uses localStorage, Web Audio, Clipboard, Share, Service Worker, and Vibration (when available). */

const STORAGE_KEY = "tokenburner_v1";
const DAY_MS = 24 * 60 * 60 * 1000;

const SYMBOLS = [
  {
    id: "GPT5",
    name: "GPT-5",
    glyph: "🧠",
    weight: 2,
    tripleMult: 50,
    pairMult: 6,
    flavor: "Big brain. Big invoice.",
  },
  {
    id: "GPU",
    name: "GPU",
    glyph: "🖥️",
    weight: 5,
    tripleMult: 20,
    pairMult: 4,
    flavor: "Your fan curve is a cry for help.",
  },
  {
    id: "OPEN",
    name: "OPEN SOURCE",
    glyph: "🧩",
    weight: 7,
    tripleMult: 15,
    pairMult: 3,
    flavor: "Community-powered. Maintainer-burnout guaranteed.",
  },
  {
    id: "PROMPT",
    name: "PROMPT",
    glyph: "📝",
    weight: 9,
    tripleMult: 10,
    pairMult: 2,
    flavor: "Try adding 'please'.",
  },
  {
    id: "TOKENS",
    name: "TOKENS",
    glyph: "🪙",
    weight: 12,
    tripleMult: 8,
    pairMult: 1,
    flavor: "A unit of joy. Also, a unit of pain.",
  },
  {
    id: "PIVOT",
    name: "PIVOT",
    glyph: "🧭",
    weight: 6,
    tripleMult: 12,
    pairMult: 2,
    wild: true,
    flavor: "Wild card. Also: your product roadmap.",
  },
  {
    id: "VC",
    name: "VC $$$",
    glyph: "💸",
    weight: 2,
    tripleMult: 100,
    pairMult: 8,
    flavor: "Congrats. Now you owe quarterly growth.",
  },
  {
    id: "RATELIMIT",
    name: "RATE LIMIT",
    glyph: "⏳",
    weight: 4,
    tripleMult: 0,
    pairMult: 0,
    rateLimit: true,
    flavor: "429: Please try again after your optimism cools.",
  },
  {
    id: "HALLUCINATION",
    name: "HALLUCINATION",
    glyph: "🫠",
    weight: 3,
    tripleMult: 0,
    pairMult: 0,
    penalty: true,
    flavor: "Confidently wrong. Billed confidently.",
  },
];

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function fmt(n) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

function now() {
  return Date.now();
}

function weightedPick(items) {
  const total = items.reduce((sum, s) => sum + s.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function freshState() {
  return {
    tokens: 250,
    credits: 25,
    bet: 5,
    stats: {
      spins: 0,
      wins: 0,
      biggestWin: 0,
      net: 0,
      bankruptcies: 0,
      lastResult: "Booted. No tokens were harmed. Yet.",
    },
    vc: {
      lastGrantAt: 0,
      grantsTaken: 0,
    },
    settings: {
      sound: false,
      auto: false,
    },
  };
}

function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

const els = {
  tokensValue: $("tokensValue"),
  creditsValue: $("creditsValue"),
  betValue: $("betValue"),
  betInput: $("betInput"),
  spinBtn: $("spinBtn"),
  autoBtn: $("autoBtn"),
  muteBtn: $("muteBtn"),
  fundBtn: $("fundBtn"),
  resetBtn: $("resetBtn"),
  resultLine: $("resultLine"),
  payoutGrid: $("payoutGrid"),
  statsBox: $("statsBox"),
  logBox: $("logBox"),
  copyBtn: $("copyBtn"),
  shareBtn: $("shareBtn"),
  reels: [$("reel0"), $("reel1"), $("reel2")],
};

let state = loadState() ?? freshState();
let spinning = false;
let lastSpinAt = 0;
let audio = null;
let autoTimer = null;

function log(line) {
  const div = document.createElement("div");
  div.className = "logLine";
  const ts = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  div.textContent = `[${ts}] ${line}`;
  els.logBox.prepend(div);
  while (els.logBox.childNodes.length > 80) {
    els.logBox.removeChild(els.logBox.lastChild);
  }
}

function setResult(text) {
  els.resultLine.textContent = text;
  state.stats.lastResult = text;
  saveState(state);
}

function updateHud() {
  els.tokensValue.textContent = fmt(state.tokens);
  els.creditsValue.textContent = fmt(state.credits);
  els.betValue.textContent = fmt(state.bet);
  els.betInput.value = String(state.bet);

  els.autoBtn.setAttribute("aria-pressed", state.settings.auto ? "true" : "false");
  els.muteBtn.setAttribute("aria-pressed", state.settings.sound ? "true" : "false");

  const canSpin = state.tokens >= state.bet && state.credits >= 1 && state.bet > 0;
  els.spinBtn.disabled = spinning || !canSpin;
  els.autoBtn.disabled = spinning || !canSpin;
}

function renderStats() {
  const rows = [
    ["Spins", fmt(state.stats.spins)],
    ["Wins", fmt(state.stats.wins)],
    ["Biggest win", `${fmt(state.stats.biggestWin)} tokens`],
    ["Net tokens", `${fmt(state.stats.net >= 0 ? state.stats.net : -state.stats.net)} ${state.stats.net >= 0 ? "up" : "down"}`],
    ["Bankruptcies", fmt(state.stats.bankruptcies)],
  ];
  els.statsBox.innerHTML = "";
  for (const [k, v] of rows) {
    const row = document.createElement("div");
    row.className = "statRow";
    const key = document.createElement("div");
    key.className = "statKey";
    key.textContent = k;
    const val = document.createElement("div");
    val.className = "statVal";
    val.textContent = v;
    row.append(key, val);
    els.statsBox.append(row);
  }
}

function renderPayoutTable() {
  els.payoutGrid.innerHTML = "";
  const sorted = [...SYMBOLS].sort((a, b) => (b.tripleMult ?? 0) - (a.tripleMult ?? 0));
  for (const s of sorted) {
    const item = document.createElement("div");
    item.className = "payoutItem";

    const glyph = document.createElement("div");
    glyph.className = "payoutGlyph";
    glyph.textContent = s.glyph;

    const text = document.createElement("div");
    text.className = "payoutText";

    const name = document.createElement("div");
    name.className = "payoutName";
    name.textContent = s.name;

    const rule = document.createElement("div");
    rule.className = "payoutRule";
    if (s.penalty) rule.textContent = "Any: −(2×bet) tokens + shame";
    else if (s.rateLimit) rule.textContent = "Any: short cooldown (and no payout)";
    else if (s.wild) rule.textContent = `Wild. Triple: ${s.tripleMult}× bet`;
    else rule.textContent = `Triple: ${s.tripleMult}× bet • Pair: ${s.pairMult}× bet`;

    text.append(name, rule);
    item.append(glyph, text);
    els.payoutGrid.append(item);
  }
}

function setReel(el, symbol) {
  el.querySelector(".glyph").textContent = symbol.glyph;
  el.querySelector(".label").textContent = symbol.name;
  el.dataset.symbolId = symbol.id;
}

function enableReelSpinStyles(on) {
  for (const r of els.reels) r.classList.toggle("spinning", on);
}

function vibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

function initAudio() {
  if (audio) return audio;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audio = { ctx: new Ctx(), master: null };

  const master = audio.ctx.createGain();
  master.gain.value = 0.12;
  master.connect(audio.ctx.destination);
  audio.master = master;
  return audio;
}

function beep({ freq = 440, durMs = 60, type = "sine", gain = 0.6 } = {}) {
  if (!state.settings.sound) return;
  const a = initAudio();
  if (!a) return;
  const { ctx, master } = a;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = 0.0001;
  osc.connect(g);
  g.connect(master);

  const t0 = ctx.currentTime;
  const t1 = t0 + durMs / 1000;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(clamp(gain, 0.05, 1), t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t1);

  osc.start(t0);
  osc.stop(t1 + 0.02);
}

function chordWin() {
  beep({ freq: 523.25, durMs: 90, type: "triangle", gain: 0.75 });
  setTimeout(() => beep({ freq: 659.25, durMs: 110, type: "triangle", gain: 0.75 }), 85);
  setTimeout(() => beep({ freq: 783.99, durMs: 140, type: "triangle", gain: 0.75 }), 170);
}

function noiseBzzt() {
  beep({ freq: 160, durMs: 80, type: "sawtooth", gain: 0.5 });
  setTimeout(() => beep({ freq: 120, durMs: 120, type: "sawtooth", gain: 0.45 }), 60);
}

function classify(symbols) {
  const ids = symbols.map((s) => s.id);
  const hasHallucination = ids.includes("HALLUCINATION");
  const hasRateLimit = ids.includes("RATELIMIT");

  const wildCount = symbols.filter((s) => s.wild).length;
  const nonWild = symbols.filter((s) => !s.wild);
  const nonWildIds = nonWild.map((s) => s.id);

  const counts = new Map();
  for (const id of nonWildIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = entries[0] ?? [null, 0];
  const topId = top[0];
  const topCount = top[1];

  const effectiveCount = topCount + wildCount;
  const matchedSymbol = topId ? SYMBOLS.find((s) => s.id === topId) : null;

  return {
    ids,
    hasHallucination,
    hasRateLimit,
    wildCount,
    topId,
    topCount,
    effectiveCount,
    matchedSymbol,
  };
}

function computePayout({ bet, symbols }) {
  const c = classify(symbols);
  if (c.hasHallucination) {
    return {
      type: "penalty",
      tokensDelta: -(2 * bet),
      message: `HALLUCINATION: model invented facts. You pay ${fmt(2 * bet)} tokens anyway.`,
      cooldownMs: 450,
    };
  }

  if (c.hasRateLimit) {
    return {
      type: "rate_limit",
      tokensDelta: 0,
      message: "RATE LIMIT: 429. Please try again after you stop spinning like a benchmark.",
      cooldownMs: 1100,
    };
  }

  if (c.effectiveCount >= 3) {
    const s = c.matchedSymbol ?? symbols.find((x) => !x.wild) ?? symbols[0];
    const win = bet * (s.tripleMult ?? 0);
    return {
      type: "triple",
      tokensDelta: win,
      message: `TRIPLE ${s.name}: +${fmt(win)} tokens. ${s.flavor}`,
      cooldownMs: 380,
      win,
    };
  }

  if (c.effectiveCount === 2 && c.matchedSymbol) {
    const s = c.matchedSymbol;
    const win = bet * (s.pairMult ?? 0);
    const tone = win > 0 ? `PAIR ${s.name}: +${fmt(win)} tokens.` : `PAIR ${s.name}: nothing.`;
    return {
      type: "pair",
      tokensDelta: win,
      message: `${tone} ${s.flavor}`,
      cooldownMs: 320,
      win,
    };
  }

  return {
    type: "loss",
    tokensDelta: 0,
    message: "No match: the model says 'try prompt engineering'.",
    cooldownMs: 260,
  };
}

async function spinOnce() {
  if (spinning) return;

  const t = now();
  if (t - lastSpinAt < 220) return; // gentle debounce
  lastSpinAt = t;

  const bet = clamp(Number(els.betInput.value || 5), 1, 25);
  state.bet = bet;

  if (state.credits < 1) {
    setResult("Out of API credits. Congratulations: you found the free tier.");
    vibrate([40, 40, 40]);
    updateHud();
    return;
  }

  if (state.tokens < bet) {
    setResult("Insufficient tokens to bet. Try pivoting into 'AI consulting'.");
    vibrate([40, 40, 40]);
    updateHud();
    return;
  }

  spinning = true;
  updateHud();

  state.tokens -= bet; // spend tokens to spin
  state.stats.net -= bet;
  state.credits -= 1; // burn an API credit per request
  state.stats.spins += 1;

  const targets = [weightedPick(SYMBOLS), weightedPick(SYMBOLS), weightedPick(SYMBOLS)];
  saveState(state);

  enableReelSpinStyles(true);
  beep({ freq: 390, durMs: 50, type: "square", gain: 0.35 });

  const stopped = [false, false, false];

  const startAt = now();
  const stopsAt = [startAt + 750, startAt + 1100, startAt + 1450];

  await new Promise((resolve) => {
    const tick = () => {
      const tNow = now();
      for (let i = 0; i < 3; i++) {
        if (stopped[i]) continue;

        const reel = els.reels[i];
        const rolling = weightedPick(SYMBOLS);
        setReel(reel, rolling);

        if (tNow >= stopsAt[i]) {
          stopped[i] = true;
          setReel(reel, targets[i]);
          beep({ freq: 330 + i * 70, durMs: 55, type: "square", gain: 0.28 });
        }
      }

      if (stopped.every(Boolean)) return resolve();
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  });

  enableReelSpinStyles(false);

  const payout = computePayout({ bet, symbols: targets });
  state.tokens += payout.tokensDelta;
  state.stats.net += payout.tokensDelta;

  if (payout.tokensDelta > 0) {
    state.stats.wins += 1;
    state.stats.biggestWin = Math.max(state.stats.biggestWin, payout.tokensDelta);
    chordWin();
    vibrate([20, 30, 20]);
  } else if (payout.type === "penalty" || payout.type === "rate_limit") {
    noiseBzzt();
    vibrate([60, 30, 60]);
  } else {
    beep({ freq: 220, durMs: 90, type: "sine", gain: 0.28 });
    vibrate(15);
  }

  if (state.tokens <= 0) {
    state.stats.bankruptcies += 1;
    state.tokens = 0;
    log("Bankruptcy achieved. Congratulations on your realistic AI startup simulation.");
  }

  setResult(payout.message);
  log(payout.message);

  saveState(state);
  renderStats();
  updateHud();

  await new Promise((r) => setTimeout(r, payout.cooldownMs));
  spinning = false;
  updateHud();
}

function setAuto(on) {
  state.settings.auto = on;
  saveState(state);
  updateHud();
  if (autoTimer) {
    clearTimeout(autoTimer);
    autoTimer = null;
  }
  if (!on) return;

  const step = async () => {
    if (!state.settings.auto) return;
    const canSpin = !spinning && state.tokens >= state.bet && state.credits >= 1;
    if (!canSpin) {
      state.settings.auto = false;
      saveState(state);
      updateHud();
      setResult("Auto stopped: insufficient tokens/credits (or the universe rate-limited you).");
      return;
    }
    await spinOnce();
    autoTimer = setTimeout(step, 120);
  };
  autoTimer = setTimeout(step, 50);
}

function toggleSound() {
  state.settings.sound = !state.settings.sound;
  saveState(state);
  updateHud();
  if (state.settings.sound) {
    initAudio();
    setResult("Sound on: your browser will now emit tiny venture-capital noises.");
    beep({ freq: 520, durMs: 65, type: "triangle", gain: 0.6 });
  } else {
    setResult("Sound off: stealth mode. (Still billed.)");
  }
}

function grantVcFunding() {
  const t = now();
  const cooldown = DAY_MS;
  const nextAt = state.vc.lastGrantAt + cooldown;
  if (state.vc.lastGrantAt && t < nextAt) {
    const mins = Math.ceil((nextAt - t) / 60000);
    setResult(`VC says: “circle back later.” Next grant in ~${mins} min.`);
    vibrate([20, 80, 20]);
    return;
  }

  const creditsGain = 50;
  const tokensBurn = Math.min(state.tokens, 25);
  state.credits += creditsGain;
  state.tokens -= tokensBurn;
  state.stats.net -= tokensBurn;
  state.vc.lastGrantAt = t;
  state.vc.grantsTaken += 1;

  saveState(state);
  renderStats();
  updateHud();
  const msg = `VC FUNDING: +${fmt(creditsGain)} credits, −${fmt(tokensBurn)} tokens (legal fees).`;
  setResult(msg);
  log(msg);
  chordWin();
}

function factoryReset() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  state = freshState();
  saveState(state);
  renderPayoutTable();
  renderStats();
  updateHud();
  setResult("Factory reset complete. You are now an untrained model with optimism.");
  log("Reset local save.");
}

async function copyLastResult() {
  const text = state.stats.lastResult || "";
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    setResult("Copied last result to clipboard. Paste it into a pitch deck.");
  } catch {
    setResult("Clipboard blocked. Your browser is practicing ‘responsible AI’.");
  }
}

async function shareLastResult() {
  const text = state.stats.lastResult || "";
  if (!text) return;
  const shareData = { title: "TokenBurner 3000", text };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      setResult("Shared. The internet will never recover.");
      return;
    }
  } catch {
    // user may cancel
  }
  await copyLastResult();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

function syncFromUI() {
  const bet = clamp(Number(els.betInput.value || 5), 1, 25);
  state.bet = bet;
  saveState(state);
  updateHud();
}

function boot() {
  state.bet = clamp(Number(state.bet || 5), 1, 25);
  state.tokens = Math.max(0, Number(state.tokens || 0));
  state.credits = Math.max(0, Number(state.credits || 0));

  renderPayoutTable();
  renderStats();

  // Seed reels with something fun.
  const seed = [SYMBOLS.find((s) => s.id === "PROMPT"), SYMBOLS.find((s) => s.id === "PIVOT"), SYMBOLS.find((s) => s.id === "TOKENS")];
  seed.forEach((s, i) => setReel(els.reels[i], s || SYMBOLS[i]));

  setResult(state.stats.lastResult || "Boot complete.");
  updateHud();
  registerServiceWorker();

  els.betInput.addEventListener("input", syncFromUI);

  els.spinBtn.addEventListener("click", () => spinOnce());
  els.autoBtn.addEventListener("click", () => setAuto(!state.settings.auto));
  els.muteBtn.addEventListener("click", toggleSound);
  els.fundBtn.addEventListener("click", grantVcFunding);
  els.resetBtn.addEventListener("click", factoryReset);
  els.copyBtn.addEventListener("click", copyLastResult);
  els.shareBtn.addEventListener("click", shareLastResult);

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "Space") {
      e.preventDefault();
      if (state.settings.auto) setAuto(false);
      spinOnce();
    }
    if (e.key.toLowerCase() === "m") toggleSound();
    if (e.key.toLowerCase() === "a") setAuto(!state.settings.auto);
  });

  log("Ready. Spin with the button or press Space.");
}

boot();

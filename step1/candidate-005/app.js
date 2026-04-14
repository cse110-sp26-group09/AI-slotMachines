/* Token Grinder — vanilla slot machine */

const STORAGE_KEY = "token-grinder/v1";
const STIPEND_KEY = "token-grinder/stipend/v1";

const $ = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
};

const ui = {
  balance: $("balance"),
  bet: $("bet"),
  message: $("message"),
  reels: [$("reel0"), $("reel1"), $("reel2")],
  spinBtn: $("spinBtn"),
  autoBtn: $("autoBtn"),
  betBtn: $("betBtn"),
  soundBtn: $("soundBtn"),
  resetBtn: $("resetBtn"),
  freeBtn: $("freeBtn"),
  stipendHint: $("stipendHint"),
  confirmReset: $("confirmReset"),
  paytable: $("paytable"),
  statSpins: $("statSpins"),
  statWins: $("statWins"),
  statLosses: $("statLosses"),
  statBigWin: $("statBigWin"),
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function nowMs() {
  return Date.now();
}

function formatTokens(n) {
  const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
  return `${nf.format(n)} Token${n === 1 ? "" : "s"}™`;
}

function randomUint32() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

function pickWeightedSymbol(symbols) {
  const total = symbols.reduce((sum, s) => sum + s.weight, 0);
  let r = randomUint32() % total;
  for (const sym of symbols) {
    if (r < sym.weight) return sym;
    r -= sym.weight;
  }
  return symbols[symbols.length - 1];
}

function safeLocalStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

const symbols = [
  {
    id: "bot",
    face: "🤖",
    name: "Chatbot",
    weight: 30,
    payout2: 4,
    payout3: 20,
    blurb: "Friendly. Confident. Frequently wrong.",
  },
  {
    id: "prompt",
    face: "📝",
    name: "Prompt",
    weight: 25,
    payout2: 3,
    payout3: 16,
    blurb: "If you phrase it perfectly, it might work (it won’t).",
  },
  {
    id: "gpu",
    face: "🖥️",
    name: "GPU Time",
    weight: 18,
    payout2: 6,
    payout3: 30,
    blurb: "The meter is running. The fans are screaming.",
  },
  {
    id: "token",
    face: "🪙",
    name: "Tokens",
    weight: 14,
    payout2: 10,
    payout3: 60,
    blurb: "The only thing that truly matters.",
  },
  {
    id: "guardrails",
    face: "🧯",
    name: "Guardrails",
    weight: 8,
    payout2: 14,
    payout3: 90,
    blurb: "Prevents fire. Also prevents fun.",
  },
  {
    id: "vc",
    face: "🦄",
    name: "VC Unicorn",
    weight: 4,
    payout2: 30,
    payout3: 160,
    blurb: "Valuation up. Reality down.",
  },
  {
    id: "agi",
    face: "✨",
    name: "AGI",
    weight: 1,
    payout2: 60,
    payout3: 420,
    blurb: "Soon™. Always soon™.",
  },
  {
    id: "hallucination",
    face: "🫠",
    name: "Hallucination",
    weight: 2,
    payout2: -12,
    payout3: -48,
    blurb: "Cites sources that do not exist. Charges anyway.",
  },
];

const state = {
  balance: 120,
  bet: 10,
  spinning: false,
  auto: false,
  sound: true,
  lastOutcome: null,
  stats: {
    spins: 0,
    wins: 0,
    losses: 0,
    biggestWin: 0,
  },
};

function loadState() {
  const raw = safeLocalStorageGet(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.balance === "number") state.balance = clamp(parsed.balance, 0, 999999);
    if (typeof parsed.bet === "number") state.bet = clamp(parsed.bet, 5, 100);
    if (typeof parsed.sound === "boolean") state.sound = parsed.sound;
    if (parsed.stats && typeof parsed.stats === "object") {
      const s = parsed.stats;
      state.stats.spins = typeof s.spins === "number" ? clamp(s.spins, 0, 1e9) : 0;
      state.stats.wins = typeof s.wins === "number" ? clamp(s.wins, 0, 1e9) : 0;
      state.stats.losses = typeof s.losses === "number" ? clamp(s.losses, 0, 1e9) : 0;
      state.stats.biggestWin =
        typeof s.biggestWin === "number" ? clamp(s.biggestWin, 0, 999999) : 0;
    }
  } catch {
    // ignore
  }
}

function saveState() {
  safeLocalStorageSet(
    STORAGE_KEY,
    JSON.stringify({
      balance: state.balance,
      bet: state.bet,
      sound: state.sound,
      stats: state.stats,
    }),
  );
}

function setMessage(text) {
  ui.message.textContent = text;
}

function renderPaytable() {
  ui.paytable.innerHTML = "";

  for (const sym of symbols) {
    const row = document.createElement("div");
    row.className = "payrow";

    const face = document.createElement("div");
    face.className = "payrow__sym";
    face.textContent = sym.face;

    const info = document.createElement("div");

    const name = document.createElement("div");
    name.className = "payrow__name";
    name.textContent = sym.name;

    const desc = document.createElement("div");
    desc.className = "payrow__desc";
    desc.textContent = sym.blurb;

    const payouts = document.createElement("div");
    payouts.className = "payrow__payouts";

    const p2 = document.createElement("span");
    p2.className = `pill ${sym.payout2 >= 0 ? "pill--win" : "pill--loss"}`;
    p2.textContent = `2×: ${sym.payout2 >= 0 ? "+" : ""}${sym.payout2}× bet`;

    const p3 = document.createElement("span");
    p3.className = `pill ${sym.payout3 >= 0 ? "pill--win" : "pill--loss"}`;
    p3.textContent = `3×: ${sym.payout3 >= 0 ? "+" : ""}${sym.payout3}× bet`;

    payouts.append(p2, p3);
    info.append(name, desc, payouts);
    row.append(face, info);
    ui.paytable.append(row);
  }
}

function updateUI() {
  const bal = formatTokens(state.balance);
  const bet = formatTokens(state.bet);
  ui.balance.value = bal;
  ui.balance.textContent = bal;
  ui.bet.value = bet;
  ui.bet.textContent = bet;
  ui.autoBtn.setAttribute("aria-pressed", String(state.auto));
  ui.soundBtn.setAttribute("aria-pressed", String(state.sound));
  ui.soundBtn.textContent = state.sound ? "Sound" : "Sound (muted)";

  ui.spinBtn.disabled = state.spinning || state.balance < state.bet;
  ui.betBtn.disabled = state.spinning;
  ui.autoBtn.disabled = state.spinning && !state.auto;

  const spins = String(state.stats.spins);
  const wins = String(state.stats.wins);
  const losses = String(state.stats.losses);
  const big = formatTokens(state.stats.biggestWin);
  ui.statSpins.value = spins;
  ui.statSpins.textContent = spins;
  ui.statWins.value = wins;
  ui.statWins.textContent = wins;
  ui.statLosses.value = losses;
  ui.statLosses.textContent = losses;
  ui.statBigWin.value = big;
  ui.statBigWin.textContent = big;
}

function setReelFace(i, sym, spinning) {
  const el = ui.reels[i];
  el.textContent = sym ? sym.face : "?";
  el.classList.toggle("spinning", Boolean(spinning));
}

function buzz(pattern = [10]) {
  if (!("vibrate" in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

function createAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    return new Ctx();
  } catch {
    return null;
  }
}

let audioCtx = null;

function beep({ type = "sine", freq = 440, durationMs = 90, gain = 0.025 } = {}) {
  if (!state.sound) return;
  audioCtx ??= createAudio();
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }

  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g);
  g.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + durationMs / 1000);
}

function payoutFor(result) {
  const counts = new Map();
  for (const s of result) counts.set(s.id, (counts.get(s.id) ?? 0) + 1);

  let best = { mult: 0, sym: null, matches: 0 };
  for (const s of result) {
    const n = counts.get(s.id) ?? 0;
    if (n === 3) {
      const mult = s.payout3;
      if (Math.abs(mult) > Math.abs(best.mult)) best = { mult, sym: s, matches: 3 };
    } else if (n === 2) {
      const mult = s.payout2;
      if (Math.abs(mult) > Math.abs(best.mult)) best = { mult, sym: s, matches: 2 };
    }
  }
  return best;
}

function flavorText({ sym, matches, mult }) {
  if (!sym) return "No pattern detected. The model says: “try again.”";

  if (sym.id === "hallucination") {
    if (matches === 3) return "Triple hallucination. It invents a law, bills you for it, and feels proud.";
    return "Hallucination detected. Confidence: 97%. Accuracy: optional.";
  }

  if (mult >= 200) return "BREAKING: your demo is now a product. Please pivot immediately.";
  if (mult >= 80) return "Your deck just got 12 slides longer. Congrats.";
  if (mult > 0 && matches === 3) return "Clean match. The model is aligned (for now).";
  if (mult > 0 && matches === 2) return "Partial match. Close enough for a press release.";
  if (mult < 0) return "Safety incident. Write a postmortem, then pay the bill.";
  return "The model refuses. Please rephrase with more tokens.";
}

function canClaimStipend() {
  const raw = safeLocalStorageGet(STIPEND_KEY);
  if (!raw) return true;
  const t = Number(raw);
  if (!Number.isFinite(t)) return true;
  return nowMs() - t >= 60 * 60 * 1000;
}

function stipendRemainingMs() {
  const raw = safeLocalStorageGet(STIPEND_KEY);
  if (!raw) return 0;
  const t = Number(raw);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, 60 * 60 * 1000 - (nowMs() - t));
}

function renderStipendHint() {
  if (canClaimStipend()) {
    ui.stipendHint.textContent = "Hourly stipend available. It’s not a bribe, it’s “incentive alignment.”";
    ui.freeBtn.disabled = false;
    return;
  }
  const ms = stipendRemainingMs();
  const min = Math.ceil(ms / 60000);
  ui.stipendHint.textContent = `Stipend recharges in ~${min} min. Please continue providing “feedback”.`;
  ui.freeBtn.disabled = true;
}

async function animateSpin(finalSyms) {
  const intervals = [];

  const tick = (i) => {
    const sym = pickWeightedSymbol(symbols);
    setReelFace(i, sym, true);
  };

  for (let i = 0; i < 3; i++) {
    intervals[i] = window.setInterval(() => tick(i), 55 + i * 10);
    window.setTimeout(() => {
      window.clearInterval(intervals[i]);
      setReelFace(i, finalSyms[i], false);
      beep({ freq: 380 + i * 120, durationMs: 70, gain: 0.02 });
      buzz(i === 2 ? [15, 30, 15] : [10]);
    }, 900 + i * 260);
  }

  await new Promise((r) => window.setTimeout(r, 900 + 2 * 260 + 40));
}

async function spinOnce() {
  if (state.spinning) return;
  if (state.balance < state.bet) {
    setMessage("Insufficient tokens. Please obtain funding or claim a stipend.");
    updateUI();
    return;
  }

  state.spinning = true;
  state.balance -= state.bet;
  state.stats.spins += 1;
  setMessage("Submitting request… (estimated latency: vibes)");
  updateUI();
  saveState();

  beep({ freq: 220, durationMs: 70, gain: 0.03 });

  const finalSyms = [pickWeightedSymbol(symbols), pickWeightedSymbol(symbols), pickWeightedSymbol(symbols)];
  await animateSpin(finalSyms);

  const { mult, sym, matches } = payoutFor(finalSyms);
  const delta = mult * state.bet;

  state.balance = clamp(state.balance + delta, 0, 999999);
  state.lastOutcome = { finalSyms, mult, sym, matches, delta };

  if (delta > 0) {
    state.stats.wins += 1;
    state.stats.biggestWin = Math.max(state.stats.biggestWin, delta);
    beep({ type: "triangle", freq: 740, durationMs: 110, gain: 0.03 });
    beep({ type: "triangle", freq: 880, durationMs: 120, gain: 0.028 });
  } else if (delta < 0) {
    state.stats.losses += 1;
    beep({ type: "sawtooth", freq: 110, durationMs: 130, gain: 0.02 });
  } else {
    state.stats.losses += 1;
    beep({ type: "square", freq: 150, durationMs: 80, gain: 0.015 });
  }

  const headline =
    delta > 0
      ? `Payout: +${formatTokens(delta)}`
      : delta < 0
        ? `Penalty: ${formatTokens(delta)}`
        : "No payout.";
  setMessage(`${headline} ${flavorText({ sym, matches, mult })}`);

  state.spinning = false;
  updateUI();
  saveState();
}

let autoTimer = null;

function startAuto() {
  state.auto = true;
  ui.autoBtn.textContent = "Auto (on)";
  ui.autoBtn.setAttribute("aria-pressed", "true");

  const loop = async () => {
    if (!state.auto) return;
    if (state.spinning) return;
    if (state.balance < state.bet) {
      setMessage("Auto stopped: out of tokens. Please secure additional funding.");
      stopAuto();
      updateUI();
      return;
    }
    await spinOnce();
    autoTimer = window.setTimeout(loop, 340);
  };

  autoTimer = window.setTimeout(loop, 50);
}

function stopAuto() {
  state.auto = false;
  ui.autoBtn.textContent = "Auto";
  ui.autoBtn.setAttribute("aria-pressed", "false");
  if (autoTimer) window.clearTimeout(autoTimer);
  autoTimer = null;
}

function cycleBet() {
  const steps = [5, 10, 20, 50, 100];
  const idx = steps.indexOf(state.bet);
  state.bet = steps[(idx + 1 + steps.length) % steps.length];
  setMessage(`Bet set to ${formatTokens(state.bet)}. Responsible spending is “out of scope”.`);
  updateUI();
  saveState();
}

function toggleSound() {
  state.sound = !state.sound;
  setMessage(state.sound ? "Sound enabled. Your laptop’s fan will applaud." : "Sound muted. Silence is aligned.");
  updateUI();
  saveState();
}

function resetGame() {
  state.balance = 120;
  state.bet = 10;
  state.auto = false;
  state.spinning = false;
  state.stats = { spins: 0, wins: 0, losses: 0, biggestWin: 0 };
  stopAuto();
  for (let i = 0; i < 3; i++) setReelFace(i, null, false);
  setMessage("Fresh model. Zero context. Maximum confidence.");
  updateUI();
  saveState();
}

function claimStipend() {
  if (!canClaimStipend()) {
    renderStipendHint();
    setMessage("Stipend not ready. Please wait, or pretend to be a beta tester.");
    return;
  }
  safeLocalStorageSet(STIPEND_KEY, String(nowMs()));
  const amount = 60;
  state.balance = clamp(state.balance + amount, 0, 999999);
  setMessage(`Stipend granted: +${formatTokens(amount)}. Thank you for your “human feedback”.`);
  beep({ type: "triangle", freq: 660, durationMs: 90, gain: 0.03 });
  updateUI();
  saveState();
  renderStipendHint();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!window.isSecureContext && location.hostname !== "localhost") return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

function wireEvents() {
  ui.spinBtn.addEventListener("click", () => spinOnce());

  ui.autoBtn.addEventListener("click", () => {
    if (state.auto) stopAuto();
    else startAuto();
    updateUI();
    saveState();
  });

  ui.betBtn.addEventListener("click", () => cycleBet());
  ui.soundBtn.addEventListener("click", () => toggleSound());

  ui.resetBtn.addEventListener("click", () => {
    if (typeof ui.confirmReset.showModal === "function") ui.confirmReset.showModal();
    else resetGame();
  });

  ui.confirmReset.addEventListener("close", () => {
    if (ui.confirmReset.returnValue === "ok") resetGame();
  });

  ui.freeBtn.addEventListener("click", () => claimStipend());

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.key === "s" || e.key === "S") {
      e.preventDefault();
      spinOnce();
    }
    if (e.key === "a" || e.key === "A") {
      e.preventDefault();
      if (state.auto) stopAuto();
      else startAuto();
      updateUI();
      saveState();
    }
  });
}

function init() {
  loadState();
  renderPaytable();
  wireEvents();

  for (let i = 0; i < 3; i++) setReelFace(i, pickWeightedSymbol(symbols), false);

  setMessage("Welcome. Please spend tokens to generate even more tokens. This is definitely sustainable.");
  updateUI();
  renderStipendHint();
  registerServiceWorker();

  window.setInterval(renderStipendHint, 15000);
}

init();

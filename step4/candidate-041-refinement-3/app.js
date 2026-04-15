/* Token Casino: localStorage state, reel animation, particles, haptics, and optional Web Audio. */

const STORAGE_KEY = "token-casino.v1";

const symbols = [
  { id: "TOKEN", label: "TOKEN", weight: 38, triple: 24 },
  { id: "PROMPT", label: "PROMPT", weight: 24, triple: 40 },
  { id: "GPU", label: "GPU", weight: 16, triple: 65 },
  { id: "AGENT", label: "AGENT", weight: 10, triple: 90 },
  { id: "MODEL", label: "MODEL", weight: 8, triple: 130 },
  { id: "HALLUCINATION", label: "HALLUCINATION", weight: 4, triple: 0 },
];
const symbolById = new Map(symbols.map((s) => [s.id, s]));

function labelFor(id) {
  return symbolById.get(id)?.label ?? id;
}

const baseSpinCost = 5;
const fineTuneCost = 30;
const fineTuneSpins = 5;
const sellDataGrant = 20;
const maxBet = 20;

const el = {
  balance: document.getElementById("balance"),
  spinCost: document.getElementById("spinCost"),
  telemetry: document.getElementById("telemetry"),
  sym0: document.getElementById("sym0"),
  sym1: document.getElementById("sym1"),
  sym2: document.getElementById("sym2"),
  reel0: document.getElementById("reel0"),
  reel1: document.getElementById("reel1"),
  reel2: document.getElementById("reel2"),
  message: document.getElementById("message"),
  spinBtn: document.getElementById("spinBtn"),
  spinMeta: document.getElementById("spinMeta"),
  fineTuneBtn: document.getElementById("fineTuneBtn"),
  fineTuneCost: document.getElementById("fineTuneCost"),
  sellDataBtn: document.getElementById("sellDataBtn"),
  resetBtn: document.getElementById("resetBtn"),
  payTable: document.getElementById("payTable"),
  soundToggle: document.getElementById("soundToggle"),
  reducedMotionToggle: document.getElementById("reducedMotionToggle"),
  sessionStats: document.getElementById("sessionStats"),
  machineFrame: document.getElementById("machineFrame"),
  fxLayer: document.getElementById("fxLayer"),
  fxCanvas: document.getElementById("fxCanvas"),
  winOverlay: document.getElementById("winOverlay"),
  bgCanvas: document.getElementById("bgCanvas"),

  betRange: document.getElementById("betRange"),
  betNumber: document.getElementById("betNumber"),
  betValue: document.getElementById("betValue"),

  shopBtn: document.getElementById("shopBtn"),
  shopDialog: document.getElementById("shopDialog"),
  shopGrid: document.getElementById("shopGrid"),

  volumeWrap: document.getElementById("volumeWrap"),
  volume: document.getElementById("volume"),
  hapticsToggle: document.getElementById("hapticsToggle"),

  totalWon: document.getElementById("totalWon"),
  totalSpent: document.getElementById("totalSpent"),
  totalNet: document.getElementById("totalNet"),
  wlCount: document.getElementById("wlCount"),
  biggestWin: document.getElementById("biggestWin"),
  ledgerLog: document.getElementById("ledgerLog"),
};

const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

function clampInt(n, min, max) {
  const v = Math.floor(Number.isFinite(n) ? n : 0);
  return Math.max(min, Math.min(max, v));
}

function formatInt(n) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
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

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function defaultState() {
  return {
    balance: 50,
    spins: 0,
    spinSpentTotal: 0,
    spinWonTotal: 0,
    winCount: 0,
    lossCount: 0,
    biggestWin: 0,
    history: [],
    telemetryLevel: 0,
    fineTuneRemaining: 0,
    soundOn: false,
    volume: 70,
    bet: 1,
    hapticsOn: true,
    neonMode: false,
    insuranceRemaining: 0,
    reducedMotion: prefersReducedMotion,
    last: ["TOKEN", "TOKEN", "TOKEN"],
  };
}

function normalizeState(raw) {
  const s = { ...defaultState(), ...(raw ?? {}) };
  s.balance = clampInt(s.balance, 0, 1_000_000_000);
  s.spins = clampInt(s.spins, 0, 1_000_000_000);
  s.spinSpentTotal = clampInt(s.spinSpentTotal, 0, 1_000_000_000);
  s.spinWonTotal = clampInt(s.spinWonTotal, 0, 1_000_000_000);
  s.winCount = clampInt(s.winCount, 0, 1_000_000_000);
  s.lossCount = clampInt(s.lossCount, 0, 1_000_000_000);
  s.biggestWin = clampInt(s.biggestWin, 0, 1_000_000_000);
  if (!Array.isArray(s.history)) s.history = [];
  s.history = s.history.slice(-40).filter((x) => x && typeof x === "object");
  s.telemetryLevel = clampInt(s.telemetryLevel, 0, 999);
  s.fineTuneRemaining = clampInt(s.fineTuneRemaining, 0, 999);
  s.volume = clampInt(s.volume, 0, 100);
  s.bet = clampInt(s.bet, 1, maxBet);
  s.hapticsOn = !!s.hapticsOn;
  s.neonMode = !!s.neonMode;
  s.insuranceRemaining = clampInt(s.insuranceRemaining, 0, 999);
  s.soundOn = !!s.soundOn;
  s.reducedMotion = !!s.reducedMotion;
  if (!Array.isArray(s.last) || s.last.length !== 3) s.last = ["TOKEN", "TOKEN", "TOKEN"];
  return s;
}

let state = normalizeState(loadState());

function spinCost() {
  // Telemetry makes everything more expensive. For user benefit, of course.
  const bet = clampInt(state.bet, 1, maxBet);
  return baseSpinCost * bet + clampInt(state.telemetryLevel, 0, 999);
}

function setMessage(text, kind = "neutral") {
  el.message.textContent = text;
  el.message.classList.remove("is-win", "is-lose", "is-bad");
  if (kind === "win") el.message.classList.add("is-win");
  if (kind === "lose") el.message.classList.add("is-lose");
  if (kind === "bad") el.message.classList.add("is-bad");
}

function setReels(ids) {
  el.sym0.textContent = labelFor(ids[0]);
  el.sym1.textContent = labelFor(ids[1]);
  el.sym2.textContent = labelFor(ids[2]);
}

function telemetryLabel() {
  if (state.telemetryLevel <= 0) return "Off";
  if (state.telemetryLevel === 1) return "On";
  return `On x${state.telemetryLevel}`;
}

function renderPayTable() {
  el.payTable.innerHTML = "";
  for (const s of symbols) {
    const li = document.createElement("li");
    const left = document.createElement("div");
    left.className = "sym";
    left.textContent = `${s.label} ×3`;
    const right = document.createElement("div");
    right.className = `payout ${s.triple === 0 ? "is-zero" : ""}`.trim();
    const bet = clampInt(state.bet, 1, maxBet);
    const scaled = s.triple * bet;
    right.textContent = s.triple === 0 ? "0 TOK" : `+${scaled} TOK`;
    li.append(left, right);
    el.payTable.appendChild(li);
  }
}

function renderHUD() {
  el.balance.textContent = formatInt(state.balance);
  const cost = spinCost();
  el.spinCost.textContent = formatInt(cost);
  el.telemetry.textContent = telemetryLabel();
  el.fineTuneCost.textContent = formatInt(fineTuneCost);
  el.spinMeta.textContent = `cost ${formatInt(cost)} TOK • bet ${formatInt(state.bet)}×`;
  el.sessionStats.textContent = `${formatInt(state.spins)} spins`;

  el.soundToggle.checked = !!state.soundOn;
  el.reducedMotionToggle.checked = !!state.reducedMotion;
  el.hapticsToggle.checked = !!state.hapticsOn;
  el.volume.value = String(clampInt(state.volume, 0, 100));
  el.volumeWrap.style.display = state.soundOn ? "" : "none";

  el.betRange.value = String(clampInt(state.bet, 1, maxBet));
  el.betNumber.value = String(clampInt(state.bet, 1, maxBet));
  el.betValue.textContent = formatInt(state.bet);

  document.body.classList.toggle("is-neon", !!state.neonMode);
  document.body.classList.toggle("is-reduced", !!state.reducedMotion);

  const canSpin = !isSpinning && state.balance >= cost;
  el.spinBtn.disabled = !canSpin;
  el.fineTuneBtn.disabled = isSpinning || state.balance < fineTuneCost;
  el.sellDataBtn.disabled = isSpinning;
  el.shopBtn.disabled = isSpinning;
  el.resetBtn.disabled = isSpinning;

  renderLedger();
}

function renderLedger() {
  if (!el.totalWon || !el.totalSpent || !el.totalNet || !el.wlCount || !el.biggestWin) return;
  el.totalWon.textContent = formatInt(state.spinWonTotal);
  el.totalSpent.textContent = formatInt(state.spinSpentTotal);
  el.totalNet.textContent = formatInt(state.spinWonTotal - state.spinSpentTotal);
  el.wlCount.textContent = `${formatInt(state.winCount)}/${formatInt(state.lossCount)}`;
  el.biggestWin.textContent = formatInt(state.biggestWin);

  if (!el.ledgerLog) return;
  el.ledgerLog.innerHTML = "";
  const recent = state.history.slice(-8).reverse();
  for (const h of recent) {
    const li = document.createElement("li");
    const kind = h.kind === "win" ? "is-win" : h.kind === "bad" ? "is-bad" : "is-lose";
    li.className = kind;
    const delta = clampInt(h.payout ?? 0, 0, 1_000_000_000) - clampInt(h.cost ?? 0, 0, 1_000_000_000);
    const sign = delta >= 0 ? "+" : "-";
    const abs = Math.abs(delta);
    const reels = Array.isArray(h.ids) ? h.ids.join(" â€¢ ") : "";
    li.textContent = `${sign}${formatInt(abs)} TOK â€¢ ${reels || "spin"}${h.mode === "nearMiss" ? " â€¢ almost" : ""}`;
    const reels2 = Array.isArray(h.ids) ? h.ids.join(" / ") : "";
    li.textContent = `${sign}${formatInt(abs)} TOK - ${reels2 || "spin"}${h.mode === "nearMiss" ? " - almost" : ""}`;
    el.ledgerLog.appendChild(li);
  }
}

function chooseWeightedSymbol() {
  const boost = clampInt(state.fineTuneRemaining, 0, 999) > 0;

  let total = 0;
  const weights = symbols.map((s) => {
    let w = s.weight;
    if (boost) {
      if (s.id === "HALLUCINATION") w = Math.max(1, Math.floor(w * 0.35));
      if (s.id === "MODEL") w = Math.floor(w * 1.7);
      if (s.id === "AGENT") w = Math.floor(w * 1.5);
      if (s.id === "GPU") w = Math.floor(w * 1.2);
    }
    total += w;
    return w;
  });

  let r = Math.random() * total;
  for (let i = 0; i < symbols.length; i++) {
    r -= weights[i];
    if (r <= 0) return symbols[i];
  }
  return symbols[symbols.length - 1];
}

function payoutFor(ids) {
  const [a, b, c] = ids;
  const byId = new Map(symbols.map((s) => [s.id, s]));
  const bet = clampInt(state.bet, 1, maxBet);

  const hasHall = a === "HALLUCINATION" || b === "HALLUCINATION" || c === "HALLUCINATION";
  const allSame = a === b && b === c;
  const anyTwo = a === b || a === c || b === c;

  if (allSame) {
    if (a === "HALLUCINATION") return { win: 0, kind: "bad", msg: "3× HALLUCINATION: bold claim. zero citations. payout: vibes." };
    const triple = byId.get(a)?.triple ?? 0;
    const win = triple * bet;
    return { win, kind: "win", msg: `JACKPOT: 3× ${a}. minted +${formatInt(win)} TOK out of thin air.` };
  }

  if (anyTwo) {
    // Small “confidence bonus”: 10% of that symbol’s triple payout.
    const paired = a === b ? a : a === c ? a : b;
    const base = byId.get(paired)?.triple ?? 0;
    const win = Math.max(1, Math.floor(base * 0.10)) * bet;
    const msg = hasHall
      ? `2× ${paired}: confidence bonus +${formatInt(win)} TOK. also detected hallucination drift.`
      : `2× ${paired}: confidence bonus +${formatInt(win)} TOK.`;
    return { win, kind: hasHall ? "lose" : "win", msg };
  }

  if (hasHall) {
    return { win: 0, kind: "bad", msg: "HALLUCINATION present. output looks fluent. result is wrong. no payout." };
  }

  const jabs = [
    "No match. Try prompting harder.",
    "No win. Have you tried turning the model off and on again?",
    "Nothing. But the KPI dashboard looks great.",
    "Nope. Consider buying the Premium Probability Pack.",
  ];
  return { win: 0, kind: "lose", msg: jabs[Math.floor(Math.random() * jabs.length)] };
}

function pickNearMissBait() {
  const candidates = symbols
    .filter((s) => s.id !== "HALLUCINATION" && s.triple > 0)
    .slice()
    .sort((a, b) => b.triple - a.triple);
  const top = candidates.slice(0, 4);
  const weights = top.map((s, i) => Math.max(1, (top.length - i) * 2));
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  let r = Math.random() * sum;
  for (let i = 0; i < top.length; i++) {
    r -= weights[i];
    if (r <= 0) return top[i].id;
  }
  return top[0]?.id ?? "MODEL";
}

function buildNearMissIds() {
  const bait = pickNearMissBait();
  const pool = symbols.map((s) => s.id).filter((id) => id !== "HALLUCINATION" && id !== bait);
  const second = pool[Math.floor(Math.random() * pool.length)];
  let third = pool[Math.floor(Math.random() * pool.length)];
  if (third === second) third = pool[(pool.indexOf(third) + 1) % pool.length];
  return { bait, ids: [bait, second, third] };
}

let audioCtx = null;
let masterGain = null;

function getAudio() {
  if (!state.soundOn) return null;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = clampInt(state.volume, 0, 100) / 100;
    masterGain.connect(audioCtx.destination);
  }
  return audioCtx;
}

function setMasterVolume() {
  if (!masterGain) return;
  masterGain.gain.setTargetAtTime(clampInt(state.volume, 0, 100) / 100, audioCtx.currentTime, 0.01);
}

function beep({ freq = 440, dur = 0.06, type = "square", gain = 0.06 } = {}) {
  const ctx = getAudio();
  if (!ctx || !masterGain) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g).connect(masterGain);
  osc.start();
  osc.stop(ctx.currentTime + dur);
}

function tone({
  freqStart = 440,
  freqEnd = null,
  dur = 0.12,
  type = "sine",
  gain = 0.06,
  attack = 0.008,
  release = 0.06,
} = {}) {
  const ctx = getAudio();
  if (!ctx || !masterGain) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(30, freqStart), ctx.currentTime);
  if (typeof freqEnd === "number" && Number.isFinite(freqEnd)) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), ctx.currentTime + dur);
  }
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), ctx.currentTime + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur + release);
  osc.connect(g).connect(masterGain);
  osc.start();
  osc.stop(ctx.currentTime + dur + release + 0.01);
}

function winChord() {
  beep({ freq: 523.25, dur: 0.08, type: "triangle", gain: 0.07 });
  setTimeout(() => beep({ freq: 659.25, dur: 0.08, type: "triangle", gain: 0.07 }), 80);
  setTimeout(() => beep({ freq: 783.99, dur: 0.10, type: "triangle", gain: 0.07 }), 160);
}

function sfxWin(win, ids) {
  const tier = winTier(win);
  const hasHall = Array.isArray(ids) && ids.includes("HALLUCINATION");

  if (hasHall) {
    tone({ freqStart: 360, freqEnd: 120, dur: 0.18, type: "square", gain: 0.045, release: 0.12 });
    setTimeout(() => beep({ freq: 880, dur: 0.03, type: "triangle", gain: 0.05 }), 110);
    return;
  }

  if (tier === "tiny" || tier === "small") {
    beep({ freq: 740, dur: 0.05, type: "triangle", gain: 0.05 });
    setTimeout(() => beep({ freq: 988, dur: 0.06, type: "triangle", gain: 0.05 }), 55);
    return;
  }

  if (tier === "mid") {
    winChord();
    setTimeout(() => beep({ freq: 988, dur: 0.08, type: "sine", gain: 0.04 }), 220);
    return;
  }

  if (tier === "big") {
    winChord();
    setTimeout(() => tone({ freqStart: 520, freqEnd: 1040, dur: 0.22, type: "sawtooth", gain: 0.03, release: 0.14 }), 120);
    setTimeout(() => beep({ freq: 1318.5, dur: 0.09, type: "triangle", gain: 0.05 }), 300);
    return;
  }

  // jackpot
  winChord();
  setTimeout(() => winChord(), 230);
  setTimeout(() => tone({ freqStart: 220, freqEnd: 1320, dur: 0.32, type: "sawtooth", gain: 0.035, release: 0.18 }), 140);
  setTimeout(() => beep({ freq: 1760, dur: 0.12, type: "triangle", gain: 0.06 }), 560);
}

function tick() {
  beep({ freq: 180 + Math.random() * 60, dur: 0.03, type: "square", gain: 0.045 });
}

function sfxSpinStart() {
  beep({ freq: 240, dur: 0.05, type: "sawtooth", gain: 0.03 });
  setTimeout(() => beep({ freq: 360, dur: 0.06, type: "sawtooth", gain: 0.03 }), 40);
  setTimeout(() => beep({ freq: 520, dur: 0.06, type: "triangle", gain: 0.03 }), 85);
}

function sfxSymbolLand(symbolId, reelIndex = 0) {
  const bump = reelIndex * 28;
  if (symbolId === "TOKEN") {
    beep({ freq: 880 + bump, dur: 0.03, type: "triangle", gain: 0.055 });
    setTimeout(() => beep({ freq: 1320 + bump, dur: 0.04, type: "triangle", gain: 0.05 }), 40);
    return;
  }
  if (symbolId === "PROMPT") {
    beep({ freq: 640 + bump, dur: 0.02, type: "square", gain: 0.05 });
    setTimeout(() => beep({ freq: 520 + bump, dur: 0.02, type: "square", gain: 0.04 }), 24);
    return;
  }
  if (symbolId === "GPU") {
    beep({ freq: 220 + bump, dur: 0.05, type: "sawtooth", gain: 0.04 });
    setTimeout(() => beep({ freq: 330 + bump, dur: 0.05, type: "sawtooth", gain: 0.032 }), 55);
    return;
  }
  if (symbolId === "AGENT") {
    beep({ freq: 740 + bump, dur: 0.035, type: "sine", gain: 0.048 });
    setTimeout(() => beep({ freq: 980 + bump, dur: 0.04, type: "sine", gain: 0.042 }), 42);
    return;
  }
  if (symbolId === "MODEL") {
    beep({ freq: 420 + bump, dur: 0.06, type: "triangle", gain: 0.04 });
    setTimeout(() => beep({ freq: 630 + bump, dur: 0.05, type: "triangle", gain: 0.035 }), 70);
    return;
  }
  if (symbolId === "HALLUCINATION") {
    beep({ freq: 180 + bump, dur: 0.04, type: "square", gain: 0.05 });
    setTimeout(() => beep({ freq: 92 + bump, dur: 0.08, type: "square", gain: 0.05 }), 45);
    return;
  }

  beep({ freq: 520 + bump, dur: 0.03, type: "square", gain: 0.05 });
}

function sfxReelStop(i = 0, symbolId = null) {
  const base = 520 + i * 60;
  beep({ freq: base, dur: 0.02, type: "square", gain: 0.045 });
  setTimeout(() => beep({ freq: base - 120, dur: 0.03, type: "square", gain: 0.03 }), 18);
  if (symbolId) setTimeout(() => sfxSymbolLand(symbolId, i), 28);
}

function sfxLose() {
  beep({ freq: 160, dur: 0.08, type: "square", gain: 0.05 });
  setTimeout(() => beep({ freq: 110, dur: 0.11, type: "square", gain: 0.05 }), 85);
}

function sfxNearMiss() {
  beep({ freq: 220, dur: 0.06, type: "sawtooth", gain: 0.03 });
  setTimeout(() => beep({ freq: 320, dur: 0.06, type: "sawtooth", gain: 0.032 }), 70);
  setTimeout(() => beep({ freq: 440, dur: 0.06, type: "sawtooth", gain: 0.035 }), 140);
  setTimeout(() => beep({ freq: 620, dur: 0.07, type: "triangle", gain: 0.03 }), 210);
  setTimeout(() => beep({ freq: 120, dur: 0.11, type: "square", gain: 0.05 }), 310);
}

function sfxShop() {
  beep({ freq: 680, dur: 0.05, type: "triangle", gain: 0.04 });
  setTimeout(() => beep({ freq: 860, dur: 0.05, type: "triangle", gain: 0.04 }), 65);
}

function setSpinning(on) {
  for (const r of [el.reel0, el.reel1, el.reel2]) {
    r.classList.toggle("is-spinning", on);
    if (on) r.classList.remove("is-stopping");
  }
}

let isSpinning = false;
let fireworks = null;
let bgField = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryVibrate(pattern) {
  if (!state.hapticsOn) return;
  if (!("vibrate" in navigator)) return;
  try { navigator.vibrate(pattern); } catch {}
}

let moodTimer = null;
function pulseMood(kind) {
  const cls = kind === "jackpot" ? "mood-jackpot" : kind === "win" ? "mood-win" : "mood-lose";
  document.body.classList.remove("mood-win", "mood-lose", "mood-jackpot");
  document.body.classList.add(cls);
  bgField?.kick?.(kind);
  clearTimeout(moodTimer);
  moodTimer = setTimeout(() => document.body.classList.remove("mood-win", "mood-lose", "mood-jackpot"), kind === "jackpot" ? 1400 : 900);
}

function fxFlash() {
  if (state.reducedMotion) return;
  const flash = document.createElement("div");
  flash.className = "flash";
  el.fxLayer.appendChild(flash);
  setTimeout(() => flash.remove(), 650);
}

function fxWinOverlay(tier) {
  if (state.reducedMotion) return;
  if (!el.winOverlay) return;
  el.winOverlay.classList.remove("is-on", "is-jackpot");
  void el.winOverlay.offsetWidth;
  el.winOverlay.classList.add(tier === "jackpot" ? "is-jackpot" : "is-on");
  setTimeout(() => el.winOverlay.classList.remove("is-on", "is-jackpot"), tier === "jackpot" ? 1400 : 950);
}

function sparkBurst({ xPct, yPct, count, power = 1 }) {
  if (state.reducedMotion) return;
  const max = Math.max(0, Math.floor(count));
  for (let i = 0; i < max; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = (60 + Math.random() * 210) * power;
    const dx = Math.cos(a) * r;
    const dy = Math.sin(a) * r + (Math.random() * 40);
    const hue = Math.floor(35 + Math.random() * 140);

    const s = document.createElement("div");
    s.className = "spark";
    s.style.setProperty("--x", `${xPct}%`);
    s.style.setProperty("--y", `${yPct}%`);
    s.style.setProperty("--dx", `${dx}px`);
    s.style.setProperty("--dy", `${dy}px`);
    s.style.setProperty("--h", String(hue));
    el.fxLayer.appendChild(s);
    setTimeout(() => s.remove(), 1100);
  }
}

function createFireworks(canvas) {
  if (!canvas) return null;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return null;

  let w = 0;
  let h = 0;
  let dpr = 1;
  let raf = 0;
  let running = false;
  let lastT = 0;
  const parts = [];

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    w = Math.max(1, Math.floor(rect.width * dpr));
    h = Math.max(1, Math.floor(rect.height * dpr));
    canvas.width = w;
    canvas.height = h;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }

  function start() {
    if (running) return;
    running = true;
    lastT = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function clear() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function explode(x, y, { count = 64, power = 1, hue = 55 } = {}) {
    const n = Math.max(10, Math.floor(count));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (80 + Math.random() * 260) * power;
      parts.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0,
        ttl: 0.85 + Math.random() * 0.55,
        hue: (hue + Math.random() * 90) % 360,
        size: 1.2 + Math.random() * 2.6,
      });
    }
    start();
  }

  function loop(t) {
    if (!running) return;
    const dt = Math.min(0.05, Math.max(0.001, (t - lastT) / 1000));
    lastT = t;

    const cw = canvas.width / dpr;
    const ch = canvas.height / dpr;

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = "lighter";

    const g = 540;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.ttl) {
        parts.splice(i, 1);
        continue;
      }
      p.vy += g * dt;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const a = 1 - (p.life / p.ttl);
      ctx.fillStyle = `hsla(${p.hue}, 100%, 62%, ${Math.max(0, a * 0.95)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    if (parts.length === 0) {
      stop();
      clear();
      return;
    }
    raf = requestAnimationFrame(loop);
  }

  return { resize, explode, clear };
}

function createBackgroundField(canvas) {
  if (!canvas) return null;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return null;

  let w = 0;
  let h = 0;
  let dpr = 1;
  let raf = 0;
  let running = false;
  let lastT = 0;
  let energy = 0;
  const pts = [];
  const mouse = { x: 0, y: 0, has: false };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    w = Math.max(1, Math.floor(rect.width * dpr));
    h = Math.max(1, Math.floor(rect.height * dpr));
    canvas.width = w;
    canvas.height = h;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }

  function clear() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function seed() {
    pts.length = 0;
    const count = 74;
    for (let i = 0; i < count; i++) {
      pts.push({
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - 0.5) * 0.010,
        vy: (Math.random() - 0.5) * 0.010,
        r: 1.2 + Math.random() * 2.4,
        hue: 35 + Math.random() * 160,
      });
    }
  }

  function start() {
    if (running) return;
    running = true;
    lastT = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function kick(kind) {
    energy += kind === "jackpot" ? 1.25 : kind === "win" ? 0.75 : 0.45;
    energy = Math.min(2.2, energy);
    start();
  }

  function pointer(x, y) {
    mouse.x = x;
    mouse.y = y;
    mouse.has = true;
    start();
  }

  function click(x, y) {
    pointer(x, y);
    energy = Math.min(2.2, energy + 0.55);
    for (const p of pts) {
      const dx = (p.x * w / dpr) - x;
      const dy = (p.y * h / dpr) - y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = Math.min(1, 140 / d);
      p.vx += (dx / d) * f * 0.02;
      p.vy += (dy / d) * f * 0.02;
    }
  }

  function loop(t) {
    if (!running) return;
    if (state.reducedMotion) {
      stop();
      clear();
      return;
    }

    const dt = Math.min(0.05, Math.max(0.001, (t - lastT) / 1000));
    lastT = t;

    const cw = canvas.width / dpr;
    const ch = canvas.height / dpr;

    energy = Math.max(0, energy - dt * 0.35);

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = "lighter";

    const pull = mouse.has ? (0.018 + energy * 0.020) : 0;
    const speed = 0.22 + energy * 0.55;

    for (const p of pts) {
      if (mouse.has) {
        const px = p.x * cw;
        const py = p.y * ch;
        const dx = mouse.x - px;
        const dy = mouse.y - py;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = Math.min(1, 240 / d);
        p.vx += (dx / d) * f * pull * dt;
        p.vy += (dy / d) * f * pull * dt;
      }

      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx * dt * speed;
      p.y += p.vy * dt * speed;

      if (p.x < -0.05) p.x = 1.05;
      if (p.x > 1.05) p.x = -0.05;
      if (p.y < -0.05) p.y = 1.05;
      if (p.y > 1.05) p.y = -0.05;

      const alpha = 0.18 + energy * 0.55;
      const size = p.r * (0.85 + energy * 0.75);
      ctx.fillStyle = `hsla(${p.hue}, 100%, 64%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x * cw, p.y * ch, size, 0, Math.PI * 2);
      ctx.fill();
    }

    raf = requestAnimationFrame(loop);
  }

  resize();
  seed();
  if (!state.reducedMotion) start();

  return { resize, clear, kick, pointer, click, start, stop };
}

function fxFireworks(tier) {
  if (state.reducedMotion) return;
  if (!fireworks) return;

  const bursts =
    tier === "jackpot" ? 7 :
    tier === "big" ? 4 :
    tier === "mid" ? 3 :
    tier === "small" ? 2 :
    1;
  const base =
    tier === "jackpot" ? 92 :
    tier === "big" ? 70 :
    tier === "mid" ? 54 :
    tier === "small" ? 42 :
    28;

  for (let i = 0; i < bursts; i++) {
    setTimeout(() => {
      const cw = el.fxCanvas?.width ? (el.fxCanvas.width / Math.max(1, Math.min(2, window.devicePixelRatio || 1))) : window.innerWidth;
      const ch = el.fxCanvas?.height ? (el.fxCanvas.height / Math.max(1, Math.min(2, window.devicePixelRatio || 1))) : window.innerHeight;
      const x = cw * (0.12 + Math.random() * 0.76);
      const y = ch * (0.10 + Math.random() * 0.36);
      fireworks.explode(x, y, { count: base + Math.floor(Math.random() * 30), power: tier === "jackpot" ? 1.25 : 1, hue: 35 + Math.random() * 140 });
    }, i * (tier === "jackpot" ? 110 : 140));
  }
}

function winTier(win) {
  const bet = clampInt(state.bet, 1, maxBet);
  const perUnit = bet > 0 ? Math.floor(win / bet) : win;
  if (perUnit >= 130) return "jackpot";
  if (perUnit >= 90) return "big";
  if (perUnit >= 65) return "mid";
  if (perUnit >= 24) return "small";
  return "tiny";
}

function showBanner(tier, win) {
  if (state.reducedMotion) return;
  if (tier !== "big" && tier !== "jackpot") return;

  const b = document.createElement("div");
  b.className = "banner";

  const k = document.createElement("div");
  k.className = "banner__k";
  k.textContent = tier === "jackpot" ? "Jackpot • Certified 100% Accurate" : "Big Win • Confidence: 0.98";

  const v = document.createElement("div");
  v.className = "banner__v";
  v.innerHTML = `+<span>${formatInt(win)}</span> TOK`;

  b.append(k, v);
  el.fxLayer.appendChild(b);
  setTimeout(() => b.remove(), 1400);
}

function celebrate(win) {
  if (win <= 0) return;
  const tier = winTier(win);
  pulseMood(tier === "jackpot" ? "jackpot" : "win");
  fxWinOverlay(tier);
  fxFireworks(tier);
  showBanner(tier, win);

  el.machineFrame.classList.remove("is-celebrate", "is-jackpot");
  void el.machineFrame.offsetWidth; // restart animation
  el.machineFrame.classList.add(tier === "jackpot" ? "is-jackpot" : "is-celebrate");
  setTimeout(() => el.machineFrame.classList.remove("is-celebrate", "is-jackpot"), 1100);

  const scale = state.reducedMotion ? 0.45 : 1;
  const bursts =
    tier === "jackpot" ? 5 :
    tier === "big" ? 3 :
    tier === "mid" ? 2 :
    1;
  const base =
    tier === "jackpot" ? 70 :
    tier === "big" ? 52 :
    tier === "mid" ? 38 :
    22;

  if (tier === "jackpot") fxFlash();
  if (tier === "big") setTimeout(fxFlash, 120);

  for (let i = 0; i < bursts; i++) {
    setTimeout(() => {
      const x = 20 + Math.random() * 60;
      const y = 18 + Math.random() * 28;
      sparkBurst({ xPct: x, yPct: y, count: Math.floor(base * scale), power: tier === "jackpot" ? 1.15 : 1 });
    }, i * 140);
  }

  const h = tier === "jackpot" ? [25, 60, 25, 120, 40, 25] :
    tier === "big" ? [20, 50, 20, 70, 20] :
    tier === "mid" ? [15, 40, 15] :
    [10];
  tryVibrate(h);
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
}

function makeSpinDelays({ ticks, durationMs, minDelay = 18, maxDelay = 160 }) {
  const steps = Math.max(1, Math.floor(ticks) - 1);
  const base = [];
  for (let i = 0; i < steps; i++) {
    const t = steps <= 1 ? 1 : i / (steps - 1);
    base.push(minDelay + (maxDelay - minDelay) * easeOutCubic(t));
  }
  const sum = base.reduce((a, b) => a + b, 0) || 1;
  const scale = Math.max(0.1, durationMs / sum);
  return base.map((d) => Math.max(10, Math.floor(d * scale)));
}

function buildSpinSequence({ ticks, finalId, teaseId = null, teaseSteps = 0 }) {
  const total = Math.max(3, Math.floor(ticks));
  const teaseN = teaseId ? Math.max(0, Math.min(total - 1, Math.floor(teaseSteps))) : 0;
  const lead = Math.max(1, total - 1 - teaseN);

  const seq = [];
  let last = null;
  for (let i = 0; i < lead; i++) {
    let id = chooseWeightedSymbol().id;
    if (id === last && Math.random() < 0.7) id = chooseWeightedSymbol().id;
    seq.push(id);
    last = id;
  }
  for (let i = 0; i < teaseN; i++) seq.push(teaseId);
  seq.push(finalId);
  return seq;
}

async function spinOneReel(index, outIds, plan) {
  const reelEl = index === 0 ? el.sym0 : index === 1 ? el.sym1 : el.sym2;
  const reelFrame = index === 0 ? el.reel0 : index === 1 ? el.reel1 : el.reel2;

  const ticks = plan?.ticks ?? (state.reducedMotion ? 9 : 18);
  const durationMs = plan?.durationMs ?? (state.reducedMotion ? 520 : 980);
  const finalId = plan?.finalId ?? chooseWeightedSymbol().id;
  const teaseId = plan?.teaseId ?? null;
  const teaseSteps = plan?.teaseSteps ?? 0;
  const onTease = typeof plan?.onTease === "function" ? plan.onTease : null;

  const seq = buildSpinSequence({ ticks, finalId, teaseId, teaseSteps });
  const delays = makeSpinDelays({
    ticks: seq.length,
    durationMs,
    minDelay: state.reducedMotion ? 30 : 16,
    maxDelay: state.reducedMotion ? 90 : 190,
  });

  let teased = false;
  for (let i = 0; i < seq.length; i++) {
    const id = seq[i];
    reelEl.textContent = labelFor(id);

    if (!teased && teaseId && id === teaseId && i < seq.length - 1) {
      teased = true;
      onTease?.(index, teaseId);
    }

    if (i % 2 === 0) tick();
    if (i < delays.length) await sleep(delays[i]);
  }

  const landed = seq[seq.length - 1];
  outIds[index] = landed;

  reelFrame.classList.add("is-stopping");
  setTimeout(() => reelFrame.classList.remove("is-stopping"), state.reducedMotion ? 180 : 520);
  sfxReelStop(index, landed);
}

async function doSpin() {
  if (isSpinning) return;
  const cost = spinCost();
  if (state.balance < cost) {
    setMessage(`Insufficient tokens for ${formatInt(cost)} TOK. Lower your bet or sell your data.`, "bad");
    renderHUD();
    return;
  }

  isSpinning = true;
  renderHUD();

  state.balance -= cost;
  state.spins = clampInt(state.spins + 1, 0, 1_000_000_000);
  state.spinSpentTotal = clampInt(state.spinSpentTotal + cost, 0, 1_000_000_000);
  saveState();
  renderHUD();

  setSpinning(true);
  sfxSpinStart();
  tryVibrate([8]);
  setMessage("Thinking… generating… definitely not gambling…", "neutral");

  let mode = "normal";
  let bait = null;

  // Decide the outcome up-front so we can choreograph the slowdown/near-miss.
  let planned = [chooseWeightedSymbol().id, chooseWeightedSymbol().id, chooseWeightedSymbol().id];
  const pre = payoutFor(planned);
  if (!state.reducedMotion && pre.win === 0 && pre.kind === "lose") {
    const nm = buildNearMissIds();
    planned = nm.ids;
    bait = nm.bait;
    mode = "nearMiss";
  }

  const out = ["TOKEN", "TOKEN", "TOKEN"];
  let teaseOnce = false;

  const ticksBase = state.reducedMotion ? 10 : 18;
  const plans = [
    {
      finalId: planned[0],
      ticks: state.reducedMotion ? 8 : ticksBase - 2,
      durationMs: state.reducedMotion ? 420 : 820,
      teaseId: mode === "nearMiss" ? bait : null,
      teaseSteps: mode === "nearMiss" ? 1 : 0,
    },
    {
      finalId: planned[1],
      ticks: state.reducedMotion ? 9 : ticksBase - 1,
      durationMs: state.reducedMotion ? 500 : 1020,
      teaseId: mode === "nearMiss" ? bait : null,
      teaseSteps: mode === "nearMiss" ? 2 : 0,
    },
    {
      finalId: planned[2],
      ticks: state.reducedMotion ? 10 : ticksBase,
      durationMs: state.reducedMotion ? 580 : 1240,
      teaseId: mode === "nearMiss" ? bait : null,
      teaseSteps: mode === "nearMiss" ? 4 : 0,
      onTease: () => {
        if (mode !== "nearMiss") return;
        if (teaseOnce) return;
        teaseOnce = true;
        sfxNearMiss();
      },
    },
  ];

  // Stagger reels a bit for a more slot-like feel.
  await Promise.all([
    spinOneReel(0, out, plans[0]),
    (async () => {
      await sleep(state.reducedMotion ? 45 : 75);
      await spinOneReel(1, out, plans[1]);
    })(),
    (async () => {
      await sleep(state.reducedMotion ? 90 : 140);
      await spinOneReel(2, out, plans[2]);
    })(),
  ]);

  setSpinning(false);

  const result = payoutFor(out);

  // “Production incident”: tiny chance to invert a good outcome when hallucination is involved.
  const hasHall = out.includes("HALLUCINATION");
  const insured = state.insuranceRemaining > 0;
  let paid = false;
  if (hasHall && result.win > 0 && !insured && Math.random() < 0.18) {
    setMessage("A/B test says you didn’t like that win. rolling back. payout: 0 TOK.", "bad");
  } else {
    if (result.win > 0) {
      state.balance += result.win;
      paid = true;
    }
    if (mode === "nearMiss" && result.win <= 0) {
      const taunts = [
        `ALMOST: ${bait}. The model nearly complied. payout: 0 TOK.`,
        `So close to ${bait}. Try rephrasing your prompt (and your life choices).`,
        `Near miss. Confidence: 0.99. Correctness: 0.00. payout: 0 TOK.`,
      ];
      setMessage(taunts[Math.floor(Math.random() * taunts.length)], "lose");
    } else {
      setMessage(result.msg, result.kind);
    }
  }

  if (state.insuranceRemaining > 0) state.insuranceRemaining -= 1;
  if (state.fineTuneRemaining > 0) state.fineTuneRemaining -= 1;
  state.last = out;

  const payout = paid ? result.win : 0;
  if (payout > 0) {
    state.spinWonTotal = clampInt(state.spinWonTotal + payout, 0, 1_000_000_000);
    state.winCount = clampInt(state.winCount + 1, 0, 1_000_000_000);
    state.biggestWin = Math.max(state.biggestWin, payout);
  } else {
    state.lossCount = clampInt(state.lossCount + 1, 0, 1_000_000_000);
  }

  state.history.push({
    t: Date.now(),
    ids: out.slice(),
    cost,
    payout,
    kind: paid ? "win" : (mode === "nearMiss" ? "lose" : result.kind),
    mode,
  });
  state.history = state.history.slice(-40);
  saveState();

  if (paid) {
    sfxWin(result.win, out);
    celebrate(result.win);
  } else {
    sfxLose();
    tryVibrate([10]);
    pulseMood("lose");
  }
  isSpinning = false;
  renderHUD();
}

function doFineTune() {
  if (isSpinning) return;
  if (state.balance < fineTuneCost) {
    setMessage(`Fine-tune requires ${fineTuneCost} TOK. You currently have ${formatInt(state.balance)}.`, "bad");
    return;
  }
  state.balance -= fineTuneCost;
  state.fineTuneRemaining = fineTuneSpins;
  saveState();
  renderHUD();
  setMessage(`Fine-tuned. Accuracy not guaranteed. Luck boost for ${fineTuneSpins} spins.`, "win");
  tryVibrate([12, 40, 12]);
  beep({ freq: 420, dur: 0.08, type: "sine", gain: 0.06 });
  beep({ freq: 840, dur: 0.06, type: "sine", gain: 0.05 });
}

function doSellData() {
  if (isSpinning) return;
  const ok = window.confirm(
    "Sell your data for tokens?\n\n- You get +20 TOK\n- Telemetry increases (future spins cost more)\n\nThis is fine."
  );
  if (!ok) return;

  state.balance += sellDataGrant;
  state.telemetryLevel = clampInt(state.telemetryLevel + 1, 0, 999);
  saveState();
  renderHUD();
  setMessage("Thank you for your trust. We have monetized it.", "lose");
  tryVibrate([15, 30, 15]);
  beep({ freq: 220, dur: 0.06, type: "square", gain: 0.05 });
  beep({ freq: 160, dur: 0.10, type: "square", gain: 0.05 });
}

function doReset() {
  if (isSpinning) return;
  const ok = window.confirm("Reset everything? This will delete your token balance and upgrades.");
  if (!ok) return;
  state = defaultState();
  saveState();
  setReels(state.last);
  renderPayTable();
  renderHUD();
  setMessage("Fresh start. Same incentives.", "neutral");
}

function setBet(next, { save = true, beepOn = true } = {}) {
  const bet = clampInt(next, 1, maxBet);
  if (bet === state.bet) return;
  state.bet = bet;
  if (save) saveState();
  renderPayTable();
  renderHUD();
  if (beepOn) beep({ freq: 520, dur: 0.04, type: "triangle", gain: 0.03 });
}

const shopItems = [
  {
    id: "OPT_OUT",
    name: "Telemetry Opt‑Out",
    desc: "Pay to reduce telemetry by 1 level. The future is user‑hostile.",
    cost: 45,
    canBuy: () => state.telemetryLevel > 0,
    buy: () => { state.telemetryLevel = clampInt(state.telemetryLevel - 1, 0, 999); },
  },
  {
    id: "INSURANCE",
    name: "Jackpot Insurance",
    desc: "Prevents “A/B rollback” for the next 5 spins (even with hallucinations).",
    cost: 40,
    canBuy: () => true,
    buy: () => { state.insuranceRemaining = clampInt(state.insuranceRemaining + 5, 0, 999); },
  },
  {
    id: "HOTFIX",
    name: "Hotfix Rollout",
    desc: `Adds +8 boosted spins (like fine‑tune, but with more marketing).`,
    cost: 55,
    canBuy: () => true,
    buy: () => { state.fineTuneRemaining = clampInt(state.fineTuneRemaining + 8, 0, 999); },
  },
  {
    id: "NEON",
    name: "Neon Overdrive",
    desc: "Unlocks extra glow. No performance guarantee. Plenty of vibes.",
    cost: 35,
    canBuy: () => !state.neonMode,
    buy: () => { state.neonMode = true; },
  },
];

function renderShop() {
  el.shopGrid.innerHTML = "";

  for (const item of shopItems) {
    const card = document.createElement("div");
    card.className = "shop__item";

    const name = document.createElement("div");
    name.className = "shop__name";
    name.textContent = item.name;

    const desc = document.createElement("div");
    desc.className = "shop__desc";
    desc.textContent = item.desc;

    const row = document.createElement("div");
    row.className = "shop__row";

    const price = document.createElement("div");
    price.className = "shop__price";
    price.textContent = `${formatInt(item.cost)} TOK`;

    const btn = document.createElement("button");
    btn.className = "btn";
    btn.type = "button";
    btn.dataset.item = item.id;

    const canBuy = item.canBuy();
    const enough = state.balance >= item.cost;
    const disabled = !canBuy || !enough || isSpinning;
    btn.disabled = disabled;
    let label = "Buy";
    if (!canBuy) label = item.id === "OPT_OUT" ? "Already Off" : "Owned";
    else if (!enough) label = "Need TOK";
    btn.textContent = label;

    btn.addEventListener("click", () => purchase(item.id));

    row.append(price, btn);
    card.append(name, desc, row);
    el.shopGrid.appendChild(card);
  }
}

function openShop() {
  if (isSpinning) return;
  if (!el.shopDialog) return;
  renderShop();
  sfxShop();
  try { el.shopDialog.showModal(); } catch {}
}

function purchase(id) {
  const item = shopItems.find((x) => x.id === id);
  if (!item) return;
  if (isSpinning) return;
  if (!item.canBuy()) return;
  if (state.balance < item.cost) {
    setMessage("Not enough TOK. Consider selling your data. Again.", "bad");
    sfxLose();
    return;
  }

  state.balance -= item.cost;
  item.buy();
  saveState();
  renderPayTable();
  renderHUD();
  renderShop();

  setMessage(`Purchased: ${item.name}.`, "win");
  sfxShop();
  tryVibrate([12, 30, 12]);
}

function wireUI() {
  el.spinBtn.addEventListener("click", doSpin);
  el.fineTuneBtn.addEventListener("click", doFineTune);
  el.sellDataBtn.addEventListener("click", doSellData);
  el.shopBtn.addEventListener("click", openShop);
  el.resetBtn.addEventListener("click", doReset);

  el.betRange.addEventListener("input", () => setBet(el.betRange.value, { save: false, beepOn: false }));
  el.betRange.addEventListener("change", () => setBet(el.betRange.value, { save: true, beepOn: true }));
  el.betNumber.addEventListener("input", () => setBet(el.betNumber.value, { save: false, beepOn: false }));
  el.betNumber.addEventListener("change", () => setBet(el.betNumber.value, { save: true, beepOn: true }));

  // Keyboard: space/enter spins, unless focused inside a control.
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.key !== " " && e.key !== "Enter") return;
    const tag = document.activeElement?.tagName?.toLowerCase();
    const isControl = tag === "button" || tag === "input" || tag === "a" || tag === "textarea" || tag === "select";
    if (isControl) return;
    e.preventDefault();
    doSpin();
  });

  el.soundToggle.addEventListener("change", () => {
    state.soundOn = !!el.soundToggle.checked;
    saveState();
    renderHUD();
    if (state.soundOn) {
      // Prime audio context on user gesture.
      const ctx = getAudio();
      try { ctx?.resume?.(); } catch {}
      setMasterVolume();
      beep({ freq: 440, dur: 0.05, type: "sine", gain: 0.05 });
      setMessage("Sound on. Your mistakes now have audio.", "neutral");
    } else {
      setMessage("Sound off. Silent failures, classic.", "neutral");
    }
  });

  el.volume.addEventListener("input", () => {
    state.volume = clampInt(Number(el.volume.value), 0, 100);
    setMasterVolume();
    renderHUD();
  });
  el.volume.addEventListener("change", () => {
    state.volume = clampInt(Number(el.volume.value), 0, 100);
    saveState();
    setMasterVolume();
    renderHUD();
  });

  el.hapticsToggle.addEventListener("change", () => {
    state.hapticsOn = !!el.hapticsToggle.checked;
    saveState();
    renderHUD();
    setMessage(state.hapticsOn ? "Haptics on." : "Haptics off.", "neutral");
    if (state.hapticsOn) tryVibrate([10]);
  });

  el.reducedMotionToggle.addEventListener("change", () => {
    state.reducedMotion = !!el.reducedMotionToggle.checked;
    saveState();
    renderHUD();
    setMessage(state.reducedMotion ? "Reduced motion enabled." : "Reduced motion disabled.", "neutral");
    if (state.reducedMotion) {
      bgField?.clear?.();
    } else {
      bgField?.resize?.();
      bgField?.start?.();
    }
  });

  el.shopDialog?.addEventListener?.("close", () => {
    renderHUD();
  });
}

function boot() {
  renderPayTable();
  wireUI();
  setReels(state.last);
  renderHUD();

  fireworks = createFireworks(el.fxCanvas);
  fireworks?.resize?.();
  bgField = createBackgroundField(el.bgCanvas);
  bgField?.resize?.();
  window.addEventListener("resize", () => {
    fireworks?.resize?.();
    bgField?.resize?.();
  });
  window.addEventListener("pointermove", (e) => {
    bgField?.pointer?.(e.clientX, e.clientY);
  }, { passive: true });
  window.addEventListener("pointerdown", (e) => {
    bgField?.click?.(e.clientX, e.clientY);
  }, { passive: true });

  requestAnimationFrame(() => document.body.classList.add("is-loaded"));

  const intro = state.telemetryLevel > 0
    ? "Welcome back. We remembered you. Obviously."
    : "Welcome. No telemetry. Yet.";
  setMessage(intro, "neutral");
}

boot();


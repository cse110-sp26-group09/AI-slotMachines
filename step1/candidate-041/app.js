/* Slot machine: localStorage state, simple reel animation, and optional Web Audio. */

const STORAGE_KEY = "token-casino.v1";

const symbols = [
  { id: "TOKEN", label: "TOKEN", weight: 38, triple: 24 },
  { id: "PROMPT", label: "PROMPT", weight: 24, triple: 40 },
  { id: "GPU", label: "GPU", weight: 16, triple: 65 },
  { id: "AGENT", label: "AGENT", weight: 10, triple: 90 },
  { id: "MODEL", label: "MODEL", weight: 8, triple: 130 },
  { id: "HALLUCINATION", label: "HALLUCINATION", weight: 4, triple: 0 },
];

const baseSpinCost = 5;
const fineTuneCost = 30;
const fineTuneSpins = 5;
const sellDataGrant = 20;

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
    telemetryLevel: 0,
    fineTuneRemaining: 0,
    soundOn: false,
    reducedMotion: prefersReducedMotion,
    last: ["TOKEN", "TOKEN", "TOKEN"],
  };
}

let state = { ...defaultState(), ...(loadState() ?? {}) };

function spinCost() {
  // Telemetry makes everything more expensive. For user benefit, of course.
  return baseSpinCost + clampInt(state.telemetryLevel, 0, 999);
}

function setMessage(text, kind = "neutral") {
  el.message.textContent = text;
  el.message.classList.remove("is-win", "is-lose", "is-bad");
  if (kind === "win") el.message.classList.add("is-win");
  if (kind === "lose") el.message.classList.add("is-lose");
  if (kind === "bad") el.message.classList.add("is-bad");
}

function setReels(ids) {
  const map = new Map(symbols.map((s) => [s.id, s.label]));
  el.sym0.textContent = map.get(ids[0]) ?? ids[0];
  el.sym1.textContent = map.get(ids[1]) ?? ids[1];
  el.sym2.textContent = map.get(ids[2]) ?? ids[2];
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
    right.textContent = s.triple === 0 ? "0 TOK" : `+${s.triple} TOK`;
    li.append(left, right);
    el.payTable.appendChild(li);
  }
}

function renderHUD() {
  el.balance.textContent = formatInt(state.balance);
  el.spinCost.textContent = formatInt(spinCost());
  el.telemetry.textContent = telemetryLabel();
  el.fineTuneCost.textContent = formatInt(fineTuneCost);
  el.spinMeta.textContent = `cost ${formatInt(spinCost())} TOK`;
  el.sessionStats.textContent = `${formatInt(state.spins)} spins`;

  el.soundToggle.checked = !!state.soundOn;
  el.reducedMotionToggle.checked = !!state.reducedMotion;

  const canSpin = !isSpinning && state.balance >= spinCost();
  el.spinBtn.disabled = !canSpin;
  el.fineTuneBtn.disabled = isSpinning || state.balance < fineTuneCost;
  el.sellDataBtn.disabled = isSpinning;
  el.resetBtn.disabled = isSpinning;
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
  const sa = byId.get(a);
  const sb = byId.get(b);
  const sc = byId.get(c);

  const hasHall = a === "HALLUCINATION" || b === "HALLUCINATION" || c === "HALLUCINATION";
  const allSame = a === b && b === c;
  const anyTwo = a === b || a === c || b === c;

  if (allSame) {
    if (a === "HALLUCINATION") return { win: 0, kind: "bad", msg: "3× HALLUCINATION: bold claim. zero citations. payout: vibes." };
    const triple = byId.get(a)?.triple ?? 0;
    return { win: triple, kind: "win", msg: `JACKPOT: 3× ${a}. minted +${triple} TOK out of thin air.` };
  }

  if (anyTwo) {
    // Small “confidence bonus”: 10% of that symbol’s triple payout.
    const paired = a === b ? a : a === c ? a : b;
    const base = byId.get(paired)?.triple ?? 0;
    const win = Math.max(1, Math.floor(base * 0.10));
    const msg = hasHall
      ? `2× ${paired}: confidence bonus +${win} TOK. also detected hallucination drift.`
      : `2× ${paired}: confidence bonus +${win} TOK.`;
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

let audioCtx = null;
function getAudio() {
  if (!state.soundOn) return null;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function beep({ freq = 440, dur = 0.06, type = "square", gain = 0.06 } = {}) {
  const ctx = getAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + dur);
}

function winChord() {
  beep({ freq: 523.25, dur: 0.08, type: "triangle", gain: 0.07 });
  setTimeout(() => beep({ freq: 659.25, dur: 0.08, type: "triangle", gain: 0.07 }), 80);
  setTimeout(() => beep({ freq: 783.99, dur: 0.10, type: "triangle", gain: 0.07 }), 160);
}

function tick() {
  beep({ freq: 180 + Math.random() * 60, dur: 0.03, type: "square", gain: 0.045 });
}

function setSpinning(on) {
  for (const r of [el.reel0, el.reel1, el.reel2]) {
    r.classList.toggle("is-spinning", on);
  }
}

let isSpinning = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function spinOneReel(index, outIds) {
  const reelEl = index === 0 ? el.sym0 : index === 1 ? el.sym1 : el.sym2;
  const minTicks = state.reducedMotion ? 8 : 18;
  const extraTicks = state.reducedMotion ? 6 : 18;
  const totalTicks = minTicks + Math.floor(Math.random() * extraTicks);
  let delay = state.reducedMotion ? 55 : 45;

  for (let i = 0; i < totalTicks; i++) {
    const s = chooseWeightedSymbol();
    reelEl.textContent = s.label;
    if (i % 2 === 0) tick();
    await sleep(delay);
    delay = Math.min(delay + (state.reducedMotion ? 4 : 6), state.reducedMotion ? 95 : 140);
  }

  const final = chooseWeightedSymbol();
  reelEl.textContent = final.label;
  outIds[index] = final.id;
}

async function doSpin() {
  if (isSpinning) return;
  const cost = spinCost();
  if (state.balance < cost) {
    setMessage("Insufficient tokens. Try selling your data. The house accepts privacy.", "bad");
    renderHUD();
    return;
  }

  isSpinning = true;
  renderHUD();

  state.balance -= cost;
  state.spins = clampInt(state.spins + 1, 0, 1_000_000_000);
  saveState();
  renderHUD();

  setSpinning(true);
  setMessage("Thinking… generating… definitely not gambling…", "neutral");

  const out = ["TOKEN", "TOKEN", "TOKEN"];

  // Stagger reels a bit for a more slot-like feel.
  await Promise.all([
    spinOneReel(0, out),
    (async () => {
      await sleep(state.reducedMotion ? 60 : 110);
      await spinOneReel(1, out);
    })(),
    (async () => {
      await sleep(state.reducedMotion ? 110 : 210);
      await spinOneReel(2, out);
    })(),
  ]);

  setSpinning(false);

  const result = payoutFor(out);

  // “Production incident”: tiny chance to invert a good outcome when hallucination is involved.
  const hasHall = out.includes("HALLUCINATION");
  if (hasHall && result.win > 0 && Math.random() < 0.18) {
    setMessage("A/B test says you didn’t like that win. rolling back. payout: 0 TOK.", "bad");
  } else {
    if (result.win > 0) state.balance += result.win;
    setMessage(result.msg, result.kind);
  }

  if (state.fineTuneRemaining > 0) state.fineTuneRemaining -= 1;
  state.last = out;
  saveState();

  if (result.win > 0) winChord();
  isSpinning = false;
  renderHUD();

  // Optional tactile feedback on supported devices.
  if ("vibrate" in navigator) {
    const pattern = result.win > 0 ? [15, 40, 15] : [10];
    try { navigator.vibrate(pattern); } catch {}
  }
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

function wireUI() {
  el.spinBtn.addEventListener("click", doSpin);
  el.fineTuneBtn.addEventListener("click", doFineTune);
  el.sellDataBtn.addEventListener("click", doSellData);
  el.resetBtn.addEventListener("click", doReset);

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
      getAudio();
      beep({ freq: 440, dur: 0.05, type: "sine", gain: 0.05 });
      setMessage("Sound on. Your mistakes now have audio.", "neutral");
    } else {
      setMessage("Sound off. Silent failures, classic.", "neutral");
    }
  });

  el.reducedMotionToggle.addEventListener("change", () => {
    state.reducedMotion = !!el.reducedMotionToggle.checked;
    saveState();
    renderHUD();
    setMessage(state.reducedMotion ? "Reduced motion enabled." : "Reduced motion disabled.", "neutral");
  });
}

function boot() {
  renderPayTable();
  wireUI();
  setReels(state.last);
  renderHUD();

  const intro = state.telemetryLevel > 0
    ? "Welcome back. We remembered you. Obviously."
    : "Welcome. No telemetry. Yet.";
  setMessage(intro, "neutral");
}

boot();


/* eslint-disable no-alert */

const STORAGE_KEY = "llm_slot_v1";

const DEFAULT_STATE = {
  balance: 120,
  spins: 0,
  muted: false,
  lastDailyClaimISO: null,
};

const SYMBOLS = [
  { id: "TOKENS", emoji: "💸", label: "Tokens", baseWeight: 12, threeX: 14, twoX: 3 },
  { id: "ROBOT", emoji: "🤖", label: "Robot", baseWeight: 10, threeX: 12, twoX: 2 },
  { id: "GPU", emoji: "🧊", label: "GPU Ice", baseWeight: 8, threeX: 11, twoX: 2 },
  { id: "PROMPT", emoji: "📝", label: "Prompt", baseWeight: 8, threeX: 10, twoX: 2 },
  { id: "LATENCY", emoji: "⏳", label: "Latency", baseWeight: 7, threeX: 10, twoX: 2 },
  { id: "OVERFIT", emoji: "🎯", label: "Overfit", baseWeight: 6, threeX: 12, twoX: 2 },
  { id: "BUG", emoji: "🪲", label: "Bug", baseWeight: 6, threeX: 13, twoX: 2 },
  { id: "ETHICS", emoji: "⚖️", label: "Ethics", baseWeight: 5, threeX: 15, twoX: 3 },
  { id: "HALLUCINATION", emoji: "🧠", label: "Hallucination", baseWeight: 4, threeX: 30, twoX: 4 },
  { id: "TOS", emoji: "📜", label: "Terms", baseWeight: 2, threeX: 0, twoX: 0 },
];

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatTokens(n) {
  return Math.max(0, Math.floor(n)).toLocaleString();
}

function temperature01() {
  const t = Number(tempEl.value) / 100;
  return clamp(t, 0, 1);
}

function weightsForTemperature(t01) {
  // t=0 => base weights; t=1 => uniform (chaos)
  const uniform = 1;
  return SYMBOLS.map((s) => (1 - t01) * s.baseWeight + t01 * uniform);
}

function pickWeighted(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function symbolForSpin() {
  const w = weightsForTemperature(temperature01());
  const idx = pickWeighted(w);
  return SYMBOLS[idx];
}

let audio = null;
function audioEnsure() {
  if (state.muted) return null;
  if (audio) return audio;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audio = new Ctx();
  return audio;
}

function beep({ freq = 440, dur = 0.06, type = "sine", gain = 0.06 } = {}) {
  const ctx = audioEnsure();
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g);
  g.connect(ctx.destination);
  const t0 = ctx.currentTime;
  o.start(t0);
  o.stop(t0 + dur);
}

function vibrate(pattern) {
  if (!("vibrate" in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

function setMsg(text, tone = "neutral") {
  msgEl.textContent = text;
  msgEl.dataset.tone = tone;
}

function setUiBusy(busy) {
  spinBtn.disabled = busy;
  maxBtn.disabled = busy;
  dailyBtn.disabled = busy;
  betEl.disabled = busy;
  tempEl.disabled = busy;
  promptEl.disabled = busy;
  resetBtn.disabled = busy;
}

function betAmount() {
  const n = Number(betEl.value);
  if (!Number.isFinite(n)) return 1;
  return clamp(Math.floor(n), 1, 999999);
}

function updateCost() {
  costEl.textContent = formatTokens(betAmount());
}

function updateTempLabel() {
  tempOut.textContent = round2(temperature01()).toFixed(2);
}

function renderPaytable() {
  const lines = [];
  lines.push(`3x 🧠 Hallucination = ${SYMBOLS.find((s) => s.id === "HALLUCINATION").threeX}× bet (confidently wrong)`);
  lines.push(`3x ⚖️ Ethics = ${SYMBOLS.find((s) => s.id === "ETHICS").threeX}× bet (rare sighting)`);
  lines.push(`Any 3x match = symbol multiplier × bet`);
  lines.push(`Any 2x match = small multiplier × bet`);
  lines.push(`Any 📜 Terms = compliance audit (fee)`);
  paytableEl.innerHTML = "";
  for (const line of lines) {
    const li = document.createElement("li");
    li.textContent = line;
    paytableEl.appendChild(li);
  }
}

function render() {
  balanceEl.textContent = formatTokens(state.balance);
  spinsEl.textContent = formatTokens(state.spins);
  updateCost();
  updateTempLabel();
  muteBtn.textContent = `Sound: ${state.muted ? "Off" : "On"}`;
  muteBtn.setAttribute("aria-pressed", String(state.muted));

  spinBtn.disabled = state.balance < betAmount() || spinLock;
  maxBtn.disabled = state.balance <= 0 || spinLock;
  dailyBtn.disabled = spinLock;
}

function resetState() {
  state = { ...DEFAULT_STATE };
  saveState(state);
  setMsg("State reset. Fresh start. Same delusions.", "neutral");
  render();
}

function canClaimDaily() {
  const last = state.lastDailyClaimISO;
  if (!last) return true;
  return last !== todayKey();
}

function claimDaily() {
  if (!canClaimDaily()) {
    setMsg("Daily tokens already claimed. Come back after the next timezone controversy.", "warn");
    beep({ freq: 220, dur: 0.07, type: "square", gain: 0.04 });
    return;
  }
  const grant = 60;
  state.balance += grant;
  state.lastDailyClaimISO = todayKey();
  saveState(state);
  setMsg(`Daily grant: +${grant} tokens. Please clap for the growth chart.`, "ok");
  beep({ freq: 660, dur: 0.06, type: "triangle", gain: 0.055 });
  beep({ freq: 880, dur: 0.08, type: "triangle", gain: 0.05 });
  vibrate([20, 30, 20]);
  render();
}

let spinLock = false;
let state = loadState();

function reelEls() {
  return [reel0, reel1, reel2];
}

function reelContainers() {
  return Array.from(document.querySelectorAll(".reel"));
}

function animateReel({ reelEl, containerEl, finalSymbol, ms }) {
  return new Promise((resolve) => {
    const start = performance.now();
    containerEl.classList.add("spinning");
    const tick = () => {
      const now = performance.now();
      if (now - start >= ms) {
        reelEl.textContent = finalSymbol.emoji;
        containerEl.classList.remove("spinning");
        resolve();
        return;
      }
      reelEl.textContent = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].emoji;
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function payoutFor(symbolA, symbolB, symbolC, bet) {
  const ids = [symbolA.id, symbolB.id, symbolC.id];

  if (ids.includes("TOS")) {
    const auditFee = Math.max(2, Math.floor(bet * 1.2));
    return { delta: -auditFee, msg: `📜 Compliance audit: -${auditFee} tokens. You agreed to this (you didn't read it).`, tone: "warn" };
  }

  const counts = new Map();
  for (const s of [symbolA, symbolB, symbolC]) counts.set(s.id, (counts.get(s.id) || 0) + 1);

  let bestId = null;
  let bestCount = 0;
  for (const [id, count] of counts.entries()) {
    if (count > bestCount) {
      bestCount = count;
      bestId = id;
    }
  }
  const bestSymbol = SYMBOLS.find((s) => s.id === bestId);

  if (bestCount === 3) {
    const mult = bestSymbol.threeX || 0;
    if (bestSymbol.id === "HALLUCINATION") {
      return { delta: bet * mult, msg: `🧠 JACKPOT: Confidently Wrong! +${bet * mult} tokens.`, tone: "ok", big: true };
    }
    return { delta: bet * mult, msg: `${bestSymbol.emoji} 3× ${bestSymbol.label}: +${bet * mult} tokens.`, tone: "ok", big: mult >= 15 };
  }

  if (bestCount === 2) {
    const mult = bestSymbol.twoX || 0;
    if (mult <= 0) return { delta: 0, msg: "Two-of-a-kind, but the optimizer says: no reward.", tone: "neutral" };
    return { delta: bet * mult, msg: `${bestSymbol.emoji} 2× ${bestSymbol.label}: +${bet * mult} tokens (minor dopamine).`, tone: "ok" };
  }

  return { delta: 0, msg: "No match. Consider adding more context (and tokens).", tone: "neutral" };
}

function fxResize() {
  const rect = fxCanvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  fxCanvas.width = Math.floor(rect.width * dpr);
  fxCanvas.height = Math.floor(rect.height * dpr);
  fxCanvas.dataset.dpr = String(dpr);
}

function confettiBurst(intensity = 90) {
  const ctx = fxCanvas.getContext("2d");
  if (!ctx) return;
  fxResize();
  const dpr = Number(fxCanvas.dataset.dpr || "1");
  const w = fxCanvas.width;
  const h = fxCanvas.height;

  const colors = ["#22d3ee", "#7c3aed", "#34d399", "#fbbf24", "#fb7185"];
  const parts = [];
  const centerX = w * 0.5;
  const centerY = h * 0.25;

  for (let i = 0; i < intensity; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (1.5 + Math.random() * 5.2) * dpr;
    parts.push({
      x: centerX,
      y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2.5 * dpr,
      g: 0.12 * dpr,
      r: (2 + Math.random() * 4) * dpr,
      c: colors[Math.floor(Math.random() * colors.length)],
      life: 60 + Math.floor(Math.random() * 30),
    });
  }

  fxCanvas.classList.add("on");
  let frame = 0;
  const tick = () => {
    frame += 1;
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.g;
      p.life -= 1;
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x, p.y, p.r, p.r);
    }
    if (frame < 90 && parts.some((p) => p.life > 0 && p.y < h + 20 * dpr)) {
      requestAnimationFrame(tick);
    } else {
      fxCanvas.classList.remove("on");
      ctx.clearRect(0, 0, w, h);
    }
  };
  tick();
}

async function spin() {
  if (spinLock) return;
  const bet = betAmount();
  if (state.balance < bet) {
    setMsg("Insufficient tokens. Try daily tokens or sell an AI course.", "warn");
    beep({ freq: 180, dur: 0.08, type: "square", gain: 0.04 });
    return;
  }

  spinLock = true;
  setUiBusy(true);

  state.balance -= bet;
  state.spins += 1;
  saveState(state);
  render();

  const final = [symbolForSpin(), symbolForSpin(), symbolForSpin()];
  const reels = reelEls();
  const containers = reelContainers();

  setMsg("Sampling... please wait while we reinvent randomness.", "neutral");
  beep({ freq: 520, dur: 0.04, type: "sine", gain: 0.04 });
  vibrate(15);

  await Promise.all([
    animateReel({ reelEl: reels[0], containerEl: containers[0], finalSymbol: final[0], ms: 650 }),
    animateReel({ reelEl: reels[1], containerEl: containers[1], finalSymbol: final[1], ms: 850 }),
    animateReel({ reelEl: reels[2], containerEl: containers[2], finalSymbol: final[2], ms: 1050 }),
  ]);

  const outcome = payoutFor(final[0], final[1], final[2], bet);
  state.balance = Math.max(0, state.balance + outcome.delta);
  saveState(state);

  setMsg(outcome.msg, outcome.tone);
  if (outcome.delta > 0) {
    beep({ freq: 660, dur: 0.06, type: "triangle", gain: 0.055 });
    beep({ freq: 880, dur: 0.08, type: "triangle", gain: 0.05 });
    vibrate(outcome.big ? [30, 40, 30, 60, 30] : [25, 30, 25]);
  } else if (outcome.delta < 0) {
    beep({ freq: 150, dur: 0.09, type: "square", gain: 0.04 });
    vibrate([18, 22, 18]);
  } else {
    beep({ freq: 320, dur: 0.04, type: "sine", gain: 0.035 });
  }

  if (outcome.big) confettiBurst(120);

  spinLock = false;
  setUiBusy(false);
  render();
}

async function share() {
  const bet = betAmount();
  const text = `I am playing LLM Slot Machine. Balance: ${formatTokens(state.balance)} tokens. Bet: ${formatTokens(
    bet,
  )}. Temperature: ${round2(temperature01()).toFixed(2)}.`;

  if (navigator.share) {
    try {
      await navigator.share({ title: "LLM Slot Machine", text });
      setMsg("Shared. Your followers will respect you less. Great job.", "neutral");
      return;
    } catch {
      // fall back to clipboard
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg("Copied brag text to clipboard. Paste responsibly.", "neutral");
      beep({ freq: 700, dur: 0.045, type: "sine", gain: 0.04 });
      return;
    } catch {
      // ignore
    }
  }

  alert(text);
}

function maxBet() {
  betEl.value = String(Math.max(1, state.balance));
  updateCost();
  render();
}

function toggleMute() {
  state.muted = !state.muted;
  if (!state.muted) beep({ freq: 520, dur: 0.05, type: "sine", gain: 0.04 });
  saveState(state);
  render();
}

// Elements
const balanceEl = document.getElementById("balanceEl");
const costEl = document.getElementById("costEl");
const spinsEl = document.getElementById("spinsEl");
const msgEl = document.getElementById("msgEl");
const betEl = document.getElementById("betEl");
const maxBtn = document.getElementById("maxBtn");
const tempEl = document.getElementById("tempEl");
const tempOut = document.getElementById("tempOut");
const promptEl = document.getElementById("promptEl");
const spinBtn = document.getElementById("spinBtn");
const dailyBtn = document.getElementById("dailyBtn");
const resetBtn = document.getElementById("resetBtn");
const muteBtn = document.getElementById("muteBtn");
const shareBtn = document.getElementById("shareBtn");
const paytableEl = document.getElementById("paytableEl");
const fxCanvas = document.getElementById("fxCanvas");
const reel0 = document.getElementById("reel0");
const reel1 = document.getElementById("reel1");
const reel2 = document.getElementById("reel2");

function init() {
  renderPaytable();
  updateCost();
  updateTempLabel();

  betEl.addEventListener("input", () => {
    updateCost();
    render();
  });
  tempEl.addEventListener("input", () => {
    updateTempLabel();
    render();
  });
  maxBtn.addEventListener("click", maxBet);
  dailyBtn.addEventListener("click", claimDaily);
  spinBtn.addEventListener("click", spin);
  resetBtn.addEventListener("click", () => {
    const ok = confirm("Reset balance and stats?");
    if (!ok) return;
    resetState();
  });
  muteBtn.addEventListener("click", toggleMute);
  shareBtn.addEventListener("click", share);

  window.addEventListener("resize", () => fxResize());
  fxResize();

  if (state.balance <= 0) {
    setMsg("Welcome back. The house always wins (the house is compute).", "neutral");
  } else if (canClaimDaily()) {
    setMsg("Welcome. Daily tokens available. This is how they get you.", "neutral");
  } else {
    setMsg("Welcome. Spend tokens to experience approximate joy.", "neutral");
  }

  render();
}

init();


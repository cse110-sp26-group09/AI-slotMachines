/* eslint-disable no-console */

const STORAGE_KEY = "ai_slot_machine_v1";

const SYMBOLS = [
  { key: "TOKEN", label: "TOKEN", weight: 14, triple: 24, pair: 4 },
  { key: "GPU", label: "GPU", weight: 9, triple: 60, pair: 8 },
  { key: "PROMPT", label: "PROMPT", weight: 12, triple: 30, pair: 5 },
  { key: "LATENCY", label: "LATENCY", weight: 10, triple: 26, pair: 4 },
  { key: "RAG", label: "RAG", weight: 9, triple: 44, pair: 6 },
  { key: "EVAL", label: "EVAL", weight: 8, triple: 52, pair: 7 },
  { key: "HALLUCINATE", label: "HALLU", weight: 6, triple: 90, pair: 10 },
  { key: "404", label: "404", weight: 7, triple: 70, pair: 9 },
  { key: "JAILBREAK", label: "JAIL", weight: 5, triple: 120, pair: 12 },
  { key: "GOLD", label: "GOLD", weight: 3, triple: 200, pair: 18 },
];

const DEFAULT_STATE = {
  tokens: 120,
  modelLevel: 1,
  bailouts: 0,
  settings: {
    audio: true,
    vibrate: true,
    hallucination: false,
  },
};

function deepClone(obj) {
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatInt(n) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

function computeMultiplier(modelLevel) {
  // The “upgrade” mostly boosts payouts. It also boosts ego.
  return 1 + (modelLevel - 1) * 0.12;
}

function computeSpinCost(bailouts) {
  // VC “help” makes future spins more expensive. Of course it does.
  return 5 + bailouts;
}

function computeUpgradeCost(modelLevel) {
  return 55 + (modelLevel - 1) * 45;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return deepClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return {
      ...deepClone(DEFAULT_STATE),
      ...parsed,
      settings: { ...deepClone(DEFAULT_STATE.settings), ...(parsed.settings || {}) },
    };
  } catch {
    return deepClone(DEFAULT_STATE);
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function pickWeightedSymbol() {
  const total = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
  let r = Math.random() * total;
  for (const s of SYMBOLS) {
    r -= s.weight;
    if (r <= 0) return s;
  }
  return SYMBOLS[SYMBOLS.length - 1];
}

function scoreSpin(symbols) {
  const keys = symbols.map((s) => s.key);
  const [a, b, c] = keys;
  const allSame = a === b && b === c;
  const anyPair = a === b || a === c || b === c;

  const counts = new Map();
  for (const k of keys) counts.set(k, (counts.get(k) || 0) + 1);
  const best = [...counts.entries()].sort((x, y) => y[1] - x[1])[0];

  if (allSame) {
    const sym = SYMBOLS.find((s) => s.key === a);
    return { payout: sym.triple, kind: "triple", key: a };
  }
  if (anyPair) {
    const sym = SYMBOLS.find((s) => s.key === best[0]);
    return { payout: sym.pair, kind: "pair", key: best[0] };
  }
  return { payout: 0, kind: "miss", key: null };
}

function setMessage(el, text, tone = "neutral") {
  el.textContent = text;
  el.dataset.tone = tone;
}

function confidenceForOutcome({ kind }, hallucination) {
  // “Confidence” is a UI performance, not a metric.
  let base =
    kind === "triple" ? 0.98 : kind === "pair" ? 0.83 : 0.62 + Math.random() * 0.1;
  if (hallucination) base = clamp(base + 0.22 + Math.random() * 0.12, 0.7, 0.999);
  return clamp(base, 0.05, 0.999);
}

function describeOutcome({ kind, payout }, multiplier) {
  if (kind === "triple") {
    return `Three of a kind. The model calls this “generalization.” You win ${formatInt(
      Math.floor(payout * multiplier),
    )} tokens.`;
  }
  if (kind === "pair") {
    return `A pair! The model says it’s “statistically significant.” You win ${formatInt(
      Math.floor(payout * multiplier),
    )} tokens.`;
  }
  return "No match. The model suggests you try a better prompt (paid feature).";
}

function canVibrate() {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

function vibrate(pattern) {
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

function createAudio() {
  let ctx = null;
  function ensure() {
    if (ctx) return ctx;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    ctx = new AudioContext();
    return ctx;
  }

  function tone(freq, durationMs, type = "sine", gainValue = 0.03) {
    const c = ensure();
    if (!c) return;
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.02);
  }

  return {
    click() {
      tone(420, 55, "square", 0.022);
    },
    tick(i) {
      const f = 620 + i * 35;
      tone(f, 38, "triangle", 0.018);
    },
    winBig() {
      tone(523.25, 90, "sine", 0.03);
      setTimeout(() => tone(659.25, 90, "sine", 0.03), 95);
      setTimeout(() => tone(783.99, 120, "sine", 0.03), 190);
    },
    winSmall() {
      tone(660, 70, "sine", 0.026);
      setTimeout(() => tone(880, 95, "sine", 0.024), 90);
    },
    lose() {
      tone(180, 120, "sawtooth", 0.02);
    },
  };
}

function renderPayouts(gridEl) {
  gridEl.innerHTML = "";
  const sorted = [...SYMBOLS].sort((a, b) => b.triple - a.triple);
  for (const s of sorted) {
    const row = document.createElement("div");
    row.className = "payoutRow";
    const left = document.createElement("div");
    left.className = "left";
    left.textContent = `${s.label} ×3 / ×2`;
    const right = document.createElement("div");
    right.className = "right";
    right.textContent = `${s.triple} / ${s.pair}`;
    row.append(left, right);
    gridEl.append(row);
  }
}

function main() {
  const tokensValue = document.getElementById("tokensValue");
  const spinCostValue = document.getElementById("spinCostValue");
  const modelLevelValue = document.getElementById("modelLevelValue");
  const multiplierValue = document.getElementById("multiplierValue");
  const confidenceValue = document.getElementById("confidenceValue");
  const confidenceFill = document.getElementById("confidenceFill");

  const reels = [
    document.getElementById("reel0"),
    document.getElementById("reel1"),
    document.getElementById("reel2"),
  ];
  const reelWraps = reels.map((el) => el.closest(".reel"));

  const spinBtn = document.getElementById("spinBtn");
  const upgradeBtn = document.getElementById("upgradeBtn");
  const bailoutBtn = document.getElementById("bailoutBtn");
  const resetBtn = document.getElementById("resetBtn");
  const message = document.getElementById("message");
  const payoutGrid = document.getElementById("payoutGrid");

  const audioToggle = document.getElementById("audioToggle");
  const vibrateToggle = document.getElementById("vibrateToggle");
  const hallucinationToggle = document.getElementById("hallucinationToggle");

  const audio = createAudio();
  let state = loadState();
  let spinning = false;
  let intervals = [];

  renderPayouts(payoutGrid);

  function setConfidence(frac) {
    const pct = Math.round(frac * 1000) / 10;
    confidenceValue.textContent = `${pct.toFixed(1)}%`;
    confidenceFill.style.width = `${clamp(frac, 0, 1) * 100}%`;
  }

  function syncToggles() {
    audioToggle.checked = !!state.settings.audio;
    vibrateToggle.checked = !!state.settings.vibrate;
    hallucinationToggle.checked = !!state.settings.hallucination;
  }

  function syncUI() {
    const cost = computeSpinCost(state.bailouts);
    const mult = computeMultiplier(state.modelLevel);

    tokensValue.textContent = formatInt(state.tokens);
    spinCostValue.textContent = `${formatInt(cost)} token${cost === 1 ? "" : "s"}`;
    modelLevelValue.textContent = `L${state.modelLevel}`;
    multiplierValue.textContent = `×${mult.toFixed(2)}`;

    const upgradeCost = computeUpgradeCost(state.modelLevel);
    upgradeBtn.textContent =
      state.modelLevel >= 7 ? "Model maxed" : `Upgrade (${formatInt(upgradeCost)} tokens)`;
    upgradeBtn.disabled = spinning || state.modelLevel >= 7 || state.tokens < upgradeCost;

    bailoutBtn.disabled = spinning;
    resetBtn.disabled = spinning;

    spinBtn.disabled = spinning || state.tokens < cost;
    spinBtn.textContent = spinning ? "Spinning…" : `Spin (pay ${formatInt(cost)})`;

    const vibSupported = canVibrate();
    vibrateToggle.closest(".toggle").style.opacity = vibSupported ? "1" : "0.55";
    vibrateToggle.disabled = !vibSupported;
  }

  function persist() {
    saveState(state);
  }

  function setSymbolsNow(symbols) {
    for (let i = 0; i < reels.length; i++) reels[i].textContent = symbols[i].label;
  }

  function stopSpinIntervals() {
    for (const id of intervals) clearInterval(id);
    intervals = [];
    for (const wrap of reelWraps) wrap.classList.remove("spinning");
  }

  function spinVisual(finalSymbols, onDone) {
    stopSpinIntervals();
    for (const wrap of reelWraps) wrap.classList.add("spinning");

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const durations = reducedMotion ? [240, 330, 420] : [650, 900, 1150];

    for (let i = 0; i < reels.length; i++) {
      const reelEl = reels[i];
      intervals[i] = setInterval(() => {
        reelEl.textContent = pickWeightedSymbol().label;
        if (state.settings.audio) audio.tick(i);
      }, reducedMotion ? 90 : 65);

      setTimeout(() => {
        clearInterval(intervals[i]);
        reelEl.textContent = finalSymbols[i].label;
        reelWraps[i].classList.remove("spinning");
        if (state.settings.audio) audio.click();
        if (state.settings.vibrate) vibrate([10]);
        if (i === reels.length - 1) onDone();
      }, durations[i]);
    }
  }

  function doSpin() {
    if (spinning) return;
    const cost = computeSpinCost(state.bailouts);
    if (state.tokens < cost) {
      setMessage(message, "Out of tokens. The model suggests: “increase budget.”", "warn");
      return;
    }

    spinning = true;
    syncUI();

    state.tokens -= cost;
    persist();
    syncUI();

    // Pick outcome now so it’s consistent with the “confidence” theater.
    const symbols = [pickWeightedSymbol(), pickWeightedSymbol(), pickWeightedSymbol()];
    const result = scoreSpin(symbols);

    // Confidence meter: mostly vibes.
    const confidence = confidenceForOutcome(result, state.settings.hallucination);
    setConfidence(confidence);

    spinVisual(symbols, () => {
      const mult = computeMultiplier(state.modelLevel);
      const payout = Math.floor(result.payout * mult);
      state.tokens += payout;
      persist();

      if (result.kind === "triple") {
        setMessage(message, describeOutcome(result, mult), "ok");
        if (state.settings.audio) audio.winBig();
        if (state.settings.vibrate) vibrate([25, 40, 30]);
      } else if (result.kind === "pair") {
        setMessage(message, describeOutcome(result, mult), "ok");
        if (state.settings.audio) audio.winSmall();
        if (state.settings.vibrate) vibrate([15, 30, 15]);
      } else {
        setMessage(message, describeOutcome(result, mult), "neutral");
        if (state.settings.audio) audio.lose();
        if (state.settings.vibrate) vibrate([8]);
      }

      spinning = false;
      syncUI();
    });
  }

  function doUpgrade() {
    if (spinning) return;
    if (state.modelLevel >= 7) return;
    const cost = computeUpgradeCost(state.modelLevel);
    if (state.tokens < cost) return;

    state.tokens -= cost;
    state.modelLevel += 1;
    persist();

    const mult = computeMultiplier(state.modelLevel);
    setMessage(
      message,
      `Upgraded to L${state.modelLevel}. Payout multiplier is now ×${mult.toFixed(
        2,
      )}. Latency may be imaginary.`,
      "ok",
    );
    if (state.settings.audio) audio.winSmall();
    if (state.settings.vibrate) vibrate([12, 24, 12]);
    syncUI();
  }

  function doBailout() {
    if (spinning) return;
    const grant = 90 + state.bailouts * 20;
    state.tokens += grant;
    state.bailouts += 1;
    persist();
    setMessage(
      message,
      `VC bailout approved. +${formatInt(grant)} tokens. New spin cost: ${formatInt(
        computeSpinCost(state.bailouts),
      )}. Term sheet included (invisible ink).`,
      "warn",
    );
    if (state.settings.audio) audio.click();
    if (state.settings.vibrate) vibrate([20, 30, 20]);
    syncUI();
  }

  function doReset() {
    if (spinning) return;
    state = deepClone(DEFAULT_STATE);
    persist();
    setSymbolsNow([SYMBOLS[0], SYMBOLS[1], SYMBOLS[2]]);
    setConfidence(0.72);
    syncToggles();
    setMessage(message, "Reset complete. The model forgot everything (on purpose).", "neutral");
    syncUI();
  }

  audioToggle.addEventListener("change", () => {
    state.settings.audio = !!audioToggle.checked;
    persist();
    syncUI();
  });
  vibrateToggle.addEventListener("change", () => {
    state.settings.vibrate = !!vibrateToggle.checked;
    persist();
    syncUI();
  });
  hallucinationToggle.addEventListener("change", () => {
    state.settings.hallucination = !!hallucinationToggle.checked;
    persist();
    setMessage(
      message,
      state.settings.hallucination
        ? "Hallucination mode enabled: confidence +25%, accuracy unchanged."
        : "Hallucination mode disabled: confidence returns to baseline vibes.",
      "neutral",
    );
    syncUI();
  });

  spinBtn.addEventListener("click", doSpin);
  upgradeBtn.addEventListener("click", doUpgrade);
  bailoutBtn.addEventListener("click", doBailout);
  resetBtn.addEventListener("click", doReset);

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.key === " " || e.key === "Enter") {
      const active = document.activeElement;
      // Don’t hijack keypresses while toggles are focused.
      if (active && (active.tagName === "INPUT" || active.tagName === "BUTTON")) return;
      e.preventDefault();
      doSpin();
    }
  });

  // Boot
  syncToggles();
  setSymbolsNow([SYMBOLS[0], SYMBOLS[1], SYMBOLS[2]]);
  setConfidence(0.77);
  setMessage(message, "Ready. The model is 99.9% sure you’ll win (eventually).", "neutral");
  syncUI();
}

document.addEventListener("DOMContentLoaded", main);

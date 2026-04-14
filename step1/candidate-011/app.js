const STORAGE_KEY = "aiSlots:v1";

const clampInt = (n, min, max) => Math.max(min, Math.min(max, n | 0));
const nowMs = () => Date.now();
const todayKey = () => new Date().toISOString().slice(0, 10);

const SYMBOLS = [
  { id: "GPU", glyph: "🖥️", name: "GPU" },
  { id: "LLM", glyph: "🤖", name: "LLM" },
  { id: "PROMPT", glyph: "🧾", name: "PROMPT" },
  { id: "DATA", glyph: "🗃️", name: "DATASET" },
  { id: "SAFETY", glyph: "🛟", name: "SAFETY" },
  { id: "VC", glyph: "💸", name: "VC MONEY" },
  { id: "LATENCY", glyph: "🐢", name: "LATENCY" },
  { id: "HALLUC", glyph: "🦄", name: "HALLUCINATION" },
  { id: "AGI", glyph: "✨", name: "AGI (soon™)" },
];

const PAY_3 = {
  GPU: 20,
  LLM: 10,
  PROMPT: 6,
  DATA: 8,
  SAFETY: 4,
  VC: 14,
  LATENCY: 5,
  HALLUC: 0,
  AGI: 60,
};

const WEIGHTS_BASE = {
  GPU: 10,
  LLM: 13,
  PROMPT: 15,
  DATA: 12,
  SAFETY: 8,
  VC: 9,
  LATENCY: 12,
  HALLUC: 16,
  AGI: 1,
};

const STORE_ITEMS = [
  {
    id: "finetune",
    name: "Fine-tune the Model",
    desc: "Slightly better payouts. Slightly worse morals. Very on-brand.",
    cost: 250,
    once: false,
  },
  {
    id: "guardrails",
    name: "Add Guardrails",
    desc: "Reduces hallucination shenanigans. Increases safety vibes. Still bypassable.",
    cost: 160,
    once: true,
  },
  {
    id: "prompt101",
    name: "Prompt Engineering 101",
    desc: "Unlocks higher bets and adds a ‘Share’ button. Congratulations, you’re a consultant.",
    cost: 120,
    once: true,
  },
  {
    id: "gpumode",
    name: "Rent a GPU (1 hour)",
    desc: "Unlocks Turbo Spin (faster reels). Your tokens are now electricity.",
    cost: 500,
    once: true,
  },
];

function weightedPick(weights) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = Math.random() * total;
  for (const k in weights) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return Object.keys(weights)[0];
}

function defaultState() {
  return {
    tokens: 100,
    bet: 10,
    autoSpin: false,
    sound: true,
    haptics: false,
    reducedSnark: false,
    upgrades: {
      finetuneLevel: 0,
      guardrails: false,
      prompt101: false,
      gpumode: false,
    },
    stats: {
      spins: 0,
      wins: 0,
      biggestWin: 0,
      totalWon: 0,
      totalSpent: 0,
      lastResult: null,
    },
    daily: { lastClaimDay: null },
    meta: { lastUpdated: nowMs() },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const state = defaultState();
    return {
      ...state,
      ...parsed,
      upgrades: { ...state.upgrades, ...(parsed.upgrades || {}) },
      stats: { ...state.stats, ...(parsed.stats || {}) },
      daily: { ...state.daily, ...(parsed.daily || {}) },
      meta: { ...state.meta, ...(parsed.meta || {}) },
    };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  state.meta.lastUpdated = nowMs();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatInt(n) {
  return Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

function canVibrate() {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

function vibrate(state, pattern) {
  if (!state.haptics) return;
  if (!canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

class TinySynth {
  constructor() {
    this.ctx = null;
    this.master = null;
  }
  ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.12;
    this.master.connect(this.ctx.destination);
  }
  ping(freq, durationMs, type = "sine") {
    this.ensure();
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(this.master);
    const t0 = this.ctx.currentTime;
    const t1 = t0 + durationMs / 1000;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(1, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  }
  win() {
    this.ping(660, 90, "triangle");
    this.ping(880, 110, "triangle");
    this.ping(990, 140, "sine");
  }
  lose() {
    this.ping(220, 120, "sawtooth");
    this.ping(170, 130, "sawtooth");
  }
  tick() {
    this.ping(520, 40, "square");
  }
}

const $ = (sel) => document.querySelector(sel);

const els = {
  tokensValue: $("#tokensValue"),
  claimDailyBtn: $("#claimDailyBtn"),
  resetBtn: $("#resetBtn"),

  betSelect: $("#betSelect"),
  spinBtn: $("#spinBtn"),
  autoSpinToggle: $("#autoSpinToggle"),
  soundToggle: $("#soundToggle"),
  hapticsToggle: $("#hapticsToggle"),
  reducedSnarkToggle: $("#reducedSnarkToggle"),
  shareBtn: $("#shareBtn"),
  ticker: $("#ticker"),

  reels: [$("#reel0"), $("#reel1"), $("#reel2")],
  paytableGrid: $("#paytableGrid"),
  storeGrid: $("#storeGrid"),

  spinsValue: $("#spinsValue"),
  winsValue: $("#winsValue"),
  winRateValue: $("#winRateValue"),
  biggestWinValue: $("#biggestWinValue"),

  exportBtn: $("#exportBtn"),
  exportBox: $("#exportBox"),
  installBtn: $("#installBtn"),
};

let state = loadState();
const synth = new TinySynth();

let spinning = false;
let autoSpinTimer = null;
let keyDown = new Set();
let deferredPwaPrompt = null;

function setTicker(msg, tone = "normal") {
  els.ticker.textContent = msg;
  els.ticker.dataset.tone = tone;
}

function snark(lines) {
  if (state.reducedSnark) return lines[0];
  return lines[(Math.random() * lines.length) | 0];
}

function updateClaimButton() {
  const canClaim = state.daily.lastClaimDay !== todayKey();
  els.claimDailyBtn.disabled = !canClaim;
  els.claimDailyBtn.textContent = canClaim ? "Claim Daily 42" : "Daily Claimed";
}

function updateBetOptions() {
  const max = state.upgrades.prompt101 ? 100 : 25;
  const opts = [
    { value: 5, label: "5" },
    { value: 10, label: "10" },
    { value: 25, label: "25" },
    ...(max >= 50 ? [{ value: 50, label: "50" }] : []),
    ...(max >= 100 ? [{ value: 100, label: "100" }] : []),
  ];

  const current = clampInt(state.bet, 5, max);
  state.bet = current;

  els.betSelect.innerHTML = "";
  for (const o of opts) {
    const opt = document.createElement("option");
    opt.value = String(o.value);
    opt.textContent = o.label;
    if (o.value === current) opt.selected = true;
    els.betSelect.appendChild(opt);
  }
}

function renderPaytable() {
  els.paytableGrid.innerHTML = "";
  for (const s of SYMBOLS) {
    const mult = PAY_3[s.id];
    const item = document.createElement("div");
    item.className = "payItem";
    item.innerHTML = `
      <div class="payLeft">
        <div class="payGlyph" aria-hidden="true">${s.glyph}</div>
        <div class="payName">${s.name}</div>
      </div>
      <div class="payMult">${mult}×</div>
    `;
    els.paytableGrid.appendChild(item);
  }
}

function renderStore() {
  els.storeGrid.innerHTML = "";
  for (const item of STORE_ITEMS) {
    const owned =
      item.id === "finetune"
        ? state.upgrades.finetuneLevel > 0
        : Boolean(state.upgrades[item.id]);
    const disabled = item.once && owned;

    const card = document.createElement("div");
    card.className = "storeItem";
    const buttonText = disabled
      ? "Owned"
      : item.id === "finetune"
        ? `Upgrade (+${state.upgrades.finetuneLevel + 1})`
        : "Buy";
    card.innerHTML = `
      <div class="storeItemTop">
        <div>
          <div class="storeName">${item.name}</div>
          <div class="storeDesc">${item.desc}</div>
        </div>
        <div class="price">${formatInt(item.cost)}⟐</div>
      </div>
      <button class="btn ${disabled ? "subtle" : "primary"}" type="button" ${
        disabled ? "disabled" : ""
      } data-buy="${item.id}">
        ${buttonText}
      </button>
    `;
    els.storeGrid.appendChild(card);
  }
}

function renderStats() {
  els.tokensValue.textContent = formatInt(state.tokens);
  els.spinsValue.textContent = formatInt(state.stats.spins);
  els.winsValue.textContent = formatInt(state.stats.wins);
  const winRate = state.stats.spins ? Math.round((state.stats.wins / state.stats.spins) * 100) : 0;
  els.winRateValue.textContent = `${winRate}%`;
  els.biggestWinValue.textContent = formatInt(state.stats.biggestWin);
}

function renderToggles() {
  els.autoSpinToggle.checked = Boolean(state.autoSpin);
  els.soundToggle.checked = Boolean(state.sound);
  els.hapticsToggle.checked = Boolean(state.haptics);
  els.reducedSnarkToggle.checked = Boolean(state.reducedSnark);
}

function setReel(el, symbolId) {
  const s = SYMBOLS.find((x) => x.id === symbolId) || SYMBOLS[0];
  el.querySelector(".glyph").textContent = s.glyph;
  el.querySelector(".label").textContent = s.name;
}

function baseWeights() {
  const w = { ...WEIGHTS_BASE };
  if (state.upgrades.guardrails) {
    w.HALLUC = Math.max(4, w.HALLUC - 6);
    w.SAFETY += 3;
  }
  if (state.upgrades.gpumode) {
    w.GPU += 3;
    w.LATENCY = Math.max(4, w.LATENCY - 3);
  }
  return w;
}

function finetuneMultiplier() {
  const lvl = clampInt(state.upgrades.finetuneLevel, 0, 99);
  return 1 + (1 - Math.exp(-lvl / 6)) * 0.6;
}

function evaluateSpin(outcome, bet) {
  const [a, b, c] = outcome;
  const isTriple = a === b && b === c;
  const isDouble = a === b || a === c || b === c;

  if (outcome.includes("HALLUC")) {
    const penalty = state.upgrades.guardrails ? Math.floor(bet * 0.25) : Math.floor(bet * 0.6);
    const note = snark([
      `Hallucination detected. We confidently kept your ${formatInt(penalty)} tokens.`,
      `Model output: “You won.” Reality: “No.” (Penalty ${formatInt(penalty)}.)`,
      `It’s not wrong, it’s “creative”. Penalty: ${formatInt(penalty)} tokens.`,
    ]);
    return { payout: 0, extraDelta: -penalty, note, kind: "lose" };
  }

  if (isTriple) {
    const base = PAY_3[a] ?? 0;
    const mult = base * finetuneMultiplier();
    const payout = Math.floor(bet * mult);
    const note = snark([
      `Three ${a}s! Your tokens are now “aligned”. (+${formatInt(payout)})`,
      `Jackpot-ish: ${a} x3. That’s basically AGI. (+${formatInt(payout)})`,
      `We ran an eval and you passed. (+${formatInt(payout)})`,
    ]);
    return { payout, extraDelta: 0, note, kind: "win" };
  }

  if (isDouble) {
    const payout = Math.floor(bet * 2 * finetuneMultiplier());
    const note = snark([
      `Two-of-a-kind. Statistically significant vibes. (+${formatInt(payout)})`,
      `Two match. The third is doing “independent research”. (+${formatInt(payout)})`,
      `Partial credit. Like a benchmark. (+${formatInt(payout)})`,
    ]);
    return { payout, extraDelta: 0, note, kind: "win" };
  }

  const note = snark([
    "No match. Please rephrase and try again.",
    "No match. Have you tried turning the temperature down?",
    "No match. The model is “learning”. Your tokens are not.",
    "No match. You should see the README for the payout schedule (we didn’t write one).",
  ]);
  return { payout: 0, extraDelta: 0, note, kind: "lose" };
}

function canShare() {
  return Boolean(state.upgrades.prompt101) && typeof navigator.share === "function";
}

function setShareAvailability() {
  els.shareBtn.disabled = !canShare();
}

function outcomeToText(outcome) {
  return outcome.map((id) => (SYMBOLS.find((s) => s.id === id) || { name: id }).name).join(" / ");
}

async function shareLastResult() {
  const lr = state.stats.lastResult;
  if (!lr) return;
  if (!canShare()) return;
  const text = `I just spun ${outcomeToText(lr.outcome)} in AI Token Slots and now have ${formatInt(
    state.tokens,
  )} tokens. ${lr.payout ? `Won ${formatInt(lr.payout)}!` : "I am financially aligned."}`;
  try {
    await navigator.share({ title: "AI Token Slots", text });
  } catch {
    // user canceled
  }
}

function setSpinningUi(on) {
  spinning = on;
  els.spinBtn.disabled = on;
  els.betSelect.disabled = on;
  for (const r of els.reels) r.classList.toggle("spinning", on);
  if (!on) for (const r of els.reels) r.classList.remove("spinning");
}

function stopAutoSpin() {
  state.autoSpin = false;
  if (autoSpinTimer) window.clearTimeout(autoSpinTimer);
  autoSpinTimer = null;
  els.autoSpinToggle.checked = false;
}

async function spinOnce({ turbo = false } = {}) {
  if (spinning) return;
  const bet = clampInt(parseInt(els.betSelect.value, 10), 1, 999999);
  state.bet = bet;

  if (state.tokens < bet) {
    setTicker(
      snark([
        "Insufficient tokens. Please acquire more compute (or claim your daily 42).",
        "You’re out of tokens. The model suggests: “get a job.”",
        "Cannot spin: balance is negative in the vibes dimension.",
      ]),
      "warn",
    );
    stopAutoSpin();
    renderStats();
    saveState(state);
    return;
  }

  state.tokens -= bet;
  state.stats.totalSpent += bet;
  state.stats.spins += 1;
  saveState(state);
  renderStats();
  setShareAvailability();

  setSpinningUi(true);
  setTicker(snark(["Spinning…", "Sampling…", "Decoding…", "Running evals…"]), "normal");
  if (state.sound) synth.tick();

  const weights = baseWeights();
  const outcome = [weightedPick(weights), weightedPick(weights), weightedPick(weights)];

  const stopDelays = turbo ? [520, 820, 1100] : [780, 1180, 1560];
  const tickMs = turbo ? 46 : 62;

  await new Promise((resolve) => {
    let stopped = 0;
    els.reels.forEach((reelEl, i) => {
      const interval = window.setInterval(() => {
        setReel(reelEl, weightedPick(weights));
        if (state.sound && i === 2) synth.tick();
      }, tickMs);

      window.setTimeout(() => {
        window.clearInterval(interval);
        setReel(reelEl, outcome[i]);
        stopped += 1;
        if (stopped === 3) resolve();
      }, stopDelays[i]);
    });
  });

  const result = evaluateSpin(outcome, bet);
  const delta = result.payout + result.extraDelta;
  state.tokens += delta;
  state.stats.totalWon += Math.max(0, result.payout);
  state.stats.lastResult = { ts: nowMs(), bet, outcome, payout: result.payout, delta };

  if (delta > 0) {
    state.stats.wins += 1;
    state.stats.biggestWin = Math.max(state.stats.biggestWin, delta);
  }

  setTicker(result.note, result.kind === "win" ? "win" : "lose");
  if (state.sound) {
    if (result.kind === "win") synth.win();
    else synth.lose();
  }
  vibrate(state, result.kind === "win" ? [30, 40, 30] : [80]);

  setSpinningUi(false);
  renderStats();
  setShareAvailability();
  updateClaimButton();
  renderStore();
  saveState(state);

  if (state.autoSpin) {
    const pace = state.upgrades.gpumode ? 480 : 800;
    autoSpinTimer = window.setTimeout(() => spinOnce({ turbo: state.upgrades.gpumode }), pace);
  }
}

function buy(itemId) {
  const item = STORE_ITEMS.find((x) => x.id === itemId);
  if (!item) return;

  const isOwned =
    itemId === "finetune" ? state.upgrades.finetuneLevel > 0 : Boolean(state.upgrades[itemId]);
  if (item.once && isOwned) return;

  if (state.tokens < item.cost) {
    setTicker(snark(["Not enough tokens.", "Your balance is underfitting.", "Need more tokens."]), "warn");
    return;
  }

  state.tokens -= item.cost;
  state.stats.totalSpent += item.cost;

  if (itemId === "finetune") {
    state.upgrades.finetuneLevel = clampInt(state.upgrades.finetuneLevel + 1, 0, 99);
    setTicker(snark(["Fine-tuned. Slightly. Probably.", "We trained on your regret. Upgraded."]), "win");
  } else {
    state.upgrades[itemId] = true;
    setTicker(snark([`Purchased: ${item.name}.`, "Roadmap achieved. Stakeholders appeased."]), "win");
  }

  if (itemId === "prompt101") updateBetOptions();

  renderStore();
  renderStats();
  updateClaimButton();
  setShareAvailability();
  saveState(state);
}

function claimDaily() {
  const key = todayKey();
  if (state.daily.lastClaimDay === key) return;
  state.daily.lastClaimDay = key;
  state.tokens += 42;
  setTicker(snark(["Daily 42 claimed. Blessings upon your context window.", "+42 tokens. Nice."]), "win");
  vibrate(state, [20, 30, 20]);
  renderStats();
  updateClaimButton();
  saveState(state);
}

function exportStats() {
  const payload = {
    exportedAt: new Date().toISOString(),
    tokens: state.tokens,
    bet: state.bet,
    upgrades: state.upgrades,
    stats: state.stats,
    daily: state.daily,
  };
  els.exportBox.hidden = false;
  els.exportBox.textContent = JSON.stringify(payload, null, 2);
  try {
    navigator.clipboard?.writeText(els.exportBox.textContent);
    setTicker(snark(["Copied telemetry to clipboard.", "Stats exported. Observability intensifies."]), "win");
  } catch {
    // ignore
  }
}

function resetAll() {
  const ok = window.confirm("Reset tokens, upgrades, and stats? This cannot be un-shipped.");
  if (!ok) return;
  state = defaultState();
  saveState(state);
  updateBetOptions();
  renderPaytable();
  renderStore();
  renderStats();
  renderToggles();
  updateClaimButton();
  setShareAvailability();
  setTicker("Reset complete. Fresh tokens, fresh mistakes.", "normal");
  for (let i = 0; i < 3; i++) setReel(els.reels[i], SYMBOLS[(Math.random() * SYMBOLS.length) | 0].id);
}

function initEvents() {
  els.betSelect.addEventListener("change", () => {
    state.bet = clampInt(parseInt(els.betSelect.value, 10), 1, 999999);
    saveState(state);
  });
  els.autoSpinToggle.addEventListener("change", () => {
    state.autoSpin = Boolean(els.autoSpinToggle.checked);
    saveState(state);
    if (state.autoSpin) spinOnce({ turbo: state.upgrades.gpumode });
    else {
      if (autoSpinTimer) window.clearTimeout(autoSpinTimer);
      autoSpinTimer = null;
    }
  });
  els.soundToggle.addEventListener("change", () => {
    state.sound = Boolean(els.soundToggle.checked);
    saveState(state);
  });
  els.hapticsToggle.addEventListener("change", () => {
    state.haptics = Boolean(els.hapticsToggle.checked);
    saveState(state);
  });
  els.reducedSnarkToggle.addEventListener("change", () => {
    state.reducedSnark = Boolean(els.reducedSnarkToggle.checked);
    saveState(state);
  });
  els.spinBtn.addEventListener("click", () => spinOnce({ turbo: state.upgrades.gpumode }));
  els.shareBtn.addEventListener("click", () => shareLastResult());
  els.claimDailyBtn.addEventListener("click", () => claimDaily());
  els.resetBtn.addEventListener("click", () => resetAll());
  els.exportBtn.addEventListener("click", () => exportStats());

  els.storeGrid.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-buy]");
    if (!btn) return;
    buy(btn.dataset.buy);
  });

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    keyDown.add(e.code);
    if (e.code === "Space") {
      e.preventDefault();
      spinOnce({ turbo: state.upgrades.gpumode || keyDown.has("ShiftLeft") || keyDown.has("ShiftRight") });
    }
  });
  window.addEventListener("keyup", (e) => {
    keyDown.delete(e.code);
  });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPwaPrompt = e;
    els.installBtn.disabled = false;
  });

  els.installBtn.addEventListener("click", async () => {
    if (!deferredPwaPrompt) return;
    deferredPwaPrompt.prompt();
    try {
      await deferredPwaPrompt.userChoice;
    } finally {
      deferredPwaPrompt = null;
      els.installBtn.disabled = true;
    }
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch {
    // ignore
  }
}

function init() {
  updateBetOptions();
  renderPaytable();
  renderStore();
  renderStats();
  renderToggles();
  updateClaimButton();
  setShareAvailability();
  initEvents();

  for (let i = 0; i < 3; i++) setReel(els.reels[i], SYMBOLS[(Math.random() * SYMBOLS.length) | 0].id);

  setTicker(
    snark([
      "Welcome! Please wager responsibly (or at least reproducibly).",
      "Welcome! We promise not to train on your spins. (Promise not evaluated.)",
      "Welcome! Your tokens are safe* (*in this browser only).",
    ]),
    "normal",
  );
  registerServiceWorker();
}

init();


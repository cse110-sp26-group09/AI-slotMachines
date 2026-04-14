/* TokenGambit: a tiny vanilla-web slot machine with AI-flavored satire. */

const STORAGE_KEY = "tokengambit:v1";
const TODAY_KEY = () => new Date().toISOString().slice(0, 10);

const MODELS = {
  tiny: { label: "gpt-2.0 (nostalgia)", spinCost: 3, payoutMult: 0.95 },
  mid: { label: "gpt-4-ish (expensive)", spinCost: 6, payoutMult: 1.1 },
  max: { label: "gpt-5-ish (mythical)", spinCost: 10, payoutMult: 1.35 },
};

const SYMBOLS = [
  {
    id: "coin",
    glyph: "🪙",
    name: "Token",
    weight: 28,
    basePayout: 18,
    caption: "billable unit",
    desc: "Pure, uncut tokens. The only thing anyone agrees is real.",
  },
  {
    id: "bot",
    glyph: "🤖",
    name: "Agent",
    weight: 18,
    basePayout: 30,
    caption: "delegating…",
    desc: "Claims autonomy. Requests permissions. Still forgets your name.",
  },
  {
    id: "receipt",
    glyph: "🧾",
    name: "Invoice",
    weight: 14,
    basePayout: 10,
    caption: "billing cycle",
    desc: "A gentle reminder that your wallet is also part of the model.",
  },
  {
    id: "fire",
    glyph: "🔥",
    name: "GPU",
    weight: 12,
    basePayout: 14,
    caption: "thermal limit",
    desc: "Computing intensely. Also: emitting vibes (and heat).",
  },
  {
    id: "wand",
    glyph: "🪄",
    name: "Prompt",
    weight: 10,
    basePayout: 55,
    caption: "one weird trick",
    desc: "A carefully phrased sentence that briefly makes everything work.",
  },
  {
    id: "chart",
    glyph: "📉",
    name: "Benchmark",
    weight: 9,
    basePayout: 24,
    caption: "SOTA? maybe",
    desc: "The line goes down, the blog post goes up.",
  },
  {
    id: "brick",
    glyph: "🧱",
    name: "Rate limit",
    weight: 7,
    basePayout: 8,
    caption: "try again later",
    desc: "You are now in a queue. Please enjoy the illusion of progress.",
  },
  {
    id: "brain",
    glyph: "🧠",
    name: "Context",
    weight: 2,
    basePayout: 160,
    caption: "wide window",
    desc: "Mythical. Expensive. The reason you’re here.",
  },
];

const REEL_CAPTIONS = [
  "sampling logits…",
  "optimizing vibes…",
  "argmaxing destiny…",
];

const ui = {
  balance: document.getElementById("balance"),
  spinCost: document.getElementById("spinCost"),
  modelLabel: document.getElementById("modelLabel"),
  temperature: document.getElementById("temperature"),
  spinBtn: document.getElementById("spinBtn"),
  autoBtn: document.getElementById("autoBtn"),
  dailyBtn: document.getElementById("dailyBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  copyBtn: document.getElementById("copyBtn"),
  shareBtn: document.getElementById("shareBtn"),
  resetBtn: document.getElementById("resetBtn"),
  statusTitle: document.getElementById("statusTitle"),
  statusDetail: document.getElementById("statusDetail"),
  reelEls: [
    document.getElementById("reel1"),
    document.getElementById("reel2"),
    document.getElementById("reel3"),
  ],
  capEls: [
    document.getElementById("cap1"),
    document.getElementById("cap2"),
    document.getElementById("cap3"),
  ],
  stats: {
    spins: document.getElementById("statSpins"),
    spent: document.getElementById("statSpent"),
    won: document.getElementById("statWon"),
    best: document.getElementById("statBest"),
  },
  log: document.getElementById("log"),
  settingsDialog: document.getElementById("settingsDialog"),
  modelSelect: document.getElementById("modelSelect"),
  soundToggle: document.getElementById("soundToggle"),
  hapticsToggle: document.getElementById("hapticsToggle"),
  reducedMotionToggle: document.getElementById("reducedMotionToggle"),
  legend: document.getElementById("legend"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatInt(n) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

function secureRandomUnit() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  // 2^32 = 4294967296
  return buf[0] / 4294967296;
}

function temperatureToExponent(temp0to100) {
  // 0 => very deterministic (sharper distribution)
  // 100 => chaos (flatter distribution)
  const t = clamp(temp0to100, 0, 100) / 100;
  return 2.0 - 1.45 * t; // 2.0 .. 0.55
}

function buildDistribution(temp0to100) {
  const exponent = temperatureToExponent(temp0to100);
  const powered = SYMBOLS.map((s) => Math.pow(s.weight, exponent));
  const total = powered.reduce((a, b) => a + b, 0);
  const probs = powered.map((w) => w / total);

  const cumulative = [];
  let running = 0;
  for (const p of probs) {
    running += p;
    cumulative.push(running);
  }
  cumulative[cumulative.length - 1] = 1; // guard FP drift

  return cumulative;
}

function pickSymbol(cumulative) {
  const r = secureRandomUnit();
  const idx = cumulative.findIndex((c) => r <= c);
  return SYMBOLS[idx === -1 ? SYMBOLS.length - 1 : idx];
}

function nowStamp() {
  return new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function announce(title, detail) {
  ui.statusTitle.textContent = title;
  ui.statusDetail.textContent = detail;
}

function appendLogRow(html) {
  const row = document.createElement("div");
  row.className = "log__row";
  row.innerHTML = html;
  ui.log.prepend(row);
  while (ui.log.childElementCount > 24) ui.log.lastElementChild?.remove();
}

function renderLegend() {
  ui.legend.textContent = "";
  for (const sym of SYMBOLS) {
    const row = document.createElement("div");
    row.className = "legend__row";
    row.innerHTML = `
      <div class="legend__sym" aria-hidden="true">${sym.glyph}</div>
      <div>
        <div><b>${sym.name}</b> <span class="muted">(${sym.caption})</span></div>
        <div class="legend__desc">${sym.desc}</div>
      </div>
    `;
    ui.legend.append(row);
  }
}

function defaultState() {
  return {
    balance: 120,
    lastRoll: null,
    stats: { spins: 0, spent: 0, won: 0, best: 0 },
    settings: {
      model: "mid",
      sound: true,
      haptics: true,
      reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false,
    },
    daily: { lastClaim: null },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return {
      ...defaultState(),
      ...parsed,
      stats: { ...defaultState().stats, ...(parsed.stats ?? {}) },
      settings: { ...defaultState().settings, ...(parsed.settings ?? {}) },
      daily: { ...defaultState().daily, ...(parsed.daily ?? {}) },
    };
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function canClaimDaily() {
  return state.daily.lastClaim !== TODAY_KEY();
}

function dailyAmount() {
  // Enough to keep it moving, not enough to feel good.
  return state.settings.model === "max" ? 18 : state.settings.model === "mid" ? 24 : 30;
}

function spinCost() {
  return MODELS[state.settings.model].spinCost;
}

function payoutMultiplier() {
  return MODELS[state.settings.model].payoutMult;
}

function computePayout(roll) {
  const [a, b, c] = roll;
  const allSame = a.id === b.id && b.id === c.id;
  const anyPair = a.id === b.id || a.id === c.id || b.id === c.id;
  const hasBrick = roll.some((s) => s.id === "brick");

  let payout = 0;
  let title = "";
  let detail = "";

  if (allSame) {
    const base = a.basePayout;
    payout = Math.floor(base * 3.25 * payoutMultiplier());
    if (a.id === "brain") {
      payout = Math.floor(base * 8.0 * payoutMultiplier());
      title = "JACKPOT: Context window unlocked.";
      detail = "You can now remember why you opened this tab.";
    } else if (a.id === "receipt") {
      title = "TRIPLE INVOICE.";
      detail = "Accounting called: you’re winning in spreadsheets now.";
    } else if (a.id === "fire") {
      title = "TRIPLE GPU FIRE.";
      detail = "Good news: it’s warm. Bad news: it’s warm.";
      payout = Math.max(payout, spinCost()); // basically a refund plus a little.
    } else if (a.id === "brick") {
      title = "TRIPLE RATE LIMIT.";
      detail = "Congratulations! You’ve been selected for additional waiting.";
      payout = Math.max(1, Math.floor(payout / 2));
    } else {
      title = `TRIPLE ${a.name.toUpperCase()}.`;
      detail = "Pure alignment. No notes.";
    }
  } else if (anyPair) {
    const pairId =
      a.id === b.id ? a.id : a.id === c.id ? a.id : b.id === c.id ? b.id : a.id;
    const sym = SYMBOLS.find((s) => s.id === pairId) ?? a;
    payout = Math.floor((sym.basePayout * 1.15 * payoutMultiplier()) / 2);
    payout = Math.max(1, payout);
    title = `Pair of ${sym.name}.`;
    detail = "A modest win, like finding a coupon for your subscription.";
  } else {
    payout = 0;
    title = "No match.";
    detail = "The model is confident you’ll win on the next spin.";
  }

  if (!allSame && hasBrick) {
    // The house always gets its API call.
    const penalty = state.settings.model === "max" ? 4 : 2;
    payout = Math.max(0, payout - penalty);
    detail += ` Also: rate-limited (-${penalty}).`;
  }

  return { payout, title, detail };
}

function maybeVibrate(pattern) {
  if (!state.settings.haptics) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // ignore
  }
}

function beep(kind) {
  if (!state.settings.sound) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  try {
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    const now = ctx.currentTime;

    const settings =
      kind === "win"
        ? { f1: 660, f2: 880, dur: 0.18 }
        : kind === "jackpot"
          ? { f1: 440, f2: 1320, dur: 0.32 }
          : { f1: 180, f2: 120, dur: 0.16 };

    o.frequency.setValueAtTime(settings.f1, now);
    o.frequency.exponentialRampToValueAtTime(settings.f2, now + settings.dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.22, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + settings.dur);

    o.connect(g);
    g.connect(ctx.destination);
    o.start(now);
    o.stop(now + settings.dur + 0.02);
    o.onended = () => ctx.close().catch(() => {});
  } catch {
    // ignore
  }
}

let state = loadState();
let spinning = false;
let autoSpinTimer = null;

function applyMotionPreference() {
  const reduce = !!state.settings.reducedMotion;
  document.documentElement.classList.toggle("reduced-motion", reduce);
}

function render() {
  ui.balance.textContent = formatInt(state.balance);
  ui.spinCost.textContent = formatInt(spinCost());
  ui.modelLabel.textContent = MODELS[state.settings.model].label;

  ui.stats.spins.textContent = formatInt(state.stats.spins);
  ui.stats.spent.textContent = formatInt(state.stats.spent);
  ui.stats.won.textContent = formatInt(state.stats.won);
  ui.stats.best.textContent = formatInt(state.stats.best);

  ui.dailyBtn.disabled = !canClaimDaily();
  ui.dailyBtn.title = canClaimDaily()
    ? `Claim +${dailyAmount()} tokens`
    : "Already claimed today";

  ui.spinBtn.disabled = spinning || state.balance < spinCost();

  ui.modelSelect.value = state.settings.model;
  ui.soundToggle.checked = state.settings.sound;
  ui.hapticsToggle.checked = state.settings.haptics;
  ui.reducedMotionToggle.checked = state.settings.reducedMotion;

  applyMotionPreference();
}

function setReelSymbol(i, sym, { pop = false } = {}) {
  const el = ui.reelEls[i];
  el.textContent = sym.glyph;
  el.setAttribute("data-id", sym.id);
  if (pop && !state.settings.reducedMotion) {
    el.classList.remove("pop");
    // force reflow for animation restart
    void el.offsetWidth;
    el.classList.add("pop");
  }
}

function setReelCaption(i, text) {
  ui.capEls[i].textContent = text;
}

function startReelSpin(i) {
  ui.reelEls[i].classList.add("shake");
  ui.capEls[i].classList.add("spin-glow");
}

function stopReelSpin(i) {
  ui.reelEls[i].classList.remove("shake");
  ui.capEls[i].classList.remove("spin-glow");
}

async function spinOnce({ fromAuto = false } = {}) {
  if (spinning) return;

  const cost = spinCost();
  if (state.balance < cost) {
    announce(
      "Out of tokens.",
      canClaimDaily()
        ? "Claim the daily drip to keep the hallucinations flowing."
        : "You’re broke. Not financially—tokenly."
    );
    maybeVibrate([60, 40, 60]);
    if (!fromAuto) beep("lose");
    render();
    return;
  }

  spinning = true;
  state.balance -= cost;
  state.stats.spins += 1;
  state.stats.spent += cost;

  const temp = Number(ui.temperature.value);
  const dist = buildDistribution(temp);

  announce("Spinning…", "Sampling three independent realities.");
  render();

  const reelDurations = state.settings.reducedMotion ? [200, 250, 300] : [650, 900, 1150];
  const tick = state.settings.reducedMotion ? 60 : 55;

  const final = [null, null, null];
  const intervals = [];

  for (let i = 0; i < 3; i++) {
    startReelSpin(i);
    setReelCaption(i, REEL_CAPTIONS[i] ?? "spinning…");
    intervals[i] = window.setInterval(() => {
      const preview = SYMBOLS[Math.floor(secureRandomUnit() * SYMBOLS.length)];
      setReelSymbol(i, preview);
    }, tick);
  }

  await new Promise((resolve) => {
    let finished = 0;
    for (let i = 0; i < 3; i++) {
      window.setTimeout(() => {
        window.clearInterval(intervals[i]);
        const sym = pickSymbol(dist);
        final[i] = sym;
        setReelSymbol(i, sym, { pop: true });
        setReelCaption(i, sym.caption);
        stopReelSpin(i);
        finished += 1;
        if (finished === 3) resolve();
      }, reelDurations[i]);
    }
  });

  const roll = final;
  const outcome = computePayout(roll);
  state.balance += outcome.payout;
  state.stats.won += outcome.payout;
  state.stats.best = Math.max(state.stats.best, outcome.payout);
  state.lastRoll = {
    at: Date.now(),
    model: state.settings.model,
    temperature: temp,
    cost,
    roll: roll.map((s) => s.id),
    payout: outcome.payout,
  };

  const rollText = roll.map((s) => s.glyph).join(" ");
  const net = outcome.payout - cost;
  const netLabel = net >= 0 ? `+${formatInt(net)}` : `-${formatInt(Math.abs(net))}`;
  const netColor = net >= 0 ? "var(--good)" : "var(--bad)";

  announce(outcome.title, `${outcome.detail} (${rollText})`);

  appendLogRow(
    `<div class="muted">${nowStamp()} • temp ${formatInt(temp)} • ${MODELS[state.settings.model].label}</div>
     <div><b>${rollText}</b> • cost ${formatInt(cost)} • payout ${formatInt(outcome.payout)} • <span style="color:${netColor};font-weight:900">net ${netLabel}</span></div>`
  );

  if (outcome.payout > 0) {
    maybeVibrate(outcome.payout >= 120 ? [20, 40, 20, 40, 60] : [30, 30, 30]);
    beep(outcome.payout >= 120 ? "jackpot" : "win");
  } else {
    maybeVibrate([70]);
    beep("lose");
  }

  saveState();
  spinning = false;
  render();

  if (autoSpinTimer && state.balance < spinCost()) stopAutoSpin();
}

function startAutoSpin() {
  if (autoSpinTimer) return;
  ui.autoBtn.setAttribute("aria-pressed", "true");
  ui.autoBtn.textContent = "Stop auto-spin";
  autoSpinTimer = window.setInterval(() => {
    if (!spinning) spinOnce({ fromAuto: true });
  }, state.settings.reducedMotion ? 450 : 1400);
  announce("Auto-spin engaged.", "The house appreciates your dedication to iteration.");
}

function stopAutoSpin() {
  if (!autoSpinTimer) return;
  window.clearInterval(autoSpinTimer);
  autoSpinTimer = null;
  ui.autoBtn.setAttribute("aria-pressed", "false");
  ui.autoBtn.innerHTML = `Auto-spin <span class="btn__sub">A</span>`;
  announce("Auto-spin stopped.", "A rare moment of self-control.");
}

function toggleAutoSpin() {
  if (autoSpinTimer) stopAutoSpin();
  else startAutoSpin();
}

function claimDaily() {
  if (!canClaimDaily()) {
    announce("Daily drip already claimed.", "Come back tomorrow. Or don’t. That’s also valid.");
    return;
  }
  const amt = dailyAmount();
  state.balance += amt;
  state.daily.lastClaim = TODAY_KEY();
  saveState();
  render();
  announce("Daily drip claimed.", `+${formatInt(amt)} tokens. Invest wisely (you won’t).`);
  maybeVibrate([20, 30, 20]);
  beep("win");
}

function openSettings() {
  renderLegend();
  ui.settingsDialog.showModal();
}

function saveSettings() {
  state.settings.model = ui.modelSelect.value;
  state.settings.sound = ui.soundToggle.checked;
  state.settings.haptics = ui.hapticsToggle.checked;
  state.settings.reducedMotion = ui.reducedMotionToggle.checked;
  saveState();
  render();
  announce("Settings saved.", "Your preferences are now fully overfit.");
}

function resetRun() {
  const ok = window.confirm("Reset your balance, stats, and settings?");
  if (!ok) return;
  state = defaultState();
  saveState();
  ui.log.textContent = "";
  announce("Fresh run started.", "New tokens, same decisions.");
  render();
}

function lastBragText() {
  const last = state.lastRoll;
  if (!last) return "TokenGambit: no spins yet. I’m still ‘thinking’.";
  const rollGlyphs = last.roll
    .map((id) => SYMBOLS.find((s) => s.id === id)?.glyph ?? "？")
    .join(" ");
  const model = MODELS[last.model]?.label ?? last.model;
  const net = last.payout - last.cost;
  const netText = net >= 0 ? `+${net}` : `-${Math.abs(net)}`;
  return `TokenGambit — ${rollGlyphs} | model: ${model} | cost: ${last.cost} | payout: ${last.payout} | net: ${netText} | balance: ${state.balance} tokens`;
}

async function copyBrag() {
  const text = lastBragText();
  try {
    await navigator.clipboard.writeText(text);
    announce("Copied.", "Your brag is now in the clipboard context window.");
    maybeVibrate([20]);
  } catch {
    announce("Copy failed.", "Clipboard permission denied. The bot is humbled.");
  }
}

async function shareBrag() {
  const text = lastBragText();
  try {
    if (navigator.share) {
      await navigator.share({ title: "TokenGambit", text });
      announce("Shared.", "Your friends have been automatically enlisted as stakeholders.");
      return;
    }
    await navigator.clipboard.writeText(text);
    announce("No share API here.", "Copied to clipboard instead.");
  } catch {
    announce("Share cancelled.", "You hesitated. That was the correct choice.");
  }
}

function handleKeys(e) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (ui.settingsDialog.open) return;
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    spinOnce();
  } else if (e.key.toLowerCase() === "a") {
    toggleAutoSpin();
  } else if (e.key.toLowerCase() === "d") {
    claimDaily();
  } else if (e.key.toLowerCase() === "s") {
    openSettings();
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

// Wire up UI
ui.spinBtn.addEventListener("click", () => spinOnce());
ui.autoBtn.addEventListener("click", () => toggleAutoSpin());
ui.dailyBtn.addEventListener("click", () => claimDaily());
ui.settingsBtn.addEventListener("click", () => openSettings());
ui.copyBtn.addEventListener("click", () => copyBrag());
ui.shareBtn.addEventListener("click", () => shareBrag());
ui.resetBtn.addEventListener("click", () => resetRun());
ui.saveSettingsBtn.addEventListener("click", () => saveSettings());
window.addEventListener("keydown", handleKeys);

ui.temperature.addEventListener("input", () => {
  const t = Number(ui.temperature.value);
  const vibe = t < 25 ? "calm" : t < 70 ? "spicy" : "feral";
  ui.temperature.setAttribute("aria-valuetext", `${formatInt(t)} (${vibe})`);
});

// Initial render
for (let i = 0; i < 3; i++) {
  const sym = SYMBOLS[Math.floor(secureRandomUnit() * SYMBOLS.length)];
  setReelSymbol(i, sym);
  setReelCaption(i, sym.caption);
}

announce("Ready to hallucinate.", canClaimDaily() ? "Claim your daily drip if you’re feeling underfunded." : "Tokens are finite. Confidence is infinite.");
render();
registerServiceWorker();


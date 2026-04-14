const STORAGE_KEY = "prompt-casino:v1";

const SYMBOLS = [
  { id: "bot", glyph: "🤖", weight: 18 },
  { id: "weights", glyph: "🧠", weight: 16 },
  { id: "plugin", glyph: "🔌", weight: 16 },
  { id: "gpu", glyph: "🔥", weight: 12 },
  { id: "tokens", glyph: "🪙", weight: 9 },
  { id: "rate", glyph: "📉", weight: 10 },
  { id: "receipt", glyph: "🧾", weight: 10 },
  { id: "trap", glyph: "🪤", weight: 9 }
];

const PAYTABLE = {
  three: {
    tokens: 500,
    gpu: 300,
    bot: 220,
    weights: 180,
    plugin: 120,
    receipt: 0,
    rate: -50,
    trap: 80
  },
  anyPair: 30,
  rateAnywhere: -50
};

const BASE_SPIN_COST = 20;
const DAILY_STIPEND = 180;

const ui = {
  reelEls: [qs("#reel0"), qs("#reel1"), qs("#reel2")],
  reelFrames: Array.from(document.querySelectorAll(".reelFrame")),
  tokenBalance: qs("#tokenBalance"),
  spinCost: qs("#spinCost"),
  lastDelta: qs("#lastDelta"),
  statusLine: qs("#statusLine"),
  seedLine: qs("#seedLine"),
  log: qs("#log"),
  spinBtn: qs("#spinBtn"),
  autoBtn: qs("#autoBtn"),
  stipendBtn: qs("#stipendBtn"),
  betSelect: qs("#betSelect"),
  shareBtn: qs("#shareBtn"),
  resetBtn: qs("#resetBtn"),
  installBtn: qs("#installBtn")
};

let autoTimer = null;
let autoOn = false;
let spinning = false;
let deferredInstallPrompt = null;

const state = loadState();
renderDelta(0);
renderAll();
boot();

function boot() {
  ui.statusLine.textContent = "Ready. Insert tokens (locally).";
  logLine("System", "Loaded memory from localStorage. Unverified vibes detected.");

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      onSpin();
    }
  });

  ui.spinBtn.addEventListener("click", onSpin);
  ui.autoBtn.addEventListener("click", onToggleAuto);
  ui.stipendBtn.addEventListener("click", onClaimStipend);
  ui.betSelect.addEventListener("change", () => {
    renderAll();
    saveState();
  });
  ui.shareBtn.addEventListener("click", onShare);
  ui.resetBtn.addEventListener("click", onReset);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    ui.installBtn.hidden = false;
  });
  ui.installBtn.addEventListener("click", onInstall);

  registerServiceWorker();
  requestStoragePersistence();
  updateStipendButton();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && autoOn) {
      logLine("System", "Tab hidden: auto-spin paused to save your GPU (and reputation).");
      setAuto(false);
    }
  });
}

function qs(sel) {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
}

function nowStamp() {
  const d = new Date();
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function logLine(tag, msg) {
  const row = document.createElement("div");
  row.className = "row";
  const t = document.createElement("div");
  t.className = "t";
  t.textContent = nowStamp();
  const m = document.createElement("div");
  m.className = "m";
  m.textContent = `[${tag}] ${msg}`;
  row.appendChild(t);
  row.appendChild(m);
  ui.log.appendChild(row);
  ui.log.scrollTop = ui.log.scrollHeight;
}

function tierMultiplier() {
  const n = Number(ui.betSelect.value || "1");
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n;
}

function spinCost() {
  return BASE_SPIN_COST * tierMultiplier();
}

function renderAll() {
  ui.tokenBalance.textContent = formatInt(state.tokens);
  ui.spinCost.textContent = formatInt(spinCost());
  ui.spinBtn.disabled = spinning || state.tokens < spinCost();
  ui.autoBtn.disabled = spinning;
}

function renderDelta(delta) {
  ui.lastDelta.textContent = `${delta >= 0 ? "+" : ""}${formatInt(delta)}`;
  ui.lastDelta.style.color =
    delta > 0
      ? "var(--good)"
      : delta < 0
        ? "var(--bad)"
        : "rgba(255,255,255,0.75)";
}

function setStatus(msg, tone = "muted") {
  ui.statusLine.textContent = msg;
  ui.statusLine.style.color =
    tone === "good"
      ? "var(--good)"
      : tone === "bad"
        ? "var(--bad)"
        : tone === "warn"
          ? "var(--warn)"
          : "var(--muted)";
}

function formatInt(n) {
  return Math.trunc(n).toLocaleString("en-US");
}

function loadState() {
  const fresh = {
    tokens: 500,
    spins: 0,
    wins: 0,
    lastSlip: "",
    lastStipendISO: "",
    lastTier: "1"
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      ui.betSelect.value = fresh.lastTier;
      return fresh;
    }
    const parsed = JSON.parse(raw);
    const out = { ...fresh, ...parsed };
    if (typeof out.tokens !== "number") out.tokens = fresh.tokens;
    if (typeof out.spins !== "number") out.spins = 0;
    if (typeof out.wins !== "number") out.wins = 0;
    if (typeof out.lastSlip !== "string") out.lastSlip = "";
    if (typeof out.lastStipendISO !== "string") out.lastStipendISO = "";
    ui.betSelect.value = typeof out.lastTier === "string" ? out.lastTier : fresh.lastTier;
    return out;
  } catch {
    ui.betSelect.value = fresh.lastTier;
    return fresh;
  }
}

function saveState() {
  state.lastTier = String(ui.betSelect.value || "1");
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function stipendAvailable() {
  return state.lastStipendISO !== todayKey();
}

function updateStipendButton() {
  ui.stipendBtn.disabled = !stipendAvailable();
  ui.stipendBtn.textContent = stipendAvailable()
    ? "Claim daily stipend"
    : "Stipend claimed";
}

async function onClaimStipend() {
  if (!stipendAvailable()) return;
  state.lastStipendISO = todayKey();
  state.tokens += DAILY_STIPEND;
  saveState();
  renderAll();
  updateStipendButton();
  playSound("good");
  setStatus(`Stipend claimed: +${DAILY_STIPEND} tokens.`, "good");
  logLine("Grant", `You received ${DAILY_STIPEND} tokens for “community engagement”.`);
  tryVibrate([30, 40, 30]);
}

async function onSpin() {
  if (spinning) return;
  const cost = spinCost();
  if (state.tokens < cost) {
    setStatus("Insufficient tokens. Try the daily stipend, or touch grass.", "warn");
    playSound("bad");
    return;
  }

  spinning = true;
  stopAutoIfBroke(false);
  renderAll();

  const seed = randomHex(8);
  ui.seedLine.textContent = `seed: ${seed}`;
  setStatus("Generating output… (temperature=1.7)", "muted");
  logLine("Model", `Starting spin. Billing ${cost} tokens for “reasoning”.`);
  playSound("tick");

  state.tokens -= cost;
  state.spins += 1;
  saveState();
  renderAll();

  const outcome = pickOutcome();
  const reelStops = [outcome[0].glyph, outcome[1].glyph, outcome[2].glyph];

  const stopMs = [620, 860, 1100];
  const startedAt = performance.now();

  await animateSpin(reelStops, stopMs);
  const elapsed = Math.round(performance.now() - startedAt);

  const result = scoreOutcome(outcome);
  const scaled = Math.trunc(result.delta * tierMultiplier());

  state.tokens += scaled;
  if (scaled > 0) state.wins += 1;
  const slip = buildSlip({
    cost,
    seed,
    outcome: reelStops,
    delta: scaled,
    ms: elapsed
  });
  state.lastSlip = slip;
  saveState();

  renderAll();
  renderDelta(scaled);
  updateStipendButton();

  if (scaled > 0) {
    ui.reelFrames.forEach((f) => f.classList.add("win"));
    setTimeout(
      () => ui.reelFrames.forEach((f) => f.classList.remove("win")),
      950
    );
    setStatus(result.headline, "good");
    logLine("Result", `${result.detail} (+${formatInt(scaled)} tokens)`);
    playSound("good");
    tryVibrate([20, 20, 50]);
  } else if (scaled < 0) {
    setStatus(result.headline, "bad");
    logLine("Result", `${result.detail} (${formatInt(scaled)} tokens)`);
    playSound("bad");
    tryVibrate([30, 20, 30]);
  } else {
    setStatus(result.headline, "muted");
    logLine("Result", result.detail);
    playSound("tick");
  }

  spinning = false;
  renderAll();
  stopAutoIfBroke(true);
}

function stopAutoIfBroke(afterSpin) {
  if (!autoOn) return;
  if (state.tokens >= spinCost()) return;
  setStatus(
    afterSpin
      ? "Auto-spin stopped: broke. Model suggests crowdfunding."
      : "Auto-spin paused.",
    "warn"
  );
  setAuto(false);
}

async function onToggleAuto() {
  setAuto(!autoOn);
}

function setAuto(on) {
  autoOn = on;
  ui.autoBtn.textContent = `Auto: ${autoOn ? "On" : "Off"}`;
  if (!autoOn) {
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = null;
    return;
  }
  tickAuto();
}

function tickAuto() {
  if (!autoOn) return;
  if (spinning) {
    autoTimer = setTimeout(tickAuto, 250);
    return;
  }
  if (state.tokens < spinCost()) {
    stopAutoIfBroke(true);
    return;
  }
  onSpin();
  autoTimer = setTimeout(tickAuto, 250);
}

function pickOutcome() {
  const pool = [];
  for (const s of SYMBOLS) {
    for (let i = 0; i < s.weight; i++) pool.push(s);
  }
  const pick = () => pool[randomInt(pool.length)];
  return [pick(), pick(), pick()];
}

function scoreOutcome(outcome) {
  const ids = outcome.map((s) => s.id);
  const glyphs = outcome.map((s) => s.glyph).join(" ");

  if (ids.includes("rate")) {
    return {
      delta: PAYTABLE.rateAnywhere,
      headline: "Rate limited.",
      detail: `${glyphs} — Too many requests. Please upgrade to Premium Hallucinations™.`
    };
  }

  if (ids[0] === ids[1] && ids[1] === ids[2]) {
    const base = PAYTABLE.three[ids[0]] ?? 0;
    const headline =
      base > 0
        ? "Win: model appears confident."
        : base < 0
          ? "Loss: model appears confident."
          : "Neutral: invoice generated.";
    const detail =
      ids[0] === "receipt"
        ? `${glyphs} — Congratulations: you won a receipt. Please expense it.`
        : ids[0] === "trap"
          ? `${glyphs} — Prompt trap triggered. You earned tokens by adding “please”.`
          : `${glyphs} — Three of a kind. The benchmark approves.`;
    return { delta: base, headline, detail };
  }

  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  if (Array.from(counts.values()).some((n) => n === 2)) {
    return {
      delta: PAYTABLE.anyPair,
      headline: "Minor win: vibes are positive.",
      detail: `${glyphs} — Two matched. Not SOTA, but shippable.`
    };
  }

  return {
    delta: 0,
    headline: "No win: needs more prompts.",
    detail: `${glyphs} — Output looks plausible. Fails on edge cases.`
  };
}

async function animateSpin(finalGlyphs, stopMs) {
  const reduceMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const start = performance.now();

  const frame = (t) => {
    for (let i = 0; i < 3; i++) {
      const elapsed = t - start;
      if (elapsed < stopMs[i]) {
        ui.reelEls[i].textContent = SYMBOLS[randomInt(SYMBOLS.length)].glyph;
      } else {
        ui.reelEls[i].textContent = finalGlyphs[i];
      }
    }
    if (t - start < Math.max(...stopMs)) requestAnimationFrame(frame);
  };

  if (reduceMotion) {
    ui.reelEls.forEach((el, i) => (el.textContent = finalGlyphs[i]));
    await wait(150);
    return;
  }

  return new Promise((resolve) => {
    requestAnimationFrame((t) => {
      frame(t);
      setTimeout(resolve, Math.max(...stopMs) + 40);
    });
  });
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomInt(maxExclusive) {
  const max = Math.floor(maxExclusive);
  if (!Number.isFinite(max) || max <= 0) return 0;
  const range = 0x100000000;
  const limit = range - (range % max);
  const buf = new Uint32Array(1);
  while (true) {
    crypto.getRandomValues(buf);
    const x = buf[0];
    if (x < limit) return x % max;
  }
}

function randomHex(bytes) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  let out = "";
  for (const x of b) out += x.toString(16).padStart(2, "0");
  return out;
}

function buildSlip({ cost, seed, outcome, delta, ms }) {
  const tier = tierMultiplier();
  const when = new Date().toLocaleString();
  const parts = [
    "Prompt Casino — Spin Slip",
    `When: ${when}`,
    `Tier: x${tier}`,
    `Cost: -${cost} tokens`,
    `Outcome: ${outcome.join(" ")}`,
    `Payout: ${delta >= 0 ? "+" : ""}${delta} tokens`,
    `Latency: ${ms}ms`,
    `Seed: ${seed}`
  ];
  return parts.join("\n");
}

async function onShare() {
  const text = state.lastSlip || "No slip yet. Spin first to generate an invoice.";
  try {
    if (navigator.share) {
      await navigator.share({ title: "Prompt Casino slip", text });
      setStatus("Shared slip via Web Share API.", "good");
      logLine("Share", "Slip shared.");
      return;
    }
  } catch {
    // fall back to clipboard
  }

  try {
    await navigator.clipboard.writeText(text);
    setStatus("Slip copied to clipboard.", "good");
    logLine("Share", "Copied slip to clipboard.");
    playSound("tick");
  } catch {
    setStatus("Unable to share. Your browser said: no.", "warn");
    logLine("Share", "Clipboard/Web Share unavailable.");
  }
}

async function onReset() {
  const ok = confirm("Factory reset? This deletes your local tokens and spin history.");
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

async function onInstall() {
  if (!deferredInstallPrompt) return;
  try {
    ui.installBtn.disabled = true;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
  } finally {
    deferredInstallPrompt = null;
    ui.installBtn.hidden = true;
    ui.installBtn.disabled = false;
  }
}

async function registerServiceWorker() {
  try {
    if (!("serviceWorker" in navigator)) return;
    const isSecure =
      location.protocol === "https:" || location.hostname === "localhost";
    if (!isSecure) {
      logLine("PWA", "Service worker skipped (needs https:// or localhost).");
      return;
    }
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    logLine("PWA", "Offline cache enabled via service worker.");
  } catch {
    logLine("PWA", "Service worker failed to register.");
  }
}

async function requestStoragePersistence() {
  try {
    if (!navigator.storage?.persisted || !navigator.storage?.persist) return;
    const already = await navigator.storage.persisted();
    if (already) {
      logLine("Storage", "Persistent storage already granted.");
      return;
    }
    const ok = await navigator.storage.persist();
    logLine(
      "Storage",
      ok
        ? "Requested persistent storage: granted."
        : "Requested persistent storage: denied (browser chose chaos)."
    );
  } catch {
    // ignore
  }
}

function tryVibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

let audioCtx = null;
function playSound(kind) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();

    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g);
    g.connect(audioCtx.destination);

    const base = kind === "good" ? 660 : kind === "bad" ? 140 : 420;
    const end = kind === "good" ? 880 : kind === "bad" ? 90 : 520;
    o.frequency.setValueAtTime(base, t0);
    o.frequency.exponentialRampToValueAtTime(end, t0 + 0.08);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);

    o.start(t0);
    o.stop(t0 + 0.14);
  } catch {
    // ignore
  }
}

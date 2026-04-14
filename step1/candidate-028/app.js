/* Token Tumbler 9000 — intentionally silly, intentionally offline-able. */

const STORAGE_KEY = "token-tumbler-state-v1";

const deepClone = (obj) => {
  if (globalThis.structuredClone) return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
};

const els = {
  balance: document.getElementById("balance"),
  costPerSpin: document.getElementById("costPerSpin"),
  reels: [0, 1, 2].map((i) => document.getElementById(`reel${i}`)),
  resultTitle: document.getElementById("resultTitle"),
  resultDetail: document.getElementById("resultDetail"),
  temperature: document.getElementById("temperature"),
  temperatureValue: document.getElementById("temperatureValue"),
  context: document.getElementById("context"),
  prompt: document.getElementById("prompt"),
  spin: document.getElementById("spin"),
  autospin: document.getElementById("autospin"),
  reset: document.getElementById("reset"),
  share: document.getElementById("share"),
  copy: document.getElementById("copy"),
  installHint: document.getElementById("installHint"),
  log: document.getElementById("log"),
  spins: document.getElementById("spins"),
  wins: document.getElementById("wins"),
};

const CONTEXTS = {
  small: { label: "8K", baseCost: 80, computeTax: 0.9 },
  medium: { label: "32K", baseCost: 120, computeTax: 1.4 },
  large: { label: "128K", baseCost: 200, computeTax: 2.25 },
};

const SYMBOLS = [
  { sym: "🪙", w: 8, kind: "coin" },
  { sym: "🤖", w: 10, kind: "bot" },
  { sym: "🧠", w: 9, kind: "brain" },
  { sym: "🧪", w: 9, kind: "lab" },
  { sym: "🧵", w: 10, kind: "thread" },
  { sym: "📈", w: 9, kind: "up" },
  { sym: "📉", w: 9, kind: "down" },
  { sym: "🔥", w: 7, kind: "burn" },
  { sym: "🐛", w: 6, kind: "bug" },
];

const DEFAULT_STATE = {
  balance: 5000,
  spins: 0,
  wins: 0,
  temperature: 1.0,
  context: "medium",
  prompt: "",
  lastReceipt: "",
  lastSymbols: ["—", "—", "—"],
};

let state = loadState();
let spinning = false;
let autoSpinOn = false;
let autoTimer = null;
let installPromptEvent = null;
let wakeLock = null;

// ---- Platform APIs: storage, crypto, audio, vibrate, share, clipboard, SW, wake lock ----

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return deepClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return { ...deepClone(DEFAULT_STATE), ...parsed };
  } catch {
    return deepClone(DEFAULT_STATE);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function nowStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function u32() {
  if (globalThis.crypto?.getRandomValues) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0];
  }
  return Math.floor(Math.random() * 2 ** 32);
}

function rand01() {
  return u32() / 2 ** 32;
}

function weightedPick(items) {
  const total = items.reduce((s, it) => s + it.w, 0);
  let r = rand01() * total;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

function computeCost() {
  const t = Number(state.temperature);
  const ctx = CONTEXTS[state.context] ?? CONTEXTS.medium;
  const tempMultiplier = 1 + t * 0.35;
  const cost = Math.round(ctx.baseCost * ctx.computeTax * tempMultiplier);
  return Math.max(1, cost);
}

let audio = null;

function ensureAudio() {
  if (audio) return audio;
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctx) return null;
  audio = new Ctx();
  return audio;
}

function playTone({ freq = 440, ms = 90, type = "sine", gain = 0.03 } = {}) {
  const ctx = ensureAudio();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    // Best-effort resume; browsers require gesture, but we call this after clicks.
    ctx.resume().catch(() => {});
  }
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g);
  g.connect(ctx.destination);
  const t0 = ctx.currentTime;
  o.start(t0);
  o.stop(t0 + ms / 1000);
}

function vibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

async function copyText(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

async function shareText(text) {
  try {
    if (navigator.share) {
      await navigator.share({ text, title: "Token Tumbler 9000" });
      return true;
    }
  } catch {
    // user cancelled or not supported
  }
  return false;
}

async function setWakeLock(on) {
  if (!("wakeLock" in navigator)) return;
  try {
    if (on) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
      });
    } else if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    // ignore
  }
}

// ---- Game logic ----

function computeSymbolTable(temperature) {
  const t = clamp(temperature, 0, 2);
  const chaos = t / 2;

  // Chaos makes bugs & fire more likely; low temp makes boring bots more likely.
  return SYMBOLS.map((s) => {
    let w = s.w;
    if (s.kind === "bug" || s.kind === "burn" || s.kind === "down") w *= 1 + chaos * 0.9;
    if (s.kind === "bot" || s.kind === "thread") w *= 1 + (1 - chaos) * 0.5;
    if (s.kind === "coin") w *= 1 - chaos * 0.25;
    return { ...s, w: Math.max(1, Math.round(w * 10)) };
  });
}

function payoutFor(symbols, cost, temperature) {
  const [a, b, c] = symbols;
  const allSame = a === b && b === c;
  const twoSame = a === b || b === c || a === c;
  const t = clamp(temperature, 0, 2);
  const chaos = t / 2;

  const kinds = new Map(SYMBOLS.map((s) => [s.sym, s.kind]));
  const kindList = symbols.map((s) => kinds.get(s) ?? "mystery");

  const countKind = (k) => kindList.filter((x) => x === k).length;
  const coins = countKind("coin");
  const burns = countKind("burn");
  const bugs = countKind("bug");
  const downs = countKind("down");
  const ups = countKind("up");
  const bots = countKind("bot");
  const brains = countKind("brain");

  // Base multipliers are scaled by cost so the economy feels consistent across context sizes.
  if (allSame && coins === 3) {
    return { payout: Math.round(cost * (18 - chaos * 4)), title: "Token jackpot", detail: "You optimized… accidentally.", tag: "good" };
  }
  if (allSame && brains === 3) {
    return { payout: Math.round(cost * (10 - chaos * 2)), title: "3×🧠 big brain", detail: "The model read the docs. Briefly.", tag: "good" };
  }
  if (allSame && bots === 3) {
    return { payout: Math.round(cost * (6 - chaos)), title: "3×🤖 autopilot", detail: "It answered instantly. You didn't ask what it meant.", tag: "good" };
  }
  if (allSame && burns === 3) {
    return { payout: -Math.round(cost * (4 + chaos * 2)), title: "🔥🔥🔥 burn rate", detail: "Congrats, you discovered 'continuous inference.'", tag: "bad" };
  }
  if (allSame && bugs === 3) {
    return { payout: -Math.round(cost * (3 + chaos * 2)), title: "🐛🐛🐛 regression", detail: "It worked yesterday. It still does, but only in staging.", tag: "bad" };
  }
  if (downs >= 2) {
    return { payout: -Math.round(cost * (1.5 + chaos * 1.5)), title: "📉 slippage", detail: "Your evals got worse, but confidence stayed at 99%.", tag: "bad" };
  }
  if (ups >= 2 && coins >= 1) {
    return { payout: Math.round(cost * (2.2 - chaos * 0.3)), title: "📈 growth narrative", detail: "Ship it. Add a chart. Raise a round.", tag: "good" };
  }
  if (burns >= 1 && coins >= 1) {
    return { payout: -Math.round(cost * (1.2 + chaos * 0.6)), title: "🪙➡️🔥 tokens → heat", detail: "You traded budget for latency improvements nobody asked for.", tag: "warn" };
  }
  if (twoSame && coins >= 2) {
    return { payout: Math.round(cost * (3.1 - chaos * 0.8)), title: "two coins", detail: "A modest win (like a modest context window).", tag: "good" };
  }

  // Hallucination chance increases with temperature.
  const hallucinationRoll = rand01();
  const hallucinationChance = 0.05 + chaos * 0.2; // 5% → 25%
  if (hallucinationRoll < hallucinationChance) {
    const fake = Math.round(cost * (6 + chaos * 6));
    return {
      payout: -Math.round(cost * (1.1 + chaos * 0.7)),
      title: "Hallucinated payout",
      detail: `The model confidently claimed you won ${fake} tokens. Accounting disagreed.`,
      tag: "warn",
      hallucinated: fake,
    };
  }

  return { payout: 0, title: "No reward", detail: "The model needs more context. And by context, I mean money.", tag: "bad" };
}

function buildReceipt({ symbols, cost, delta, before, after, title, detail, hallucinated }) {
  const prompt = (state.prompt || "").trim();
  const temp = Number(state.temperature).toFixed(1);
  const ctx = CONTEXTS[state.context]?.label ?? state.context;
  const lines = [
    `Token Tumbler 9000 — receipt`,
    `Time: ${nowStamp()}`,
    `Prompt: ${prompt || "(none)"}`,
    `Temp: ${temp} • Context: ${ctx}`,
    `Cost: -${cost} tokens`,
    `Reels: ${symbols.join(" ")}`,
    hallucinated ? `Model claim: +${hallucinated} tokens (unverified)` : null,
    `Outcome: ${title}`,
    `Detail: ${detail}`,
    `Net: ${delta >= 0 ? "+" : ""}${delta} tokens`,
    `Balance: ${before} → ${after}`,
    `Disclaimer: results not reproducible due to nondeterminism (and vibes).`,
  ].filter(Boolean);
  return lines.join("\n");
}

function setResult(title, detail, tag = "warn") {
  els.resultTitle.textContent = title;
  els.resultDetail.textContent = detail;
  const map = { good: "var(--good)", bad: "var(--bad)", warn: "var(--warn)" };
  els.resultTitle.style.color = map[tag] ?? "var(--text)";
}

function logLine(tag, text) {
  const li = document.createElement("li");
  const badge = document.createElement("span");
  badge.className = `tag ${tag}`;
  badge.textContent = tag.toUpperCase();
  li.appendChild(badge);
  li.appendChild(document.createTextNode(`${nowStamp()} — ${text}`));
  els.log.prepend(li);
  while (els.log.children.length > 50) els.log.lastElementChild?.remove();
}

function paint() {
  const cost = computeCost();
  els.balance.textContent = String(state.balance);
  els.costPerSpin.textContent = String(cost);
  els.spins.textContent = String(state.spins);
  els.wins.textContent = String(state.wins);
  els.temperature.value = String(state.temperature);
  els.temperatureValue.textContent = Number(state.temperature).toFixed(1);
  els.context.value = state.context;
  els.prompt.value = state.prompt ?? "";
  for (let i = 0; i < 3; i += 1) els.reels[i].textContent = state.lastSymbols?.[i] ?? "—";

  const broke = state.balance < cost;
  els.spin.disabled = spinning || broke;
  els.autospin.disabled = spinning || broke;
  els.spin.textContent = broke ? "Out of tokens (sad)" : "Spin (generate)";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function spinReel(i, table, durationMs, settleSym) {
  const start = performance.now();
  let last = null;
  while (true) {
    const t = performance.now() - start;
    const p = clamp(t / durationMs, 0, 1);
    // slow down near the end
    const tickMs = 35 + 140 * p * p;
    if (!last || t - last >= tickMs) {
      const pick = weightedPick(table);
      els.reels[i].textContent = pick.sym;
      last = t;
      playTone({ freq: 220 + i * 90 + (u32() % 30), ms: 18, type: "square", gain: 0.018 });
    }
    if (p >= 1) break;
    await sleep(10);
  }
  els.reels[i].textContent = settleSym;
  playTone({ freq: 420 + i * 120, ms: 70, type: "triangle", gain: 0.02 });
}

async function doSpinOnce() {
  if (spinning) return;
  const cost = computeCost();
  if (state.balance < cost) {
    setResult("Insufficient tokens", "Please lower temperature, reduce context, or touch grass.", "bad");
    logLine("bad", `Spin blocked: needed ${cost}, had ${state.balance}.`);
    vibrate([30, 40, 30]);
    return;
  }

  spinning = true;
  paint();

  // Spend tokens up-front, like real life.
  const before = state.balance;
  state.balance = Math.max(0, state.balance - cost);

  const table = computeSymbolTable(Number(state.temperature));

  // Preselect final symbols so payout logic is stable.
  const final = [0, 1, 2].map(() => weightedPick(table).sym);

  // Reel animation stagger
  setResult("Generating...", "Sampling from the distribution (and your wallet).", "warn");
  vibrate(18);
  await Promise.all([
    spinReel(0, table, 950, final[0]),
    sleep(140).then(() => spinReel(1, table, 1100, final[1])),
    sleep(280).then(() => spinReel(2, table, 1250, final[2])),
  ]);

  const outcome = payoutFor(final, cost, Number(state.temperature));

  const delta = outcome.payout;
  state.balance = Math.max(0, state.balance + delta);
  state.spins += 1;
  if (delta > 0) state.wins += 1;
  state.lastSymbols = final;

  const after = state.balance;
  state.lastReceipt = buildReceipt({
    symbols: final,
    cost,
    delta,
    before,
    after,
    title: outcome.title,
    detail: outcome.detail,
    hallucinated: outcome.hallucinated,
  });

  if (delta > 0) {
    setResult(outcome.title, `${outcome.detail} (+${delta} tokens)`, outcome.tag);
    logLine("good", `${final.join(" ")} — +${delta} tokens (${outcome.title}).`);
    vibrate([25, 20, 25, 20, 60]);
    playTone({ freq: 740, ms: 130, type: "sine", gain: 0.03 });
    playTone({ freq: 880, ms: 140, type: "sine", gain: 0.03 });
  } else if (delta < 0) {
    setResult(outcome.title, `${outcome.detail} (${delta} tokens)`, outcome.tag);
    logLine(outcome.tag, `${final.join(" ")} — ${delta} tokens (${outcome.title}).`);
    vibrate([60, 25, 30]);
    playTone({ freq: 170, ms: 190, type: "sawtooth", gain: 0.02 });
  } else {
    setResult(outcome.title, outcome.detail, outcome.tag);
    logLine(outcome.tag, `${final.join(" ")} — 0 tokens (${outcome.title}).`);
    vibrate(12);
    playTone({ freq: 260, ms: 120, type: "triangle", gain: 0.02 });
  }

  saveState();
  spinning = false;
  paint();
}

function stopAutoSpin(reason) {
  if (!autoSpinOn) return;
  autoSpinOn = false;
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = null;
  els.autospin.setAttribute("aria-pressed", "false");
  els.autospin.textContent = "Auto";
  setWakeLock(false);
  if (reason) logLine("warn", `Auto-spin stopped: ${reason}`);
}

async function autoLoop() {
  if (!autoSpinOn) return;
  await doSpinOnce();
  if (!autoSpinOn) return;
  const cost = computeCost();
  if (state.balance < cost) {
    stopAutoSpin("ran out of tokens");
    setResult("Auto-spin halted", "Out of tokens. The GPU is finally resting.", "warn");
    return;
  }
  autoTimer = setTimeout(autoLoop, 550);
}

function onReset() {
  if (!confirm("Reset balance + stats? This cannot be un-generated.")) return;
  state = deepClone(DEFAULT_STATE);
  saveState();
  els.log.innerHTML = "";
  setResult("Reset complete", "Fresh tokens, fresh delusions.", "warn");
  logLine("warn", "State reset.");
  paint();
}

async function onCopy() {
  const text = state.lastReceipt || "No receipt yet. Spin first.";
  const ok = await copyText(text);
  setResult(ok ? "Copied" : "Copy failed", ok ? "Receipt copied to clipboard." : "Your clipboard refused to align.", ok ? "good" : "bad");
  if (ok) vibrate(12);
}

async function onShare() {
  const cost = computeCost();
  const prompt = (state.prompt || "").trim();
  const msg = [
    `Token Tumbler 9000`,
    `Balance: ${state.balance} 🪙`,
    `Temp: ${Number(state.temperature).toFixed(1)} • Context: ${CONTEXTS[state.context]?.label ?? state.context}`,
    prompt ? `Prompt: "${prompt}"` : null,
    `Cost/spin: ${cost} tokens`,
    `Latest reels: ${(state.lastSymbols || ["—", "—", "—"]).join(" ")}`,
    `Disclaimer: I definitely evaluated this.`,
  ]
    .filter(Boolean)
    .join("\n");

  const shared = await shareText(msg);
  if (shared) {
    setResult("Shared", "You have distributed the vibes.", "good");
    return;
  }
  const ok = await copyText(msg);
  setResult(ok ? "Copied" : "Share failed", ok ? "Share text copied instead." : "No share and no clipboard. Classic.", ok ? "warn" : "bad");
}

// ---- Wire up UI ----

function init() {
  // Restore UI state
  state.temperature = clamp(Number(state.temperature ?? 1), 0, 2);
  if (!CONTEXTS[state.context]) state.context = "medium";
  state.prompt = String(state.prompt ?? "");
  state.balance = Math.max(0, Math.floor(Number(state.balance ?? DEFAULT_STATE.balance)));
  state.spins = Math.max(0, Math.floor(Number(state.spins ?? 0)));
  state.wins = Math.max(0, Math.floor(Number(state.wins ?? 0)));
  state.lastSymbols = Array.isArray(state.lastSymbols) ? state.lastSymbols.slice(0, 3) : ["—", "—", "—"];
  while (state.lastSymbols.length < 3) state.lastSymbols.push("—");

  els.temperature.addEventListener("input", () => {
    state.temperature = clamp(Number(els.temperature.value), 0, 2);
    els.temperatureValue.textContent = Number(state.temperature).toFixed(1);
    saveState();
    paint();
  });

  els.context.addEventListener("change", () => {
    state.context = String(els.context.value);
    saveState();
    paint();
  });

  els.prompt.addEventListener("input", () => {
    state.prompt = String(els.prompt.value || "");
    saveState();
  });

  els.spin.addEventListener("click", async () => {
    ensureAudio();
    await doSpinOnce();
  });

  els.autospin.addEventListener("click", async () => {
    ensureAudio();
    if (autoSpinOn) {
      stopAutoSpin("user stopped");
      setResult("Auto-spin off", "Manual mode enabled. Your conscience may return.", "warn");
      return;
    }
    autoSpinOn = true;
    els.autospin.setAttribute("aria-pressed", "true");
    els.autospin.textContent = "Stop";
    logLine("warn", "Auto-spin started.");
    setWakeLock(true);
    await autoLoop();
  });

  els.reset.addEventListener("click", onReset);
  els.copy.addEventListener("click", onCopy);
  els.share.addEventListener("click", onShare);

  // Install prompt (PWA)
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPromptEvent = e;
    els.installHint.hidden = false;
  });
  els.installHint.addEventListener("click", async () => {
    if (!installPromptEvent) return;
    els.installHint.hidden = true;
    installPromptEvent.prompt();
    try {
      await installPromptEvent.userChoice;
    } finally {
      installPromptEvent = null;
    }
  });

  // Service worker
  if ("serviceWorker" in navigator) {
    // Works on https or localhost; silently no-op elsewhere.
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  // Initialize UI
  setResult("Ready", "Spin to spend tokens and generate confidence.", "warn");
  paint();
}

init();

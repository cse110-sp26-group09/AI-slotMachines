/* Token Tombola — a tiny, satirical slot machine.
   Vanilla JS + platform APIs: localStorage, Web Audio, Vibration, Notifications, Clipboard/Share. */

const STORAGE_KEY = "token-tombola:v1";

const SYMBOLS = [
  { id: "token", name: "Token", emoji: "🪙", weight: 18 },
  { id: "gpu", name: "GPU", emoji: "🧠", weight: 10 },
  { id: "prompt", name: "Prompt", emoji: "🧾", weight: 14 },
  { id: "rlhf", name: "RLHF", emoji: "🫶", weight: 9 },
  { id: "latency", name: "Latency", emoji: "🐢", weight: 10 },
  { id: "rate_limit", name: "Rate Limit", emoji: "🚫", weight: 7 },
  { id: "hallucination", name: "Hallucination", emoji: "🦄", weight: 8 },
  { id: "bug", name: "Prod Bug", emoji: "🪲", weight: 6 },
];

const PAYOUTS_3 = {
  token: 120,
  gpu: 220,
  prompt: 100,
  rlhf: 160,
  latency: 60,
  rate_limit: 0,
  hallucination: -50,
  bug: -80,
};

const PAYOUTS_2 = {
  token: 20,
  gpu: 32,
  prompt: 16,
  rlhf: 26,
  latency: 10,
  rate_limit: 0,
  hallucination: -10,
  bug: -16,
};

const DEFAULT_STATE = {
  balance: 250,
  totalSpins: 0,
  totalWins: 0,
  bestPayout: 0,
  muted: false,
  reducedMotion: null, // null = follow system
  notificationsWanted: false,
  rateLimitedUntil: 0, // epoch ms
  lastDailyClaim: 0, // epoch day
  vcDebt: 0,
};

const $ = (sel) => /** @type {HTMLElement} */ (document.querySelector(sel));

function todayEpochDay() {
  const d = new Date();
  const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(utc / 86400000);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_STATE), ...parsed };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function weightedPick(items) {
  const total = items.reduce((sum, it) => sum + it.weight, 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

function computeSpinCost() {
  const inflationSteps = Math.floor(state.totalSpins / 25);
  const debtTax = Math.ceil(state.vcDebt / 200);
  return 10 + inflationSteps + debtTax;
}

function inflationLabel() {
  const inflationSteps = Math.floor(state.totalSpins / 25);
  if (state.rateLimitedUntil > Date.now()) return "rate-limited";
  if (inflationSteps <= 0) return "stable-ish";
  if (inflationSteps <= 2) return "spicy";
  if (inflationSteps <= 4) return "chaotic";
  return "hyperpromptinflation";
}

function describeCombo(results) {
  const ids = results.map((r) => r.id);
  const counts = ids.reduce((m, id) => m.set(id, (m.get(id) || 0) + 1), new Map());
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const [topId, topCount] = sorted[0];
  const top = SYMBOLS.find((s) => s.id === topId);
  if (!top) return "mystery";
  if (topCount === 3) return `triple ${top.name}`;
  if (topCount === 2) return `pair of ${top.name}`;
  return "no pattern";
}

function payoutFor(results) {
  const ids = results.map((r) => r.id);
  const hasRateLimit = ids.includes("rate_limit");
  const hasHallucination = ids.includes("hallucination");
  const hasBug = ids.includes("bug");

  const counts = ids.reduce((m, id) => m.set(id, (m.get(id) || 0) + 1), new Map());
  const triples = Array.from(counts.entries()).find(([, c]) => c === 3);
  if (triples) {
    const [id] = triples;
    return {
      payout: PAYOUTS_3[id] ?? 0,
      special: id === "rate_limit" ? "ratelimit" : null,
    };
  }

  const pair = Array.from(counts.entries()).find(([, c]) => c === 2);
  if (pair) {
    const [id] = pair;
    let payout = PAYOUTS_2[id] ?? 0;
    if (hasRateLimit) payout -= 6;
    return { payout, special: hasRateLimit ? "ratelimit" : null };
  }

  let payout = 0;
  if (hasRateLimit) payout -= 10;
  if (hasHallucination && hasBug) payout -= 15;
  return { payout, special: hasRateLimit ? "ratelimit" : null };
}

function setResult(tag, text, vibe) {
  $("#resultTag").textContent = tag;
  $("#resultText").textContent = text;
  $("#liveAnnounce").textContent = `${tag}. ${text}`;
  updateThemeVibes(vibe || "");
}

function updateThemeVibes(vibe) {
  const tagEl = $("#resultTag");
  tagEl.style.borderColor = "rgba(255,255,255,.16)";
  tagEl.style.color = "rgba(233,237,247,.95)";
  tagEl.style.background = "rgba(16,24,44,.55)";
  if (vibe === "good") {
    tagEl.style.borderColor = "rgba(57,240,180,.40)";
    tagEl.style.background = "rgba(57,240,180,.10)";
    tagEl.style.color = "rgba(57,240,180,.96)";
  }
  if (vibe === "bad") {
    tagEl.style.borderColor = "rgba(255,90,143,.40)";
    tagEl.style.background = "rgba(255,90,143,.10)";
    tagEl.style.color = "rgba(255,90,143,.96)";
  }
  if (vibe === "warn") {
    tagEl.style.borderColor = "rgba(255,214,107,.45)";
    tagEl.style.background = "rgba(255,214,107,.10)";
    tagEl.style.color = "rgba(255,214,107,.96)";
  }
}

function announceHUD() {
  $("#balanceTokens").textContent = String(Math.floor(state.balance));
  const cost = computeSpinCost();
  $("#spinCost").textContent = String(cost);
  $("#inflation").textContent = inflationLabel();
  $("#statSpins").textContent = String(state.totalSpins);
  $("#statWins").textContent = String(state.totalWins);
  $("#statBest").textContent = String(state.bestPayout);

  const now = Date.now();
  const spinBtn = /** @type {HTMLButtonElement} */ ($("#spinBtn"));
  const auto10Btn = /** @type {HTMLButtonElement} */ ($("#auto10Btn"));
  const hint = $("#spinHint");

  const rateLimited = state.rateLimitedUntil > now;
  const insufficient = state.balance < cost;
  spinBtn.disabled = rateLimited || insufficient || spinning;
  auto10Btn.disabled = rateLimited || insufficient || spinning;

  if (rateLimited) hint.textContent = "the API says: come back later";
  else if (insufficient) hint.textContent = "insufficient tokens. consider VC money.";
  else hint.textContent = "pay tokens, maybe win vibes";
}

function prefersReducedMotion() {
  if (state.reducedMotion === true) return true;
  if (state.reducedMotion === false) return false;
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function setReel(reelEl, sym) {
  reelEl.querySelector("[data-reel-symbol]").textContent = sym.emoji;
  reelEl.querySelector("[data-reel-label]").textContent = sym.name;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let audioCtx = null;
let spinning = false;

function getAudio() {
  if (state.muted) return null;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  } catch {
    return null;
  }
}

function beep({ freq = 440, dur = 0.08, type = "sine", gain = 0.02 } = {}) {
  const ctx = getAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.value = gain;
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur);
}

function triad(base) {
  beep({ freq: base, dur: 0.07, type: "triangle", gain: 0.018 });
  setTimeout(() => beep({ freq: base * 1.25, dur: 0.08, type: "triangle", gain: 0.016 }), 80);
  setTimeout(() => beep({ freq: base * 1.5, dur: 0.09, type: "triangle", gain: 0.014 }), 165);
}

async function maybeNotify(title, body) {
  if (!state.notificationsWanted) return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body });
  } catch {}
}

function vibrate(pattern) {
  if (!navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {}
}

function formatSigned(n) {
  return n > 0 ? `+${n}` : String(n);
}

function ensureBalanceBounds() {
  state.balance = Math.max(-9999, Math.floor(state.balance));
}

function applyRateLimit(ms) {
  const until = Date.now() + ms;
  state.rateLimitedUntil = Math.max(state.rateLimitedUntil, until);
  saveState();
  announceHUD();
  maybeNotify("Rate limited", "Your token economy has been temporarily protected from you.");
}

async function spinOnce() {
  const now = Date.now();
  if (spinning) return;
  if (state.rateLimitedUntil > now) return;

  const cost = computeSpinCost();
  if (state.balance < cost) {
    setResult("DECLINED", "Insufficient tokens. The economy says no.", "warn");
    vibrate([40, 30, 40]);
    return;
  }

  spinning = true;
  state.balance -= cost;
  state.totalSpins += 1;
  saveState();
  announceHUD();

  beep({ freq: 220, dur: 0.06, type: "sawtooth", gain: 0.02 });
  setResult("SPINNING", "Sampling random variables. Please enjoy the illusion of control.", "");

  const reels = [$("#reel0"), $("#reel1"), $("#reel2")];
  reels.forEach((r) => r.classList.add("is-spinning"));

  const final = [null, null, null];
  const durations = prefersReducedMotion() ? [200, 260, 320] : [900, 1200, 1500];
  const intervals = [];

  for (let i = 0; i < 3; i++) {
    intervals[i] = setInterval(() => {
      const sym = weightedPick(SYMBOLS);
      setReel(reels[i], sym);
      if (i === 0) beep({ freq: 270 + Math.random() * 40, dur: 0.02, type: "square", gain: 0.008 });
    }, prefersReducedMotion() ? 80 : 48);
  }

  for (let i = 0; i < 3; i++) {
    await sleep(durations[i]);
    clearInterval(intervals[i]);
    final[i] = weightedPick(SYMBOLS);
    setReel(reels[i], final[i]);
    reels[i].classList.remove("is-spinning");
    beep({ freq: 330 + i * 80, dur: 0.05, type: "triangle", gain: 0.014 });
  }

  const results = final.map((s) => s || weightedPick(SYMBOLS));
  const { payout, special } = payoutFor(results);
  state.balance += payout;
  ensureBalanceBounds();
  if (payout > 0) state.totalWins += 1;
  state.bestPayout = Math.max(state.bestPayout, payout);
  saveState();
  announceHUD();

  const combo = describeCombo(results);
  const costText = `${cost} tokens burned`;
  const signed = formatSigned(payout);

  if (special === "ratelimit") {
    applyRateLimit(2500 + Math.random() * 2000);
    setResult(
      "RATE LIMIT",
      `You hit a rate limit. ${costText}. Payout ${signed}. Please stop being enthusiastic.`,
      "warn",
    );
    vibrate([30, 60, 30]);
    spinning = false;
    return;
  }

  if (payout >= 150) {
    triad(440);
    vibrate([20, 40, 20, 70, 20]);
    setResult("JACKPOT", `${combo}. Payout ${signed}. The model suddenly “generalized”.`, "good");
  } else if (payout > 0) {
    triad(330);
    vibrate([18, 20, 18]);
    setResult("WIN", `${combo}. Payout ${signed}. Enjoy your synthetic prosperity.`, "good");
  } else if (payout < 0) {
    beep({ freq: 140, dur: 0.14, type: "sawtooth", gain: 0.02 });
    vibrate([70, 40, 70]);
    setResult("LOSS", `${combo}. Payout ${signed}. The system is working as intended.`, "bad");
  } else {
    setResult("MEH", `${combo}. Payout ${signed}. Congrats on your neutral gradient.`, "");
  }

  spinning = false;
  announceHUD();
}

async function autoSpin10() {
  if (spinning) return;
  const cost = computeSpinCost();
  if (state.balance < cost) {
    setResult("DECLINED", "Auto-spin denied. You cannot automate bankruptcy without tokens.", "warn");
    return;
  }

  const ok = confirm("Auto ×10 will spin up to 10 times (or until you get rate-limited / run out of tokens). Continue?");
  if (!ok) return;

  for (let i = 0; i < 10; i++) {
    await spinOnce();
    await sleep(prefersReducedMotion() ? 60 : 160);
    if (state.rateLimitedUntil > Date.now()) break;
    if (state.balance < computeSpinCost()) break;
  }
}

function claimDaily() {
  const day = todayEpochDay();
  if (state.lastDailyClaim === day) {
    setResult("DAILY", "Daily grant already claimed. Please wait for the next fiscal quarter.", "warn");
    return;
  }
  const grant = 120 + Math.floor(Math.random() * 80);
  state.balance += grant;
  state.lastDailyClaim = day;
  saveState();
  announceHUD();
  triad(300);
  setResult("GRANT", `You received a daily token grant: +${grant}. The audit department is impressed.`, "good");
}

function askVC() {
  const ok = confirm("Take VC runway: +400 tokens now, but adds +400 VC debt (increases future spin cost). Accept?");
  if (!ok) return;
  state.balance += 400;
  state.vcDebt += 400;
  saveState();
  announceHUD();
  setResult("RUNWAY", "VC money acquired. Token cost inflation has been successfully outsourced to Future You.", "warn");
  vibrate([20, 30, 20, 30, 60]);
}

function rebootEconomy() {
  const cost = 180;
  if (state.balance < cost) {
    setResult("REBOOT", `Reboot denied. You need ${cost} tokens to afford “decentralized optimism”.`, "warn");
    return;
  }
  const ok = confirm(`Reboot economy for ${cost} tokens? This reduces inflation and halves VC debt.`);
  if (!ok) return;
  state.balance -= cost;
  state.totalSpins = Math.max(0, state.totalSpins - 60);
  state.vcDebt = Math.floor(state.vcDebt / 2);
  state.rateLimitedUntil = 0;
  saveState();
  announceHUD();
  triad(360);
  setResult("REBOOTED", "Economy rebooted. The graph looks great. Nobody ask why.", "good");
}

function bragText() {
  const cost = computeSpinCost();
  const inflationSteps = Math.floor(state.totalSpins / 25);
  const vibe =
    state.bestPayout >= 150
      ? "I just generalized."
      : state.bestPayout > 0
        ? "I achieved token-positive vibes."
        : "I am conducting rigorous negative-profit research.";
  const debt = state.vcDebt > 0 ? ` (VC debt: ${state.vcDebt})` : "";
  return `I’m playing Token Tombola 🤖\nBalance: ${state.balance} tokens${debt}\nSpin cost: ${cost} (inflation tier ${inflationSteps})\nBest payout: ${state.bestPayout}\n${vibe}\n#AIEconomy #TotallyNotAGamble`;
}

async function copyBrag() {
  const text = bragText();
  try {
    await navigator.clipboard.writeText(text);
    setResult("COPIED", "Brag copied to clipboard. Remember to add “thoughts are my own”.", "good");
  } catch {
    setResult("OOPS", "Clipboard blocked. Your browser is protecting society from you.", "warn");
  }
}

async function shareBrag() {
  const text = bragText();
  const shareNote = $("#shareNote");
  if (!navigator.share) {
    shareNote.textContent = "Share API not available here. Copy works everywhere.";
    return;
  }
  try {
    await navigator.share({ title: "Token Tombola", text });
    shareNote.textContent = "Shared. The timeline has been updated.";
  } catch {}
}

async function toggleNotifications(wanted) {
  state.notificationsWanted = wanted;
  saveState();
  if (!wanted) return;
  if (!("Notification" in window)) {
    setResult("NOTIFY", "Notifications aren’t supported in this browser.", "warn");
    return;
  }
  if (Notification.permission === "granted") return;
  if (Notification.permission === "denied") {
    setResult("NOTIFY", "Notifications are blocked. Your browser has healthy boundaries.", "warn");
    return;
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") setResult("NOTIFY", "Permission not granted. The economy remains blissfully silent.", "warn");
  } catch {}
}

function init() {
  // Seed reels
  [$("#reel0"), $("#reel1"), $("#reel2")].forEach((r) => setReel(r, weightedPick(SYMBOLS)));

  $("#muteBtn").addEventListener("click", () => {
    state.muted = !state.muted;
    $("#muteBtn").setAttribute("aria-pressed", state.muted ? "true" : "false");
    $("#muteBtn").textContent = `Sound: ${state.muted ? "off" : "on"}`;
    saveState();
  });

  $("#spinBtn").addEventListener("click", async () => {
    const ctx = getAudio();
    if (ctx && ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {}
    }
    spinOnce();
  });

  $("#auto10Btn").addEventListener("click", autoSpin10);
  $("#dailyBtn").addEventListener("click", claimDaily);
  $("#vcBtn").addEventListener("click", askVC);
  $("#resetEconomyBtn").addEventListener("click", rebootEconomy);
  $("#copyBtn").addEventListener("click", copyBrag);
  $("#shareBtn").addEventListener("click", shareBrag);

  const reducedToggle = /** @type {HTMLInputElement} */ ($("#reducedMotionToggle"));
  reducedToggle.checked = state.reducedMotion === true;
  reducedToggle.addEventListener("change", () => {
    state.reducedMotion = reducedToggle.checked ? true : null;
    saveState();
    announceHUD();
    setResult("MOTION", reducedToggle.checked ? "Motion reduced." : "Motion follows system preference.", "good");
  });

  const notifToggle = /** @type {HTMLInputElement} */ ($("#notificationsToggle"));
  notifToggle.checked = !!state.notificationsWanted;
  notifToggle.addEventListener("change", () => toggleNotifications(notifToggle.checked));

  // Rate-limit tick + unlock notice
  setInterval(() => {
    const now = Date.now();
    if (state.rateLimitedUntil > now) {
      announceHUD();
      return;
    }
    if (state.rateLimitedUntil !== 0) {
      state.rateLimitedUntil = 0;
      saveState();
      announceHUD();
      maybeNotify("Rate limit lifted", "The economy is once again vulnerable.");
    }
  }, 500);

  $("#shareNote").textContent = navigator.share ? "Share API supported here." : "Share API not supported here.";

  if (state.balance < -500) {
    setResult("DEBT", "You’re deep in token debt. Consider rebooting the economy or calling your accountant.", "warn");
  }

  announceHUD();
}

let state = loadState();
init();

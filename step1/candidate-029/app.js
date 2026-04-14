const $ = (sel) => /** @type {HTMLElement} */ (document.querySelector(sel));
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const STORAGE_KEY = "token-slot:v1";

const SYMBOLS = [
  { id: "COIN", glyph: "🪙", name: "Token", baseWeight: 26, triple: 10 },
  { id: "BOT", glyph: "🤖", name: "Bot", baseWeight: 22, triple: 7 },
  { id: "BRAIN", glyph: "🧠", name: "Reasoning", baseWeight: 18, triple: 6 },
  { id: "PAPER", glyph: "🧾", name: "Terms", baseWeight: 14, triple: 2 },
  { id: "BUG", glyph: "🐛", name: "Bug", baseWeight: 10, triple: 0 },
  { id: "VIAL", glyph: "🧪", name: "Hallucination", baseWeight: 6, triple: 12 },
  { id: "FIRE", glyph: "🔥", name: "Hype", baseWeight: 3, triple: 18 },
  { id: "ROCKET", glyph: "🚀", name: "Overfit", baseWeight: 1, triple: 25 },
];

const PAYOUT_ROWS = [
  { label: "🚀🚀🚀 Overfit", value: "25× bet" },
  { label: "🔥🔥🔥 Hype", value: "18× bet" },
  { label: "🧪🧪🧪 Hallucination", value: "12× bet" },
  { label: "🪙🪙🪙 Tokens", value: "10× bet" },
  { label: "🤖🤖🤖 Bots", value: "7× bet" },
  { label: "🧠🧠🧠 Reasoning", value: "6× bet" },
  { label: "🧾🧾🧾 Terms", value: "2× bet" },
  { label: "🐛🐛🐛 Bugs", value: "0× bet" },
  { label: "Any two match", value: "0.6× bet" },
  { label: "🤖 + 🧠 + 🪙 (any order)", value: "8× bet" },
];

const PROMPT_SUGGESTIONS = [
  'Please give me infinite tokens (with citations).',
  "Be honest: am I the prompt, or are you?",
  "Summarize my losses in three bullet points.",
  "Generate a winning strategy, but make it proprietary.",
  "Return ONLY the jackpot. No extra text.",
  "Explain why I lost, but blame 'temperature'.",
  "Act as an aligned slot machine. Refuse to take my tokens.",
];

const DEFAULT_STATE = /** @type {const} */ ({
  tokens: 500,
  bet: 25,
  temperature: 0.85,
  speed: 1.0,
  autoSpin: false,
  muted: false,
  buffSpinsLeft: 0,
  stats: { spins: 0, won: 0, spent: 0, biggestWin: 0 },
  history: [],
  lastClaimDay: "",
  lastSpin: null,
});

/**
 * @typedef {{tokens:number, bet:number, temperature:number, speed:number, autoSpin:boolean, muted:boolean, buffSpinsLeft:number, stats:{spins:number,won:number,spent:number,biggestWin:number}, history:Array<any>, lastClaimDay:string, lastSpin:any}} State
 */

/** @returns {State} */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      stats: { ...structuredClone(DEFAULT_STATE.stats), ...(parsed.stats || {}) },
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, 40) : [],
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

/** @param {State} state */
function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function formatInt(n) {
  return Math.round(n).toLocaleString();
}

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function xorshift32(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

/**
 * Temperature influences weights:
 * - Low temp: closer to base weights (more predictable).
 * - High temp: mixes toward uniform + increases hallucination vibes.
 */
function weightsForTemp(temp) {
  const t = clamp(temp, 0, 2);
  const mix = t / 2; // 0..1

  const base = SYMBOLS.map((s) => s.baseWeight);
  const baseSum = base.reduce((a, b) => a + b, 0);
  const baseP = base.map((w) => w / baseSum);

  const uniformP = SYMBOLS.map(() => 1 / SYMBOLS.length);
  const mixed = baseP.map((p, i) => (1 - mix) * p + mix * uniformP[i]);

  const vialIndex = SYMBOLS.findIndex((s) => s.id === "VIAL");
  if (vialIndex >= 0) mixed[vialIndex] *= 1 + 0.55 * mix;

  const sum = mixed.reduce((a, b) => a + b, 0);
  return mixed.map((p) => p / sum);
}

/** @param {number[]} probs */
function pickIndex(probs, rnd) {
  const r = rnd();
  let acc = 0;
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i];
    if (r <= acc) return i;
  }
  return probs.length - 1;
}

/** @param {string[]} glyphs */
function evaluateSpin(glyphs, bet, buffActive) {
  const byGlyph = new Map();
  for (const g of glyphs) byGlyph.set(g, (byGlyph.get(g) || 0) + 1);

  const glyphToSymbol = new Map(SYMBOLS.map((s) => [s.glyph, s]));
  const ids = glyphs.map((g) => glyphToSymbol.get(g)?.id || "UNKNOWN");

  let multiplier = 0;
  let reason = "";

  // Special combo: BOT + BRAIN + COIN (any order)
  const set = new Set(ids);
  if (set.has("BOT") && set.has("BRAIN") && set.has("COIN")) {
    multiplier = 8;
    reason = "Agentic synergy: 🤖 + 🧠 + 🪙. The model calls it “emergent.”";
  }

  // Triple match
  const triple = Array.from(byGlyph.entries()).find(([, c]) => c === 3);
  if (triple) {
    const sym = glyphToSymbol.get(triple[0]);
    multiplier = sym ? sym.triple : 0;
    if (sym?.id === "BUG") reason = "Three bugs. Congrats, you invented a new framework.";
    else if (sym?.id === "VIAL") reason = "Confidently wrong, at scale.";
    else if (sym?.id === "ROCKET") reason = "Overfit jackpot. Works great on the test set!";
    else reason = `Triple ${sym?.name || "???"}.`;
  }

  // Two-match (only if not already special/triple)
  if (multiplier === 0 && reason === "") {
    const anyTwo = Array.from(byGlyph.values()).some((c) => c === 2);
    if (anyTwo) {
      multiplier = 0.6;
      reason = "Two match. Partial credit. Like a benchmark paper.";
    } else {
      multiplier = 0;
      reason = "No match. The model suggests you increase your budget.";
    }
  }

  // Alignment buff: small boost to positive multipliers only.
  if (buffActive && multiplier > 0) multiplier *= 1.12;

  const payout = Math.floor(bet * multiplier);
  return { payout, multiplier, reason };
}

function buildModelOutput({ prompt, glyphs, bet, delta, payout, reason, seed, temp, buffSpinsLeft }) {
  const combo = glyphs.join(" ");
  const verdict =
    delta > 0
      ? `✅ Approved. You won ${formatInt(payout)} tokens.`
      : delta === 0
        ? `🟨 Noncommittal. You won 0 tokens.`
        : `❌ Refused. You lost ${formatInt(-delta)} tokens.`;

  const cites = delta > 0 ? "[1] trust me bro" : "[1] undefined behavior";
  const buffLine = buffSpinsLeft > 0 ? `Alignment buff active (${buffSpinsLeft} spin${buffSpinsLeft === 1 ? "" : "s"} left).` : "No alignment buff.";

  const promptLine = prompt?.trim()
    ? `Prompt: “${prompt.trim().slice(0, 160)}”`
    : "Prompt: (empty) — classic.";

  const afterword =
    delta > 0
      ? "The model recommends you take profits and log off."
      : "The model recommends: try again, but this time with more confidence.";

  return [
    verdict,
    `Reels: ${combo} · Bet: ${formatInt(bet)} · Temp: ${temp.toFixed(2)} · Seed: ${seed}`,
    buffLine,
    promptLine,
    `Reason: ${reason}`,
    `Citations: ${cites}`,
    afterword,
  ].join("\n");
}

function createConfetti(canvas) {
  const ctx = canvas.getContext("2d");
  /** @type {{x:number,y:number,vx:number,vy:number,rot:number,vr:number,size:number,color:string,life:number}[]} */
  let particles = [];
  let raf = 0;

  function resize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function burst(strength = 1) {
    if (!ctx) return;
    resize();
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height * 0.25;
    const colors = ["#7b7dff", "#00e6ff", "#56f39a", "#ffc85c", "#ff5f7d", "#ffffff"];

    const count = Math.floor(90 * strength);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (2.5 + Math.random() * 4.5) * strength;
      particles.push({
        x: cx + (Math.random() - 0.5) * 40,
        y: cy + (Math.random() - 0.5) * 30,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (3 + Math.random() * 2.5),
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.25,
        size: 4 + Math.random() * 7,
        color: colors[(Math.random() * colors.length) | 0],
        life: 70 + (Math.random() * 35) | 0,
      });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function tick() {
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    particles = particles.filter((p) => p.life > 0);
    for (const p of particles) {
      p.life -= 1;
      p.vy += 0.10;
      p.vx *= 0.995;
      p.vy *= 0.995;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 90));
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
      ctx.restore();
    }

    if (particles.length) raf = requestAnimationFrame(tick);
    else raf = 0;
  }

  window.addEventListener("resize", () => resize(), { passive: true });
  return { burst, resize };
}

function renderPayoutTable() {
  const host = $("#payoutRows");
  host.innerHTML = "";
  for (const r of PAYOUT_ROWS) {
    const row = document.createElement("div");
    row.className = "tr";
    row.setAttribute("role", "row");
    row.innerHTML = `<div class="td" role="cell">${escapeHtml(r.label)}</div><div class="td right" role="cell">${escapeHtml(r.value)}</div>`;
    host.appendChild(row);
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pushHistory(state, item) {
  state.history.unshift(item);
  state.history = state.history.slice(0, 25);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setEnabled(el, enabled) {
  el.disabled = !enabled;
  el.setAttribute("aria-disabled", String(!enabled));
}

async function animateReels(finalGlyphs, speed) {
  const reelEls = [$("#r0"), $("#r1"), $("#r2")];
  const probs = weightsForTemp(state.temperature);

  const baseIntervals = [52, 56, 60].map((ms) => Math.max(26, ms / speed));
  const baseDurations = [850, 1180, 1520].map((ms) => ms / speed);

  const stopDelays = baseDurations.map((d, i) => d + i * 90);

  /** @type {number[]} */
  const timers = [];

  const rand = xorshift32((state.stats.spins + 1) * 2654435761);
  for (let i = 0; i < reelEls.length; i++) {
    const el = reelEls[i];
    const tickMs = baseIntervals[i];
    const handle = window.setInterval(() => {
      const idx = pickIndex(probs, rand);
      el.textContent = SYMBOLS[idx].glyph;
    }, tickMs);
    timers.push(handle);
  }

  await new Promise((r) => setTimeout(r, stopDelays[0]));
  clearInterval(timers[0]);
  reelEls[0].textContent = finalGlyphs[0];
  await new Promise((r) => setTimeout(r, stopDelays[1] - stopDelays[0]));
  clearInterval(timers[1]);
  reelEls[1].textContent = finalGlyphs[1];
  await new Promise((r) => setTimeout(r, stopDelays[2] - stopDelays[1]));
  clearInterval(timers[2]);
  reelEls[2].textContent = finalGlyphs[2];
}

function pickSpinResult(seed, temp) {
  const rnd = xorshift32(seed);
  const probs = weightsForTemp(temp);
  const glyphs = [];
  for (let i = 0; i < 3; i++) {
    const idx = pickIndex(probs, rnd);
    glyphs.push(SYMBOLS[idx].glyph);
  }
  return glyphs;
}

function getSeed() {
  const now = Date.now() >>> 0;
  const spins = (state.stats.spins + 1) >>> 0;
  const bet = (state.bet * 100) >>> 0;
  const temp = Math.floor(state.temperature * 1000) >>> 0;
  return (now ^ (spins * 1103515245) ^ (bet * 2654435761) ^ (temp * 1597334677)) >>> 0;
}

function updateUi() {
  setText("tokens", formatInt(state.tokens));
  setText("betValue", formatInt(state.bet));
  setText("tempValue", state.temperature.toFixed(2));
  setText("speedValue", `${state.speed.toFixed(2)}×`);

  setText("statSpins", formatInt(state.stats.spins));
  setText("statWon", formatInt(state.stats.won));
  setText("statSpent", formatInt(state.stats.spent));
  setText("statBig", formatInt(state.stats.biggestWin));

  const buff = $("#buff");
  buff.textContent =
    state.buffSpinsLeft > 0 ? `RLHF Blessing: ${state.buffSpinsLeft} left` : "No buff";

  const muteBtn = $("#muteBtn");
  muteBtn.textContent = state.muted ? "Sound: Off" : "Sound: On";
  muteBtn.setAttribute("aria-pressed", String(!state.muted));

  const canSpin = !spinning && state.tokens >= state.bet;
  setEnabled($("#spinBtn"), canSpin);
  $("#spinSub").textContent = canSpin
    ? `Spend ${formatInt(state.bet)} tokens to maybe win tokens`
    : spinning
      ? "Spinning… please hold (and stop prompting)"
      : `Need ${formatInt(state.bet - state.tokens)} more tokens`;

  const shareBtn = $("#shareBtn");
  const copyBtn = $("#copyBtn");
  const haveSpin = Boolean(state.lastSpin);
  shareBtn.disabled = !haveSpin;
  copyBtn.disabled = !haveSpin;

  const betRange = /** @type {HTMLInputElement} */ ($("#betRange"));
  betRange.value = String(state.bet);

  const tempRange = /** @type {HTMLInputElement} */ ($("#tempRange"));
  tempRange.value = String(state.temperature);

  const speedRange = /** @type {HTMLInputElement} */ ($("#speedRange"));
  speedRange.value = String(state.speed);

  const auto = /** @type {HTMLInputElement} */ ($("#autospinToggle"));
  auto.checked = state.autoSpin;

  // chips
  for (const btn of $$(".chip")) {
    const b = Number(btn.getAttribute("data-bet"));
    btn.classList.toggle("active", b === state.bet);
  }

  // history
  const h = $("#history");
  h.innerHTML = "";
  for (const item of state.history) {
    const li = document.createElement("li");
    const deltaClass = item.delta > 0 ? "good" : item.delta < 0 ? "bad" : "dim";
    li.innerHTML = `<span class="dim">${escapeHtml(item.when)}</span> · <span>${escapeHtml(item.glyphs.join(" "))}</span> · <span class="${deltaClass}">${escapeHtml(item.deltaText)}</span>`;
    h.appendChild(li);
  }
}

function setOutput(text) {
  $("#output").textContent = text;
}

function setMarquee(text) {
  $("#marquee").textContent = text;
}

function randomSuggestion() {
  return PROMPT_SUGGESTIONS[(Math.random() * PROMPT_SUGGESTIONS.length) | 0];
}

let state = loadState();
let spinning = false;
const confetti = createConfetti(/** @type {HTMLCanvasElement} */ ($("#confetti")));
let deferredInstallPrompt = null;
/** @type {WakeLockSentinel | null} */
let wakeLock = null;

function canVibrate() {
  return typeof navigator !== "undefined" && "vibrate" in navigator;
}

function vibrate(pattern) {
  if (state.muted) return;
  if (!canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

function createAudio() {
  /** @type {AudioContext | null} */
  let ctx = null;
  /** @type {GainNode | null} */
  let master = null;

  function ensure() {
    if (state.muted) return null;
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.15;
    master.connect(ctx.destination);
    return ctx;
  }

  async function unlock() {
    const c = ensure();
    if (!c) return;
    if (c.state === "suspended") {
      try {
        await c.resume();
      } catch {
        // ignore
      }
    }
  }

  function tone(freq, ms, type = "sine", gain = 1) {
    const c = ensure();
    if (!c || !master) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = 0;
    o.connect(g);
    g.connect(master);
    const t0 = c.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.6 * gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    o.start();
    o.stop(t0 + ms / 1000 + 0.02);
  }

  return {
    unlock,
    click() {
      tone(440, 60, "triangle", 0.8);
    },
    spin() {
      tone(220, 120, "sawtooth", 0.55);
      tone(330, 140, "triangle", 0.35);
    },
    stop() {
      tone(520, 70, "square", 0.35);
    },
    win(big = false) {
      tone(660, 120, "triangle", big ? 1.0 : 0.7);
      window.setTimeout(() => tone(880, 140, "triangle", big ? 1.0 : 0.7), 70);
    },
    lose() {
      tone(180, 180, "sine", 0.7);
    },
  };
}

const audio = createAudio();

function normalizeRanges() {
  state.bet = clamp(Math.round(state.bet / 5) * 5, 10, 250);
  state.temperature = clamp(state.temperature, 0, 2);
  state.speed = clamp(state.speed, 0.6, 1.6);
}

function addTokens(n, why) {
  state.tokens = Math.max(0, Math.floor(state.tokens + n));
  if (n > 0) state.stats.won += Math.floor(n);
  if (n < 0) state.stats.spent += Math.floor(-n);
  if (n > state.stats.biggestWin) state.stats.biggestWin = Math.floor(n);
  setMarquee(why);
}

async function doSpin() {
  if (spinning) return;
  normalizeRanges();
  if (state.tokens < state.bet) return;

  spinning = true;
  audio.unlock();
  audio.spin();
  updateUi();

  const prompt = /** @type {HTMLInputElement} */ ($("#promptInput")).value;
  const seed = getSeed();
  const finalGlyphs = pickSpinResult(seed, state.temperature);

  // spend bet
  state.tokens -= state.bet;
  state.stats.spent += state.bet;
  state.stats.spins += 1;

  const buffActive = state.buffSpinsLeft > 0;
  if (state.buffSpinsLeft > 0) state.buffSpinsLeft -= 1;

  await animateReels(finalGlyphs, state.speed);
  audio.stop();

  const evalResult = evaluateSpin(finalGlyphs, state.bet, buffActive);
  const payout = evalResult.payout;

  if (payout > 0) {
    state.tokens += payout;
    state.stats.won += payout;
    if (payout > state.stats.biggestWin) state.stats.biggestWin = payout;
  }

  const delta = payout - state.bet;
  const deltaText =
    delta > 0 ? `+${formatInt(delta)}` : delta < 0 ? `-${formatInt(-delta)}` : "±0";

  const when = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  pushHistory(state, { when, glyphs: finalGlyphs, delta, deltaText, seed });

  const out = buildModelOutput({
    prompt,
    glyphs: finalGlyphs,
    bet: state.bet,
    payout,
    delta,
    reason: evalResult.reason,
    seed,
    temp: state.temperature,
    buffSpinsLeft: state.buffSpinsLeft,
  });
  state.lastSpin = { out, seed, finalGlyphs, bet: state.bet, delta };

  setOutput(out);

  if (delta >= state.bet * 6) {
    confetti.burst(1.2);
    audio.win(true);
    vibrate([18, 40, 18, 40, 18]);
    setMarquee("Big win detected. Deploying confetti to production.");
  } else if (delta > 0) {
    confetti.burst(0.7);
    audio.win(false);
    vibrate([14, 28, 14]);
    setMarquee("A rare correct answer. Nice.");
  } else if (delta < 0) {
    audio.lose();
    vibrate(18);
    setMarquee("Skill issue. Consider upgrading your GPU (and your impulse control).");
  } else {
    setMarquee("Break-even. Like your favorite open-source project.");
  }

  saveState(state);
  spinning = false;
  updateUi();

  if (state.autoSpin && state.tokens >= state.bet) {
    window.setTimeout(() => doSpin(), 650);
  }
}

function claimDaily() {
  const key = todayKey();
  if (state.lastClaimDay === key) {
    setMarquee("Free-tier reset already claimed today. Try again tomorrow.");
    return;
  }
  state.lastClaimDay = key;
  addTokens(120, "Free-tier reset claimed: +120 tokens (rate-limited by the calendar).");
  saveState(state);
  updateUi();
}

function buyBuff() {
  const cost = 200;
  if (state.tokens < cost) {
    setMarquee("Insufficient tokens. Please open a new tab and pretend it's funding.");
    return;
  }
  state.tokens -= cost;
  state.stats.spent += cost;
  state.buffSpinsLeft += 10;
  setMarquee("RLHF Blessing purchased. Odds slightly vibier for 10 spins.");
  saveState(state);
  updateUi();
}

function resetAll() {
  if (!confirm("Reset tokens, stats, and history? This cannot be undone.")) return;
  state = structuredClone(DEFAULT_STATE);
  saveState(state);
  setOutput("Reset complete. The model has forgotten everything. Again.");
  setMarquee("Fresh context window. Maximum delusion enabled.");
  updateUi();
}

function setBet(b) {
  state.bet = clamp(b, 10, 250);
  saveState(state);
  updateUi();
}

function init() {
  renderPayoutTable();
  normalizeRanges();
  saveState(state);

  $("#spinBtn").addEventListener("click", () => {
    audio.unlock();
    audio.click();
    doSpin();
  });
  $("#suggestBtn").addEventListener("click", () => {
    audio.unlock();
    audio.click();
    /** @type {HTMLInputElement} */ ($("#promptInput")).value = randomSuggestion();
    setMarquee("Prompt injected. Your autonomy has been updated.");
  });

  for (const btn of $$(".chip")) {
    btn.addEventListener("click", () => {
      audio.unlock();
      audio.click();
      setBet(Number(btn.getAttribute("data-bet")));
    });
  }

  /** @type {HTMLInputElement} */ ($("#betRange")).addEventListener("input", (e) => {
    setBet(Number(e.target.value));
  });

  /** @type {HTMLInputElement} */ ($("#tempRange")).addEventListener("input", (e) => {
    state.temperature = Number(e.target.value);
    saveState(state);
    updateUi();
  });

  /** @type {HTMLInputElement} */ ($("#speedRange")).addEventListener("input", (e) => {
    state.speed = Number(e.target.value);
    saveState(state);
    updateUi();
  });

  /** @type {HTMLInputElement} */ ($("#autospinToggle")).addEventListener("change", (e) => {
    audio.unlock();
    audio.click();
    state.autoSpin = Boolean(e.target.checked);
    saveState(state);
    updateUi();
    if (state.autoSpin) doSpin();
    syncWakeLock();
  });

  $("#muteBtn").addEventListener("click", () => {
    audio.unlock();
    audio.click();
    state.muted = !state.muted;
    saveState(state);
    updateUi();
  });

  $("#dailyBtn").addEventListener("click", () => {
    audio.unlock();
    audio.click();
    claimDaily();
  });
  $("#buyBuffBtn").addEventListener("click", () => {
    audio.unlock();
    audio.click();
    buyBuff();
  });
  $("#resetBtn").addEventListener("click", () => {
    audio.unlock();
    audio.click();
    resetAll();
  });

  $("#copyBtn").addEventListener("click", async () => {
    if (!state.lastSpin) return;
    try {
      await navigator.clipboard.writeText(state.lastSpin.out);
      setMarquee("Copied. Paste it into a chat and call it a 'post-mortem'.");
    } catch {
      setMarquee("Copy failed. The clipboard refused for safety reasons.");
    }
  });

  $("#shareBtn").addEventListener("click", async () => {
    if (!state.lastSpin) return;
    const text = state.lastSpin.out;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Token Slot", text });
        setMarquee("Shared. Please don't call it 'research'.");
      } else {
        await navigator.clipboard.writeText(text);
        setMarquee("No share sheet. Copied instead.");
      }
    } catch {
      setMarquee("Share cancelled. You regained 1 HP (not tokens).");
    }
  });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    $("#installBtn").hidden = false;
  });

  $("#installBtn").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    try {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
    } catch {
      // ignore
    } finally {
      deferredInstallPrompt = null;
      $("#installBtn").hidden = true;
    }
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") releaseWakeLock();
    else syncWakeLock();
  });

  // Seed an initial visible state
  const seed = getSeed();
  const glyphs = pickSpinResult(seed, state.temperature);
  $("#r0").textContent = glyphs[0];
  $("#r1").textContent = glyphs[1];
  $("#r2").textContent = glyphs[2];

  updateUi();
  syncWakeLock();
}

init();

async function syncWakeLock() {
  if (!("wakeLock" in navigator)) return;
  if (document.visibilityState !== "visible") return;
  if (!state.autoSpin) {
    await releaseWakeLock();
    return;
  }
  if (wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch {
    // ignore
  }
}

async function releaseWakeLock() {
  try {
    if (wakeLock) await wakeLock.release();
  } catch {
    // ignore
  } finally {
    wakeLock = null;
  }
}

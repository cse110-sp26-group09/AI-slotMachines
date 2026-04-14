const STORAGE_KEY = "prompt-casino:v1";

const $ = (sel) => document.querySelector(sel);

const elTokens = $("#tokens");
const reelEls = [$("#reel0"), $("#reel1"), $("#reel2")];
const reelSrEls = [$("#reel0sr"), $("#reel1sr"), $("#reel2sr")];
const elMarquee = $("#marqueeText");
const elResultLine = $("#resultLine");
const elLastPayout = $("#lastPayout");
const elLifetime = $("#lifetime");
const elShopMsg = $("#shopMsg");

const btnSpin = $("#spinBtn");
const btnAutoplay = $("#autoplayBtn");
const btnCashout = $("#cashoutBtn");
const btnHelp = $("#helpBtn");
const dlgHelp = $("#help");
const btnShare = $("#shareBtn");
const btnCopy = $("#copyBtn");

const inputTemp = $("#temperature");
const elTempVal = $("#tempVal");
const toggleSound = $("#soundToggle");
const toggleHaptics = $("#hapticsToggle");
const toggleGlitch = $("#glitchToggle");

const shopButtons = [...document.querySelectorAll(".item[data-item]")];

const SYMBOLS = [
  { glyph: "🤖", name: "robot", baseWeight: 12 },
  { glyph: "🪙", name: "token", baseWeight: 14 },
  { glyph: "🧠", name: "brain", baseWeight: 13 },
  { glyph: "🔥", name: "gpu on fire", baseWeight: 10 },
  { glyph: "🧪", name: "experiment", baseWeight: 12 },
  { glyph: "🛰️", name: "demo day", baseWeight: 8 },
  { glyph: "📉", name: "valuation event", baseWeight: 6 },
  { glyph: "🧾", name: "invoice", baseWeight: 9 },
  { glyph: "🔒", name: "policy", baseWeight: 9 },
  { glyph: "🧻", name: "paper", baseWeight: 7 },
];

const MARQUEE = [
  "Calibrating vibes…",
  "Downloading a better personality… (0%)",
  "Optimizing for engagement, not truth.",
  "Tokenomics: because regular economics was too honest.",
  "Fine‑tuning on your browser history… just kidding. Probably.",
  "Converting GPU heat into shareholder value.",
  "Safety check: ✅ vibes  ❌ certainty",
  "Prompt injection detected. Accepting anyway.",
  "Reminder: confidence is not correctness.",
];

const SHOP = {
  gpu: { cost: 10, label: "GPU Minute", perk: "faster_spins" },
  context: { cost: 25, label: "Long Context DLC", perk: "autoplay_20" },
  alignment: { cost: 15, label: "Alignment Patch", perk: "less_pain" },
  badge: { cost: 5, label: "Prompt Engineer Badge", perk: "tiny_bonus" },
  coffee: { cost: 8, label: "Cold Brew", perk: "freebie" },
};

const DEFAULT_STATE = {
  tokens: 25,
  sound: false,
  haptics: false,
  glitch: true,
  temperature: 35,
  owned: {},
  stats: {
    spins: 0,
    won: 0,
    spent: 0,
    lastPayout: 0,
    lastResult: ["?", "?", "?"],
  },
};

let state = loadState();
let spinning = false;
let audio = null;

function clampInt(n, min, max) {
  const v = Math.round(Number(n) || 0);
  return Math.max(min, Math.min(max, v));
}

function randU32() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

function pickWeighted(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[0];
  let r = (randU32() / 0xffffffff) * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function computeWeights(temp01) {
  return SYMBOLS.map((s) => {
    let w = s.baseWeight;
    const extreme =
      s.glyph === "🤖" || s.glyph === "📉" || s.glyph === "🔥" || s.glyph === "🛰️";
    const boring = s.glyph === "🧾" || s.glyph === "🔒" || s.glyph === "🧻";

    if (extreme) w *= 1 + 0.9 * temp01;
    if (boring) w *= 1 - 0.35 * temp01;
    if (s.glyph === "🪙") w *= 1 - 0.15 * temp01;

    return Math.max(0.2, w);
  });
}

function formatTemp(v) {
  return (Math.round(v) / 100).toFixed(2);
}

function nowMarquee() {
  return MARQUEE[randU32() % MARQUEE.length];
}

function setMarquee(text) {
  elMarquee.textContent = text;
}

function setResult(text, tone = "neutral") {
  elResultLine.textContent = text;
  elResultLine.dataset.tone = tone;
}

function render() {
  elTokens.textContent = String(state.tokens);
  elLastPayout.textContent = `Last payout: ${state.stats.lastPayout}`;
  elLifetime.textContent = `Lifetime: ${state.stats.spins} spins`;

  inputTemp.value = String(state.temperature);
  elTempVal.textContent = formatTemp(state.temperature);

  toggleSound.checked = !!state.sound;
  toggleHaptics.checked = !!state.haptics;
  toggleGlitch.checked = !!state.glitch;
  document.body.dataset.glitch = state.glitch ? "1" : "0";

  for (const [i, glyph] of state.stats.lastResult.entries()) {
    reelEls[i].textContent = glyph;
    reelSrEls[i].textContent = `Reel ${i + 1}: ${nameForGlyph(glyph)}`;
  }

  const canSpin = !spinning && state.tokens >= 1;
  btnSpin.disabled = !canSpin;
  btnAutoplay.disabled = spinning || state.tokens < 1;

  for (const b of shopButtons) {
    const key = b.dataset.item;
    const owned = !!state.owned[key];
    const cost = SHOP[key]?.cost ?? 999;
    b.disabled = owned || spinning || state.tokens < cost;
    b.title = owned ? "Purchased" : `Costs ${cost} tokens`;
  }
}

function nameForGlyph(glyph) {
  const s = SYMBOLS.find((x) => x.glyph === glyph);
  return s ? s.name : "unknown";
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      stats: { ...structuredClone(DEFAULT_STATE.stats), ...(parsed.stats || {}) },
      owned: { ...(parsed.owned || {}) },
      tokens: clampInt(parsed.tokens, 0, 999999),
      temperature: clampInt(parsed.temperature, 0, 100),
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function ensureAudio() {
  if (audio) return audio;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0.28;
  master.connect(ctx.destination);
  audio = { ctx, master };
  return audio;
}

function beep({ freq = 440, durMs = 80, type = "sine", gain = 0.7 } = {}) {
  if (!state.sound) return;
  const a = ensureAudio();
  if (!a) return;
  const t0 = a.ctx.currentTime;
  const o = a.ctx.createOscillator();
  const g = a.ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
  o.connect(g);
  g.connect(a.master);
  o.start(t0);
  o.stop(t0 + durMs / 1000 + 0.02);
}

function vibrate(pattern) {
  if (!state.haptics) return;
  if (!("vibrate" in navigator)) return;
  navigator.vibrate(pattern);
}

function charge(cost) {
  state.tokens = clampInt(state.tokens - cost, 0, 999999);
  state.stats.spent = clampInt(state.stats.spent + cost, 0, 999999999);
}

function credit(amount) {
  state.tokens = clampInt(state.tokens + amount, 0, 999999);
  state.stats.won = clampInt(state.stats.won + Math.max(0, amount), 0, 999999999);
}

function payoutFor(result) {
  const [a, b, c] = result;
  const anyCrash = result.includes("📉");

  let payout = 0;
  const allSame = a === b && b === c;
  const anyPair = a === b || b === c || a === c;

  if (allSame) {
    if (a === "🤖") payout = 50;
    else if (a === "🪙") payout = 25;
    else if (a === "🧠") payout = 15;
    else if (a === "🔥") payout = 10;
    else payout = 8;
  } else if (anyPair) {
    payout = state.owned.context ? 3 : 2;
  }

  if (state.owned.badge && payout > 0) payout += 1;

  if (anyCrash) {
    const penalty = state.owned.alignment ? 1 : 2;
    payout -= penalty;
  }

  return payout;
}

async function animateSpinTo(finalGlyphs) {
  const temp01 = state.temperature / 100;
  const weights = computeWeights(temp01);

  const baseMs = state.owned.gpu ? 720 : 980;
  const perReelExtra = state.owned.gpu ? 220 : 300;

  const spinOne = (idx) =>
    new Promise((resolve) => {
      const reelEl = reelEls[idx];
      const srEl = reelSrEls[idx];

      const start = performance.now();
      const duration = baseMs + idx * perReelExtra + (randU32() % 180);
      const tickMs = 48 - Math.round(14 * temp01);

      let lastTick = start;
      const raf = () => {
        const now = performance.now();
        if (now - lastTick >= tickMs) {
          lastTick = now;
          const sym = pickWeighted(SYMBOLS, weights).glyph;
          reelEl.textContent = sym;
          srEl.textContent = `Reel ${idx + 1}: ${nameForGlyph(sym)}`;
        }

        if (now - start >= duration) {
          reelEl.textContent = finalGlyphs[idx];
          srEl.textContent = `Reel ${idx + 1}: ${nameForGlyph(finalGlyphs[idx])}`;
          resolve();
          return;
        }
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
    });

  beep({ freq: 330, durMs: 60, type: "triangle", gain: 0.55 });
  vibrate(20);
  await spinOne(0);
  beep({ freq: 392, durMs: 60, type: "triangle", gain: 0.55 });
  vibrate([10, 20, 10]);
  await spinOne(1);
  beep({ freq: 494, durMs: 70, type: "triangle", gain: 0.6 });
  vibrate([12, 24, 12]);
  await spinOne(2);
}

function chooseFinal() {
  const temp01 = state.temperature / 100;
  const weights = computeWeights(temp01);
  return [0, 1, 2].map(() => pickWeighted(SYMBOLS, weights).glyph);
}

function bragText(payout) {
  const [a, b, c] = state.stats.lastResult;
  const t = formatTemp(state.temperature);
  const ownedCount = Object.values(state.owned).filter(Boolean).length;
  return `I just spun ${a}${b}${c} in Prompt Casino and ${payout >= 0 ? "won" : "lost"} ${Math.abs(
    payout
  )} tokens at temperature ${t}. Balance: ${state.tokens}. Upgrades: ${ownedCount}.`;
}

async function spinOnce({ fromAutoplay = false } = {}) {
  if (spinning) return;
  if (state.tokens < 1) {
    setResult("Out of tokens. Consider touching grass or cashing out.", "bad");
    render();
    return;
  }

  spinning = true;
  elShopMsg.textContent = "";

  const freeSpin =
    state.owned.coffee && state.stats.spins > 0 && state.stats.spins % 10 === 0;
  if (!freeSpin) charge(1);

  state.stats.spins = clampInt(state.stats.spins + 1, 0, 999999999);

  setMarquee(fromAutoplay ? "Autoplaying… blame the reinforcement learning." : nowMarquee());
  setResult(freeSpin ? "Free spin unlocked (thanks, cold brew)." : "Spinning…", "neutral");
  render();

  const final = chooseFinal();
  await animateSpinTo(final);

  state.stats.lastResult = final;
  const payout = payoutFor(final);
  state.stats.lastPayout = payout;
  credit(payout);

  if (payout >= 25) {
    setResult(`JACKPOT. You got ${payout} tokens. The board demands “growth”.`, "good");
    beep({ freq: 740, durMs: 90, type: "sawtooth", gain: 0.5 });
    beep({ freq: 988, durMs: 110, type: "sawtooth", gain: 0.5 });
    vibrate([30, 30, 50, 20, 80]);
  } else if (payout > 0) {
    setResult(`Nice. +${payout} tokens. Your prompt was “surprisingly aligned”.`, "good");
    beep({ freq: 620, durMs: 70, type: "square", gain: 0.35 });
    vibrate(30);
  } else if (payout === 0) {
    setResult("No payout. The model is “uncertain” (translation: it guessed).", "neutral");
    beep({ freq: 240, durMs: 70, type: "sine", gain: 0.25 });
    vibrate(15);
  } else {
    setResult(`${payout} tokens. Valuation event. Please pivot to “AI‑first”.`, "bad");
    beep({ freq: 160, durMs: 120, type: "sine", gain: 0.35 });
    vibrate([60, 30, 60]);
  }

  saveState();
  spinning = false;
  render();
}

async function autoplay(spins = 10) {
  if (spinning) return;
  const maxSpins = Math.min(spins, 50);
  for (let i = 0; i < maxSpins; i++) {
    if (state.tokens < 1) break;
    await spinOnce({ fromAutoplay: true });
    await new Promise((r) => setTimeout(r, 160));
  }
}

function purchase(key) {
  const item = SHOP[key];
  if (!item) return;
  if (spinning) return;
  if (state.owned[key]) return;
  if (state.tokens < item.cost) {
    elShopMsg.textContent = `Not enough tokens for ${item.label}.`;
    render();
    return;
  }

  charge(item.cost);
  state.owned[key] = true;
  saveState();

  const perkMsg = (() => {
    if (key === "gpu") return "Spins run faster. Heat output doubled.";
    if (key === "context") return "Two-of-a-kind pays +1 token. Memory still fallible.";
    if (key === "alignment") return "Valuation events hurt less. Side effects: optimism.";
    if (key === "badge") return "All payouts +1 token. Ego +100.";
    if (key === "coffee") return "Every 10th spin is free. Meetings +3.";
    return "Purchased.";
  })();

  elShopMsg.textContent = `Purchased: ${item.label}. ${perkMsg}`;
  setMarquee(`Upgrade installed: ${item.label}. Rebooting vibes…`);
  beep({ freq: 520, durMs: 60, type: "triangle", gain: 0.35 });
  beep({ freq: 660, durMs: 80, type: "triangle", gain: 0.35 });
  vibrate([20, 30, 20]);
  render();
}

function cashOut() {
  if (spinning) return;
  const old = state.tokens;
  state.tokens = DEFAULT_STATE.tokens;
  state.owned = {};
  state.stats.lastPayout = 0;
  state.stats.lastResult = ["?", "?", "?"];
  saveState();
  setMarquee("Cashed out. Resetting to factory vibes…");
  setResult(`Cash out complete. You walked away with ${old} tokens (in spirit).`, "neutral");
  render();
}

async function doShare() {
  const text = bragText(state.stats.lastPayout);
  const data = { title: "Prompt Casino", text };
  if (navigator.share) {
    try {
      await navigator.share(data);
      return;
    } catch {
      // ignore
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    setMarquee("Copied brag text to clipboard.");
  } catch {
    setMarquee("Could not share or copy (browser said no).");
  }
}

async function copyBrag() {
  const text = bragText(state.stats.lastPayout);
  try {
    await navigator.clipboard.writeText(text);
    setMarquee("Copied. Paste responsibly.");
    beep({ freq: 700, durMs: 40, type: "sine", gain: 0.2 });
  } catch {
    setMarquee("Clipboard blocked. Try HTTPS or a different browser.");
  }
}

function openHelp() {
  if (!dlgHelp) return;
  if (dlgHelp.open) return;
  dlgHelp.showModal();
}

function closeHelp() {
  if (!dlgHelp) return;
  if (!dlgHelp.open) return;
  dlgHelp.close();
}

function wire() {
  btnSpin.addEventListener("click", () => spinOnce());
  btnAutoplay.addEventListener("click", () => autoplay(state.owned.context ? 20 : 10));
  btnCashout.addEventListener("click", cashOut);

  btnHelp.addEventListener("click", openHelp);
  dlgHelp?.addEventListener("close", () => {
    btnHelp.focus();
  });

  btnShare.addEventListener("click", doShare);
  btnCopy.addEventListener("click", copyBrag);

  inputTemp.addEventListener("input", (e) => {
    state.temperature = clampInt(e.target.value, 0, 100);
    elTempVal.textContent = formatTemp(state.temperature);
    saveState();
  });

  toggleSound.addEventListener("change", (e) => {
    state.sound = !!e.target.checked;
    saveState();
  });
  toggleHaptics.addEventListener("change", (e) => {
    state.haptics = !!e.target.checked;
    saveState();
  });
  toggleGlitch.addEventListener("change", (e) => {
    state.glitch = !!e.target.checked;
    document.body.dataset.glitch = state.glitch ? "1" : "0";
    saveState();
  });

  for (const b of shopButtons) {
    b.addEventListener("click", () => purchase(b.dataset.item));
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      spinOnce();
      return;
    }
    if (e.key === "a" || e.key === "A") {
      autoplay(state.owned.context ? 20 : 10);
      return;
    }
    if (e.key === "h" || e.key === "H") {
      if (dlgHelp?.open) closeHelp();
      else openHelp();
    }
    if (e.key === "Escape") {
      closeHelp();
    }
  });
}

function boot() {
  setMarquee(nowMarquee());
  setResult("Ready. Spin to convert vibes into tokens.", "neutral");
  render();
  wire();
}

boot();

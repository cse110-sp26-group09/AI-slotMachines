const STORAGE_KEY = "llm-casino:v1";

const SYMBOLS = [
  { id: "BOT", emoji: "🤖", label: "BOT", baseWeight: 11, triplePayout: 200 },
  { id: "BRAIN", emoji: "🧠", label: "BRAIN", baseWeight: 12, triplePayout: 110 },
  { id: "SPARKLES", emoji: "✨", label: "SPARKLE", baseWeight: 10, triplePayout: 90 },
  { id: "WAND", emoji: "🪄", label: "MAGIC", baseWeight: 10, triplePayout: 90 },
  { id: "PAPERCLIP", emoji: "📎", label: "CLIP", baseWeight: 9, triplePayout: 80 },
  { id: "RECEIPT", emoji: "🧾", label: "BILLING", baseWeight: 7, triplePayout: 140 },
  { id: "FIRE", emoji: "🔥", label: "HOT", baseWeight: 8, triplePayout: 95 },
  { id: "BEAKER", emoji: "🧪", label: "LAB", baseWeight: 9, triplePayout: 85 },
  { id: "BUG", emoji: "🐛", label: "BUG", baseWeight: 6, triplePayout: 0 },
  { id: "LOCK", emoji: "🔒", label: "SAFE", baseWeight: 8, triplePayout: 75 },
];

const DEFAULTS = {
  balance: 100,
  spinCost: 7,
  temperature: 1.0,
  mute: false,
  announce: false,
  auto: false,
  spins: 0,
  lifetimeSpent: 0,
  lifetimeWon: 0,
  faucetCooldownUntil: 0,
  lastReels: ["BOT", "BRAIN", "WAND"],
};

const ui = {
  balance: document.getElementById("balance"),
  spinCost: document.getElementById("spinCost"),
  rtp: document.getElementById("rtp"),
  status: document.getElementById("status"),
  message: document.getElementById("message"),
  log: document.getElementById("log"),

  reelEls: [
    document.getElementById("reel0"),
    document.getElementById("reel1"),
    document.getElementById("reel2"),
  ],
  reelLabelEls: [
    document.getElementById("reel0Label"),
    document.getElementById("reel1Label"),
    document.getElementById("reel2Label"),
  ],

  spinBtn: document.getElementById("spinBtn"),
  faucetBtn: document.getElementById("faucetBtn"),
  resetBtn: document.getElementById("resetBtn"),
  shareBtn: document.getElementById("shareBtn"),

  temperature: document.getElementById("temperature"),
  tempLabel: document.getElementById("tempLabel"),
  muteToggle: document.getElementById("muteToggle"),
  announceToggle: document.getElementById("announceToggle"),
  autoToggle: document.getElementById("autoToggle"),
  confetti: document.getElementById("confetti"),
};

/** @type {ReturnType<typeof makeAudio> | null} */
let audio = null;

const state = loadState();
let spinning = false;
let autoSpinTimer = null;
let statsTimer = null;

init();

function init() {
  // restore last reels if possible
  setReels(
    (state.lastReels ?? DEFAULTS.lastReels).map((id) => SYMBOLS.find((s) => s.id === id) ?? SYMBOLS[0]),
  );

  ui.spinBtn.addEventListener("click", () => spin());
  ui.faucetBtn.addEventListener("click", () => requestTokens());
  ui.resetBtn.addEventListener("click", () => resetAll());
  ui.shareBtn.addEventListener("click", () => share());

  ui.temperature.value = String(state.temperature);
  ui.tempLabel.textContent = state.temperature.toFixed(1);
  ui.temperature.addEventListener("input", () => {
    state.temperature = clamp(Number(ui.temperature.value), 0.2, 2);
    ui.tempLabel.textContent = state.temperature.toFixed(1);
    saveState();
    renderStats();
  });

  ui.muteToggle.checked = state.mute;
  ui.muteToggle.addEventListener("change", () => {
    state.mute = ui.muteToggle.checked;
    if (state.mute) safeStopAudio();
    saveState();
  });

  ui.announceToggle.checked = state.announce;
  ui.announceToggle.addEventListener("change", () => {
    state.announce = ui.announceToggle.checked;
    saveState();
    logLine(state.announce ? "Announcer enabled. Prepare for cringe." : "Announcer disabled. Bliss.");
  });

  ui.autoToggle.checked = state.auto;
  ui.autoToggle.addEventListener("change", () => {
    state.auto = ui.autoToggle.checked;
    saveState();
    syncAutoSpin();
  });

  document.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (event.code === "Space") {
      event.preventDefault();
      spin();
      return;
    }
    if (event.key.toLowerCase() === "r") {
      requestTokens();
    }
  });

  window.addEventListener("beforeunload", () => {
    saveState();
    safeStopAudio();
  });

  renderAll();
  syncAutoSpin();
  syncStatsTimer();
  pushMessage("Insert tokens. Receive vibes.");
  logLine("Welcome to LLM Casino. We promise nothing, except invoices.");
}

function renderAll() {
  renderStats();
  syncControls();
}

function renderStats() {
  ui.balance.textContent = String(Math.floor(state.balance));
  ui.spinCost.textContent = String(state.spinCost);
  ui.rtp.textContent = estimateRtpPercent(state.temperature).toFixed(0);

  const now = Date.now();
  const remainingMs = Math.max(0, state.faucetCooldownUntil - now);
  if (remainingMs > 0) {
    const seconds = Math.ceil(remainingMs / 1000);
    ui.faucetBtn.disabled = true;
    ui.faucetBtn.textContent = `Request more tokens (${seconds}s)`;
  } else {
    ui.faucetBtn.disabled = false;
    ui.faucetBtn.textContent = "Request more tokens";
  }
}

function syncControls() {
  ui.spinBtn.disabled = spinning || state.balance < state.spinCost;
  ui.status.textContent = spinning ? "Thinking…" : "Idle";
}

function syncAutoSpin() {
  clearInterval(autoSpinTimer);
  autoSpinTimer = null;
  if (!state.auto) return;

  autoSpinTimer = setInterval(() => {
    if (spinning) return;
    if (state.balance < state.spinCost) return;
    spin();
  }, 650);
}

function syncStatsTimer() {
  clearInterval(statsTimer);
  statsTimer = setInterval(() => {
    renderStats();
    syncControls();
  }, 250);
}

async function spin() {
  if (spinning) return;
  if (state.balance < state.spinCost) {
    pushMessage("Out of tokens. Please ask your VC for a bridge round.");
    logLine("Spin blocked: insufficient tokens.");
    return;
  }

  spinning = true;
  syncControls();

  state.balance -= state.spinCost;
  state.spins += 1;
  state.lifetimeSpent += state.spinCost;
  saveState();
  renderStats();

  pushMessage("Generating output… (this may take 3–5 business eternities)");
  logLine(`You spend ${state.spinCost} tokens. The model begins to vibe-check reality.`);

  const final = [pickSymbol(), pickSymbol(), pickSymbol()];

  await playSpinAnimation(final);

  const outcome = scoreSpin(final);
  applyOutcome(outcome, final);
  spinning = false;
  syncControls();

  if (state.auto) {
    // allow the faucet cooldown countdown to refresh
    renderStats();
  }
}

function pickSymbol() {
  const temp = clamp(state.temperature, 0.2, 2);
  const alpha = 1 / temp;
  const weights = SYMBOLS.map((s) => Math.pow(s.baseWeight, alpha));
  const index = weightedIndex(weights);
  return SYMBOLS[index];
}

function scoreSpin(symbols) {
  const ids = symbols.map((s) => s.id);
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);

  const isTriple = counts.size === 1;
  const isPair = counts.size === 2;

  const base = {
    payout: 0,
    title: "Nope.",
    detail: "The model confidently produced… nothing of value.",
    kind: "loss",
  };

  if (isTriple) {
    const sym = symbols[0];
    if (sym.id === "BUG") {
      return {
        payout: 0,
        title: "Hallucinated jackpot!",
        detail: "Three bugs! The model insists you won, but cannot cite sources.",
        kind: "loss",
      };
    }
    if (sym.id === "BOT") {
      return {
        payout: sym.triplePayout,
        title: "AGI (Definitely Real)",
        detail: "Three bots align in perfect harmony. Investors applaud.",
        kind: "win",
      };
    }
    if (sym.id === "RECEIPT") {
      return {
        payout: sym.triplePayout,
        title: "Invoice generated",
        detail: "Congrats! You won… your own usage bill.",
        kind: "win",
      };
    }
    return {
      payout: sym.triplePayout,
      title: "Triple hit!",
      detail: `Three ${sym.label}s. The output is coherent for once.`,
      kind: "win",
    };
  }

  // Special combo: 🤖 + 🧠 + 🪄 (somehow aligned)
  if (counts.size === 3) {
    const set = new Set(ids);
    if (set.has("BOT") && set.has("BRAIN") && set.has("WAND")) {
      return {
        payout: 60,
        title: "Alignment achieved",
        detail: "The bot, the brain, and the magic agree. Nobody knows why.",
        kind: "win",
      };
    }
  }

  if (isPair) {
    const pairId = [...counts.entries()].find(([, c]) => c === 2)?.[0] ?? null;
    const sym = SYMBOLS.find((s) => s.id === pairId) ?? SYMBOLS[0];
    const payout = sym.id === "BUG" ? 2 : 12;
    return {
      payout,
      title: "Pair detected",
      detail:
        sym.id === "BUG"
          ? "Two bugs. You win 2 tokens for filing a vague GitHub issue."
          : `Two ${sym.label}s. Close enough for a demo.`,
      kind: "win",
    };
  }

  return base;
}

function applyOutcome(outcome, final) {
  const payout = Math.max(0, Math.floor(outcome.payout));
  const net = payout - state.spinCost;

  if (payout > 0) {
    state.balance += payout;
    state.lifetimeWon += payout;
  }

  saveState();
  renderStats();

  const pretty = formatReels(final);
  const netLabel = net >= 0 ? `+${net}` : String(net);

  pushMessage(`${outcome.title} ${pretty} (net ${netLabel})`);
  logLine(`${outcome.detail} Payout: ${payout}. Net: ${netLabel}.`);

  if (payout > 0) {
    if (payout >= 100) burstConfetti();
    if (!state.mute) {
      ensureAudio();
      audio?.win();
    }
    if (typeof navigator.vibrate === "function") navigator.vibrate([40, 30, 80]);
    if (state.announce) speak(`${outcome.title}. You won ${payout} tokens.`);
  } else {
    if (!state.mute) {
      ensureAudio();
      audio?.lose();
    }
    if (state.announce) speak("No payout. But the model feels confident.");
  }
}

async function playSpinAnimation(finalSymbols) {
  if (!state.mute) {
    ensureAudio();
    audio?.spinStart();
  }

  // Spin each reel with a slightly different duration.
  const durations = [760, 980, 1180];
  const tickMs = prefersReducedMotion() ? 120 : 56;

  ui.reelEls.forEach((el) => el.classList.add("isSpinning"));

  await Promise.all(
    ui.reelEls.map((el, i) =>
      spinReel(el, ui.reelLabelEls[i], finalSymbols[i], durations[i], tickMs, i),
    ),
  );

  ui.reelEls.forEach((el) => el.classList.remove("isSpinning"));

  if (!state.mute) audio?.spinStop();
}

function spinReel(el, labelEl, finalSymbol, durationMs, tickMs, index) {
  return new Promise((resolve) => {
    const start = performance.now();
    let lastTick = 0;

    const tick = (now) => {
      const elapsed = now - start;
      if (elapsed >= durationMs) {
        setReel(index, finalSymbol);
        resolve();
        return;
      }

      if (now - lastTick >= tickMs) {
        lastTick = now;
        const s = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
        el.textContent = s.emoji;
        labelEl.textContent = s.label;
        if (!state.mute) audio?.tick(index);
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
}

function setReels(symbols) {
  for (let i = 0; i < 3; i++) setReel(i, symbols[i]);
  state.lastReels = symbols.map((s) => s.id);
  saveState();
}

function setReel(i, symbol) {
  ui.reelEls[i].textContent = symbol.emoji;
  ui.reelLabelEls[i].textContent = symbol.label;
}

function requestTokens() {
  const now = Date.now();
  if (now < state.faucetCooldownUntil) return;

  const grant = 60;
  state.balance += grant;
  state.faucetCooldownUntil = now + 15_000;
  saveState();
  renderStats();

  pushMessage(`Tokens approved. ${grant} added. No due diligence performed.`);
  logLine(`Faucet grants +${grant} tokens. (Your CFO weeps quietly.)`);
  if (state.announce) speak(`${grant} tokens deposited. Please waste them responsibly.`);
}

function resetAll() {
  const ok = confirm("Reset tokens, stats, and settings?");
  if (!ok) return;
  Object.assign(state, clone(DEFAULTS));
  setReels(state.lastReels.map((id) => SYMBOLS.find((s) => s.id === id) ?? SYMBOLS[0]));
  saveState();
  renderAll();
  pushMessage("Fresh start. Same bad decisions.");
  ui.log.replaceChildren();
  logLine("State reset.");
  syncAutoSpin();
}

async function share() {
  const text = "LLM Casino: Token Burner 9000 — spend tokens, win tokens, lose dignity.";
  const url = location.href;

  try {
    if (navigator.share) {
      await navigator.share({ title: document.title, text, url });
      logLine("Shared successfully. Viral hallucination achieved.");
      return;
    }
  } catch {
    // user cancelled; fall back to clipboard below
  }

  try {
    await navigator.clipboard.writeText(url);
    pushMessage("Link copied. Go forth and tokenize your friends.");
    logLine("Web Share unavailable; copied URL to clipboard.");
  } catch {
    pushMessage("Could not share. The browser refuses to be your marketer.");
    logLine("Share failed; clipboard unavailable.");
  }
}

function pushMessage(text) {
  ui.message.textContent = text;
}

function logLine(text) {
  const li = document.createElement("li");
  li.textContent = text;
  ui.log.prepend(li);

  // cap log size
  const max = 18;
  while (ui.log.children.length > max) ui.log.lastElementChild?.remove();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(DEFAULTS);
    const parsed = JSON.parse(raw);
    return { ...clone(DEFAULTS), ...parsed };
  } catch {
    return clone(DEFAULTS);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private mode issues
  }
}

function weightedIndex(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return Math.floor(Math.random() * weights.length);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatReels(symbols) {
  return `(${symbols.map((s) => s.emoji).join(" ")})`;
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

function estimateRtpPercent(temp) {
  // Fun fake number: higher temp => flatter dist => slightly better odds.
  // This isn't a real RTP calculation; it's a joke UI element.
  const t = clamp(temp, 0.2, 2);
  const base = 86;
  const bump = (t - 1) * 4;
  return clamp(base + bump, 80, 92);
}

function ensureAudio() {
  if (audio) return;
  audio = makeAudio();
}

function safeStopAudio() {
  try {
    audio?.close();
  } catch {
    // ignore
  }
  audio = null;
}

function clone(obj) {
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

function makeAudio() {
  /** @type {AudioContext | null} */
  let ctx = null;

  const getCtx = () => {
    if (ctx) return ctx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
    return ctx;
  };

  const beep = (frequency, durationMs, type = "sine", gainValue = 0.035) => {
    const c = getCtx();
    if (!c) return;
    if (c.state === "suspended") void c.resume();

    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = frequency;
    g.gain.value = gainValue;
    o.connect(g);
    g.connect(c.destination);

    const now = c.currentTime;
    g.gain.setValueAtTime(gainValue, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    o.start();
    o.stop(now + durationMs / 1000);
  };

  return {
    tick(reelIndex) {
      const f = [420, 520, 620][reelIndex] ?? 500;
      beep(f, 38, "square", 0.02);
    },
    spinStart() {
      beep(180, 90, "sawtooth", 0.03);
      beep(260, 110, "sawtooth", 0.025);
    },
    spinStop() {
      beep(330, 70, "triangle", 0.03);
    },
    win() {
      beep(523.25, 90, "triangle", 0.045);
      setTimeout(() => beep(659.25, 110, "triangle", 0.05), 85);
      setTimeout(() => beep(783.99, 140, "triangle", 0.055), 180);
    },
    lose() {
      beep(220, 120, "sine", 0.04);
      setTimeout(() => beep(196, 160, "sine", 0.04), 90);
    },
    async close() {
      if (!ctx) return;
      try {
        await ctx.close();
      } finally {
        ctx = null;
      }
    },
  };
}

function speak(text) {
  try {
    if (!("speechSynthesis" in window)) return;
    // Avoid speech queue buildup during auto-spin.
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.03;
    u.pitch = 1.1;
    u.volume = 0.9;
    window.speechSynthesis.speak(u);
  } catch {
    // ignore
  }
}

function burstConfetti() {
  const root = ui.confetti;
  if (!root) return;
  root.replaceChildren();

  const colors = ["#8bf7ff", "#ff7ad9", "#7dffb2", "#ffe07a", "#bca7ff"];
  const count = prefersReducedMotion() ? 0 : 28;

  for (let i = 0; i < count; i++) {
    const piece = document.createElement("i");
    const x = Math.random() * 100;
    piece.style.setProperty("--x", `${x}%`);
    piece.style.left = `${x}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = `${760 + Math.random() * 380}ms`;
    piece.style.transform = `translate3d(${x}%, -20px, 0)`;
    root.appendChild(piece);
  }

  setTimeout(() => root.replaceChildren(), 1100);
}

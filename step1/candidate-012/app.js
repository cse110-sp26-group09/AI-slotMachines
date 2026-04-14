const STORAGE_KEY = "tokenbandit.v1";

const SYMBOLS = [
  { key: "PROMPT", glyph: "⌨", label: "Prompt", weight: 18, kind: "common" },
  { key: "GPU", glyph: "⚡", label: "GPU", weight: 14, kind: "common" },
  { key: "TOK", glyph: "◉", label: "Token", weight: 16, kind: "common" },
  { key: "CACHE", glyph: "🧊", label: "Cache Hit", weight: 10, kind: "common" },
  { key: "HALLU", glyph: "🌀", label: "Hallucination", weight: 12, kind: "common" },
  { key: "BUG", glyph: "🐛", label: "Bug", weight: 6, kind: "rare" },
  { key: "RAG", glyph: "📚", label: "RAG", weight: 10, kind: "rare" },
  { key: "RLHF", glyph: "🧑‍⚖️", label: "RLHF", weight: 8, kind: "rare" },
  { key: "RATE", glyph: "⛔", label: "Rate Limited", weight: 4, kind: "epic" },
  { key: "AGI", glyph: "👁", label: "AGI (Soon™)", weight: 2, kind: "legendary" },
];

const PAYOUTS = [
  { name: "Triple AGI", match: ["AGI", "AGI", "AGI"], payout: 2500, tier: "jackpot" },
  { name: "Triple Rate Limited", match: ["RATE", "RATE", "RATE"], payout: 500, tier: "big" },
  { name: "Triple RLHF", match: ["RLHF", "RLHF", "RLHF"], payout: 420, tier: "big" },
  { name: "Triple RAG", match: ["RAG", "RAG", "RAG"], payout: 333, tier: "big" },
  { name: "Triple GPU", match: ["GPU", "GPU", "GPU"], payout: 250, tier: "mid" },
  { name: "Triple Token", match: ["TOK", "TOK", "TOK"], payout: 200, tier: "mid" },
  { name: "Triple Hallucination", match: ["HALLU", "HALLU", "HALLU"], payout: 180, tier: "mid" },
];

const ANY_TWO_MATCH_MULT = 2.2;
const ANY_THREE_MATCH_MULT = 6.5;
const SPIN_COST = 25;
const INSERT_AMOUNT = 100;

const DEFAULT_STATE = {
  balance: 200,
  wins: 0,
  streak: 0,
  spins: 0,
  last: null,
  settings: { sound: true, haptics: false, reduceMotion: false },
};

const els = {
  balanceValue: document.getElementById("balanceValue"),
  spinCostValue: document.getElementById("spinCostValue"),
  streakValue: document.getElementById("streakValue"),
  marqueeText: document.getElementById("marqueeText"),
  footerHint: document.getElementById("footerHint"),
  resultText: document.getElementById("resultText"),
  reels: [
    { symbol: document.getElementById("reel0Symbol"), label: document.getElementById("reel0Label") },
    { symbol: document.getElementById("reel1Symbol"), label: document.getElementById("reel1Label") },
    { symbol: document.getElementById("reel2Symbol"), label: document.getElementById("reel2Label") },
  ],
  spinBtn: document.getElementById("spinBtn"),
  insertBtn: document.getElementById("insertBtn"),
  autoBtn: document.getElementById("autoBtn"),
  shareBtn: document.getElementById("shareBtn"),
  resetBtn: document.getElementById("resetBtn"),
  soundToggle: document.getElementById("soundToggle"),
  hapticToggle: document.getElementById("hapticToggle"),
  reduceMotionToggle: document.getElementById("reduceMotionToggle"),
  rulesBody: document.getElementById("rulesBody"),
  confetti: document.getElementById("confetti"),
};

let state = loadState();
let busy = false;
let autoSpinTimer = null;
let audio = null;

init();

function init() {
  els.spinCostValue.textContent = String(SPIN_COST);
  renderRules();

  els.soundToggle.checked = !!state.settings.sound;
  els.hapticToggle.checked = !!state.settings.haptics;
  els.reduceMotionToggle.checked = !!state.settings.reduceMotion;

  els.soundToggle.addEventListener("change", () => {
    state.settings.sound = !!els.soundToggle.checked;
    persist();
    hint(state.settings.sound ? "Sound on." : "Sound off.");
  });
  els.hapticToggle.addEventListener("change", () => {
    state.settings.haptics = !!els.hapticToggle.checked;
    persist();
    hint(state.settings.haptics ? "Haptics on." : "Haptics off.");
  });
  els.reduceMotionToggle.addEventListener("change", () => {
    state.settings.reduceMotion = !!els.reduceMotionToggle.checked;
    persist();
    hint(state.settings.reduceMotion ? "Reduced motion on." : "Reduced motion off.");
  });

  els.insertBtn.addEventListener("click", () => {
    if (busy) return;
    state.balance += INSERT_AMOUNT;
    state.last = { kind: "insert", amount: INSERT_AMOUNT, time: Date.now() };
    persist();
    applyStateToUI();
    marquee(`Inserted ${INSERT_AMOUNT} tokens. A prudent financial decision, surely.`);
    sfx("coin");
    haptic([20, 30, 20]);
  });

  els.spinBtn.addEventListener("click", () => spinOnce());
  els.autoBtn.addEventListener("click", () => toggleAutoSpin());

  els.shareBtn.addEventListener("click", async () => {
    const text = shareText();
    try {
      await copyToClipboard(text);
      hint("Copied result to clipboard.");
      sfx("tick");
    } catch {
      hint("Clipboard blocked. (A rare moment of safety.)");
      sfx("error");
    }
  });

  els.resetBtn.addEventListener("click", () => {
    if (busy) return;
    const keepSettings = { ...state.settings };
    state = structuredClone(DEFAULT_STATE);
    state.settings = keepSettings;
    persist();
    applyStateToUI();
    setReels([null, null, null]);
    marquee("Factory reset complete. Your progress has been… optimized away.");
    sfx("error");
    haptic([40, 30, 40]);
  });

  els.spinBtn.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      spinOnce();
    }
  });

  document.addEventListener("keydown", (e) => {
    const isMac = String(navigator.platform || "").toLowerCase().includes("mac");
    const chord = isMac ? e.metaKey && e.key === "Enter" : e.ctrlKey && e.key === "Enter";
    if (chord) {
      e.preventDefault();
      spinOnce();
    }
  });

  if (state.last?.kind === "spin" && Array.isArray(state.last.reels)) {
    setReels(state.last.reels);
    els.resultText.textContent = state.last.message || els.resultText.textContent;
  } else {
    setReels([null, null, null]);
  }

  applyStateToUI();
  hint("Tip: Insert tokens, then spin. The house is you.");
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      settings: { ...structuredClone(DEFAULT_STATE.settings), ...(parsed.settings || {}) },
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function applyStateToUI() {
  els.balanceValue.textContent = formatInt(state.balance);
  els.streakValue.textContent = formatInt(state.streak);
  els.spinBtn.disabled = busy || state.balance < SPIN_COST;
  els.insertBtn.disabled = busy;
  els.shareBtn.disabled = busy;
  els.resetBtn.disabled = busy;

  if (state.balance < SPIN_COST) marquee("Insufficient tokens. Insert 100 tokens to continue the vibes.");
}

function marquee(text) {
  els.marqueeText.textContent = text;
}

function hint(text) {
  els.footerHint.textContent = text;
  window.clearTimeout(hint._t);
  hint._t = window.setTimeout(() => {
    if (els.footerHint.textContent === text) els.footerHint.textContent = "";
  }, 3000);
}

function formatInt(n) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

function randInt(maxExclusive) {
  if (maxExclusive <= 0) return 0;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % maxExclusive;
}

function pickWeightedSymbol() {
  const total = SYMBOLS.reduce((acc, s) => acc + s.weight, 0);
  const r = randInt(total);
  let running = 0;
  for (const s of SYMBOLS) {
    running += s.weight;
    if (r < running) return s;
  }
  return SYMBOLS[0];
}

function setReels(symbolKeysOrNulls) {
  for (let i = 0; i < 3; i++) {
    const key = symbolKeysOrNulls[i];
    if (!key) {
      els.reels[i].symbol.textContent = "—";
      els.reels[i].label.textContent = "—";
      continue;
    }
    const s = SYMBOLS.find((x) => x.key === key) || SYMBOLS[0];
    els.reels[i].symbol.textContent = s.glyph;
    els.reels[i].label.textContent = s.label;
  }
}

async function spinOnce() {
  if (busy) return;
  if (state.balance < SPIN_COST) {
    sfx("error");
    haptic([40, 30, 40]);
    marquee("Rate limited by your own wallet.");
    return;
  }

  busy = true;
  applyStateToUI();

  state.balance -= SPIN_COST;
  state.spins += 1;
  persist();
  applyStateToUI();

  marquee("Thinking… (definitely not stalling)");
  sfx("spin");
  haptic([10, 30, 10]);

  const final = [pickWeightedSymbol(), pickWeightedSymbol(), pickWeightedSymbol()];
  const finalKeys = final.map((s) => s.key);

  await animateSpin(finalKeys);

  const outcome = scoreSpin(finalKeys);
  state.balance += outcome.payout;
  if (outcome.payout > 0) {
    state.wins += 1;
    state.streak += 1;
  } else {
    state.streak = 0;
  }

  state.last = {
    kind: "spin",
    reels: finalKeys,
    payout: outcome.payout,
    net: outcome.payout - SPIN_COST,
    message: outcome.message,
    time: Date.now(),
  };

  persist();
  applyStateToUI();
  els.resultText.textContent = outcome.message;

  if (outcome.tier === "jackpot") {
    marquee("JACKPOT: you have been selected for the closed beta of destiny.");
    sfx("jackpot");
    haptic([20, 30, 20, 30, 50]);
    confettiBurst();
  } else if (outcome.payout > 0) {
    marquee(`Win! +${outcome.payout} tokens. (Tax forms sold separately.)`);
    sfx("win");
    haptic([20, 20, 40]);
  } else {
    marquee("No payout. Try again. The model is just warming up.");
    sfx("lose");
    haptic([12, 22, 12]);
  }

  busy = false;
  applyStateToUI();
}

function scoreSpin(keys) {
  const exact = PAYOUTS.find((p) => arraysEqual(p.match, keys));
  if (exact) {
    const flavorByName = {
      "Triple AGI": "Congrats, you invented AGI. Investors applaud. Reality disagrees.",
      "Triple Rate Limited": "You won by losing: the house can’t charge you if it won’t respond.",
      "Triple RLHF": "Safety win! The machine refuses to pay for policy reasons. (Just kidding: here.)",
      "Triple RAG": "Look at you, citing sources. It’s almost like you read the docs.",
      "Triple GPU": "Your fans spin up. Your wallet spins down.",
      "Triple Token": "Tokenomics! You’re now rich in the most imaginary currency possible.",
      "Triple Hallucination": "It confidently paid you the wrong amount. We fixed it… probably.",
    };
    const flavor = flavorByName[exact.name] || "We did a thing!";
    return { payout: exact.payout, message: `${exact.name}: +${exact.payout} tokens. ${flavor}`, tier: exact.tier };
  }

  const counts = new Map();
  for (const k of keys) counts.set(k, (counts.get(k) || 0) + 1);
  const [bestKey, bestCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

  if (bestCount === 3) {
    const sym = SYMBOLS.find((s) => s.key === bestKey);
    const payout = Math.max(0, Math.round(symPayout(sym) * ANY_THREE_MATCH_MULT));
    return {
      payout,
      message: `Three of a kind (${sym?.label || bestKey}): +${payout} tokens. This outcome is statistically significant. (Probably.)`,
      tier: payout >= 900 ? "big" : "mid",
    };
  }

  if (bestCount === 2) {
    const sym = SYMBOLS.find((s) => s.key === bestKey);
    const payout = Math.max(0, Math.round(symPayout(sym) * ANY_TWO_MATCH_MULT));
    const extra =
      sym?.key === "HALLU"
        ? "Half right, fully confident."
        : sym?.key === "BUG"
          ? "You reproduced it! That’s basically engineering."
          : "Not bad. Not good. Like most demos.";
    return { payout, message: `Two of a kind (${sym?.label || bestKey}): +${payout} tokens. ${extra}`, tier: "small" };
  }

  if (state.streak === 0 && state.spins % 7 === 0) {
    const pity = 10;
    return { payout: pity, message: `Pity patch: +${pity} tokens. We shipped empathy in a hotfix.`, tier: "small" };
  }

  const snark = [
    "No match. Try increasing your prompt budget.",
    "No match. Have you tried turning it off and on again?",
    "No match. The model is experiencing a skill issue.",
    "No match. It’s not gambling, it’s 'probabilistic budgeting'.",
    "No match. Your tokens have been reallocated to 'research'.",
  ];
  return { payout: 0, message: snark[randInt(snark.length)], tier: "none" };
}

function symPayout(sym) {
  if (!sym) return 20;
  switch (sym.kind) {
    case "legendary":
      return 200;
    case "epic":
      return 120;
    case "rare":
      return 70;
    default:
      return 40;
  }
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function animateSpin(finalKeys) {
  if (state.settings.reduceMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setReels(finalKeys);
    return;
  }

  const start = performance.now();
  const duration = 900 + randInt(350);
  const reelStops = [duration, duration + 120, duration + 240];
  const lastKeys = [null, null, null];

  return new Promise((resolve) => {
    const tick = (t) => {
      const elapsed = t - start;
      for (let i = 0; i < 3; i++) {
        if (elapsed >= reelStops[i]) {
          lastKeys[i] = finalKeys[i];
          continue;
        }
        const speed = 22 - Math.min(18, Math.floor(elapsed / 60));
        if (elapsed % speed < 16) lastKeys[i] = pickWeightedSymbol().key;
      }
      setReels(lastKeys);
      if (elapsed >= reelStops[2]) {
        setReels(finalKeys);
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function toggleAutoSpin() {
  const on = !!autoSpinTimer;
  if (on) {
    window.clearInterval(autoSpinTimer);
    autoSpinTimer = null;
    els.autoBtn.setAttribute("aria-pressed", "false");
    els.autoBtn.textContent = "Auto-spin: Off";
    hint("Auto-spin off.");
    return;
  }

  autoSpinTimer = window.setInterval(() => {
    if (busy) return;
    if (state.balance < SPIN_COST) {
      toggleAutoSpin();
      return;
    }
    spinOnce();
  }, 1400);

  els.autoBtn.setAttribute("aria-pressed", "true");
  els.autoBtn.textContent = "Auto-spin: On";
  hint("Auto-spin on. Please pretend this is passive income.");
}

function shareText() {
  const when = state.last?.time ? new Date(state.last.time).toLocaleString() : "";
  const reels = Array.isArray(state.last?.reels) ? state.last.reels : null;
  const reelGlyphs = reels
    ? reels.map((k) => SYMBOLS.find((s) => s.key === k)?.glyph || "—").join(" ")
    : "— — —";
  const payout = state.last?.kind === "spin" ? state.last.payout : 0;
  const net = state.last?.kind === "spin" ? state.last.net : 0;
  return [
    "TokenBandit™ — AI Slot Machine",
    `Reels: ${reelGlyphs}`,
    `Payout: ${payout} tokens (net ${net >= 0 ? "+" : ""}${net})`,
    `Balance: ${state.balance} tokens`,
    when ? `Time: ${when}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function renderRules() {
  const rows = PAYOUTS.map((p) => {
    return `<tr><td>${renderMatch(p.match)}</td><td>+${p.payout}</td><td>${escapeHtml(p.name)}</td></tr>`;
  }).join("");
  const extra = `<tr><td>Any three of a kind</td><td>Varies</td><td>Depends on rarity</td></tr>
  <tr><td>Any two of a kind</td><td>Varies</td><td>Depends on rarity</td></tr>`;
  els.rulesBody.innerHTML = `
    <div>Each spin costs <strong>${SPIN_COST}</strong> tokens. Payouts are added after the spin.</div>
    <table class="ruleTable" aria-label="Payout table">
      <thead><tr><th>Match</th><th>Payout</th><th>Notes</th></tr></thead>
      <tbody>${rows}${extra}</tbody>
    </table>
    <div class="smallNote">Disclaimer: This machine is not a financial advisor. Or an advisor of any kind.</div>
  `;
}

function renderMatch(matchKeys) {
  return matchKeys
    .map((k) => {
      const s = SYMBOLS.find((x) => x.key === k);
      return s ? `${escapeHtml(s.glyph)} ${escapeHtml(s.label)}` : escapeHtml(k);
    })
    .join("  |  ");
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  ta.style.top = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    if (!document.execCommand("copy")) throw new Error("copy-failed");
  } finally {
    ta.remove();
  }
}

function ensureAudio() {
  if (audio) return audio;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audio = new Ctx();
    return audio;
  } catch {
    return null;
  }
}

function sfx(kind) {
  if (!state.settings.sound) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const now = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.connect(g);
  g.connect(ctx.destination);

  const env = (type, f0, f1, t, amp) => {
    o.type = type;
    o.frequency.setValueAtTime(f0, now);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + t);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(amp, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.04);
    o.start(now);
    o.stop(now + t + 0.05);
  };

  switch (kind) {
    case "spin":
      env("triangle", 220, 140, 0.11, 0.08);
      break;
    case "coin":
      env("sine", 660, 990, 0.07, 0.1);
      break;
    case "win":
      env("square", 392, 784, 0.12, 0.06);
      break;
    case "jackpot":
      env("sawtooth", 220, 880, 0.18, 0.08);
      break;
    case "lose":
      env("sine", 220, 110, 0.17, 0.05);
      break;
    case "tick":
      env("square", 880, 660, 0.04, 0.05);
      break;
    default:
      env("sine", 180, 90, 0.12, 0.05);
      break;
  }
}

function haptic(pattern) {
  if (!state.settings.haptics) return;
  if (typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

let confettiParticles = [];
let confettiRAF = 0;

function confettiBurst() {
  const canvas = els.confetti;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = ["#7c5cff", "#30d5c8", "#ff5c8a", "#ffcc66", "#4dff9a", "#ffffff"];
  confettiParticles = [];
  for (let i = 0; i < 120; i++) {
    confettiParticles.push({
      x: w / 2 + randRange(-80, 80),
      y: h / 2 + randRange(-40, 40),
      vx: randRange(-5, 5),
      vy: randRange(-9, -2),
      g: randRange(0.15, 0.28),
      s: randRange(3, 7),
      r: randRange(0, Math.PI * 2),
      vr: randRange(-0.2, 0.2),
      color: colors[randInt(colors.length)],
      life: randRange(70, 110),
    });
  }

  canvas.classList.add("show");
  window.cancelAnimationFrame(confettiRAF);

  const step = () => {
    ctx.clearRect(0, 0, w, h);
    let alive = 0;
    for (const p of confettiParticles) {
      if (p.life <= 0) continue;
      alive++;
      p.life -= 1;
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 90));
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 1.6);
      ctx.restore();
    }

    if (alive > 0) {
      confettiRAF = requestAnimationFrame(step);
      return;
    }
    canvas.classList.remove("show");
  };

  confettiRAF = requestAnimationFrame(step);
}

function randRange(a, b) {
  return a + (b - a) * (randInt(10_000) / 10_000);
}

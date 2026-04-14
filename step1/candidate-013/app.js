/* Token Burner 3000 — vanilla slot machine satire */

const STORAGE_KEY = "token_burner_3000_v1";

const DEFAULT_STATE = {
  balance: 1000,
  bet: 25,
  spins: 0,
  biggestWin: 0,
};

const SYMBOLS = [
  { id: "TOKENS", glyph: "🪙", label: "TOKENS", weight: 10, triple: 6, double: 2 },
  { id: "GPU", glyph: "🧊", label: "GPU (COLD)", weight: 7, triple: 8, double: 2 },
  { id: "PROMPT", glyph: "🧾", label: "PROMPT", weight: 10, triple: 5, double: 2 },
  { id: "EVAL", glyph: "🧪", label: "EVALS", weight: 9, triple: 5, double: 2 },
  { id: "LATENCY", glyph: "⏱️", label: "LATENCY", weight: 9, triple: 4, double: 2 },
  { id: "HYPE", glyph: "📈", label: "HYPE", weight: 8, triple: 7, double: 2 },
  { id: "ALIGN", glyph: "🧠", label: "ALIGNMENT", weight: 6, triple: 10, double: 3 },
  { id: "AGI", glyph: "✨", label: "AGI (SOON™)", weight: 2, triple: 40, double: 5 },
  { id: "HALLU", glyph: "🔮", label: "HALLUCINATION", weight: 5, triple: 0, double: 0 },
];

const els = {
  balance: document.getElementById("balance"),
  spins: document.getElementById("spins"),
  biggestWin: document.getElementById("biggestWin"),
  bet: document.getElementById("bet"),
  betOut: document.getElementById("betOut"),
  spin: document.getElementById("spin"),
  auto: document.getElementById("auto"),
  refill: document.getElementById("refill"),
  reset: document.getElementById("reset"),
  status: document.getElementById("status"),
  log: document.getElementById("log"),
  reel: [document.getElementById("reel0"), document.getElementById("reel1"), document.getElementById("reel2")],
  symbol: [
    document.getElementById("symbol0"),
    document.getElementById("symbol1"),
    document.getElementById("symbol2"),
  ],
  confetti: document.getElementById("confetti"),
};

let state = loadState();
let isSpinning = false;
let autoRemaining = 0;

let audioCtx = null;

function clampInt(value, min, max) {
  const n = Number.parseInt(String(value), 10);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_STATE,
      ...parsed,
      balance: clampInt(parsed.balance ?? DEFAULT_STATE.balance, 0, 9_999_999),
      bet: clampInt(parsed.bet ?? DEFAULT_STATE.bet, 1, 250),
      spins: clampInt(parsed.spins ?? DEFAULT_STATE.spins, 0, 9_999_999),
      biggestWin: clampInt(parsed.biggestWin ?? DEFAULT_STATE.biggestWin, 0, 9_999_999),
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setStatus(text, tone = "") {
  els.status.className = "statusline" + (tone ? ` ${tone}` : "");
  els.status.textContent = text;
}

function logLine(text) {
  const entry = document.createElement("div");
  entry.className = "entry";
  entry.innerHTML = text;
  els.log.prepend(entry);

  const maxEntries = 30;
  while (els.log.children.length > maxEntries) {
    els.log.removeChild(els.log.lastElementChild);
  }
}

function updateUI() {
  els.balance.textContent = String(state.balance);
  els.spins.textContent = String(state.spins);
  els.biggestWin.textContent = String(state.biggestWin);

  const bet = clampInt(state.bet, 1, 250);
  els.bet.value = String(bet);
  els.betOut.value = String(bet);
  els.betOut.textContent = String(bet);

  const canSpin = !isSpinning && state.balance >= bet && bet > 0;
  els.spin.disabled = !canSpin;
  els.auto.disabled = isSpinning || state.balance < bet;
  els.refill.disabled = isSpinning;
  els.reset.disabled = isSpinning;
}

function weightedPickSymbol() {
  const total = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
  let r = Math.random() * total;
  for (const s of SYMBOLS) {
    r -= s.weight;
    if (r <= 0) return s;
  }
  return SYMBOLS[0];
}

function symbolsToIds(symbols) {
  return symbols.map((s) => s.id);
}

function countMatches(ids) {
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  let best = { id: null, count: 0 };
  for (const [id, count] of counts.entries()) {
    if (count > best.count) best = { id, count };
  }
  return best;
}

function computePayout(bet, symbols) {
  const ids = symbolsToIds(symbols);
  const best = countMatches(ids);
  const picked = SYMBOLS.find((s) => s.id === best.id) ?? SYMBOLS[0];

  if (best.count === 3) {
    if (best.id === "HALLU") return { payout: 0, kind: "hallucination3", picked };
    return { payout: bet * picked.triple, kind: "triple", picked };
  }
  if (best.count === 2) {
    if (best.id === "HALLU") return { payout: 0, kind: "hallucination2", picked };
    return { payout: bet * picked.double, kind: "double", picked };
  }
  return { payout: 0, kind: "miss", picked };
}

function setSymbol(slotIndex, symbol) {
  const container = els.symbol[slotIndex];
  container.querySelector(".glyph").textContent = symbol.glyph;
  container.querySelector(".label").textContent = symbol.label;
}

function ensureAudio() {
  if (audioCtx) return audioCtx;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  } catch {
    return null;
  }
}

function beep({ freq = 440, durationMs = 60, gain = 0.04, type = "sine" } = {}) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.value = gain;
  osc.connect(amp);
  amp.connect(ctx.destination);
  const now = ctx.currentTime;
  osc.start(now);
  osc.stop(now + durationMs / 1000);
}

function vibrate(pattern) {
  if (!("vibrate" in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function spinOnce() {
  if (isSpinning) return;

  const bet = clampInt(state.bet, 1, 250);
  if (state.balance < bet) {
    setStatus("Insufficient tokens. Consider pivoting to consulting.", "bad");
    beep({ freq: 140, durationMs: 120, gain: 0.06, type: "sawtooth" });
    vibrate([50, 30, 50]);
    updateUI();
    return;
  }

  isSpinning = true;
  state.balance -= bet;
  state.spins += 1;
  saveState();
  updateUI();

  setStatus(`Spinning… burning ${bet} tokens for “inference”.`, "");
  logLine(`- Bet <code>${bet}</code> tokens. The model nods confidently.`);
  beep({ freq: 520, durationMs: 50, gain: 0.035 });
  vibrate(20);

  const finalSymbols = [weightedPickSymbol(), weightedPickSymbol(), weightedPickSymbol()];

  const baseMs = prefersReducedMotion() ? 0 : 850;
  const perReelMs = prefersReducedMotion() ? 0 : 240;

  const intervals = [];
  for (let i = 0; i < 3; i++) {
    els.reel[i].classList.add("is-spinning");
    if (!prefersReducedMotion()) {
      intervals.push(
        setInterval(() => {
          setSymbol(i, weightedPickSymbol());
        }, 70 + i * 25),
      );
    } else {
      setSymbol(i, finalSymbols[i]);
    }
  }

  for (let i = 0; i < 3; i++) {
    await sleep(baseMs + i * perReelMs);
    if (intervals[i]) clearInterval(intervals[i]);
    setSymbol(i, finalSymbols[i]);
    els.reel[i].classList.remove("is-spinning");
    beep({ freq: 660 + i * 90, durationMs: 30, gain: 0.03, type: "triangle" });
    vibrate(10);
  }

  const { payout, kind, picked } = computePayout(bet, finalSymbols);
  state.balance += payout;
  if (payout > state.biggestWin) state.biggestWin = payout;
  saveState();

  if (kind === "triple") {
    setStatus(`JACKPOT-ish: ${payout} tokens! (${picked.label} x3)`, "good");
    logLine(`+ Matched <code>${picked.label}</code> x3 → won <code>${payout}</code> tokens.`);
    vibrate([20, 30, 20, 30, 80]);
    playWinSting(true);
    confettiBurst();
    maybeShare(payout, picked.label);
  } else if (kind === "double") {
    setStatus(`Nice: ${payout} tokens. (${picked.label} x2)`, "good");
    logLine(`+ Matched <code>${picked.label}</code> x2 → won <code>${payout}</code> tokens.`);
    playWinSting(false);
  } else if (kind === "hallucination3") {
    setStatus("HALLUCINATION x3: the model says you won. The ledger disagrees.", "warn");
    logLine(`± <code>HALLUCINATION</code> x3 → “You won!” (payout: <code>0</code>).`);
    beep({ freq: 222, durationMs: 140, gain: 0.06, type: "square" });
    vibrate([30, 40, 30]);
    offerCopy("The model said I won the jackpot. Reality said: 0 tokens.");
  } else if (kind === "hallucination2") {
    setStatus("HALLUCINATION x2: confident, incorrect, and extremely well formatted.", "warn");
    logLine(`± <code>HALLUCINATION</code> x2 → payout <code>0</code>. (But it provided citations.)`);
    beep({ freq: 260, durationMs: 90, gain: 0.05, type: "square" });
  } else {
    setStatus("No match. Try again. This time with more prompt engineering.", "bad");
    logLine(`· Miss → <code>0</code> tokens. Consider adding “please” to the prompt.`);
    beep({ freq: 180, durationMs: 90, gain: 0.05, type: "sawtooth" });
    vibrate(15);
  }

  isSpinning = false;
  updateUI();
}

function playWinSting(big) {
  const notes = big ? [880, 990, 1180, 1480] : [740, 880, 990];
  let t = 0;
  for (const f of notes) {
    setTimeout(() => beep({ freq: f, durationMs: 70, gain: big ? 0.05 : 0.04, type: "triangle" }), t);
    t += 80;
  }
}

function fitCanvasToElement(canvas, el) {
  const rect = el.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, rect };
}

let confettiAnim = null;
function confettiBurst() {
  if (prefersReducedMotion()) return;
  if (!els.confetti) return;

  const { ctx, rect } = fitCanvasToElement(els.confetti, document.querySelector(".machine"));
  const colors = ["#8aa7ff", "#c08bff", "#7cf7b2", "#ffd36a", "#ffffff"];
  const pieces = [];
  const count = 140;
  for (let i = 0; i < count; i++) {
    pieces.push({
      x: rect.width * (0.2 + Math.random() * 0.6),
      y: rect.height * (0.2 + Math.random() * 0.2),
      vx: (Math.random() - 0.5) * 7,
      vy: -3 - Math.random() * 6,
      g: 0.22 + Math.random() * 0.12,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.25,
      size: 5 + Math.random() * 6,
      color: colors[(Math.random() * colors.length) | 0],
      life: 130 + ((Math.random() * 40) | 0),
    });
  }

  if (confettiAnim) cancelAnimationFrame(confettiAnim);

  function frame() {
    ctx.clearRect(0, 0, rect.width, rect.height);
    for (const p of pieces) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.g;
      p.rot += p.vr;
      p.life -= 1;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 120));
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
      ctx.restore();
    }
    const alive = pieces.some((p) => p.life > 0 && p.y < rect.height + 40);
    if (alive) confettiAnim = requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, rect.width, rect.height);
  }

  confettiAnim = requestAnimationFrame(frame);
}

async function offerCopy(text) {
  if (!navigator.clipboard || !navigator.clipboard.writeText) return;
  try {
    await navigator.clipboard.writeText(text);
    logLine(`↪ Copied to clipboard: <code>${escapeHtml(text)}</code>`);
  } catch {
    // ignore
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function maybeShare(payout, label) {
  if (!("share" in navigator)) return;
  if (payout < 200) return;
  const text = `I just won ${payout} tokens on Token Burner 3000 (${label} x3). My GPU budget is safe… for now.`;
  try {
    await navigator.share({ title: "Token Burner 3000", text });
    logLine(`↗ Shared: <code>${escapeHtml(text)}</code>`);
  } catch {
    // user canceled or unsupported
  }
}

function setAutoPressed(pressed) {
  els.auto.setAttribute("aria-pressed", pressed ? "true" : "false");
  els.auto.textContent = pressed ? `Auto (${autoRemaining})` : "Auto (10)";
}

async function runAuto(count = 10) {
  if (isSpinning) return;
  autoRemaining = count;
  setAutoPressed(true);

  while (autoRemaining > 0) {
    const bet = clampInt(state.bet, 1, 250);
    if (state.balance < bet) break;
    autoRemaining -= 1;
    setAutoPressed(true);
    await spinOnce();
    await sleep(prefersReducedMotion() ? 0 : 160);
  }

  autoRemaining = 0;
  setAutoPressed(false);
  updateUI();
}

function refill() {
  if (isSpinning) return;
  const grant = 600;
  state.balance += grant;
  saveState();
  setStatus(`Grant approved: +${grant} tokens. Please submit a 47-page postmortem.`, "good");
  logLine(`+ Applied for grant → approved instantly → <code>+${grant}</code> tokens. (No due diligence.)`);
  beep({ freq: 740, durationMs: 90, gain: 0.04, type: "triangle" });
  vibrate([20, 20, 40]);
  updateUI();
}

function resetAll() {
  if (isSpinning) return;
  state = { ...DEFAULT_STATE };
  saveState();
  setStatus("Reset complete. Back to 1,000 tokens and unlimited optimism.", "warn");
  els.log.textContent = "";
  logLine("· State reset. The model forgets everything (by design).");
  updateUI();
}

function wireEvents() {
  els.bet.addEventListener("input", () => {
    state.bet = clampInt(els.bet.value, 1, 250);
    saveState();
    updateUI();
  });

  els.spin.addEventListener("click", () => {
    // resume audio on user gesture if needed
    const ctx = ensureAudio();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    spinOnce();
  });

  els.auto.addEventListener("click", () => {
    if (isSpinning) return;
    if (autoRemaining > 0) {
      autoRemaining = 0;
      setAutoPressed(false);
      updateUI();
      return;
    }
    const ctx = ensureAudio();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    runAuto(10);
  });

  els.refill.addEventListener("click", refill);
  els.reset.addEventListener("click", resetAll);

  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    const target = e.target;
    const tag = target && target.tagName ? String(target.tagName).toLowerCase() : "";
    const typing =
      tag === "input" || tag === "textarea" || tag === "select" || (target && target.isContentEditable);
    if (typing) return;

    if (e.key === "s" || e.key === "S") {
      e.preventDefault();
      els.spin.click();
    }
  });

  window.addEventListener("resize", () => {
    if (!els.confetti) return;
    fitCanvasToElement(els.confetti, document.querySelector(".machine"));
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && autoRemaining > 0) {
      autoRemaining = 0;
      setAutoPressed(false);
      setStatus("Auto-spin paused because the tab went hidden. (We’re not monsters.)", "warn");
    }
  });
}

function init() {
  for (let i = 0; i < 3; i++) setSymbol(i, weightedPickSymbol());
  fitCanvasToElement(els.confetti, document.querySelector(".machine"));
  wireEvents();
  updateUI();

  setStatus("Welcome. Spend tokens. Win tokens. Pretend you’re optimizing.", "");
  logLine("· Loaded from <code>localStorage</code>. Your past decisions persist.");
}

init();

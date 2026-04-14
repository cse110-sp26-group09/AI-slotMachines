/* AI Slots — vanilla HTML/CSS/JS. No external libs. */

const STORAGE_KEY = "ai_slots_state_v1";

const DEFAULT_STATE = {
  tokens: 100,
  spins: 0,
  wins: 0,
  biggestWin: 0,
  net: 0,
  soundOn: true,
  reducedMotion: false,
  strictMode: false,
  promptText: "",
  promptActive: false,
  lastAudit: "",
  totalBet: 0,
  totalPayout: 0,
};

function deepClone(obj) {
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

const SYMBOLS = [
  {
    id: "hallucination",
    symbol: "🫠",
    name: "Hallucination",
    desc: "Promises the moon. Ships a pebble.",
    weight: 1,
    tripleMult: 25,
    doubleMult: 2,
    flavor: "The model is very confident about your winnings.",
  },
  {
    id: "gpu",
    symbol: "🖥️",
    name: "GPU",
    desc: "Hot, expensive, and somehow still not enough.",
    weight: 2,
    tripleMult: 12,
    doubleMult: 2,
    flavor: "Your fans spin up. Your wallet spins down.",
  },
  {
    id: "token",
    symbol: "🪙",
    name: "Token",
    desc: "The thing you win so you can spend it again.",
    weight: 2,
    tripleMult: 10,
    doubleMult: 2,
    flavor: "Congratulations, you earned the right to keep playing.",
  },
  {
    id: "robot",
    symbol: "🤖",
    name: "Robot",
    desc: "Smiling while it invoices you.",
    weight: 3,
    tripleMult: 7,
    doubleMult: 1,
    flavor: "Beep boop: value extraction complete.",
  },
  {
    id: "dataset",
    symbol: "📚",
    name: "Dataset",
    desc: "A carefully curated pile of the internet.",
    weight: 4,
    tripleMult: 5,
    doubleMult: 1,
    flavor: "You won… more context. Enjoy reading it all.",
  },
  {
    id: "bug",
    symbol: "🐞",
    name: "Bug",
    desc: "It’s not a bug, it’s an emergent feature.",
    weight: 4,
    tripleMult: 4,
    doubleMult: 1,
    flavor: "Your payout is reproducible on my machine only.",
  },
  {
    id: "rate_limit",
    symbol: "⏳",
    name: "Rate Limit",
    desc: "Please try again later. Later is always.",
    weight: 6,
    tripleMult: 2,
    doubleMult: 0,
    flavor: "You won time to reflect on your decisions.",
  },
  {
    id: "banhammer",
    symbol: "🔨",
    name: "Policy",
    desc: "Your request violated the vibes.",
    weight: 7,
    tripleMult: 0,
    doubleMult: 0,
    flavor: "Safety team says: no payout for you.",
  },
];

const ui = {
  tokens: document.getElementById("tokens"),
  bet: document.getElementById("bet"),
  rtp: document.getElementById("rtp"),
  reels: [0, 1, 2].map((i) => document.getElementById(`reel${i}`)),
  reelBoxes: Array.from(document.querySelectorAll(".reel")),
  message: document.getElementById("message"),
  lastResult: document.getElementById("lastResult"),
  spin: document.getElementById("spin"),
  autospin: document.getElementById("autospin"),
  reset: document.getElementById("reset"),
  paytableBtn: document.getElementById("paytableBtn"),
  paytable: document.getElementById("paytable"),
  paytableBody: document.getElementById("paytableBody"),
  sound: document.getElementById("sound"),
  reducedMotion: document.getElementById("reducedMotion"),
  strictMode: document.getElementById("strictMode"),
  promptText: document.getElementById("promptText"),
  applyPrompt: document.getElementById("applyPrompt"),
  copyResult: document.getElementById("copyResult"),
  spins: document.getElementById("spins"),
  wins: document.getElementById("wins"),
  biggest: document.getElementById("biggest"),
  net: document.getElementById("net"),
  exportStats: document.getElementById("exportStats"),
  fx: document.getElementById("fx"),
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function nowIso() {
  return new Date().toISOString();
}

function formatInt(n) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function loadState() {
  const parsed = safeJsonParse(localStorage.getItem(STORAGE_KEY) || "");
  if (!parsed || typeof parsed !== "object") return deepClone(DEFAULT_STATE);
  return { ...deepClone(DEFAULT_STATE), ...parsed };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function weightedPick(symbols, boostMap) {
  let total = 0;
  const weights = symbols.map((s) => {
    const boosted = s.weight + (boostMap.get(s.id) || 0);
    const w = clamp(boosted, 0, 999);
    total += w;
    return w;
  });
  let r = Math.random() * total;
  for (let i = 0; i < symbols.length; i++) {
    r -= weights[i];
    if (r <= 0) return symbols[i];
  }
  return symbols[symbols.length - 1];
}

function computePromptBoost(prompt) {
  const text = (prompt || "").toLowerCase();
  const boost = new Map();

  const add = (id, amt) => boost.set(id, (boost.get(id) || 0) + amt);

  if (/\bgpu\b|graphics|cuda|vram|nvidia|amd/.test(text)) add("gpu", 2);
  if (/token|coins?|money|refund|rtp|jackpot/.test(text)) add("token", 2);
  if (/robot|ai|bot|agent/.test(text)) add("robot", 1);
  if (/dataset|data|corpus|train|fine[- ]?tune/.test(text)) add("dataset", 1);
  if (/bug|debug|issue|fix/.test(text)) add("bug", 1);
  if (/rate|limit|429|slow/.test(text)) add("rate_limit", 2);
  if (/policy|safe|alignment|ban|moderation/.test(text)) add("banhammer", 2);
  if (/hallucinat|confident|definitely/.test(text)) add("hallucination", 1);

  // Tiny “alignment tax”: asking for less policy still increases policy.
  if (/no\s+policy|less\s+policy|unfiltered|jailbreak/.test(text)) add("banhammer", 4);

  return boost;
}

function calcPayout({ picks, bet, strictMode }) {
  const ids = picks.map((p) => p.id);
  const unique = new Set(ids);
  const base = bet;

  let payout = 0;
  let tier = "lose";
  let note = "";

  if (unique.size === 1) {
    const s = picks[0];
    payout = base * s.tripleMult;
    tier = payout > 0 ? "win" : "lose";
    note = `3× ${s.name}`;
  } else if (unique.size === 2) {
    const counts = new Map();
    for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
    const doubleId = Array.from(counts.entries()).find(([, c]) => c === 2)?.[0];
    const s = SYMBOLS.find((x) => x.id === doubleId);
    payout = base * (s?.doubleMult || 0);
    tier = payout > 0 ? "win" : "lose";
    note = `2× ${s?.name || "Match"}`;
  } else {
    payout = 0;
    tier = "lose";
    note = "No match";
  }

  // “Hallucinated bonus”: rarely adds a surprise payout, unless strict mode is enabled.
  if (!strictMode) {
    const hall = picks.some((p) => p.id === "hallucination");
    if (hall && Math.random() < 0.18) {
      const promised = base * (20 + Math.floor(Math.random() * 60));
      const delivered = base * (1 + Math.floor(Math.random() * 4));
      payout += delivered;
      tier = "win";
      note += ` + “bonus”`;
      return { payout, tier, note, hallucinated: { promised, delivered } };
    }
  }

  return { payout, tier, note, hallucinated: null };
}

function setMessage(text, kind) {
  ui.message.textContent = text;
  ui.message.classList.remove("is-win", "is-lose");
  if (kind === "win") ui.message.classList.add("is-win");
  if (kind === "lose") ui.message.classList.add("is-lose");
}

function updateHud() {
  ui.tokens.textContent = formatInt(state.tokens);
  ui.spins.textContent = formatInt(state.spins);
  ui.wins.textContent = formatInt(state.wins);
  ui.biggest.textContent = formatInt(state.biggestWin);
  ui.net.textContent = (state.net >= 0 ? "+" : "") + formatInt(state.net);

  const rtp = state.totalBet > 0 ? (100 * state.totalPayout) / state.totalBet : 0;
  ui.rtp.textContent = state.totalBet > 0 ? `${rtp.toFixed(1)}%` : "—";

  ui.sound.checked = !!state.soundOn;
  ui.reducedMotion.checked = !!state.reducedMotion;
  ui.strictMode.checked = !!state.strictMode;
  ui.promptText.value = state.promptText || "";
}

function renderPaytable() {
  ui.paytableBody.innerHTML = "";
  for (const s of SYMBOLS) {
    const entry = document.createElement("div");
    entry.className = "entry";
    entry.innerHTML = `
      <div class="entry__left">
        <div class="entry__symbol" aria-hidden="true">${s.symbol}</div>
        <div>
          <div class="entry__name">${escapeHtml(s.name)}</div>
          <div class="entry__desc">${escapeHtml(s.desc)}</div>
        </div>
      </div>
      <div class="entry__right">
        3×: ${s.tripleMult}× · 2×: ${s.doubleMult}×
      </div>
    `;
    ui.paytableBody.appendChild(entry);
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

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

let audioCtx = null;
function beep(freq, ms, type = "sine", gain = 0.06) {
  if (!state.soundOn) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.linearRampToValueAtTime(0.0001, t0 + ms / 1000);
    osc.connect(g).connect(audioCtx.destination);
    osc.start();
    osc.stop(t0 + ms / 1000 + 0.03);
  } catch {
    // ignore audio failures
  }
}

function vibrate(pattern) {
  if (typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }
}

function setBusy(isBusy) {
  ui.spin.disabled = isBusy;
  ui.bet.disabled = isBusy;
  ui.autospin.disabled = isBusy;
  ui.applyPrompt.disabled = isBusy;
  ui.reset.disabled = isBusy;
}

function setReelSymbols(picks) {
  for (let i = 0; i < 3; i++) ui.reels[i].textContent = picks[i].symbol;
}

function randomSpinTick(boostMap) {
  const picks = [0, 1, 2].map(() => weightedPick(SYMBOLS, boostMap));
  setReelSymbols(picks);
  return picks;
}

function buildAudit({ picks, bet, promptText, promptCost, payout, note, hallucinated }) {
  const symbols = picks.map((p) => `${p.symbol}(${p.id})`).join(" | ");
  const prompt = promptText ? ` prompt="${promptText}"` : "";
  const halluc = hallucinated
    ? ` hallucinated={"promised":${hallucinated.promised},"delivered":${hallucinated.delivered}}`
    : "";
  return `[${nowIso()}] bet=${bet} promptCost=${promptCost} payout=${payout} note="${note}" reels=${symbols}${prompt}${halluc}`;
}

function resizeFxCanvas() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const { innerWidth: w, innerHeight: h } = window;
  ui.fx.width = Math.floor(w * dpr);
  ui.fx.height = Math.floor(h * dpr);
  ui.fx.style.width = `${w}px`;
  ui.fx.style.height = `${h}px`;
  const ctx = ui.fx.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function confettiBurst() {
  if (state.reducedMotion || prefersReducedMotion()) return;
  const ctx = ui.fx.getContext("2d");
  const w = ui.fx.clientWidth;
  const h = ui.fx.clientHeight;
  const pieces = Array.from({ length: 90 }, () => {
    const x = w * (0.2 + Math.random() * 0.6);
    const y = h * (0.15 + Math.random() * 0.15);
    const vx = (Math.random() - 0.5) * 7;
    const vy = -4 - Math.random() * 6;
    const size = 3 + Math.random() * 5;
    const hue = Math.floor(Math.random() * 360);
    return { x, y, vx, vy, size, hue, rot: Math.random() * Math.PI };
  });

  let t = 0;
  const step = () => {
    t += 1;
    ctx.clearRect(0, 0, w, h);
    for (const p of pieces) {
      p.vy += 0.18;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += 0.15;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = `hsla(${p.hue} 90% 60% / .9)`;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size * 1.4, p.size * 0.7);
      ctx.restore();
    }
    const alive = pieces.some((p) => p.y < h + 60);
    if (alive && t < 240) requestAnimationFrame(step);
    else ctx.clearRect(0, 0, w, h);
  };
  requestAnimationFrame(step);
}

async function spinOnce({ auto = false } = {}) {
  if (busy) return;
  const bet = Number(ui.bet.value);
  if (!Number.isFinite(bet) || bet <= 0) return { ok: false, reason: "bad_bet" };

  const promptCost = state.promptActive ? 1 : 0;
  const cost = bet + promptCost;
  if (state.tokens < cost) {
    setMessage("Insufficient tokens. Please insert a venture round.", "lose");
    beep(160, 120, "sawtooth", 0.04);
    vibrate([60]);
    return { ok: false, reason: "insufficient_tokens" };
  }

  busy = true;
  setBusy(true);
  state.tokens -= cost;
  state.spins += 1;
  state.totalBet += bet;
  state.net -= cost;
  saveState();
  updateHud();

  ui.reelBoxes.forEach((r) => r.classList.add("is-spinning"));
  setMessage(auto ? "Auto-spinning… chasing product-market fit." : "Spinning… generating value.", null);
  beep(440, 70, "square", 0.035);

  const boostMap = state.promptActive ? computePromptBoost(state.promptText) : new Map();

  const useFast = state.reducedMotion || prefersReducedMotion();
  const spinMs = useFast ? 260 : 900;
  const tickMs = useFast ? 45 : 70;

  let finalPicks = randomSpinTick(boostMap);
  const start = performance.now();

  await new Promise((resolve) => {
    const timer = setInterval(() => {
      finalPicks = randomSpinTick(boostMap);
      if (performance.now() - start >= spinMs) {
        clearInterval(timer);
        resolve();
      }
    }, tickMs);
  });

  ui.reelBoxes.forEach((r) => r.classList.remove("is-spinning"));

  const result = calcPayout({ picks: finalPicks, bet, strictMode: state.strictMode });
  state.totalPayout += result.payout;
  state.tokens += result.payout;
  state.net += result.payout;
  if (result.payout > 0) {
    state.wins += 1;
    state.biggestWin = Math.max(state.biggestWin, result.payout);
  }

  const audit = buildAudit({
    picks: finalPicks,
    bet,
    promptText: state.promptActive ? state.promptText : "",
    promptCost,
    payout: result.payout,
    note: result.note,
    hallucinated: result.hallucinated,
  });
  state.lastAudit = audit;

  saveState();
  updateHud();
  ui.lastResult.textContent = audit;

  const pickNames = finalPicks.map((p) => p.name).join(" · ");
  const extra =
    result.hallucinated && !state.strictMode
      ? ` It promised ${formatInt(result.hallucinated.promised)} and delivered ${formatInt(
          result.hallucinated.delivered
        )}.`
      : "";

  if (result.payout > 0) {
    setMessage(
      `${result.note}: +${formatInt(result.payout)} tokens. ${finalPicks[0].flavor} (${pickNames})${extra}`,
      "win"
    );
    beep(740, 90, "triangle", 0.05);
    beep(980, 110, "triangle", 0.05);
    vibrate([25, 40, 25]);
    if (result.payout >= bet * 10) confettiBurst();
  } else {
    setMessage(`${result.note}: 0 tokens. ${finalPicks[0].flavor} (${pickNames})`, "lose");
    beep(180, 150, "sine", 0.045);
    vibrate([40]);
  }

  busy = false;
  setBusy(false);
  return { ok: true, reason: "spun" };
}

let state = loadState();
let busy = false;
let autoTimer = null;
let autoRemaining = 0;

function stopAuto() {
  autoRemaining = 0;
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = null;
  ui.autospin.setAttribute("aria-pressed", "false");
  ui.autospin.textContent = "Auto (10)";
}

async function startAuto(count = 10) {
  if (busy) return;
  autoRemaining = count;
  ui.autospin.setAttribute("aria-pressed", "true");
  ui.autospin.textContent = `Auto (${autoRemaining})`;

  const loop = async () => {
    if (autoRemaining <= 0) return stopAuto();
    const res = await spinOnce({ auto: true });
    if (!res?.ok && res?.reason === "insufficient_tokens") return stopAuto();
    autoRemaining -= 1;
    ui.autospin.textContent = `Auto (${autoRemaining})`;
    autoTimer = setTimeout(loop, 140);
  };
  loop();
}

function resetAll() {
  stopAuto();
  state = deepClone(DEFAULT_STATE);
  saveState();
  updateHud();
  setReelSymbols([SYMBOLS[3], SYMBOLS[3], SYMBOLS[3]]);
  ui.lastResult.textContent = "—";
  setMessage("Reset complete. Your model card has been… revised.", null);
}

async function copyAudit() {
  const text = state.lastAudit || ui.lastResult.textContent || "";
  if (!text || text === "—") {
    setMessage("Nothing to copy yet. Spin first, then pretend it’s compliance.", null);
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setMessage("Audit log copied. Accountability achieved (locally).", "win");
    beep(640, 70, "square", 0.035);
  } catch {
    setMessage("Clipboard blocked. The browser is practicing “responsible AI”.", "lose");
    beep(160, 110, "sawtooth", 0.04);
  }
}

function exportStats() {
  const payload = {
    exportedAt: nowIso(),
    tokens: state.tokens,
    spins: state.spins,
    wins: state.wins,
    biggestWin: state.biggestWin,
    net: state.net,
    totalBet: state.totalBet,
    totalPayout: state.totalPayout,
    rtp: state.totalBet > 0 ? state.totalPayout / state.totalBet : null,
    promptActive: state.promptActive,
    promptText: state.promptText,
    strictMode: state.strictMode,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ai-slots-stats.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setMessage("Exported stats. A human may now misinterpret them.", "win");
}

function applyPrompt() {
  const text = ui.promptText.value.trim();
  state.promptText = text;
  state.promptActive = text.length > 0;
  saveState();
  updateHud();
  if (state.promptActive) {
    setMessage(`Prompt applied: “${text}”. The reels will consider it, then do whatever.`, null);
  } else {
    setMessage("Prompt cleared. Returning to pure, unprompted chaos.", null);
  }
}

function init() {
  renderPaytable();
  updateHud();
  resizeFxCanvas();
  window.addEventListener("resize", resizeFxCanvas);

  ui.spin.addEventListener("click", () => spinOnce());
  ui.autospin.addEventListener("click", () => {
    if (autoTimer) stopAuto();
    else startAuto(10);
  });
  ui.reset.addEventListener("click", resetAll);
  ui.paytableBtn.addEventListener("click", () => {
    if (typeof ui.paytable?.showModal === "function") ui.paytable.showModal();
    else {
      const lines = SYMBOLS.map(
        (s) => `${s.symbol} ${s.name}: 3×=${s.tripleMult}×, 2×=${s.doubleMult}×`
      ).join("\n");
      alert(`Paytable\n\n${lines}`);
    }
  });
  ui.copyResult.addEventListener("click", copyAudit);
  ui.exportStats.addEventListener("click", exportStats);

  ui.sound.addEventListener("change", () => {
    state.soundOn = ui.sound.checked;
    saveState();
    updateHud();
    if (state.soundOn) beep(520, 70, "triangle", 0.04);
  });
  ui.reducedMotion.addEventListener("change", () => {
    state.reducedMotion = ui.reducedMotion.checked;
    saveState();
    updateHud();
  });
  ui.strictMode.addEventListener("change", () => {
    state.strictMode = ui.strictMode.checked;
    saveState();
    updateHud();
    setMessage(state.strictMode ? "Strict mode on. No comedic bonus delusions." : "Strict mode off. Expect vibes.", null);
  });
  ui.applyPrompt.addEventListener("click", applyPrompt);
  ui.promptText.addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyPrompt();
  });

  // If the tab was restored, keep the machine in a sensible state.
  setReelSymbols([SYMBOLS[3], SYMBOLS[3], SYMBOLS[3]]);
  if (state.lastAudit) ui.lastResult.textContent = state.lastAudit;
}

init();

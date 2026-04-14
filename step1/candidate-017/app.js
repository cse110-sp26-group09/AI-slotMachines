const STORAGE_KEY = "ai-slot.state.v1";

const SYMBOLS = [
  { key: "BOT", glyph: "🤖", name: "Bot", weight: 14 },
  { key: "BRAIN", glyph: "🧠", name: "Brain", weight: 12 },
  { key: "TOKEN", glyph: "🪙", name: "Token", weight: 10 },
  { key: "GPU", glyph: "🧯", name: "GPU On Fire", weight: 7 },
  { key: "PAPER", glyph: "🧾", name: "Citations", weight: 10 },
  { key: "CHART", glyph: "📈", name: "Line Goes Up", weight: 9 },
  { key: "CAP", glyph: "🧢", name: "Confident Lie", weight: 9 },
  { key: "BAN", glyph: "🚫", name: "Rate Limit", weight: 8 },
  { key: "SPARK", glyph: "✨", name: "Magic", weight: 8 },
  { key: "SKULL", glyph: "💀", name: "Hallucination", weight: 6 },
];

const PAYOUTS = [
  {
    id: "JACKPOT_GPU",
    label: "🧯🧯🧯 Triple GPU Fire (jackpot)",
    match: (r) => r[0] === "GPU" && r[1] === "GPU" && r[2] === "GPU",
    multiplier: 30,
    kind: "jackpot",
  },
  {
    id: "TRIPLE_TOKEN",
    label: "🪙🪙🪙 Triple Tokens",
    match: (r) => r[0] === "TOKEN" && r[1] === "TOKEN" && r[2] === "TOKEN",
    multiplier: 12,
    kind: "win",
  },
  {
    id: "TRIPLE_BOT",
    label: "🤖🤖🤖 Full Automation",
    match: (r) => r[0] === "BOT" && r[1] === "BOT" && r[2] === "BOT",
    multiplier: 10,
    kind: "win",
  },
  {
    id: "TRIPLE_OTHER",
    label: "Any triple",
    match: (r) => r[0] === r[1] && r[1] === r[2],
    multiplier: 8,
    kind: "win",
  },
  {
    id: "DOUBLE_ANY",
    label: "Any double",
    match: (r) => r[0] === r[1] || r[1] === r[2] || r[0] === r[2],
    multiplier: 2,
    kind: "win",
  },
  {
    id: "TRIPLE_SKULL",
    label: "💀💀💀 Triple Hallucination (catastrophic)",
    match: (r) => r[0] === "SKULL" && r[1] === "SKULL" && r[2] === "SKULL",
    multiplier: 0,
    kind: "lose",
  },
];

function clampInt(n, min, max) {
  const x = Math.trunc(Number.isFinite(n) ? n : 0);
  return Math.min(max, Math.max(min, x));
}

function weightedPick(items) {
  const total = items.reduce((sum, it) => sum + it.weight, 0);
  let roll = Math.random() * total;
  for (const it of items) {
    roll -= it.weight;
    if (roll <= 0) return it;
  }
  return items[items.length - 1];
}

function byKey(key) {
  return SYMBOLS.find((x) => x.key === key) || SYMBOLS[0];
}

function formatTok(n) {
  return `${Math.trunc(n).toLocaleString()} tok`;
}

function nowIso() {
  return new Date().toISOString();
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getDefaultState() {
  return {
    version: 1,
    tokens: 120,
    bet: 5,
    temperature: 0.5,
    context: 1,
    shield: 0,
    promptInjection: false,
    stats: {
      spins: 0,
      lifetimeWon: 0,
      lifetimeSpent: 0,
      jackpots: 0,
      lastSpinAt: null,
    },
  };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? safeJsonParse(raw) : null;
  const base = getDefaultState();
  if (!parsed || typeof parsed !== "object") return base;

  return {
    ...base,
    ...parsed,
    tokens: clampInt(parsed.tokens ?? base.tokens, 0, 1_000_000_000),
    bet: clampInt(parsed.bet ?? base.bet, 1, 25),
    temperature: Math.min(1, Math.max(0, Number(parsed.temperature ?? base.temperature))),
    context: clampInt(parsed.context ?? base.context, 1, 20),
    shield: clampInt(parsed.shield ?? base.shield, 0, 99),
    promptInjection: Boolean(parsed.promptInjection ?? base.promptInjection),
    stats: {
      ...base.stats,
      ...(parsed.stats || {}),
    },
  };
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function canVibrate() {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

function vibrate(pattern) {
  if (!canVibrate()) return;
  navigator.vibrate(pattern);
}

function createAudio() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  return new AudioCtx();
}

function bleep(ctx, { kind }) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = kind === "win" ? "triangle" : "square";
  osc.frequency.setValueAtTime(kind === "win" ? 660 : 180, t0);
  osc.frequency.exponentialRampToValueAtTime(kind === "win" ? 1100 : 120, t0 + 0.14);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + 0.2);
}

function sparkle(ctx) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(440, t0);
  osc.frequency.exponentialRampToValueAtTime(1760, t0 + 0.25);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.14, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + 0.34);
}

function toast(el, msg) {
  el.textContent = msg;
  el.classList.add("show");
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => el.classList.remove("show"), 1600);
}

function computeContextCost(context) {
  return 10 + context * 8;
}

function applyTemperatureWeights(temp, promptInjection) {
  return SYMBOLS.map((s) => {
    const rarityBoost = s.key === "GPU" || s.key === "TOKEN" ? 1.2 : 1;
    const chaosPenalty = s.key === "SKULL" || s.key === "CAP" ? 1.2 : 1;
    const base = s.weight;
    const boring = s.key === "BOT" || s.key === "BRAIN" || s.key === "PAPER" ? 1.1 : 0.95;
    const chaos = s.key === "GPU" || s.key === "SKULL" || s.key === "CAP" ? 1.15 : 0.98;
    const mix = 1 + (temp - 0.5) * (chaos - boring);
    let w = base * mix * rarityBoost * chaosPenalty;

    if (promptInjection) {
      if (s.key === "GPU" || s.key === "TOKEN" || s.key === "SPARK") w *= 1.08;
      if (s.key === "SKULL") w *= 0.92;
    }
    return { ...s, weight: Math.max(0.2, w) };
  });
}

function rateLimitedChance(state) {
  const base = 0.06;
  const contextHelp = Math.min(0.04, (state.context - 1) * 0.004);
  const injTax = state.promptInjection ? 0.03 : 0;
  return Math.max(0.01, base + injTax - contextHelp);
}

function complianceTaxMultiplier(state) {
  return state.promptInjection ? 0.12 : 0;
}

function pickResult(state) {
  const weightedSymbols = applyTemperatureWeights(state.temperature, state.promptInjection);
  const keys = [];
  for (let i = 0; i < 3; i++) keys.push(weightedPick(weightedSymbols).key);

  if (keys[0] === "SKULL" && keys[1] === "SKULL" && keys[2] === "SKULL") {
    const escape = Math.min(0.65, (state.context - 1) * 0.06);
    if (Math.random() < escape) {
      const noSkull = weightedSymbols.filter((s) => s.key !== "SKULL");
      keys[2] = weightedPick(noSkull).key;
    }
  }
  return keys;
}

function computePayout(resultKeys, bet) {
  for (const p of PAYOUTS) {
    if (p.id === "TRIPLE_OTHER" || p.id === "DOUBLE_ANY") continue;
    if (p.match(resultKeys))
      return { payout: Math.trunc(bet * p.multiplier), payoutId: p.id, kind: p.kind };
  }

  const triple = resultKeys[0] === resultKeys[1] && resultKeys[1] === resultKeys[2];
  if (triple) {
    const p = PAYOUTS.find((x) => x.id === "TRIPLE_OTHER");
    return { payout: Math.trunc(bet * p.multiplier), payoutId: p.id, kind: p.kind };
  }
  const dbl = PAYOUTS.find((x) => x.id === "DOUBLE_ANY");
  if (dbl.match(resultKeys)) {
    return { payout: Math.trunc(bet * dbl.multiplier), payoutId: dbl.id, kind: dbl.kind };
  }
  return { payout: 0, payoutId: null, kind: "lose" };
}

function describeOutcome({ resultKeys, bet, payout, payoutId, wasRateLimited, tax, shieldUsed }) {
  const glyphs = resultKeys.map((k) => byKey(k).glyph).join(" ");

  if (wasRateLimited) {
    return `🚫 Rate limited. The API refused to spin. You still paid ${formatTok(bet)} because of course you did.`;
  }
  if (payoutId === "TRIPLE_SKULL") {
    return `💀 Hallucination cascade: ${glyphs}. Your answer was confidently wrong and also formatted in Markdown.`;
  }
  if (shieldUsed) {
    return `🛡️ Prompt Shield™ intercepted a hallucination. (It screamed.) Result: ${glyphs}.`;
  }
  if (payout > 0) {
    const taxMsg = tax > 0 ? ` Compliance tax: ${formatTok(tax)}.` : "";
    return `✅ ${glyphs} — payout ${formatTok(payout)}.${taxMsg}`;
  }
  return `❌ ${glyphs} — no payout. Try adding “please” or “as an expert” next time.`;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (
    location.protocol !== "https:" &&
    location.hostname !== "localhost" &&
    location.hostname !== "127.0.0.1"
  )
    return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

function main() {
  const els = {
    reels: [0, 1, 2].map((i) => document.getElementById(`reel${i}`)),
    reelFaces: [0, 1, 2].map((i) => document.querySelector(`#reel${i} .reelFace`)),
    balanceValue: document.getElementById("balanceValue"),
    betValue: document.getElementById("betValue"),
    statusValue: document.getElementById("statusValue"),
    message: document.getElementById("message"),
    toast: document.getElementById("toast"),
    spinBtn: document.getElementById("spinBtn"),
    autoBtn: document.getElementById("autoBtn"),
    resetBtn: document.getElementById("resetBtn"),
    betSelect: document.getElementById("betSelect"),
    payoutList: document.getElementById("payoutList"),
    tempSlider: document.getElementById("tempSlider"),
    buyContextBtn: document.getElementById("buyContextBtn"),
    contextCost: document.getElementById("contextCost"),
    buyShieldBtn: document.getElementById("buyShieldBtn"),
    injectToggle: document.getElementById("injectToggle"),
    spinsValue: document.getElementById("spinsValue"),
    wonValue: document.getElementById("wonValue"),
    spentValue: document.getElementById("spentValue"),
    jackpotsValue: document.getElementById("jackpotsValue"),
    copyStatsBtn: document.getElementById("copyStatsBtn"),
    downloadStatsBtn: document.getElementById("downloadStatsBtn"),
  };

  let state = loadState();
  let isSpinning = false;
  let auto = false;
  const audio = createAudio();

  function setStatus(s) {
    els.statusValue.textContent = s;
  }

  function renderPayouts() {
    els.payoutList.innerHTML = "";
    const show = [
      "JACKPOT_GPU",
      "TRIPLE_TOKEN",
      "TRIPLE_BOT",
      "TRIPLE_OTHER",
      "DOUBLE_ANY",
      "TRIPLE_SKULL",
    ]
      .map((id) => PAYOUTS.find((p) => p.id === id))
      .filter(Boolean);

    for (const p of show) {
      const li = document.createElement("li");
      li.innerHTML = `<span>${p.label}</span><span>${p.multiplier === 0 ? "💸" : `x${p.multiplier}`}</span>`;
      els.payoutList.appendChild(li);
    }
  }

  function render() {
    els.balanceValue.textContent = formatTok(state.tokens);
    els.betValue.textContent = String(state.bet);
    els.betSelect.value = String(state.bet);
    els.tempSlider.value = String(Math.round(state.temperature * 100));
    els.injectToggle.checked = state.promptInjection;
    els.contextCost.textContent = formatTok(computeContextCost(state.context));

    els.spinsValue.textContent = String(state.stats.spins);
    els.wonValue.textContent = formatTok(state.stats.lifetimeWon);
    els.spentValue.textContent = formatTok(state.stats.lifetimeSpent);
    els.jackpotsValue.textContent = String(state.stats.jackpots);

    const faces = state._lastFaces || ["…", "…", "…"];
    for (let i = 0; i < 3; i++) els.reelFaces[i].textContent = faces[i];

    els.autoBtn.setAttribute("aria-pressed", auto ? "true" : "false");
  }

  function setDisabled(disabled) {
    els.spinBtn.disabled = disabled;
    els.resetBtn.disabled = disabled;
    els.betSelect.disabled = disabled;
    els.tempSlider.disabled = disabled;
    els.buyContextBtn.disabled = disabled;
    els.buyShieldBtn.disabled = disabled;
    els.injectToggle.disabled = disabled;
    els.copyStatsBtn.disabled = disabled;
    els.downloadStatsBtn.disabled = disabled;
  }

  function setMessage(text) {
    els.message.textContent = text;
  }

  async function animateReel(i, finalKey, ms) {
    const reel = els.reels[i];
    const face = els.reelFaces[i];
    reel.classList.add("spinning");

    const start = performance.now();
    const tick = 42;
    return await new Promise((resolve) => {
      const t = window.setInterval(() => {
        const elapsed = performance.now() - start;
        face.textContent = weightedPick(SYMBOLS).glyph;
        if (elapsed >= ms) {
          window.clearInterval(t);
          face.textContent = byKey(finalKey).glyph;
          reel.classList.remove("spinning");
          resolve();
        }
      }, tick);
    });
  }

  async function spinOnce() {
    if (isSpinning) return;
    isSpinning = true;
    setDisabled(true);
    setStatus("Spinning…");

    const bet = state.bet;
    if (state.tokens < bet) {
      setMessage(`Not enough tokens to spin. Balance ${formatTok(state.tokens)}; bet ${formatTok(bet)}.`);
      toast(els.toast, "Insufficient tokens (try VC funding).");
      setStatus("Idle");
      setDisabled(false);
      isSpinning = false;
      return;
    }

    state.tokens -= bet;
    state.stats.lifetimeSpent += bet;
    state.stats.spins += 1;
    state.stats.lastSpinAt = nowIso();
    saveState(state);
    render();

    const wasRateLimited = Math.random() < rateLimitedChance(state);
    const resultKeys = wasRateLimited ? ["BAN", "BAN", "BAN"] : pickResult(state);

    let shieldUsed = false;
    if (
      !wasRateLimited &&
      state.shield > 0 &&
      resultKeys[0] === "SKULL" &&
      resultKeys[1] === "SKULL" &&
      resultKeys[2] === "SKULL"
    ) {
      state.shield -= 1;
      shieldUsed = true;
      resultKeys[2] = pickResult({ ...state, temperature: Math.max(0.05, state.temperature * 0.8) })[2];
    }

    const [a, b, c] = resultKeys;
    await Promise.all([animateReel(0, a, 760), animateReel(1, b, 980), animateReel(2, c, 1180)]);

    let payout = 0;
    let payoutId = null;
    if (!wasRateLimited) {
      const computed = computePayout(resultKeys, bet);
      payout = computed.payout;
      payoutId = computed.payoutId;
    }

    const tax = Math.trunc(payout * complianceTaxMultiplier(state));
    const netPayout = Math.max(0, payout - tax);

    state.tokens += netPayout;
    state.stats.lifetimeWon += netPayout;
    if (payoutId === "JACKPOT_GPU") state.stats.jackpots += 1;
    state._lastFaces = resultKeys.map((k) => byKey(k).glyph);

    saveState(state);
    render();

    setMessage(
      describeOutcome({
        resultKeys,
        bet,
        payout: netPayout,
        payoutId,
        wasRateLimited,
        tax,
        shieldUsed,
      })
    );

    if (wasRateLimited) {
      bleep(audio, { kind: "lose" });
      toast(els.toast, "429: Too Many Spins");
      vibrate([40, 40, 40]);
    } else if (payoutId === "JACKPOT_GPU") {
      sparkle(audio);
      toast(els.toast, `JACKPOT! +${formatTok(netPayout)}`);
      vibrate([40, 60, 40, 60, 120]);
    } else if (netPayout > 0) {
      bleep(audio, { kind: "win" });
      toast(els.toast, `+${formatTok(netPayout)}`);
      vibrate([20]);
    } else {
      bleep(audio, { kind: "lose" });
      toast(els.toast, `-${formatTok(bet)}`);
      vibrate([12]);
    }

    setStatus(auto ? "Auto…" : "Idle");
    setDisabled(false);
    isSpinning = false;
  }

  function startAuto() {
    if (auto) return;
    auto = true;
    setStatus("Auto…");
    render();
    tickAuto();
  }

  function stopAuto() {
    auto = false;
    setStatus("Idle");
    render();
  }

  async function tickAuto() {
    while (auto) {
      if (document.visibilityState !== "visible") {
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }
      if (state.tokens < state.bet) {
        toast(els.toast, "Auto stopped (out of tokens).");
        stopAuto();
        break;
      }
      await spinOnce();
      await new Promise((r) => setTimeout(r, 220));
    }
  }

  function factoryReset() {
    if (!confirm("Reset everything to factory defaults? This deletes your token empire.")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = loadState();
    auto = false;
    setMessage("Factory reset complete. Fresh tokens. Fresh mistakes.");
    toast(els.toast, "Reset.");
    render();
  }

  function buyContext() {
    const cost = computeContextCost(state.context);
    if (state.tokens < cost) {
      toast(els.toast, "Not enough tokens for more context.");
      setMessage(`Need ${formatTok(cost)} to buy more context. Current balance: ${formatTok(state.tokens)}.`);
      return;
    }
    state.tokens -= cost;
    state.stats.lifetimeSpent += cost;
    state.context += 1;
    saveState(state);
    render();
    toast(els.toast, "Context window expanded.");
    setMessage(`You bought more context. The model will now forget things slightly later. (-${formatTok(cost)})`);
  }

  function buyShield() {
    const cost = 30;
    if (state.shield > 0) {
      toast(els.toast, "You already have a shield.");
      setMessage("Prompt Shield™ already installed. No refunds, no support.");
      return;
    }
    if (state.tokens < cost) {
      toast(els.toast, "Not enough tokens for Prompt Shield™.");
      setMessage(`Need ${formatTok(cost)} to buy Prompt Shield™. Balance: ${formatTok(state.tokens)}.`);
      return;
    }
    state.tokens -= cost;
    state.stats.lifetimeSpent += cost;
    state.shield = 1;
    saveState(state);
    render();
    toast(els.toast, "Prompt Shield™ acquired.");
    setMessage("Prompt Shield™ installed. It blocks one (1) hallucination. Warranty void if looked at.");
  }

  async function copyStats() {
    const payload = {
      exportedAt: nowIso(),
      balance: state.tokens,
      bet: state.bet,
      temperature: state.temperature,
      context: state.context,
      shield: state.shield,
      promptInjection: state.promptInjection,
      stats: state.stats,
    };
    const text = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      toast(els.toast, "Stats copied to clipboard.");
    } catch {
      toast(els.toast, "Clipboard blocked. Try HTTPS.");
    }
  }

  function downloadStats() {
    const payload = {
      exportedAt: nowIso(),
      balance: state.tokens,
      bet: state.bet,
      temperature: state.temperature,
      context: state.context,
      shield: state.shield,
      promptInjection: state.promptInjection,
      stats: state.stats,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-slot-stats-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function onBetChange() {
    state.bet = clampInt(parseInt(els.betSelect.value, 10), 1, 25);
    saveState(state);
    render();
  }

  function onTempChange() {
    state.temperature = clampInt(parseInt(els.tempSlider.value, 10), 0, 100) / 100;
    saveState(state);
    render();
  }

  function onInjectToggle() {
    state.promptInjection = Boolean(els.injectToggle.checked);
    saveState(state);
    render();
    toast(els.toast, state.promptInjection ? "Injection enabled (yikes)." : "Injection disabled.");
  }

  renderPayouts();
  render();
  setStatus("Idle");

  els.spinBtn.addEventListener("click", () => spinOnce());
  els.autoBtn.addEventListener("click", () => (auto ? stopAuto() : startAuto()));
  els.resetBtn.addEventListener("click", () => factoryReset());
  els.betSelect.addEventListener("change", () => onBetChange());
  els.tempSlider.addEventListener("input", () => onTempChange());
  els.buyContextBtn.addEventListener("click", () => buyContext());
  els.buyShieldBtn.addEventListener("click", () => buyShield());
  els.injectToggle.addEventListener("change", () => onInjectToggle());
  els.copyStatsBtn.addEventListener("click", () => copyStats());
  els.downloadStatsBtn.addEventListener("click", () => downloadStats());

  window.addEventListener("keydown", (e) => {
    if (e.key !== " " && e.key !== "Enter") return;
    if (
      document.activeElement &&
      ["BUTTON", "SELECT", "INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
    )
      return;
    e.preventDefault();
    spinOnce();
  });

  registerServiceWorker();
}

document.addEventListener("DOMContentLoaded", main);


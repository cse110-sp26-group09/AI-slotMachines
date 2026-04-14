(() => {
  "use strict";

  const STORAGE_KEY = "ai-slot-machine.save.v1";

  const MODELS = [
    { id: "gpt-3.5-turbo-ish", label: "GPT-3.5-ish", context: "4k-ish" },
    { id: "gpt-4-ish", label: "GPT-4-ish", context: "32k-ish" },
    { id: "gpt-5-ish", label: "GPT-5-ish", context: "128k-ish" }
  ];

  const SYMBOLS = [
    { id: "token", emoji: "🪙", label: "Token Jackpot", weight: 9, triplePayout: 35 },
    { id: "gpu", emoji: "🧠", label: "GPU Time", weight: 12, triplePayout: 18 },
    { id: "prompt", emoji: "🧾", label: "Perfect Prompt", weight: 11, triplePayout: 16 },
    { id: "rag", emoji: "📚", label: "RAG Retrieval", weight: 12, triplePayout: 14 },
    { id: "agent", emoji: "🧑‍💻", label: "Agentic Chaos", weight: 10, triplePayout: 20 },
    { id: "oom", emoji: "💥", label: "CUDA OOM", weight: 9, triplePayout: 26 },
    { id: "rate", emoji: "🛑", label: "429 Rate Limit", weight: 8, triplePayout: 28 },
    { id: "hallucination", emoji: "🫠", label: "Hallucination", weight: 7, triplePayout: 0 }
  ];

  const DEFAULT_SAVE = {
    version: 1,
    tokens: 120,
    modelId: MODELS[0].id,
    temperature: 0.45,
    bet: 7,
    lifetimeWon: 0,
    lifetimeSpent: 0,
    history: [],
    daily: { lastClaimISO: null }
  };

  const clone = (obj) => {
    if (typeof structuredClone === "function") return structuredClone(obj);
    return JSON.parse(JSON.stringify(obj));
  };

  const dom = {
    tokensValue: document.getElementById("tokensValue"),
    modelValue: document.getElementById("modelValue"),
    contextValue: document.getElementById("contextValue"),

    reels: [document.getElementById("reel0"), document.getElementById("reel1"), document.getElementById("reel2")],
    reelEmoji: [
      document.getElementById("reelEmoji0"),
      document.getElementById("reelEmoji1"),
      document.getElementById("reelEmoji2")
    ],
    reelText: [document.getElementById("reelText0"), document.getElementById("reelText1"), document.getElementById("reelText2")],

    spinBtn: document.getElementById("spinBtn"),
    autoBtn: document.getElementById("autoBtn"),
    bragBtn: document.getElementById("bragBtn"),
    resetBtn: document.getElementById("resetBtn"),

    spinCostPill: document.getElementById("spinCostPill"),
    tempSlider: document.getElementById("tempSlider"),
    tempValue: document.getElementById("tempValue"),
    betInput: document.getElementById("betInput"),
    betHint: document.getElementById("betHint"),
    dailyBtn: document.getElementById("dailyBtn"),
    dailyHint: document.getElementById("dailyHint"),

    status: document.getElementById("status"),
    payouts: document.getElementById("payouts"),
    history: document.getElementById("history")
  };

  let save = loadSave();
  let isSpinning = false;
  let autoSpin = false;
  let autoSpinTimer = null;
  let cooldownUntil = 0;
  let lastOutcomeForBrag = null;

  const audio = createAudio();

  init();

  function init() {
    renderPayouts();
    hydrateControlsFromSave();
    renderAll();
    wireEvents();
    registerServiceWorker();
    setInitialReels();
    tickDailyHint();
    window.setInterval(tickDailyHint, 1_000);
  }

  function wireEvents() {
    dom.spinBtn.addEventListener("click", () => spin("manual"));
    dom.autoBtn.addEventListener("click", toggleAutoSpin);
    dom.bragBtn.addEventListener("click", copyBrag);
    dom.resetBtn.addEventListener("click", resetSave);

    dom.tempSlider.addEventListener("input", () => {
      save.temperature = clamp01(Number(dom.tempSlider.value) / 100);
      dom.tempValue.textContent = save.temperature.toFixed(2);
      persistSoon();
    });

    dom.betInput.addEventListener("input", () => {
      const parsed = Number(dom.betInput.value);
      if (!Number.isFinite(parsed)) return;
      save.bet = clampInt(parsed, 1, 9999);
      dom.spinCostPill.textContent = `-${save.bet}`;
      dom.betHint.textContent = `Burns ${save.bet} tokens per spin.`;
      persistSoon();
      renderButtons();
    });

    dom.dailyBtn.addEventListener("click", claimDailyBonus);

    document.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        const active = document.activeElement;
        if (active && (active.tagName === "BUTTON" || active.tagName === "INPUT")) return;
        e.preventDefault();
        spin("keyboard");
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") stopAutoSpin();
    });
  }

  function setInitialReels() {
    const symbols = sampleOutcome(save.temperature);
    for (let i = 0; i < 3; i++) setReel(i, symbols[i]);
  }

  async function spin(source) {
    if (isSpinning) return;
    if (Date.now() < cooldownUntil) {
      setStatus("Rate-limited. Wait a sec…", "warn");
      nudgeMachine();
      return;
    }
    if (save.tokens < save.bet) {
      setStatus("Insufficient tokens. The AI demands a bigger budget.", "bad");
      nudgeMachine();
      return;
    }

    isSpinning = true;
    renderButtons();

    const bet = save.bet;
    save.tokens -= bet;
    save.lifetimeSpent += bet;
    persistSoon();
    renderHeader();

    const outcome = sampleOutcome(save.temperature);

    audio.tick();
    await animateSpin(outcome);

    const result = scoreOutcome(outcome, bet, getModel());
    applyResult(result);
    lastOutcomeForBrag = { outcome, result, source, atISO: new Date().toISOString() };
    isSpinning = false;
    renderAll();

    if (autoSpin) scheduleNextAutoSpin();
  }

  function scoreOutcome(outcome, bet, model) {
    const [a, b, c] = outcome.map((s) => s.id);
    const allSame = a === b && b === c;
    const twoSame = a === b || b === c || a === c;
    const temp = save.temperature;

    const modelMultiplier = model.id === MODELS[2].id ? 1.12 : model.id === MODELS[1].id ? 1.06 : 1.0;

    if (allSame && outcome[0].id === "hallucination") {
      return {
        type: "loss",
        payout: 0,
        message: "Three hallucinations! 100% confidence, 0% accuracy. Thought leadership achieved.",
        vibe: "bad",
        cooldownMs: 0
      };
    }

    if (allSame && outcome[0].id === "rate") {
      return {
        type: "event",
        payout: 0,
        message: "429 x3. The casino says: “slow down.” The AI says: “try exponential backoff.”",
        vibe: "warn",
        cooldownMs: 2000 + Math.floor(temp * 2000)
      };
    }

    if (allSame) {
      const base = outcome[0].triplePayout;
      const payout = Math.max(0, Math.floor(base * bet * modelMultiplier));
      return {
        type: "win",
        payout,
        message: `Triple ${outcome[0].label}. Tokens go brrrr.`,
        vibe: "good",
        cooldownMs: 0
      };
    }

    if (twoSame) {
      const payout = Math.max(0, Math.floor(bet * 1.25));
      return {
        type: "win",
        payout,
        message: "Two of a kind. A pity payout, like when the model says “As an AI…” and you still clap.",
        vibe: "good",
        cooldownMs: 0
      };
    }

    const snark = [
      "No match. You have been outperformed by a random baseline.",
      "No match. The model calls this “stochastic exploration.”",
      "No match. Consider adding more data. (And more money.)",
      "No match. The reward model did not vibe with your prompt.",
      "No match. Your tokens were successfully burned for shareholder value."
    ];
    return { type: "loss", payout: 0, message: snark[randomInt(0, snark.length)], vibe: "", cooldownMs: 0 };
  }

  function applyResult(result) {
    if (result.payout > 0) {
      save.tokens += result.payout;
      save.lifetimeWon += result.payout;
    }
    if (result.cooldownMs > 0) cooldownUntil = Date.now() + result.cooldownMs;

    const outcomeString = dom.reelEmoji.map((el) => el.textContent).join(" ");
    const line = result.payout > 0 ? `${outcomeString}  +${result.payout} tokens` : `${outcomeString}  +0 tokens`;
    save.history.unshift({ atISO: new Date().toISOString(), line });
    save.history = save.history.slice(0, 12);
    persistSoon();

    setStatus(result.message, result.vibe);
    if (result.type === "win") {
      audio.win();
      safeVibrate([20, 40, 30]);
    } else if (result.vibe === "warn") {
      audio.warn();
      safeVibrate([12, 40, 12]);
    } else {
      audio.loss();
      safeVibrate(10);
    }
  }

  async function animateSpin(finalOutcome) {
    const reelDurations = [650, 900, 1200];
    const tickMs = 55;

    dom.reels.forEach((r) => r.classList.add("spinning"));

    const tickers = [];
    for (let i = 0; i < 3; i++) {
      tickers[i] = window.setInterval(() => {
        setReel(i, sampleSymbol(save.temperature));
      }, tickMs);
    }

    await wait(reelDurations[0]);
    window.clearInterval(tickers[0]);
    setReel(0, finalOutcome[0]);
    dom.reels[0].classList.remove("spinning");
    audio.click();

    await wait(reelDurations[1] - reelDurations[0]);
    window.clearInterval(tickers[1]);
    setReel(1, finalOutcome[1]);
    dom.reels[1].classList.remove("spinning");
    audio.click();

    await wait(reelDurations[2] - reelDurations[1]);
    window.clearInterval(tickers[2]);
    setReel(2, finalOutcome[2]);
    dom.reels[2].classList.remove("spinning");
    audio.click();
  }

  function toggleAutoSpin() {
    autoSpin = !autoSpin;
    dom.autoBtn.setAttribute("aria-pressed", autoSpin ? "true" : "false");
    dom.autoBtn.textContent = autoSpin ? "Auto: On" : "Auto";
    if (autoSpin) {
      setStatus("Auto-spin enabled. You are now an AI agent with a spending problem.", "warn");
      scheduleNextAutoSpin(300);
    } else {
      stopAutoSpin();
      setStatus("Auto-spin disabled. Free will restored (until the next prompt).", "");
    }
    renderButtons();
  }

  function scheduleNextAutoSpin(delayMs = 650) {
    stopAutoSpinTimerOnly();
    autoSpinTimer = window.setTimeout(() => spin("auto"), delayMs);
  }

  function stopAutoSpin() {
    autoSpin = false;
    dom.autoBtn.setAttribute("aria-pressed", "false");
    dom.autoBtn.textContent = "Auto";
    stopAutoSpinTimerOnly();
    renderButtons();
  }

  function stopAutoSpinTimerOnly() {
    if (autoSpinTimer) window.clearTimeout(autoSpinTimer);
    autoSpinTimer = null;
  }

  function setReel(i, symbol) {
    dom.reelEmoji[i].textContent = symbol.emoji;
    dom.reelText[i].textContent = symbol.label;
  }

  function renderAll() {
    renderHeader();
    renderButtons();
    renderHistory();
    dom.tempValue.textContent = save.temperature.toFixed(2);
    dom.spinCostPill.textContent = `-${save.bet}`;
    dom.betHint.textContent = `Burns ${save.bet} tokens per spin.`;
  }

  function renderHeader() {
    dom.tokensValue.textContent = formatTokens(save.tokens);
    const model = getModel();
    dom.modelValue.textContent = model.label;
    dom.contextValue.textContent = model.context;
  }

  function renderButtons() {
    const canAfford = save.tokens >= save.bet;
    const inCooldown = Date.now() < cooldownUntil;
    dom.spinBtn.disabled = isSpinning || !canAfford || inCooldown;
    dom.autoBtn.disabled = isSpinning || !canAfford || inCooldown;
    dom.bragBtn.disabled = !lastOutcomeForBrag;
    dom.dailyBtn.disabled = isSpinning || !canClaimDailyBonus();
    dom.betInput.value = String(save.bet);
  }

  function renderPayouts() {
    dom.payouts.textContent = "";
    for (const s of SYMBOLS) {
      const row = document.createElement("div");
      row.className = "payoutRow";

      const emoji = document.createElement("div");
      emoji.className = "payoutEmoji";
      emoji.textContent = s.emoji;

      const name = document.createElement("div");
      name.className = "payoutName";
      name.textContent = s.label;

      const value = document.createElement("div");
      value.className = "payoutValue";
      value.textContent = s.id === "hallucination" ? "0× bet" : `${s.triplePayout}× bet`;

      row.append(emoji, name, value);
      dom.payouts.append(row);
    }
  }

  function renderHistory() {
    dom.history.textContent = "";
    if (!save.history.length) {
      const li = document.createElement("li");
      li.textContent = "No spins yet. The AI is waiting to burn tokens.";
      dom.history.append(li);
      return;
    }
    for (const item of save.history) {
      const li = document.createElement("li");
      li.textContent = item.line;
      dom.history.append(li);
    }
  }

  function setStatus(message, vibe) {
    dom.status.classList.remove("good", "bad", "warn");
    if (vibe) dom.status.classList.add(vibe);
    dom.status.textContent = message;
  }

  function nudgeMachine() {
    const el = dom.reels[0].closest(".machine");
    if (!el) return;
    el.classList.remove("shake");
    // eslint-disable-next-line no-unused-expressions
    el.offsetWidth;
    el.classList.add("shake");
  }

  async function copyBrag() {
    if (!lastOutcomeForBrag) return;
    const { outcome, result } = lastOutcomeForBrag;
    const reel = outcome.map((s) => s.emoji).join(" ");
    const model = getModel().label;
    const temp = save.temperature.toFixed(2);
    const text =
      `Token Burner 9000 🎰\n` +
      `${reel}\n` +
      `Bet: ${save.bet} | Payout: ${result.payout} | Tokens: ${save.tokens}\n` +
      `Model: ${model} | Temp: ${temp}\n` +
      `Status: ${result.message}`;

    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied. Paste it into Slack to earn social tokens.", "good");
      audio.click();
    } catch {
      setStatus("Clipboard blocked. The browser refuses to leak your prompt.", "warn");
    }
  }

  function resetSave() {
    stopAutoSpin();
    save = clone(DEFAULT_SAVE);
    persistNow();
    setStatus("Save reset. Fresh tokens, fresh delusions.", "warn");
    setInitialReels();
    renderAll();
  }

  function hydrateControlsFromSave() {
    dom.tempSlider.value = String(Math.round(save.temperature * 100));
    dom.betInput.value = String(save.bet);
    dom.tempValue.textContent = save.temperature.toFixed(2);
    dom.spinCostPill.textContent = `-${save.bet}`;
    dom.betHint.textContent = `Burns ${save.bet} tokens per spin.`;
  }

  function claimDailyBonus() {
    if (!canClaimDailyBonus()) return;
    const bonus = 45 + randomInt(0, 35);
    save.tokens += bonus;
    save.daily.lastClaimISO = new Date().toISOString();
    persistNow();
    setStatus(`Daily bonus claimed: +${bonus} tokens. Your runway is extended by 12 minutes.`, "good");
    audio.win();
    safeVibrate([20, 40, 20]);
    renderAll();
  }

  function tickDailyHint() {
    const { canClaim, msRemaining } = getDailyBonusState();
    dom.dailyHint.textContent = canClaim ? "Ready. Free tokens for today's hype cycle." : `Next in ${formatCountdown(msRemaining)}.`;
    dom.dailyBtn.disabled = isSpinning || !canClaim;
  }

  function getDailyBonusState() {
    const lastISO = save.daily?.lastClaimISO;
    if (!lastISO) return { canClaim: true, msRemaining: 0 };
    const last = Date.parse(lastISO);
    if (!Number.isFinite(last)) return { canClaim: true, msRemaining: 0 };
    const next = last + 24 * 60 * 60 * 1000;
    const now = Date.now();
    if (now >= next) return { canClaim: true, msRemaining: 0 };
    return { canClaim: false, msRemaining: next - now };
  }

  function canClaimDailyBonus() {
    return getDailyBonusState().canClaim;
  }

  function loadSave() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return clone(DEFAULT_SAVE);
      return sanitizeSave(JSON.parse(raw));
    } catch {
      return clone(DEFAULT_SAVE);
    }
  }

  function sanitizeSave(candidate) {
    const safe = clone(DEFAULT_SAVE);
    if (!candidate || typeof candidate !== "object") return safe;

    safe.tokens = clampInt(candidate.tokens, 0, 1_000_000);
    safe.temperature = clamp01(Number(candidate.temperature));
    safe.bet = clampInt(candidate.bet, 1, 9999);
    safe.lifetimeWon = clampInt(candidate.lifetimeWon, 0, 1_000_000_000);
    safe.lifetimeSpent = clampInt(candidate.lifetimeSpent, 0, 1_000_000_000);

    const modelId = String(candidate.modelId || "");
    safe.modelId = MODELS.some((m) => m.id === modelId) ? modelId : MODELS[0].id;

    const history = Array.isArray(candidate.history) ? candidate.history : [];
    safe.history = history
      .slice(0, 12)
      .map((h) => ({ atISO: String(h.atISO || ""), line: String(h.line || "") }))
      .filter((h) => h.line);

    safe.daily = { lastClaimISO: candidate.daily?.lastClaimISO ? String(candidate.daily.lastClaimISO) : null };
    return safe;
  }

  let persistTimer = null;
  function persistSoon() {
    if (persistTimer) return;
    persistTimer = window.setTimeout(() => {
      persistTimer = null;
      persistNow();
    }, 250);
  }

  function persistNow() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    } catch {
      // ignore quota errors
    }
  }

  function getModel() {
    return MODELS.find((m) => m.id === save.modelId) || MODELS[0];
  }

  function sampleOutcome(temperature) {
    return [sampleSymbol(temperature), sampleSymbol(temperature), sampleSymbol(temperature)];
  }

  function sampleSymbol(temperature) {
    const temp = clamp01(Number(temperature));
    const adjustedWeights = SYMBOLS.map((s) => {
      const chaosBoost = s.id === "hallucination" || s.id === "rate" || s.id === "oom" ? 1 + temp * 0.65 : 1;
      const boringBoost = s.id === "rag" || s.id === "prompt" || s.id === "gpu" ? 1 + (1 - temp) * 0.25 : 1;
      return Math.max(0.001, s.weight * chaosBoost * boringBoost);
    });
    return SYMBOLS[weightedIndex(adjustedWeights)];
  }

  function weightedIndex(weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return 0;
    const r = randomFloat() * total;
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i];
      if (r <= acc) return i;
    }
    return weights.length - 1;
  }

  function clamp01(n) {
    if (!Number.isFinite(n)) return 0;
    return Math.min(1, Math.max(0, n));
  }

  function clampInt(n, min, max) {
    if (!Number.isFinite(n)) return min;
    const v = Math.floor(n);
    return Math.min(max, Math.max(min, v));
  }

  function formatTokens(n) {
    return `${n.toLocaleString("en-US")} 🪙`;
  }

  function randomInt(min, maxExclusive) {
    const span = Math.max(0, maxExclusive - min);
    return min + Math.floor(randomFloat() * span);
  }

  function randomFloat() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 2 ** 32;
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function formatCountdown(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  }

  function safeVibrate(pattern) {
    try {
      if (typeof navigator.vibrate === "function") navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }

  function createAudio() {
    let ctx = null;
    let enabled = true;

    function ensure() {
      if (!enabled) return null;
      if (ctx) return ctx;
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        return ctx;
      } catch {
        enabled = false;
        return null;
      }
    }

    function blip(freq, durationMs, type = "sine", gain = 0.03) {
      const c = ensure();
      if (!c) return;
      const t0 = c.currentTime;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
      osc.connect(g);
      g.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + durationMs / 1000);
    }

    return {
      tick: () => blip(420, 65, "triangle", 0.02),
      click: () => blip(820, 40, "square", 0.015),
      win: () => {
        blip(660, 120, "sine", 0.03);
        window.setTimeout(() => blip(880, 160, "sine", 0.03), 85);
      },
      loss: () => blip(220, 120, "sawtooth", 0.02),
      warn: () => blip(330, 80, "square", 0.02)
    };
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch {
      // Service workers don't work on file:// and may fail on some hosts. It's fine.
    }
  }
})();

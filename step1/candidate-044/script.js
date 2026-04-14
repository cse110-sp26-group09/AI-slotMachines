(() => {
  "use strict";

  const SYMBOLS = [
    { icon: "🧠", name: "Reasoning", weight: 10 },
    { icon: "🪙", name: "Tokens", weight: 14 },
    { icon: "✨", name: "Shiny Demo", weight: 12 },
    { icon: "🧵", name: "Context Window", weight: 12 },
    { icon: "🐛", name: "Regression", weight: 10 },
    { icon: "🔥", name: "GPU Meltdown", weight: 8 },
    { icon: "🤖", name: "Hallucination", weight: 8 },
    { icon: "🕵️", name: "Data Harvest", weight: 6 },
    { icon: "🧾", name: "Enterprise Invoice", weight: 5 },
    { icon: "🦄", name: "Unicorn Feature", weight: 3 },
  ];

  const PAYTABLE = [
    {
      combo: ["🧠", "🧠", "🧠"],
      label: "3× Reasoning",
      payout: (spinCost) => spinCost * 10 + 25,
      flavor: "The model thinks. Briefly. Profitably.",
      confetti: 1,
    },
    {
      combo: ["🦄", "🦄", "🦄"],
      label: "3× Unicorn Feature",
      payout: (spinCost) => spinCost * 12 + 40,
      flavor: "Ship it! (It breaks prod in 7 minutes.)",
      confetti: 1,
    },
    {
      combo: ["🧾", "🧾", "🧾"],
      label: "3× Enterprise Invoice",
      payout: (spinCost) => spinCost * 8 + 30,
      flavor: "Congrats, you won a procurement process.",
      confetti: 1,
    },
    {
      combo: ["🪙", "🪙", "🪙"],
      label: "3× Tokens",
      payout: (spinCost) => spinCost * 6 + 18,
      flavor: "Infinite money glitch: just keep spinning.",
      confetti: 1,
    },
    {
      combo: ["✨", "✨", "✨"],
      label: "3× Shiny Demo",
      payout: (spinCost) => spinCost * 4 + 12,
      flavor: "Looks amazing on stage. In real life? buffering…",
      confetti: 0,
    },
    {
      combo: ["🐛", "🐛", "🐛"],
      label: "3× Regression",
      payout: (spinCost) => spinCost * 3 + 9,
      flavor: "You win, but QA files 14 tickets.",
      confetti: 0,
    },
    {
      combo: ["🔥", "🔥", "🔥"],
      label: "3× GPU Meltdown",
      payout: (spinCost) => -(spinCost * 2 + 6),
      flavor: "You smell toast. The cloud bill agrees.",
      confetti: 0,
      negative: 1,
    },
    {
      combo: ["🤖", "🤖", "🤖"],
      label: "3× Hallucination",
      payout: (spinCost) => -(spinCost * 3 + 9),
      flavor: "Confidently wrong. Financially painful.",
      confetti: 0,
      negative: 1,
    },
    {
      combo: ["🕵️", "🕵️", "🕵️"],
      label: "3× Data Harvest",
      payout: (spinCost) => spinCost * 2 + 7,
      flavor: "Your secrets were monetized. You get a cut!",
      confetti: 0,
    },
  ];

  const STORAGE_KEY = "token-tumbler:v1";

  const $ = (sel) => document.querySelector(sel);
  const reels = [$("#reel0"), $("#reel1"), $("#reel2")];
  const reelBoxes = [...document.querySelectorAll(".reel")];
  const tokensOut = $("#tokens");
  const spinCostOut = $("#spinCost");
  const jackpotOut = $("#jackpot");
  const statusLine = $("#statusLine");
  const spinsOut = $("#spins");
  const wonOut = $("#won");
  const spentOut = $("#spent");
  const logEl = $("#log");

  const spinBtn = $("#spinBtn");
  const maxBtn = $("#maxBtn");
  const autoBtn = $("#autoBtn");
  const cashoutBtn = $("#cashoutBtn");
  const bragBtn = $("#bragBtn");
  const notifyBtn = $("#notifyBtn");
  const resetBtn = $("#resetBtn");

  const soundToggle = $("#soundToggle");
  const hapticsToggle = $("#hapticsToggle");
  const reduceMotionToggle = $("#reduceMotionToggle");

  const confettiCanvas = $("#confetti");
  const confettiCtx = confettiCanvas.getContext("2d", { alpha: true });

  let state = {
    tokens: 25,
    spinCost: 3,
    jackpot: 80,
    spins: 0,
    won: 0,
    spent: 0,
    lastResult: ["?", "?", "?"],
    sound: true,
    haptics: true,
    reduceMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false,
    notify: false,
    lastCashoutAt: 0,
  };

  let spinning = false;
  let autoRemaining = 0;

  function nowMs() {
    return Date.now();
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function cryptoRandU32() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0];
  }

  function rand01() {
    return cryptoRandU32() / 2 ** 32;
  }

  function weightedPick(items) {
    const total = items.reduce((sum, it) => sum + it.weight, 0);
    let r = rand01() * total;
    for (const it of items) {
      r -= it.weight;
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  function formatSigned(n) {
    const sign = n >= 0 ? "+" : "−";
    return `${sign}${Math.abs(n)}`;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      state = { ...state, ...parsed };
    } catch {
      // ignore
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function log(msg, kind = "info") {
    const el = document.createElement("div");
    el.className = "logEntry";
    const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const prefix = kind === "win" ? "WIN" : kind === "loss" ? "LOSS" : "INFO";
    el.innerHTML = `<strong>[${ts}] ${prefix}</strong> — ${escapeHtml(msg)}`;
    logEl.prepend(el);
    while (logEl.children.length > 30) logEl.removeChild(logEl.lastChild);
  }

  function setStatus(text) {
    statusLine.textContent = text;
  }

  function renderPaytable() {
    const paytableEl = $("#paytable");
    paytableEl.textContent = "";
    for (const rule of PAYTABLE) {
      const row = document.createElement("div");
      row.className = "payRow";
      const combo = document.createElement("div");
      combo.className = "payCombo";
      combo.textContent = `${rule.combo.join(" ")}  ${rule.label}`;

      const payout = document.createElement("div");
      payout.className = "payPayout";
      const est = rule.payout(state.spinCost);
      payout.textContent = est >= 0 ? `+${est}` : `−${Math.abs(est)}`;

      row.append(combo, payout);
      paytableEl.append(row);
    }
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    confettiCanvas.width = Math.floor(window.innerWidth * dpr);
    confettiCanvas.height = Math.floor(window.innerHeight * dpr);
    confettiCanvas.style.width = `${window.innerWidth}px`;
    confettiCanvas.style.height = `${window.innerHeight}px`;
    confettiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const confetti = {
    pieces: [],
    running: false,
    lastT: 0,
  };

  function launchConfetti(intensity = 1) {
    if (state.reduceMotion) return;
    const count = Math.floor(120 * clamp(intensity, 0.5, 2));
    const colors = ["#7c5cff", "#36d399", "#ff4d6d", "#ffffff", "#ffd166"];
    for (let i = 0; i < count; i++) {
      confetti.pieces.push({
        x: window.innerWidth * (0.15 + 0.7 * rand01()),
        y: -10 - 80 * rand01(),
        vx: (rand01() - 0.5) * 220,
        vy: 180 + 420 * rand01(),
        r: 2 + 4 * rand01(),
        rot: rand01() * Math.PI * 2,
        vr: (rand01() - 0.5) * 8,
        color: colors[Math.floor(rand01() * colors.length)],
        life: 0.9 + 0.9 * rand01(),
      });
    }
    confetti.running = true;
    confetti.lastT = performance.now();
    requestAnimationFrame(tickConfetti);
  }

  function tickConfetti(t) {
    if (!confetti.running) return;
    const dt = Math.min(0.033, (t - confetti.lastT) / 1000);
    confetti.lastT = t;
    confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    const g = 520;
    confetti.pieces = confetti.pieces.filter((p) => (p.life -= dt) > 0);
    for (const p of confetti.pieces) {
      p.vy += g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;

      confettiCtx.save();
      confettiCtx.translate(p.x, p.y);
      confettiCtx.rotate(p.rot);
      confettiCtx.fillStyle = p.color;
      confettiCtx.fillRect(-p.r, -p.r, p.r * 2.4, p.r * 1.2);
      confettiCtx.restore();
    }

    if (confetti.pieces.length === 0) {
      confetti.running = false;
      confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      return;
    }
    requestAnimationFrame(tickConfetti);
  }

  let audioCtx = null;
  function ensureAudio() {
    if (!state.sound) return null;
    if (audioCtx) return audioCtx;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      return audioCtx;
    } catch {
      return null;
    }
  }

  function beep(type = "click") {
    const ctx = ensureAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const t0 = ctx.currentTime;
    const isWin = type === "win";
    const isLoss = type === "loss";

    osc.type = "sine";
    osc.frequency.setValueAtTime(isWin ? 740 : isLoss ? 160 : 420, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(isWin ? 0.12 : 0.09, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + (isWin ? 0.18 : 0.12));

    osc.start(t0);
    osc.stop(t0 + (isWin ? 0.22 : 0.15));
  }

  function haptic(pattern = 20) {
    if (!state.haptics) return;
    if (!("vibrate" in navigator)) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }

  function render() {
    tokensOut.textContent = `${state.tokens}`;
    spinCostOut.textContent = `${state.spinCost}`;
    jackpotOut.textContent = `${state.jackpot}`;
    spinsOut.textContent = `${state.spins}`;
    wonOut.textContent = `${state.won}`;
    spentOut.textContent = `${state.spent}`;

    soundToggle.checked = !!state.sound;
    hapticsToggle.checked = !!state.haptics;
    reduceMotionToggle.checked = !!state.reduceMotion;

    const canSpin = !spinning && state.tokens >= state.spinCost;
    spinBtn.disabled = !canSpin;
    maxBtn.disabled = spinning || state.tokens < state.spinCost;
    autoBtn.disabled = spinning || state.tokens < state.spinCost;
    cashoutBtn.disabled = spinning;
  }

  function setReels(symbols) {
    for (let i = 0; i < 3; i++) reels[i].textContent = symbols[i];
    state.lastResult = [...symbols];
  }

  function computePayout(symbols, spinCost) {
    for (const rule of PAYTABLE) {
      if (symbols[0] === rule.combo[0] && symbols[1] === rule.combo[1] && symbols[2] === rule.combo[2]) {
        return { amount: rule.payout(spinCost), rule };
      }
    }

    const uniq = new Set(symbols).size;
    if (uniq === 1) return { amount: spinCost * 2 + 6, rule: null };
    if (uniq === 2) return { amount: spinCost + 2, rule: null };
    return { amount: 0, rule: null };
  }

  function pickOutcome(maxMode) {
    const localSymbols = SYMBOLS.map((s) => ({ ...s }));
    if (maxMode) {
      for (const s of localSymbols) {
        if (s.icon === "🧠" || s.icon === "🪙" || s.icon === "🧾" || s.icon === "🦄") s.weight *= 1.18;
        if (s.icon === "🤖" || s.icon === "🔥") s.weight *= 0.85;
      }
    }
    return [weightedPick(localSymbols).icon, weightedPick(localSymbols).icon, weightedPick(localSymbols).icon];
  }

  async function spin({ maxMode = false } = {}) {
    if (spinning) return;
    if (state.tokens < state.spinCost) {
      setStatus("Out of tokens. Maybe try selling 'AI strategy' slides?");
      haptic([30, 40, 30]);
      beep("loss");
      return;
    }

    spinning = true;
    const spinCost = maxMode ? state.spinCost * 2 : state.spinCost;
    if (state.tokens < spinCost) {
      spinning = false;
      setStatus(`Not enough tokens for Max Spin (need ${spinCost}).`);
      render();
      return;
    }

    state.tokens -= spinCost;
    state.spent += spinCost;
    state.spins += 1;
    save();
    renderPaytable();
    render();

    reelBoxes.forEach((r) => r.classList.add("spinning"));
    reelBoxes.forEach((r) => r.classList.remove("winGlow", "loseGlow"));

    const duration = state.reduceMotion ? 250 : 1100;
    const start = performance.now();
    const end = start + duration;
    const target = pickOutcome(maxMode);
    const scratch = ["?", "?", "?"];

    setStatus(maxMode ? "Max Spin: burning extra tokens to increase 'quality'…" : "Spinning… generating vibes at scale…");
    beep("click");
    haptic(18);

    await new Promise((resolve) => {
      const tick = (t) => {
        if (t < end) {
          for (let i = 0; i < 3; i++) scratch[i] = weightedPick(SYMBOLS).icon;
          setReels(scratch);
          requestAnimationFrame(tick);
          return;
        }
        setReels(target);
        resolve();
      };
      requestAnimationFrame(tick);
    });

    reelBoxes.forEach((r) => r.classList.remove("spinning"));

    const { amount, rule } = computePayout(target, spinCost);
    let msg = "";

    if (target[0] === "🧠" && target[1] === "🧠" && target[2] === "🧠") {
      msg = `JACKPOT-ish! ${rule?.flavor ?? "Your brain wins."} ${formatSigned(amount)} tokens.`;
    } else if (amount > 0) {
      msg = `${rule?.flavor ?? "Nice."} ${formatSigned(amount)} tokens.`;
    } else if (amount === 0) {
      msg = "No payout. The model is 'still warming up' (forever).";
    } else {
      msg = `${rule?.flavor ?? "Ouch."} ${formatSigned(amount)} tokens.`;
    }

    state.jackpot += Math.max(1, Math.floor(spinCost / 2));
    let jackpotHit = false;
    if (amount > 0 && rand01() < 0.03) {
      jackpotHit = true;
      const bonus = Math.min(state.jackpot, 250 + Math.floor(rand01() * 250));
      state.jackpot = Math.max(40, state.jackpot - bonus);
      state.tokens += bonus;
      state.won += bonus;
      msg = `Bonus jackpot drop: +${bonus} tokens. Your GPU accountant is furious.`;
    }

    if (!jackpotHit) {
      state.tokens += amount;
      if (amount > 0) state.won += amount;
    }

    state.tokens = Math.max(0, Math.floor(state.tokens));
    save();
    render();

    const kind = amount > 0 || jackpotHit ? "win" : amount < 0 ? "loss" : "info";
    log(`${target.join(" ")} — ${msg}`, kind);
    setStatus(msg);

    if (kind === "win") {
      reelBoxes.forEach((r) => r.classList.add("winGlow"));
      beep("win");
      haptic([20, 35, 20]);
      if (rule?.confetti) launchConfetti(1.15);
      maybeNotify("Win detected", msg);
    } else if (kind === "loss") {
      reelBoxes.forEach((r) => r.classList.add("loseGlow"));
      beep("loss");
      haptic([40, 50, 40]);
      maybeNotify("Loss detected", msg);
    }

    spinning = false;
    render();

    if (autoRemaining > 0) {
      autoRemaining -= 1;
      if (state.tokens >= state.spinCost) {
        setTimeout(() => spin({ maxMode }), state.reduceMotion ? 120 : 220);
      } else {
        autoRemaining = 0;
        setStatus("Auto-spin stopped: you ran out of tokens. The AI ate them.");
      }
    }
  }

  async function brag() {
    const combo = state.lastResult.join(" ");
    const text = `I just spun ${combo} in Token Tumbler and now have ${state.tokens} tokens. The AI is (allegedly) impressed.`;
    try {
      if (navigator.share) {
        await navigator.share({ text, title: "Token Tumbler", url: location.href });
        log("Shared your brag via Web Share. Respectable.", "info");
        return;
      }
    } catch {
      // fall back to clipboard
    }

    try {
      await navigator.clipboard.writeText(text);
      log("Copied a brag to clipboard. Paste it somewhere dangerous.", "info");
      setStatus("Brag copied to clipboard.");
    } catch {
      log("Couldn’t share or copy. Your browser chose privacy today.", "info");
      setStatus("Couldn’t share/copy (browser said no).");
    }
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setStatus("Notifications not supported in this browser.");
      return;
    }
    if (Notification.permission === "granted") {
      state.notify = true;
      save();
      setStatus("Snarky notifications enabled. You asked for this.");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("Notifications are blocked. The browser is protecting you from me.");
      return;
    }
    const perm = await Notification.requestPermission();
    state.notify = perm === "granted";
    save();
    setStatus(state.notify ? "Snarky notifications enabled." : "Notifications not enabled.");
  }

  function maybeNotify(title, body) {
    if (!state.notify) return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    try {
      new Notification(title, { body });
    } catch {
      // ignore
    }
  }

  function cashOut() {
    const cooldownMs = 6000;
    if (nowMs() - state.lastCashoutAt < cooldownMs) {
      setStatus("Cash out throttled. Finance is 'reviewing the request'.");
      return;
    }
    state.lastCashoutAt = nowMs();

    const fee = Math.max(1, Math.floor(state.tokens * 0.08));
    const received = Math.max(0, state.tokens - fee);
    const receipt = [
      "TOKEN TUMBLER — RECEIPT",
      `Balance: ${state.tokens} tokens`,
      `Processing fee (cloud vibes): ${fee}`,
      `Net (emotionally): ${received}`,
      "Line item: 'AI alignment surcharge' … pending",
    ].join("\n");

    state.tokens = received;
    save();
    render();

    log(`Cash out processed.\n${receipt.replaceAll("\n", " | ")}`, "info");
    setStatus(`Cashed out. Fee: ${fee}. Remaining: ${received}.`);
    haptic([15, 25, 15]);
    beep("click");

    navigator.clipboard?.writeText?.(receipt).then(
      () => log("Receipt copied to clipboard.", "info"),
      () => log("Receipt not copied (clipboard denied).", "info"),
    );
  }

  function resetSave() {
    const ok = confirm("Reset your save? This deletes your precious tokens forever.");
    if (!ok) return;
    localStorage.removeItem(STORAGE_KEY);
    state.tokens = 25;
    state.spinCost = 3;
    state.jackpot = 80;
    state.spins = 0;
    state.won = 0;
    state.spent = 0;
    state.lastResult = ["?", "?", "?"];
    state.notify = false;
    save();
    renderPaytable();
    setReels(state.lastResult);
    render();
    log("Save reset. Fresh tokens, fresh delusions.", "info");
    setStatus("Save reset. The AI forgot everything (again).");
  }

  function initHotkeys() {
    window.addEventListener("keydown", (e) => {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      if (e.code === "Space") {
        e.preventDefault();
        spin({ maxMode: false });
      } else if (e.key.toLowerCase() === "m") {
        spin({ maxMode: true });
      } else if (e.key.toLowerCase() === "a") {
        if (spinning) return;
        autoRemaining = 5;
        spin({ maxMode: false });
      }
    });
  }

  function initToggles() {
    soundToggle.addEventListener("change", () => {
      state.sound = !!soundToggle.checked;
      save();
      render();
      if (state.sound) {
        setStatus("Sound on. Your ears consented under duress.");
        beep("click");
      } else {
        setStatus("Sound off. Silence is the new alignment.");
      }
    });
    hapticsToggle.addEventListener("change", () => {
      state.haptics = !!hapticsToggle.checked;
      save();
      render();
      setStatus(state.haptics ? "Haptics on. The device will judge you physically." : "Haptics off.");
      if (state.haptics) haptic(25);
    });
    reduceMotionToggle.addEventListener("change", () => {
      state.reduceMotion = !!reduceMotionToggle.checked;
      save();
      render();
      setStatus(state.reduceMotion ? "Reduce motion enabled." : "Reduce motion disabled.");
    });
  }

  function initButtons() {
    spinBtn.addEventListener("click", () => spin({ maxMode: false }));
    maxBtn.addEventListener("click", () => spin({ maxMode: true }));
    autoBtn.addEventListener("click", () => {
      if (spinning) return;
      autoRemaining = 5;
      spin({ maxMode: false });
    });
    cashoutBtn.addEventListener("click", cashOut);
    bragBtn.addEventListener("click", brag);
    notifyBtn.addEventListener("click", enableNotifications);
    resetBtn.addEventListener("click", resetSave);
  }

  function init() {
    load();
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas, { passive: true });
    renderPaytable();
    setReels(state.lastResult);
    render();
    initButtons();
    initToggles();
    initHotkeys();
    log("Booted. Tokens loaded from localStorage (or invented if missing).", "info");
  }

  init();
})();

(() => {
  "use strict";

  const STORAGE_KEY = "token-tumbler:v2";

  const ICON = {
    reasoning: "\u{1F9E0}",
    token: "\u{1FA99}",
    demo: "\u2728",
    context: "\u{1FA9F}",
    regression: "\u{1F41B}",
    gpu: "\u{1F525}",
    hallucination: "\u{1F916}",
    harvest: "\u{1F575}\uFE0F",
    invoice: "\u{1F9FE}",
    unicorn: "\u{1F984}",
  };

  const SYMBOLS = [
    { icon: ICON.reasoning, name: "Reasoning", weight: 10, kind: "good" },
    { icon: ICON.token, name: "Tokens", weight: 14, kind: "good" },
    { icon: ICON.demo, name: "Shiny Demo", weight: 12, kind: "good" },
    { icon: ICON.context, name: "Context Window", weight: 12, kind: "good" },
    { icon: ICON.regression, name: "Regression", weight: 10, kind: "neutral" },
    { icon: ICON.gpu, name: "GPU Meltdown", weight: 8, kind: "bad" },
    { icon: ICON.hallucination, name: "Hallucination", weight: 8, kind: "bad" },
    { icon: ICON.harvest, name: "Data Harvest", weight: 6, kind: "neutral" },
    { icon: ICON.invoice, name: "Enterprise Invoice", weight: 5, kind: "good" },
    { icon: ICON.unicorn, name: "Unicorn Feature", weight: 3, kind: "good" },
  ];

  const PAYTABLE = [
    {
      combo: [ICON.reasoning, ICON.reasoning, ICON.reasoning],
      label: "3x Reasoning",
      payout: (cost) => cost * 10 + 25,
      flavor: "The model thinks. Briefly. Profitably.",
      confetti: 1,
    },
    {
      combo: [ICON.unicorn, ICON.unicorn, ICON.unicorn],
      label: "3x Unicorn Feature",
      payout: (cost) => cost * 12 + 40,
      flavor: "Ship it! (It breaks prod in 7 minutes.)",
      confetti: 1,
    },
    {
      combo: [ICON.invoice, ICON.invoice, ICON.invoice],
      label: "3x Enterprise Invoice",
      payout: (cost) => cost * 8 + 30,
      flavor: "Congrats, you won a procurement process.",
      confetti: 1,
    },
    {
      combo: [ICON.token, ICON.token, ICON.token],
      label: "3x Tokens",
      payout: (cost) => cost * 6 + 18,
      flavor: "Infinite money glitch: just keep spinning.",
      confetti: 1,
    },
    {
      combo: [ICON.demo, ICON.demo, ICON.demo],
      label: "3x Shiny Demo",
      payout: (cost) => cost * 4 + 12,
      flavor: "Looks amazing on stage. In real life? buffering...",
      confetti: 0,
    },
    {
      combo: [ICON.regression, ICON.regression, ICON.regression],
      label: "3x Regression",
      payout: (cost) => cost * 3 + 9,
      flavor: "You win, but QA files 14 tickets.",
      confetti: 0,
    },
    {
      combo: [ICON.harvest, ICON.harvest, ICON.harvest],
      label: "3x Data Harvest",
      payout: (cost) => cost * 2 + 7,
      flavor: "Your secrets were monetized. You get a cut!",
      confetti: 0,
    },
    {
      combo: [ICON.gpu, ICON.gpu, ICON.gpu],
      label: "3x GPU Meltdown",
      payout: (cost) => -(cost * 2 + 6),
      flavor: "You smell toast. The cloud bill agrees.",
      confetti: 0,
      negative: 1,
    },
    {
      combo: [ICON.hallucination, ICON.hallucination, ICON.hallucination],
      label: "3x Hallucination",
      payout: (cost) => -(cost * 3 + 9),
      flavor: "Confidently wrong. Financially painful.",
      confetti: 0,
      negative: 1,
    },
  ];

  const SHOP_ITEMS = [
    {
      id: "luck10",
      title: "Context Patch (Luck x10 spins)",
      cost: 20,
      body: "Temporarily nudges the reels toward 'good' symbols. Absolutely not a placebo.",
      apply(s) {
        s.luckSpins = Math.max(s.luckSpins, 10);
      },
    },
    {
      id: "shield1",
      title: "Alignment Shield (1 spin)",
      cost: 15,
      body: "Cancels one negative payout. The model still apologizes though.",
      apply(s) {
        s.shieldSpins = Math.max(s.shieldSpins, 1);
      },
    },
    {
      id: "jackpotBoost",
      title: "Enterprise Support Ticket (+40 jackpot)",
      cost: 25,
      body: "Your ticket will be answered in 3-5 business quarters. Jackpot increases now.",
      apply(s) {
        s.jackpot += 40;
      },
    },
    {
      id: "coffee",
      title: "Buy the Model a Coffee (consumes tokens)",
      cost: 10,
      body: "No gameplay advantage. Just vibes and a faint smell of burnt silicon.",
      apply() {
        // no-op
      },
    },
  ];

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
  const leverBtn = $("#leverBtn");
  const bragBtn = $("#bragBtn");
  const grantBtn = $("#grantBtn");
  const installBtn = $("#installBtn");
  const notifyBtn = $("#notifyBtn");
  const resetBtn = $("#resetBtn");

  const soundToggle = $("#soundToggle");
  const hapticsToggle = $("#hapticsToggle");
  const reduceMotionToggle = $("#reduceMotionToggle");

  const shopEl = $("#shop");

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
    lastGrantDay: "",
    luckSpins: 0,
    shieldSpins: 0,
  };

  let spinning = false;
  let autoRemaining = 0;

  let audioCtx = null;
  let confetti = [];
  let confettiRaf = 0;
  let deferredInstallPrompt = null;
  let leverIgnoreClickUntil = 0;

  function nowMs() {
    return Date.now();
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function ignoreLeverClickFor(ms) {
    leverIgnoreClickUntil = nowMs() + ms;
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
    const sign = n >= 0 ? "+" : "-";
    return `${sign}${Math.abs(n)}`;
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
      state = { ...state, ...parsed };
    } catch {
      // ignore
    }
  }

  function setReels(result) {
    for (let i = 0; i < reels.length; i += 1) {
      reels[i].textContent = result[i] ?? "?";
    }
  }

  function setStatus(msg) {
    statusLine.textContent = msg;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function log(msg, level = "info") {
    const row = document.createElement("div");
    row.className = "logEntry";
    const label =
      level === "win" ? "<strong>WIN</strong>" : level === "loss" ? "<strong>LOSS</strong>" : "<strong>LOG</strong>";
    row.innerHTML = `${label} - ${escapeHtml(msg)}`;
    logEl.prepend(row);
    while (logEl.childElementCount > 30) logEl.removeChild(logEl.lastElementChild);
  }

  function haptic(pattern) {
    if (!state.haptics) return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // ignore
    }
  }

  function ensureAudio() {
    if (!state.sound) return null;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume?.();
    return audioCtx;
  }

  function beep(kind) {
    const ctx = ensureAudio();
    if (!ctx) return;

    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const preset =
      kind === "win"
        ? { f0: 660, f1: 880, dur: 0.12, vol: 0.08, type: "triangle" }
        : kind === "loss"
          ? { f0: 160, f1: 90, dur: 0.16, vol: 0.08, type: "sawtooth" }
          : { f0: 420, f1: 520, dur: 0.08, vol: 0.05, type: "square" };

    osc.type = preset.type;
    osc.frequency.setValueAtTime(preset.f0, t0);
    osc.frequency.exponentialRampToValueAtTime(preset.f1, t0 + preset.dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(preset.vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + preset.dur);
    osc.start(t0);
    osc.stop(t0 + preset.dur + 0.02);
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    confettiCanvas.width = Math.floor(window.innerWidth * dpr);
    confettiCanvas.height = Math.floor(window.innerHeight * dpr);
    confettiCanvas.style.width = `${window.innerWidth}px`;
    confettiCanvas.style.height = `${window.innerHeight}px`;
    confettiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function confettiBurst(intensity = 1) {
    if (state.reduceMotion) return;
    const count = Math.floor(80 * clamp(intensity, 0.5, 2));
    const w = window.innerWidth;
    const colors = ["#7c5cff", "#36d399", "#ff4d6d", "#ffffff"];
    for (let i = 0; i < count; i += 1) {
      confetti.push({
        x: w * (0.2 + rand01() * 0.6),
        y: -10,
        vx: (rand01() - 0.5) * 220,
        vy: 120 + rand01() * 260,
        r: 2 + rand01() * 4,
        rot: rand01() * Math.PI,
        vr: (rand01() - 0.5) * 8,
        color: colors[Math.floor(rand01() * colors.length)],
        life: 1400 + rand01() * 700,
        born: nowMs(),
      });
    }
    if (!confettiRaf) confettiRaf = requestAnimationFrame(tickConfetti);
  }

  function tickConfetti() {
    const t = nowMs();
    confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    confetti = confetti.filter((p) => t - p.born < p.life);
    for (const p of confetti) {
      const age = (t - p.born) / 1000;
      const g = 620;
      const x = p.x + p.vx * age;
      const y = p.y + p.vy * age + 0.5 * g * age * age;

      p.rot += p.vr * 0.016;
      confettiCtx.save();
      confettiCtx.translate(x, y);
      confettiCtx.rotate(p.rot);
      confettiCtx.fillStyle = p.color;
      confettiCtx.globalAlpha = clamp(1 - (t - p.born) / p.life, 0, 1);
      confettiCtx.fillRect(-p.r, -p.r, p.r * 2.1, p.r * 1.2);
      confettiCtx.restore();
    }

    if (confetti.length) {
      confettiRaf = requestAnimationFrame(tickConfetti);
    } else {
      confettiRaf = 0;
      confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }

  function computeSpinCost({ maxMode }) {
    const base = clamp(Math.floor(state.spinCost), 1, 99);
    return maxMode ? base * 4 : base;
  }

  function maybeNotify(title, body) {
    if (!state.notify) return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    try {
      new Notification(title, { body, icon: "./icon.svg", tag: "token-tumbler" });
    } catch {
      // ignore
    }
  }

  function pickSymbol() {
    if (state.luckSpins > 0) {
      const lucky = SYMBOLS.map((s) => {
        const boost = s.kind === "good" ? 1.35 : s.kind === "bad" ? 0.82 : 1.0;
        return { ...s, weight: s.weight * boost };
      });
      return weightedPick(lucky);
    }
    return weightedPick(SYMBOLS);
  }

  function payoutFor(result, cost) {
    const row = PAYTABLE.find((r) => r.combo.every((s, i) => result[i] === s));
    if (row) return { delta: row.payout(cost), row };

    const [a, b, c] = result;
    if (a === b || b === c || a === c) {
      return {
        delta: Math.floor(cost * 1.5),
        row: { confetti: 0, flavor: "Two of a kind. The model calls this 'good enough'." },
      };
    }
    return { delta: -cost, row: { confetti: 0, flavor: "No match. The model blames your prompt." } };
  }

  function setMachineGlow(kind) {
    const machine = document.querySelector(".machine");
    machine.classList.remove("winGlow", "loseGlow");
    if (kind === "win") machine.classList.add("winGlow");
    if (kind === "loss") machine.classList.add("loseGlow");
    window.setTimeout(() => machine.classList.remove("winGlow", "loseGlow"), 650);
  }

  function sleep(ms) {
    return new Promise((r) => window.setTimeout(r, ms));
  }

  function unlockControls() {
    spinBtn.disabled = false;
    maxBtn.disabled = false;
    autoBtn.disabled = false;
  }

  function continueAuto() {
    if (autoRemaining <= 0) return;
    autoRemaining -= 1;
    if (autoRemaining <= 0) return;
    window.setTimeout(() => spin({ maxMode: false }), state.reduceMotion ? 120 : 240);
  }

  async function spin({ maxMode }) {
    if (spinning) return;

    const cost = computeSpinCost({ maxMode });
    if (state.tokens < cost) {
      setStatus("Insufficient tokens. Please contact your VC or claim the daily grant.");
      log(`Spin denied: need ${cost}, have ${state.tokens}.`, "loss");
      beep("loss");
      haptic([25, 50, 25]);
      return;
    }

    spinning = true;
    spinBtn.disabled = true;
    maxBtn.disabled = true;
    autoBtn.disabled = true;

    state.tokens -= cost;
    state.spent += cost;
    state.spins += 1;
    state.jackpot += 1 + (maxMode ? 2 : 0);

    const spinDelay = state.reduceMotion ? 120 : 850;
    reelBoxes.forEach((r) => r.classList.add("spinning"));
    setStatus(maxMode ? "MAX SPIN: paying extra to feel something." : "Spinning...");
    beep("click");
    haptic(20);
    render();

    await sleep(spinDelay);

    const result = [pickSymbol().icon, pickSymbol().icon, pickSymbol().icon];
    state.lastResult = result;
    setReels(result);
    reelBoxes.forEach((r) => r.classList.remove("spinning"));

    const { delta, row } = payoutFor(result, cost);
    let finalDelta = delta;

    if (finalDelta < 0 && state.shieldSpins > 0) {
      state.shieldSpins -= 1;
      finalDelta = 0;
      log("Alignment Shield absorbed a negative payout. It was promptly laid off.", "win");
      setStatus("Shield triggered: the bad outcome was 're-scoped' into nothing.");
    }

    if (state.luckSpins > 0) state.luckSpins -= 1;

    const jackpotChance = maxMode ? 0.012 : 0.006;
    if (rand01() < jackpotChance) {
      const j = Math.max(10, Math.floor(state.jackpot));
      state.jackpot = 60;
      state.tokens += j;
      state.won += j;
      render();
      setMachineGlow("win");
      confettiBurst(1.6);
      beep("win");
      haptic([15, 30, 15, 50, 20]);
      const msg = `JACKPOT: +${j} tokens. The model claims it was intentional.`;
      log(msg, "win");
      setStatus(msg);
      maybeNotify("Jackpot", msg);
      spinning = false;
      unlockControls();
      continueAuto();
      return;
    }

    const normalizedDelta = finalDelta === -cost ? 0 : finalDelta;
    if (normalizedDelta > 0) {
      state.tokens += normalizedDelta;
      state.won += normalizedDelta;
      setMachineGlow("win");
      if (row?.confetti) confettiBurst(1.0);
      beep("win");
      haptic([15, 25, 15]);
      const msg = `+${normalizedDelta} tokens. ${row?.flavor ?? "The model approves."}`;
      log(msg, "win");
      setStatus(msg);
      maybeNotify("Win", msg);
    } else if (normalizedDelta < 0) {
      state.tokens += normalizedDelta;
      setMachineGlow("loss");
      beep("loss");
      haptic([35, 45, 35]);
      const msg = `${formatSigned(normalizedDelta)} tokens. ${row?.flavor ?? "Oops."}`;
      log(msg, "loss");
      setStatus(msg);
      maybeNotify("Loss", msg);
    } else {
      setMachineGlow("loss");
      beep("loss");
      haptic(30);
      const msg = `-${cost} tokens. ${row?.flavor ?? "No match."}`;
      log(msg, "loss");
      setStatus(msg);
      maybeNotify("Loss", msg);
    }

    state.tokens = Math.max(0, Math.floor(state.tokens));
    save();
    render();

    spinning = false;
    unlockControls();
    continueAuto();
  }

  function renderPaytable() {
    const payEl = $("#paytable");
    payEl.textContent = "";
    for (const row of PAYTABLE) {
      const div = document.createElement("div");
      div.className = "payRow";

      const left = document.createElement("div");
      left.className = "payCombo";
      left.textContent = `${row.combo.join(" ")}  ${row.label}`;

      const right = document.createElement("div");
      right.className = "payPayout";
      right.textContent = row.negative ? "???" : "varies";

      div.append(left, right);
      div.title = row.flavor;
      payEl.append(div);
    }
  }

  function renderShop() {
    if (!shopEl) return;
    shopEl.textContent = "";
    for (const item of SHOP_ITEMS) {
      const row = document.createElement("div");
      row.className = "shopRow";

      const left = document.createElement("div");
      left.className = "shopLeft";

      const title = document.createElement("div");
      title.className = "shopTitle";
      title.textContent = item.title;

      const body = document.createElement("div");
      body.className = "shopBody";
      body.textContent = item.body;

      left.append(title, body);

      const right = document.createElement("div");
      right.className = "shopRight";

      const cost = document.createElement("div");
      cost.className = "shopCost";
      cost.textContent = `${item.cost} tokens`;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Buy";
      btn.disabled = state.tokens < item.cost || spinning;
      btn.addEventListener("click", () => buy(item.id));

      right.append(cost, btn);
      row.append(left, right);
      shopEl.append(row);
    }
  }

  function buy(itemId) {
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item) return;
    if (spinning) return;

    if (state.tokens < item.cost) {
      setStatus("Declined. Your wallet model returned 402: Payment Required.");
      beep("loss");
      haptic([20, 50, 20]);
      return;
    }

    state.tokens -= item.cost;
    state.spent += item.cost;
    item.apply(state);
    save();
    render();

    const msg = `Purchased: ${item.title} (-${item.cost} tokens).`;
    log(msg, "info");
    setStatus(msg);
    beep("click");
    haptic(15);
  }

  async function brag() {
    const msg = `I have ${state.tokens} tokens in Token Tumbler. My ROI is mostly emotional damage.`;
    const payload = { title: "Token Tumbler", text: msg };

    try {
      if (navigator.share) {
        await navigator.share(payload);
        log("Shared successfully. The timeline will judge you.", "info");
        setStatus("Shared. Your reputation is now cached in the cloud.");
        return;
      }
    } catch {
      // ignore (user cancel is common)
    }

    try {
      await navigator.clipboard?.writeText?.(msg);
      log("Copied brag text to clipboard.", "info");
      setStatus("Copied to clipboard. Paste responsibly.");
    } catch {
      log("Share/clipboard not available. Please brag manually.", "info");
      setStatus("Couldn't share automatically. Please brag manually.");
    }
  }

  function claimDailyGrant() {
    const today = todayKey();
    if (state.lastGrantDay === today) {
      setStatus("Daily grant already claimed. Try again tomorrow and pretend this is 'sustainable'.");
      log("Grant denied: daily limit reached.", "loss");
      beep("loss");
      haptic([25, 40, 25]);
      return;
    }

    const base = 18;
    const auditFee = rand01() < 0.12 ? Math.max(1, Math.floor(base * 0.33)) : 0;
    const net = base - auditFee;

    state.lastGrantDay = today;
    state.tokens += net;
    state.tokens = Math.max(0, Math.floor(state.tokens));
    save();
    render();

    const msg =
      auditFee > 0
        ? `Grant approved: +${base}. Surprise "AI tax": -${auditFee}. Net: +${net}.`
        : `Grant approved: +${net} tokens. Please don't call it UBI.`;

    log(msg, "info");
    setStatus(msg);
    beep("win");
    haptic([15, 20, 15]);
    maybeNotify("Grant approved", msg);
  }

  function enableNotifications() {
    if (!("Notification" in window)) {
      setStatus("Notifications unavailable in this browser.");
      log("Notifications not supported.", "info");
      return;
    }

    Notification.requestPermission().then((perm) => {
      state.notify = perm === "granted";
      save();
      render();
      const msg =
        perm === "granted"
          ? "Notifications enabled. The app will now heckle you outside the tab."
          : "Notifications denied. The app will heckle you inside the tab like a professional.";
      setStatus(msg);
      log(msg, "info");
      if (state.notify) maybeNotify("Token Tumbler", "Notifications enabled. Prepare for snark.");
    });
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
      "TOKEN TUMBLER - RECEIPT",
      `Balance: ${state.tokens} tokens`,
      `Processing fee (cloud vibes): ${fee}`,
      `Net (emotionally): ${received}`,
      "Line item: 'AI alignment surcharge' ... pending",
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
    state = {
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
      lastGrantDay: "",
      luckSpins: 0,
      shieldSpins: 0,
    };
    save();
    renderPaytable();
    setReels(state.lastResult);
    render();
    log("Save reset. Fresh tokens, fresh delusions.", "info");
    setStatus("Save reset. The AI forgot everything (again).");
  }

  function render() {
    tokensOut.textContent = `${state.tokens}`;
    spinCostOut.textContent = `${state.spinCost}`;
    jackpotOut.textContent = `${Math.floor(state.jackpot)}`;
    spinsOut.textContent = `${state.spins}`;
    wonOut.textContent = `${state.won}`;
    spentOut.textContent = `${state.spent}`;

    soundToggle.checked = !!state.sound;
    hapticsToggle.checked = !!state.haptics;
    reduceMotionToggle.checked = !!state.reduceMotion;

    renderShop();

    const cost = computeSpinCost({ maxMode: false });
    spinBtn.disabled = spinning || state.tokens < cost;
    maxBtn.disabled = spinning || state.tokens < computeSpinCost({ maxMode: true });
    autoBtn.disabled = spinning || state.tokens < cost;
  }

  function initHotkeys() {
    window.addEventListener("keydown", (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
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
    grantBtn?.addEventListener("click", claimDailyGrant);
    notifyBtn.addEventListener("click", enableNotifications);
    resetBtn.addEventListener("click", resetSave);
  }

  function initLever() {
    if (!leverBtn) return;

    const thresholdPx = 36;
    const maxPullPx = 56;
    let activePointerId = null;
    let startY = 0;
    let triggered = false;

    function resetLever() {
      activePointerId = null;
      triggered = false;
      leverBtn.classList.remove("pulling");
      leverBtn.style.setProperty("--pull", "0px");
    }

    leverBtn.addEventListener("click", (e) => {
      if (nowMs() < leverIgnoreClickUntil) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      spin({ maxMode: false });
    });

    leverBtn.addEventListener("pointerdown", (e) => {
      if (spinning) return;
      if (typeof e.button === "number" && e.button !== 0) return;

      activePointerId = e.pointerId;
      startY = e.clientY;
      triggered = false;
      leverBtn.classList.add("pulling");
      leverBtn.style.setProperty("--pull", "0px");
      try {
        leverBtn.setPointerCapture(activePointerId);
      } catch {
        // ignore
      }
    });

    leverBtn.addEventListener("pointermove", (e) => {
      if (activePointerId === null) return;
      if (e.pointerId !== activePointerId) return;

      const dy = clamp(e.clientY - startY, 0, maxPullPx);
      leverBtn.style.setProperty("--pull", `${dy}px`);

      if (!triggered && dy >= thresholdPx) {
        triggered = true;
        ignoreLeverClickFor(400);
        spin({ maxMode: false });
      }
    });

    function end(e) {
      if (activePointerId === null) return;
      if (e && typeof e.pointerId === "number" && e.pointerId !== activePointerId) return;
      resetLever();
    }

    leverBtn.addEventListener("pointerup", end);
    leverBtn.addEventListener("pointercancel", end);
    leverBtn.addEventListener("lostpointercapture", () => resetLever());
  }

  function initInstall() {
    if (!installBtn) return;

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      installBtn.hidden = false;
      log("Install available. Yes, you can turn this into an app and pretend it's productivity.", "info");
    });

    window.addEventListener("appinstalled", () => {
      installBtn.hidden = true;
      deferredInstallPrompt = null;
      log("App installed. Congratulations: you packaged sarcasm.", "win");
      setStatus("Installed. The AI now lives on your home screen.");
    });

    installBtn.addEventListener("click", async () => {
      if (!deferredInstallPrompt) {
        setStatus("Install isn't available right now. Try serving over http://localhost or HTTPS.");
        return;
      }

      try {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice?.outcome === "accepted") {
          log("Install accepted. The machine is now a lifestyle.", "win");
        } else {
          log("Install dismissed. Commitment issues detected.", "info");
        }
      } catch {
        log("Install failed. The browser said: 'maybe later'.", "loss");
      } finally {
        deferredInstallPrompt = null;
        installBtn.hidden = true;
      }
    });
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
    initLever();
    initInstall();
    log("Booted. Tokens loaded from localStorage (or invented if missing).", "info");

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").then(
        () => log("Offline cache armed (service worker registered).", "info"),
        () => log("Service worker not registered. Offline mode unavailable.", "info"),
      );
    }
  }

  init();
})();

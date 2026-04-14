(() => {
  "use strict";

  const STORAGE_KEY = "tokenbandit3000:v1";
  const PRIVACY_COOLDOWN_MS = 10 * 60 * 1000;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const formatInt = (n) => Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);

  const randomU32 = () => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0];
  };

  const randomFloat01 = () => randomU32() / 4294967296;

  const loadState = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const saveState = (state) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  };

  const SYMBOLS = [
    {
      key: "🪙",
      label: "Token Printer",
      weight: 28,
      two: 6,
      three: 40,
      blurb: "The only model that always scales: money.",
    },
    {
      key: "🤖",
      label: "Hallucination Engine",
      weight: 26,
      two: 4,
      three: 30,
      blurb: "Confidently wrong, but in 4K.",
    },
    {
      key: "🧠",
      label: "Prompt Wizard",
      weight: 22,
      two: 3,
      three: 22,
      blurb: "You said “be concise”. The model said “no”.",
    },
    {
      key: "✅",
      label: "Ground Truth",
      weight: 14,
      two: 5,
      three: 28,
      blurb: "Rare. Beautiful. Expensive.",
    },
    {
      key: "📉",
      label: "Benchmark Slide",
      weight: 14,
      two: 2,
      three: 18,
      blurb: "We call it a “regression”. Investors call it “momentum”.",
    },
    {
      key: "🧾",
      label: "Compliance Form",
      weight: 10,
      two: 2,
      three: 16,
      blurb: "Please sign in triplicate to receive your winnings.",
    },
    {
      key: "💸",
      label: "VC Money",
      weight: 8,
      two: 8,
      three: 60,
      blurb: "Pre-revenue, post-reality.",
    },
    {
      key: "🔥",
      label: "GPU on Fire",
      weight: 6,
      two: 10,
      three: 80,
      blurb: "It’s not overheating; it’s “high utilization”.",
    },
    {
      key: "🐛",
      label: "Shipping Bug",
      weight: 4,
      two: 12,
      three: 120,
      blurb: "Congrats, you found prod.",
    },
  ];

  const findSymbol = (key) => SYMBOLS.find((s) => s.key === key) ?? SYMBOLS[0];

  const el = {
    tokensValue: document.getElementById("tokensValue"),
    spinCostValue: document.getElementById("spinCostValue"),
    spinsValue: document.getElementById("spinsValue"),
    bestWinValue: document.getElementById("bestWinValue"),
    reelSymbol: [
      document.getElementById("reel0Symbol"),
      document.getElementById("reel1Symbol"),
      document.getElementById("reel2Symbol"),
    ],
    reelLabel: [
      document.getElementById("reel0Label"),
      document.getElementById("reel1Label"),
      document.getElementById("reel2Label"),
    ],
    reels: Array.from(document.querySelectorAll(".reel")),
    spinBtn: document.getElementById("spinBtn"),
    autoBtn: document.getElementById("autoBtn"),
    resetBtn: document.getElementById("resetBtn"),
    temperatureInput: document.getElementById("temperatureInput"),
    temperatureValue: document.getElementById("temperatureValue"),
    demoModeInput: document.getElementById("demoModeInput"),
    soundInput: document.getElementById("soundInput"),
    speechInput: document.getElementById("speechInput"),
    freeTokensBtn: document.getElementById("freeTokensBtn"),
    donateBtn: document.getElementById("donateBtn"),
    statusHeadline: document.getElementById("statusHeadline"),
    statusDetail: document.getElementById("statusDetail"),
    paytableGrid: document.getElementById("paytableGrid"),
  };

  const defaultState = () => ({
    tokens: 120,
    spins: 0,
    bestWin: 0,
    temperature: 1,
    demoMode: false,
    soundOn: true,
    speechOn: false,
    spinCost: 5,
    lastPrivacyClaimAt: 0,
  });

  const state = { ...defaultState(), ...(loadState() ?? {}) };
  state.tokens = Math.max(0, Number(state.tokens) || 0);
  state.spins = Math.max(0, Number(state.spins) || 0);
  state.bestWin = Math.max(0, Number(state.bestWin) || 0);
  state.temperature = clamp(Number(state.temperature) || 1, 0.25, 2);
  state.demoMode = Boolean(state.demoMode);
  state.soundOn = state.soundOn !== false;
  state.speechOn = Boolean(state.speechOn);
  state.spinCost = clamp(Number(state.spinCost) || 5, 1, 25);
  state.lastPrivacyClaimAt = Math.max(0, Number(state.lastPrivacyClaimAt) || 0);

  let audioCtx = null;
  const ensureAudio = () => {
    if (!state.soundOn) return null;
    if (audioCtx) return audioCtx;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      return audioCtx;
    } catch {
      return null;
    }
  };

  const beep = (freq, durationMs, type = "sine", gain = 0.03) => {
    const ctx = ensureAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g).connect(ctx.destination);
    const now = ctx.currentTime;
    osc.start(now);
    osc.stop(now + durationMs / 1000);
  };

  const say = (text) => {
    if (!state.speechOn) return;
    if (!("speechSynthesis" in window)) return;
    try {
      speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.05;
      utter.pitch = 1.0;
      utter.volume = 0.9;
      speechSynthesis.speak(utter);
    } catch {
      // ignore
    }
  };

  const vibrate = (pattern) => {
    if (!("vibrate" in navigator)) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  };

  const setStatus = (headline, detail) => {
    el.statusHeadline.textContent = headline;
    el.statusDetail.textContent = detail;
  };

  const computeAdjustedWeights = () => {
    const temp = clamp(state.temperature, 0.25, 2);
    const exponent = 1 / temp;
    return SYMBOLS.map((s) => ({ ...s, adjustedWeight: Math.pow(s.weight, exponent) }));
  };

  const pickSymbol = () => {
    const adjusted = computeAdjustedWeights();
    const total = adjusted.reduce((sum, s) => sum + s.adjustedWeight, 0);
    const r = randomFloat01() * total;
    let acc = 0;
    for (const s of adjusted) {
      acc += s.adjustedWeight;
      if (r <= acc) return { key: s.key, label: s.label, blurb: s.blurb };
    }
    const last = adjusted[adjusted.length - 1];
    return { key: last.key, label: last.label, blurb: last.blurb };
  };

  const spinCost = () => {
    const base = state.spinCost;
    return state.demoMode ? Math.max(1, Math.floor(base * 0.8)) : base;
  };

  const payoutFor = (keys) => {
    const [a, b, c] = keys;
    const mult = state.demoMode ? 1.35 : 1;

    if (a === b && b === c) {
      const sym = findSymbol(a);
      return { amount: Math.round(sym.three * mult), kind: "three", sym };
    }

    if (a === b || a === c) {
      const sym = findSymbol(a);
      return { amount: Math.round(sym.two * mult), kind: "two", sym };
    }
    if (b === c) {
      const sym = findSymbol(b);
      return { amount: Math.round(sym.two * mult), kind: "two", sym };
    }

    // Tiny “synergy” jokes
    const hasTruth = keys.includes("✅");
    const hasBench = keys.includes("📉");
    const hasMoney = keys.includes("💸");
    const hasForm = keys.includes("🧾");
    if (hasTruth && hasBench) return { amount: 2, kind: "synergy", sym: null, note: "Benchmark + Ground Truth" };
    if (hasMoney && hasForm) return { amount: 1, kind: "synergy", sym: null, note: "Funds released (after paperwork)" };

    return { amount: 0, kind: "none", sym: null };
  };

  const renderHUD = () => {
    el.tokensValue.textContent = formatInt(state.tokens);
    el.spinsValue.textContent = formatInt(state.spins);
    el.bestWinValue.textContent = `${formatInt(state.bestWin)} 🪙`;
    el.spinCostValue.textContent = `${formatInt(spinCost())} 🪙`;

    el.temperatureInput.value = String(state.temperature);
    el.temperatureValue.textContent = `${state.temperature.toFixed(2)}x`;
    el.demoModeInput.checked = state.demoMode;
    el.soundInput.checked = state.soundOn;
    el.speechInput.checked = state.speechOn;

    el.spinBtn.disabled = state.tokens < spinCost();
    el.autoBtn.disabled = state.tokens < spinCost();
  };

  const renderReels = (symbols) => {
    for (let i = 0; i < 3; i += 1) {
      const s = findSymbol(symbols[i]);
      el.reelSymbol[i].textContent = s.key;
      el.reelLabel[i].textContent = s.label;
    }
  };

  const renderPaytable = () => {
    el.paytableGrid.innerHTML = "";
    for (const s of SYMBOLS) {
      const row = document.createElement("div");
      row.className = "pay";
      const icon = document.createElement("div");
      icon.className = "pay__icon";
      icon.textContent = s.key;
      const label = document.createElement("div");
      label.className = "pay__label";
      label.textContent = `${s.label} — pair: +${s.two} / triple: +${s.three}`;
      const payout = document.createElement("div");
      payout.className = "pay__payout";
      payout.textContent = "🪙";
      row.append(icon, label, payout);
      el.paytableGrid.append(row);
    }
  };

  let isSpinning = false;
  let autoTimer = null;

  const setAuto = (enabled) => {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
    el.autoBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
    el.autoBtn.textContent = enabled ? "Auto: On" : "Auto";
    if (!enabled) return;
    autoTimer = setInterval(() => {
      if (isSpinning) return;
      if (state.tokens < spinCost()) {
        setAuto(false);
        setStatus("Rate limit reached.", "Out of tokens. Please acquire more compute.");
        beep(180, 120, "sine", 0.03);
        return;
      }
      doSpin();
    }, 900);
  };

  const spinAnimation = async () => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const duration = reduceMotion ? 220 : 820;
    const tickMs = reduceMotion ? 70 : 60;

    const chosen = [pickSymbol(), pickSymbol(), pickSymbol()];

    let tick = 0;
    const tickers = [null, null, null];

    const startReel = (i) => {
      el.reels[i].classList.add("is-spinning");
      tickers[i] = setInterval(() => {
        const s = pickSymbol();
        el.reelSymbol[i].textContent = s.key;
        el.reelLabel[i].textContent = s.label;
      }, tickMs);
    };

    const stopReel = (i) => {
      if (tickers[i]) clearInterval(tickers[i]);
      tickers[i] = null;
      el.reels[i].classList.remove("is-spinning");
      el.reelSymbol[i].textContent = chosen[i].key;
      el.reelLabel[i].textContent = chosen[i].label;
    };

    startReel(0);
    startReel(1);
    startReel(2);

    const t0 = performance.now();
    return await new Promise((resolve) => {
      const loop = () => {
        const now = performance.now();
        tick += 1;
        if (tick % 3 === 0) beep(660, 24, "square", 0.012);
        if (now - t0 > duration * 0.55 && tickers[0]) stopReel(0);
        if (now - t0 > duration * 0.78 && tickers[1]) stopReel(1);
        if (now - t0 > duration && tickers[2]) {
          stopReel(2);
          resolve([chosen[0].key, chosen[1].key, chosen[2].key]);
          return;
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
  };

  const doSpin = async () => {
    if (isSpinning) return;
    if (state.tokens < spinCost()) {
      setStatus("Rate limit reached.", "Out of tokens. Try the privacy button (shh).");
      beep(220, 120, "sine", 0.03);
      return;
    }

    isSpinning = true;
    const cost = spinCost();
    state.tokens -= cost;
    state.spins += 1;
    saveState(state);
    renderHUD();

    el.spinBtn.disabled = true;
    el.autoBtn.disabled = true;
    setStatus("Sampling tokens…", `Spent ${formatInt(cost)} 🪙 to ask the model for vibes.`);
    beep(420, 70, "sine", 0.02);

    const keys = await spinAnimation();

    const pay = payoutFor(keys);
    state.tokens += pay.amount;
    if (pay.amount > state.bestWin) state.bestWin = pay.amount;
    saveState(state);
    renderHUD();

    const showCombo = keys.join(" ");
    if (pay.amount <= 0) {
      setStatus("No match.", `Output: ${showCombo}. Try turning up temperature (or lowering standards).`);
      beep(200, 110, "triangle", 0.02);
      say("No match. Please try again after you buy more tokens.");
    } else if (pay.kind === "three") {
      setStatus(
        `TRIPLE! +${formatInt(pay.amount)} tokens.`,
        `${showCombo} — ${pay.sym.label}. ${pay.sym.blurb}`
      );
      beep(880, 110, "sawtooth", 0.03);
      beep(1320, 140, "sine", 0.03);
      vibrate([40, 40, 80]);
      say(`Triple match. You win ${pay.amount} tokens. Please do not retrain on this outcome.`);
    } else if (pay.kind === "two") {
      setStatus(`Pair! +${formatInt(pay.amount)} tokens.`, `${showCombo} — ${pay.sym.label}. ${pay.sym.blurb}`);
      beep(740, 80, "sine", 0.028);
      vibrate([30, 30, 30]);
      say(`Pair match. You win ${pay.amount} tokens.`);
    } else {
      setStatus(`Synergy bonus! +${formatInt(pay.amount)} tokens.`, `${showCombo} — ${pay.note}.`);
      beep(640, 70, "sine", 0.025);
      say(`Synergy bonus. You win ${pay.amount} tokens.`);
    }

    el.spinBtn.disabled = state.tokens < spinCost();
    el.autoBtn.disabled = state.tokens < spinCost();
    isSpinning = false;
  };

  const claimPrivacyTokens = () => {
    const now = Date.now();
    const remaining = state.lastPrivacyClaimAt + PRIVACY_COOLDOWN_MS - now;
    if (remaining > 0) {
      const seconds = Math.ceil(remaining / 1000);
      setStatus("Privacy sale cooling down.", `Try again in ~${seconds}s. Your data needs time to… marinate.`);
      beep(240, 90, "triangle", 0.02);
      return;
    }

    const bonus = 25;
    state.tokens += bonus;
    state.lastPrivacyClaimAt = now;
    saveState(state);
    renderHUD();
    setStatus(`+${bonus} tokens acquired.`, "Thank you for your privacy. We will store it “anonymously”.");
    beep(520, 70, "sine", 0.025);
    say("Privacy successfully converted into tokens.");
  };

  const donate = () => {
    if (state.tokens <= 0) {
      setStatus("Nothing to donate.", "You are already operating at maximum efficiency (zero).");
      beep(220, 80, "triangle", 0.02);
      return;
    }
    const amount = Math.min(state.tokens, 15);
    state.tokens -= amount;
    saveState(state);
    renderHUD();
    setStatus("Donation accepted.", `Burned ${amount} 🪙 on GPU time. The fans salute you.`);
    beep(320, 80, "square", 0.02);
  };

  const reset = () => {
    const fresh = defaultState();
    Object.assign(state, fresh);
    saveState(state);
    renderHUD();
    renderReels(["🪙", "🤖", "🧠"]);
    setStatus("Factory reset complete.", "All your progress was replaced with a newer model of regret.");
    setAuto(false);
    beep(300, 70, "sine", 0.02);
  };

  const onSettingsChanged = () => {
    state.temperature = clamp(Number(el.temperatureInput.value) || 1, 0.25, 2);
    state.demoMode = el.demoModeInput.checked;
    state.soundOn = el.soundInput.checked;
    state.speechOn = el.speechInput.checked;
    saveState(state);
    renderHUD();
    const demoNote = state.demoMode
      ? "Demo mode enabled. Please do not ask about long-term economics."
      : "Demo mode off. Reality restored.";
    setStatus("Settings updated.", demoNote);
  };

  const wireEvents = () => {
    el.spinBtn.addEventListener("click", () => doSpin());
    el.autoBtn.addEventListener("click", () => setAuto(!autoTimer));
    el.resetBtn.addEventListener("click", () => reset());

    el.temperatureInput.addEventListener("input", () => onSettingsChanged());
    el.demoModeInput.addEventListener("change", () => onSettingsChanged());
    el.soundInput.addEventListener("change", () => onSettingsChanged());
    el.speechInput.addEventListener("change", () => onSettingsChanged());

    el.freeTokensBtn.addEventListener("click", () => claimPrivacyTokens());
    el.donateBtn.addEventListener("click", () => donate());

    window.addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (!el.spinBtn.disabled) doSpin();
      }
      if (e.key.toLowerCase() === "a") {
        e.preventDefault();
        if (!el.autoBtn.disabled) setAuto(!autoTimer);
      }
    });

    // Best-effort: resume AudioContext on first interaction (Safari/iOS).
    const resumeAudio = () => {
      const ctx = ensureAudio();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      window.removeEventListener("pointerdown", resumeAudio);
      window.removeEventListener("keydown", resumeAudio);
    };
    window.addEventListener("pointerdown", resumeAudio, { once: false });
    window.addEventListener("keydown", resumeAudio, { once: false });
  };

  const init = () => {
    renderPaytable();
    renderHUD();
    renderReels(["🪙", "🤖", "🧠"]);
    wireEvents();

    const intro = state.tokens > 0 ? "Ready to burn compute." : "Rate limited from the start.";
    setStatus(intro, "Spin to win tokens. Or lose them. The model is “learning”.");
  };

  init();
})();


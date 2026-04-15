(() => {
  "use strict";

  const STORAGE_KEY = "ai_slot_machine_v1";

  const SYMBOLS = [
    { id: "TOKEN", glyph: "🪙", label: "Token", weight: 24, triple: 5 },
    { id: "BOT", glyph: "🤖", label: "Bot", weight: 18, triple: 8 },
    { id: "GPU", glyph: "🔥", label: "GPU Fire", weight: 14, triple: 12 },
    { id: "BRAIN", glyph: "🧠", label: "Reasoning", weight: 10, triple: 20 },
    { id: "BUG", glyph: "🪲", label: "Bug", weight: 12, triple: 10 },
    { id: "UNICORN", glyph: "🦄", label: "Hallucination", weight: 4, triple: 50 },
    { id: "INVOICE", glyph: "🧾", label: "Invoice", weight: 10, triple: -8 },
    { id: "SUB", glyph: "💸", label: "Subscription", weight: 8, triple: -12 },
  ];

  const SHOP_ITEMS = [
    {
      id: "turbo",
      name: "Turbo Spin",
      cost: 180,
      desc: "Faster spins. More dopamine per second. Ethically sourced from your attention span.",
    },
    {
      id: "autoSpin",
      name: "Auto‑Spin License",
      cost: 240,
      desc: "Adds an Auto button. Stops on big wins so you can savor the delusion.",
    },
    {
      id: "maxBet",
      name: "Context Window Upgrade",
      cost: 220,
      desc: "Raises max bet to 100. Finally, enough tokens to feel something.",
    },
    {
      id: "fxAmp",
      name: "Hype Mode",
      cost: 160,
      desc: "Bigger fireworks and louder visuals (not louder audio). For when you win and need witnesses.",
    },
  ];

  const DEFAULT_STATE = {
    balance: 100,
    debt: 0,
    bet: 5,
    maxBet: 25,
    mute: false,
    volume: 0.8,
    haptics: true,
    fxIntensity: 1,
    reduceMotion: false,
    turbo: false,
    unlocks: {
      turbo: false,
      autoSpin: false,
      maxBet: false,
      fxAmp: false,
    },
    lastDailyClaimISO: "",
    lastResult: null,
    log: [],
  };

  const el = {
    app: document.querySelector(".app"),
    machine: document.querySelector(".machine"),
    balance: document.getElementById("balance"),
    debt: document.getElementById("debt"),
    message: document.getElementById("message"),
    log: document.getElementById("log"),
    bet: document.getElementById("bet"),
    betOut: document.getElementById("betOut"),
    betMinus: document.getElementById("betMinus"),
    betPlus: document.getElementById("betPlus"),
    betNum: document.getElementById("betNum"),
    spinBtn: document.getElementById("spinBtn"),
    autoBtn: document.getElementById("autoBtn"),
    shopBtn: document.getElementById("shopBtn"),
    maxBtn: document.getElementById("maxBtn"),
    dailyBtn: document.getElementById("dailyBtn"),
    borrowBtn: document.getElementById("borrowBtn"),
    muteBtn: document.getElementById("muteBtn"),
    settingsBtn: document.getElementById("settingsBtn"),
    shareBtn: document.getElementById("shareBtn"),
    resetBtn: document.getElementById("resetBtn"),
    srStatus: document.getElementById("srStatus"),
    settingsDialog: document.getElementById("settingsDialog"),
    shopDialog: document.getElementById("shopDialog"),
    soundEnabled: document.getElementById("soundEnabled"),
    volume: document.getElementById("volume"),
    haptics: document.getElementById("haptics"),
    fxIntensity: document.getElementById("fxIntensity"),
    reduceMotion: document.getElementById("reduceMotion"),
    turboField: document.getElementById("turboField"),
    turbo: document.getElementById("turbo"),
    shopItems: document.getElementById("shopItems"),
    fxCanvas: document.getElementById("fxCanvas"),
    screenFlash: document.getElementById("screenFlash"),
    winBanner: document.getElementById("winBanner"),
    reels: [document.getElementById("reel0"), document.getElementById("reel1"), document.getElementById("reel2")],
  };

  function clampInt(value, min, max) {
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function clampFloat(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function nowISODate() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_STATE, unlocks: { ...DEFAULT_STATE.unlocks } };
      const parsed = JSON.parse(raw);
      const merged = {
        ...DEFAULT_STATE,
        ...parsed,
      };

      merged.unlocks = { ...DEFAULT_STATE.unlocks, ...(parsed.unlocks ?? {}) };
      merged.balance = clampInt(parsed.balance ?? DEFAULT_STATE.balance, 0, 1_000_000);
      merged.debt = clampInt(parsed.debt ?? DEFAULT_STATE.debt, 0, 1_000_000);
      merged.volume = clampFloat(parsed.volume ?? DEFAULT_STATE.volume, 0, 1);
      merged.fxIntensity = clampFloat(parsed.fxIntensity ?? DEFAULT_STATE.fxIntensity, 0.3, 1.4);
      merged.haptics = Boolean(parsed.haptics ?? DEFAULT_STATE.haptics);
      merged.reduceMotion = Boolean(parsed.reduceMotion ?? DEFAULT_STATE.reduceMotion);
      merged.mute = Boolean(parsed.mute ?? DEFAULT_STATE.mute);

      const parsedMaxBet = clampInt(parsed.maxBet ?? DEFAULT_STATE.maxBet, 25, 100);
      merged.maxBet = merged.unlocks.maxBet ? Math.max(100, parsedMaxBet) : 25;
      merged.bet = clampInt(parsed.bet ?? DEFAULT_STATE.bet, 1, merged.maxBet);

      const wantsTurbo = Boolean(parsed.turbo ?? DEFAULT_STATE.turbo);
      merged.turbo = merged.unlocks.turbo ? wantsTurbo : false;

      merged.log = Array.isArray(parsed.log) ? parsed.log.slice(0, 25) : [];
      return merged;
    } catch {
      return { ...DEFAULT_STATE, unlocks: { ...DEFAULT_STATE.unlocks } };
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }

  function addLog(line) {
    state.log.unshift(line);
    state.log = state.log.slice(0, 25);
    renderLog();
    saveState();
  }

  function renderLog() {
    el.log.innerHTML = "";
    for (const line of state.log) {
      const li = document.createElement("li");
      li.textContent = line;
      el.log.appendChild(li);
    }
  }

  function setMessage(text, srText = "") {
    el.message.textContent = text;
    if (srText) el.srStatus.textContent = srText;
  }

  function updateMoney() {
    el.balance.textContent = String(state.balance);
    el.debt.textContent = String(state.debt);
  }

  function setControlsDisabled(disabled) {
    for (const btn of [
      el.spinBtn,
      el.autoBtn,
      el.shopBtn,
      el.maxBtn,
      el.dailyBtn,
      el.borrowBtn,
      el.muteBtn,
      el.settingsBtn,
      el.shareBtn,
      el.resetBtn,
      el.betMinus,
      el.betPlus,
    ]) {
      if (btn) btn.disabled = disabled;
    }
    el.bet.disabled = disabled;
    if (el.betNum) el.betNum.disabled = disabled;
  }

  function setMuteButton() {
    el.muteBtn.setAttribute("aria-pressed", state.mute ? "true" : "false");
    el.muteBtn.textContent = `Sound: ${state.mute ? "Off" : "On"}`;
  }

  function hasCryptoRng() {
    return typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function";
  }

  function randomUnit() {
    if (!hasCryptoRng()) return Math.random();
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 0xffffffff;
  }

  function pickWeightedSymbol() {
    const total = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
    let r = randomUnit() * total;
    for (const s of SYMBOLS) {
      r -= s.weight;
      if (r <= 0) return s;
    }
    return SYMBOLS[SYMBOLS.length - 1];
  }

  function vib(pattern) {
    try {
      if (!state.haptics) return;
      if ("vibrate" in navigator) navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }

  let audioCtx = null;

  function ensureAudio() {
    if (state.mute) return null;
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function beep({ type = "sine", freq = 440, durationMs = 80, gain = 0.04 } = {}) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const master = 0.12 * clampFloat(state.volume, 0, 1);
    const peak = Math.max(0.0001, gain * master);
    osc.connect(amp);
    amp.connect(ctx.destination);
    const t0 = ctx.currentTime;
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.linearRampToValueAtTime(peak, t0 + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.02, durationMs / 1000));
    osc.start(t0);
    osc.stop(t0 + durationMs / 1000);
  }

  function sfxSpinTick() {
    beep({ type: "square", freq: 540, durationMs: 28, gain: 0.02 });
  }

  function sfxSpinStart() {
    beep({ type: "sawtooth", freq: 220, durationMs: 90, gain: 0.04 });
    setTimeout(() => beep({ type: "triangle", freq: 420, durationMs: 70, gain: 0.03 }), 50);
  }

  function sfxReelStop(reelIndex) {
    const base = 520 + reelIndex * 60;
    beep({ type: "square", freq: base, durationMs: 34, gain: 0.02 });
  }

  function sfxWin(tier = "small") {
    if (tier === "jackpot") {
      beep({ type: "triangle", freq: 740, durationMs: 120, gain: 0.06 });
      setTimeout(() => beep({ type: "triangle", freq: 980, durationMs: 140, gain: 0.06 }), 90);
      setTimeout(() => beep({ type: "triangle", freq: 1240, durationMs: 160, gain: 0.06 }), 190);
      return;
    }

    if (tier === "big") {
      beep({ type: "triangle", freq: 680, durationMs: 110, gain: 0.055 });
      setTimeout(() => beep({ type: "triangle", freq: 920, durationMs: 130, gain: 0.055 }), 95);
      setTimeout(() => beep({ type: "triangle", freq: 1080, durationMs: 150, gain: 0.055 }), 200);
      return;
    }

    beep({ type: "triangle", freq: 740, durationMs: 100, gain: 0.05 });
    setTimeout(() => beep({ type: "triangle", freq: 980, durationMs: 120, gain: 0.05 }), 90);
  }

  function sfxLose() {
    beep({ type: "sawtooth", freq: 240, durationMs: 120, gain: 0.04 });
    setTimeout(() => beep({ type: "sawtooth", freq: 180, durationMs: 160, gain: 0.03 }), 80);
  }

  function sfxPurchase() {
    beep({ type: "square", freq: 660, durationMs: 60, gain: 0.035 });
    setTimeout(() => beep({ type: "triangle", freq: 990, durationMs: 80, gain: 0.04 }), 70);
  }

  function setReelGlyph(reelIndex, glyph) {
    const node = el.reels[reelIndex].querySelector(".symbol");
    node.textContent = glyph;
  }

  function clearReelHighlights() {
    for (const reel of el.reels) reel.classList.remove("isLocked", "isBad");
  }

  function prefersReducedMotion() {
    try {
      return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch {
      return false;
    }
  }

  function isReducedMotion() {
    return Boolean(state.reduceMotion) || prefersReducedMotion();
  }

  function applyMotionClasses() {
    document.body.classList.toggle("reduceMotion", isReducedMotion());
  }

  function markPageLoaded() {
    requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add("isLoaded")));
  }

  function createFx() {
    const canvas = el.fxCanvas;
    if (!canvas) {
      return {
        burst: () => {},
        flash: () => {},
        banner: () => {},
        clear: () => {},
      };
    }

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) {
      return {
        burst: () => {},
        flash: () => {},
        banner: () => {},
        clear: () => {},
      };
    }
    let w = 0;
    let h = 0;
    let dpr = 1;
    let particles = [];
    let raf = 0;
    let lastT = 0;

    function resize() {
      dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const nextW = Math.floor(window.innerWidth * dpr);
      const nextH = Math.floor(window.innerHeight * dpr);
      if (nextW === w && nextH === h) return;
      w = nextW;
      h = nextH;
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
    }

    window.addEventListener("resize", resize, { passive: true });
    resize();

    function start() {
      if (raf) return;
      lastT = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function frame(t) {
      const dt = Math.min(0.033, Math.max(0.001, (t - lastT) / 1000));
      lastT = t;

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      const next = [];
      for (const p of particles) {
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) continue;

        const alpha = Math.max(0, Math.min(1, p.life / p.ttl));
        ctx.fillStyle = `rgba(${p.c[0]}, ${p.c[1]}, ${p.c[2]}, ${alpha * p.a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        next.push(p);
      }
      particles = next;

      if (particles.length) {
        raf = requestAnimationFrame(frame);
      } else {
        raf = 0;
        ctx.clearRect(0, 0, w, h);
      }
    }

    function burst({ x, y, count = 80, palette, power = 1 } = {}) {
      if (isReducedMotion()) return;
      if (!palette) palette = ["255,61,245", "124,92,255", "0,212,255", "46,229,157"];

      const intensity = clampFloat(state.fxIntensity, 0.3, 1.4) * (state.unlocks.fxAmp ? 1.12 : 1);
      const n = Math.max(8, Math.floor(count * intensity));
      const centerX = (x ?? window.innerWidth * 0.5) * dpr;
      const centerY = (y ?? window.innerHeight * 0.35) * dpr;
      const speedMin = 220 * intensity * power;
      const speedMax = 760 * intensity * power;

      for (let i = 0; i < n; i++) {
        const a = randomUnit() * Math.PI * 2;
        const sp = speedMin + randomUnit() * (speedMax - speedMin);
        const ttl = 0.65 + randomUnit() * 0.75;
        const rgbStr = palette[Math.floor(randomUnit() * palette.length)];
        const c = rgbStr.split(",").map((v) => clampInt(v, 0, 255));
        particles.push({
          x: centerX,
          y: centerY,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          g: 980 * dpr,
          ttl,
          life: ttl,
          c,
          r: (1.2 + randomUnit() * 2.6) * dpr,
          a: 0.9,
        });
      }

      start();
    }

    function flash(strength = 1) {
      if (isReducedMotion()) return;
      if (!el.screenFlash) return;
      el.screenFlash.classList.add("isOn");
      el.screenFlash.style.opacity = String(Math.min(1, Math.max(0.15, 0.22 * strength)));
      setTimeout(() => el.screenFlash.classList.remove("isOn"), 140);
    }

    function banner(text) {
      if (!el.winBanner) return;
      el.winBanner.textContent = text;
      el.winBanner.classList.add("isOn");
      setTimeout(() => el.winBanner.classList.remove("isOn"), 980);
    }

    return {
      burst,
      flash,
      banner,
      clear: () => {
        particles = [];
        ctx.clearRect(0, 0, w, h);
      },
    };
  }

  function formatDelta(n) {
    if (n > 0) return `+${n}`;
    return String(n);
  }

  function tierForPayout(payout, bet) {
    if (payout.reason === "triple" && payout.mult >= 50) return "jackpot";
    if (payout.delta >= bet * 10) return "big";
    if (payout.delta > 0) return "small";
    if (payout.delta < 0) return "bad";
    return "none";
  }

  function pulseMachine(tier) {
    if (!el.machine) return;
    el.machine.classList.remove("isShake", "isHot");

    if (tier === "small" || tier === "big" || tier === "jackpot") {
      el.machine.classList.add("isHot");
      setTimeout(() => el.machine.classList.remove("isHot"), 1100);
    }

    if (tier === "bad" || tier === "big" || tier === "jackpot") {
      el.machine.classList.add("isShake");
      setTimeout(() => el.machine.classList.remove("isShake"), 360);
    }
  }

  function computePayout(symbols, bet) {
    const ids = symbols.map((s) => s.id);
    const isTriple = ids[0] === ids[1] && ids[1] === ids[2];
    if (isTriple) {
      const mult = symbols[0].triple;
      return { delta: bet * mult, kind: mult >= 0 ? "win" : "bad", reason: "triple", mult };
    }

    const counts = new Map();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    const hasPair = Array.from(counts.values()).some((c) => c === 2);
    if (hasPair) return { delta: bet * 2, kind: "pair", reason: "pair", mult: 2 };
    return { delta: 0, kind: "none", reason: "none", mult: 0 };
  }

  function roastForResult(symbols, payout) {
    const glyphs = symbols.map((s) => s.glyph).join(" ");
    const base = `Reels: ${glyphs}.`;
    if (payout.reason === "none") return `${base} No match. Your context window was too small to remember how to win.`;
    if (payout.reason === "pair")
      return `${base} Two of a kind. Shipping “good enough” to production: ${formatDelta(payout.delta)} tokens.`;

    const id = symbols[0].id;
    if (id === "UNICORN")
      return `${base} Hallucination jackpot! You are 100% confident and 50× correct: ${formatDelta(payout.delta)} tokens.`;
    if (id === "BRAIN") return `${base} Actual reasoning detected. Please remain calm: ${formatDelta(payout.delta)} tokens.`;
    if (id === "GPU")
      return `${base} GPUs go brrr. Your fan curve is a suggestion: ${formatDelta(payout.delta)} tokens.`;
    if (id === "BOT") return `${base} The model “understood” you. (It didn’t, but still): ${formatDelta(payout.delta)} tokens.`;
    if (id === "BUG")
      return `${base} Bug bounty paid. Congratulations on discovering undefined behavior: ${formatDelta(payout.delta)} tokens.`;
    if (id === "INVOICE") return `${base} Invoice received. You were billed for “safety”. ${formatDelta(payout.delta)} tokens.`;
    if (id === "SUB")
      return `${base} Subscription renewed. You accepted the terms by existing. ${formatDelta(payout.delta)} tokens.`;
    if (id === "TOKEN") return `${base} Token synergy. Your prompt was “please”. ${formatDelta(payout.delta)} tokens.`;
    return `${base} Something happened: ${formatDelta(payout.delta)} tokens.`;
  }

  function setLatestResult(symbols, bet, payout) {
    state.lastResult = {
      ts: Date.now(),
      symbols: symbols.map((s) => s.glyph),
      bet,
      delta: payout.delta,
      reason: payout.reason,
    };
  }

  function renderBet() {
    el.bet.min = "1";
    el.bet.max = String(state.maxBet);
    el.bet.value = String(state.bet);
    el.betOut.textContent = String(state.bet);
    if (el.betNum) {
      el.betNum.min = "1";
      el.betNum.max = String(state.maxBet);
      el.betNum.value = String(state.bet);
    }
  }

  function setSpinButtonLabel() {
    if (state.balance < state.bet) {
      el.spinBtn.textContent = "Spin (Insufficient)";
      return;
    }
    el.spinBtn.textContent = `Spin (−${state.bet})`;
  }

  function setAutoButtonLabel() {
    if (!el.autoBtn) return;
    el.autoBtn.textContent = isAutoSpinning ? "Auto: On" : "Auto";
    el.autoBtn.classList.toggle("primary", isAutoSpinning);
  }

  function stopAutoSpin(reason = "") {
    if (!isAutoSpinning) return;
    isAutoSpinning = false;
    setAutoButtonLabel();
    if (reason) addLog(`Auto-spin stopped: ${reason}.`);
  }

  async function toggleAutoSpin() {
    if (!state.unlocks.autoSpin) {
      fx.banner("Unlock Auto in Shop");
      openDialog(el.shopDialog);
      return;
    }

    if (isAutoSpinning) {
      stopAutoSpin("manual stop");
      return;
    }

    isAutoSpinning = true;
    setAutoButtonLabel();
    addLog("Auto-spin started.");

    let spins = 0;
    while (isAutoSpinning) {
      const result = await spin({ fromAuto: true });
      if (!result) {
        stopAutoSpin("insufficient tokens");
        break;
      }

      spins += 1;
      if (result.tier === "jackpot" || result.tier === "big") {
        stopAutoSpin("big win");
        break;
      }

      if (spins >= 60) {
        stopAutoSpin("cooldown");
        setMessage("Auto-spin cooldown reached. Even AIs need rate limits.", "Auto-spin cooldown");
        break;
      }

      const delay = state.turbo ? 140 : 240;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  async function spin({ fromAuto = false } = {}) {
    if (isSpinning) return;
    const bet = clampInt(state.bet, 1, state.maxBet);
    if (state.balance < bet) {
      setMessage("Insufficient tokens. Consider borrowing. (This is not financial advice.)", "Insufficient tokens");
      sfxLose();
      vib([20, 40, 20]);
      return;
    }

    isSpinning = true;
    clearReelHighlights();
    setControlsDisabled(true);
    setSpinButtonLabel();

    state.balance -= bet;
    updateMoney();
    addLog(`Spent ${bet} tokens (bet).`);
    setMessage("Spinning… optimizing prompt…", "Spinning");
    sfxSpinStart();
    vib([10]);

    const finalSymbols = [pickWeightedSymbol(), pickWeightedSymbol(), pickWeightedSymbol()];
    const startMs = performance.now();

    const turbo = Boolean(state.turbo && state.unlocks.turbo);
    const stopAfterMs = turbo ? [520, 700, 860] : [820, 1080, 1340];
    const tickEveryMs = turbo ? 42 : 56;

    for (let i = 0; i < 3; i++) el.reels[i].classList.add("isSpinning");

    await Promise.all(
      [0, 1, 2].map((reelIndex) => {
        return new Promise((resolve) => {
          const reel = el.reels[reelIndex];
          let lastTick = 0;

          const frame = (t) => {
            const elapsed = t - startMs;
            if (elapsed >= stopAfterMs[reelIndex]) {
              reel.classList.remove("isSpinning");
              setReelGlyph(reelIndex, finalSymbols[reelIndex].glyph);
              sfxReelStop(reelIndex);
              resolve();
              return;
            }
            if (t - lastTick > tickEveryMs) {
              lastTick = t;
              const s = pickWeightedSymbol();
              setReelGlyph(reelIndex, s.glyph);
              if (reelIndex === 2) sfxSpinTick();
            }
            requestAnimationFrame(frame);
          };

          requestAnimationFrame(frame);
        });
      })
    );

    const payout = computePayout(finalSymbols, bet);
    state.balance = clampInt(state.balance + payout.delta, 0, 1_000_000);

    const tier = tierForPayout(payout, bet);
    pulseMachine(tier);

    const reelCenters = el.reels.map((r) => {
      const b = r.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    });

    if (tier === "small") {
      sfxWin("small");
      vib([18, 18, 28]);
      el.reels.forEach((r) => r.classList.add("isLocked"));
      fx.burst({ x: reelCenters[1].x, y: reelCenters[1].y, count: 90, power: 0.95 });
      fx.banner(`${formatDelta(payout.delta)} tokens`);
    } else if (tier === "big") {
      sfxWin("big");
      vib([24, 24, 42, 18, 18, 38]);
      el.reels.forEach((r) => r.classList.add("isLocked"));
      fx.flash(1.2);
      fx.burst({ x: reelCenters[0].x, y: reelCenters[0].y, count: 120, power: 1.05 });
      fx.burst({ x: reelCenters[1].x, y: reelCenters[1].y, count: 160, power: 1.1 });
      fx.burst({ x: reelCenters[2].x, y: reelCenters[2].y, count: 120, power: 1.05 });
      fx.banner(`BIG WIN ${formatDelta(payout.delta)}`);
    } else if (tier === "jackpot") {
      sfxWin("jackpot");
      vib([30, 24, 30, 120, 28, 20, 28]);
      el.reels.forEach((r) => r.classList.add("isLocked"));
      fx.flash(1.6);
      fx.burst({ x: reelCenters[1].x, y: reelCenters[1].y, count: 260, power: 1.35 });
      setTimeout(() => fx.burst({ x: reelCenters[0].x, y: reelCenters[0].y, count: 220, power: 1.2 }), 90);
      setTimeout(() => fx.burst({ x: reelCenters[2].x, y: reelCenters[2].y, count: 220, power: 1.2 }), 180);
      fx.banner(`JACKPOT ${formatDelta(payout.delta)}`);
    } else if (tier === "bad") {
      sfxLose();
      vib([70]);
      el.reels.forEach((r) => r.classList.add("isBad"));
      fx.flash(0.7);
      fx.banner(`${formatDelta(payout.delta)} tokens`);
    } else {
      sfxLose();
      vib([20, 40, 20]);
    }

    const line = roastForResult(finalSymbols, payout);
    setMessage(line, `Result: ${finalSymbols.map((s) => s.label).join(", ")}. Token change ${formatDelta(payout.delta)}.`);
    addLog(`${finalSymbols.map((s) => s.glyph).join(" ")} → ${formatDelta(payout.delta)} (bet ${bet})`);
    setLatestResult(finalSymbols, bet, payout);
    updateMoney();
    saveState();
    setSpinButtonLabel();

    isSpinning = false;
    setControlsDisabled(false);

    return { tier, payout, bet, symbols: finalSymbols.map((s) => s.id), fromAuto };
  }

  function setMaxBet() {
    state.bet = state.maxBet;
    renderBet();
    saveState();
    beep({ type: "triangle", freq: 660, durationMs: 70, gain: 0.03 });
  }

  function claimDaily() {
    const today = nowISODate();
    if (state.lastDailyClaimISO === today) {
      setMessage(
        "Daily already claimed. Come back tomorrow (or change the system clock, you monster).",
        "Daily already claimed"
      );
      beep({ type: "sine", freq: 260, durationMs: 90, gain: 0.03 });
      return;
    }

    const grant = 30 + Math.floor(randomUnit() * 41); // 30..70
    state.balance = clampInt(state.balance + grant, 0, 1_000_000);
    state.lastDailyClaimISO = today;
    updateMoney();
    addLog(`Claimed daily ${grant} tokens.`);
    setMessage(`Daily tokens delivered: +${grant}. The model thanks you for your continued patronage.`, `Daily claimed +${grant}`);
    sfxWin();
    saveState();
  }

  function borrowTokens() {
    const principal = 100;
    const interest = 25;
    state.balance = clampInt(state.balance + principal, 0, 1_000_000);
    state.debt = clampInt(state.debt + principal + interest, 0, 1_000_000);
    updateMoney();
    addLog(`Borrowed ${principal} tokens (+${interest} interest).`);
    setMessage(
      `Borrowed +${principal} tokens. Added +${principal + interest} debt. Congratulations, you invented “AI finance”.`,
      "Borrowed tokens"
    );
    beep({ type: "square", freq: 320, durationMs: 80, gain: 0.03 });
    saveState();
  }

  function toggleMute() {
    state.mute = !state.mute;
    if (state.mute && audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
    setMuteButton();
    syncSettingsUI();
    saveState();
  }

  async function shareLatest() {
    if (!state.lastResult) {
      setMessage("Nothing to share yet. Spin first.", "Nothing to share");
      return;
    }

    const r = state.lastResult;
    const when = new Date(r.ts).toLocaleString();
    const text =
      `AI Token Slot Machine\n` +
      `Reels: ${r.symbols.join(" ")}\n` +
      `Bet: ${r.bet}\n` +
      `Delta: ${formatDelta(r.delta)}\n` +
      `When: ${when}\n` +
      `Balance: ${state.balance} (Debt: ${state.debt})`;

    try {
      if (navigator.share) {
        await navigator.share({ title: "AI Token Slot Machine", text });
        addLog("Shared result via share sheet.");
        return;
      }
    } catch {
      // fall back to clipboard
    }

    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copied result to clipboard. Paste it into your favorite group chat to lose friends faster.", "Copied to clipboard");
      addLog("Copied result to clipboard.");
      beep({ type: "triangle", freq: 880, durationMs: 70, gain: 0.03 });
    } catch {
      setMessage("Could not share/copy (clipboard permissions). Your result remains proprietary.", "Share failed");
      sfxLose();
    }
  }

  function resetAll() {
    const ok = confirm("Reset balance, debt, bet, and log? This cannot be un-hallucinated.");
    if (!ok) return;
    stopAutoSpin("reset");
    fx.clear();
    closeDialog(el.shopDialog);
    closeDialog(el.settingsDialog);
    state = { ...DEFAULT_STATE, unlocks: { ...DEFAULT_STATE.unlocks } };
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    renderAll();
    setMessage("Reset complete. A fresh start, just like your model after catastrophic forgetting.", "Reset complete");
    beep({ type: "sine", freq: 520, durationMs: 90, gain: 0.03 });
  }

  function payDebtIfPossible() {
    if (state.debt <= 0) return;
    const pay = Math.min(state.debt, Math.max(0, state.balance - 10));
    if (pay <= 0) return;
    state.balance -= pay;
    state.debt -= pay;
    addLog(`Auto-paid ${pay} debt (rate limit fee).`);
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      try {
        dialog.showModal();
        return;
      } catch {
        // already open
      }
    }
    dialog.setAttribute("open", "open");
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function") {
      try {
        dialog.close();
        return;
      } catch {
        // ignore
      }
    }
    dialog.removeAttribute("open");
  }

  function renderUnlocks() {
    if (el.autoBtn) el.autoBtn.classList.toggle("isHidden", !state.unlocks.autoSpin);

    if (el.turboField && el.turbo) {
      const unlocked = Boolean(state.unlocks.turbo);
      el.turboField.classList.toggle("isLocked", !unlocked);
      el.turbo.disabled = !unlocked;
      if (!unlocked) state.turbo = false;
    }

    if (state.unlocks.maxBet) {
      state.maxBet = Math.max(100, clampInt(state.maxBet, 25, 100));
      state.bet = clampInt(state.bet, 1, state.maxBet);
    } else {
      state.maxBet = 25;
      state.bet = clampInt(state.bet, 1, state.maxBet);
    }
  }

  function syncSettingsUI() {
    if (el.soundEnabled) el.soundEnabled.checked = !state.mute;
    if (el.volume) el.volume.value = String(Math.round(clampFloat(state.volume, 0, 1) * 100));
    if (el.haptics) el.haptics.checked = Boolean(state.haptics);
    if (el.fxIntensity) el.fxIntensity.value = String(Math.round(clampFloat(state.fxIntensity, 0.3, 1.4) * 100));
    if (el.reduceMotion) el.reduceMotion.checked = Boolean(state.reduceMotion);
    if (el.turbo) el.turbo.checked = Boolean(state.turbo);

    if (el.volume) el.volume.disabled = state.mute;
  }

  function buyShopItem(item) {
    if (!item || !item.id) return;
    if (state.unlocks[item.id]) return;

    if (state.balance < item.cost) {
      setMessage("Not enough tokens. The Shop accepts payment in vibes, but our accounting system does not.", "Not enough tokens");
      sfxLose();
      vib([20, 40, 20]);
      return;
    }

    state.balance = clampInt(state.balance - item.cost, 0, 1_000_000);
    state.unlocks[item.id] = true;

    if (item.id === "maxBet") state.maxBet = 100;
    if (item.id === "turbo") state.turbo = true;
    if (item.id === "fxAmp") state.fxIntensity = Math.max(state.fxIntensity, 1.05);

    updateMoney();
    addLog(`Shop: bought ${item.name} (−${item.cost}).`);
    setMessage(`Purchased: ${item.name}. Your tokens have been converted into “user engagement”.`, "Purchased item");
    fx.flash(1);
    fx.banner(`${item.name} unlocked`);
    sfxPurchase();
    vib([25, 20, 25]);
    saveState();
    renderAll();
  }

  function renderShop() {
    if (!el.shopItems) return;
    el.shopItems.innerHTML = "";

    for (const item of SHOP_ITEMS) {
      const owned = Boolean(state.unlocks[item.id]);

      const wrap = document.createElement("div");
      wrap.className = "shopItem";

      const top = document.createElement("div");
      top.className = "shopTop";

      const name = document.createElement("h3");
      name.className = "shopName";
      name.textContent = item.name;

      const cost = document.createElement("div");
      cost.className = "shopCost";
      cost.textContent = owned ? "Owned" : `${item.cost} 🪙`;

      top.append(name, cost);

      const desc = document.createElement("p");
      desc.className = "shopDesc";
      desc.textContent = item.desc;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = owned ? "Installed" : state.balance < item.cost ? "Too Expensive" : "Buy";
      btn.disabled = owned || state.balance < item.cost;
      btn.addEventListener("click", () => buyShopItem(item));

      wrap.append(top, desc, btn);
      el.shopItems.appendChild(wrap);
    }
  }

  function renderAll() {
    renderUnlocks();
    updateMoney();
    renderBet();
    renderLog();
    setMuteButton();
    setSpinButtonLabel();
    setAutoButtonLabel();
    syncSettingsUI();
    renderShop();
    applyMotionClasses();
  }

  let state = loadState();
  const fx = createFx();
  let isSpinning = false;
  let isAutoSpinning = false;

  payDebtIfPossible();
  saveState();
  renderAll();
  markPageLoaded();

  el.bet.addEventListener("input", () => {
    state.bet = clampInt(el.bet.value, 1, state.maxBet);
    el.betOut.textContent = String(state.bet);
    if (el.betNum) el.betNum.value = String(state.bet);
    setSpinButtonLabel();
    saveState();
  });

  if (el.betNum) {
    el.betNum.addEventListener("input", () => {
      const next = clampInt(el.betNum.value, 1, state.maxBet);
      state.bet = next;
      el.bet.value = String(next);
      el.betOut.textContent = String(next);
      setSpinButtonLabel();
      saveState();
    });
  }

  function nudgeBet(delta) {
    const next = clampInt(state.bet + delta, 1, state.maxBet);
    state.bet = next;
    renderBet();
    setSpinButtonLabel();
    saveState();
  }

  if (el.betMinus) el.betMinus.addEventListener("click", () => nudgeBet(-1));
  if (el.betPlus) el.betPlus.addEventListener("click", () => nudgeBet(+1));

  el.spinBtn.addEventListener("click", () => void spin());
  if (el.autoBtn) el.autoBtn.addEventListener("click", () => void toggleAutoSpin());
  if (el.shopBtn)
    el.shopBtn.addEventListener("click", () => {
      openDialog(el.shopDialog);
      beep({ type: "triangle", freq: 760, durationMs: 70, gain: 0.02 });
    });
  if (el.settingsBtn)
    el.settingsBtn.addEventListener("click", () => {
      openDialog(el.settingsDialog);
      beep({ type: "triangle", freq: 820, durationMs: 70, gain: 0.02 });
    });
  el.maxBtn.addEventListener("click", setMaxBet);
  el.dailyBtn.addEventListener("click", claimDaily);
  el.borrowBtn.addEventListener("click", borrowTokens);
  el.muteBtn.addEventListener("click", toggleMute);
  el.shareBtn.addEventListener("click", () => void shareLatest());
  el.resetBtn.addEventListener("click", resetAll);

  if (el.soundEnabled) {
    el.soundEnabled.addEventListener("change", () => {
      state.mute = !el.soundEnabled.checked;
      if (state.mute && audioCtx) {
        audioCtx.close().catch(() => {});
        audioCtx = null;
      }
      setMuteButton();
      syncSettingsUI();
      saveState();
    });
  }

  if (el.volume) {
    el.volume.addEventListener("input", () => {
      state.volume = clampFloat(Number(el.volume.value) / 100, 0, 1);
      saveState();
    });
  }

  if (el.haptics) {
    el.haptics.addEventListener("change", () => {
      state.haptics = Boolean(el.haptics.checked);
      saveState();
    });
  }

  if (el.fxIntensity) {
    el.fxIntensity.addEventListener("input", () => {
      state.fxIntensity = clampFloat(Number(el.fxIntensity.value) / 100, 0.3, 1.4);
      saveState();
    });
  }

  if (el.reduceMotion) {
    el.reduceMotion.addEventListener("change", () => {
      state.reduceMotion = Boolean(el.reduceMotion.checked);
      applyMotionClasses();
      saveState();
    });
  }

  if (el.turbo) {
    el.turbo.addEventListener("change", () => {
      if (!state.unlocks.turbo) {
        el.turbo.checked = false;
        fx.banner("Unlock Turbo Spin in Shop");
        openDialog(el.shopDialog);
        return;
      }
      state.turbo = Boolean(el.turbo.checked);
      saveState();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      if (el.settingsDialog && el.settingsDialog.open) return;
      if (el.shopDialog && el.shopDialog.open) return;
      e.preventDefault();
      void spin();
    }
  });

  if (!state.log.length && state.balance === DEFAULT_STATE.balance) {
    addLog("Booted model: GPT-OVERFIT-7B (definitely real).");
    addLog('Loaded prompt: “Please be lucky.”');
    setMessage("Ready. Press Spin to spend tokens in pursuit of vibes.", "Ready");
  }
})();


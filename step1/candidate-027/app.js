(() => {
  "use strict";

  const STORAGE_KEY = "aiSlots.v1";

  const SYMBOLS = [
    { key: "TOKEN", label: "TOKEN", baseWeight: 0.9 },
    { key: "LLM", label: "LLM", baseWeight: 1.05 },
    { key: "GPU", label: "GPU", baseWeight: 0.95 },
    { key: "DATA", label: "DATA", baseWeight: 1.1 },
    { key: "API", label: "API", baseWeight: 1.1 },
    { key: "PROMPT", label: "PROMPT", baseWeight: 1.0 },
    { key: "CACHE", label: "CACHE", baseWeight: 1.0 },
    { key: "HYPE", label: "HYPE", baseWeight: 1.25 },
    { key: "BUG", label: "BUG", baseWeight: 1.25 },
  ];

  const PAYOUT_X3 = {
    TOKEN: 25,
    LLM: 20,
    GPU: 18,
    DATA: 15,
    API: 12,
    PROMPT: 10,
    CACHE: 8,
    HYPE: 6,
    BUG: 5,
  };

  const PAYOUT_X2 = 2;
  const LOSE_PAYOUT = 0;

  const DEFAULTS = {
    balance: 500,
    bet: 10,
    temp: 35,
    sound: true,
    seed: "",
    stats: { spins: 0, wins: 0, losses: 0, biggestWin: 0, net: 0 },
  };

  const $ = (id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };

  const ui = {
    reelFaces: [$("reel0"), $("reel1"), $("reel2")],
    balance: $("balance"),
    confidence: $("confidence"),
    spins: $("spins"),
    bet: $("bet"),
    maxBetBtn: $("maxBetBtn"),
    temp: $("temp"),
    spinBtn: $("spinBtn"),
    autoBtn: $("autoBtn"),
    soundBtn: $("soundBtn"),
    resetBtn: $("resetBtn"),
    paytable: $("paytable"),
    messageBody: $("messageBody"),
    wins: $("wins"),
    losses: $("losses"),
    biggestWin: $("biggestWin"),
    net: $("net"),
    airdropBtn: $("airdropBtn"),
    seedBtn: $("seedBtn"),
    confetti: $("confetti"),
  };

  /** @type {{balance:number, bet:number, temp:number, sound:boolean, seed:string, stats:{spins:number,wins:number,losses:number,biggestWin:number,net:number}}} */
  let state = loadState();

  let isSpinning = false;
  let autoSpin = false;
  let pendingAutoTimeout = null;

  // ---- RNG (seeded-ish) -----------------------------------------------------
  function normalizeSeed(s) {
    const trimmed = String(s ?? "").trim();
    return trimmed || cryptoSeed();
  }

  function cryptoSeed() {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // xmur3 + mulberry32 (small, fast, deterministic given a string seed)
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRng(seedString) {
    const seedGen = xmur3(seedString);
    return mulberry32(seedGen());
  }

  // ---- Audio ---------------------------------------------------------------
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    return audioCtx;
  }

  function beep({ freq = 440, durationMs = 80, type = "sine", gain = 0.04 } = {}) {
    if (!state.sound) return;
    const ctx = getAudioCtx();
    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const g = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = freq;
    g.gain.value = gain;
    oscillator.connect(g);
    g.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + durationMs / 1000);
  }

  function winJingle(payout) {
    if (!state.sound) return;
    const notes = payout >= 10 ? [523, 659, 784, 1046] : [440, 554, 659];
    let t = 0;
    for (const n of notes) {
      setTimeout(() => beep({ freq: n, durationMs: 110, type: "triangle", gain: 0.045 }), t);
      t += 120;
    }
  }

  function loseThud() {
    if (!state.sound) return;
    beep({ freq: 140, durationMs: 120, type: "sawtooth", gain: 0.03 });
  }

  // ---- Storage -------------------------------------------------------------
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const seed = normalizeSeed(DEFAULTS.seed);
        return { ...DEFAULTS, seed };
      }
      const parsed = JSON.parse(raw);
      const seed = normalizeSeed(parsed.seed ?? DEFAULTS.seed);
      return {
        balance: clampInt(parsed.balance ?? DEFAULTS.balance, 0, 1_000_000),
        bet: clampInt(parsed.bet ?? DEFAULTS.bet, 1, 100_000),
        temp: clampInt(parsed.temp ?? DEFAULTS.temp, 0, 100),
        sound: Boolean(parsed.sound ?? DEFAULTS.sound),
        seed,
        stats: {
          spins: clampInt(parsed.stats?.spins ?? 0, 0, 100_000_000),
          wins: clampInt(parsed.stats?.wins ?? 0, 0, 100_000_000),
          losses: clampInt(parsed.stats?.losses ?? 0, 0, 100_000_000),
          biggestWin: clampInt(parsed.stats?.biggestWin ?? 0, 0, 1_000_000_000),
          net: clampInt(parsed.stats?.net ?? 0, -1_000_000_000, 1_000_000_000),
        },
      };
    } catch {
      const seed = normalizeSeed(DEFAULTS.seed);
      return { ...DEFAULTS, seed };
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function resetState() {
    localStorage.removeItem(STORAGE_KEY);
    state = loadState();
    autoSpin = false;
    clearAutoTimeout();
    syncUi(true);
    setMessage("Reset complete. The model has forgotten everything (again).");
  }

  // ---- Utils ---------------------------------------------------------------
  function clampInt(v, min, max) {
    const n = Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : min;
    return Math.max(min, Math.min(max, n));
  }

  function fmt(n) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
  }

  function setMessage(text) {
    ui.messageBody.textContent = text;
  }

  function setConfidence(value) {
    ui.confidence.textContent = value;
  }

  function clearReelClasses() {
    for (const face of ui.reelFaces) face.classList.remove("win", "loss");
  }

  function setReelOutcomeClass(isWin) {
    for (const face of ui.reelFaces) {
      face.classList.toggle("win", isWin);
      face.classList.toggle("loss", !isWin);
    }
  }

  function clearAutoTimeout() {
    if (pendingAutoTimeout !== null) {
      clearTimeout(pendingAutoTimeout);
      pendingAutoTimeout = null;
    }
  }

  // ---- Probabilities -------------------------------------------------------
  function tempAdjustedWeights(temp0to100) {
    const t = clampInt(temp0to100, 0, 100) / 100;
    return SYMBOLS.map((s) => {
      let w = s.baseWeight;
      if (s.key === "HYPE") w *= 1 + 2.2 * t;
      if (s.key === "BUG") w *= 1 + 2.0 * t;
      if (s.key === "TOKEN") w *= 1 - 0.45 * t;
      if (s.key === "GPU") w *= 1 - 0.25 * t;
      if (s.key === "CACHE") w *= 1 + 0.2 * (1 - t);
      return { ...s, weight: Math.max(0.05, w) };
    });
  }

  function weightedPick(rng, items) {
    let total = 0;
    for (const i of items) total += i.weight;
    let r = rng() * total;
    for (const i of items) {
      r -= i.weight;
      if (r <= 0) return i;
    }
    return items[items.length - 1];
  }

  function computeConfidence(temp0to100) {
    const t = clampInt(temp0to100, 0, 100) / 100;
    const conf = Math.round((1 - 0.65 * t) * 100);
    const hedged = Math.max(2, Math.min(99, conf));
    // Make fun of overconfident outputs.
    if (hedged > 92) return `${hedged}% (unreasonably confident)`;
    if (hedged < 25) return `${hedged}% (shrug emoji omitted)`;
    return `${hedged}%`;
  }

  // ---- Paytable / evaluation ----------------------------------------------
  function payoutFor(result, bet) {
    const [a, b, c] = result;
    if (a === b && b === c) {
      const mult = PAYOUT_X3[a] ?? 10;
      return { payout: bet * mult, kind: "x3", mult, symbol: a };
    }
    const isPair = a === b || a === c || b === c;
    if (isPair) {
      return { payout: bet * PAYOUT_X2, kind: "x2", mult: PAYOUT_X2, symbol: pairSymbol(result) };
    }
    return { payout: LOSE_PAYOUT, kind: "lose", mult: 0, symbol: "" };
  }

  function pairSymbol([a, b, c]) {
    if (a === b) return a;
    if (a === c) return a;
    if (b === c) return b;
    return "";
  }

  function renderPaytable() {
    ui.paytable.innerHTML = "";
    const entries = Object.entries(PAYOUT_X3).sort((a, b) => b[1] - a[1]);
    for (const [sym, mult] of entries) {
      const row = document.createElement("div");
      row.className = "payrow";
      const left = document.createElement("div");
      left.className = "sym";
      left.textContent = `${sym} ${sym} ${sym}`;
      const right = document.createElement("div");
      right.className = "mul";
      right.textContent = `x${mult}`;
      row.append(left, right);
      ui.paytable.append(row);
    }
    const pair = document.createElement("div");
    pair.className = "payrow";
    const left = document.createElement("div");
    left.className = "sym";
    left.textContent = `Any pair`;
    const right = document.createElement("div");
    right.className = "mul";
    right.textContent = `x${PAYOUT_X2}`;
    pair.append(left, right);
    ui.paytable.append(pair);
  }

  // ---- Confetti ------------------------------------------------------------
  const confettiFx = (() => {
    const canvas = ui.confetti;
    const ctx = canvas.getContext("2d", { alpha: true });
    let raf = 0;
    let particles = [];
    let endAt = 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function start(durationMs = 900) {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      cancelAnimationFrame(raf);
      resize();
      particles = makeParticles(90);
      endAt = performance.now() + durationMs;
      ui.confetti.classList.add("on");
      tick();
    }

    function stop() {
      cancelAnimationFrame(raf);
      ui.confetti.classList.remove("on");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles = [];
    }

    function makeParticles(count) {
      const rect = canvas.getBoundingClientRect();
      const colors = ["#7c5cff", "#23c9ff", "#55f5a7", "#ffd166", "#ff4d6d"];
      const out = [];
      for (let i = 0; i < count; i++) {
        out.push({
          x: rect.width * 0.2 + Math.random() * rect.width * 0.6,
          y: -20 - Math.random() * 60,
          vx: (Math.random() - 0.5) * 2.2,
          vy: 2.2 + Math.random() * 3.6,
          size: 6 + Math.random() * 7,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.15,
          color: colors[i % colors.length],
        });
      }
      return out;
    }

    function tick() {
      const now = performance.now();
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.vy += 0.03;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      particles = particles.filter((p) => p.y < rect.height + 40);
      if (now < endAt && particles.length > 0) {
        raf = requestAnimationFrame(tick);
      } else {
        stop();
      }
    }

    window.addEventListener("resize", () => {
      if (particles.length) resize();
    });

    return { start, stop };
  })();

  // ---- Spin engine ---------------------------------------------------------
  async function spinOnce() {
    if (isSpinning) return;
    clearReelClasses();

    const bet = clampInt(ui.bet.value, 1, Math.max(1, state.balance));
    state.bet = bet;
    if (state.balance < bet) {
      if (autoSpin) {
        autoSpin = false;
        clearAutoTimeout();
        syncUi();
      }
      setMessage("Insufficient tokens. Please lower your bet or request an airdrop (you degen).");
      loseThud();
      vibrate([40, 25, 40]);
      syncUi();
      return;
    }

    const temp = clampInt(ui.temp.value, 0, 100);
    state.temp = temp;
    setConfidence(computeConfidence(temp));

    isSpinning = true;
    setDisabled(true);

    state.balance -= bet;
    state.stats.spins += 1;
    state.stats.net -= bet;
    saveState();
    syncUi();

    const seed = normalizeSeed(state.seed);
    // Make each spin deterministic given seed + spin count + temp + bet.
    const rng = makeRng(`${seed}|${state.stats.spins}|${temp}|${bet}`);
    const weights = tempAdjustedWeights(temp);

    // Precompute final symbols so the animation is just theater.
    const final = [0, 1, 2].map(() => weightedPick(rng, weights).key);

    // Tiny chance of a "hallucination": briefly claim a win, then correct it.
    const hallucinate = rng() < 0.06 && !matchMedia("(prefers-reduced-motion: reduce)").matches;

    setMessage("Spinning... converting compute into vibes.");
    beep({ freq: 220, durationMs: 50, type: "square", gain: 0.03 });

    const result = await animateReels(final, { rng, hallucinate });
    const evald = payoutFor(result, bet);

    if (evald.payout > 0) {
      state.balance += evald.payout;
      state.stats.wins += 1;
      state.stats.net += evald.payout;
      state.stats.biggestWin = Math.max(state.stats.biggestWin, evald.payout);
      saveState();
      syncUi();
      setReelOutcomeClass(true);
      winJingle(evald.mult);
      confettiFx.start(evald.payout >= bet * 10 ? 1200 : 800);
      vibrate(evald.payout >= bet * 10 ? [25, 30, 25, 60] : [30]);

      const quip = winMessage(evald, bet);
      setMessage(quip);
    } else {
      state.stats.losses += 1;
      saveState();
      syncUi();
      setReelOutcomeClass(false);
      loseThud();
      vibrate([40]);
      setMessage(lossMessage(result, bet));
    }

    isSpinning = false;
    setDisabled(false);

    if (autoSpin) scheduleAuto();
  }

  function scheduleAuto() {
    clearAutoTimeout();
    // Apply a small randomized delay to feel "agentic".
    const delay = 250 + Math.floor(Math.random() * 260);
    pendingAutoTimeout = setTimeout(() => {
      pendingAutoTimeout = null;
      void spinOnce();
    }, delay);
  }

  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  function winMessage(evald, bet) {
    const tokens = fmt(evald.payout);
    if (evald.kind === "x3" && evald.symbol === "TOKEN") {
      return `JACKPOT: ${tokens} tokens. The model calls this “ground truth”.`;
    }
    if (evald.kind === "x3" && evald.symbol === "BUG") {
      return `You won ${tokens} tokens and a brand-new regression. Congrats on your “iteration velocity”.`;
    }
    if (evald.kind === "x3") {
      return `Three of a kind (${evald.symbol}). You win ${tokens} tokens. The model is taking full credit.`;
    }
    return `Pair detected (${evald.symbol}). You win ${tokens} tokens (x${evald.mult}). Basically a benchmark.`;
  }

  function lossMessage(result, bet) {
    const [a, b, c] = result;
    if (a === "HYPE" || b === "HYPE" || c === "HYPE") {
      return `You lost ${fmt(bet)} tokens. But the narrative is strong. Ship it.`;
    }
    if (a === "BUG" || b === "BUG" || c === "BUG") {
      return `You lost ${fmt(bet)} tokens. The model suggests “try clearing your cache”.`;
    }
    return `You lost ${fmt(bet)} tokens. The model remains confident anyway.`;
  }

  function setDisabled(disabled) {
    ui.spinBtn.disabled = disabled;
    ui.bet.disabled = disabled;
    ui.maxBetBtn.disabled = disabled;
    ui.temp.disabled = disabled;
    ui.airdropBtn.disabled = disabled;
    ui.seedBtn.disabled = disabled;
    ui.resetBtn.disabled = disabled;
  }

  function animateReels(final, { rng, hallucinate }) {
    return new Promise((resolve) => {
      const durations = [540, 740, 940];
      const intervalMs = 50;
      const temp = clampInt(ui.temp.value, 0, 100);
      const weights = tempAdjustedWeights(temp);

      const startAt = performance.now();
      const chosen = ["", "", ""];
      let ended = 0;

      function tick() {
        const now = performance.now();
        for (let i = 0; i < 3; i++) {
          const elapsed = now - startAt;
          const stillSpinning = elapsed < durations[i];
          if (stillSpinning) {
            const sym = weightedPick(Math.random, weights).key;
            ui.reelFaces[i].textContent = sym;
            if (state.sound) beep({ freq: 200 + i * 60, durationMs: 20, type: "square", gain: 0.015 });
          } else if (!chosen[i]) {
            chosen[i] = final[i];
            ui.reelFaces[i].textContent = final[i];
            ended += 1;
            if (state.sound) beep({ freq: 360 + i * 90, durationMs: 55, type: "triangle", gain: 0.03 });
          }
        }

        if (ended < 3) {
          setTimeout(tick, intervalMs);
          return;
        }

        // "Hallucinate": briefly claim it is a win, then reveal reality.
        if (hallucinate) {
          const truth = [...chosen];
          setMessage("WIN DETECTED. Confidence: 100%. (This output is definitive.)");
          setReelOutcomeClass(true);
          setTimeout(() => {
            setReelOutcomeClass(false);
            // Intentionally do not change reels—just the narrator’s certainty.
            setMessage("Correction: That was a hallucination. Please cite sources next time.");
            resolve(truth);
          }, 520);
        } else {
          resolve([...chosen]);
        }
      }

      tick();
    });
  }

  // ---- UI sync -------------------------------------------------------------
  function syncUi(force = false) {
    ui.balance.textContent = fmt(state.balance);
    ui.spins.textContent = fmt(state.stats.spins);
    ui.wins.textContent = fmt(state.stats.wins);
    ui.losses.textContent = fmt(state.stats.losses);
    ui.biggestWin.textContent = fmt(state.stats.biggestWin);
    ui.net.textContent = fmt(state.stats.net);

    const maxBet = Math.max(1, state.balance);
    ui.bet.max = String(maxBet);

    if (force) {
      ui.bet.value = String(clampInt(state.bet, 1, 100_000));
      ui.temp.value = String(clampInt(state.temp, 0, 100));
    }

    ui.soundBtn.setAttribute("aria-pressed", state.sound ? "true" : "false");
    ui.soundBtn.textContent = state.sound ? "Sound: On" : "Sound: Off";

    ui.autoBtn.setAttribute("aria-pressed", autoSpin ? "true" : "false");
    ui.autoBtn.textContent = autoSpin ? "Auto: On" : "Auto: Off";

    setConfidence(computeConfidence(clampInt(ui.temp.value, 0, 100)));

    // Initialize reels with something stable
    if (ui.reelFaces[0].textContent === "—") {
      const rng = makeRng(`${state.seed}|init`);
      const weights = tempAdjustedWeights(state.temp);
      const initial = [0, 1, 2].map(() => weightedPick(rng, weights).key);
      for (let i = 0; i < 3; i++) ui.reelFaces[i].textContent = initial[i];
    }
  }

  // ---- Events --------------------------------------------------------------
  function wireEvents() {
    ui.spinBtn.addEventListener("click", () => void spinOnce());
    ui.maxBetBtn.addEventListener("click", () => {
      ui.bet.value = String(Math.max(1, state.balance));
      state.bet = clampInt(ui.bet.value, 1, Math.max(1, state.balance));
      saveState();
      syncUi();
      setMessage("Max bet set. This is what we call “optimizing for metrics.”");
    });

    ui.bet.addEventListener("change", () => {
      state.bet = clampInt(ui.bet.value, 1, 100_000);
      saveState();
      syncUi();
    });

    ui.temp.addEventListener("input", () => {
      state.temp = clampInt(ui.temp.value, 0, 100);
      saveState();
      syncUi();
    });

    ui.autoBtn.addEventListener("click", () => {
      autoSpin = !autoSpin;
      clearAutoTimeout();
      syncUi();
      if (autoSpin) {
        setMessage("Auto-spin engaged. Delegating decisions to the model. What could go wrong?");
        scheduleAuto();
      } else {
        setMessage("Auto-spin disengaged. Welcome back, human-in-the-loop.");
      }
    });

    ui.soundBtn.addEventListener("click", async () => {
      state.sound = !state.sound;
      saveState();
      syncUi();
      if (state.sound) {
        // Attempt to resume audio context on user gesture.
        const ctx = getAudioCtx();
        if (ctx && ctx.state === "suspended") {
          try {
            await ctx.resume();
          } catch {
            // ignore
          }
        }
        beep({ freq: 660, durationMs: 80, type: "triangle", gain: 0.04 });
        setMessage("Sound on. The UX team calls it “delight.”");
      } else {
        setMessage("Sound off. Silence is the best prompt.");
      }
    });

    ui.resetBtn.addEventListener("click", () => {
      const ok = confirm("Reset tokens and stats? This cannot be un-hallucinated.");
      if (!ok) return;
      resetState();
      clearReelClasses();
      confettiFx.stop();
    });

    ui.airdropBtn.addEventListener("click", () => {
      // Soft-rate-limit to prevent accidental infinite inflation.
      const amount = 150;
      state.balance += amount;
      state.stats.net += amount;
      saveState();
      syncUi();
      setMessage(`Airdrop received: +${fmt(amount)} tokens. Please applaud the “ecosystem”.`);
      beep({ freq: 520, durationMs: 90, type: "sine", gain: 0.04 });
      vibrate([25, 20, 25]);
    });

    ui.seedBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(state.seed);
        setMessage(`Seed copied: ${state.seed}. Now you can reproduce your losses with scientific rigor.`);
      } catch {
        setMessage(`Seed: ${state.seed}. (Clipboard blocked; please copy manually.)`);
      }
      beep({ freq: 740, durationMs: 70, type: "triangle", gain: 0.04 });
    });

    document.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      if (e.code === "Space") {
        e.preventDefault();
        void spinOnce();
      }
      if (e.key.toLowerCase() === "a") {
        ui.autoBtn.click();
      }
    });
  }

  // ---- Boot ---------------------------------------------------------------
  function boot() {
    state.seed = normalizeSeed(state.seed);
    renderPaytable();
    ui.bet.value = String(state.bet);
    ui.temp.value = String(state.temp);
    syncUi(true);
    wireEvents();

    // Encourage audio context setup on first gesture for Safari-like policies.
    document.addEventListener(
      "pointerdown",
      async () => {
        if (!state.sound) return;
        const ctx = getAudioCtx();
        if (ctx && ctx.state === "suspended") {
          try {
            await ctx.resume();
          } catch {
            // ignore
          }
        }
      },
      { once: true }
    );
  }

  boot();
})();

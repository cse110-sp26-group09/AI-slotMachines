(() => {
  "use strict";

  const STORAGE_KEY = "ai-slotmachine:v2";

  const ICON_TOKEN = "\u{1FA99}"; // 🪙
  const ICON_ROBOT = "\u{1F916}"; // 🤖
  const ICON_BRAIN = "\u{1F9E0}"; // 🧠
  const ICON_CHART = "\u{1F4C8}"; // 📈
  const ICON_EVAL = "\u{1F9EA}"; // 🧪
  const ICON_THREAD = "\u{1F9F5}"; // 🧵
  const ICON_WAND = "\u{1FA84}"; // 🪄
  const ICON_EXTINGUISHER = "\u{1F9EF}"; // 🧯
  const ICON_FIRE = "\u{1F525}"; // 🔥
  const ICON_OUTAGE = "\u{1F4A5}"; // 💥

  const SYMBOLS = [
    { icon: ICON_TOKEN, weight: 6, name: "Token" },
    { icon: ICON_ROBOT, weight: 10, name: "Robot" },
    { icon: ICON_BRAIN, weight: 10, name: "Brain" },
    { icon: ICON_CHART, weight: 10, name: "Up only" },
    { icon: ICON_EVAL, weight: 12, name: "Eval" },
    { icon: ICON_THREAD, weight: 12, name: "Prompt spaghetti" },
    { icon: ICON_WAND, weight: 12, name: "Magic demo" },
    { icon: ICON_EXTINGUISHER, weight: 14, name: "Safety patch" },
    { icon: ICON_FIRE, weight: 10, name: "GPU heat" },
    { icon: ICON_OUTAGE, weight: 4, name: "Outage" }
  ];

  const PAYOUTS_TRIPLE = new Map([
    [ICON_TOKEN, 25],
    [ICON_ROBOT, 12],
    [ICON_BRAIN, 10],
    [ICON_CHART, 8]
  ]);

  const DEFAULT_STATE = {
    balance: 100,
    lastDelta: 0,
    bet: 10,
    settings: { sound: true, volume: 70, ticks: true, haptics: true, speech: false, turbo: false },
    perks: { luckSpins: 0, shieldSpins: 0, turboUnlocked: false },
    stats: { spins: 0, wins: 0, bigWins: 0, outages: 0 },
    lastResult: { reels: [ICON_ROBOT, ICON_TOKEN, ICON_FIRE], headline: "", detail: "" }
  };

  function now() {
    return performance.now();
  }

  function clampInt(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    const int = Math.trunc(num);
    return Math.max(min, Math.min(max, int));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      const state = structuredClone(DEFAULT_STATE);

      state.balance = clampInt(parsed.balance, 0, 999999, DEFAULT_STATE.balance);
      state.lastDelta = clampInt(parsed.lastDelta, -999999, 999999, 0);
      state.bet = clampInt(parsed.bet, 1, 250, DEFAULT_STATE.bet);

      if (parsed.settings && typeof parsed.settings === "object") {
        state.settings.sound = Boolean(parsed.settings.sound);
        state.settings.volume = clampInt(parsed.settings.volume, 0, 100, DEFAULT_STATE.settings.volume);
        state.settings.ticks = parsed.settings.ticks === undefined ? DEFAULT_STATE.settings.ticks : Boolean(parsed.settings.ticks);
        state.settings.haptics = Boolean(parsed.settings.haptics);
        state.settings.speech = Boolean(parsed.settings.speech);
        state.settings.turbo = Boolean(parsed.settings.turbo);
      }

      if (parsed.perks && typeof parsed.perks === "object") {
        state.perks.luckSpins = clampInt(parsed.perks.luckSpins, 0, 999, 0);
        state.perks.shieldSpins = clampInt(parsed.perks.shieldSpins, 0, 999, 0);
        state.perks.turboUnlocked = Boolean(parsed.perks.turboUnlocked);
      }

      if (parsed.stats && typeof parsed.stats === "object") {
        state.stats.spins = clampInt(parsed.stats.spins, 0, 9999999, 0);
        state.stats.wins = clampInt(parsed.stats.wins, 0, 9999999, 0);
        state.stats.bigWins = clampInt(parsed.stats.bigWins, 0, 9999999, 0);
        state.stats.outages = clampInt(parsed.stats.outages, 0, 9999999, 0);
      }

      if (parsed.lastResult && typeof parsed.lastResult === "object") {
        if (Array.isArray(parsed.lastResult.reels) && parsed.lastResult.reels.length === 3) {
          state.lastResult.reels = parsed.lastResult.reels.map(String).slice(0, 3);
        }
        state.lastResult.headline = String(parsed.lastResult.headline ?? "");
        state.lastResult.detail = String(parsed.lastResult.detail ?? "");
      }

      return state;
    } catch {
      return structuredClone(DEFAULT_STATE);
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }

  function weightedPick(items) {
    let total = 0;
    for (const item of items) total += item.weight;
    let roll = Math.random() * total;
    for (const item of items) {
      roll -= item.weight;
      if (roll <= 0) return item;
    }
    return items[items.length - 1];
  }

  function countMatches(a, b, c) {
    if (a === b && b === c) return { kind: "triple", symbol: a };
    if (a === b || a === c) return { kind: "double", symbol: a };
    if (b === c) return { kind: "double", symbol: b };
    return { kind: "none", symbol: "" };
  }

  function formatSigned(n) {
    if (n > 0) return `+${n}`;
    if (n < 0) return `${n}`;
    return "0";
  }

  function vibrate(pattern) {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.02;
      utter.pitch = 1.05;
      window.speechSynthesis.speak(utter);
    } catch {
      // ignore
    }
  }

  function createAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0.08;
    master.connect(ctx.destination);

    function tone(freq, durationMs, type = "sine", gain = 0.06) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.value = gain;
      osc.connect(g);
      g.connect(master);
      const t0 = ctx.currentTime;
      const t1 = t0 + durationMs / 1000;
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.start(t0);
      osc.stop(t1);
    }

    function setVolume(v) {
      const vol = Math.max(0, Math.min(100, Number(v)));
      const scaled = Math.pow(vol / 100, 1.55) * 0.16;
      master.gain.setTargetAtTime(scaled, ctx.currentTime, 0.012);
    }

    function spinTick(i) {
      const freq = 520 + i * 40;
      tone(freq, 55, "square", 0.03);
    }

    function winJingle(mult) {
      const base = Math.min(1100, 440 + mult * 25);
      tone(base, 120, "sine", 0.06);
      setTimeout(() => tone(base * 1.25, 120, "sine", 0.055), 110);
      setTimeout(() => tone(base * 1.5, 180, "triangle", 0.05), 220);
      if (mult >= 10) {
        setTimeout(() => tone(base * 2, 180, "triangle", 0.045), 330);
      }
      if (mult >= 25) {
        setTimeout(() => tone(1760, 120, "sine", 0.05), 460);
        setTimeout(() => tone(1320, 170, "sine", 0.045), 540);
      }
    }

    function loseThud() {
      tone(140, 190, "sawtooth", 0.06);
    }

    function uiClick() {
      tone(520, 42, "square", 0.02);
      setTimeout(() => tone(740, 36, "square", 0.018), 40);
    }

    function purchase() {
      tone(660, 70, "triangle", 0.04);
      setTimeout(() => tone(880, 80, "triangle", 0.038), 70);
      setTimeout(() => tone(990, 100, "sine", 0.035), 150);
    }

    async function ensureUnlocked() {
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          // ignore
        }
      }
    }

    return { ensureUnlocked, setVolume, spinTick, winJingle, loseThud, uiClick, purchase };
  }

  function toast(node, message) {
    node.textContent = message;
    node.hidden = false;
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => {
      node.hidden = true;
      node.textContent = "";
    }, 2400);
  }
  toast._t = 0;

  function qs(root, sel) {
    const node = root.querySelector(sel);
    if (!node) throw new Error(`Missing element: ${sel}`);
    return node;
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  document.documentElement.classList.add("js");

  const app = document.querySelector('[data-js="app"]');
  if (!app) return;

  requestAnimationFrame(() => {
    document.body.classList.add("is-ready");
  });

  const elBalance = qs(app, '[data-js="balance"]');
  const elDelta = qs(app, '[data-js="delta"]');
  const elBet = qs(app, '[data-js="bet"]');
  const elBetNumber = qs(app, '[data-js="betNumber"]');
  const elBetLabel = qs(app, '[data-js="betLabel"]');
  const elSpinCostLabel = qs(app, '[data-js="spinCostLabel"]');
  const btnSpin = qs(app, '[data-js="spin"]');
  const btnRefill = qs(app, '[data-js="refill"]');
  const btnReset = qs(app, '[data-js="reset"]');
  const elHeadline = qs(app, '[data-js="headline"]');
  const elDetail = qs(app, '[data-js="detail"]');
  const toastNode = qs(app, '[data-js="toast"]');
  const reelWindows = Array.from(app.querySelectorAll('[data-js="reelWindow"]'));
  const reelNodes = Array.from(app.querySelectorAll('[data-js="reel"]'));
  const soundToggle = qs(app, '[data-js="sound"]');
  const volumeRange = qs(app, '[data-js="volume"]');
  const ticksToggle = qs(app, '[data-js="ticks"]');
  const hapticsToggle = qs(app, '[data-js="haptics"]');
  const speechToggle = qs(app, '[data-js="speech"]');
  const turboToggle = qs(app, '[data-js="turbo"]');
  const perksNode = qs(app, '[data-js="perks"]');
  const btnBuyLuck = qs(app, '[data-js="buyLuck"]');
  const btnBuyShield = qs(app, '[data-js="buyShield"]');
  const btnBuyTurbo = qs(app, '[data-js="buyTurbo"]');
  const fxLayer = qs(app, '[data-js="fx"]');
  const fxBanner = qs(app, '[data-js="fxBanner"]');

  const elSpins = qs(app, '[data-js="spins"]');
  const elWins = qs(app, '[data-js="wins"]');
  const elBigWins = qs(app, '[data-js="bigWins"]');
  const elOutages = qs(app, '[data-js="outages"]');

  const btnShare = qs(app, '[data-js="share"]');
  const btnCopy = qs(app, '[data-js="copy"]');

  let state = loadState();
  let audio = null;
  let spinning = false;

  function spinCost(bet) {
    return bet;
  }

  function setResultText(headline, detail) {
    elHeadline.textContent = headline;
    elDetail.textContent = detail;
    state.lastResult.headline = headline;
    state.lastResult.detail = detail;
  }

  function renderPerks() {
    perksNode.textContent = "";
    const items = [];
    if (state.perks.luckSpins > 0) items.push(`Luck patch: ${state.perks.luckSpins} spin${state.perks.luckSpins === 1 ? "" : "s"}`);
    if (state.perks.shieldSpins > 0)
      items.push(
        `Outage insurance: ${state.perks.shieldSpins} spin${state.perks.shieldSpins === 1 ? "" : "s"}`
      );
    if (state.perks.turboUnlocked) items.push("Turbo: unlocked");
    if (items.length === 0) return;
    for (const label of items) {
      const chip = document.createElement("span");
      chip.className = "perk";
      chip.textContent = label;
      perksNode.append(chip);
    }
  }

  function updateUI() {
    elBalance.textContent = String(state.balance);
    elDelta.textContent = state.lastDelta === 0 ? "—" : formatSigned(state.lastDelta);
    elDelta.style.color = state.lastDelta > 0 ? "var(--good)" : state.lastDelta < 0 ? "var(--bad)" : "var(--muted)";

    elBet.value = String(state.bet);
    elBetNumber.value = String(state.bet);
    elBetLabel.textContent = String(state.bet);
    elSpinCostLabel.textContent = String(spinCost(state.bet));

    soundToggle.checked = state.settings.sound;
    volumeRange.value = String(state.settings.volume);
    volumeRange.disabled = !state.settings.sound;
    ticksToggle.checked = state.settings.ticks;
    ticksToggle.disabled = !state.settings.sound;
    hapticsToggle.checked = state.settings.haptics;
    speechToggle.checked = state.settings.speech;
    turboToggle.disabled = !state.perks.turboUnlocked;
    turboToggle.checked = state.perks.turboUnlocked && state.settings.turbo;

    elSpins.textContent = String(state.stats.spins);
    elWins.textContent = String(state.stats.wins);
    elBigWins.textContent = String(state.stats.bigWins);
    elOutages.textContent = String(state.stats.outages);

    for (let i = 0; i < reelWindows.length; i++) {
      reelWindows[i].textContent = state.lastResult.reels[i] ?? "❓";
    }

    const cost = spinCost(state.bet);
    btnSpin.disabled = spinning || state.balance < cost;
    btnRefill.disabled = spinning;
    btnReset.disabled = spinning;

    btnBuyLuck.disabled = spinning || state.balance < 60;
    btnBuyShield.disabled = spinning || state.balance < 50;
    btnBuyTurbo.disabled = spinning || state.perks.turboUnlocked || state.balance < 120;

    renderPerks();
  }

  async function ensureAudio() {
    if (!state.settings.sound) return null;
    audio ||= createAudio();
    if (!audio) return null;
    audio.setVolume(state.settings.volume);
    await audio.ensureUnlocked();
    return audio;
  }

  function playClick() {
    if (!state.settings.sound) return;
    audio ||= createAudio();
    if (!audio) return;
    audio.setVolume(state.settings.volume);
    void audio.ensureUnlocked();
    audio.uiClick();
  }

  function canAfford(cost) {
    return state.balance >= cost;
  }

  function spend(cost) {
    state.balance = Math.max(0, state.balance - cost);
    state.lastDelta = -cost;
  }

  function buyLuck() {
    const cost = 60;
    if (spinning) return;
    if (!canAfford(cost)) {
      toast(toastNode, "Insufficient tokens. Please consult your nearest venture capitalist.");
      return;
    }
    spend(cost);
    state.perks.luckSpins = Math.min(999, state.perks.luckSpins + 3);
    setResultText("Luck patch installed.", "For the next few spins, the model is “mysteriously” more cooperative.");
    playClick();
    void ensureAudio().then((a) => a && a.purchase());
    if (state.settings.haptics) vibrate([10, 40, 10]);
    saveState(state);
    updateUI();
  }

  function buyShield() {
    const cost = 50;
    if (spinning) return;
    if (!canAfford(cost)) {
      toast(toastNode, "Insufficient tokens. Please consult your nearest venture capitalist.");
      return;
    }
    spend(cost);
    state.perks.shieldSpins = Math.min(999, state.perks.shieldSpins + 5);
    setResultText("Outage insurance purchased.", "If 💥 appears, we’ll retry once. No SLA, just vibes.");
    playClick();
    void ensureAudio().then((a) => a && a.purchase());
    if (state.settings.haptics) vibrate([12, 40, 12]);
    saveState(state);
    updateUI();
  }

  function buyTurbo() {
    const cost = 120;
    if (spinning) return;
    if (state.perks.turboUnlocked) return;
    if (!canAfford(cost)) {
      toast(toastNode, "Not enough tokens to overclock the vibes.");
      return;
    }
    spend(cost);
    state.perks.turboUnlocked = true;
    state.settings.turbo = true;
    setResultText("Turbo unlocked.", "Shorter spins, faster feedback loops, same questionable economics.");
    playClick();
    void ensureAudio().then((a) => a && a.purchase());
    if (state.settings.haptics) vibrate([8, 28, 8, 28, 8]);
    showBanner("TURBO UNLOCKED");
    saveState(state);
    updateUI();
  }

  function computePayout(reels, bet) {
    const [a, b, c] = reels;
    if (reels.includes(ICON_OUTAGE)) {
      return {
        mult: 0,
        kind: "outage",
        message: "Outage detected. Your ROI has been rate-limited."
      };
    }

    const match = countMatches(a, b, c);
    if (match.kind === "triple") {
      const mult = PAYOUTS_TRIPLE.get(match.symbol) ?? 6;
      return {
        mult,
        kind: "triple",
        message: `${match.symbol}${match.symbol}${match.symbol} — model is “aligned” with your wallet.`
      };
    }
    if (match.kind === "double") {
      return { mult: 2, kind: "double", message: "Two-of-a-kind — close enough for a press release." };
    }
    return { mult: 0, kind: "none", message: "No match — have you tried adding more context?" };
  }

  function buildSymbolPool({ luck }) {
    if (!luck) return SYMBOLS;
    return SYMBOLS.map((s) => {
      if (s.icon === ICON_OUTAGE) return { ...s, weight: Math.max(1, Math.round(s.weight * 0.65)) };
      if (s.icon === ICON_TOKEN || s.icon === ICON_ROBOT || s.icon === ICON_BRAIN || s.icon === ICON_CHART) {
        return { ...s, weight: Math.round(s.weight * 1.18) };
      }
      return { ...s, weight: Math.round(s.weight * 1.06) };
    });
  }

  function rollReels({ luck, shield }) {
    const pool = buildSymbolPool({ luck });
    let reels = [weightedPick(pool).icon, weightedPick(pool).icon, weightedPick(pool).icon];
    let shieldUsed = false;
    if (shield && reels.includes(ICON_OUTAGE)) {
      shieldUsed = true;
      // Retry once (same odds). If it's still 💥, that's showbiz.
      reels = [weightedPick(pool).icon, weightedPick(pool).icon, weightedPick(pool).icon];
    }
    return { reels, shieldUsed };
  }

  function animateReel(el, finalSymbol, durationMs, tickFn) {
    const prefersReduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduce) {
      el.textContent = finalSymbol;
      return Promise.resolve();
    }

    const icons = SYMBOLS.map((s) => s.icon);
    const start = now();
    let lastStep = -1;

    return new Promise((resolve) => {
      function frame() {
        const t = now() - start;
        const p = Math.min(1, t / durationMs);
        const eased = 1 - Math.pow(1 - p, 3);
        const steps = Math.floor(eased * 28);
        if (steps !== lastStep) {
          lastStep = steps;
          const icon = icons[Math.floor(Math.random() * icons.length)];
          el.textContent = icon;
          el.style.transform = `translateY(${(1 - eased) * -6}px)`;
          el.style.filter = `blur(${Math.max(0, (1 - eased) * 1.8)}px)`;
          el.style.opacity = String(0.9 + eased * 0.1);
          if (tickFn) tickFn(steps);
        }
        if (p < 1) requestAnimationFrame(frame);
        else {
          el.textContent = finalSymbol;
          el.style.transform = "";
          el.style.filter = "";
          el.style.opacity = "";
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });
  }

  function prefersReducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function showBanner(text, ttlMs = 1350) {
    fxBanner.hidden = true;
    fxBanner.textContent = text;
    window.clearTimeout(showBanner._t);
    requestAnimationFrame(() => {
      fxBanner.hidden = false;
    });
    showBanner._t = window.setTimeout(() => {
      fxBanner.hidden = true;
      fxBanner.textContent = "";
    }, ttlMs);
  }
  showBanner._t = 0;

  function spawnFireworks({ bursts, countPerBurst }) {
    if (prefersReducedMotion()) return;

    const machine = app.querySelector(".machine");
    const rect = machine ? machine.getBoundingClientRect() : null;
    const baseX = rect ? rect.left + rect.width * 0.5 : window.innerWidth * 0.5;
    const baseY = rect ? rect.top + rect.height * 0.44 : window.innerHeight * 0.55;

    for (let b = 0; b < bursts; b++) {
      const originX = baseX + (Math.random() - 0.5) * 160;
      const originY = baseY + (Math.random() - 0.5) * 80;
      const hueA = 175 + Math.random() * 35;
      const hueB = 290 + Math.random() * 40;
      for (let i = 0; i < countPerBurst; i++) {
        const p = document.createElement("span");
        p.className = "particle";

        const angle = Math.random() * Math.PI * 2;
        const dist = 120 + Math.random() * 240;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist - (70 + Math.random() * 140);

        const sz = 7 + Math.random() * 8;
        const dur = 840 + Math.random() * 520;
        const del = Math.random() * 120 + b * 120;

        p.style.setProperty("--x0", `${originX}px`);
        p.style.setProperty("--y0", `${originY}px`);
        p.style.setProperty("--dx", `${dx.toFixed(1)}px`);
        p.style.setProperty("--dy", `${dy.toFixed(1)}px`);
        p.style.setProperty("--sz", `${sz.toFixed(1)}px`);
        p.style.setProperty("--dur", `${dur.toFixed(0)}ms`);
        p.style.setProperty("--del", `${del.toFixed(0)}ms`);
        p.style.setProperty("--h", `${(hueA + Math.random() * 20).toFixed(0)}`);
        p.style.setProperty("--h2", `${(hueB + Math.random() * 20).toFixed(0)}`);

        fxLayer.append(p);
        p.addEventListener(
          "animationend",
          () => {
            p.remove();
          },
          { once: true }
        );
      }
    }
  }

  async function doSpin() {
    const bet = state.bet;
    const cost = spinCost(bet);
    if (spinning) return;
    if (state.balance < cost) {
      toast(toastNode, "Insufficient tokens. Please consult your nearest venture capitalist.");
      return;
    }

    spinning = true;
    state.balance -= cost;
    state.lastDelta = -cost;
    state.stats.spins += 1;

    if (!state.perks.turboUnlocked) state.settings.turbo = false;

    const luck = state.perks.luckSpins > 0;
    if (luck) state.perks.luckSpins = Math.max(0, state.perks.luckSpins - 1);

    const shield = state.perks.shieldSpins > 0;
    const roll = rollReels({ luck, shield });
    const target = roll.reels;
    if (roll.shieldUsed) state.perks.shieldSpins = Math.max(0, state.perks.shieldSpins - 1);

    state.lastResult.reels = target.slice();
    saveState(state);
    updateUI();

    app.dataset.outcome = "spinning";
    app.classList.add("spin-glow");

    if (state.settings.sound) {
      audio ||= createAudio();
      if (audio) {
        audio.setVolume(state.settings.volume);
        await audio.ensureUnlocked();
      }
    }

    if (state.settings.haptics) vibrate([18]);

    const speed = state.settings.turbo ? 0.66 : 1;
    const d0 = Math.max(480, Math.round(820 * speed));
    const d1 = Math.max(560, Math.round(1060 * speed));
    const d2 = Math.max(640, Math.round(1320 * speed));

    const ticksEnabled = state.settings.sound && state.settings.ticks && audio;
    await Promise.all([
      animateReel(reelWindows[0], target[0], d0, ticksEnabled ? (i) => audio.spinTick(i % 4) : null),
      animateReel(reelWindows[1], target[1], d1, ticksEnabled ? (i) => audio.spinTick((i + 1) % 4) : null),
      animateReel(reelWindows[2], target[2], d2, ticksEnabled ? (i) => audio.spinTick((i + 2) % 4) : null)
    ]);

    const payout = computePayout(target, bet);
    const won = bet * payout.mult;

    if (payout.kind === "outage") state.stats.outages += 1;
    if (won > 0) {
      state.stats.wins += 1;
      if (payout.mult >= 10) state.stats.bigWins += 1;
    }

    state.balance += won;
    state.lastDelta = won - cost;

    const headline =
      won > 0
        ? `You won ${won} TOK (×${payout.mult}).`
        : payout.kind === "outage"
          ? "💥 Model outage. Your tokens are safe (on someone else’s balance sheet)."
          : "No tokens returned. Prompt again with more adjectives.";
    const detail =
      payout.kind === "triple"
        ? payout.message
        : payout.kind === "double"
          ? payout.message
          : payout.kind === "outage"
            ? payout.message
            : "Suggested fix: increase budget, decrease expectations.";

    setResultText(headline, detail);

    const outcome =
      payout.kind === "outage"
        ? "outage"
        : won > 0 && payout.mult >= 25
          ? "jackpot"
          : won > 0
            ? "win"
            : "lose";
    app.dataset.outcome = outcome;

    if (state.settings.sound && audio) {
      if (won > 0) audio.winJingle(payout.mult);
      else audio.loseThud();
    }
    if (state.settings.haptics) {
      if (outcome === "jackpot") vibrate([20, 60, 20, 90, 20, 130, 20]);
      else if (won > 0 && payout.mult >= 10) vibrate([16, 50, 16, 70, 16]);
      else if (won > 0) vibrate([12, 36, 12]);
      else vibrate([30]);
    }
    if (state.settings.speech) speak(won > 0 ? headline : "Outcome inconclusive. Please retry.");

    if (won > 0) {
      if (outcome === "jackpot") {
        showBanner(`JACKPOT ×${payout.mult}`);
        spawnFireworks({ bursts: 5, countPerBurst: 28 });
      } else if (payout.mult >= 10) {
        showBanner(`BIG WIN ×${payout.mult}`);
        spawnFireworks({ bursts: 3, countPerBurst: 18 });
      } else if (payout.mult >= 6) {
        spawnFireworks({ bursts: 2, countPerBurst: 14 });
      } else {
        spawnFireworks({ bursts: 1, countPerBurst: 12 });
      }
    } else if (outcome === "outage") {
      showBanner("MODEL OUTAGE");
    }

    saveState(state);
    updateUI();

    app.classList.remove("spin-glow");
    spinning = false;
    updateUI();
  }

  function refill() {
    if (spinning) return;
    const bailout = 80;
    state.balance += bailout;
    state.lastDelta = bailout;
    setResultText(
      "Bailout approved.",
      "You received a one-time token injection (no questions asked, no answers given)."
    );
    toast(toastNode, `+${bailout} TOK added. Future-you will pay for this.`);
    saveState(state);
    updateUI();
  }

  function resetAll() {
    if (spinning) return;
    const ok = confirm("Factory reset? This clears tokens + stats (but not your memories).");
    if (!ok) return;
    state = structuredClone(DEFAULT_STATE);
    saveState(state);
    setResultText("Reset complete.", "All metrics cleared. Your model is now “freshly trained” (zero data).");
    toast(toastNode, "State cleared.");
    updateUI();
  }

  async function shareResults() {
    const text = `Token Slots — Balance: ${state.balance} TOK. Last: ${formatSigned(state.lastDelta)} TOK. Reels: ${state.lastResult.reels.join(" ")}.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Token Slots", text });
        toast(toastNode, "Shared.");
        return;
      } catch {
        // fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast(toastNode, "Copied share text.");
    } catch {
      toast(toastNode, text);
    }
  }

  async function copyState() {
    const blob = JSON.stringify(state, null, 2);
    try {
      await navigator.clipboard.writeText(blob);
      toast(toastNode, "State JSON copied.");
    } catch {
      toast(toastNode, "Clipboard blocked. Your browser is practicing “privacy”.");
    }
  }

  elBet.addEventListener("input", () => {
    state.bet = clampInt(elBet.value, 1, 250, DEFAULT_STATE.bet);
    saveState(state);
    updateUI();
  });

  elBetNumber.addEventListener("input", () => {
    state.bet = clampInt(elBetNumber.value, 1, 250, DEFAULT_STATE.bet);
    saveState(state);
    updateUI();
  });

  soundToggle.addEventListener("change", () => {
    state.settings.sound = Boolean(soundToggle.checked);
    playClick();
    if (state.settings.sound) void ensureAudio();
    saveState(state);
    updateUI();
  });

  volumeRange.addEventListener("input", () => {
    state.settings.volume = clampInt(volumeRange.value, 0, 100, DEFAULT_STATE.settings.volume);
    if (audio) audio.setVolume(state.settings.volume);
    saveState(state);
    updateUI();
  });

  ticksToggle.addEventListener("change", () => {
    state.settings.ticks = Boolean(ticksToggle.checked);
    playClick();
    saveState(state);
    updateUI();
  });

  hapticsToggle.addEventListener("change", () => {
    state.settings.haptics = Boolean(hapticsToggle.checked);
    saveState(state);
    updateUI();
  });
  speechToggle.addEventListener("change", () => {
    state.settings.speech = Boolean(speechToggle.checked);
    playClick();
    saveState(state);
    updateUI();
  });

  turboToggle.addEventListener("change", () => {
    if (!state.perks.turboUnlocked) {
      turboToggle.checked = false;
      toast(toastNode, "Turbo is locked. Consider visiting the shop.");
      return;
    }
    state.settings.turbo = Boolean(turboToggle.checked);
    playClick();
    saveState(state);
    updateUI();
  });

  btnBuyLuck.addEventListener("click", buyLuck);
  btnBuyShield.addEventListener("click", buyShield);
  btnBuyTurbo.addEventListener("click", buyTurbo);

  btnSpin.addEventListener("click", () => {
    playClick();
    void doSpin();
  });
  btnRefill.addEventListener("click", () => {
    playClick();
    refill();
  });
  btnReset.addEventListener("click", () => {
    playClick();
    resetAll();
  });
  btnShare.addEventListener("click", () => {
    playClick();
    void shareResults();
  });
  btnCopy.addEventListener("click", () => {
    playClick();
    void copyState();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") {
      const active = document.activeElement;
      if (active && (active.tagName === "BUTTON" || active.tagName === "INPUT")) return;
      e.preventDefault();
      void doSpin();
    }
  });

  if (state.lastResult.headline) setResultText(state.lastResult.headline, state.lastResult.detail);

  updateUI();
  registerServiceWorker();
})();

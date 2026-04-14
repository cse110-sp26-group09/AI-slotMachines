(() => {
  "use strict";

  const STORAGE_KEY = "ai-slotmachine:v1";

  const SYMBOLS = [
    { icon: "🪙", weight: 6, name: "Token" },
    { icon: "🤖", weight: 10, name: "Robot" },
    { icon: "🧠", weight: 10, name: "Brain" },
    { icon: "📈", weight: 10, name: "Up only" },
    { icon: "🧪", weight: 12, name: "Eval" },
    { icon: "🧵", weight: 12, name: "Prompt spaghetti" },
    { icon: "🪄", weight: 12, name: "Magic demo" },
    { icon: "🧯", weight: 14, name: "Safety patch" },
    { icon: "🔥", weight: 10, name: "GPU heat" },
    { icon: "💥", weight: 4, name: "Outage" }
  ];

  const PAYOUTS_TRIPLE = new Map([
    ["🪙", 25],
    ["🤖", 12],
    ["🧠", 10],
    ["📈", 8]
  ]);

  const DEFAULT_STATE = {
    balance: 100,
    lastDelta: 0,
    bet: 10,
    settings: { sound: true, haptics: true, speech: false },
    stats: { spins: 0, wins: 0, bigWins: 0, outages: 0 },
    lastResult: { reels: ["🤖", "🪙", "🔥"], headline: "", detail: "" }
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
      state.bet = clampInt(parsed.bet, 1, 50, DEFAULT_STATE.bet);

      if (parsed.settings && typeof parsed.settings === "object") {
        state.settings.sound = Boolean(parsed.settings.sound);
        state.settings.haptics = Boolean(parsed.settings.haptics);
        state.settings.speech = Boolean(parsed.settings.speech);
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

    function tone(freq, durationMs, type = "sine", gain = 0.06) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.value = gain;
      osc.connect(g);
      g.connect(ctx.destination);
      const t0 = ctx.currentTime;
      const t1 = t0 + durationMs / 1000;
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.start(t0);
      osc.stop(t1);
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
    }

    function loseThud() {
      tone(140, 190, "sawtooth", 0.06);
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

    return { ensureUnlocked, spinTick, winJingle, loseThud };
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

  const app = document.querySelector('[data-js="app"]');
  if (!app) return;

  const elBalance = qs(app, '[data-js="balance"]');
  const elDelta = qs(app, '[data-js="delta"]');
  const elBet = qs(app, '[data-js="bet"]');
  const elBetLabel = qs(app, '[data-js="betLabel"]');
  const elSpinCostLabel = qs(app, '[data-js="spinCostLabel"]');
  const btnSpin = qs(app, '[data-js="spin"]');
  const btnRefill = qs(app, '[data-js="refill"]');
  const btnReset = qs(app, '[data-js="reset"]');
  const elHeadline = qs(app, '[data-js="headline"]');
  const elDetail = qs(app, '[data-js="detail"]');
  const toastNode = qs(app, '[data-js="toast"]');
  const reelWindows = Array.from(app.querySelectorAll('[data-js="reelWindow"]'));
  const soundToggle = qs(app, '[data-js="sound"]');
  const hapticsToggle = qs(app, '[data-js="haptics"]');
  const speechToggle = qs(app, '[data-js="speech"]');

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

  function updateUI() {
    elBalance.textContent = String(state.balance);
    elDelta.textContent = state.lastDelta === 0 ? "—" : formatSigned(state.lastDelta);
    elDelta.style.color = state.lastDelta > 0 ? "var(--good)" : state.lastDelta < 0 ? "var(--bad)" : "var(--muted)";

    elBet.value = String(state.bet);
    elBetLabel.textContent = String(state.bet);
    elSpinCostLabel.textContent = String(spinCost(state.bet));

    soundToggle.checked = state.settings.sound;
    hapticsToggle.checked = state.settings.haptics;
    speechToggle.checked = state.settings.speech;

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
  }

  function computePayout(reels, bet) {
    const [a, b, c] = reels;
    if (reels.includes("💥")) {
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

  function randomReels() {
    return [weightedPick(SYMBOLS).icon, weightedPick(SYMBOLS).icon, weightedPick(SYMBOLS).icon];
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

    const target = randomReels();
    state.lastResult.reels = target.slice();
    saveState(state);
    updateUI();

    app.classList.add("spin-glow");

    if (state.settings.sound) {
      audio ||= createAudio();
      if (audio) await audio.ensureUnlocked();
    }

    if (state.settings.haptics) vibrate([18]);

    const ticksEnabled = state.settings.sound && audio;
    await Promise.all([
      animateReel(reelWindows[0], target[0], 820, ticksEnabled ? (i) => audio.spinTick(i % 4) : null),
      animateReel(reelWindows[1], target[1], 1060, ticksEnabled ? (i) => audio.spinTick((i + 1) % 4) : null),
      animateReel(reelWindows[2], target[2], 1320, ticksEnabled ? (i) => audio.spinTick((i + 2) % 4) : null)
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

    if (state.settings.sound && audio) {
      if (won > 0) audio.winJingle(payout.mult);
      else audio.loseThud();
    }
    if (state.settings.haptics) vibrate(won > 0 ? [12, 40, 12, 60] : [30]);
    if (state.settings.speech) speak(won > 0 ? headline : "Outcome inconclusive. Please retry.");

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
    state.bet = clampInt(elBet.value, 1, 50, DEFAULT_STATE.bet);
    saveState(state);
    updateUI();
  });

  soundToggle.addEventListener("change", () => {
    state.settings.sound = Boolean(soundToggle.checked);
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
    saveState(state);
    updateUI();
  });

  btnSpin.addEventListener("click", () => void doSpin());
  btnRefill.addEventListener("click", refill);
  btnReset.addEventListener("click", resetAll);
  btnShare.addEventListener("click", () => void shareResults());
  btnCopy.addEventListener("click", () => void copyState());

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


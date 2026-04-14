/* eslint-disable no-alert */
(() => {
  const STORAGE_KEY = "token-fortune:v1";

  const el = {
    balance: document.getElementById("balance"),
    betText: document.getElementById("betText"),
    taxText: document.getElementById("taxText"),
    lastSpin: document.getElementById("lastSpin"),
    statusline: document.getElementById("statusline"),
    logbox: document.getElementById("logbox"),
    reels: [document.getElementById("reel0"), document.getElementById("reel1"), document.getElementById("reel2")],
    reelWraps: Array.from(document.querySelectorAll(".reel")),

    betRange: document.getElementById("betRange"),
    spinBtn: document.getElementById("spinBtn"),
    fundBtn: document.getElementById("fundBtn"),
    resetBtn: document.getElementById("resetBtn"),
    shareBtn: document.getElementById("shareBtn"),
    soundToggle: document.getElementById("soundToggle"),
    hapticsToggle: document.getElementById("hapticsToggle"),
    autoSpinToggle: document.getElementById("autoSpinToggle"),
  };

  const symbols = [
    { key: "bot", glyph: "🤖", weight: 12, flavor: "Chatty assistant" },
    { key: "token", glyph: "🪙", weight: 10, flavor: "Tokens" },
    { key: "gpu", glyph: "🖥️", weight: 8, flavor: "GPU time" },
    { key: "brain", glyph: "🧠", weight: 7, flavor: "Reasoning" },
    { key: "sparkle", glyph: "✨", weight: 9, flavor: "Perfect prompt" },
    { key: "lab", glyph: "🧪", weight: 7, flavor: "Fine-tune" },
    { key: "fire", glyph: "🔥", weight: 6, flavor: "Viral demo" },
    { key: "paper", glyph: "📄", weight: 6, flavor: "Benchmark" },
    { key: "chart", glyph: "📈", weight: 6, flavor: "Hype curve" },
    { key: "mask", glyph: "🎭", weight: 5, flavor: "Hallucination" },
    { key: "bolt", glyph: "⚡️", weight: 6, flavor: "Latency spike" },
  ];

  const payoutRules = [
    { triple: "brain", mult: 12, kind: "good", line: "Big Brain Energy™. Still… somehow overfit." },
    { triple: "gpu", mult: 10, kind: "good", line: "Congrats on your GPU. Please enter your credit card." },
    { triple: "token", mult: 8, kind: "good", line: "Tokens printed. The economy is now a prompt." },
    { triple: "lab", mult: 6, kind: "good", line: "Fine-tune complete. It learned sarcasm and tax law." },
    { triple: "sparkle", mult: 5, kind: "good", line: "A perfect prompt. Frame it. You’ll never do it again." },
    { triple: "mask", mult: 0, kind: "bad", line: "Hallucination: extremely confident, incredibly incorrect." },
  ];

  const quips = {
    spin: [
      "Sampling… temperature: spicy.",
      "Allocating GPUs… (your balance just flinched).",
      "Reranking outcomes with a proprietary vibe-check.",
      "Compressing your hopes into 3 emojis.",
      "Calling the 'reasoning' endpoint (it’s just vibes).",
      "Running evals… (we ignored them).",
    ],
    win: [
      "You win tokens! Please do not use them on actual problems.",
      "Output: plausible. Your confidence: excessive.",
      "Marketing calls this 'a breakthrough'. Accounting calls it 'a line item'.",
      "This win is sponsored by selection bias.",
      "Congrats! Your prompt is now considered a 'moat'.",
    ],
    lose: [
      "Model says: 'It depends.' (and so does your balance).",
      "We detected user error. (User: you.)",
      "Try adding 'please' and 'step-by-step'.",
      "Your request was routed to /dev/null for safety.",
      "No win. But you did generate a lot of 'engagement'.",
    ],
    broke: [
      "You’re out of tokens. Consider raising a seed round (of excuses).",
      "Balance: 0. Alignment: also 0.",
      "No tokens left. The model has achieved cost efficiency (for itself).",
    ],
    funding: [
      "Raised seed: investors bought the story. You bought the tokens.",
      "Term sheet signed. Your dignity is now vesting over 48 months.",
      "Congrats on funding! The KPI is now 'spins per minute'.",
    ],
  };

  const defaultState = {
    balance: 1000,
    bet: 25,
    sound: true,
    haptics: true,
    autoSpin: false,
    lastSymbols: ["🤖", "🪙", "⚡️"],
  };

  let state = loadState();
  let isSpinning = false;
  let autoSpinTimer = null;

  // Audio (Web Audio API)
  let audioCtx = null;
  function ensureAudio() {
    if (!state.sound) return null;
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function beep({ freq = 440, duration = 0.055, type = "sine", gain = 0.04 } = {}) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.value = gain;
    osc.connect(amp);
    amp.connect(ctx.destination);
    const t0 = ctx.currentTime;
    osc.start(t0);
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.stop(t0 + duration);
  }

  function chord(kind) {
    const ctx = ensureAudio();
    if (!ctx) return;
    if (kind === "win") {
      beep({ freq: 523.25, duration: 0.08, type: "triangle", gain: 0.05 });
      setTimeout(() => beep({ freq: 659.25, duration: 0.09, type: "triangle", gain: 0.05 }), 40);
      setTimeout(() => beep({ freq: 783.99, duration: 0.1, type: "triangle", gain: 0.05 }), 80);
      return;
    }
    // lose
    beep({ freq: 220, duration: 0.1, type: "sawtooth", gain: 0.03 });
    setTimeout(() => beep({ freq: 196, duration: 0.12, type: "sawtooth", gain: 0.03 }), 60);
  }

  function haptic(pattern) {
    if (!state.haptics) return;
    if (!("vibrate" in navigator)) return;
    navigator.vibrate(pattern);
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function pickWeighted(items) {
    const total = items.reduce((sum, it) => sum + it.weight, 0);
    let r = Math.random() * total;
    for (const it of items) {
      r -= it.weight;
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  function formatInt(n) {
    return Math.floor(n).toLocaleString();
  }

  function nowTs() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function rand(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function logLine(text, kind = "neutral") {
    const div = document.createElement("div");
    div.className = `logline ${kind === "neutral" ? "" : kind}`.trim();
    const ts = document.createElement("span");
    ts.className = "ts";
    ts.textContent = `[${nowTs()}]`;
    const msg = document.createElement("span");
    msg.textContent = ` ${text}`;
    div.appendChild(ts);
    div.appendChild(msg);
    el.logbox.prepend(div);
    // Keep log size reasonable
    const max = 60;
    while (el.logbox.children.length > max) el.logbox.removeChild(el.logbox.lastChild);
  }

  function setStatus(text, kind = "neutral") {
    el.statusline.textContent = text;
    el.statusline.classList.remove("good", "bad");
    if (kind === "good") el.statusline.classList.add("good");
    if (kind === "bad") el.statusline.classList.add("bad");
  }

  function computeTax(bet) {
    // A tiny satirical house edge: prompt tax is 7% of bet, min 1 token, max 25 tokens.
    return clamp(Math.ceil(bet * 0.07), 1, 25);
  }

  function evaluate(symbolKeys, bet) {
    const [a, b, c] = symbolKeys;
    const anyTriple = a === b && b === c;
    const anyTwo = a === b || b === c || a === c;

    if (anyTriple) {
      const special = payoutRules.find((r) => r.triple === a);
      if (special) return { mult: special.mult, kind: special.kind, line: special.line, name: "triple-special" };
      return { mult: 3, kind: "good", line: "Triple synergy! The deck slide writes itself.", name: "triple" };
    }

    if (anyTwo) {
      return { mult: 2, kind: "good", line: "Two of a kind. Output is 'mostly correct' (with footnotes).", name: "pair" };
    }

    return { mult: 0, kind: "bad", line: "No match. The model suggests: 'try again but louder'.", name: "none" };
  }

  function render() {
    const tax = computeTax(state.bet);
    el.balance.textContent = formatInt(state.balance);
    el.betText.textContent = formatInt(state.bet);
    el.taxText.textContent = formatInt(tax);
    el.betRange.value = String(state.bet);
    el.soundToggle.checked = state.sound;
    el.hapticsToggle.checked = state.haptics;
    el.autoSpinToggle.checked = state.autoSpin;
    el.lastSpin.textContent = state.lastSymbols.join(" ");
    saveState();
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore; app still works.
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...defaultState };
      const parsed = JSON.parse(raw);
      return { ...defaultState, ...parsed };
    } catch {
      return { ...defaultState };
    }
  }

  async function animateReel(reelIdx, finalGlyph, durationMs) {
    const wrap = el.reelWraps[reelIdx];
    wrap.classList.add("is-spinning");
    const face = el.reels[reelIdx];
    const start = performance.now();
    let lastTick = 0;

    return new Promise((resolve) => {
      const step = (t) => {
        const elapsed = t - start;
        const done = elapsed >= durationMs;
        const interval = 42 + reelIdx * 7;
        if (t - lastTick > interval && !done) {
          lastTick = t;
          const s = pickWeighted(symbols);
          face.textContent = s.glyph;
          if (state.sound) beep({ freq: 520 + reelIdx * 60, duration: 0.03, type: "square", gain: 0.018 });
          haptic(8);
        }
        if (!done) {
          requestAnimationFrame(step);
          return;
        }
        face.textContent = finalGlyph;
        wrap.classList.remove("is-spinning");
        resolve();
      };
      requestAnimationFrame(step);
    });
  }

  function setButtonsDisabled(disabled) {
    el.spinBtn.disabled = disabled;
    el.fundBtn.disabled = disabled;
    el.betRange.disabled = disabled;
  }

  async function spinOnce() {
    if (isSpinning) return;
    isSpinning = true;
    setButtonsDisabled(true);

    const bet = clamp(Number(el.betRange.value), 1, 250);
    state.bet = bet;

    const tax = computeTax(bet);
    const cost = bet + tax;

    if (state.balance < cost) {
      setStatus(rand(quips.broke), "bad");
      logLine(`Insufficient tokens for bet ${bet} + tax ${tax}.`, "bad");
      chord("lose");
      haptic([40, 30, 40]);
      isSpinning = false;
      setButtonsDisabled(false);
      render();
      return;
    }

    // Consume tokens first: "payment before inference"
    state.balance -= cost;
    setStatus(rand(quips.spin), "neutral");
    logLine(`Charged ${formatInt(cost)} tokens (${formatInt(bet)} bet + ${formatInt(tax)} prompt tax).`, "neutral");
    render();

    // Decide final outcomes. (Not cryptographically fair — very on-brand.)
    const s0 = pickWeighted(symbols);
    const s1 = pickWeighted(symbols);
    const s2 = pickWeighted(symbols);
    const keys = [s0.key, s1.key, s2.key];
    const glyphs = [s0.glyph, s1.glyph, s2.glyph];

    // Stagger stopping times for drama.
    const base = 820;
    const d0 = base + Math.random() * 260;
    const d1 = base + 220 + Math.random() * 280;
    const d2 = base + 440 + Math.random() * 310;

    await Promise.all([
      animateReel(0, glyphs[0], d0),
      animateReel(1, glyphs[1], d1),
      animateReel(2, glyphs[2], d2),
    ]);

    const outcome = evaluate(keys, bet);
    const payout = Math.floor(bet * outcome.mult);

    state.lastSymbols = glyphs;
    el.lastSpin.textContent = glyphs.join(" ");

    if (payout > 0) {
      state.balance += payout;
      setStatus(`${glyphs.join(" ")} → +${formatInt(payout)} tokens (×${outcome.mult})`, "good");
      logLine(`${outcome.line} (+${formatInt(payout)} tokens)`, "good");
      logLine(rand(quips.win), "good");
      chord("win");
      haptic([20, 30, 20, 30, 50]);
    } else {
      setStatus(`${glyphs.join(" ")} → +0 tokens`, "bad");
      logLine(outcome.line, "bad");
      logLine(rand(quips.lose), "bad");
      chord("lose");
      haptic([30, 40, 30]);
    }

    render();
    isSpinning = false;
    setButtonsDisabled(false);
  }

  function fund() {
    // Satirical "funding": adds tokens, but scales with how broke you are.
    const base = 400;
    const bailout = state.balance < 250 ? 700 : 0;
    const amount = base + bailout + Math.floor(Math.random() * 220);
    state.balance += amount;
    render();
    setStatus(`Seed round closed → +${formatInt(amount)} tokens`, "good");
    logLine(rand(quips.funding), "good");
    logLine(`Cap table updated. Your balance is not financial advice. (+${formatInt(amount)} tokens)`, "neutral");
    chord("win");
    haptic([10, 20, 10]);
  }

  function resetAll() {
    const ok = confirm("Reset balance + settings? This wipes local storage for Token Fortune.");
    if (!ok) return;
    state = { ...defaultState };
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    el.logbox.innerHTML = "";
    setStatus("Reset complete. Fresh tokens, fresh delusions.", "neutral");
    logLine("System: state reset.", "neutral");
    render();
  }

  async function share() {
    const text = `I just spun ${state.lastSymbols.join(" ")} in Token Fortune and have ${formatInt(
      state.balance,
    )} tokens left. Alignment sold separately.`;
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied a share message to clipboard.", "good");
      logLine("Copied share text to clipboard.", "neutral");
      haptic(12);
      return;
    } catch {
      // Fallback prompt if clipboard is blocked.
      prompt("Copy this:", text);
    }
  }

  function setAutoSpin(enabled) {
    state.autoSpin = enabled;
    render();
    if (autoSpinTimer) {
      clearInterval(autoSpinTimer);
      autoSpinTimer = null;
    }
    if (!enabled) return;
    autoSpinTimer = setInterval(() => {
      if (document.hidden) return;
      if (isSpinning) return;
      spinOnce();
    }, 1500);
  }

  function attachEvents() {
    el.betRange.addEventListener("input", () => {
      state.bet = clamp(Number(el.betRange.value), 1, 250);
      render();
    });

    el.spinBtn.addEventListener("click", async () => {
      // unlock audio on gesture
      const ctx = ensureAudio();
      if (ctx && ctx.state === "suspended") await ctx.resume();
      spinOnce();
    });

    el.fundBtn.addEventListener("click", async () => {
      const ctx = ensureAudio();
      if (ctx && ctx.state === "suspended") await ctx.resume();
      fund();
    });

    el.resetBtn.addEventListener("click", resetAll);
    el.shareBtn.addEventListener("click", share);

    el.soundToggle.addEventListener("change", () => {
      state.sound = el.soundToggle.checked;
      render();
      setStatus(state.sound ? "Sound enabled." : "Sound disabled.", "neutral");
    });

    el.hapticsToggle.addEventListener("change", () => {
      state.haptics = el.hapticsToggle.checked;
      render();
      setStatus(state.haptics ? "Haptics enabled." : "Haptics disabled.", "neutral");
    });

    el.autoSpinToggle.addEventListener("change", () => {
      setAutoSpin(el.autoSpinToggle.checked);
      setStatus(state.autoSpin ? "Auto-spin enabled (good luck)." : "Auto-spin disabled.", "neutral");
    });

    // Keyboard controls
    window.addEventListener("keydown", (e) => {
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        spinOnce();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = clamp(state.bet + 1, 1, 250);
        state.bet = next;
        el.betRange.value = String(next);
        render();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = clamp(state.bet - 1, 1, 250);
        state.bet = next;
        el.betRange.value = String(next);
        render();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && autoSpinTimer) {
        setStatus("Paused (tab hidden). Even the model needs a break.", "neutral");
      }
    });
  }

  function installServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        // ignore; app still works online.
      });
    });
  }

  function boot() {
    attachEvents();
    installServiceWorker();
    render();

    setStatus("Ready. Spin to spend tokens on vibes.", "neutral");
    logLine("System: boot complete.", "neutral");
    logLine("Tip: Space to spin. ↑/↓ adjusts bet.", "neutral");
    if (!("vibrate" in navigator)) {
      logLine("Haptics: not supported on this device/browser.", "neutral");
    }
    if (!("clipboard" in navigator)) {
      logLine("Clipboard: not supported; share falls back to a prompt.", "neutral");
    }
  }

  boot();
})();


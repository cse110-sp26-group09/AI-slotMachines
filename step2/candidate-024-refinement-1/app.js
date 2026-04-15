/* eslint-disable no-alert */
(() => {
  const STORAGE_KEY = "token-fortune:v2";

  const el = {
    app: document.getElementById("app"),
    fxCanvas: document.getElementById("fxCanvas"),

    balance: document.getElementById("balance"),
    betText: document.getElementById("betText"),
    taxText: document.getElementById("taxText"),
    lastSpin: document.getElementById("lastSpin"),
    statusline: document.getElementById("statusline"),
    logbox: document.getElementById("logbox"),

    reels: [document.getElementById("reel0"), document.getElementById("reel1"), document.getElementById("reel2")],
    reelWraps: Array.from(document.querySelectorAll(".reel")),
    machine: document.querySelector(".machine"),
    winBanner: document.getElementById("winBanner"),
    winTitle: document.getElementById("winTitle"),
    winSub: document.getElementById("winSub"),
    luckPill: document.getElementById("luckPill"),

    betRange: document.getElementById("betRange"),
    betNumber: document.getElementById("betNumber"),
    chipButtons: Array.from(document.querySelectorAll(".chip")),

    spinBtn: document.getElementById("spinBtn"),
    fundBtn: document.getElementById("fundBtn"),
    resetBtn: document.getElementById("resetBtn"),
    shareBtn: document.getElementById("shareBtn"),
    shopBtn: document.getElementById("shopBtn"),
    settingsBtn: document.getElementById("settingsBtn"),

    settingsDialog: document.getElementById("settingsDialog"),
    shopDialog: document.getElementById("shopDialog"),
    shopGrid: document.getElementById("shopGrid"),

    soundToggle: document.getElementById("soundToggle"),
    hapticsToggle: document.getElementById("hapticsToggle"),
    volumeRange: document.getElementById("volumeRange"),
    reelTicksToggle: document.getElementById("reelTicksToggle"),
    reduceFlashToggle: document.getElementById("reduceFlashToggle"),
    testSoundBtn: document.getElementById("testSoundBtn"),
  };

  const symbols = [
    { key: "brain", glyph: "🧠", weight: 7, flavor: "Reasoning" },
    { key: "gpu", glyph: "🖥️", weight: 8, flavor: "GPU time" },
    { key: "token", glyph: "🪙", weight: 10, flavor: "Tokens" },
    { key: "sparkle", glyph: "✨", weight: 9, flavor: "Perfect prompt" },
    { key: "lab", glyph: "🧪", weight: 7, flavor: "Fine‑tune" },
    { key: "bot", glyph: "🤖", weight: 12, flavor: "Chatty assistant" },
    { key: "fire", glyph: "🔥", weight: 6, flavor: "Viral demo" },
    { key: "paper", glyph: "📄", weight: 6, flavor: "Benchmark" },
    { key: "chart", glyph: "📈", weight: 6, flavor: "Hype curve" },
    { key: "bolt", glyph: "⚡️", weight: 6, flavor: "Latency spike" },
    { key: "mask", glyph: "🎭", weight: 5, flavor: "Hallucination" },
  ];

  const payoutRules = [
    { triple: "brain", mult: 12, kind: "good", tier: "jackpot", line: "Big Brain Energy™. Still… somehow overfit." },
    { triple: "gpu", mult: 10, kind: "good", tier: "big", line: "Congrats on your GPU. Please enter your credit card." },
    { triple: "token", mult: 8, kind: "good", tier: "big", line: "Tokens printed. The economy is now a prompt." },
    { triple: "lab", mult: 6, kind: "good", tier: "big", line: "Fine‑tune complete. It learned sarcasm and tax law." },
    { triple: "sparkle", mult: 5, kind: "good", tier: "small", line: "A perfect prompt. Frame it. You’ll never do it again." },
    { triple: "mask", mult: 0, kind: "bad", tier: "bust", line: "Hallucination: extremely confident, incredibly incorrect." },
  ];

  const quips = {
    spin: [
      "Sampling… temperature: spicy.",
      "Allocating GPUs… (your balance just flinched).",
      "Reranking outcomes with a proprietary vibe‑check.",
      "Compressing your hopes into 3 emojis.",
      "Calling the “reasoning” endpoint (it’s just vibes).",
      "Running evals… (we ignored them).",
      "Tokenizing your soul. Output length: variable.",
    ],
    win: [
      "You win tokens! Please do not use them on actual problems.",
      "Output: plausible. Your confidence: excessive.",
      "Marketing calls this “a breakthrough”. Accounting calls it “a line item”.",
      "This win is sponsored by selection bias.",
      "Congrats! Your prompt is now considered a “moat”.",
    ],
    lose: [
      "Model says: “It depends.” (and so does your balance).",
      "We detected user error. (User: you.)",
      "Try adding “please” and “step‑by‑step”.",
      "Your request was routed to /dev/null for safety.",
      "No win. But you did generate a lot of “engagement”.",
    ],
    broke: [
      "You’re out of tokens. Consider raising a seed round (of excuses).",
      "Balance: 0. Alignment: also 0.",
      "No tokens left. The model has achieved cost efficiency (for itself).",
    ],
    funding: [
      "Raised seed: investors bought the story. You bought the tokens.",
      "Term sheet signed. Your dignity is now vesting over 48 months.",
      "Congrats on funding! The KPI is now “spins per minute”.",
    ],
    shop: [
      "Purchase complete. Your odds are now *emotionally* improved.",
      "Nice. You just bought aesthetics in a recession.",
      "Upgrade installed. Bugs reclassified as “emergent behavior”.",
    ],
  };

  const shopItems = [
    { id: "scanlines", name: "CRT Scanlines", desc: "Adds a nostalgic terminal vibe. +100% placebo.", price: 250 },
    { id: "lucky_seed", name: "Lucky Seed (20 spins)", desc: "Slightly nudges symbol weights. Absolutely scientific.", price: 400 },
    { id: "neon_glow", name: "Neon Under‑glow", desc: "Punchier glow and bolder win banner.", price: 300 },
    { id: "audit_waiver", name: "Prompt Tax Waiver (5 spins)", desc: "Temporarily reduces prompt tax. Regulators hate this.", price: 500 },
  ];

  const defaultState = {
    balance: 1000,
    bet: 25,
    sound: true,
    volume: 70,
    reelTicks: true,
    haptics: true,
    reduceFlash: false,
    lastSymbols: ["🤖", "🪙", "⚡️"],

    scanlines: false,
    neonGlow: false,
    luckSpinsLeft: 0,
    taxWaiverSpinsLeft: 0,
  };

  let state = loadState();
  let isSpinning = false;
  let holdAutoTimer = null;
  let holdActive = false;

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }
  function rand(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function formatInt(n) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
  }
  function nowTs() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
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

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }

  function setStatus(text, kind = "neutral") {
    el.statusline.textContent = text;
    el.statusline.classList.remove("good", "bad");
    if (kind === "good") el.statusline.classList.add("good");
    if (kind === "bad") el.statusline.classList.add("bad");
  }

  function logLine(text, kind = "neutral") {
    const div = document.createElement("div");
    div.className = `logline ${kind}`;
    div.innerHTML = `<span class="ts">${nowTs()}</span><span class="msg"></span>`;
    div.querySelector(".msg").textContent = text;
    el.logbox.prepend(div);
    const max = 60;
    while (el.logbox.childElementCount > max) el.logbox.lastElementChild?.remove();
  }

  function haptic(pattern) {
    if (!state.haptics) return;
    if (!("vibrate" in navigator)) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }

  let audioCtx = null;
  function ensureAudio() {
    if (!state.sound) return null;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function gainValue() {
    return clamp(state.volume, 0, 100) / 100;
  }

  function tone({ freq = 440, duration = 0.06, type = "sine", gain = 0.06 } = {}) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.value = gain * gainValue();
    osc.connect(amp);
    amp.connect(ctx.destination);
    const t0 = ctx.currentTime;
    osc.start(t0);
    amp.gain.setValueAtTime(amp.gain.value, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.stop(t0 + duration + 0.02);
  }

  function tick() {
    if (!state.reelTicks) return;
    tone({ freq: 920 + Math.random() * 120, duration: 0.03, type: "square", gain: 0.035 });
  }

  function thud() {
    tone({ freq: 120, duration: 0.08, type: "sawtooth", gain: 0.05 });
  }

  function fanfare(tier) {
    const base = tier === "jackpot" ? 880 : tier === "big" ? 660 : 520;
    const g = tier === "jackpot" ? 0.09 : tier === "big" ? 0.07 : 0.06;
    tone({ freq: base, duration: 0.09, type: "triangle", gain: g });
    setTimeout(() => tone({ freq: base * 1.25, duration: 0.09, type: "triangle", gain: g }), 80);
    setTimeout(() => tone({ freq: base * 1.5, duration: 0.11, type: "triangle", gain: g }), 160);
  }

  function cashRegister() {
    tone({ freq: 2400, duration: 0.03, type: "square", gain: 0.03 });
    setTimeout(() => tone({ freq: 1800, duration: 0.03, type: "square", gain: 0.03 }), 45);
  }

  function spinWhoosh() {
    const ctx = ensureAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(720, ctx.currentTime + 0.22);
    amp.gain.setValueAtTime(0.0001, ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.05 * gainValue(), ctx.currentTime + 0.04);
    amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.26);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.28);
  }

  const fx = (() => {
    const canvas = el.fxCanvas;
    const ctx = canvas.getContext("2d", { alpha: true });
    const particles = [];
    let raf = null;
    const palette = ["#ff4fd8", "#00d4ff", "#42ffb0", "#ffffff", "#ff2f6e"];

    function resize() {
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn(kind, { x, y, count, power }) {
      if (state.reduceFlash) return;
      for (let i = 0; i < count; i++) {
        const a = (Math.PI * 2 * i) / count + Math.random() * (kind === "spark" ? 0.1 : 0.2);
        const sp = power * (0.7 + Math.random() * 0.9);
        particles.push({
          kind,
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - (kind === "confetti" ? power * 0.55 : 0),
          g: kind === "spark" ? 0.07 + Math.random() * 0.04 : 0.13 + Math.random() * 0.08,
          life: kind === "spark" ? 62 + Math.random() * 40 : 48 + Math.random() * 34,
          size: kind === "spark" ? 1.5 + Math.random() * 2.5 : 2 + Math.random() * 3.5,
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.3,
          color: palette[Math.floor(Math.random() * palette.length)],
        });
      }
      start();
    }

    function start() {
      if (raf) return;
      raf = requestAnimationFrame(loop);
    }

    function loop() {
      raf = null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= 1;
        p.vy += p.g;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.life <= 0 || p.y > window.innerHeight + 80) {
          particles.splice(i, 1);
          continue;
        }
        const alpha = Math.max(0, Math.min(1, p.life / 80));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        if (p.kind === "spark") {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size, -p.size * 0.35, p.size * 2, p.size * 0.7);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
      if (particles.length > 0) raf = requestAnimationFrame(loop);
    }

    resize();
    window.addEventListener("resize", resize);
    return {
      confetti: (opts) => spawn("confetti", opts),
      firework: (opts) => spawn("spark", opts),
    };
  })();

  function luckBoost() {
    return state.luckSpinsLeft > 0 ? 0.12 : 0;
  }

  function weightedPick() {
    const boost = luckBoost();
    const boosted = symbols.map((s) => {
      if (boost <= 0) return s.weight;
      const premium = s.key === "brain" || s.key === "gpu" || s.key === "token" || s.key === "sparkle";
      return premium ? s.weight * (1 + boost) : s.weight * (1 - boost * 0.5);
    });
    const total = boosted.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < symbols.length; i++) {
      r -= boosted[i];
      if (r <= 0) return symbols[i];
    }
    return symbols[symbols.length - 1];
  }

  function calcPromptTax(bet) {
    const base = Math.ceil(bet * 0.12);
    const floor = 2;
    const waiver = state.taxWaiverSpinsLeft > 0 ? 0.6 : 1;
    return Math.max(floor, Math.ceil(base * waiver));
  }

  function evaluateSpin(keys) {
    const [a, b, c] = keys;
    const tripleRule = payoutRules.find((r) => r.triple === a && b === a && c === a);
    if (tripleRule) return tripleRule;
    if (a === b && b === c) return { mult: 3, kind: "good", tier: "small", line: "Synergy! (marketing approves)" };
    if (a === b || b === c || a === c) return { mult: 2, kind: "good", tier: "small", line: "“Reasonable” output (with 3 disclaimers)" };
    return { mult: 0, kind: "bad", tier: "bust", line: "No match. The model requests more data (and more tokens)." };
  }

  const reelCfg = { itemHeight: 78, repeats: 26 };

  function buildReelStrips() {
    const glyphs = symbols.map((s) => s.glyph);
    for (let r = 0; r < 3; r++) {
      const strip = el.reels[r];
      strip.textContent = "";
      const parts = [];
      for (let i = 0; i < reelCfg.repeats; i++) parts.push(glyphs[i % glyphs.length]);
      parts.push(...glyphs);
      strip.innerHTML = parts.map((g) => `<div class="sym">${g}</div>`).join("");
      strip.style.setProperty("--y", `0px`);
    }
  }

  function setReelOffset(reelIndex, stopIndex, spins) {
    const strip = el.reels[reelIndex];
    const totalItems = strip.children.length;
    const safeStop = clamp(stopIndex, 0, symbols.length - 1);
    const base = totalItems - symbols.length - 1;
    const targetItem = base + safeStop;
    const extra = spins * symbols.length;
    const item = targetItem + extra;
    const y = -(item * reelCfg.itemHeight);
    strip.style.setProperty("--y", `${y}px`);
  }

  function setButtonsDisabled(disabled) {
    el.spinBtn.disabled = disabled;
    el.fundBtn.disabled = disabled;
    el.shopBtn.disabled = disabled;
    el.settingsBtn.disabled = disabled;
  }

  function flashWinBanner({ title, sub, tier }) {
    el.winTitle.textContent = tier === "jackpot" ? "JACKPOT" : title;
    el.winSub.textContent = sub;
    el.winBanner.classList.add("show");
    setTimeout(() => el.winBanner.classList.remove("show"), tier === "jackpot" ? 1300 : 900);
  }

  function applyCosmetics() {
    document.documentElement.style.setProperty("--scanlines", state.scanlines ? "1" : "0");
    el.luckPill.hidden = !(state.luckSpinsLeft > 0);
    if (!el.luckPill.hidden) el.luckPill.textContent = `Luck: +12% (${state.luckSpinsLeft} spins)`;
    el.machine.classList.toggle("jackpot", state.neonGlow);
    document.documentElement.style.setProperty("--reduce-flash", state.reduceFlash ? "1" : "0");
  }

  function render() {
    el.balance.textContent = formatInt(state.balance);
    el.betText.textContent = formatInt(state.bet);
    el.taxText.textContent = formatInt(calcPromptTax(state.bet));
    el.lastSpin.textContent = state.lastSymbols.join(" ");

    el.betRange.value = String(state.bet);
    el.betNumber.value = String(state.bet);
    el.soundToggle.checked = state.sound;
    el.hapticsToggle.checked = state.haptics;
    el.volumeRange.value = String(state.volume);
    el.reelTicksToggle.checked = state.reelTicks;
    el.reduceFlashToggle.checked = state.reduceFlash;
    applyCosmetics();
    saveState();
  }

  function canAfford(price) {
    return state.balance >= price;
  }

  function ownText(item) {
    if (item.id === "scanlines") return state.scanlines ? "Owned" : "";
    if (item.id === "neon_glow") return state.neonGlow ? "Owned" : "";
    return "";
  }

  function renderShop() {
    el.shopGrid.textContent = "";
    for (const item of shopItems) {
      const card = document.createElement("div");
      card.className = "shop-item";
      const tag = ownText(item);
      card.innerHTML = `
        <h4>${item.name}</h4>
        <p>${item.desc}</p>
        <div class="shop-row">
          <div>
            <div class="price">${formatInt(item.price)} tokens</div>
            <div class="tag">${tag || "—"}</div>
          </div>
          <button class="primary" type="button" data-buy="${item.id}">${tag ? "Toggle" : "Buy"}</button>
        </div>
      `;
      const btn = card.querySelector("button[data-buy]");
      btn.disabled = !canAfford(item.price) && !tag;
      btn.addEventListener("click", () => buyItem(item.id));
      el.shopGrid.appendChild(card);
    }
  }

  function buyItem(id) {
    const item = shopItems.find((i) => i.id === id);
    if (!item) return;
    const already = ownText(item);
    if (!already) {
      if (!canAfford(item.price)) {
        setStatus("Insufficient tokens. Try raising seed (again).", "bad");
        thud();
        haptic(40);
        return;
      }
      state.balance -= item.price;
    }

    if (id === "scanlines") state.scanlines = !state.scanlines;
    if (id === "neon_glow") state.neonGlow = !state.neonGlow;
    if (id === "lucky_seed") state.luckSpinsLeft += 20;
    if (id === "audit_waiver") state.taxWaiverSpinsLeft += 5;

    cashRegister();
    haptic([10, 20, 10]);
    setStatus(`Shop: ${item.name} applied.`, "good");
    logLine(`Shop: bought ${item.name}.`, "good");
    logLine(rand(quips.shop), "neutral");
    renderShop();
    render();
  }

  function updateBet(next) {
    const maxBet = Math.max(1, Math.min(750, state.balance));
    state.bet = clamp(Math.floor(next || 1), 1, maxBet);
    el.betRange.max = String(maxBet);
    el.betNumber.max = String(maxBet);
    render();
  }

  async function unlockAudio() {
    const ctx = ensureAudio();
    if (ctx && ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // ignore
      }
    }
  }

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function burstFX(tier) {
    const rect = el.machine.getBoundingClientRect();
    const x = rect.left + rect.width * (0.2 + Math.random() * 0.6);
    const y = rect.top + rect.height * (0.25 + Math.random() * 0.35);
    if (tier === "jackpot") {
      fx.firework({ x, y, count: 80, power: 7.4 });
      setTimeout(() => fx.firework({ x: rect.left + rect.width * 0.3, y: rect.top + rect.height * 0.2, count: 70, power: 7.0 }), 220);
      setTimeout(() => fx.firework({ x: rect.left + rect.width * 0.7, y: rect.top + rect.height * 0.24, count: 70, power: 7.0 }), 380);
    } else if (tier === "big") {
      fx.firework({ x, y, count: 60, power: 6.6 });
      setTimeout(() => fx.confetti({ x, y, count: 34, power: 6.2 }), 140);
    } else {
      fx.confetti({ x, y, count: 26, power: 5.2 });
    }
  }

  async function spinOnce() {
    if (isSpinning) return;

    const bet = clamp(state.bet, 1, Math.max(1, state.balance));
    const tax = calcPromptTax(bet);
    const cost = bet + tax;

    if (state.balance < cost) {
      setStatus("Insufficient tokens to spin. Raise seed or lower bet.", "bad");
      logLine(rand(quips.broke), "bad");
      thud();
      haptic([25, 40, 25]);
      return;
    }

    isSpinning = true;
    setButtonsDisabled(true);
    el.app.classList.remove("shake");
    state.balance -= cost;
    if (state.luckSpinsLeft > 0) state.luckSpinsLeft -= 1;
    if (state.taxWaiverSpinsLeft > 0) state.taxWaiverSpinsLeft -= 1;
    render();

    setStatus(rand(quips.spin), "neutral");
    logLine(`Spin: −${formatInt(cost)} tokens (bet ${formatInt(bet)} + tax ${formatInt(tax)}).`, "neutral");
    spinWhoosh();

    const picks = [weightedPick(), weightedPick(), weightedPick()];
    const keys = picks.map((p) => p.key);
    const glyphs = picks.map((p) => p.glyph);

    const baseSpins = 4 + Math.floor(Math.random() * 3);
    const durations = [980, 1150, 1340];

    for (let i = 0; i < 3; i++) {
      el.reelWraps[i].classList.add("is-spinning");
      el.reels[i].style.transitionDuration = `${durations[i]}ms`;
      el.reels[i].style.transitionDelay = `${i * 70}ms`;
      setReelOffset(i, symbols.findIndex((s) => s.key === keys[i]), baseSpins + i);
    }

    const tickTimer = setInterval(() => tick(), 90);
    await wait(durations[2] + 220 + 140);
    clearInterval(tickTimer);
    for (let i = 0; i < 3; i++) {
      el.reelWraps[i].classList.remove("is-spinning");
      el.reels[i].style.transitionDelay = "0ms";
    }

    state.lastSymbols = glyphs;
    const outcome = evaluateSpin(keys);
    const payout = bet * outcome.mult;
    if (payout > 0) state.balance += payout;

    if (outcome.kind === "good" && payout > 0) {
      setStatus(`${outcome.line} (+${formatInt(payout)} tokens)`, "good");
      logLine(`Win: ${glyphs.join(" ")} → ×${outcome.mult} (+${formatInt(payout)}).`, "good");
      logLine(rand(quips.win), "neutral");
      fanfare(outcome.tier);
      haptic(outcome.tier === "jackpot" ? [30, 30, 80, 40, 120] : outcome.tier === "big" ? [20, 30, 60] : 18);
      if (outcome.tier !== "small") {
        void el.app.offsetWidth;
        el.app.classList.add("shake");
        setTimeout(() => el.app.classList.remove("shake"), 520);
      }
      flashWinBanner({ title: outcome.tier === "big" ? "BIG WIN" : "WIN", sub: `+${formatInt(payout)} tokens`, tier: outcome.tier });
      burstFX(outcome.tier);
    } else {
      setStatus(outcome.line, "bad");
      logLine(`Loss: ${glyphs.join(" ")}.`, "bad");
      logLine(rand(quips.lose), "neutral");
      thud();
      haptic([25, 40, 25]);
    }

    render();
    isSpinning = false;
    setButtonsDisabled(false);
  }

  function fund() {
    const base = 420;
    const bailout = state.balance < 250 ? 740 : 0;
    const amount = base + bailout + Math.floor(Math.random() * 220);
    state.balance += amount;
    render();
    setStatus(`Seed round closed → +${formatInt(amount)} tokens`, "good");
    logLine(rand(quips.funding), "good");
    logLine(`Cap table updated. Your balance is not financial advice. (+${formatInt(amount)} tokens)`, "neutral");
    fanfare("small");
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
    buildReelStrips();
    renderShop();
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
    } catch {
      prompt("Copy this:", text);
    }
  }

  function attachEvents() {
    el.betRange.addEventListener("input", () => updateBet(Number(el.betRange.value)));
    el.betNumber.addEventListener("input", () => updateBet(Number(el.betNumber.value)));
    el.betNumber.addEventListener("blur", () => updateBet(Number(el.betNumber.value)));

    for (const b of el.chipButtons) {
      b.addEventListener("click", () => {
        const v = b.getAttribute("data-chip");
        if (v === "max") {
          const maxBet = Math.max(1, Math.min(750, state.balance));
          updateBet(maxBet);
          return;
        }
        updateBet(state.bet + Number(v));
      });
    }

    el.spinBtn.addEventListener("click", async () => {
      await unlockAudio();
      spinOnce();
    });

    const startHold = async () => {
      if (holdActive) return;
      holdActive = true;
      await unlockAudio();
      holdAutoTimer = setInterval(() => {
        if (document.hidden) return;
        if (isSpinning) return;
        spinOnce();
      }, 1200);
      setStatus("Auto‑spin engaged (hold). Release to stop.", "neutral");
      haptic(10);
    };

    const stopHold = () => {
      holdActive = false;
      if (holdAutoTimer) clearInterval(holdAutoTimer);
      holdAutoTimer = null;
      if (!isSpinning) setStatus("Ready. Spin to spend tokens on vibes.", "neutral");
    };

    el.spinBtn.addEventListener("pointerdown", () => {
      setTimeout(() => {
        if (!holdActive && (el.spinBtn.matches(":active") || el.spinBtn.getAttribute("data-holding") === "1")) {
          startHold();
        }
      }, 520);
      el.spinBtn.setAttribute("data-holding", "1");
    });
    el.spinBtn.addEventListener("pointerup", () => {
      el.spinBtn.removeAttribute("data-holding");
      stopHold();
    });
    el.spinBtn.addEventListener("pointercancel", () => {
      el.spinBtn.removeAttribute("data-holding");
      stopHold();
    });
    el.spinBtn.addEventListener("mouseleave", () => {
      el.spinBtn.removeAttribute("data-holding");
      stopHold();
    });

    el.fundBtn.addEventListener("click", async () => {
      await unlockAudio();
      fund();
    });

    el.resetBtn.addEventListener("click", resetAll);
    el.shareBtn.addEventListener("click", share);

    el.settingsBtn.addEventListener("click", () => el.settingsDialog.showModal());
    el.shopBtn.addEventListener("click", () => {
      renderShop();
      el.shopDialog.showModal();
    });

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
    el.volumeRange.addEventListener("input", () => {
      state.volume = clamp(Number(el.volumeRange.value), 0, 100);
      render();
    });
    el.reelTicksToggle.addEventListener("change", () => {
      state.reelTicks = el.reelTicksToggle.checked;
      render();
    });
    el.reduceFlashToggle.addEventListener("change", () => {
      state.reduceFlash = el.reduceFlashToggle.checked;
      render();
    });
    el.testSoundBtn.addEventListener("click", async () => {
      await unlockAudio();
      fanfare("small");
      cashRegister();
      setStatus("Test sound played.", "good");
    });

    window.addEventListener("keydown", async (e) => {
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        await unlockAudio();
        spinOnce();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        updateBet(state.bet + 1);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        updateBet(state.bet - 1);
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (holdAutoTimer) clearInterval(holdAutoTimer);
        holdAutoTimer = null;
        holdActive = false;
      }
    });
  }

  function installServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  function boot() {
    buildReelStrips();
    attachEvents();
    installServiceWorker();
    renderShop();
    render();

    // land on last symbols
    for (let i = 0; i < 3; i++) {
      const s = symbols.find((x) => x.glyph === state.lastSymbols[i]) || symbols[0];
      setReelOffset(i, symbols.findIndex((x) => x.key === s.key), 0);
      el.reels[i].style.transitionDuration = "0ms";
      requestAnimationFrame(() => {
        el.reels[i].style.transitionDuration = "1100ms";
      });
    }

    setStatus("Ready. Spin to spend tokens on vibes.", "neutral");
    logLine("System: boot complete.", "neutral");
    logLine("Tip: Space to spin. ↑/↓ adjusts bet. Hold Spin for auto.", "neutral");
    if (!("vibrate" in navigator)) logLine("Haptics: not supported on this device/browser.", "neutral");
    if (!("clipboard" in navigator)) logLine("Clipboard: not supported; share falls back to a prompt.", "neutral");
  }

  boot();
})();

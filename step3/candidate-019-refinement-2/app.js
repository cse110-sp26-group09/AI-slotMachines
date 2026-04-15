(() => {
  "use strict";

  const els = {
    tokens: document.getElementById("tokens"),
    streak: document.getElementById("streak"),

    bet: document.getElementById("bet"),
    betNumber: document.getElementById("betNumber"),
    betValue: document.getElementById("betValue"),
    chips: Array.from(document.querySelectorAll("[data-bet]")),

    temp: document.getElementById("temp"),
    tempValue: document.getElementById("tempValue"),

    spin: document.getElementById("spin"),
    auto: document.getElementById("auto"),
    claim: document.getElementById("claim"),
    reset: document.getElementById("reset"),
    sound: document.getElementById("sound"),

    haptics: document.getElementById("haptics"),
    reducedFx: document.getElementById("reducedFx"),
    volume: document.getElementById("volume"),
    volumeValue: document.getElementById("volumeValue"),
    speed: document.getElementById("speed"),
    speedValue: document.getElementById("speedValue"),

    status: document.getElementById("status"),
    reels: [document.getElementById("reel0"), document.getElementById("reel1"), document.getElementById("reel2")],
    shop: document.getElementById("shop"),

    fx: document.getElementById("fx"),
    bigWin: document.getElementById("bigWin"),
    bigWinTitle: document.getElementById("bigWinTitle"),
    bigWinSub: document.getElementById("bigWinSub"),
  };

  const STORAGE_KEY = "aiSlots.v2";
  const DAILY_GRANT = 80;
  const START_TOKENS = 120;

  const SYMBOLS = [
    { key: "bot", face: "🤖", baseWeight: 18 },
    { key: "brain", face: "🧠", baseWeight: 14 },
    { key: "coin", face: "🪙", baseWeight: 5 },
    { key: "fire", face: "🔥", baseWeight: 8 },
    { key: "docs", face: "404", baseWeight: 6 },
    { key: "bug", face: "🐛", baseWeight: 12 },
    { key: "gpu", face: "🧩", baseWeight: 10 }, // "plug-in dependency"
    { key: "chart", face: "📈", baseWeight: 9 },
  ];

  const PAY_MULTIPLIERS = new Map([
    ["coin", 20],
    ["bot", 12],
    ["brain", 10],
    ["docs", 9],
    ["fire", 8],
  ]);

  const shopItems = [
    {
      id: "context",
      name: "Context window++",
      cost: 30,
      desc: "Next 6 spins: +25% payout (rounded).",
      apply: (s) => {
        s.buffs.payoutBoostSpins = Math.max(s.buffs.payoutBoostSpins, 6);
      },
    },
    {
      id: "gpu",
      name: "Rent a GPU minute",
      cost: 25,
      desc: "Next 5 spins: 20% chance your bet gets refunded (latency discount).",
      apply: (s) => {
        s.buffs.refundChanceSpins = Math.max(s.buffs.refundChanceSpins, 5);
      },
    },
    {
      id: "review",
      name: "Pay for a human code review",
      cost: 20,
      desc: "Once: bug tax reduction on your next bug loss.",
      apply: (s) => {
        s.buffs.bugShield = Math.max(s.buffs.bugShield, 1);
      },
    },
    {
      id: "lucky",
      name: "Lucky prompt (unreproducible)",
      cost: 40,
      desc: "Next 8 spins: coins show up more often.",
      apply: (s) => {
        s.buffs.luckSpins = Math.max(s.buffs.luckSpins, 8);
      },
    },
    {
      id: "patch",
      name: "Patch Tuesday hotfix",
      cost: 35,
      desc: "Next 6 spins: bug tax is reduced by 50%.",
      apply: (s) => {
        s.buffs.bugTaxHalfSpins = Math.max(s.buffs.bugTaxHalfSpins, 6);
      },
    },
  ];

  /** @type {{tokens:number, streak:number, auto:boolean, bestWin:number, buffs:{payoutBoostSpins:number, refundChanceSpins:number, bugShield:number, luckSpins:number, bugTaxHalfSpins:number}, settings:{soundOn:boolean, volume:number, haptics:boolean, reducedFx:boolean, speed:number}, lastDailyClaimISO:string|null}} */
  let state = {
    tokens: START_TOKENS,
    streak: 0,
    auto: false,
    bestWin: 0,
    buffs: {
      payoutBoostSpins: 0,
      refundChanceSpins: 0,
      bugShield: 0,
      luckSpins: 0,
      bugTaxHalfSpins: 0,
    },
    settings: {
      soundOn: true,
      volume: 0.7,
      haptics: true,
      reducedFx: false,
      speed: 1.0,
    },
    lastDailyClaimISO: null,
  };

  let spinning = false;
  let autoTimer = null;
  let audio = null;
  let fx = null;

  function todayISO() {
    const now = new Date();
    const yyyy = String(now.getFullYear()).padStart(4, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function clampInt(value, min, max) {
    if (!Number.isFinite(value)) return min;
    const v = Math.trunc(value);
    return Math.max(min, Math.min(max, v));
  }

  function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;

      if (typeof parsed.tokens === "number") state.tokens = clampInt(parsed.tokens, 0, 999999);
      if (typeof parsed.streak === "number") state.streak = clampInt(parsed.streak, 0, 999999);
      if (typeof parsed.auto === "boolean") state.auto = parsed.auto;
      if (typeof parsed.bestWin === "number") state.bestWin = clampInt(parsed.bestWin, 0, 999999);

      if (parsed.buffs && typeof parsed.buffs === "object") {
        state.buffs.payoutBoostSpins = clampInt(parsed.buffs.payoutBoostSpins ?? 0, 0, 999);
        state.buffs.refundChanceSpins = clampInt(parsed.buffs.refundChanceSpins ?? 0, 0, 999);
        state.buffs.bugShield = clampInt(parsed.buffs.bugShield ?? 0, 0, 99);
        state.buffs.luckSpins = clampInt(parsed.buffs.luckSpins ?? 0, 0, 999);
        state.buffs.bugTaxHalfSpins = clampInt(parsed.buffs.bugTaxHalfSpins ?? 0, 0, 999);
      }

      if (parsed.settings && typeof parsed.settings === "object") {
        state.settings.soundOn = Boolean(parsed.settings.soundOn ?? true);
        state.settings.volume = clamp(Number(parsed.settings.volume ?? 0.7), 0, 1);
        state.settings.haptics = Boolean(parsed.settings.haptics ?? true);
        state.settings.reducedFx = Boolean(parsed.settings.reducedFx ?? false);
        state.settings.speed = clamp(Number(parsed.settings.speed ?? 1), 0.7, 1.35);
      }

      state.lastDailyClaimISO = typeof parsed.lastDailyClaimISO === "string" ? parsed.lastDailyClaimISO : null;
    } catch {
      // ignore
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }

  function setStatus(text, tone) {
    els.status.textContent = text;
    els.status.classList.remove("good", "bad");
    if (tone === "good") els.status.classList.add("good");
    if (tone === "bad") els.status.classList.add("bad");
  }

  function initAudio() {
    if (audio) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const master = ctx.createGain();
      master.gain.value = state.settings.volume * 0.35;
      master.connect(ctx.destination);
      audio = { ctx, master };
    } catch {
      audio = null;
    }
  }

  async function resumeAudio() {
    if (!audio) return;
    if (audio.ctx.state === "suspended") {
      try {
        await audio.ctx.resume();
      } catch {
        // ignore
      }
    }
  }

  function syncMasterGain() {
    if (!audio) return;
    audio.master.gain.value = (state.settings.soundOn ? 1 : 0) * state.settings.volume * 0.35;
  }

  function sfxOk() {
    return state.settings.soundOn && state.settings.volume > 0.001;
  }

  function beep({ type = "sine", freq = 440, ms = 80, gain = 0.35, sweepTo = null } = {}) {
    if (!audio || !sfxOk()) return;
    const { ctx, master } = audio;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(master);
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);
    if (sweepTo && Number.isFinite(sweepTo)) {
      o.frequency.setValueAtTime(freq, now);
      o.frequency.exponentialRampToValueAtTime(sweepTo, now + ms / 1000);
    }
    o.start(now);
    o.stop(now + ms / 1000 + 0.02);
  }

  function vibrate(pattern) {
    if (!state.settings.haptics) return;
    if (!("vibrate" in navigator)) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }

  function ensureReelSpan(reelEl) {
    const existing = reelEl.querySelector("span");
    if (existing) return existing;
    const span = document.createElement("span");
    span.textContent = reelEl.textContent || "🪙";
    reelEl.textContent = "";
    reelEl.appendChild(span);
    return span;
  }

  function setReelFace(reelEl, face) {
    ensureReelSpan(reelEl).textContent = face;
  }

  function temperatureAdjustedWeights(temp) {
    // temp in [0..2]. Higher temp flattens distribution (more chaos).
    const flatten = 0.45 + temp; // [0.45..2.45]
    const exp = 1 / flatten; // lower exp => flatter

    // Base weights
    const weights = SYMBOLS.map((s) => Math.pow(s.baseWeight, exp));

    // Buff: luck spins makes coins more likely (still chaotic).
    if (state.buffs.luckSpins > 0) {
      const coinIdx = SYMBOLS.findIndex((s) => s.key === "coin");
      if (coinIdx >= 0) weights[coinIdx] *= 1.65;
      const bugIdx = SYMBOLS.findIndex((s) => s.key === "bug");
      if (bugIdx >= 0) weights[bugIdx] *= 0.85;
    }

    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map((w) => w / sum);
  }

  function pickSymbol(temp) {
    const probs = temperatureAdjustedWeights(temp);
    let r = Math.random();
    for (let i = 0; i < SYMBOLS.length; i++) {
      r -= probs[i];
      if (r <= 0) return SYMBOLS[i];
    }
    return SYMBOLS[SYMBOLS.length - 1];
  }

  function betMax() {
    return clampInt(Number(els.bet.max), 1, 999);
  }

  function getBet() {
    return clampInt(Number(els.bet.value), 1, betMax());
  }

  function setBetValue(v) {
    const bet = clampInt(Number(v), 1, betMax());
    els.bet.value = String(bet);
    els.betNumber.value = String(bet);
    updateUI();
  }

  function getTemp() {
    const t = Number(els.temp.value);
    if (!Number.isFinite(t)) return 1;
    return Math.max(0, Math.min(2, t));
  }

  function spinSpeed() {
    return clamp(Number(state.settings.speed), 0.7, 1.35);
  }

  function renderShop() {
    els.shop.innerHTML = "";
    for (const item of shopItems) {
      const row = document.createElement("div");
      row.className = "shopItem";

      const left = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = item.name;
      const desc = document.createElement("p");
      desc.textContent = item.desc;
      left.appendChild(title);
      left.appendChild(desc);

      const right = document.createElement("div");
      const price = document.createElement("span");
      price.className = "price";
      price.textContent = `${item.cost} 🪙`;
      const buy = document.createElement("button");
      buy.type = "button";
      buy.textContent = "Buy";
      buy.addEventListener("click", () => {
        if (spinning) return;
        if (state.tokens < item.cost) {
          setStatus("Insufficient tokens. Try spinning or claim the daily grant.", "bad");
          initAudio();
          void resumeAudio();
          beep({ type: "sawtooth", freq: 160, ms: 90, gain: 0.24, sweepTo: 90 });
          vibrate([20, 40, 20]);
          return;
        }
        state.tokens -= item.cost;
        item.apply(state);
        save();
        updateUI();
        setStatus(`Purchased: ${item.name}. Productivity increased by vibes.`, "good");
        initAudio();
        void resumeAudio();
        beep({ type: "triangle", freq: 740, ms: 90, gain: 0.30, sweepTo: 990 });
        vibrate(12);
      });

      right.appendChild(price);
      right.appendChild(buy);

      row.appendChild(left);
      row.appendChild(right);
      els.shop.appendChild(row);
    }
  }

  function canClaimDaily() {
    const t = todayISO();
    return state.lastDailyClaimISO !== t;
  }

  function claimDaily() {
    const t = todayISO();
    if (state.lastDailyClaimISO === t) {
      setStatus("Daily grant already claimed. Come back tomorrow for more free money.", null);
      initAudio();
      void resumeAudio();
      beep({ type: "square", freq: 240, ms: 70, gain: 0.16, sweepTo: 180 });
      return;
    }
    state.lastDailyClaimISO = t;
    state.tokens += DAILY_GRANT;
    save();
    updateUI();
    setStatus(`Daily grant received: +${DAILY_GRANT} 🪙. The token printer goes brrr.`, "good");
    initAudio();
    void resumeAudio();
    beep({ type: "triangle", freq: 520, ms: 110, gain: 0.30, sweepTo: 880 });
    vibrate([10, 15, 18]);
  }

  function computePayout(symbolKeys, bet) {
    const [a, b, c] = symbolKeys;
    const counts = new Map();
    for (const k of symbolKeys) counts.set(k, (counts.get(k) ?? 0) + 1);

    const hasBug = (counts.get("bug") ?? 0) > 0;
    let payout = 0;
    let headline = "";

    const threeOfKindKey = [...counts.entries()].find(([, n]) => n === 3)?.[0] ?? null;
    const hasPair = [...counts.values()].some((n) => n === 2);

    if (threeOfKindKey && PAY_MULTIPLIERS.has(threeOfKindKey)) {
      const mult = PAY_MULTIPLIERS.get(threeOfKindKey);
      payout = bet * mult;
      headline = `JACKPOT: ${SYMBOLS.find((s) => s.key === threeOfKindKey)?.face ?? threeOfKindKey} ×${mult}`;
    } else if (a === "docs" && b === "docs" && c === "docs") {
      payout = bet * 9;
      headline = "404404404: You found the docs (they moved).";
    } else if (hasPair) {
      payout = bet * 2;
      headline = "Pair hit: That’s a valid demo result.";
    } else {
      payout = 0;
      headline = "No match: The model says “try again.”";
    }

    if (hasBug) {
      const bugTaxMult = state.buffs.bugTaxHalfSpins > 0 ? 0.5 : 1;
      const bugTax = Math.round(3 * bet * bugTaxMult);
      payout -= bugTax;
      headline = headline ? `${headline} (🐛 bug tax)` : "🐛 Bug tax: reality has entered the chat.";
    }

    // Optional “human review” shield: reduces one bug tax hit once.
    if (hasBug && state.buffs.bugShield > 0 && payout < 0) {
      const cap = Math.round(3 * bet * (state.buffs.bugTaxHalfSpins > 0 ? 0.5 : 1));
      const refund = Math.min(cap, -payout);
      payout += refund;
      state.buffs.bugShield -= 1;
    }

    // Buff: payout boost
    if (payout > 0 && state.buffs.payoutBoostSpins > 0) payout = Math.round(payout * 1.25);

    return { payout, headline };
  }

  function formatFaces(symbolKeys) {
    return symbolKeys.map((k) => SYMBOLS.find((s) => s.key === k)?.face ?? k).join(" ");
  }

  function spinReel(reelEl, finalFace, durationMs, onStop) {
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const totalMs = reduced ? Math.min(220, durationMs) : durationMs;

    reelEl.classList.add("spinning");
    reelEl.classList.remove("win", "lose", "pop");

    const intervalMs = reduced ? 60 : 46;
    const start = performance.now();

    return new Promise((resolve) => {
      const tick = () => {
        const now = performance.now();
        const t = now - start;
        if (t >= totalMs) {
          setReelFace(reelEl, finalFace);
          reelEl.classList.remove("spinning");
          reelEl.classList.add("pop");
          setTimeout(() => reelEl.classList.remove("pop"), 220);
          if (onStop) onStop();
          resolve();
          return;
        }
        setReelFace(reelEl, SYMBOLS[(Math.random() * SYMBOLS.length) | 0].face);
        setTimeout(tick, intervalMs);
      };
      tick();
    });
  }

  function winTier(payout, bet) {
    if (payout >= bet * 20) return "jackpot";
    if (payout >= bet * 12) return "mega";
    if (payout >= bet * 8) return "big";
    if (payout > 0) return "win";
    if (payout < 0) return "loss";
    return "none";
  }

  function showBigWin(tier, payout) {
    if (state.settings.reducedFx) return;
    if (tier !== "big" && tier !== "mega" && tier !== "jackpot") return;
    const label = tier === "jackpot" ? "JACKPOT" : tier === "mega" ? "MEGA WIN" : "BIG WIN";
    els.bigWinTitle.textContent = label;
    els.bigWinSub.textContent = `+${payout} tokens`;
    els.bigWin.classList.add("show");
    setTimeout(() => els.bigWin.classList.remove("show"), tier === "jackpot" ? 1050 : 780);
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function createFx(canvas) {
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return null;

    /** @type {{x:number,y:number,vx:number,vy:number,life:number,ttl:number,r:number,color:string}[]} */
    let particles = [];
    let raf = 0;
    let w = 1;
    let h = 1;
    let dpr = 1;

    function resize() {
      dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      w = Math.max(1, Math.floor(window.innerWidth));
      h = Math.max(1, Math.floor(window.innerHeight));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function burst({ x, y, count, power, colors }) {
      const c = clampInt(count, 6, 240);
      const p = clamp(Number(power), 1, 12);
      for (let i = 0; i < c; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = randomBetween(1.2, 1.0 + p);
        particles.push({
          x,
          y,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp - randomBetween(0.2, 1.2),
          life: 0,
          ttl: randomBetween(520, 980),
          r: randomBetween(1.4, 2.6),
          color: colors[(Math.random() * colors.length) | 0],
        });
      }
      kick();
    }

    function kick() {
      if (raf) return;
      raf = requestAnimationFrame(tick);
    }

    function tick(ts) {
      raf = 0;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      const gravity = 0.028;
      const drag = 0.988;
      const next = [];

      for (const part of particles) {
        part.life += 16;
        const t = part.life / part.ttl;
        if (t >= 1) continue;
        part.vx *= drag;
        part.vy = part.vy * drag + gravity;
        part.x += part.vx * 6;
        part.y += part.vy * 6;

        const a = 1 - t;
        ctx.globalAlpha = a * a;
        ctx.fillStyle = part.color;
        ctx.beginPath();
        ctx.arc(part.x, part.y, part.r, 0, Math.PI * 2);
        ctx.fill();
        next.push(part);
      }

      ctx.globalAlpha = 1;
      particles = next;

      if (particles.length > 0) raf = requestAnimationFrame(tick);
    }

    resize();

    return {
      resize,
      burst,
    };
  }

  function celebrateWin(tier, payout, bet) {
    if (state.settings.reducedFx) return;
    if (!fx) return;

    const colors = ["rgba(0,229,255,0.9)", "rgba(255,43,214,0.85)", "rgba(125,255,139,0.85)", "rgba(255,200,87,0.8)"];

    const ratio = bet > 0 ? payout / bet : 0;
    const centerX = window.innerWidth * 0.5;
    const topY = window.innerHeight * 0.26;

    if (tier === "win") {
      fx.burst({ x: centerX, y: topY, count: 18, power: 4, colors });
      return;
    }

    if (tier === "big") {
      fx.burst({ x: centerX, y: topY, count: 34, power: 6, colors });
      setTimeout(() => fx && fx.burst({ x: centerX * 0.66, y: topY * 1.1, count: 28, power: 5.4, colors }), 120);
      setTimeout(() => fx && fx.burst({ x: centerX * 1.34, y: topY * 1.05, count: 28, power: 5.4, colors }), 180);
      document.body.classList.add("shake");
      setTimeout(() => document.body.classList.remove("shake"), 420);
      return;
    }

    if (tier === "mega" || tier === "jackpot") {
      const n = tier === "jackpot" ? 7 : 5;
      const count = tier === "jackpot" ? 72 : 54;
      const power = tier === "jackpot" ? 9 : 7.5;
      for (let i = 0; i < n; i++) {
        setTimeout(() => {
          if (!fx) return;
          fx.burst({
            x: randomBetween(window.innerWidth * 0.18, window.innerWidth * 0.82),
            y: randomBetween(window.innerHeight * 0.14, window.innerHeight * 0.5),
            count: Math.round(count + ratio * 1.2),
            power,
            colors,
          });
        }, i * 130);
      }
      document.body.classList.add("shake");
      setTimeout(() => document.body.classList.remove("shake"), tier === "jackpot" ? 680 : 520);
    }
  }

  function setAuto(on) {
    state.auto = on;
    save();
    updateUI();
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
    if (!on) return;

    autoTimer = setInterval(() => {
      if (spinning) return;
      const bet = getBet();
      if (state.tokens < bet) {
        setAuto(false);
        setStatus("Auto-spin stopped: insufficient tokens (fiscal responsibility activated).", "bad");
        return;
      }
      void doSpin();
    }, 920);
  }

  function updateUI() {
    els.tokens.textContent = String(state.tokens);
    els.streak.textContent = String(state.streak);

    const bet = getBet();
    els.betValue.textContent = String(bet);
    els.betNumber.value = String(bet);

    const temp = getTemp();
    els.tempValue.textContent = temp.toFixed(1);

    const canSpin = !spinning && state.tokens >= bet;
    els.spin.disabled = !canSpin;
    els.spin.textContent = canSpin ? `SPIN (pay ${bet} 🪙)` : "SPIN (need tokens)";

    els.auto.setAttribute("aria-pressed", String(state.auto));
    els.auto.textContent = state.auto ? "Auto-spin: ON" : "Auto-spin: OFF";

    const claimable = canClaimDaily();
    els.claim.disabled = !claimable;
    els.claim.textContent = claimable ? `Claim daily grant (+${DAILY_GRANT} 🪙)` : "Daily grant claimed";

    els.sound.setAttribute("aria-pressed", String(state.settings.soundOn));
    els.sound.textContent = state.settings.soundOn ? "Sound: ON" : "Sound: OFF";

    els.haptics.checked = Boolean(state.settings.haptics);
    els.reducedFx.checked = Boolean(state.settings.reducedFx);

    els.volume.value = String(Math.round(state.settings.volume * 100));
    els.volumeValue.textContent = String(Math.round(state.settings.volume * 100));

    els.speed.value = String(state.settings.speed);
    els.speedValue.textContent = state.settings.speed.toFixed(2);
  }

  async function doSpin() {
    if (spinning) return;
    const bet = getBet();
    if (state.tokens < bet) {
      setStatus("Not enough tokens. Claim the daily grant or reduce your bet.", "bad");
      initAudio();
      await resumeAudio();
      beep({ type: "sawtooth", freq: 170, ms: 90, gain: 0.22, sweepTo: 120 });
      vibrate(40);
      return;
    }

    initAudio();
    await resumeAudio();
    syncMasterGain();

    spinning = true;
    updateUI();

    // Pay tokens to the “model”.
    state.tokens -= bet;
    save();
    updateUI();

    const temp = getTemp();
    const picked = [pickSymbol(temp), pickSymbol(temp), pickSymbol(temp)];
    const symbolKeys = picked.map((s) => s.key);

    setStatus(`Spinning… spending ${bet} tokens on “inference”.`, null);
    beep({ type: "square", freq: 190, ms: 70, gain: 0.18, sweepTo: 260 });
    vibrate(12);

    const speed = spinSpeed();
    const base = 780 / speed;
    const promises = picked.map((sym, i) =>
      spinReel(els.reels[i], sym.face, base + i * (240 / speed), () => {
        beep({ type: "square", freq: 380 + i * 60, ms: 32, gain: 0.08, sweepTo: 260 + i * 40 });
      }),
    );
    await Promise.all(promises);

    // Buff: refund chance (latency discount)
    if (state.buffs.refundChanceSpins > 0) {
      const refund = Math.random() < 0.2;
      if (refund) {
        state.tokens += bet;
        setStatus("Latency discount applied: bet refunded. The GPU was… “busy”.", "good");
        beep({ type: "triangle", freq: 520, ms: 90, gain: 0.22, sweepTo: 820 });
        vibrate([10, 15, 10]);
      }
      state.buffs.refundChanceSpins -= 1;
    }

    const { payout, headline } = computePayout(symbolKeys, bet);

    if (state.buffs.payoutBoostSpins > 0) state.buffs.payoutBoostSpins -= 1;
    if (state.buffs.luckSpins > 0) state.buffs.luckSpins -= 1;
    if (state.buffs.bugTaxHalfSpins > 0) state.buffs.bugTaxHalfSpins -= 1;

    state.tokens = clampInt(state.tokens + payout, 0, 999999);

    const tier = winTier(payout, bet);

    if (tier === "win" || tier === "big" || tier === "mega" || tier === "jackpot") {
      state.streak += 1;
      state.bestWin = Math.max(state.bestWin, payout);
      setStatus(`${headline} You won +${payout} 🪙. Result: ${formatFaces(symbolKeys)}`, "good");

      for (const r of els.reels) r.classList.add("win");
      setTimeout(() => els.reels.forEach((r) => r.classList.remove("win")), 650);

      const fanfareBase = tier === "jackpot" ? 520 : tier === "mega" ? 480 : tier === "big" ? 440 : 420;
      beep({ type: "triangle", freq: fanfareBase, ms: 95, gain: 0.26, sweepTo: fanfareBase * 1.5 });
      setTimeout(
        () => beep({ type: "triangle", freq: fanfareBase * 1.5, ms: 120, gain: 0.26, sweepTo: fanfareBase * 2.25 }),
        70,
      );
      vibrate(tier === "jackpot" ? [25, 20, 35, 18, 45] : tier === "mega" ? [22, 18, 32, 16, 38] : [20, 18, 30]);

      showBigWin(tier, payout);
      celebrateWin(tier, payout, bet);
    } else if (tier === "loss") {
      state.streak = 0;
      setStatus(`${headline} You paid an extra ${Math.abs(payout)} 🪙. Result: ${formatFaces(symbolKeys)}`, "bad");
      for (const r of els.reels) r.classList.add("lose");
      setTimeout(() => els.reels.forEach((r) => r.classList.remove("lose")), 520);
      beep({ type: "sawtooth", freq: 220, ms: 110, gain: 0.18, sweepTo: 120 });
      vibrate([40, 30, 20]);
    } else {
      state.streak = 0;
      setStatus(`${headline} Result: ${formatFaces(symbolKeys)}`, null);
      beep({ type: "square", freq: 260, ms: 70, gain: 0.14, sweepTo: 240 });
      vibrate(8);
    }

    save();
    spinning = false;
    updateUI();

    if (state.tokens === 0) {
      setStatus("You are out of tokens. Claim the daily grant and pretend it’s “venture funding”.", "bad");
    }
  }

  function wire() {
    els.bet.addEventListener("input", () => setBetValue(els.bet.value));
    els.betNumber.addEventListener("input", () => setBetValue(els.betNumber.value));

    for (const chip of els.chips) {
      chip.addEventListener("click", () => {
        const raw = chip.getAttribute("data-bet");
        if (raw === "max") setBetValue(betMax());
        else setBetValue(raw);
        initAudio();
        void resumeAudio();
        beep({ type: "square", freq: 320, ms: 45, gain: 0.10, sweepTo: 240 });
      });
    }

    els.temp.addEventListener("input", () => updateUI());

    els.spin.addEventListener("click", () => void doSpin());

    els.auto.addEventListener("click", () => {
      if (spinning) return;
      setAuto(!state.auto);
      setStatus(state.auto ? "Auto-spin engaged. Good luck, operator." : "Auto-spin off.", null);
      initAudio();
      void resumeAudio();
      beep({ type: "square", freq: state.auto ? 330 : 220, ms: 70, gain: 0.14, sweepTo: state.auto ? 440 : 180 });
      vibrate(10);
    });

    els.claim.addEventListener("click", () => {
      initAudio();
      void resumeAudio();
      claimDaily();
    });

    els.sound.addEventListener("click", () => {
      const turningOff = state.settings.soundOn;
      initAudio();
      void resumeAudio().then(() => {
        // If turning sound off, play a tiny "power-down" before muting.
        if (turningOff) {
          beep({ type: "square", freq: 260, ms: 55, gain: 0.12, sweepTo: 140 });
        }
        state.settings.soundOn = !turningOff;
        syncMasterGain();
        // If turning sound on, play a tiny "power-up" after unmuting.
        if (!turningOff) {
          beep({ type: "square", freq: 360, ms: 55, gain: 0.12, sweepTo: 560 });
        }
        save();
        updateUI();
      });
    });

    els.haptics.addEventListener("change", () => {
      state.settings.haptics = Boolean(els.haptics.checked);
      save();
      updateUI();
      vibrate(12);
    });

    els.reducedFx.addEventListener("change", () => {
      state.settings.reducedFx = Boolean(els.reducedFx.checked);
      save();
      updateUI();
    });

    els.volume.addEventListener("input", () => {
      state.settings.volume = clamp(Number(els.volume.value) / 100, 0, 1);
      initAudio();
      void resumeAudio().then(() => syncMasterGain());
      save();
      updateUI();
    });

    els.speed.addEventListener("input", () => {
      state.settings.speed = clamp(Number(els.speed.value), 0.7, 1.35);
      save();
      updateUI();
      initAudio();
      void resumeAudio();
      beep({ type: "triangle", freq: 300 + state.settings.speed * 120, ms: 45, gain: 0.10, sweepTo: 220 + state.settings.speed * 140 });
    });

    els.reset.addEventListener("click", () => {
      if (!confirm("Reset tokens and power-ups? This only affects localStorage.")) return;
      state = {
        tokens: START_TOKENS,
        streak: 0,
        auto: false,
        bestWin: 0,
        buffs: { payoutBoostSpins: 0, refundChanceSpins: 0, bugShield: 0, luckSpins: 0, bugTaxHalfSpins: 0 },
        settings: { ...state.settings },
        lastDailyClaimISO: null,
      };
      save();
      setAuto(false);
      updateUI();
      setStatus("Reset complete. Your progress has been successfully… deprecated.", null);
      initAudio();
      void resumeAudio();
      beep({ type: "square", freq: 210, ms: 70, gain: 0.12, sweepTo: 160 });
      vibrate([10, 12, 10]);
    });

    // One-time hint.
    setStatus("Tip: crank Temperature for chaos; buy a buff in the Token Shop.", null);
  }

  function start() {
    for (const r of els.reels) ensureReelSpan(r);
    load();
    fx = createFx(els.fx);
    window.addEventListener("resize", () => fx && fx.resize(), { passive: true });
    renderShop();
    wire();
    updateUI();
    setAuto(state.auto);
    syncMasterGain();

    // Orchestrated page-load reveal
    requestAnimationFrame(() => {
      document.body.classList.remove("preload");
      document.body.classList.add("loaded");
    });
  }

  start();
})();

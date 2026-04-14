(() => {
  "use strict";

  const els = {
    tokens: document.getElementById("tokens"),
    streak: document.getElementById("streak"),
    bet: document.getElementById("bet"),
    betValue: document.getElementById("betValue"),
    temp: document.getElementById("temp"),
    tempValue: document.getElementById("tempValue"),
    spin: document.getElementById("spin"),
    auto: document.getElementById("auto"),
    claim: document.getElementById("claim"),
    reset: document.getElementById("reset"),
    status: document.getElementById("status"),
    reels: [document.getElementById("reel0"), document.getElementById("reel1"), document.getElementById("reel2")],
    shop: document.getElementById("shop"),
  };

  const STORAGE_KEY = "aiSlots.v1";
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
      name: "Buy more context window",
      cost: 30,
      desc: "Next 6 spins: +25% payout (rounded).",
      apply: (state) => {
        state.buffs.payoutBoostSpins = Math.max(state.buffs.payoutBoostSpins, 6);
      },
    },
    {
      id: "gpu",
      name: "Rent a GPU minute",
      cost: 25,
      desc: "Next 5 spins: 20% chance your bet gets refunded (latency discount).",
      apply: (state) => {
        state.buffs.refundChanceSpins = Math.max(state.buffs.refundChanceSpins, 5);
      },
    },
    {
      id: "review",
      name: "Pay for a human code review",
      cost: 20,
      desc: "Instantly removes 1 🐛 tax from your next loss (once).",
      apply: (state) => {
        state.buffs.bugShield = Math.max(state.buffs.bugShield, 1);
      },
    },
  ];

  /** @type {{tokens:number, streak:number, auto:boolean, bestWin:number, buffs:{payoutBoostSpins:number, refundChanceSpins:number, bugShield:number}, lastDailyClaimISO:string|null}} */
  let state = {
    tokens: START_TOKENS,
    streak: 0,
    auto: false,
    bestWin: 0,
    buffs: {
      payoutBoostSpins: 0,
      refundChanceSpins: 0,
      bugShield: 0,
    },
    lastDailyClaimISO: null,
  };

  let spinning = false;
  let autoTimer = null;
  let audio = null;

  function todayISO() {
    const now = new Date();
    const yyyy = String(now.getFullYear()).padStart(4, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
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

  function clampInt(value, min, max) {
    if (!Number.isFinite(value)) return min;
    const v = Math.trunc(value);
    return Math.max(min, Math.min(max, v));
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
      master.gain.value = 0.18;
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

  function beep({ type = "sine", freq = 440, ms = 80, gain = 0.35, sweepTo = null } = {}) {
    if (!audio) return;
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
    if (!("vibrate" in navigator)) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }

  function temperatureAdjustedWeights(temp) {
    // temp in [0..2]. Higher temp flattens distribution (more chaos).
    const flatten = 0.45 + temp; // [0.45..2.45]
    const exp = 1 / flatten; // lower exp => flatter
    const raw = SYMBOLS.map((s) => Math.pow(s.baseWeight, exp));
    const sum = raw.reduce((a, b) => a + b, 0);
    return raw.map((w) => w / sum);
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

  function getBet() {
    return clampInt(Number(els.bet.value), 1, 25);
  }

  function getTemp() {
    const t = Number(els.temp.value);
    if (!Number.isFinite(t)) return 1;
    return Math.max(0, Math.min(2, t));
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
          beep({ type: "sawtooth", freq: 150, ms: 90, gain: 0.22, sweepTo: 90 });
          vibrate([20, 40, 20]);
          return;
        }
        state.tokens -= item.cost;
        item.apply(state);
        save();
        updateUI();
        setStatus(`Purchased: ${item.name}. Your “productivity” has increased by vibes.`, "good");
        beep({ type: "triangle", freq: 660, ms: 90, gain: 0.28, sweepTo: 990 });
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
      beep({ type: "square", freq: 240, ms: 70, gain: 0.16, sweepTo: 180 });
      return;
    }
    state.lastDailyClaimISO = t;
    state.tokens += DAILY_GRANT;
    save();
    updateUI();
    setStatus(`Daily grant received: +${DAILY_GRANT} 🪙. The token printer goes brrr.`, "good");
    beep({ type: "triangle", freq: 520, ms: 110, gain: 0.28, sweepTo: 880 });
  }

  function computePayout(symbolKeys, bet) {
    const [a, b, c] = symbolKeys;
    const counts = new Map();
    for (const k of symbolKeys) counts.set(k, (counts.get(k) ?? 0) + 1);

    const hasBug = counts.get("bug") > 0;
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
      const bugTax = 3 * bet;
      payout -= bugTax;
      headline = headline ? `${headline} (🐛 bug tax)` : "🐛 Bug tax: reality has entered the chat.";
    }

    // Optional “human review” shield: reduces one bug tax hit once.
    if (hasBug && state.buffs.bugShield > 0 && payout < 0) {
      const refund = Math.min(3 * bet, -payout);
      payout += refund;
      state.buffs.bugShield -= 1;
    }

    // Buff: payout boost
    if (payout > 0 && state.buffs.payoutBoostSpins > 0) {
      payout = Math.round(payout * 1.25);
    }

    return { payout, headline };
  }

  function formatFaces(symbolKeys) {
    return symbolKeys
      .map((k) => SYMBOLS.find((s) => s.key === k)?.face ?? k)
      .join(" ");
  }

  function spinReel(reelEl, finalFace, durationMs) {
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const totalMs = reduced ? Math.min(200, durationMs) : durationMs;

    reelEl.classList.add("spinning");
    const intervalMs = reduced ? 55 : 45;
    const start = performance.now();

    return new Promise((resolve) => {
      const tick = () => {
        const now = performance.now();
        const t = now - start;
        if (t >= totalMs) {
          reelEl.textContent = finalFace;
          reelEl.classList.remove("spinning");
          resolve();
          return;
        }
        reelEl.textContent = SYMBOLS[(Math.random() * SYMBOLS.length) | 0].face;
        setTimeout(tick, intervalMs);
      };
      tick();
    });
  }

  function updateUI() {
    els.tokens.textContent = String(state.tokens);
    els.streak.textContent = String(state.streak);

    const bet = getBet();
    els.betValue.textContent = String(bet);

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
  }

  async function doSpin() {
    if (spinning) return;
    const bet = getBet();
    if (state.tokens < bet) {
      setStatus("Not enough tokens. Claim the daily grant or reduce your bet.", "bad");
      beep({ type: "sawtooth", freq: 160, ms: 80, gain: 0.22, sweepTo: 120 });
      vibrate(40);
      return;
    }

    initAudio();
    await resumeAudio();

    spinning = true;
    updateUI();

    state.tokens -= bet;
    save();
    updateUI();

    const temp = getTemp();
    const picked = [pickSymbol(temp), pickSymbol(temp), pickSymbol(temp)];
    const symbolKeys = picked.map((s) => s.key);

    setStatus(`Spinning… spending ${bet} tokens on “inference”.`, null);
    beep({ type: "square", freq: 210, ms: 70, gain: 0.18, sweepTo: 260 });
    vibrate(15);

    const base = 700;
    const promises = picked.map((sym, i) => spinReel(els.reels[i], sym.face, base + i * 220));
    await Promise.all(promises);

    // Buff: refund chance (latency discount)
    if (state.buffs.refundChanceSpins > 0) {
      const refund = Math.random() < 0.2;
      if (refund) {
        state.tokens += bet;
        setStatus("Latency discount applied: bet refunded. The GPU was… “busy”.", "good");
        beep({ type: "triangle", freq: 520, ms: 90, gain: 0.22, sweepTo: 820 });
      }
      state.buffs.refundChanceSpins -= 1;
    }

    const { payout, headline } = computePayout(symbolKeys, bet);

    if (state.buffs.payoutBoostSpins > 0) state.buffs.payoutBoostSpins -= 1;

    state.tokens = clampInt(state.tokens + payout, 0, 999999);

    if (payout > 0) {
      state.streak += 1;
      state.bestWin = Math.max(state.bestWin, payout);
      setStatus(`${headline} You won +${payout} 🪙. Result: ${formatFaces(symbolKeys)}`, "good");
      beep({ type: "triangle", freq: 440, ms: 90, gain: 0.25, sweepTo: 660 });
      setTimeout(() => beep({ type: "triangle", freq: 660, ms: 110, gain: 0.25, sweepTo: 990 }), 70);
      vibrate([25, 20, 35]);
    } else if (payout < 0) {
      state.streak = 0;
      setStatus(`${headline} You paid an extra ${Math.abs(payout)} 🪙. Result: ${formatFaces(symbolKeys)}`, "bad");
      beep({ type: "sawtooth", freq: 220, ms: 110, gain: 0.18, sweepTo: 110 });
      vibrate([40, 30, 20]);
    } else {
      state.streak = 0;
      setStatus(`${headline} Result: ${formatFaces(symbolKeys)}`, null);
      beep({ type: "square", freq: 260, ms: 70, gain: 0.15, sweepTo: 240 });
      vibrate(10);
    }

    save();
    spinning = false;
    updateUI();

    if (state.tokens === 0) {
      setStatus("You are out of tokens. Claim the daily grant and pretend it’s “venture funding”.", "bad");
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
    }, 950);
  }

  function wire() {
    els.bet.addEventListener("input", () => updateUI());
    els.temp.addEventListener("input", () => updateUI());

    els.spin.addEventListener("click", () => void doSpin());

    els.auto.addEventListener("click", () => {
      if (spinning) return;
      setAuto(!state.auto);
      setStatus(state.auto ? "Auto-spin engaged. Good luck, operator." : "Auto-spin off.", null);
      initAudio();
      void resumeAudio();
      beep({ type: "square", freq: state.auto ? 330 : 220, ms: 70, gain: 0.14, sweepTo: state.auto ? 440 : 180 });
    });

    els.claim.addEventListener("click", () => {
      initAudio();
      void resumeAudio();
      claimDaily();
    });

    els.reset.addEventListener("click", () => {
      if (!confirm("Reset tokens and power-ups? This only affects localStorage.")) return;
      state = {
        tokens: START_TOKENS,
        streak: 0,
        auto: false,
        bestWin: 0,
        buffs: { payoutBoostSpins: 0, refundChanceSpins: 0, bugShield: 0 },
        lastDailyClaimISO: null,
      };
      save();
      setAuto(false);
      updateUI();
      setStatus("Reset complete. Your progress has been successfully… deprecated.", null);
    });

    // One-time hint.
    setStatus("Tip: increase Temperature for chaos; buy a buff in the Token Shop.", null);
  }

  function start() {
    load();
    renderShop();
    wire();
    updateUI();
    setAuto(state.auto);
  }

  start();
})();


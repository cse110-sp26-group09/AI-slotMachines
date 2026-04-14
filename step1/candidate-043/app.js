(() => {
  "use strict";

  const STORAGE_KEY = "aiSlots.v1";

  const ALIGNMENT_TAX = 1;
  const DEFAULT_TOKENS = 1000;
  const DEFAULT_BET = 25;

  const FUNDING_COOLDOWN_MS = 45_000;
  const FUNDING_GRANT = 180;

  const REEL_REPEAT = 14;
  const ITEM_HEIGHT_PX = 72;

  const SYMBOLS = [
    {
      id: "robot",
      glyph: "🤖",
      label: "Robot (demo bot)",
      weight: 0.22,
      pay3: 10,
      pay2: 2,
      flavor3: "Three bots agree. (This is statistically suspicious.)"
    },
    {
      id: "brain",
      glyph: "🧠",
      label: "Brain (chain-of-thought)",
      weight: 0.18,
      pay3: 8,
      pay2: 1,
      flavor3: "Big brain energy. Small wallet energy."
    },
    {
      id: "paperclip",
      glyph: "📎",
      label: "Paperclip (alignment)",
      weight: 0.16,
      pay3: 6,
      pay2: 1,
      flavor3: "Aligned… to maximizing paperclips."
    },
    {
      id: "floppy",
      glyph: "💾",
      label: "Floppy (training data)",
      weight: 0.14,
      pay3: 5,
      pay2: 0,
      flavor3: "We found this on the internet in 2012. Good enough!"
    },
    {
      id: "receipt",
      glyph: "🧾",
      label: "Receipt (billing)",
      weight: 0.12,
      pay3: 4,
      pay2: 0,
      flavor3: "Congratulations! You won… an invoice."
    },
    {
      id: "dna",
      glyph: "🧬",
      label: "DNA (fine-tuning)",
      weight: 0.1,
      pay3: 7,
      pay2: 0,
      flavor3: "Customized to your vibe. Also your credit card."
    },
    {
      id: "coin",
      glyph: "🪙",
      label: "Token (tokens)",
      weight: 0.06,
      pay3: 20,
      pay2: 3,
      flavor3: "You won tokens! Quick—spend them before product changes."
    },
    {
      id: "fire",
      glyph: "🔥",
      label: "Fire (GPU incident)",
      weight: 0.02,
      pay3: 0,
      pay2: 0,
      flavor3: "The GPU is on fire. Support says: “have you tried refreshing?”"
    }
  ];

  const SYMBOL_BY_ID = new Map(SYMBOLS.map((s) => [s.id, s]));

  const els = {
    tokenBalance: document.getElementById("tokenBalance"),
    houseEdge: document.getElementById("houseEdge"),
    bet: document.getElementById("bet"),
    betValue: document.getElementById("betValue"),
    spinCostHint: document.getElementById("spinCostHint"),
    spinBtn: document.getElementById("spinBtn"),
    autoBtn: document.getElementById("autoBtn"),
    soundBtn: document.getElementById("soundBtn"),
    fundingBtn: document.getElementById("fundingBtn"),
    cooldownText: document.getElementById("cooldownText"),
    resetBtn: document.getElementById("resetBtn"),
    copyBtn: document.getElementById("copyBtn"),
    resultText: document.getElementById("resultText"),
    log: document.getElementById("log"),
    payTable: document.getElementById("payTable"),
    statSpins: document.getElementById("statSpins"),
    statWon: document.getElementById("statWon"),
    statSpent: document.getElementById("statSpent"),
    statBig: document.getElementById("statBig"),
    reels: [
      document.getElementById("reel0"),
      document.getElementById("reel1"),
      document.getElementById("reel2")
    ]
  };

  /** @type {{tokens:number, bet:number, sound:boolean, auto:boolean, stats:{spins:number, won:number, spent:number, biggest:number}, funding:{lastMs:number}}} */
  let state = loadState();

  let isSpinning = false;
  let autoSpinTimer = null;
  let fundingTimer = null;

  // Audio (Web Audio API)
  let audio = /** @type {{ctx: AudioContext, master: GainNode} | null} */ (null);
  const EV_MULTIPLIER = expectedPayoutMultiplier();

  function nowMs() {
    return Date.now();
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function formatInt(n) {
    return Math.trunc(n).toLocaleString();
  }

  function computeSpinCost() {
    return state.bet + ALIGNMENT_TAX;
  }

  function setResult(text) {
    els.resultText.textContent = text;
  }

  function addLog(text, tone = "normal") {
    const li = document.createElement("li");
    li.textContent = text;
    if (tone === "muted") li.classList.add("muted");
    els.log.prepend(li);
    while (els.log.children.length > 18) els.log.lastElementChild?.remove();
  }

  function rng01() {
    const u32 = new Uint32Array(1);
    crypto.getRandomValues(u32);
    return u32[0] / 0xffffffff;
  }

  function weightedPickSymbol() {
    const r = rng01();
    let acc = 0;
    for (const s of SYMBOLS) {
      acc += s.weight;
      if (r <= acc) return s;
    }
    return SYMBOLS[SYMBOLS.length - 1];
  }

  function buildReelStrips() {
    for (const reelStrip of els.reels) {
      reelStrip.textContent = "";
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < REEL_REPEAT; i++) {
        for (const s of SYMBOLS) {
          const div = document.createElement("div");
          div.className = "reel__item";
          div.textContent = s.glyph;
          fragment.appendChild(div);
        }
      }
      reelStrip.appendChild(fragment);
    }
  }

  function buildPayTable() {
    els.payTable.textContent = "";
    for (const s of SYMBOLS) {
      const row = document.createElement("div");
      row.className = "payrow";
      row.setAttribute("role", "row");

      const sym = document.createElement("div");
      sym.className = "payrow__sym";
      sym.textContent = s.glyph;
      sym.setAttribute("role", "cell");

      const desc = document.createElement("div");
      desc.className = "payrow__desc";
      desc.textContent =
        s.pay3 === 0
          ? `${s.label} — three-of-a-kind triggers an incident report`
          : `${s.label} — 3x: ${s.pay3}× bet, 2x: ${s.pay2}× bet`;
      desc.setAttribute("role", "cell");

      const pay = document.createElement("div");
      pay.className = "payrow__pay";
      pay.textContent = s.pay3 === 0 ? "💥" : `${s.pay3}×`;
      pay.setAttribute("role", "cell");

      row.append(sym, desc, pay);
      els.payTable.appendChild(row);
    }
  }

  function ensureAudio() {
    if (audio) return audio;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    const ctx = new AudioCtx();
    const master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);
    audio = { ctx, master };
    return audio;
  }

  function beep(type, durationMs = 90, freq = 640) {
    if (!state.sound) return;
    const a = ensureAudio();
    if (!a) return;
    if (a.ctx.state === "suspended") a.ctx.resume().catch(() => {});

    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(a.master);

    const t0 = a.ctx.currentTime;
    const t1 = t0 + durationMs / 1000;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(1, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);
    o.start(t0);
    o.stop(t1 + 0.02);
  }

  function chimeWin() {
    beep("sine", 110, 740);
    setTimeout(() => beep("sine", 120, 988), 80);
    setTimeout(() => beep("triangle", 140, 1245), 170);
  }

  function thudLose() {
    beep("square", 120, 180);
  }

  function vibrate(pattern) {
    if (typeof navigator.vibrate !== "function") return;
    navigator.vibrate(pattern);
  }

  function setTokens(next) {
    state.tokens = Math.max(0, Math.trunc(next));
    render();
    scheduleSave();
  }

  function bumpStats({ spent = 0, won = 0, spins = 0 }) {
    state.stats.spent += spent;
    state.stats.won += won;
    state.stats.spins += spins;
    state.stats.biggest = Math.max(state.stats.biggest, won);
    renderStats();
    scheduleSave();
  }

  function render() {
    els.tokenBalance.textContent = formatInt(state.tokens);
    els.bet.value = String(state.bet);
    els.betValue.textContent = formatInt(state.bet);
    els.spinCostHint.textContent = `Cost: ${formatInt(computeSpinCost())}`;

    if (els.houseEdge) {
      const expectedPayout = EV_MULTIPLIER * state.bet;
      const expectedReturn = expectedPayout / computeSpinCost();
      const edge = (1 - expectedReturn) * 100;
      els.houseEdge.textContent = Number.isFinite(edge) ? edge.toFixed(1) : "--";
    }

    const canSpin = state.tokens >= computeSpinCost() && !isSpinning;
    els.spinBtn.disabled = !canSpin;
    els.autoBtn.disabled = state.tokens < computeSpinCost();
  }

  function renderStats() {
    els.statSpins.textContent = formatInt(state.stats.spins);
    els.statWon.textContent = formatInt(state.stats.won);
    els.statSpent.textContent = formatInt(state.stats.spent);
    els.statBig.textContent = formatInt(state.stats.biggest);
  }

  function renderToggles() {
    els.soundBtn.setAttribute("aria-pressed", String(state.sound));
    els.soundBtn.textContent = `Sound: ${state.sound ? "On" : "Off"}`;

    els.autoBtn.setAttribute("aria-pressed", String(state.auto));
    els.autoBtn.textContent = state.auto ? "Auto: On" : "Auto";
  }

  function scheduleSave() {
    window.clearTimeout(scheduleSave._t);
    scheduleSave._t = window.setTimeout(saveState, 120);
  }
  scheduleSave._t = 0;

  function saveState() {
    const payload = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, payload);
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) throw new Error("no state");
      const parsed = JSON.parse(raw);
      const tokens =
        typeof parsed.tokens === "number" ? Math.trunc(parsed.tokens) : DEFAULT_TOKENS;
      const bet = typeof parsed.bet === "number" ? Math.trunc(parsed.bet) : DEFAULT_BET;
      const sound = typeof parsed.sound === "boolean" ? parsed.sound : true;
      const auto = typeof parsed.auto === "boolean" ? parsed.auto : false;
      const stats = parsed.stats || {};
      const funding = parsed.funding || {};
      return {
        tokens: Math.max(0, tokens),
        bet: clamp(bet, 5, 250),
        sound,
        auto,
        stats: {
          spins: typeof stats.spins === "number" ? Math.trunc(stats.spins) : 0,
          won: typeof stats.won === "number" ? Math.trunc(stats.won) : 0,
          spent: typeof stats.spent === "number" ? Math.trunc(stats.spent) : 0,
          biggest: typeof stats.biggest === "number" ? Math.trunc(stats.biggest) : 0
        },
        funding: {
          lastMs: typeof funding.lastMs === "number" ? Math.trunc(funding.lastMs) : 0
        }
      };
    } catch {
      return {
        tokens: DEFAULT_TOKENS,
        bet: DEFAULT_BET,
        sound: true,
        auto: false,
        stats: { spins: 0, won: 0, spent: 0, biggest: 0 },
        funding: { lastMs: 0 }
      };
    }
  }

  function resetAll() {
    state = {
      tokens: DEFAULT_TOKENS,
      bet: DEFAULT_BET,
      sound: true,
      auto: false,
      stats: { spins: 0, won: 0, spent: 0, biggest: 0 },
      funding: { lastMs: 0 }
    };
    localStorage.removeItem(STORAGE_KEY);
    stopAutoSpin();
    buildReelStrips();
    snapReelsTo([0, 0, 0]);
    render();
    renderStats();
    renderToggles();
    setResult("Reset complete. The model has “forgotten” everything.");
    addLog("State reset. (Privacy!)", "muted");
  }

  function snapReelsTo(indices) {
    for (let i = 0; i < 3; i++) {
      const strip = els.reels[i];
      strip.style.transition = "none";
      strip.style.transform = `translateY(${-indices[i] * ITEM_HEIGHT_PX}px)`;
      strip.getBoundingClientRect();
      strip.style.transition = "";
    }
  }

  function computePayout(symbolIds, bet) {
    const [a, b, c] = symbolIds;
    const same3 = a === b && b === c;
    if (same3) {
      const s = SYMBOL_BY_ID.get(a);
      if (!s || s.pay3 === 0) return { payout: 0, reason: s?.flavor3 || "No payout." };
      return { payout: s.pay3 * bet, reason: s.flavor3 };
    }
    const counts = new Map();
    for (const id of symbolIds) counts.set(id, (counts.get(id) || 0) + 1);
    for (const [id, count] of counts) {
      if (count === 2) {
        const s = SYMBOL_BY_ID.get(id);
        if (!s || s.pay2 === 0) return { payout: 0, reason: "Two-of-a-kind. Still broke." };
        return {
          payout: s.pay2 * bet,
          reason: `Two ${s.glyph}s! Partial credit granted.`
        };
      }
    }
    return { payout: 0, reason: "Hallucinated value: none." };
  }

  function expectedPayoutMultiplier() {
    // Expected payout in "bet units" per spin for bet=1 (tax excluded).
    let ev = 0;
    for (const a of SYMBOLS) {
      for (const b of SYMBOLS) {
        for (const c of SYMBOLS) {
          const prob = a.weight * b.weight * c.weight;
          const payout = computePayout([a.id, b.id, c.id], 1).payout;
          ev += prob * payout;
        }
      }
    }
    return ev;
  }

  function spinDurations() {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) return [260, 340, 420];
    return [720, 920, 1120];
  }

  async function spinOnce() {
    if (isSpinning) return;

    const cost = computeSpinCost();
    if (state.tokens < cost) {
      setResult("Out of tokens. Please consult your nearest venture capitalist.");
      addLog("Spin blocked: insufficient tokens.", "muted");
      stopAutoSpin();
      return;
    }

    isSpinning = true;
    render();

    setTokens(state.tokens - cost);
    bumpStats({ spent: cost, spins: 1 });

    const picked = [weightedPickSymbol(), weightedPickSymbol(), weightedPickSymbol()];
    const indices = picked.map((s) => SYMBOLS.findIndex((x) => x.id === s.id));

    addLog(
      `Spent ${formatInt(cost)} tokens (bet ${formatInt(state.bet)} + tax ${ALIGNMENT_TAX}).`
    );

    const durations = spinDurations();
    const reelsDone = [];

    for (let i = 0; i < 3; i++) {
      const strip = els.reels[i];
      const baseIndex = indices[i];
      const extraTurns = 2 + Math.floor(rng01() * 4) + i;
      const target = baseIndex + extraTurns * SYMBOLS.length;
      const y = -target * ITEM_HEIGHT_PX;

      strip.style.transition = `transform ${durations[i]}ms cubic-bezier(0.15, 0.9, 0.12, 1)`;
      strip.style.transform = `translateY(${y}px)`;

      beep("triangle", 35, 550 + i * 90);

      reelsDone.push(
        new Promise((resolve) => {
          const onEnd = () => {
            strip.removeEventListener("transitionend", onEnd);
            const snappedY = -baseIndex * ITEM_HEIGHT_PX;
            strip.style.transition = "none";
            strip.style.transform = `translateY(${snappedY}px)`;
            strip.getBoundingClientRect();
            strip.style.transition = "";
            resolve(null);
          };
          strip.addEventListener("transitionend", onEnd, { once: true });
        })
      );
    }

    await Promise.all(reelsDone);

    const ids = picked.map((s) => s.id);
    const { payout, reason } = computePayout(ids, state.bet);
    const net = payout - cost;

    if (payout > 0) {
      setTokens(state.tokens + payout);
      bumpStats({ won: payout });
      setResult(
        `${picked.map((s) => s.glyph).join(" ")} → +${formatInt(payout)} tokens. ${reason}`
      );
      addLog(`Win: +${formatInt(payout)} tokens. Net ${net >= 0 ? "+" : ""}${formatInt(net)}.`);
      chimeWin();
      vibrate([20, 30, 20]);
    } else {
      setResult(`${picked.map((s) => s.glyph).join(" ")} → 0 tokens. ${reason}`);
      addLog(`No win. Net -${formatInt(cost)}.`, "muted");
      thudLose();
      vibrate([15]);
    }

    isSpinning = false;
    render();
  }

  function startAutoSpin() {
    if (state.auto) return;
    state.auto = true;
    renderToggles();
    scheduleSave();
    addLog("Auto-spin enabled. Please do not look directly at the budget.", "muted");

    const loop = async () => {
      if (!state.auto) return;
      if (document.visibilityState !== "visible") {
        autoSpinTimer = window.setTimeout(loop, 800);
        return;
      }
      await spinOnce();
      autoSpinTimer = window.setTimeout(loop, 420);
    };
    loop();
  }

  function stopAutoSpin() {
    if (!state.auto) return;
    state.auto = false;
    renderToggles();
    scheduleSave();
    window.clearTimeout(autoSpinTimer);
    autoSpinTimer = null;
    addLog("Auto-spin disabled. Human agency restored (for now).", "muted");
  }

  function updateFundingCooldown() {
    const remaining = Math.max(0, state.funding.lastMs + FUNDING_COOLDOWN_MS - nowMs());
    if (remaining === 0) {
      els.cooldownText.textContent = "Seed funding ready. (Ethics review pending.)";
      els.fundingBtn.disabled = false;
      return;
    }
    const sec = Math.ceil(remaining / 1000);
    els.cooldownText.textContent = `Seed funding cooldown: ${sec}s`;
    els.fundingBtn.disabled = true;
  }

  function startFundingTicker() {
    window.clearInterval(fundingTimer);
    fundingTimer = window.setInterval(updateFundingCooldown, 250);
    updateFundingCooldown();
  }

  function claimFunding() {
    updateFundingCooldown();
    if (els.fundingBtn.disabled) {
      addLog("Funding rejected: please wait for the pitch deck to load.", "muted");
      return;
    }
    state.funding.lastMs = nowMs();
    setTokens(state.tokens + FUNDING_GRANT);
    addLog(`Seed funding approved: +${formatInt(FUNDING_GRANT)} tokens.`, "muted");
    setResult(
      `You raised a “pre-pre-seed” round: +${formatInt(
        FUNDING_GRANT
      )} tokens. Dilution is a future-you problem.`
    );
    scheduleSave();
    updateFundingCooldown();
    vibrate([30, 20, 30]);
  }

  async function copyBrag() {
    const text = `${els.resultText.textContent} (Balance: ${formatInt(state.tokens)} tokens)`;
    try {
      await navigator.clipboard.writeText(text);
      addLog("Copied brag to clipboard. Please use responsibly.", "muted");
      beep("sine", 70, 1200);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "true");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      addLog("Copied brag (legacy mode).", "muted");
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    const isLocal =
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1" ||
      location.hostname === "[::1]";
    if (location.protocol !== "https:" && !isLocal) return;
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  function wireEvents() {
    els.bet.addEventListener("input", () => {
      state.bet = clamp(Number(els.bet.value), 5, 250);
      render();
      scheduleSave();
    });

    els.spinBtn.addEventListener("click", () => {
      spinOnce();
    });

    els.autoBtn.addEventListener("click", () => {
      if (state.auto) stopAutoSpin();
      else startAutoSpin();
    });

    els.soundBtn.addEventListener("click", () => {
      state.sound = !state.sound;
      renderToggles();
      scheduleSave();
      if (state.sound) beep("sine", 70, 980);
    });

    els.fundingBtn.addEventListener("click", claimFunding);
    els.resetBtn.addEventListener("click", resetAll);
    els.copyBtn.addEventListener("click", copyBrag);

    window.addEventListener("keydown", (e) => {
      if (e.key === " " || e.code === "Space") {
        if (e.target && /** @type {HTMLElement} */ (e.target).tagName === "INPUT") return;
        e.preventDefault();
        spinOnce();
      }
      if (e.key === "a" || e.key === "A") {
        if (state.auto) stopAutoSpin();
        else startAutoSpin();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible" && state.auto) {
        addLog("Tab hidden: auto-spin pauses to avoid stealth spending.", "muted");
      }
    });
  }

  function init() {
    buildReelStrips();
    buildPayTable();
    snapReelsTo([0, 0, 0]);

    render();
    renderStats();
    renderToggles();
    startFundingTicker();
    registerServiceWorker();
    wireEvents();

    setResult("Ready. Press Space to spin, or tap Spin to burn tokens.");
    addLog("Boot complete. No GPUs were provisioned (sadly).", "muted");
  }

  init();
})();
(() => {
  "use strict";

  const STORAGE_KEY = "aiSlotsStateV1";
  const DAILY_KEY = "aiSlotsDailyV1";

  const SYMBOLS = [
    { id: "PROMPT", label: "PROMPT", weight: 16, tripleMult: 12, pairMult: 2, flavor: "Prompt engineering intensifies." },
    { id: "TOKEN", label: "TOKEN", weight: 14, tripleMult: 16, pairMult: 3, flavor: "You found tokens inside the tokens." },
    { id: "GPU", label: "GPU", weight: 10, tripleMult: 22, pairMult: 4, flavor: "A datacenter sighed somewhere." },
    { id: "DATASET", label: "DATASET", weight: 12, tripleMult: 14, pairMult: 3, flavor: "You scraped… uh, curated… responsibly." },
    { id: "LATENCY", label: "LATENCY", weight: 10, tripleMult: 18, pairMult: 3, flavor: "It’s not slow. It’s thinking." },
    { id: "ALIGNMENT", label: "ALIGNMENT", weight: 7, tripleMult: 28, pairMult: 5, flavor: "Congrats, you aligned your wallet." },
    { id: "CAPTCHA", label: "CAPTCHA", weight: 6, tripleMult: 30, pairMult: 5, flavor: "Prove you’re human. (You did great.)" },
    { id: "API_KEY", label: "API_KEY", weight: 4, tripleMult: 44, pairMult: 8, flavor: "Shh. Don’t paste it into public repos." },
    { id: "BUG", label: "BUG", weight: 5, tripleMult: 0, pairMult: 0, flavor: "It’s not a bug; it’s an emergent feature." },
    { id: "RATE_LIMIT", label: "RATE_LIMIT", weight: 4, tripleMult: 0, pairMult: 0, flavor: "429: Try again later (or pay more)." },
    { id: "HALLUCINATION", label: "HALLUCINATION", weight: 4, tripleMult: 0, pairMult: 0, flavor: "Model reports jackpot with 99% confidence (unverified)." },
    { id: "ROBOTS", label: "🤖", weight: 8, tripleMult: 20, pairMult: 4, flavor: "Beep boop. You are now the product." },
  ];

  const DEFAULT_STATE = {
    balance: 100,
    bet: 10,
    spins: 0,
    spent: 0,
    won: 0,
    bestWin: 0,
    soundOn: true,
    reduceMotion: false,
  };

  const els = {
    balanceValue: document.getElementById("balanceValue"),
    spinsValue: document.getElementById("spinsValue"),
    spentValue: document.getElementById("spentValue"),
    wonValue: document.getElementById("wonValue"),
    bestValue: document.getElementById("bestValue"),
    resultLine: document.getElementById("resultLine"),
    subLine: document.getElementById("subLine"),
    paytableGrid: document.getElementById("paytableGrid"),
    ariaAnnouncer: document.getElementById("ariaAnnouncer"),
    spinBtn: document.getElementById("spinBtn"),
    autoSpinToggle: document.getElementById("autoSpinToggle"),
    soundToggle: document.getElementById("soundToggle"),
    reducedMotionToggle: document.getElementById("reducedMotionToggle"),
    claimDailyBtn: document.getElementById("claimDailyBtn"),
    resetBtn: document.getElementById("resetBtn"),
    reelFaces: [0, 1, 2].map((i) => document.getElementById(`reelFace${i}`)),
    betPills: Array.from(document.querySelectorAll("[data-bet]")),
  };

  const formatInt = (n) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
  const clampInt = (n, min, max) => Math.min(max, Math.max(min, Math.trunc(n)));

  function safeParse(json) {
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? safeParse(raw) : null;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_STATE };

    return {
      ...DEFAULT_STATE,
      ...parsed,
      balance: clampInt(parsed.balance ?? DEFAULT_STATE.balance, 0, 1_000_000),
      bet: clampInt(parsed.bet ?? DEFAULT_STATE.bet, 1, 1_000_000),
      spins: clampInt(parsed.spins ?? 0, 0, 1_000_000_000),
      spent: clampInt(parsed.spent ?? 0, 0, 1_000_000_000),
      won: clampInt(parsed.won ?? 0, 0, 1_000_000_000),
      bestWin: clampInt(parsed.bestWin ?? 0, 0, 1_000_000_000),
      soundOn: Boolean(parsed.soundOn ?? DEFAULT_STATE.soundOn),
      reduceMotion: Boolean(parsed.reduceMotion ?? DEFAULT_STATE.reduceMotion),
    };
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function todayKey() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function weightedPick(items) {
    let total = 0;
    for (const s of items) total += s.weight;
    let r = Math.random() * total;
    for (const s of items) {
      r -= s.weight;
      if (r <= 0) return s;
    }
    return items[items.length - 1];
  }

  function countById(symbols) {
    const map = new Map();
    for (const s of symbols) map.set(s.id, (map.get(s.id) ?? 0) + 1);
    return map;
  }

  function payoutFor(result, bet) {
    const ids = result.map((s) => s.id);
    const hasRateLimit = ids.includes("RATE_LIMIT");
    const hasBug = ids.includes("BUG");

    if (hasRateLimit) {
      return { payout: 0, kind: "rate_limit", message: "RATE LIMITED", detail: "429. Please wait before spamming the slot API." };
    }
    if (hasBug) {
      const penalty = Math.min(bet, Math.max(1, Math.floor(bet * 0.5)));
      return { payout: -penalty, kind: "bug", message: "BUG DETECTED", detail: "A regression ate some of your bet. Please file an issue (into the void)." };
    }

    const counts = countById(result);
    const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const [topId, topCount] = entries[0];

    const topSymbol = SYMBOLS.find((s) => s.id === topId) ?? SYMBOLS[0];

    if (topCount === 3) {
      if (topId === "HALLUCINATION") {
        return { payout: 0, kind: "hallucination", message: "JACKPOT (ALLEGED)", detail: topSymbol.flavor };
      }
      const payout = bet * topSymbol.tripleMult;
      return { payout, kind: "triple", message: `TRIPLE ${topSymbol.label}!`, detail: topSymbol.flavor };
    }

    if (topCount === 2) {
      if (topId === "HALLUCINATION") {
        return { payout: 0, kind: "pair_hallucination", message: "CONFIDENTLY WRONG", detail: "Two hallucinations agree. That doesn’t make it true." };
      }
      const payout = bet * topSymbol.pairMult;
      return { payout, kind: "pair", message: `PAIR ${topSymbol.label}`, detail: "A partial match. Like a benchmark cherry-pick." };
    }

    return { payout: 0, kind: "loss", message: "NO MATCH", detail: "Try adding more context. Or more tokens." };
  }

  function shouldReduceMotionFromOS() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function playTick(enabled) {
    if (!enabled) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = 420 + Math.random() * 120;
    g.gain.value = 0.02;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.03);
  }

  function playWin(enabled, size) {
    if (!enabled) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const base = size === "big" ? 740 : 560;
    const notes = [0, 3, 7, 12].map((n) => base * Math.pow(2, n / 12));
    let t = ctx.currentTime;
    for (const f of notes) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.value = 0.035;
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.07);
      t += 0.07;
    }
  }

  function vibrate(pattern) {
    if (!navigator.vibrate) return;
    navigator.vibrate(pattern);
  }

  function renderPaytable() {
    const rows = [];
    for (const s of SYMBOLS) {
      if (s.tripleMult <= 0 && s.pairMult <= 0) continue;
      rows.push({
        left: `${s.label} ×3`,
        right: `${s.tripleMult}× bet`,
      });
    }
    rows.sort((a, b) => {
      const am = parseInt(a.right, 10);
      const bm = parseInt(b.right, 10);
      return bm - am;
    });
    els.paytableGrid.innerHTML = rows
      .map(
        (r) =>
          `<div class="payRow"><div class="payLeft">${escapeHtml(r.left)}</div><div class="payRight">${escapeHtml(
            r.right,
          )}</div></div>`,
      )
      .join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setActiveBetPill(bet) {
    for (const btn of els.betPills) {
      const v = Number(btn.dataset.bet);
      btn.classList.toggle("isActive", v === bet);
    }
  }

  function updateUI(state) {
    els.balanceValue.textContent = `${formatInt(state.balance)} tokens`;
    els.spinsValue.textContent = formatInt(state.spins);
    els.spentValue.textContent = `${formatInt(state.spent)} tokens`;
    els.wonValue.textContent = `${formatInt(state.won)} tokens`;
    els.bestValue.textContent = `${formatInt(state.bestWin)} tokens`;
    els.soundToggle.checked = state.soundOn;
    els.reducedMotionToggle.checked = state.reduceMotion;
    setActiveBetPill(state.bet);

    const canSpin = state.balance >= state.bet;
    els.spinBtn.disabled = !canSpin;
    if (!canSpin) {
      els.subLine.textContent = "Out of tokens. Claim daily tokens or reset (this is a satire, not a savings plan).";
    }
  }

  function setResult(kind, message, detail, reelsText) {
    els.resultLine.textContent = message;
    els.subLine.textContent = detail ?? "";
    els.resultLine.classList.remove("win", "loss", "warn");
    if (kind === "win") els.resultLine.classList.add("win");
    if (kind === "loss") els.resultLine.classList.add("loss");
    if (kind === "warn") els.resultLine.classList.add("warn");

    const reelsPart = reelsText ? ` Reels: ${reelsText}.` : "";
    els.ariaAnnouncer.textContent = `${message}${detail ? ". " + detail : ""}${reelsPart}`;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function animateReels(state, finalSymbols) {
    const reduceMotion = state.reduceMotion || shouldReduceMotionFromOS();
    if (reduceMotion) {
      for (let i = 0; i < 3; i++) els.reelFaces[i].textContent = finalSymbols[i].label;
      return;
    }

    const durations = [700, 950, 1200];
    const start = performance.now();
    const endAt = durations.map((d) => start + d);
    const tickEveryMs = 65;

    const lastLabel = ["—", "—", "—"];
    while (performance.now() < Math.max(...endAt)) {
      for (let i = 0; i < 3; i++) {
        if (performance.now() <= endAt[i]) {
          const pick = weightedPick(SYMBOLS);
          if (pick.label !== lastLabel[i]) {
            els.reelFaces[i].textContent = pick.label;
            lastLabel[i] = pick.label;
            playTick(state.soundOn);
          }
        }
      }
      await sleep(tickEveryMs);
    }
    for (let i = 0; i < 3; i++) els.reelFaces[i].textContent = finalSymbols[i].label;
  }

  let state = loadState();
  let spinning = false;
  let autoSpinTimer = null;
  let cooldownUntil = 0;

  function inCooldown() {
    return Date.now() < cooldownUntil;
  }

  function setCooldown(ms) {
    cooldownUntil = Date.now() + ms;
  }

  function updateSpinButtonText() {
    if (spinning) {
      els.spinBtn.textContent = "SPINNING…";
      return;
    }
    if (inCooldown()) {
      const left = Math.max(0, cooldownUntil - Date.now());
      els.spinBtn.textContent = `COOLDOWN ${Math.ceil(left / 1000)}s`;
      return;
    }
    els.spinBtn.textContent = "SPIN";
  }

  async function spinOnce() {
    if (spinning) return;
    if (inCooldown()) return;
    if (state.balance < state.bet) return;

    spinning = true;
    updateSpinButtonText();
    els.spinBtn.disabled = true;

    state.balance -= state.bet;
    state.spins += 1;
    state.spent += state.bet;
    saveState(state);
    updateUI(state);

    const finalSymbols = [weightedPick(SYMBOLS), weightedPick(SYMBOLS), weightedPick(SYMBOLS)];
    await animateReels(state, finalSymbols);

    const outcome = payoutFor(finalSymbols, state.bet);
    const reelsText = finalSymbols.map((s) => s.label).join(", ");

    if (outcome.kind === "rate_limit") {
      setCooldown(3000);
      vibrate([40, 70, 40]);
      setResult("warn", outcome.message, outcome.detail, reelsText);
    } else if (outcome.kind === "bug") {
      state.balance = Math.max(0, state.balance + outcome.payout);
      vibrate([20, 50, 20, 50, 20]);
      setResult("loss", outcome.message, `${outcome.detail} (-${formatInt(-outcome.payout)} tokens)`, reelsText);
    } else if (outcome.payout > 0) {
      state.balance += outcome.payout;
      state.won += outcome.payout;
      state.bestWin = Math.max(state.bestWin, outcome.payout);
      const isBig = outcome.payout >= state.bet * 20;
      playWin(state.soundOn, isBig ? "big" : "small");
      vibrate(isBig ? [30, 50, 30, 140, 40] : [20, 40, 20]);
      setResult(
        "win",
        `${outcome.message} +${formatInt(outcome.payout)} tokens`,
        outcome.detail,
        reelsText,
      );
    } else {
      const kind = outcome.kind === "hallucination" ? "warn" : "loss";
      setResult(kind, outcome.message, outcome.detail, reelsText);
      vibrate(kind === "warn" ? [25, 60, 25] : [15]);
    }

    saveState(state);
    updateUI(state);

    spinning = false;
    updateSpinButtonText();
    els.spinBtn.disabled = inCooldown() || state.balance < state.bet;

    if (els.autoSpinToggle.checked && state.balance >= state.bet) {
      const baseDelay = state.reduceMotion ? 250 : 450;
      const cooldownDelay = inCooldown() ? Math.max(0, cooldownUntil - Date.now() + 60) : 0;
      const delay = Math.max(baseDelay, cooldownDelay);
      autoSpinTimer = window.setTimeout(() => {
        autoSpinTimer = null;
        spinOnce();
        tickCooldownUI();
      }, delay);
    }
  }

  function clearAutoSpin() {
    if (autoSpinTimer) {
      window.clearTimeout(autoSpinTimer);
      autoSpinTimer = null;
    }
  }

  function refreshDailyButton() {
    const last = localStorage.getItem(DAILY_KEY);
    const canClaim = last !== todayKey();
    els.claimDailyBtn.disabled = !canClaim;
    els.claimDailyBtn.textContent = canClaim ? "Claim daily tokens" : "Daily claimed";
  }

  function claimDaily() {
    const last = localStorage.getItem(DAILY_KEY);
    if (last === todayKey()) return;
    localStorage.setItem(DAILY_KEY, todayKey());
    const grant = 60;
    state.balance += grant;
    saveState(state);
    updateUI(state);
    refreshDailyButton();
    setResult("win", `Daily grant +${formatInt(grant)} tokens`, "The machine thanks you for your continued belief.");
    playWin(state.soundOn, "small");
    vibrate([15, 40, 15]);
  }

  function resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(DAILY_KEY);
    state = { ...DEFAULT_STATE };
    saveState(state);
    updateUI(state);
    refreshDailyButton();
    for (let i = 0; i < 3; i++) els.reelFaces[i].textContent = "—";
    setResult("warn", "Reset complete", "All tokens have been… re-aligned.");
    clearAutoSpin();
  }

  function tickCooldownUI() {
    if (spinning) return;
    if (!inCooldown()) {
      updateSpinButtonText();
      return;
    }
    updateSpinButtonText();
    els.spinBtn.disabled = true;
    window.setTimeout(tickCooldownUI, 140);
  }

  function wireEvents() {
    els.spinBtn.addEventListener("click", () => {
      spinOnce();
      tickCooldownUI();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        const active = document.activeElement;
        const typing = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
        if (typing) return;
        e.preventDefault();
        spinOnce();
        tickCooldownUI();
      }
    });

    els.betPills.forEach((btn) => {
      btn.addEventListener("click", () => {
        const bet = Number(btn.dataset.bet);
        if (!Number.isFinite(bet) || bet <= 0) return;
        state.bet = bet;
        saveState(state);
        updateUI(state);
        updateSpinButtonText();
      });
    });

    els.autoSpinToggle.addEventListener("change", () => {
      if (!els.autoSpinToggle.checked) clearAutoSpin();
      if (els.autoSpinToggle.checked) {
        setResult("warn", "Auto-spin enabled", "Congratulations, you invented reinforcement learning.");
        spinOnce();
      }
    });

    els.soundToggle.addEventListener("change", () => {
      state.soundOn = els.soundToggle.checked;
      saveState(state);
    });

    els.reducedMotionToggle.addEventListener("change", () => {
      state.reduceMotion = els.reducedMotionToggle.checked;
      saveState(state);
      setResult(
        "warn",
        state.reduceMotion ? "Reduced motion enabled" : "Reduced motion disabled",
        state.reduceMotion ? "Less spinning. Same gambling." : "More spinning. Same gambling.",
      );
    });

    els.claimDailyBtn.addEventListener("click", claimDaily);
    els.resetBtn.addEventListener("click", resetAll);
  }

  function init() {
    renderPaytable();
    updateUI(state);
    refreshDailyButton();
    updateSpinButtonText();
    wireEvents();

    const initial = [weightedPick(SYMBOLS), weightedPick(SYMBOLS), weightedPick(SYMBOLS)];
    for (let i = 0; i < 3; i++) els.reelFaces[i].textContent = initial[i].label;

    if (shouldReduceMotionFromOS() && !state.reduceMotion) {
      els.subLine.textContent = "Your OS prefers reduced motion. Toggle it if you want extra spin drama.";
    }
  }

  init();
})();

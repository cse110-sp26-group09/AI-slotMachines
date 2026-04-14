/* eslint-disable no-alert */
(() => {
  "use strict";

  const STORAGE_KEY = "ai-slotmachine:v1";

  const SYMBOLS = [
    { id: "prompt", emoji: "🧠", label: "PROMPT", weight: 18 },
    { id: "tokens", emoji: "🪙", label: "TOKENS", weight: 16 },
    { id: "gpu", emoji: "🔥", label: "GPU", weight: 10 },
    { id: "fine_tune", emoji: "🧪", label: "FINE-TUNE", weight: 8 },
    { id: "vector_db", emoji: "🧲", label: "VECTOR DB", weight: 8 },
    { id: "hallucination", emoji: "🪞", label: "HALLUCINATION", weight: 8 },
    { id: "api_key", emoji: "🔑", label: "API KEY", weight: 2 },
    { id: "reject", emoji: "🚫", label: "REJECT", weight: 5 },
  ];

  const PAYOUT_TRIPLE = {
    api_key: 50,
    gpu: 20,
    fine_tune: 15,
    prompt: 10,
    tokens: 8,
    vector_db: 12,
    hallucination: 0,
    reject: 0,
  };

  const PAYOUT_PAIR = {
    api_key: 6,
    gpu: 5,
    fine_tune: 5,
    vector_db: 4,
    prompt: 3,
    tokens: 3,
    hallucination: 2,
    reject: 0,
  };

  const COST_PER_SPIN = 1;

  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  const elements = {
    tokenBalance: document.getElementById("tokenBalance"),
    houseLine: document.getElementById("houseLine"),
    message: document.getElementById("message"),
    spinBtn: document.getElementById("spinBtn"),
    autoBtn: document.getElementById("autoBtn"),
    shareBtn: document.getElementById("shareBtn"),
    resetBtn: document.getElementById("resetBtn"),
    reels: [
      document.getElementById("reel0"),
      document.getElementById("reel1"),
      document.getElementById("reel2"),
    ],
    stats: {
      spins: document.getElementById("statSpins"),
      spent: document.getElementById("statSpent"),
      won: document.getElementById("statWon"),
      biggest: document.getElementById("statBiggest"),
      jackpots: document.getElementById("statJackpots"),
    },
    confetti: document.getElementById("confetti"),
  };

  /** @type {{tokens:number, stats:{spins:number, spent:number, won:number, biggest:number, jackpots:number}}} */
  let state = loadState();
  let spinning = false;
  let autoRemaining = 0;
  let lastBrag = "";

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return defaultState();
      if (typeof parsed.tokens !== "number") return defaultState();
      if (!parsed.stats || typeof parsed.stats !== "object") return defaultState();
      const stats = {
        spins: Number(parsed.stats.spins) || 0,
        spent: Number(parsed.stats.spent) || 0,
        won: Number(parsed.stats.won) || 0,
        biggest: Number(parsed.stats.biggest) || 0,
        jackpots: Number(parsed.stats.jackpots) || 0,
      };
      return { tokens: clampInt(parsed.tokens, 0, 999999), stats };
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage failures (private mode / full storage); app still works.
    }
  }

  function defaultState() {
    return {
      tokens: 20,
      stats: { spins: 0, spent: 0, won: 0, biggest: 0, jackpots: 0 },
    };
  }

  function clampInt(value, min, max) {
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function cryptoFloat() {
    // 0 <= x < 1 using Web Crypto for less-predictable “luck”.
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 2 ** 32;
  }

  function weightedPick(items) {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let r = cryptoFloat() * total;
    for (const item of items) {
      r -= item.weight;
      if (r <= 0) return item;
    }
    return items[items.length - 1];
  }

  function setReelSymbol(reelEl, symbol) {
    const emojiEl = reelEl.querySelector(".emoji");
    const labelEl = reelEl.querySelector(".label");
    if (emojiEl) emojiEl.textContent = symbol.emoji;
    if (labelEl) labelEl.textContent = symbol.label;
    reelEl.dataset.symbolId = symbol.id;
  }

  function setMessage(text, tone = "neutral") {
    elements.message.textContent = text;
    elements.message.dataset.tone = tone;
  }

  function render() {
    elements.tokenBalance.textContent = String(state.tokens);
    elements.stats.spins.textContent = String(state.stats.spins);
    elements.stats.spent.textContent = String(state.stats.spent);
    elements.stats.won.textContent = String(state.stats.won);
    elements.stats.biggest.textContent = String(state.stats.biggest);
    elements.stats.jackpots.textContent = String(state.stats.jackpots);

    const canSpin = !spinning && state.tokens >= COST_PER_SPIN && autoRemaining === 0;
    elements.spinBtn.disabled = !canSpin;
    elements.spinBtn.title =
      state.tokens >= COST_PER_SPIN ? "" : "You are out of tokens. The house suggests 'Reset'.";

    const canAuto = !spinning && state.tokens >= COST_PER_SPIN;
    elements.autoBtn.disabled = !canAuto;

    elements.shareBtn.disabled = lastBrag.length === 0;
  }

  function clearWinGlow() {
    for (const reel of elements.reels) reel.classList.remove("win");
  }

  function beep(kind = "tick") {
    // Lightweight SFX via Web Audio; created on demand to avoid autoplay restrictions.
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      const now = ctx.currentTime;
      const base = kind === "jackpot" ? 880 : kind === "win" ? 660 : 440;
      o.frequency.setValueAtTime(base, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(now);
      o.stop(now + 0.13);
      o.onended = () => ctx.close().catch(() => {});
    } catch {
      // Ignore audio failures.
    }
  }

  function evaluate(symbols) {
    const ids = symbols.map((s) => s.id);
    const counts = new Map();
    for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
    const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const topId = entries[0][0];
    const topCount = entries[0][1];

    const hasReject = ids.includes("reject");
    const allSame = counts.size === 1;

    let payout = 0;
    let tone = "neutral";
    let headline = "";
    let isJackpot = false;
    let cooldownMs = 0;

    if (hasReject) {
      cooldownMs = 1200;
      headline = "🚫 REJECTED. The policy says: “nice try, human.”";
      tone = "warn";
    } else if (allSame) {
      payout = PAYOUT_TRIPLE[topId] ?? 0;
      isJackpot = topId === "api_key";

      if (topId === "hallucination") {
        headline = "🪞 3× HALLUCINATION: it insisted you won. You did not.";
        tone = "neutral";
      } else if (payout > 0) {
        headline = `${symbols[0].emoji} ${symbols[0].label} ×3! +${payout} tokens.`;
        tone = isJackpot ? "good" : "good";
      } else {
        headline = "A perfectly calibrated nothingburger.";
        tone = "neutral";
      }
    } else if (topCount === 2) {
      payout = PAYOUT_PAIR[topId] ?? 0;
      if (topId === "reject") {
        headline = "Partial REJECT: your prompt got… “feedback”.";
        tone = "warn";
      } else {
        headline = `Pair detected: ${SYMBOLS.find((s) => s.id === topId)?.label ?? "??"} ×2. +${payout} tokens.`;
        tone = payout > 0 ? "good" : "neutral";
      }
    } else {
      headline = "No match. But the vibes are… scalable.";
      tone = "neutral";
    }

    return { payout, tone, headline, isJackpot, cooldownMs, topId, topCount };
  }

  function pickFinalReels() {
    return [weightedPick(SYMBOLS), weightedPick(SYMBOLS), weightedPick(SYMBOLS)];
  }

  function startSpin() {
    if (spinning) return;
    if (state.tokens < COST_PER_SPIN) {
      setMessage("Out of tokens. The house recommends you Reset (or start a podcast).", "warn");
      render();
      return;
    }

    spinning = true;
    clearWinGlow();
    lastBrag = "";
    state.tokens -= COST_PER_SPIN;
    state.stats.spins += 1;
    state.stats.spent += COST_PER_SPIN;
    saveState();

    elements.shareBtn.disabled = true;
    setMessage("Spinning… generating value… (please hold).");
    beep("tick");
    render();

    const finalSymbols = pickFinalReels();

    const durations = prefersReducedMotion ? [120, 160, 200] : [650, 900, 1200];
    const tickMs = prefersReducedMotion ? 0 : 70;
    const intervals = [];

    elements.reels.forEach((reel, idx) => {
      reel.classList.add("spinning");
      if (tickMs > 0) {
        intervals[idx] = window.setInterval(() => {
          setReelSymbol(reel, weightedPick(SYMBOLS));
        }, tickMs);
      } else {
        setReelSymbol(reel, finalSymbols[idx]);
      }
    });

    const stopReel = (idx) =>
      new Promise((resolve) => {
        window.setTimeout(() => {
          const reel = elements.reels[idx];
          if (intervals[idx]) window.clearInterval(intervals[idx]);
          setReelSymbol(reel, finalSymbols[idx]);
          reel.classList.remove("spinning");
          beep("tick");
          resolve();
        }, durations[idx]);
      });

    Promise.all([stopReel(0), stopReel(1), stopReel(2)]).then(() => {
      const result = evaluate(finalSymbols);

      if (result.topCount >= 2) {
        for (const reel of elements.reels) reel.classList.add("win");
      }

      if (result.cooldownMs > 0) {
        elements.spinBtn.disabled = true;
        elements.autoBtn.disabled = true;
        setMessage(`${result.headline} Cooling down…`, result.tone);
        window.setTimeout(() => {
          spinning = false;
          render();
          if (autoRemaining > 0) continueAuto();
        }, result.cooldownMs);
        return;
      }

      if (result.payout > 0) {
        state.tokens += result.payout;
        state.stats.won += result.payout;
        state.stats.biggest = Math.max(state.stats.biggest, result.payout);
        if (result.isJackpot) state.stats.jackpots += 1;
        saveState();
      }

      if (result.isJackpot) {
        setMessage(`${result.headline} The house would like to “partner” with you.`, "good");
        beep("jackpot");
        if (navigator.vibrate) navigator.vibrate([40, 40, 80]);
        confettiBurst();
      } else if (result.payout > 0) {
        setMessage(`${result.headline} Please add “AI-powered” to your résumé.`, "good");
        beep("win");
      } else {
        setMessage(result.headline, result.tone);
      }

      lastBrag = makeBrag(finalSymbols, result.payout, state.tokens);
      spinning = false;
      render();

      if (autoRemaining > 0) continueAuto();
    });
  }

  function makeBrag(symbols, payout, balance) {
    const combo = symbols.map((s) => `${s.emoji}${s.label}`).join(" | ");
    const line =
      payout > 0
        ? `I just spun ${combo} and won +${payout} tokens in AI Token Casino. Balance: ${balance}.`
        : `I just spun ${combo} in AI Token Casino. The model said “trust me”. Balance: ${balance}.`;
    return line;
  }

  function continueAuto() {
    if (spinning) return;
    if (autoRemaining <= 0) return;
    if (state.tokens < COST_PER_SPIN) {
      autoRemaining = 0;
      elements.autoBtn.setAttribute("aria-pressed", "false");
      setMessage("Auto stopped: you ran out of tokens. The house calls this “user retention”.", "warn");
      render();
      return;
    }

    autoRemaining -= 1;
    window.setTimeout(() => startSpin(), prefersReducedMotion ? 30 : 260);
  }

  function toggleAuto() {
    if (spinning) return;
    if (autoRemaining > 0) {
      autoRemaining = 0;
      elements.autoBtn.setAttribute("aria-pressed", "false");
      setMessage("Auto stopped. Manual clicks are artisanal.", "neutral");
      render();
      return;
    }
    autoRemaining = 10;
    elements.autoBtn.setAttribute("aria-pressed", "true");
    setMessage("Auto ×10 engaged. Delegating decision-making to the machine.", "neutral");
    render();
    continueAuto();
  }

  async function copyBrag() {
    if (!lastBrag) return;
    try {
      await navigator.clipboard.writeText(lastBrag);
      setMessage("Copied. Post it with the hashtag #DefinitelyNotGambling.", "good");
    } catch {
      // Fall back to a prompt if clipboard permission is blocked.
      window.prompt("Copy your brag:", lastBrag);
    }
  }

  function reset() {
    if (spinning) return;
    const ok = window.confirm("Reset tokens and stats? (The house loses your 'model improvements'.)");
    if (!ok) return;
    state = defaultState();
    autoRemaining = 0;
    lastBrag = "";
    clearWinGlow();
    setMessage("Reset complete. Fresh start. Same questionable choices.", "neutral");
    saveState();
    render();
  }

  function confettiBurst() {
    const canvas = elements.confetti;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    canvas.width = w;
    canvas.height = h;
    canvas.style.display = "block";

    const colors = ["#7c4dff", "#00e5ff", "#44ffb2", "#ffd166", "#ff4d6d"];
    const pieces = Array.from({ length: prefersReducedMotion ? 18 : 60 }, () => {
      const size = (6 + cryptoFloat() * 10) * dpr;
      return {
        x: w * 0.5 + (cryptoFloat() - 0.5) * w * 0.2,
        y: h * 0.2 + (cryptoFloat() - 0.5) * h * 0.08,
        vx: (cryptoFloat() - 0.5) * 9 * dpr,
        vy: (2 + cryptoFloat() * 10) * dpr,
        rot: cryptoFloat() * Math.PI,
        vr: (cryptoFloat() - 0.5) * 0.25,
        size,
        color: colors[Math.floor(cryptoFloat() * colors.length)],
      };
    });

    const gravity = 0.26 * dpr;
    const drag = 0.992;
    const start = performance.now();
    const duration = prefersReducedMotion ? 450 : 1100;

    function frame(now) {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      for (const p of pieces) {
        p.vy += gravity;
        p.vx *= drag;
        p.vy *= drag;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.55);
        ctx.restore();
      }

      if (t < duration) {
        requestAnimationFrame(frame);
      } else {
        canvas.style.display = "none";
      }
    }

    requestAnimationFrame(frame);
  }

  // Seed the reels with random symbols.
  for (const reel of elements.reels) setReelSymbol(reel, weightedPick(SYMBOLS));

  elements.spinBtn.addEventListener("click", startSpin);
  elements.autoBtn.addEventListener("click", toggleAuto);
  elements.shareBtn.addEventListener("click", copyBrag);
  elements.resetBtn.addEventListener("click", reset);

  window.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") {
      const active = document.activeElement;
      const isButton = active && active.tagName === "BUTTON";
      if (!isButton) return;
      // Let native button behavior handle it.
    } else if (e.key.toLowerCase() === "s") {
      // "S" to spin, because of course it is.
      if (!elements.spinBtn.disabled) startSpin();
    }
  });

  window.addEventListener("resize", () => {
    // Keeps confetti crisp after rotation / resize.
    if (elements.confetti) elements.confetti.style.display = "none";
  });

  render();
})();


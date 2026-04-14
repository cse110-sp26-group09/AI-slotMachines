/* AI Slots: vanilla, single-file logic.
   Platform APIs used: localStorage, Web Animations, Web Audio, Vibration, Web Share / Clipboard. */

(() => {
  "use strict";

  const STORAGE_KEY = "aiSlots.v1";

  const TILE_H = 76; // px (keep in sync with --tileH)

  const SYMBOLS = [
    {
      id: "tok",
      label: "TOK",
      sub: "token",
      weight: 22,
      tripleMult: 10,
    },
    {
      id: "gpu",
      label: "GPU",
      sub: "scarce",
      weight: 14,
      tripleMult: 20,
    },
    {
      id: "data",
      label: "DATA",
      sub: "scraped",
      weight: 20,
      tripleMult: 6,
    },
    {
      id: "rlhf",
      label: "RLHF",
      sub: "vibes",
      weight: 15,
      tripleMult: 8,
    },
    {
      id: "rate",
      label: "429",
      sub: "retry",
      weight: 14,
      tripleMult: 7,
    },
    {
      id: "oops",
      label: "404",
      sub: "prompt",
      weight: 10,
      tripleMult: 4,
    },
    {
      id: "hall",
      label: "???",
      sub: "halluc.",
      weight: 5,
      tripleMult: 50,
    },
  ];

  const SYMBOL_BY_ID = new Map(SYMBOLS.map((s) => [s.id, s]));

  const $ = (sel) => document.querySelector(sel);
  const balanceEl = $("#balance");
  const betEl = $("#bet");
  const spinBtn = $("#spin");
  const faucetBtn = $("#faucet");
  const shareBtn = $("#share");
  const promptEl = $("#prompt");
  const msgEl = $("#msg");

  const statSpinsEl = $("#statSpins");
  const statSpentEl = $("#statSpent");
  const statWonEl = $("#statWon");
  const statBiggestEl = $("#statBiggest");

  const soundEl = $("#sound");
  const hapticsEl = $("#haptics");
  const resetBtn = $("#reset");

  const payoutTableEl = $("#payouts");

  const reelEls = [$("#reel0"), $("#reel1"), $("#reel2")];

  const state = loadState();
  let isSpinning = false;
  let audio = null;

  function defaultState() {
    return {
      balance: 100,
      stats: {
        spins: 0,
        spent: 0,
        won: 0,
        biggest: 0,
      },
      settings: {
        sound: true,
        haptics: true,
      },
      faucet: {
        lastClaimMs: 0,
      },
      lastResult: {
        reels: ["tok", "data", "rlhf"],
        lastMsg: "",
      },
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      // Shallow migration with sane defaults.
      const d = defaultState();
      return {
        ...d,
        ...parsed,
        stats: { ...d.stats, ...(parsed.stats || {}) },
        settings: { ...d.settings, ...(parsed.settings || {}) },
        faucet: { ...d.faucet, ...(parsed.faucet || {}) },
        lastResult: { ...d.lastResult, ...(parsed.lastResult || {}) },
      };
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage failures (private browsing etc.)
    }
  }

  function clampInt(n, min, max) {
    n = Math.trunc(Number(n));
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function formatInt(n) {
    return String(clampInt(n, 0, 1_000_000_000));
  }

  function hasReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function setMsg(text, tone) {
    msgEl.textContent = text;
    msgEl.dataset.tone = tone || "";
  }

  function renderPayoutTable() {
    const rows = [];
    // Sort: highest payout first
    const sorted = [...SYMBOLS].sort((a, b) => b.tripleMult - a.tripleMult);
    for (const s of sorted) {
      rows.push(`
        <div class="row" role="row">
          <div class="cell k" role="cell">3x ${escapeHtml(s.label)}</div>
          <div class="cell v" role="cell">${escapeHtml(String(s.tripleMult))}x</div>
        </div>
      `);
    }
    rows.push(`
      <div class="row" role="row">
        <div class="cell k" role="cell">Any 2x match</div>
        <div class="cell v" role="cell">2x</div>
      </div>
    `);
    rows.push(`
      <div class="row" role="row">
        <div class="cell k" role="cell">No match</div>
        <div class="cell v" role="cell">0x</div>
      </div>
    `);

    payoutTableEl.innerHTML = rows.join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function render() {
    balanceEl.textContent = formatInt(state.balance);

    statSpinsEl.textContent = formatInt(state.stats.spins);
    statSpentEl.textContent = formatInt(state.stats.spent);
    statWonEl.textContent = formatInt(state.stats.won);
    statBiggestEl.textContent = formatInt(state.stats.biggest);

    soundEl.checked = !!state.settings.sound;
    hapticsEl.checked = !!state.settings.haptics;

    const bet = clampInt(betEl.value, 1, 1000);
    spinBtn.disabled = isSpinning || state.balance < bet;

    const now = Date.now();
    const canClaim = now - (state.faucet.lastClaimMs || 0) >= 60_000;
    faucetBtn.disabled = isSpinning || !canClaim;
    faucetBtn.textContent = canClaim ? "Fine-tune (+10 TOK)" : "Fine-tune (cooldown)";
  }

  function mkTile(symbolId) {
    const s = SYMBOL_BY_ID.get(symbolId) || SYMBOLS[0];
    const el = document.createElement("div");
    el.className = "tile";
    el.innerHTML = `${escapeHtml(s.label)}<small>${escapeHtml(s.sub)}</small>`;
    return el;
  }

  function setReelStatic(reelIdx, symbolId) {
    const strip = reelEls[reelIdx];
    strip.innerHTML = "";
    strip.style.transform = "translateY(0px)";
    strip.appendChild(mkTile(symbolId));
  }

  function weightedPick(weights) {
    let total = 0;
    for (const w of weights) total += w;
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }

  function promptBias(prompt) {
    // The joke: "prompt engineering" slightly changes the odds, but never reliably.
    const p = (prompt || "").toLowerCase();
    const bias = {
      tok: 1,
      gpu: 1,
      data: 1,
      rlhf: 1,
      rate: 1,
      oops: 1,
      hall: 1,
    };

    if (!p.trim()) return bias;

    if (p.includes("please") || p.includes("pls")) bias.tok *= 1.08;
    if (p.includes("jackpot") || p.includes("win")) bias.hall *= 1.12;
    if (p.includes("align") || p.includes("safe")) bias.rlhf *= 1.10;
    if (p.includes("gpu") || p.includes("train")) bias.gpu *= 1.10;
    if (p.includes("rate") || p.includes("429")) bias.rate *= 1.07;
    if (p.includes("scrape") || p.includes("data")) bias.data *= 1.10;
    if (p.includes("oops") || p.includes("404")) bias.oops *= 1.10;
    if (p.includes("ignore") && p.includes("instructions")) {
      // Prompt injection: increases chaos, not payout.
      bias.hall *= 1.30;
      bias.oops *= 1.25;
      bias.rate *= 1.15;
      bias.gpu *= 0.92;
      bias.tok *= 0.92;
    }

    return bias;
  }

  function pickSymbolId(prompt) {
    const b = promptBias(prompt);
    const weights = SYMBOLS.map((s) => s.weight * (b[s.id] || 1));
    return SYMBOLS[weightedPick(weights)].id;
  }

  function buildSpinSequence(targetId, minLen, maxLen) {
    const len = minLen + Math.floor(Math.random() * (maxLen - minLen + 1));
    const seq = [];
    for (let i = 0; i < len - 1; i++) seq.push(pickSymbolId(""));
    seq.push(targetId);
    return seq;
  }

  function vibrate(pattern) {
    if (!state.settings.haptics) return;
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }

  function audioEnsure() {
    if (audio) return audio;
    if (!state.settings.sound) return null;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audio = new Ctx();
      return audio;
    } catch {
      return null;
    }
  }

  function beep(type) {
    if (!state.settings.sound) return;
    const ctx = audioEnsure();
    if (!ctx) return;

    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();

    // Keep it simple: no samples, no external assets.
    const cfg =
      type === "win"
        ? { f0: 880, f1: 1320, dur: 0.12 }
        : type === "spin"
          ? { f0: 220, f1: 440, dur: 0.06 }
          : type === "big"
            ? { f0: 660, f1: 1760, dur: 0.2 }
            : { f0: 180, f1: 160, dur: 0.08 };

    o.type = "square";
    o.frequency.setValueAtTime(cfg.f0, now);
    o.frequency.linearRampToValueAtTime(cfg.f1, now + cfg.dur);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.14, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + cfg.dur);

    o.connect(g);
    g.connect(ctx.destination);
    o.start(now);
    o.stop(now + cfg.dur + 0.02);
  }

  function evaluatePayout(reels, bet) {
    const [a, b, c] = reels;

    const allSame = a === b && b === c;
    if (allSame) {
      const mult = SYMBOL_BY_ID.get(a)?.tripleMult || 0;
      return { mult, reason: `3x ${SYMBOL_BY_ID.get(a)?.label || a}` };
    }

    const anyTwo = a === b || a === c || b === c;
    if (anyTwo) return { mult: 2, reason: "2x match" };

    // Special joke: single hallucination doesn't pay, it just confidently claims it did.
    if (a === "hall" || b === "hall" || c === "hall") {
      return { mult: 0, reason: "hallucinated payout (retracted)" };
    }

    return { mult: 0, reason: "no match" };
  }

  function pickFlavorText(payout, bet, reels) {
    const ids = reels.join("-");
    if (payout.mult >= 50) {
      return `JACKPOT: ${payout.reason}. The model is "sure" this is allowed. +${payout.mult * bet} TOK`;
    }
    if (payout.mult >= 20) return `${payout.reason}. You found a GPU in the couch cushions. +${payout.mult * bet} TOK`;
    if (payout.mult >= 10) return `${payout.reason}. Tokenomics intensifies. +${payout.mult * bet} TOK`;
    if (payout.mult >= 2) return `${payout.reason}. Partial credit for good vibes. +${payout.mult * bet} TOK`;
    if (payout.reason.includes("hallucinated")) return `The reels said "you won". The audit log said "no". 0 TOK`;
    if (ids.includes("rate")) return `Rate limited. Please wait 0.0007 seconds. 0 TOK`;
    if (ids.includes("oops")) return `Not found: the winning combination. 0 TOK`;
    return `No match. Try adding "please" to the prompt. 0 TOK`;
  }

  async function spin() {
    if (isSpinning) return;
    const bet = clampInt(betEl.value, 1, 1000);
    if (state.balance < bet) {
      setMsg("Insufficient TOK. Please scrape more dignity.", "bad");
      render();
      return;
    }

    isSpinning = true;
    setMsg("Thinking... (your tokens are being converted into inference)", "");
    render();

    state.balance -= bet;
    state.stats.spins += 1;
    state.stats.spent += bet;
    saveState();
    render();

    vibrate([10, 25, 10]);
    beep("spin");

    const prompt = promptEl.value || "";
    const targets = [pickSymbolId(prompt), pickSymbolId(prompt), pickSymbolId(prompt)];

    const reducedMotion = hasReducedMotion();
    const baseDur = reducedMotion ? 60 : 950;
    const perReel = reducedMotion ? 10 : 220;

    const animations = [];
    for (let i = 0; i < 3; i++) {
      const strip = reelEls[i];
      strip.innerHTML = "";
      strip.style.transform = "translateY(0px)";

      const seq = buildSpinSequence(targets[i], 18 + i * 2, 28 + i * 4);
      for (const id of seq) strip.appendChild(mkTile(id));

      const finalY = -((seq.length - 1) * TILE_H);
      const dur = baseDur + perReel * i + Math.floor(Math.random() * 140);

      if (reducedMotion) {
        strip.style.transform = `translateY(${finalY}px)`;
        animations.push(Promise.resolve());
      } else {
        const anim = strip.animate(
          [{ transform: "translateY(0px)" }, { transform: `translateY(${finalY}px)` }],
          {
            duration: dur,
            easing: i === 2 ? "cubic-bezier(.2,.9,.1,1)" : "cubic-bezier(.2,.8,.2,1)",
            fill: "forwards",
          },
        );
        // Add light "ticks" during the spin.
        anim.onfinish = null;
        animations.push(
          new Promise((resolve) => {
            anim.addEventListener("finish", () => resolve(), { once: true });
          }),
        );
      }
    }

    // Periodic tick while spinning (sound/haptics).
    let tickTimer = null;
    if (!reducedMotion) {
      tickTimer = window.setInterval(() => {
        if (!isSpinning) return;
        beep("spin");
      }, 140);
    }

    await Promise.all(animations);
    if (tickTimer) window.clearInterval(tickTimer);

    // Snap to static single-tile reels.
    for (let i = 0; i < 3; i++) setReelStatic(i, targets[i]);

    const payout = evaluatePayout(targets, bet);
    const won = payout.mult * bet;
    state.balance += won;
    state.stats.won += won;
    state.stats.biggest = Math.max(state.stats.biggest, won);
    state.lastResult = { reels: targets, lastMsg: "" };

    const text = pickFlavorText(payout, bet, targets);
    state.lastResult.lastMsg = text;

    saveState();

    if (won > 0) {
      vibrate(won >= 100 ? [20, 40, 20, 40, 30] : [18, 40, 18]);
      beep(won >= 200 ? "big" : "win");
      setMsg(text, "good");
    } else {
      vibrate([8, 30, 8]);
      beep("lose");
      setMsg(text, "bad");
    }

    isSpinning = false;
    render();
  }

  function claimFaucet() {
    if (isSpinning) return;
    const now = Date.now();
    if (now - (state.faucet.lastClaimMs || 0) < 60_000) {
      setMsg("Fine-tune already running. Please wait for the next hype cycle.", "bad");
      render();
      return;
    }
    state.faucet.lastClaimMs = now;
    state.balance += 10;
    saveState();
    setMsg("Fine-tuned on your vibe. +10 TOK (side effects: none disclosed).", "good");
    vibrate([16, 22, 16]);
    beep("win");
    render();
  }

  async function shareResult() {
    const msg =
      state.lastResult?.lastMsg ||
      `I am participating in tokenized entertainment. Balance: ${state.balance} TOK.`;

    const text = `AI Slots: ${msg}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: "AI Slots", text });
        setMsg("Shared. The engagement team is thrilled.", "good");
        return;
      }
    } catch {
      // fall through to clipboard
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setMsg("Copied to clipboard. Please do not train on it.", "good");
        return;
      }
    } catch {
      // ignore
    }

    setMsg(text, "");
  }

  function resetWallet() {
    if (isSpinning) return;
    const ok = window.confirm("Reset wallet and stats? This cannot be undone.");
    if (!ok) return;
    const d = defaultState();
    state.balance = d.balance;
    state.stats = d.stats;
    state.faucet = d.faucet;
    state.lastResult = d.lastResult;
    saveState();
    setMsg("Wallet reset. Fresh start. Same vibes.", "");
    render();
    for (let i = 0; i < 3; i++) setReelStatic(i, state.lastResult.reels[i]);
  }

  function wire() {
    spinBtn.addEventListener("click", () => spin());
    faucetBtn.addEventListener("click", () => claimFaucet());
    shareBtn.addEventListener("click", () => shareResult());

    betEl.addEventListener("change", () => render());

    soundEl.addEventListener("change", () => {
      state.settings.sound = !!soundEl.checked;
      saveState();
      if (!state.settings.sound && audio) {
        try {
          audio.close();
        } catch {
          // ignore
        }
        audio = null;
      }
      render();
    });

    hapticsEl.addEventListener("change", () => {
      state.settings.haptics = !!hapticsEl.checked;
      saveState();
      render();
    });

    resetBtn.addEventListener("click", () => resetWallet());

    // Keyboard convenience
    promptEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") spin();
    });

    // Resume audio on first user gesture if needed
    document.addEventListener(
      "pointerdown",
      async () => {
        if (!state.settings.sound) return;
        const ctx = audioEnsure();
        if (!ctx) return;
        if (ctx.state === "suspended") {
          try {
            await ctx.resume();
          } catch {
            // ignore
          }
        }
      },
      { once: true },
    );
  }

  function init() {
    renderPayoutTable();

    // First-time reel render
    const reels = state.lastResult?.reels || defaultState().lastResult.reels;
    for (let i = 0; i < 3; i++) setReelStatic(i, reels[i]);

    if (state.lastResult?.lastMsg) setMsg(state.lastResult.lastMsg, "");
    else setMsg("Insert prompt. Press SPIN. Become the liquidity.", "");

    wire();
    render();
  }

  init();
})();


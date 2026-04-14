(() => {
  "use strict";

  const STORAGE_KEY = "ai_slots_state_v1";

  const symbols = [
    { glyph: "🤖", id: "bot", weight: 6 },
    { glyph: "🧠", id: "brain", weight: 8 },
    { glyph: "🪙", id: "token", weight: 7 },
    { glyph: "🐛", id: "bug", weight: 7 },
    { glyph: "🔥", id: "prompt", weight: 8 },
    { glyph: "🧵", id: "thread", weight: 8 },
    { glyph: "🧪", id: "lab", weight: 8 },
    { glyph: "🛑", id: "ratelimit", weight: 3 },
  ];

  const defaultState = () => ({
    tokens: 60,
    bet: 5,
    lifetimeEarned: 0,
    lifetimeSpent: 0,
    lastSpin: null,
    lastSeenAt: Date.now(),
    soundOn: true,
    announceOn: false,
  });

  const $ = (id) => document.getElementById(id);

  const ui = {
    reels: [$("reel0"), $("reel1"), $("reel2")],
    tokenBalance: $("tokenBalance"),
    lifetimeEarned: $("lifetimeEarned"),
    lifetimeSpent: $("lifetimeSpent"),
    spinBtn: $("spinBtn"),
    spinCostLabel: $("spinCostLabel"),
    autoBtn: $("autoBtn"),
    spendBtn: $("spendBtn"),
    soundToggle: $("soundToggle"),
    announceToggle: $("announceToggle"),
    shareBtn: $("shareBtn"),
    resetBtn: $("resetBtn"),
    statusBadge: $("statusBadge"),
    statusText: $("statusText"),
    spendDialog: $("spendDialog"),
  };

  const reelEls = ui.reels.map((el) => el.closest(".reel"));

  let state = loadState();
  let isSpinning = false;
  let autoTimer = null;
  let audio = null;

  bootstrapDailyComputeGrant();
  renderAll();
  wireEvents();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      const base = defaultState();
      return {
        ...base,
        ...parsed,
        tokens: clampInt(parsed.tokens ?? base.tokens, 0, 999999),
        bet: clampInt(parsed.bet ?? base.bet, 1, 10),
        lifetimeEarned: clampInt(parsed.lifetimeEarned ?? base.lifetimeEarned, 0, 99999999),
        lifetimeSpent: clampInt(parsed.lifetimeSpent ?? base.lifetimeSpent, 0, 99999999),
        soundOn: Boolean(parsed.soundOn ?? base.soundOn),
        announceOn: Boolean(parsed.announceOn ?? base.announceOn),
      };
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    const persist = {
      ...state,
      lastSeenAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persist));
  }

  function clampInt(value, min, max) {
    const n = Number.parseInt(String(value), 10);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function renderAll() {
    ui.tokenBalance.textContent = `${state.tokens.toLocaleString()} 🪙`;
    ui.lifetimeEarned.textContent = state.lifetimeEarned.toLocaleString();
    ui.lifetimeSpent.textContent = state.lifetimeSpent.toLocaleString();
    ui.spinCostLabel.textContent = `Costs ${state.bet} token${state.bet === 1 ? "" : "s"}`;
    ui.soundToggle.checked = state.soundOn;
    ui.announceToggle.checked = state.announceOn;
    setAutoUi(Boolean(autoTimer));
    renderBetButtons();
    saveState();
  }

  function renderBetButtons() {
    const buttons = document.querySelectorAll("button[data-bet]");
    buttons.forEach((btn) => {
      const bet = Number(btn.getAttribute("data-bet"));
      const isActive = bet === state.bet;
      btn.classList.toggle("isActive", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function setBusy(busy) {
    isSpinning = busy;
    ui.spinBtn.disabled = busy;
    ui.spendBtn.disabled = busy;
    const betButtons = document.querySelectorAll("button[data-bet]");
    betButtons.forEach((b) => (b.disabled = busy));
    reelEls.forEach((r) => r.classList.toggle("spinning", busy));
  }

  function setStatus(kind, text) {
    const badgeMap = {
      ready: "READY",
      spin: "SPINNING",
      win: "WIN",
      loss: "BURNED",
      warn: "NOTICE",
    };
    ui.statusBadge.textContent = badgeMap[kind] ?? "STATUS";
    ui.statusBadge.style.borderColor = "";
    ui.statusBadge.style.background = "";
    if (kind === "win") {
      ui.statusBadge.style.borderColor = "rgba(70,240,162,.55)";
      ui.statusBadge.style.background = "rgba(70,240,162,.12)";
    }
    if (kind === "loss") {
      ui.statusBadge.style.borderColor = "rgba(255,71,126,.55)";
      ui.statusBadge.style.background = "rgba(255,71,126,.10)";
    }
    if (kind === "warn") {
      ui.statusBadge.style.borderColor = "rgba(255,194,71,.55)";
      ui.statusBadge.style.background = "rgba(255,194,71,.10)";
    }
    ui.statusText.textContent = text;
  }

  function wireEvents() {
    ui.spinBtn.addEventListener("click", () => spin());
    ui.autoBtn.addEventListener("click", () => toggleAuto());
    ui.spendBtn.addEventListener("click", () => openSpendDialog());

    ui.soundToggle.addEventListener("change", () => {
      state.soundOn = ui.soundToggle.checked;
      if (state.soundOn) ensureAudio();
      renderAll();
    });
    ui.announceToggle.addEventListener("change", () => {
      state.announceOn = ui.announceToggle.checked;
      renderAll();
    });
    ui.shareBtn.addEventListener("click", () => shareLastSpin());
    ui.resetBtn.addEventListener("click", () => resetEverything());

    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const betStr = t.getAttribute("data-bet");
      if (!betStr) return;
      state.bet = clampInt(betStr, 1, 10);
      setStatus("ready", `Set spin cost to ${state.bet}. Your tokens are trembling.`);
      renderAll();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        spin();
        return;
      }
      if (e.key.toLowerCase() === "a") {
        toggleAuto();
        return;
      }
      if (e.key.toLowerCase() === "s") {
        openSpendDialog();
      }
    });

    ui.spendDialog.addEventListener("close", () => {
      const action = ui.spendDialog.returnValue;
      if (!action || action === "cancel") return;
      handleShopAction(action);
    });

    window.addEventListener("beforeunload", () => saveState());
  }

  function bootstrapDailyComputeGrant() {
    const now = Date.now();
    const last = Number(state.lastSeenAt || 0);
    const elapsed = now - last;
    const ONE_DAY = 24 * 60 * 60 * 1000;
    state.lastSeenAt = now;
    if (elapsed > ONE_DAY) {
      const grant = 20;
      state.tokens += grant;
      state.lifetimeEarned += grant;
      setStatus("warn", `Daily compute grant: +${grant} tokens. Please squander responsibly.`);
    } else {
      setStatus("ready", "Press Space to spin. Press A for auto. Press S to spend.");
    }
  }

  function ensureAudio() {
    if (audio) return audio;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      audio = new AudioCtx();
      return audio;
    } catch {
      return null;
    }
  }

  function beep(type) {
    if (!state.soundOn) return;
    const ctx = ensureAudio();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const presets = {
      tick: { f: 620, dur: 0.05, g: 0.05, kind: "square" },
      win: { f: 880, dur: 0.18, g: 0.06, kind: "triangle" },
      loss: { f: 180, dur: 0.22, g: 0.05, kind: "sawtooth" },
      warn: { f: 420, dur: 0.16, g: 0.05, kind: "square" },
    };
    const p = presets[type] ?? presets.tick;
    osc.type = p.kind;
    osc.frequency.setValueAtTime(p.f, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(p.g, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + p.dur);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + p.dur + 0.02);
  }

  function vibe(pattern) {
    if (!("vibrate" in navigator)) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }

  function weightedPick() {
    const total = symbols.reduce((sum, s) => sum + s.weight, 0);
    let r = Math.random() * total;
    for (const s of symbols) {
      r -= s.weight;
      if (r <= 0) return s;
    }
    return symbols[symbols.length - 1];
  }

  function computePayout(result, bet) {
    const glyphs = result.map((s) => s.glyph);
    if (glyphs.includes("🛑")) {
      return {
        multiplier: 0,
        delta: -1,
        label: "Rate-limited mid-spin. Support says: “try again later.” (-1 token)",
        kind: "warn",
      };
    }

    const [a, b, c] = glyphs;
    const allSame = a === b && b === c;
    if (allSame) {
      if (a === "🤖") return combo(20, "AGI achieved. Please update your résumé.");
      if (a === "🪙") return combo(10, "Token printer goes brrr.");
      if (a === "🐛") return combo(8, "Bug bounty secured (the bug is now a feature).");
      if (a === "🧠") return combo(6, "Reasoning tokens earned. Reasoning not included.");
      return combo(4, "Three of a kind. The demo is going great.");
    }

    const counts = new Map();
    for (const g of glyphs) counts.set(g, (counts.get(g) ?? 0) + 1);
    const hasPair = Array.from(counts.values()).some((n) => n === 2);
    if (hasPair) return combo(2, "Two match. Close enough for a benchmark chart.");

    return {
      multiplier: 0,
      delta: 0,
      label: "No match. Your tokens have been converted into “learning.”",
      kind: "loss",
    };

    function combo(multiplier, label) {
      const payout = multiplier * bet;
      return {
        multiplier,
        delta: payout,
        label: `${label} (+${payout} tokens)`,
        kind: "win",
      };
    }
  }

  async function spin() {
    if (isSpinning) return;
    if (state.tokens < state.bet) {
      beep("warn");
      vibe([30, 30, 30]);
      if (autoTimer) {
        clearInterval(autoTimer);
        autoTimer = null;
        setAutoUi(false);
      }
      setStatus(
        "warn",
        `Insufficient tokens. You need ${state.bet} but have ${state.tokens}. Try “Sell your data”.`,
      );
      return;
    }

    setBusy(true);
    setStatus("spin", "Spinning… sampling vibes from the latent casino space.");
    beep("tick");

    state.tokens -= state.bet;
    state.lifetimeSpent += state.bet;
    renderAll();

    const result = [weightedPick(), weightedPick(), weightedPick()];
    await animateSpin(result);

    const payout = computePayout(result, state.bet);
    if (payout.delta > 0) {
      state.tokens += payout.delta;
      state.lifetimeEarned += payout.delta;
      beep("win");
      vibe([20, 40, 20, 40, 40]);
    } else if (payout.delta < 0) {
      state.tokens = Math.max(0, state.tokens + payout.delta);
      state.lifetimeSpent += Math.abs(payout.delta);
      beep("warn");
      vibe([40, 30, 40]);
    } else {
      beep("loss");
      vibe([50]);
    }

    state.lastSpin = {
      at: Date.now(),
      bet: state.bet,
      result: result.map((s) => s.glyph),
      payout: payout.delta,
      label: payout.label,
    };

    setStatus(payout.kind, payout.label);
    if (state.announceOn) announce(payout);

    renderAll();
    setBusy(false);
  }

  function announce(payout) {
    if (!("speechSynthesis" in window)) return;
    const text =
      payout.kind === "win"
        ? "Winner. Tokens awarded."
        : payout.kind === "warn"
          ? "Notice. Rate limited."
          : "No win. Tokens burned.";
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.pitch = 1.05;
      window.speechSynthesis.speak(u);
    } catch {
      // ignore
    }
  }

  function animateSpin(finalSymbols) {
    const prefersReduced =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      finalSymbols.forEach((s, i) => (ui.reels[i].textContent = s.glyph));
      return Promise.resolve();
    }

    const durations = [650, 850, 1050];
    const start = performance.now();

    return new Promise((resolve) => {
      const tick = () => {
        const now = performance.now();
        for (let i = 0; i < 3; i++) {
          const t = now - start;
          if (t < durations[i]) ui.reels[i].textContent = weightedPick().glyph;
          else ui.reels[i].textContent = finalSymbols[i].glyph;
        }
        if (now - start < Math.max(...durations) + 70) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  function toggleAuto() {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
      setAutoUi(false);
      setStatus("ready", "Auto-spin disabled. Human agency restored (temporarily).");
      renderAll();
      return;
    }
    autoTimer = setInterval(() => {
      if (!isSpinning) spin();
    }, 1200);
    setAutoUi(true);
    setStatus("warn", "Auto-spin enabled. Your tokens are now on a subscription model.");
    renderAll();
  }

  function setAutoUi(on) {
    ui.autoBtn.setAttribute("aria-pressed", on ? "true" : "false");
    ui.autoBtn.textContent = on ? "Auto (on)" : "Auto (off)";
  }

  function openSpendDialog() {
    if (!ui.spendDialog || typeof ui.spendDialog.showModal !== "function") {
      alert("Your browser doesn't support <dialog>. Please spend tokens in your imagination.");
      return;
    }
    ui.spendDialog.showModal();
  }

  function handleShopAction(action) {
    const items = {
      "buy-gpu": { delta: -15, msg: "Rented GPU minutes. Fan noise increases. Accuracy does not." },
      "buy-context": { delta: -10, msg: "Context window expanded. Memory still selective." },
      "buy-safety": { delta: -8, msg: "Safety mode enabled. Output is now 73% disclaimers." },
      "sell-data": { delta: +12, msg: "Data sold. Congrats, you are the dataset." },
    };
    const item = items[action];
    if (!item) return;

    if (item.delta < 0 && state.tokens < Math.abs(item.delta)) {
      beep("warn");
      vibe([30, 30, 30]);
      setStatus("warn", "Not enough tokens for that. Try spinning or selling your data.");
      renderAll();
      return;
    }

    state.tokens = Math.max(0, state.tokens + item.delta);
    if (item.delta > 0) state.lifetimeEarned += item.delta;
    else state.lifetimeSpent += Math.abs(item.delta);

    beep(item.delta > 0 ? "win" : "tick");
    vibe(item.delta > 0 ? [20, 30, 20] : [15]);
    setStatus("warn", item.msg);
    renderAll();
  }

  async function shareLastSpin() {
    const last = state.lastSpin;
    if (!last) {
      setStatus("warn", "No spin yet. You can’t share the emptiness (legally).");
      return;
    }

    const when = new Date(last.at).toLocaleString();
    const result = last.result.join(" ");
    const text = `Token Burn Slot Machine\n${when}\nBet: ${last.bet}\nResult: ${result}\nPayout: ${last.payout}\n${last.label}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: "Token Burn Slot Machine", text });
        setStatus("ready", "Shared. Your friends will pretend they’re happy for you.");
        return;
      }
    } catch {
      // fall back
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setStatus("ready", "Copied to clipboard. Paste it into your group chat and watch the silence.");
        return;
      }
    } catch {
      // fall back
    }

    alert(text);
  }

  function resetEverything() {
    const ok = confirm("Reset tokens and stats? This cannot be un-burned.");
    if (!ok) return;
    state = defaultState();
    localStorage.removeItem(STORAGE_KEY);
    ui.reels[0].textContent = "🤖";
    ui.reels[1].textContent = "🧠";
    ui.reels[2].textContent = "🪙";
    setStatus("ready", "Reset complete. A fresh start for the same bad decisions.");
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
    renderAll();
  }
})();

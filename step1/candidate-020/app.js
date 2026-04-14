/* eslint-disable no-alert */
(() => {
  "use strict";

  const STORAGE_KEY = "ai-slotmachine:v1";

  const BASE_SPIN_COST = 5;
  const DATA_SELL_BONUS = 20;
  const DATA_SELL_COOLDOWN_MS = 60_000;

  const SYMBOLS = [
    { key: "robot", ch: "🤖", w: 10, p3: 40, p2: 6 },
    { key: "brain", ch: "🧠", w: 10, p3: 42, p2: 6 },
    { key: "fire", ch: "🔥", w: 8, p3: 46, p2: 7 },
    { key: "token", ch: "🪙", w: 7, p3: 60, p2: 10 },
    { key: "gpu", ch: "🖥️", w: 7, p3: 65, p2: 11 },
    { key: "paper", ch: "📄", w: 6, p3: 70, p2: 12 },
    { key: "wrench", ch: "🔧", w: 6, p3: 75, p2: 13 },
    { key: "safety", ch: "🛡️", w: 5, p3: 90, p2: 16 },
    { key: "hallucination", ch: "🫠", w: 4, p3: 0, p2: 0, special: "hallucinate" },
    { key: "unicorn", ch: "🦄", w: 1, p3: 420, p2: 0 }
  ];

  const LINES = [
    "The model is 98% confident, but also wrong.",
    "We trained on vibes. You won on vibes.",
    "Your winnings have been rate-limited. Please try again never.",
    "This payout is aligned with shareholder value.",
    "Sorry, I can’t do that. Anyway, here are your tokens.",
    "We have updated our Terms. You agreed by existing.",
    "Great result! I made it up.",
    "Congrats: you are now an enterprise customer."
  ];

  const $ = (id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing #${id}`);
    return el;
  };

  const els = {
    tokens: $("tokens"),
    streak: $("streak"),
    rtp: $("rtp"),
    spinCost: $("spinCost"),
    reelsWrap: document.querySelector(".reels"),
    reelEls: [$("reel0"), $("reel1"), $("reel2")],
    spinBtn: $("spinBtn"),
    autoBtn: $("autoBtn"),
    sellBtn: $("sellBtn"),
    resetBtn: $("resetBtn"),
    bet: $("bet"),
    prompt: $("prompt"),
    statusTitle: $("statusTitle"),
    statusBody: $("statusBody"),
    log: $("log"),
    shareBtn: $("shareBtn"),
    machine: document.querySelector(".machine")
  };

  /** @type {{tokens:number, streak:number, spins:number, spent:number, won:number, lastSell:number, lastWin:number}} */
  let state = loadState();
  let spinning = false;
  let autoSpinsRemaining = 0;
  let audioCtx = null;
  let lastOutcomeForShare = null;

  function clampInt(n, min, max) {
    return Math.max(min, Math.min(max, Math.trunc(n)));
  }

  function nowMs() {
    return Date.now();
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) throw new Error("no state");
      const parsed = JSON.parse(raw);
      return {
        tokens: clampInt(parsed.tokens ?? 50, 0, 1_000_000),
        streak: clampInt(parsed.streak ?? 0, 0, 1_000_000),
        spins: clampInt(parsed.spins ?? 0, 0, 1_000_000),
        spent: clampInt(parsed.spent ?? 0, 0, 10_000_000),
        won: clampInt(parsed.won ?? 0, 0, 10_000_000),
        lastSell: clampInt(parsed.lastSell ?? 0, 0, Number.MAX_SAFE_INTEGER),
        lastWin: clampInt(parsed.lastWin ?? 0, 0, Number.MAX_SAFE_INTEGER)
      };
    } catch {
      return {
        tokens: 50,
        streak: 0,
        spins: 0,
        spent: 0,
        won: 0,
        lastSell: 0,
        lastWin: 0
      };
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function weightedPick(items) {
    const total = items.reduce((sum, it) => sum + it.w, 0);
    let r = Math.random() * total;
    for (const it of items) {
      r -= it.w;
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  function betMultiplier() {
    const v = Number.parseInt(els.bet.value, 10);
    if (!Number.isFinite(v)) return 1;
    return clampInt(v, 1, 5);
  }

  function spinCost() {
    return BASE_SPIN_COST * betMultiplier();
  }

  function setDisabled(disabled) {
    els.spinBtn.disabled = disabled;
    els.bet.disabled = disabled;
    els.prompt.disabled = disabled;
    els.resetBtn.disabled = disabled;
    els.sellBtn.disabled = disabled && state.tokens > 0;
  }

  function setStatus(title, body, tone) {
    els.statusTitle.textContent = title;
    els.statusBody.textContent = body;
    if (!tone) return;
    if (tone === "win") {
      els.machine?.classList.remove("shake");
      els.machine?.classList.add("pulse");
      window.setTimeout(() => els.machine?.classList.remove("pulse"), 600);
    } else if (tone === "lose") {
      els.machine?.classList.remove("pulse");
      els.machine?.classList.add("shake");
      window.setTimeout(() => els.machine?.classList.remove("shake"), 500);
    }
  }

  function formatPct(n) {
    if (!Number.isFinite(n)) return "0%";
    return `${Math.round(n * 100)}%`;
  }

  function updateUI() {
    els.tokens.textContent = String(state.tokens);
    els.streak.textContent = `Streak: ${state.streak}`;
    els.spinCost.textContent = String(spinCost());
    const rtp = state.spent > 0 ? state.won / state.spent : 0;
    els.rtp.textContent = `RTP-ish: ${formatPct(rtp)}`;

    const remaining = Math.max(0, DATA_SELL_COOLDOWN_MS - (nowMs() - state.lastSell));
    if (remaining > 0) {
      els.sellBtn.disabled = true;
      els.sellBtn.textContent = `Sell my data (cooldown ${Math.ceil(remaining / 1000)}s)`;
    } else {
      els.sellBtn.disabled = false;
      els.sellBtn.textContent = `Sell my data (+${DATA_SELL_BONUS} 🪙)`;
    }

    if (autoSpinsRemaining > 0) {
      els.autoBtn.textContent = `Auto-spin (${autoSpinsRemaining} left)`;
    } else {
      els.autoBtn.textContent = "Auto-spin (A)";
    }
  }

  function logLine(text, kind) {
    const li = document.createElement("li");
    li.className = `log-item ${kind || ""}`.trim();
    li.textContent = text;
    const first = els.log.querySelector(".log-item.muted");
    if (first) first.remove();
    els.log.prepend(li);
    while (els.log.children.length > 20) els.log.lastElementChild?.remove();
  }

  function ensureAudio() {
    if (audioCtx) return audioCtx;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      return audioCtx;
    } catch {
      return null;
    }
  }

  function beep({ freq = 440, ms = 60, gain = 0.05, type = "sine" } = {}) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g);
    g.connect(ctx.destination);
    const t0 = ctx.currentTime;
    o.start(t0);
    o.stop(t0 + ms / 1000);
  }

  function vibrate(pattern) {
    try {
      if ("vibrate" in navigator) navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }

  function normalizeComboKeys(keys) {
    return keys.slice().sort().join("|");
  }

  function computePayout(picks, bet) {
    const keys = picks.map((p) => p.key);
    const hasHallucination = keys.includes("hallucination");
    const combo = normalizeComboKeys(keys);
    const agiCombo = normalizeComboKeys(["brain", "robot", "fire"]);

    /** @type {{payout:number, title:string, body:string, kind:"win"|"lose"}} */
    let result = { payout: 0, title: "Nope.", body: "The model calls this “working as intended”.", kind: "lose" };

    if (combo === agiCombo) {
      result = {
        payout: 100 * bet,
        title: "AGI demo!",
        body: "Investors clap. Ethics panel faints. Tokens appear.",
        kind: "win"
      };
    } else if (keys[0] === keys[1] && keys[1] === keys[2]) {
      const sym = picks[0];
      result = {
        payout: sym.p3 * bet,
        title: `Triple ${sym.ch}!`,
        body: "A rare moment of model consistency.",
        kind: "win"
      };
    } else if (keys[0] === keys[1] || keys[0] === keys[2] || keys[1] === keys[2]) {
      const matchKey = keys[0] === keys[1] ? keys[0] : keys[0] === keys[2] ? keys[0] : keys[1];
      const sym = SYMBOLS.find((s) => s.key === matchKey) || picks[0];
      const payout = (sym.p2 || 0) * bet;
      if (payout > 0) {
        result = {
          payout,
          title: `Two ${sym.ch}!`,
          body: "Not a jackpot, but it’ll train the habit loop.",
          kind: "win"
        };
      }
    }

    if (hasHallucination) {
      const coinflip = Math.random() < 0.5;
      if (coinflip) {
        result = {
          payout: 0,
          title: "Hallucination!",
          body: "The model says you won 10,000 tokens. Reality says “no”.",
          kind: "lose"
        };
      } else if (result.payout === 0) {
        result = {
          payout: 7 * bet,
          title: "Hallucination!",
          body: "The model thought you lost. It was just being dramatic. Here’s a consolation payout.",
          kind: "win"
        };
      } else {
        result = {
          payout: Math.max(1, Math.floor(result.payout * 0.6)),
          title: "Hallucination tax.",
          body: "Your win is real-ish. We rounded down for safety.",
          kind: result.payout > 0 ? "win" : "lose"
        };
      }
    }

    const hasSafety = keys.includes("safety");
    if (hasSafety && result.payout > 20 * bet) {
      result = {
        payout: 20 * bet,
        title: "Safety filter!",
        body: "We prevented excessive joy. Payout capped.",
        kind: "win"
      };
    }

    return result;
  }

  function setReelText(i, text) {
    els.reelEls[i].textContent = text;
  }

  function randomSymbolChar() {
    return SYMBOLS[(Math.random() * SYMBOLS.length) | 0].ch;
  }

  function animateReel(i, finalChar, durationMs) {
    return new Promise((resolve) => {
      const start = nowMs();
      const tickMs = 48 + i * 6;
      const timer = window.setInterval(() => {
        setReelText(i, randomSymbolChar());
        if (nowMs() - start > durationMs) {
          window.clearInterval(timer);
          setReelText(i, finalChar);
          resolve();
        }
      }, tickMs);
    });
  }

  async function spinOnce() {
    if (spinning) return;
    const bet = betMultiplier();
    const cost = BASE_SPIN_COST * bet;

    if (state.tokens < cost) {
      setStatus("Insufficient tokens.", "Try selling your data. It’s what the model would do.", "lose");
      beep({ freq: 160, ms: 120, type: "sawtooth", gain: 0.05 });
      vibrate([40, 30, 40]);
      return;
    }

    spinning = true;
    setDisabled(true);
    els.reelsWrap?.classList.add("spinning");
    lastOutcomeForShare = null;
    els.shareBtn.hidden = true;

    state.tokens -= cost;
    state.spent += cost;
    state.spins += 1;
    saveState();
    updateUI();

    beep({ freq: 420, ms: 50, gain: 0.03 });
    beep({ freq: 520, ms: 50, gain: 0.03 });

    const picks = [weightedPick(SYMBOLS), weightedPick(SYMBOLS), weightedPick(SYMBOLS)];
    const prompt = (els.prompt.value || "").trim();

    await Promise.all([
      animateReel(0, picks[0].ch, 650),
      animateReel(1, picks[1].ch, 920),
      animateReel(2, picks[2].ch, 1220)
    ]);

    els.reelsWrap?.classList.remove("spinning");

    const outcome = computePayout(picks, bet);
    state.tokens += outcome.payout;
    state.won += outcome.payout;

    if (outcome.payout > 0) {
      state.streak += 1;
      state.lastWin = nowMs();
      beep({ freq: 784, ms: 70, gain: 0.05, type: "triangle" });
      beep({ freq: 988, ms: 90, gain: 0.05, type: "triangle" });
      vibrate([20, 30, 70]);
    } else {
      state.streak = 0;
      beep({ freq: 220, ms: 130, gain: 0.04, type: "square" });
      vibrate([25, 25, 25]);
    }

    saveState();
    updateUI();

    const line = LINES[(Math.random() * LINES.length) | 0];
    const promptSuffix = prompt ? ` Prompt: “${prompt}”.` : "";
    const reelText = `${picks[0].ch} ${picks[1].ch} ${picks[2].ch}`;
    const payoutText = outcome.payout > 0 ? ` +${outcome.payout}🪙` : " +0🪙";
    logLine(`${reelText}${payoutText} — ${line}${promptSuffix}`, outcome.payout > 0 ? "win" : "lose");

    setStatus(outcome.title, `${outcome.body} ${line}`, outcome.payout > 0 ? "win" : "lose");

    lastOutcomeForShare =
      outcome.payout > 0
        ? { payout: outcome.payout, reels: reelText, prompt, title: outcome.title }
        : null;

    if (lastOutcomeForShare && lastOutcomeForShare.payout >= 50) {
      els.shareBtn.hidden = !("share" in navigator);
    }

    spinning = false;
    setDisabled(false);

    if (autoSpinsRemaining > 0) {
      autoSpinsRemaining -= 1;
      updateUI();
      if (state.tokens >= spinCost()) {
        window.setTimeout(spinOnce, 250);
      } else {
        stopAuto();
        setStatus("Auto-spin stopped.", "Out of tokens. The model suggests “more funding”.", "lose");
      }
    } else {
      stopAuto(false);
    }
  }

  function startAuto() {
    if (autoSpinsRemaining > 0) return;
    autoSpinsRemaining = 10;
    els.autoBtn.setAttribute("aria-pressed", "true");
    updateUI();
    spinOnce();
  }

  function stopAuto(updateButton = true) {
    autoSpinsRemaining = 0;
    els.autoBtn.setAttribute("aria-pressed", "false");
    if (updateButton) updateUI();
  }

  function trySellData() {
    const remaining = DATA_SELL_COOLDOWN_MS - (nowMs() - state.lastSell);
    if (remaining > 0) {
      setStatus(
        "Data sale pending.",
        `Please wait ${Math.ceil(remaining / 1000)}s. Privacy takes time to dismantle.`,
        "lose"
      );
      beep({ freq: 240, ms: 90, gain: 0.03 });
      return;
    }
    state.tokens += DATA_SELL_BONUS;
    state.lastSell = nowMs();
    saveState();
    updateUI();
    setStatus("Congrats!", `You sold your browsing history for +${DATA_SELL_BONUS} tokens.`, "win");
    logLine(`🧾 Data sold +${DATA_SELL_BONUS}🪙 — Consent obtained via vibes.`, "win");
    beep({ freq: 660, ms: 70, gain: 0.04, type: "triangle" });
    vibrate([15, 35, 15]);
  }

  function resetAll() {
    const ok = window.confirm("Factory reset? This deletes your tokens and stats. (The model approves.)");
    if (!ok) return;
    localStorage.removeItem(STORAGE_KEY);
    state = loadState();
    updateUI();
    setStatus("Reset complete.", "Back to 50 tokens. Like nothing ever happened.", "win");
    els.log.innerHTML = "";
    logLine("System reset — weights reinitialized. Morals unchanged.", "lose");
    setReelText(0, "…");
    setReelText(1, "…");
    setReelText(2, "…");
  }

  async function shareLastWin() {
    if (!lastOutcomeForShare) return;
    if (!("share" in navigator)) return;
    try {
      const { payout, reels, prompt, title } = lastOutcomeForShare;
      const text = `${title} ${reels} (+${payout}🪙) in TokenGobbler 3000.${prompt ? ` Prompt: \"${prompt}\"` : ""}`;
      await navigator.share({ title: "TokenGobbler 3000", text });
    } catch {
      // ignore
    }
  }

  function attachEvents() {
    els.spinBtn.addEventListener("click", () => spinOnce());
    els.autoBtn.addEventListener("click", () => {
      if (autoSpinsRemaining > 0) stopAuto();
      else startAuto();
      updateUI();
    });
    els.sellBtn.addEventListener("click", () => trySellData());
    els.resetBtn.addEventListener("click", () => resetAll());
    els.bet.addEventListener("change", () => {
      updateUI();
      setStatus("Bet updated.", `Spin cost is now ${spinCost()} tokens.`, "win");
    });
    els.shareBtn.addEventListener("click", () => shareLastWin());

    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || tag === "select";
      if (typing) return;

      if (e.code === "Space") {
        e.preventDefault();
        spinOnce();
      } else if (e.key.toLowerCase() === "a") {
        e.preventDefault();
        if (autoSpinsRemaining > 0) stopAuto();
        else startAuto();
      }
    });
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch {
      // ignore
    }
  }

  function init() {
    setReelText(0, "🤖");
    setReelText(1, "🪙");
    setReelText(2, "🧠");

    attachEvents();
    updateUI();
    setStatus("Ready.", "Spin to spend tokens and maybe win them back. Totally not addictive.", "win");
    registerServiceWorker();
    window.setInterval(updateUI, 250);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

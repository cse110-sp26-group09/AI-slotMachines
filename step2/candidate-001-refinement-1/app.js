(() => {
  "use strict";

  const STORAGE_KEY = "ai_slot_machine_v1";

  const SYMBOLS = [
    { id: "TOKEN", glyph: "🪙", label: "Token", weight: 24, triple: 5 },
    { id: "BOT", glyph: "🤖", label: "Bot", weight: 18, triple: 8 },
    { id: "GPU", glyph: "🔥", label: "GPU Fire", weight: 14, triple: 12 },
    { id: "BRAIN", glyph: "🧠", label: "Reasoning", weight: 10, triple: 20 },
    { id: "BUG", glyph: "🪲", label: "Bug", weight: 12, triple: 10 },
    { id: "UNICORN", glyph: "🦄", label: "Hallucination", weight: 4, triple: 50 },
    { id: "INVOICE", glyph: "🧾", label: "Invoice", weight: 10, triple: -8 },
    { id: "SUB", glyph: "💸", label: "Subscription", weight: 8, triple: -12 },
  ];

  const DEFAULT_STATE = {
    balance: 100,
    debt: 0,
    bet: 5,
    mute: false,
    lastDailyClaimISO: "",
    lastResult: null,
    log: [],
  };

  const el = {
    balance: document.getElementById("balance"),
    debt: document.getElementById("debt"),
    message: document.getElementById("message"),
    log: document.getElementById("log"),
    bet: document.getElementById("bet"),
    betOut: document.getElementById("betOut"),
    spinBtn: document.getElementById("spinBtn"),
    maxBtn: document.getElementById("maxBtn"),
    dailyBtn: document.getElementById("dailyBtn"),
    borrowBtn: document.getElementById("borrowBtn"),
    muteBtn: document.getElementById("muteBtn"),
    shareBtn: document.getElementById("shareBtn"),
    resetBtn: document.getElementById("resetBtn"),
    srStatus: document.getElementById("srStatus"),
    reels: [document.getElementById("reel0"), document.getElementById("reel1"), document.getElementById("reel2")],
  };

  function clampInt(value, min, max) {
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function nowISODate() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_STATE };
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_STATE,
        ...parsed,
        balance: clampInt(parsed.balance ?? DEFAULT_STATE.balance, 0, 1_000_000),
        debt: clampInt(parsed.debt ?? DEFAULT_STATE.debt, 0, 1_000_000),
        bet: clampInt(parsed.bet ?? DEFAULT_STATE.bet, 1, 25),
        log: Array.isArray(parsed.log) ? parsed.log.slice(0, 25) : [],
      };
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }

  function addLog(line) {
    state.log.unshift(line);
    state.log = state.log.slice(0, 25);
    renderLog();
    saveState();
  }

  function renderLog() {
    el.log.innerHTML = "";
    for (const line of state.log) {
      const li = document.createElement("li");
      li.textContent = line;
      el.log.appendChild(li);
    }
  }

  function setMessage(text, srText = "") {
    el.message.textContent = text;
    if (srText) el.srStatus.textContent = srText;
  }

  function updateMoney() {
    el.balance.textContent = String(state.balance);
    el.debt.textContent = String(state.debt);
  }

  function setControlsDisabled(disabled) {
    for (const btn of [el.spinBtn, el.maxBtn, el.dailyBtn, el.borrowBtn, el.shareBtn, el.resetBtn]) {
      btn.disabled = disabled;
    }
    el.bet.disabled = disabled;
  }

  function setMuteButton() {
    el.muteBtn.setAttribute("aria-pressed", state.mute ? "true" : "false");
    el.muteBtn.textContent = `Sound: ${state.mute ? "Off" : "On"}`;
  }

  function hasCryptoRng() {
    return typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function";
  }

  function randomUnit() {
    if (!hasCryptoRng()) return Math.random();
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 0xffffffff;
  }

  function pickWeightedSymbol() {
    const total = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
    let r = randomUnit() * total;
    for (const s of SYMBOLS) {
      r -= s.weight;
      if (r <= 0) return s;
    }
    return SYMBOLS[SYMBOLS.length - 1];
  }

  function vib(pattern) {
    try {
      if ("vibrate" in navigator) navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }

  let audioCtx = null;

  function ensureAudio() {
    if (state.mute) return null;
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function beep({ type = "sine", freq = 440, durationMs = 80, gain = 0.04 } = {}) {
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
    osc.stop(t0 + durationMs / 1000);
  }

  function sfxSpinTick() {
    beep({ type: "square", freq: 540, durationMs: 28, gain: 0.02 });
  }

  function sfxWin() {
    beep({ type: "triangle", freq: 740, durationMs: 100, gain: 0.05 });
    setTimeout(() => beep({ type: "triangle", freq: 980, durationMs: 120, gain: 0.05 }), 90);
  }

  function sfxLose() {
    beep({ type: "sawtooth", freq: 240, durationMs: 120, gain: 0.04 });
    setTimeout(() => beep({ type: "sawtooth", freq: 180, durationMs: 160, gain: 0.03 }), 80);
  }

  function setReelGlyph(reelIndex, glyph) {
    const node = el.reels[reelIndex].querySelector(".symbol");
    node.textContent = glyph;
  }

  function clearReelHighlights() {
    for (const reel of el.reels) reel.classList.remove("isLocked", "isBad");
  }

  function formatDelta(n) {
    if (n > 0) return `+${n}`;
    return String(n);
  }

  function computePayout(symbols, bet) {
    const ids = symbols.map((s) => s.id);
    const isTriple = ids[0] === ids[1] && ids[1] === ids[2];
    if (isTriple) {
      const mult = symbols[0].triple;
      return { delta: bet * mult, kind: mult >= 0 ? "win" : "bad", reason: "triple", mult };
    }

    const counts = new Map();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    const hasPair = Array.from(counts.values()).some((c) => c === 2);
    if (hasPair) return { delta: bet * 2, kind: "pair", reason: "pair", mult: 2 };
    return { delta: 0, kind: "none", reason: "none", mult: 0 };
  }

  function roastForResult(symbols, payout) {
    const glyphs = symbols.map((s) => s.glyph).join(" ");
    const base = `Reels: ${glyphs}.`;
    if (payout.reason === "none") return `${base} No match. Your context window was too small to remember how to win.`;
    if (payout.reason === "pair")
      return `${base} Two of a kind. Shipping “good enough” to production: ${formatDelta(payout.delta)} tokens.`;

    const id = symbols[0].id;
    if (id === "UNICORN")
      return `${base} Hallucination jackpot! You are 100% confident and 50× correct: ${formatDelta(payout.delta)} tokens.`;
    if (id === "BRAIN") return `${base} Actual reasoning detected. Please remain calm: ${formatDelta(payout.delta)} tokens.`;
    if (id === "GPU")
      return `${base} GPUs go brrr. Your fan curve is a suggestion: ${formatDelta(payout.delta)} tokens.`;
    if (id === "BOT") return `${base} The model “understood” you. (It didn’t, but still): ${formatDelta(payout.delta)} tokens.`;
    if (id === "BUG")
      return `${base} Bug bounty paid. Congratulations on discovering undefined behavior: ${formatDelta(payout.delta)} tokens.`;
    if (id === "INVOICE") return `${base} Invoice received. You were billed for “safety”. ${formatDelta(payout.delta)} tokens.`;
    if (id === "SUB")
      return `${base} Subscription renewed. You accepted the terms by existing. ${formatDelta(payout.delta)} tokens.`;
    if (id === "TOKEN") return `${base} Token synergy. Your prompt was “please”. ${formatDelta(payout.delta)} tokens.`;
    return `${base} Something happened: ${formatDelta(payout.delta)} tokens.`;
  }

  function setLatestResult(symbols, bet, payout) {
    state.lastResult = {
      ts: Date.now(),
      symbols: symbols.map((s) => s.glyph),
      bet,
      delta: payout.delta,
      reason: payout.reason,
    };
  }

  function renderBet() {
    el.bet.value = String(state.bet);
    el.betOut.textContent = String(state.bet);
  }

  function setSpinButtonLabel() {
    el.spinBtn.textContent = state.balance <= 0 ? "Out of Tokens" : "Spin";
  }

  async function spin() {
    if (isSpinning) return;
    const bet = clampInt(state.bet, 1, 25);
    if (state.balance < bet) {
      setMessage("Insufficient tokens. Consider borrowing. (This is not financial advice.)", "Insufficient tokens");
      sfxLose();
      vib([20, 40, 20]);
      return;
    }

    isSpinning = true;
    clearReelHighlights();
    setControlsDisabled(true);
    setSpinButtonLabel();

    state.balance -= bet;
    updateMoney();
    addLog(`Spent ${bet} tokens (bet).`);
    setMessage("Spinning… optimizing prompt…", "Spinning");
    sfxSpinTick();

    const finalSymbols = [pickWeightedSymbol(), pickWeightedSymbol(), pickWeightedSymbol()];
    const startMs = performance.now();

    const stopAfterMs = [820, 1080, 1340];
    const tickEveryMs = 56;

    for (let i = 0; i < 3; i++) el.reels[i].classList.add("isSpinning");

    await Promise.all(
      [0, 1, 2].map((reelIndex) => {
        return new Promise((resolve) => {
          const reel = el.reels[reelIndex];
          let lastTick = 0;

          const frame = (t) => {
            const elapsed = t - startMs;
            if (elapsed >= stopAfterMs[reelIndex]) {
              reel.classList.remove("isSpinning");
              setReelGlyph(reelIndex, finalSymbols[reelIndex].glyph);
              sfxSpinTick();
              resolve();
              return;
            }
            if (t - lastTick > tickEveryMs) {
              lastTick = t;
              const s = pickWeightedSymbol();
              setReelGlyph(reelIndex, s.glyph);
              if (reelIndex === 2) sfxSpinTick();
            }
            requestAnimationFrame(frame);
          };

          requestAnimationFrame(frame);
        });
      })
    );

    const payout = computePayout(finalSymbols, bet);
    state.balance = clampInt(state.balance + payout.delta, 0, 1_000_000);

    if (payout.kind === "win" || payout.kind === "pair") {
      sfxWin();
      vib([25, 25, 45]);
      el.reels.forEach((r) => r.classList.add("isLocked"));
    } else if (payout.kind === "bad") {
      sfxLose();
      vib([60]);
      el.reels.forEach((r) => r.classList.add("isBad"));
    } else {
      sfxLose();
      vib([20, 40, 20]);
    }

    const line = roastForResult(finalSymbols, payout);
    setMessage(line, `Result: ${finalSymbols.map((s) => s.label).join(", ")}. Token change ${formatDelta(payout.delta)}.`);
    addLog(`${finalSymbols.map((s) => s.glyph).join(" ")} → ${formatDelta(payout.delta)} (bet ${bet})`);
    setLatestResult(finalSymbols, bet, payout);
    updateMoney();
    saveState();
    setSpinButtonLabel();

    isSpinning = false;
    setControlsDisabled(false);
  }

  function setMaxBet() {
    state.bet = 25;
    renderBet();
    saveState();
    beep({ type: "triangle", freq: 660, durationMs: 70, gain: 0.03 });
  }

  function claimDaily() {
    const today = nowISODate();
    if (state.lastDailyClaimISO === today) {
      setMessage(
        "Daily already claimed. Come back tomorrow (or change the system clock, you monster).",
        "Daily already claimed"
      );
      beep({ type: "sine", freq: 260, durationMs: 90, gain: 0.03 });
      return;
    }

    const grant = 30 + Math.floor(randomUnit() * 41); // 30..70
    state.balance = clampInt(state.balance + grant, 0, 1_000_000);
    state.lastDailyClaimISO = today;
    updateMoney();
    addLog(`Claimed daily ${grant} tokens.`);
    setMessage(`Daily tokens delivered: +${grant}. The model thanks you for your continued patronage.`, `Daily claimed +${grant}`);
    sfxWin();
    saveState();
  }

  function borrowTokens() {
    const principal = 100;
    const interest = 25;
    state.balance = clampInt(state.balance + principal, 0, 1_000_000);
    state.debt = clampInt(state.debt + principal + interest, 0, 1_000_000);
    updateMoney();
    addLog(`Borrowed ${principal} tokens (+${interest} interest).`);
    setMessage(
      `Borrowed +${principal} tokens. Added +${principal + interest} debt. Congratulations, you invented “AI finance”.`,
      "Borrowed tokens"
    );
    beep({ type: "square", freq: 320, durationMs: 80, gain: 0.03 });
    saveState();
  }

  function toggleMute() {
    state.mute = !state.mute;
    if (state.mute && audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
    setMuteButton();
    saveState();
  }

  async function shareLatest() {
    if (!state.lastResult) {
      setMessage("Nothing to share yet. Spin first.", "Nothing to share");
      return;
    }

    const r = state.lastResult;
    const when = new Date(r.ts).toLocaleString();
    const text =
      `AI Token Slot Machine\n` +
      `Reels: ${r.symbols.join(" ")}\n` +
      `Bet: ${r.bet}\n` +
      `Delta: ${formatDelta(r.delta)}\n` +
      `When: ${when}\n` +
      `Balance: ${state.balance} (Debt: ${state.debt})`;

    try {
      if (navigator.share) {
        await navigator.share({ title: "AI Token Slot Machine", text });
        addLog("Shared result via share sheet.");
        return;
      }
    } catch {
      // fall back to clipboard
    }

    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copied result to clipboard. Paste it into your favorite group chat to lose friends faster.", "Copied to clipboard");
      addLog("Copied result to clipboard.");
      beep({ type: "triangle", freq: 880, durationMs: 70, gain: 0.03 });
    } catch {
      setMessage("Could not share/copy (clipboard permissions). Your result remains proprietary.", "Share failed");
      sfxLose();
    }
  }

  function resetAll() {
    const ok = confirm("Reset balance, debt, bet, and log? This cannot be un-hallucinated.");
    if (!ok) return;
    state = { ...DEFAULT_STATE };
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    renderAll();
    setMessage("Reset complete. A fresh start, just like your model after catastrophic forgetting.", "Reset complete");
    beep({ type: "sine", freq: 520, durationMs: 90, gain: 0.03 });
  }

  function payDebtIfPossible() {
    if (state.debt <= 0) return;
    const pay = Math.min(state.debt, Math.max(0, state.balance - 10));
    if (pay <= 0) return;
    state.balance -= pay;
    state.debt -= pay;
    addLog(`Auto-paid ${pay} debt (rate limit fee).`);
  }

  function renderAll() {
    updateMoney();
    renderBet();
    renderLog();
    setMuteButton();
    setSpinButtonLabel();
  }

  let state = loadState();
  let isSpinning = false;

  payDebtIfPossible();
  saveState();
  renderAll();

  el.bet.addEventListener("input", () => {
    state.bet = clampInt(el.bet.value, 1, 25);
    el.betOut.textContent = String(state.bet);
    saveState();
  });

  el.spinBtn.addEventListener("click", () => void spin());
  el.maxBtn.addEventListener("click", setMaxBet);
  el.dailyBtn.addEventListener("click", claimDaily);
  el.borrowBtn.addEventListener("click", borrowTokens);
  el.muteBtn.addEventListener("click", toggleMute);
  el.shareBtn.addEventListener("click", () => void shareLatest());
  el.resetBtn.addEventListener("click", resetAll);

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      e.preventDefault();
      void spin();
    }
  });

  if (!state.log.length && state.balance === DEFAULT_STATE.balance) {
    addLog("Booted model: GPT-OVERFIT-7B (definitely real).");
    addLog('Loaded prompt: “Please be lucky.”');
    setMessage("Ready. Press Spin to spend tokens in pursuit of vibes.", "Ready");
  }
})();


(() => {
  "use strict";

  const SYMBOLS = [
    { icon: "🧠", name: "Brain", weight: 10, payout3: 20 },
    { icon: "⚡", name: "GPU", weight: 14, payout3: 15 },
    { icon: "🪙", name: "Token", weight: 18, payout3: 10 },
    { icon: "🤖", name: "Bot", weight: 18, payout3: 8 },
    { icon: "🧾", name: "Invoice", weight: 15, payout3: 6 },
    { icon: "🔥", name: "Hot take", weight: 13, payout3: 5 },
    { icon: "🐛", name: "Bug", weight: 12, payout3: 4 },
    { icon: "🌀", name: "Hallucination (Wild)", weight: 3, payout3: 50, wild: true },
  ];

  const TWO_KIND_MULT = 2;
  const START_BALANCE = 1000;

  const STORAGE_KEY = "ai_slot_machine_v1";

  const $ = (id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };

  const els = {
    balance: $("balance"),
    bet: $("bet"),
    betValue: $("betValue"),
    spinBtn: $("spinBtn"),
    maxBtn: $("maxBtn"),
    resetBtn: $("resetBtn"),
    message: $("message"),
    reelFaces: [$("reel0"), $("reel1"), $("reel2")],
    soundToggle: $("soundToggle"),
    hapticsToggle: $("hapticsToggle"),
    logList: $("logList"),
  };

  const reelContainers = Array.from(document.querySelectorAll(".reel"));

  const state = loadState();

  let spinning = false;
  let audio = null;

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function formatInt(n) {
    return Math.max(0, Math.floor(n)).toLocaleString();
  }

  function weightedPick(items) {
    let total = 0;
    for (const it of items) total += it.weight;
    let r = Math.random() * total;
    for (const it of items) {
      r -= it.weight;
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshState();
      const parsed = JSON.parse(raw);
      return {
        balance: typeof parsed.balance === "number" ? parsed.balance : START_BALANCE,
        bet: typeof parsed.bet === "number" ? parsed.bet : 25,
        sound: typeof parsed.sound === "boolean" ? parsed.sound : false,
        haptics: typeof parsed.haptics === "boolean" ? parsed.haptics : true,
        lastResult: Array.isArray(parsed.lastResult) ? parsed.lastResult : ["🤖", "🧠", "⚡"],
      };
    } catch {
      return freshState();
    }
  }

  function freshState() {
    return {
      balance: START_BALANCE,
      bet: 25,
      sound: false,
      haptics: true,
      lastResult: ["🤖", "🧠", "⚡"],
    };
  }

  function saveState() {
    const payload = {
      balance: state.balance,
      bet: state.bet,
      sound: state.sound,
      haptics: state.haptics,
      lastResult: state.lastResult,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore (private mode / storage full)
    }
  }

  function setMessage(text, tone = "normal") {
    els.message.textContent = text;
    els.message.dataset.tone = tone;
  }

  function logEvent(text, tone = "normal") {
    const li = document.createElement("li");
    li.textContent = text;
    if (tone !== "normal") li.className = "muted";
    els.logList.prepend(li);
    while (els.logList.children.length > 18) {
      els.logList.lastElementChild?.remove();
    }
  }

  function render() {
    state.bet = clamp(state.bet, 5, 200);
    state.balance = clamp(state.balance, 0, Number.MAX_SAFE_INTEGER);

    els.balance.textContent = formatInt(state.balance);
    els.bet.value = String(state.bet);
    els.betValue.textContent = formatInt(state.bet);

    els.soundToggle.checked = !!state.sound;
    els.hapticsToggle.checked = !!state.haptics;

    for (let i = 0; i < 3; i++) {
      els.reelFaces[i].textContent = state.lastResult[i] ?? "🤖";
    }
  }

  function audioEnsure() {
    if (audio) return audio;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audio = { ctx };
    return audio;
  }

  function beep(type = "tick") {
    if (!state.sound) return;
    try {
      const { ctx } = audioEnsure();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const f =
        type === "win" ? 660 :
        type === "lose" ? 110 :
        type === "tick" ? 240 :
        220;

      osc.type = type === "win" ? "triangle" : "square";
      osc.frequency.setValueAtTime(f, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(type === "win" ? 0.08 : 0.05, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (type === "win" ? 0.18 : 0.08));

      osc.start(now);
      osc.stop(now + (type === "win" ? 0.2 : 0.1));
    } catch {
      // ignore audio errors
    }
  }

  function buzz(pattern) {
    if (!state.haptics) return;
    if (!("vibrate" in navigator)) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }

  function evaluatePayout(resultIcons) {
    const isWild = (icon) => icon === "🌀";
    const byIcon = new Map(SYMBOLS.map((s) => [s.icon, s]));

    // 429 rate-limit event is handled elsewhere; this is for real results.
    const a = resultIcons[0];
    const b = resultIcons[1];
    const c = resultIcons[2];

    const wildCount = [a, b, c].filter(isWild).length;
    if (wildCount === 3) return { multiplier: byIcon.get("🌀").payout3, kind: "three", base: "🌀" };

    // Determine best 3-of-kind with wild substitution
    // If there are wilds, pick the most valuable non-wild among the reels.
    const nonWild = [a, b, c].filter((x) => !isWild(x));
    const allSame = (x, y, z) => x === y && y === z;

    if (allSame(a, b, c)) {
      const sym = byIcon.get(a);
      return { multiplier: sym?.payout3 ?? 0, kind: "three", base: a };
    }

    if (wildCount > 0) {
      // Check if wild(s) can form 3-of-kind
      // e.g. 🌀 X X or 🌀 🌀 X
      const candidates = new Set(nonWild);
      for (const icon of candidates) {
        const count = [a, b, c].filter((x) => x === icon || isWild(x)).length;
        if (count === 3) {
          const sym = byIcon.get(icon);
          return { multiplier: sym?.payout3 ?? 0, kind: "three", base: icon };
        }
      }
    }

    // Two-of-a-kind consolation (no wilds; otherwise it's too generous).
    if (wildCount === 0) {
      if (a === b) return { multiplier: TWO_KIND_MULT, kind: "two", base: a };
      if (a === c) return { multiplier: TWO_KIND_MULT, kind: "two", base: a };
      if (b === c) return { multiplier: TWO_KIND_MULT, kind: "two", base: b };
    }

    return { multiplier: 0, kind: "none", base: null };
  }

  function setSpinning(on) {
    for (const reel of reelContainers) {
      reel.classList.toggle("spinning", on);
    }
    spinning = on;
    els.spinBtn.disabled = on;
    els.maxBtn.disabled = on;
    els.resetBtn.disabled = on;
    els.bet.disabled = on;
  }

  function spinOnce() {
    if (spinning) return;
    if (state.bet > state.balance) {
      setMessage("Insufficient tokens. Try a smaller prompt.", "warn");
      beep("lose");
      buzz([40]);
      return;
    }

    // Spend tokens up front (like a real API call).
    state.balance -= state.bet;
    render();
    saveState();

    setSpinning(true);
    setMessage("Generating... (temperature: too high)", "normal");
    logEvent(`- ${formatInt(state.bet)} tokens: prompt sent to the void.`, "muted");
    beep("tick");

    // 6% chance: rate-limited; refund bet; show locks.
    const rateLimited = Math.random() < 0.06;

    const result = rateLimited
      ? ["🔒", "4️⃣", "2️⃣"]
      : [weightedPick(SYMBOLS).icon, weightedPick(SYMBOLS).icon, weightedPick(SYMBOLS).icon];

    const durations = [650, 860, 1060];
    for (let i = 0; i < 3; i++) {
      window.setTimeout(() => {
        els.reelFaces[i].textContent = result[i];
        beep("tick");
      }, durations[i]);
    }

    window.setTimeout(() => {
      setSpinning(false);

      if (rateLimited) {
        state.balance += state.bet;
        setMessage("429: Rate limited. Please try again after you buy the Pro plan.", "warn");
        logEvent("Refund issued. Also, your dignity was not refunded.", "muted");
        beep("lose");
        buzz([60, 50, 60]);
        render();
        saveState();
        return;
      }

      state.lastResult = result.slice(0, 3);
      const evalResult = evaluatePayout(state.lastResult);
      const payout = Math.floor(state.bet * evalResult.multiplier);

      if (payout > 0) {
        state.balance += payout;
        const comboText =
          evalResult.kind === "three"
            ? `3-of-a-kind (${evalResult.base})`
            : `2-of-a-kind (${evalResult.base})`;
        setMessage(`Win! ${comboText} paid ${formatInt(payout)} tokens.`, "ok");
        logEvent(`+ ${formatInt(payout)} tokens: ${comboText}.`);
        beep("win");
        buzz([30, 40, 30]);
      } else {
        setMessage("No match. The model is ‘still learning’.", "bad");
        logEvent("0 tokens: output was confident, not correct.", "muted");
        beep("lose");
        buzz([25]);
      }

      render();
      saveState();
    }, 1200);
  }

  function resetAll() {
    const ok = window.confirm("Reset balance and settings? (This is irreversible. Like shipping to prod.)");
    if (!ok) return;
    const fresh = freshState();
    state.balance = fresh.balance;
    state.bet = fresh.bet;
    state.sound = fresh.sound;
    state.haptics = fresh.haptics;
    state.lastResult = fresh.lastResult.slice();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    els.logList.innerHTML = "";
    setMessage("Reset complete. Fresh tokens, fresh delusions.", "normal");
    render();
    saveState();
  }

  // Events
  els.bet.addEventListener("input", () => {
    state.bet = Number(els.bet.value) || 25;
    render();
    saveState();
  });

  els.spinBtn.addEventListener("click", () => spinOnce());

  els.maxBtn.addEventListener("click", () => {
    state.bet = 200;
    render();
    saveState();
    setMessage("Max bet selected. Your prompt is now ‘enterprise-grade’.", "normal");
  });

  els.resetBtn.addEventListener("click", () => resetAll());

  els.soundToggle.addEventListener("change", async () => {
    state.sound = !!els.soundToggle.checked;
    saveState();
    // On some browsers audio must be resumed after a gesture
    if (state.sound) {
      try {
        const { ctx } = audioEnsure();
        if (ctx.state === "suspended") await ctx.resume();
        beep("tick");
      } catch {
        // ignore
      }
    }
  });

  els.hapticsToggle.addEventListener("change", () => {
    state.haptics = !!els.hapticsToggle.checked;
    saveState();
    buzz([12]);
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      spinOnce();
    }
  });

  // Initial render
  render();
  setMessage("Ready. Press Spin. If it fails, blame ‘context length’.", "normal");
})();

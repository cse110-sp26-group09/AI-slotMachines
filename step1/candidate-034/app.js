/* AI Token Slots — vanilla, local-first, mildly judgmental. */
(() => {
  "use strict";

  const STORAGE_KEY = "aiSlots:v1";

  const START_TOKENS = 120;
  const SPIN_COST = 7;
  const DAILY_GRANT = 60;

  const reels = [
    { el: $("#reel0"), symEl: $("#sym0") },
    { el: $("#reel1"), symEl: $("#sym1") },
    { el: $("#reel2"), symEl: $("#sym2") },
  ];

  const ui = {
    balance: $("#balance"),
    spinCost: $("#spinCost"),
    confidence: $("#confidence"),
    status: $("#status"),
    spins: $("#spins"),
    totalWon: $("#totalWon"),
    bestWin: $("#bestWin"),
    halluCount: $("#halluCount"),

    spinBtn: $("#spinBtn"),
    autoBtn: $("#autoBtn"),
    paytableBtn: $("#paytableBtn"),
    dailyBtn: $("#dailyBtn"),
    resetBtn: $("#resetBtn"),

    soundToggle: $("#soundToggle"),
    hapticsToggle: $("#hapticsToggle"),

    temp: $("#temp"),
    topP: $("#topP"),
    latency: $("#latency"),
    tempOut: $("#tempOut"),
    topPOut: $("#topPOut"),
    latencyOut: $("#latencyOut"),

    copyBragBtn: $("#copyBragBtn"),
    shareBtn: $("#shareBtn"),

    paytableDialog: $("#paytableDialog"),
    paytable: $("#paytable"),
  };

  const SYMBOLS = [
    { id: "TOK", label: "🪙", name: "Token", weight: 12 },
    { id: "BOT", label: "🤖", name: "Bot", weight: 10 },
    { id: "GPU", label: "🧮", name: "GPU", weight: 9 },
    { id: "PDF", label: "📄", name: "PDF", weight: 10 },
    { id: "PROMPT", label: "🧾", name: "Prompt", weight: 10 },
    { id: "DATA", label: "🧠", name: "Data", weight: 8 },
    { id: "CAP", label: "🧢", name: "Cap", weight: 7 }, // confident but wrong
    { id: "BENCH", label: "📉", name: "Benchmark", weight: 7 },
    { id: "BAN", label: "🚫", name: "Safety filter", weight: 6 },
    { id: "HALLU", label: "🌀", name: "Hallucination", weight: 4 },
  ];

  const symbolById = new Map(SYMBOLS.map((s) => [s.id, s]));
  const weightedBag = makeWeightedBag(SYMBOLS);

  const PAYTABLE = [
    { combo: ["TOK", "TOK", "TOK"], mult: 55, title: "Token Jackpot" },
    { combo: ["BOT", "BOT", "BOT"], mult: 40, title: "Agent Swarm" },
    { combo: ["GPU", "GPU", "GPU"], mult: 30, title: "Compute Grant" },
    { combo: ["DATA", "DATA", "DATA"], mult: 28, title: "Training Data Leak" },
    { combo: ["PROMPT", "PROMPT", "PROMPT"], mult: 22, title: "Prompt Engineering (real job)" },
    { combo: ["PDF", "PDF", "PDF"], mult: 18, title: "RAG But It’s Just PDFs" },
    { combo: ["CAP", "CAP", "CAP"], mult: 14, title: "Confidently Incorrect" },
    { combo: ["BENCH", "BENCH", "BENCH"], mult: 10, title: "Leaderboard Enjoyer" },
    { combo: ["BAN", "BAN", "BAN"], mult: 6, title: "Policy Compliance" },
  ];

  const TWO_KIND_MULT = 2.5;
  const HALLU_PENALTY = 12;

  let audio = null;
  let spinTimer = null;
  let autoTimer = null;
  let spinning = false;

  let state = loadState();
  initSymbols();
  render();
  renderPaytable();
  wire();
  maybeRegisterServiceWorker();

  function wire() {
    ui.spinBtn.addEventListener("click", () => spinOnce({ reason: "manual" }));
    ui.autoBtn.addEventListener("click", toggleAuto);
    ui.paytableBtn.addEventListener("click", () => ui.paytableDialog.showModal());
    ui.dailyBtn.addEventListener("click", claimDailyGrant);
    ui.resetBtn.addEventListener("click", hardReset);

    ui.soundToggle.checked = state.settings.sound;
    ui.hapticsToggle.checked = state.settings.haptics;

    ui.soundToggle.addEventListener("change", () => {
      state.settings.sound = ui.soundToggle.checked;
      saveState();
    });
    ui.hapticsToggle.addEventListener("change", () => {
      state.settings.haptics = ui.hapticsToggle.checked;
      saveState();
    });

    ui.temp.addEventListener("input", () => {
      state.settings.temp = Number(ui.temp.value);
      ui.tempOut.value = fmt1(state.settings.temp);
      updateConfidence();
      saveState();
    });
    ui.topP.addEventListener("input", () => {
      state.settings.topP = Number(ui.topP.value);
      ui.topPOut.value = fmt2(state.settings.topP);
      updateConfidence();
      saveState();
    });
    ui.latency.addEventListener("input", () => {
      state.settings.latency = Number(ui.latency.value);
      ui.latencyOut.value = `${state.settings.latency}ms`;
      saveState();
    });

    ui.copyBragBtn.addEventListener("click", copyBrag);
    ui.shareBtn.addEventListener("click", shareBrag);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && autoTimer) toggleAuto();
    });

    window.addEventListener("keydown", (e) => {
      if ((e.key === " " || e.key === "Enter") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (document.activeElement?.tagName || "").toLowerCase();
        if (tag === "input" || tag === "button" || tag === "dialog") return;
        e.preventDefault();
        spinOnce({ reason: "keyboard" });
      }
    });
  }

  async function spinOnce({ reason }) {
    if (spinning) return;
    if (state.balance < SPIN_COST) {
      setStatus(`Out of tokens. Try “Daily token grant”.`, "bad");
      blip(150, 60);
      return;
    }

    spinning = true;
    setButtonsEnabled(false);
    setStatus(reason === "manual" ? "Generating value…" : "Autonomously generating value…");

    state.balance -= SPIN_COST;
    state.spins += 1;
    saveState();
    render();

    const latency = clamp(state.settings.latency, 150, 1100);
    const stopOffsets = [0, 180, 360];
    const spinDuration = Math.round(latency + 520);
    const tickMs = 48;

    const target = [pickSymbolId(), pickSymbolId(), pickSymbolId()];
    const startedAt = performance.now();

    for (const r of reels) r.el.classList.add("spinning");
    if (state.settings.sound) ensureAudio().spinStart();
    if (state.settings.haptics) maybeVibrate([10, 30, 10]);

    spinTimer = window.setInterval(() => {
      for (let i = 0; i < 3; i++) {
        reels[i].symEl.textContent = symbolById.get(pickSymbolId()).label;
      }
    }, tickMs);

    await sleep(spinDuration);

    for (let i = 0; i < 3; i++) {
      await sleep(stopOffsets[i]);
      reels[i].symEl.textContent = symbolById.get(target[i]).label;
      reels[i].el.classList.remove("spinning");
      if (state.settings.sound) ensureAudio().tick();
      if (state.settings.haptics) maybeVibrate(8);
    }

    window.clearInterval(spinTimer);
    spinTimer = null;

    const result = evaluate(target);
    applyResult(result);

    const elapsed = Math.round(performance.now() - startedAt);
    if (result.type === "win") {
      setStatus(`${result.headline} (+${result.payout} tokens) • ${elapsed}ms inference`, "good");
      if (state.settings.sound) ensureAudio().win();
      if (state.settings.haptics) maybeVibrate([18, 50, 18]);
    } else if (result.type === "penalty") {
      setStatus(`${result.headline} (-${result.penalty} tokens) • ${elapsed}ms hallucination`, "bad");
      if (state.settings.sound) ensureAudio().lose();
      if (state.settings.haptics) maybeVibrate([30, 40, 30, 40, 30]);
    } else {
      setStatus(`${result.headline} • ${elapsed}ms sampling`, "");
      if (state.settings.sound) ensureAudio().loseSoft();
    }

    saveState();
    render();
    spinning = false;
    setButtonsEnabled(true);
  }

  function evaluate(ids) {
    const [a, b, c] = ids;
    void a;
    void b;
    void c;

    const hasHallu = ids.includes("HALLU");
    const hasBan = ids.includes("BAN");

    if (hasHallu) {
      return {
        type: "penalty",
        headline: hasBan
          ? "Safety filter refused to answer, then hallucinated anyway"
          : "Hallucination detected (source: vibes)",
        penalty: HALLU_PENALTY,
      };
    }

    const exact = PAYTABLE.find((p) => sameCombo(ids, p.combo));
    if (exact) {
      return {
        type: "win",
        headline: `${exact.title}!`,
        payout: Math.round(SPIN_COST * exact.mult),
      };
    }

    const twoKind = twoOfAKind(ids);
    if (twoKind) {
      const sym = symbolById.get(twoKind);
      return {
        type: "win",
        headline: `Two ${sym.name}s (close enough for a demo)`,
        payout: Math.round(SPIN_COST * TWO_KIND_MULT),
      };
    }

    return { type: "lose", headline: "No signal. More tokens required." };
  }

  function applyResult(result) {
    if (result.type === "win") {
      state.balance += result.payout;
      state.totalWon += result.payout;
      state.bestWin = Math.max(state.bestWin, result.payout);
      return;
    }
    if (result.type === "penalty") {
      state.balance = Math.max(0, state.balance - result.penalty);
      state.halluCount += 1;
      return;
    }
  }

  function toggleAuto() {
    if (autoTimer) {
      window.clearInterval(autoTimer);
      autoTimer = null;
      ui.autoBtn.textContent = "Autospin";
      setStatus("Autospin disabled. Back to manual labor.");
      return;
    }
    autoTimer = window.setInterval(() => {
      if (spinning) return;
      if (state.balance < SPIN_COST) {
        toggleAuto();
        return;
      }
      spinOnce({ reason: "auto" });
    }, 1250);
    ui.autoBtn.textContent = "Stop";
    setStatus("Autospin enabled. Congratulations on your new dependency.");
  }

  function claimDailyGrant() {
    const today = isoDate(new Date());
    if (state.dailyGrantDate === today) {
      setStatus("Daily grant already claimed. Please try again after midnight (local time).", "bad");
      blip(160, 60);
      return;
    }
    state.dailyGrantDate = today;
    state.balance += DAILY_GRANT;
    saveState();
    render();
    setStatus(`Received ${DAILY_GRANT} tokens from “open-source sponsorship”.`, "good");
    if (state.settings.sound) ensureAudio().winSoft();
  }

  async function copyBrag() {
    const text = bragText();
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied. Paste it into your next investor update.", "good");
      if (state.settings.sound) ensureAudio().tick();
    } catch {
      setStatus("Clipboard blocked. Your browser is practicing safety alignment.", "bad");
      blip(140, 70);
    }
  }

  async function shareBrag() {
    const text = bragText();
    if (!("share" in navigator)) {
      setStatus("Web Share not supported here. Try “Copy brag”.", "bad");
      return;
    }
    try {
      await navigator.share({
        title: "AI Token Slots",
        text,
      });
      setStatus("Shared. Please do not call this “go-to-market”.", "good");
    } catch {
      setStatus("Share canceled. You retained a shred of dignity.", "");
    }
  }

  function bragText() {
    return `I just “generated value” in AI Token Slots.
Balance: ${state.balance} tokens
Spins: ${state.spins}
Best win: ${state.bestWin} tokens`;
  }

  function hardReset() {
    if (!confirm("Reset tokens and stats? (Your dignity will not be restored.)")) return;
    state = freshState();
    saveState();
    render();
    setStatus("Reset complete. Back to square prompt.", "");
  }

  function render() {
    ui.balance.textContent = fmtInt(state.balance);
    ui.spinCost.textContent = fmtInt(SPIN_COST);
    ui.spins.textContent = fmtInt(state.spins);
    ui.totalWon.textContent = fmtInt(state.totalWon);
    ui.bestWin.textContent = fmtInt(state.bestWin);
    ui.halluCount.textContent = fmtInt(state.halluCount);

    ui.temp.value = String(state.settings.temp);
    ui.topP.value = String(state.settings.topP);
    ui.latency.value = String(state.settings.latency);
    ui.tempOut.value = fmt1(state.settings.temp);
    ui.topPOut.value = fmt2(state.settings.topP);
    ui.latencyOut.value = `${state.settings.latency}ms`;

    updateConfidence();

    const hint =
      state.balance < SPIN_COST
        ? "Not enough tokens (try Daily grant)"
        : `Costs ${SPIN_COST} tokens per spin`;
    $("#spinHint").textContent = hint;

    setButtonsEnabled(!spinning);
  }

  function renderPaytable() {
    const rows = PAYTABLE.map((p) => {
      const combo = p.combo.map((id) => symbolById.get(id).label).join(" ");
      const payout = Math.round(SPIN_COST * p.mult);
      return `<div class="payRow"><div><div class="combo">${escapeHtml(combo)}</div><div class="muted">${escapeHtml(
        p.title
      )}</div></div><div class="pill">+${payout}</div></div>`;
    }).join("");

    ui.paytable.innerHTML = `
      <div class="paytableGrid">
        ${rows}
        <div class="payRow">
          <div>
            <div class="combo">Any two matching</div>
            <div class="muted">Because demos need “retention”.</div>
          </div>
          <div class="pill">+${Math.round(SPIN_COST * TWO_KIND_MULT)}</div>
        </div>
        <div class="payRow">
          <div>
            <div class="combo">${symbolById.get("HALLU").label} appears</div>
            <div class="muted">Model makes something up confidently.</div>
          </div>
          <div class="pill">-${HALLU_PENALTY}</div>
        </div>
      </div>
    `;
  }

  function initSymbols() {
    for (let i = 0; i < 3; i++) {
      reels[i].symEl.textContent = symbolById.get(pickSymbolId()).label;
    }
  }

  function updateConfidence() {
    const t = state.settings.temp;
    const p = state.settings.topP;
    const conf = clamp(Math.round(99 - t * 10 - (1 - p) * 18), 42, 99);
    ui.confidence.textContent = String(conf);
  }

  function setButtonsEnabled(enabled) {
    const canSpin = state.balance >= SPIN_COST;
    ui.spinBtn.disabled = !enabled || !canSpin;
    ui.autoBtn.disabled = !enabled;
    ui.dailyBtn.disabled = !enabled;
    ui.paytableBtn.disabled = !enabled;
    ui.resetBtn.disabled = !enabled;
  }

  function setStatus(text, mood = "") {
    ui.status.textContent = text;
    ui.status.classList.remove("good", "bad");
    if (mood) ui.status.classList.add(mood);
  }

  function pickSymbolId() {
    return weightedBag[Math.floor(Math.random() * weightedBag.length)];
  }

  function makeWeightedBag(items) {
    const bag = [];
    for (const item of items) {
      const n = clamp(Math.round(item.weight), 1, 999);
      for (let i = 0; i < n; i++) bag.push(item.id);
    }
    return bag;
  }

  function sameCombo(a, b) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }

  function twoOfAKind(ids) {
    const [a, b, c] = ids;
    if (a === b && b !== c) return a;
    if (a === c && a !== b) return a;
    if (b === c && a !== b) return b;
    return null;
  }

  function maybeVibrate(pattern) {
    try {
      if ("vibrate" in navigator) navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }

  function blip(freq, ms) {
    if (!state.settings.sound) return;
    ensureAudio().blip(freq, ms);
  }

  function ensureAudio() {
    if (audio) return audio;
    audio = createAudio();
    return audio;
  }

  function createAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return { tick() {}, spinStart() {}, win() {}, winSoft() {}, lose() {}, loseSoft() {}, blip() {} };

    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0.08;
    master.connect(ctx.destination);

    const now = () => ctx.currentTime;

    function tone(freq, dur, type = "sine", gain = 1) {
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.value = 0;
      osc.connect(g);
      g.connect(master);
      const t0 = now();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.9 * gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    }

    return {
      tick() {
        tone(740, 0.05, "triangle", 0.6);
      },
      spinStart() {
        tone(220, 0.06, "sawtooth", 0.7);
        setTimeout(() => tone(330, 0.06, "sawtooth", 0.65), 70);
      },
      win() {
        tone(523.25, 0.09, "square", 0.9);
        setTimeout(() => tone(659.25, 0.12, "square", 0.9), 90);
        setTimeout(() => tone(783.99, 0.14, "square", 0.95), 220);
      },
      winSoft() {
        tone(659.25, 0.09, "triangle", 0.75);
        setTimeout(() => tone(783.99, 0.11, "triangle", 0.8), 90);
      },
      lose() {
        tone(196, 0.12, "sine", 0.9);
        setTimeout(() => tone(146.83, 0.16, "sine", 0.9), 120);
      },
      loseSoft() {
        tone(220, 0.08, "sine", 0.6);
      },
      blip(freq, ms) {
        tone(freq, Math.max(0.03, ms / 1000), "sine", 0.75);
      },
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshState();
      const parsed = JSON.parse(raw);
      return normalizeState(parsed);
    } catch {
      return freshState();
    }
  }

  function normalizeState(s) {
    const base = freshState();
    const out = {
      ...base,
      ...s,
      settings: { ...base.settings, ...(s?.settings || {}) },
    };
    out.balance = clampInt(out.balance, 0, 1_000_000);
    out.spins = clampInt(out.spins, 0, 1_000_000);
    out.totalWon = clampInt(out.totalWon, 0, 9_999_999);
    out.bestWin = clampInt(out.bestWin, 0, 9_999_999);
    out.halluCount = clampInt(out.halluCount, 0, 9_999_999);
    out.settings.temp = clamp(Number(out.settings.temp), 0, 2);
    out.settings.topP = clamp(Number(out.settings.topP), 0.1, 1);
    out.settings.latency = clampInt(out.settings.latency, 150, 1100);
    out.settings.sound = Boolean(out.settings.sound);
    out.settings.haptics = Boolean(out.settings.haptics);
    return out;
  }

  function freshState() {
    return {
      balance: START_TOKENS,
      spins: 0,
      totalWon: 0,
      bestWin: 0,
      halluCount: 0,
      dailyGrantDate: "",
      settings: {
        sound: true,
        haptics: true,
        temp: 0.9,
        topP: 0.9,
        latency: 520,
      },
    };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }

  function maybeRegisterServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // ignore
    });
  }

  function $(sel) {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`Missing element: ${sel}`);
    return el;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function fmtInt(n) {
    return Math.trunc(Number(n) || 0).toLocaleString();
  }

  function fmt1(n) {
    return (Number(n) || 0).toFixed(1);
  }

  function fmt2(n) {
    return (Number(n) || 0).toFixed(2);
  }

  function clamp(n, a, b) {
    return Math.min(b, Math.max(a, n));
  }

  function clampInt(n, a, b) {
    return Math.trunc(clamp(Number(n) || 0, a, b));
  }

  function isoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();

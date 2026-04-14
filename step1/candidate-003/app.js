/* Token Casino — a tiny parody slot machine.
   No dependencies. Uses platform APIs: localStorage, WebAudio, Clipboard/Share, Vibration. */

const STORAGE_KEY = "token-casino:v1";

const DEFAULT_STATE = Object.freeze({
  balance: 250,
  spins: 0,
  lastDailyClaimYmd: null,
  muted: false,
  bet: 10,
  temp: 0.6,
});

const SYMBOLS = [
  { key: "GPT", label: "GPT", weight: 15, kind: "common" },
  { key: "RAG", label: "RAG", weight: 12, kind: "common" },
  { key: "GPU", label: "GPU", weight: 12, kind: "common" },
  { key: "TOK", label: "🪙", weight: 12, kind: "common" },
  { key: "LAT", label: "⏱️", weight: 10, kind: "common" },
  { key: "EVAL", label: "📊", weight: 10, kind: "common" },
  { key: "SAFE", label: "🛡️", weight: 8, kind: "uncommon" },
  { key: "PROM", label: "🧾", weight: 8, kind: "uncommon" },
  { key: "HALL", label: "🌀", weight: 7, kind: "uncommon" },
  { key: "RATE", label: "🚦", weight: 4, kind: "rare" },
  { key: "AGI", label: "✨", weight: 2, kind: "rare" },
];

const PAYTABLE = [
  { pattern: "✨ ✨ ✨", payoutMult: 50, note: "AGI (demo only) — huge payout" },
  { pattern: "🌀 🌀 🌀", payoutMult: 0, note: "Hallucination — confidently wrong, no payout" },
  { pattern: "🚦 🚦 🚦", payoutMult: 0, note: "Rate-limited — your tokens are in another queue" },
  { pattern: "Any 3 match", payoutMult: 8, note: "Three of a kind" },
  { pattern: "Any 2 match", payoutMult: 2, note: "Two of a kind" },
];

function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function clampInt(n, min, max) {
  const v = Number.isFinite(n) ? Math.trunc(n) : min;
  return Math.max(min, Math.min(max, v));
}

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    const next = { ...DEFAULT_STATE, ...parsed };
    next.balance = clampInt(Number(next.balance), 0, 1_000_000);
    next.spins = clampInt(Number(next.spins), 0, 1_000_000);
    next.bet = clampInt(Number(next.bet), 1, 10_000);
    next.temp = Math.max(0, Math.min(1, Number(next.temp)));
    next.muted = Boolean(next.muted);
    if (typeof next.lastDailyClaimYmd !== "string") next.lastDailyClaimYmd = null;
    return next;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be blocked; app still works without persistence.
  }
}

function makeWeightedPicker(items) {
  const total = items.reduce((acc, it) => acc + it.weight, 0);
  const cumulative = [];
  let run = 0;
  for (const it of items) {
    run += it.weight;
    cumulative.push({ at: run / total, item: it });
  }
  return function pick(u01) {
    for (const entry of cumulative) {
      if (u01 <= entry.at) return entry.item;
    }
    return cumulative[cumulative.length - 1].item;
  };
}

function randU01() {
  try {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 2 ** 32;
  } catch {
    return Math.random();
  }
}

const pickSymbol = makeWeightedPicker(SYMBOLS);

function computeCost(bet, temp) {
  const tempPenalty = 1 + temp * 0.5; // hotter model, pricier bill
  return Math.max(1, Math.round(bet * tempPenalty));
}

function threeOfKind(a, b, c) {
  return a.key === b.key && b.key === c.key;
}
function twoOfKind(a, b, c) {
  return a.key === b.key || a.key === c.key || b.key === c.key;
}

function formatSymbols(a, b, c) {
  return `${a.label} ${b.label} ${c.label}`;
}

function inferMessage({ a, b, c, payout, cost, temp, prompt }) {
  const line = [];
  const combo = formatSymbols(a, b, c);

  if (threeOfKind(a, b, c)) {
    if (a.key === "AGI") return `✨ Jackpot: ${combo}. This will be in production “next quarter”. (+${payout})`;
    if (a.key === "HALL")
      return `🌀 Output: ${combo}. The model is confident. Reality is not. (+${payout})`;
    if (a.key === "RATE") return `🚦 Output: ${combo}. Rate limit exceeded; try again in 60 seconds. (+${payout})`;
    return `✅ Output: ${combo}. Incredible alignment with shareholder value. (+${payout})`;
  }

  if (twoOfKind(a, b, c)) {
    line.push(`🧩 Output: ${combo}. Partial match — we call this “RAG”. (+${payout})`);
  } else {
    line.push(`🤖 Output: ${combo}. No signal. More tokens required. (+${payout})`);
  }

  if (temp > 0.8 && randU01() < 0.25) {
    line.push("High temperature detected: returning a creative but incorrect explanation.");
  } else if (temp < 0.2 && randU01() < 0.25) {
    line.push("Low temperature detected: safe, boring, and still wrong in a different way.");
  }

  if (prompt && prompt.trim().length > 0 && randU01() < 0.35) {
    const trimmed = prompt.trim().slice(0, 40);
    line.push(`Acknowledged prompt: “${trimmed}${prompt.trim().length > 40 ? "…" : ""}”`);
  }

  line.push(`Billing: -${cost} tokens. Thank you for your contribution to science.`);
  return line.join(" ");
}

function haptics() {
  try {
    if (navigator.vibrate) navigator.vibrate([12, 24, 12]);
  } catch {
    // ignore
  }
}

function createAudio() {
  let ctx = null;
  function ensure() {
    if (ctx) return ctx;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function beep({ freq = 440, dur = 0.06, type = "sine", gain = 0.05 } = {}) {
    const ac = ensure();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g);
    g.connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + dur);
  }

  function chimeWin() {
    beep({ freq: 523.25, dur: 0.07, type: "triangle", gain: 0.06 });
    setTimeout(() => beep({ freq: 659.25, dur: 0.07, type: "triangle", gain: 0.06 }), 70);
    setTimeout(() => beep({ freq: 783.99, dur: 0.08, type: "triangle", gain: 0.06 }), 150);
  }

  function clickTick() {
    beep({ freq: 220 + Math.floor(randU01() * 140), dur: 0.03, type: "square", gain: 0.02 });
  }

  function thudLose() {
    beep({ freq: 110, dur: 0.08, type: "sawtooth", gain: 0.03 });
  }

  return { clickTick, chimeWin, thudLose, ensure };
}

function setText(el, text) {
  el.textContent = String(text);
}

function renderPaytable() {
  const ul = $("paytableEl");
  ul.innerHTML = "";
  for (const row of PAYTABLE) {
    const li = document.createElement("li");
    li.textContent = `${row.pattern}: ${row.payoutMult}× bet — ${row.note}`;
    ul.appendChild(li);
  }
}

function canShare() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

function setBusy(isBusy) {
  $("spinBtn").disabled = isBusy;
  $("betEl").disabled = isBusy;
  $("tempEl").disabled = isBusy;
  $("maxBtn").disabled = isBusy;
  $("dailyBtn").disabled = isBusy;
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function updateDailyButton(state) {
  const btn = $("dailyBtn");
  const ymd = todayYmd();
  if (state.lastDailyClaimYmd === ymd) {
    btn.disabled = true;
    btn.textContent = "Daily Claimed";
  } else {
    btn.disabled = false;
    btn.textContent = "Claim Daily Tokens";
  }
}

function main() {
  const state = loadState();
  const audio = createAudio();

  const balanceEl = $("balanceEl");
  const costEl = $("costEl");
  const spinsEl = $("spinsEl");
  const msgEl = $("msgEl");
  const srAnnounce = $("srAnnounce");

  const reelEls = [$("reel0"), $("reel1"), $("reel2")];
  const reelBoxes = Array.from(document.querySelectorAll(".reel"));

  function render() {
    const bet = clampInt(Number(state.bet), 1, 10_000);
    const cost = computeCost(bet, state.temp);
    setText(balanceEl, state.balance);
    setText(costEl, cost);
    setText(spinsEl, state.spins);
    $("betEl").value = String(bet);
    $("tempEl").value = String(Math.round(state.temp * 100));
    setText($("tempOut"), state.temp.toFixed(2));

    $("muteBtn").setAttribute("aria-pressed", String(state.muted));
    $("muteBtn").textContent = state.muted ? "Sound: Off" : "Sound: On";

    updateDailyButton(state);
    saveState(state);
  }

  function say(text) {
    setText(msgEl, text);
    setText(srAnnounce, text);
  }

  function setReels(symbols) {
    for (let i = 0; i < 3; i++) reelEls[i].textContent = symbols[i].label;
  }

  renderPaytable();
  render();

  // If balance is 0 on load, be extra supportive.
  if (state.balance <= 0) {
    say("Balance is 0 tokens. Please raise funding (daily claim) or reset your startup.");
  }

  $("betEl").addEventListener("input", (e) => {
    state.bet = clampInt(Number(e.target.value), 1, 10_000);
    render();
  });
  $("tempEl").addEventListener("input", (e) => {
    state.temp = Math.max(0, Math.min(1, Number(e.target.value) / 100));
    render();
  });
  $("maxBtn").addEventListener("click", () => {
    state.bet = Math.max(1, Math.min(10_000, state.balance || 1));
    render();
    say("Max bet selected. Hope is not a strategy, but it is a UX pattern.");
  });

  $("muteBtn").addEventListener("click", () => {
    state.muted = !state.muted;
    render();
    if (!state.muted) {
      try {
        audio.ensure();
        audio.clickTick();
      } catch {
        // ignore
      }
    }
  });

  $("shareBtn").addEventListener("click", async () => {
    const text = `I am gambling for compute in Token Casino. Current balance: ${state.balance} tokens.`;
    const shareData = { title: "Token Casino", text };
    try {
      if (canShare()) {
        await navigator.share(shareData);
        say("Shared. Your social graph will now price in your token addiction.");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        say("Copied to clipboard. Paste it into Slack and watch your credibility dequantize.");
      } else {
        say("Sharing not supported here. Please yell your balance out loud.");
      }
    } catch {
      say("Share canceled. The model respects consent (sometimes).");
    }
  });

  $("dailyBtn").addEventListener("click", () => {
    const ymd = todayYmd();
    if (state.lastDailyClaimYmd === ymd) {
      say("Daily already claimed. Please touch grass while we refresh the cache.");
      render();
      return;
    }
    const grant = 120;
    state.balance += grant;
    state.lastDailyClaimYmd = ymd;
    say(`Seed round closed. +${grant} tokens added to runway. Please spend responsibly (you won't).`);
    if (!state.muted) audio.chimeWin();
    render();
  });

  $("resetBtn").addEventListener("click", () => {
    const ok = confirm("Reset Token Casino? This will wipe your balance and stats.");
    if (!ok) return;
    const next = { ...DEFAULT_STATE };
    Object.assign(state, next);
    setReels([SYMBOLS[0], SYMBOLS[3], SYMBOLS[4]]);
    say("Reset complete. New startup, same business model.");
    render();
  });

  let spinning = false;
  async function spinOnce() {
    if (spinning) return;
    spinning = true;
    setBusy(true);

    const bet = clampInt(Number(state.bet), 1, 10_000);
    const cost = computeCost(bet, state.temp);
    if (state.balance < cost) {
      say(`Insufficient tokens (${state.balance}/${cost}). Please claim daily tokens or reset your startup.`);
      if (!state.muted) audio.thudLose();
      spinning = false;
      setBusy(false);
      return;
    }

    state.balance -= cost;
    state.spins += 1;
    render();
    haptics();

    const prompt = $("promptEl").value || "";

    // Spin animation: stagger reel stops.
    reelBoxes.forEach((r) => r.classList.add("isSpinning"));
    const chosen = [pickSymbol(randU01()), pickSymbol(randU01()), pickSymbol(randU01())];

    if (!state.muted) audio.clickTick();
    await delay(260);
    reelEls[0].textContent = chosen[0].label;
    if (!state.muted) audio.clickTick();
    await delay(240);
    reelEls[1].textContent = chosen[1].label;
    if (!state.muted) audio.clickTick();
    await delay(220);
    reelEls[2].textContent = chosen[2].label;

    reelBoxes.forEach((r) => r.classList.remove("isSpinning"));

    // Payout rules (special triples first).
    let payoutMult = 0;
    if (threeOfKind(chosen[0], chosen[1], chosen[2])) {
      if (chosen[0].key === "AGI") payoutMult = 50;
      else if (chosen[0].key === "HALL") payoutMult = 0;
      else if (chosen[0].key === "RATE") payoutMult = 0;
      else payoutMult = 8;
    } else if (twoOfKind(chosen[0], chosen[1], chosen[2])) {
      payoutMult = 2;
    }

    // Temperature joke: hot models sometimes "hallucinate" a tax.
    const hallucinationTaxChance = Math.max(0, (state.temp - 0.75) * 0.9);
    const tax = randU01() < hallucinationTaxChance ? Math.max(1, Math.round(bet * 0.5)) : 0;

    const payout = payoutMult * bet;
    const finalPayout = Math.max(0, payout - tax);
    state.balance += finalPayout;

    if (tax > 0) {
      say(
        `🧾 Post-processing fee: -${tax} tokens (for “safety”). ` +
          inferMessage({ a: chosen[0], b: chosen[1], c: chosen[2], payout: finalPayout, cost, temp: state.temp, prompt })
      );
    } else {
      say(inferMessage({ a: chosen[0], b: chosen[1], c: chosen[2], payout: finalPayout, cost, temp: state.temp, prompt }));
    }

    if (!state.muted) {
      if (finalPayout > 0) audio.chimeWin();
      else audio.thudLose();
    }
    render();
    spinning = false;
    setBusy(false);
  }

  $("spinBtn").addEventListener("click", spinOnce);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      const active = document.activeElement;
      const isTyping =
        active &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
      if (isTyping) return;
      e.preventDefault();
      spinOnce();
    }
  });
}

document.addEventListener("DOMContentLoaded", main);

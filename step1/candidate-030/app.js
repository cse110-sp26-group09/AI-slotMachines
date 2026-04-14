/* TokenSpin™ — a tiny slot machine that roasts AI token economics. */

const STORAGE_KEY = "tokenspin:v1";

const SYMBOLS = [
  { id: "GPU", label: "GPU", weight: 10, flavor: "A thousand fans scream in unison." },
  { id: "PROMPT", label: "PROMPT", weight: 10, flavor: "You tried saying 'please' again." },
  { id: "CACHE", label: "CACHE", weight: 8, flavor: "It remembered… temporarily." },
  { id: "TOKEN", label: "TOKEN", weight: 9, flavor: "A delicious little billing unit." },
  { id: "LATENCY", label: "⌛", weight: 7, flavor: "Thinking… definitely thinking." },
  { id: "HALLU", label: "HALLUCINATION", weight: 6, flavor: "Confidently incorrect, but make it premium." },
  { id: "ALIGN", label: "ALIGNMENT", weight: 6, flavor: "A safety story arc appears." },
  { id: "RATE", label: "429", weight: 5, flavor: "Slow down, cowboy." },
  { id: "OOPS", label: "500", weight: 4, flavor: "The cloud is having feelings." },
  { id: "GLITCH", label: "∑", weight: 4, flavor: "Math happened. Nobody consented." },
  { id: "ROBOT", label: "🤖", weight: 3, flavor: "Beep boop. That's the whole personality." },
  { id: "RARE", label: "✨", weight: 2, flavor: "A rare moment of competence." },
];

const PAYOUTS_3 = new Map([
  ["✨", 320],
  ["🤖", 220],
  ["GPU", 140],
  ["PROMPT", 120],
  ["CACHE", 95],
  ["TOKEN", 80],
  ["ALIGNMENT", 70],
  ["HALLUCINATION", 60],
  ["⌛", 50],
  ["429", 45],
  ["500", 40],
  ["∑", 35],
]);

const BONUS_TWO_KIND = 8; // small consolation: "mostly aligned" payout

const ACHIEVEMENTS = [
  {
    id: "first_spin",
    name: "Hello, World!",
    meta: "Spin once. Congratulations on inventing gambling.",
    test: (s) => s.totalSpins >= 1,
  },
  {
    id: "three_kind",
    name: "Pattern Match",
    meta: "Hit any 3× match. Your model can generalize (barely).",
    test: (s) => s.totalWins3x >= 1,
  },
  {
    id: "rate_limited",
    name: "Backpressure Enjoyer",
    meta: "Roll a 429. The machine sets boundaries.",
    test: (s) => s.symbolCounts["429"] >= 3,
  },
  {
    id: "hallucinated",
    name: "Confidently Incorrect",
    meta: "Roll HALLUCINATION 3×. You win… an explanation.",
    test: (s) => s.tripleCounts["HALLUCINATION"] >= 1,
  },
  {
    id: "profit",
    name: "Token Positive",
    meta: "Reach 2,000 tokens. Enjoy your imaginary success.",
    test: (s) => s.tokens >= 2000,
  },
  {
    id: "broke",
    name: "Out of Credits",
    meta: "Hit 0 tokens. Please insert venture capital.",
    test: (s) => s.tokens <= 0,
  },
];

function $(id) {
  return document.getElementById(id);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatInt(n) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

function nowMs() {
  return performance.now();
}

function cryptoPickWeighted(items) {
  const total = items.reduce((sum, it) => sum + it.weight, 0);
  const r = cryptoRandomFloat01() * total;
  let acc = 0;
  for (const it of items) {
    acc += it.weight;
    if (r < acc) return it;
  }
  return items[items.length - 1];
}

function cryptoRandomFloat01() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0xffffffff;
}

function sameCount(a, b, c) {
  if (a === b && b === c) return 3;
  if (a === b || a === c || b === c) return 2;
  return 1;
}

function getSpinCost(state) {
  // Prices go up with usage. It's not inflation, it's "value-based pricing".
  const base = 25;
  const surge = Math.floor(state.totalSpins / 12) * 2;
  const moodTax = state.modelMood === "spicy" ? 6 : state.modelMood === "sleepy" ? -3 : 0;
  return clamp(base + surge + moodTax, 15, 75);
}

function computePayout(symbols, cost) {
  const [a, b, c] = symbols;
  const k = sameCount(a, b, c);
  if (k === 3) {
    const mult = PAYOUTS_3.get(a) ?? 0;
    return Math.max(cost, Math.round((mult / 100) * cost));
  }
  if (k === 2) return Math.round(cost * (BONUS_TWO_KIND / 100));
  return 0;
}

function pickModelMood() {
  const moods = [
    { id: "calm", label: "calm", weight: 10 },
    { id: "spicy", label: "spicy", weight: 6 },
    { id: "sleepy", label: "sleepy", weight: 6 },
    { id: "dramatic", label: "dramatic", weight: 4 },
    { id: "aligned", label: "aligned*", weight: 3 },
  ];
  return cryptoPickWeighted(moods).id;
}

function moodLabel(moodId) {
  return (
    {
      calm: "calm",
      spicy: "spicy",
      sleepy: "sleepy",
      dramatic: "dramatic",
      aligned: "aligned*",
    }[moodId] ?? "calibrating…"
  );
}

function moodMessage(moodId) {
  const lines = {
    calm: "Low temperature. High confidence. Medium correctness.",
    spicy: "Temperature cranked. Watch for creative arithmetic.",
    sleepy: "Latency enjoys your company.",
    dramatic: "A monologue is forming in the logits.",
    aligned: "Safety-first. Fun-second. Revenue-always.",
  };
  return lines[moodId] ?? "Model is thinking about thinking.";
}

function defaultState() {
  return {
    tokens: 500,
    startingTokens: 500,
    totalSpins: 0,
    totalPaid: 0,
    totalWon: 0,
    totalWins3x: 0,
    symbolCounts: Object.create(null),
    tripleCounts: Object.create(null),
    lastReceipt: null,
    muted: false,
    autospin: false,
    modelMood: pickModelMood(),
    lastMoodAt: Date.now(),
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const state = { ...defaultState(), ...parsed };
    state.symbolCounts ||= Object.create(null);
    state.tripleCounts ||= Object.create(null);
    return state;
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function makeAudio() {
  let ctx = null;
  let unlocked = false;

  function ensure() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function unlock() {
    if (unlocked) return;
    const c = ensure();
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.value = 440;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.01);
    unlocked = true;
  }

  function beep(type = "tick") {
    const c = ensure();
    const t0 = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    const freq =
      type === "win" ? 880 : type === "lose" ? 220 : type === "jackpot" ? 1100 : 520;
    o.frequency.setValueAtTime(freq, t0);
    o.frequency.exponentialRampToValueAtTime(freq * 1.08, t0 + 0.06);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.10);
    o.connect(g);
    g.connect(c.destination);
    o.start(t0);
    o.stop(t0 + 0.12);
  }

  return { unlock, beep };
}

function canVibrate() {
  return typeof navigator !== "undefined" && "vibrate" in navigator;
}

function vibrate(pattern) {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

function setText(el, text) {
  el.textContent = text;
}

function buildPayoutTable(container, cost) {
  container.innerHTML = "";
  const items = [...PAYOUTS_3.entries()]
    .map(([sym, mult]) => ({ sym, mult }))
    .sort((a, b) => b.mult - a.mult);

  for (const it of items) {
    const row = document.createElement("div");
    row.className = "row";
    const left = document.createElement("div");
    left.className = "row__left";
    const sym = document.createElement("div");
    sym.className = "row__sym";
    sym.textContent = `${it.sym} ×3`;
    const desc = document.createElement("div");
    desc.className = "row__desc";
    desc.textContent = it.sym === "HALLUCINATION" ? "Pays in narrative." : "Pays in tokens.";
    const pay = document.createElement("div");
    pay.className = "row__pay";
    const approx = Math.max(cost, Math.round((it.mult / 100) * cost));
    pay.textContent = `~${formatInt(approx)}`;
    left.append(sym, desc);
    row.append(left, pay);
    container.append(row);
  }

  const row2 = document.createElement("div");
  row2.className = "row";
  row2.innerHTML = `<div class="row__left"><div class="row__sym">Any pair</div><div class="row__desc">“Mostly correct” bonus.</div></div><div class="row__pay">~${formatInt(Math.round(cost * (BONUS_TWO_KIND / 100)))}</div>`;
  container.append(row2);
}

function buildAchievements(container, state) {
  container.innerHTML = "";
  for (const a of ACHIEVEMENTS) {
    const li = document.createElement("li");
    const done = a.test(state);
    li.className = done ? "done" : "";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = a.name;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = a.meta;
    li.append(name, meta);
    container.append(li);
  }
}

function buildReelStrip(ul, symbols) {
  ul.innerHTML = "";
  for (const s of symbols) {
    const li = document.createElement("li");
    li.textContent = s;
    ul.append(li);
  }
}

function spinStrip(ul, finalSymbol, opts) {
  const { spinMs = 1100, overshoot = 2 } = opts;
  const ITEM_H = 64;
  const total = ul.children.length;
  let finalIndex = -1;
  for (let i = total - 1; i >= 0; i--) {
    if (ul.children[i].textContent === finalSymbol) {
      finalIndex = i;
      break;
    }
  }
  if (finalIndex < 0) finalIndex = total - 1;
  // Window shows ~3 items. Land the final symbol on the middle row.
  const finalTopIndex = clamp(finalIndex - 1, 0, Math.max(0, total - 3));
  const overshootTopIndex = clamp(finalTopIndex + overshoot, 0, Math.max(0, total - 3));
  const yOvershoot = -overshootTopIndex * ITEM_H;
  const yFinal = -finalTopIndex * ITEM_H;

  ul.style.transitionTimingFunction = "cubic-bezier(.2,.8,.2,1)";
  ul.style.transitionDuration = `${spinMs}ms`;
  ul.style.transform = `translateY(${yOvershoot}px)`;

  window.setTimeout(() => {
    ul.style.transitionTimingFunction = "cubic-bezier(.2,1.2,.2,1)";
    ul.style.transitionDuration = "180ms";
    ul.style.transform = `translateY(${yFinal}px)`;
  }, spinMs);
}

function ensureMoodFresh(state) {
  const age = Date.now() - state.lastMoodAt;
  if (age > 1000 * 60 * 2) {
    state.modelMood = pickModelMood();
    state.lastMoodAt = Date.now();
  }
}

function randomMarquee() {
  const lines = [
    "Now with 30% fewer hallucinations (measured spiritually).",
    "Spin responsibly. Or don't. The VC money is fake anyway.",
    "Alignment bonus available in the Premium Feelings tier.",
    "Local compute: 0%. Local regret: 100%.",
    "Every spin trains a tiny imaginary model to crave attention.",
    "Remember: tokens are forever. Until you clear storage.",
    "Warning: may contain traces of confidence.",
    "New feature: dynamic pricing. Old feature: your suffering.",
  ];
  return lines[Math.floor(cryptoRandomFloat01() * lines.length)];
}

function main() {
  const state = loadState();
  const audio = makeAudio();

  const tokenBalanceEl = $("tokenBalance");
  const modelMoodEl = $("modelMood");
  const marqueeTextEl = $("marqueeText");
  const spinBtn = $("spinBtn");
  const spinCostEl = $("spinCost");
  const spinCostLabelEl = $("spinCostLabel");
  const totalSpinsEl = $("totalSpins");
  const netTokensEl = $("netTokens");
  const resultTitleEl = $("resultTitle");
  const resultDetailEl = $("resultDetail");
  const payoutTableEl = $("payoutTable");
  const achievementsEl = $("achievements");

  const reelEls = [$("reel0"), $("reel1"), $("reel2")];
  const reelResultEls = [$("reel0Result"), $("reel1Result"), $("reel2Result")];
  const stripEls = reelEls.map((r) => r.querySelector(".reel__strip"));

  const autospinBtn = $("autospinBtn");
  const muteBtn = $("muteBtn");
  const shareBtn = $("shareBtn");
  const fullscreenBtn = $("fullscreenBtn");
  const resetBtn = $("resetBtn");

  let spinning = false;
  let autospinTimer = null;

  function setMuted(m) {
    state.muted = m;
    muteBtn.setAttribute("aria-pressed", String(!m));
    muteBtn.textContent = m ? "Sound (off)" : "Sound (on)";
    saveState(state);
  }

  function setAutospin(on) {
    state.autospin = on;
    autospinBtn.setAttribute("aria-pressed", String(on));
    autospinBtn.textContent = on ? "Auto-spin (on)" : "Auto-spin";
    saveState(state);
  }

  function canAfford(cost) {
    return state.tokens >= cost;
  }

  function updateHUD() {
    ensureMoodFresh(state);
    const cost = getSpinCost(state);
    setText(tokenBalanceEl, formatInt(state.tokens));
    setText(modelMoodEl, moodLabel(state.modelMood));
    setText(spinCostEl, `${formatInt(cost)} tokens`);
    setText(spinCostLabelEl, `Costs ${formatInt(cost)}`);
    setText(totalSpinsEl, formatInt(state.totalSpins));
    const net = state.totalWon - state.totalPaid;
    netTokensEl.textContent = `${net >= 0 ? "+" : "−"}${formatInt(Math.abs(net))}`;
    netTokensEl.style.color = net >= 0 ? "rgba(46,230,166,.95)" : "rgba(255,77,109,.95)";

    buildPayoutTable(payoutTableEl, cost);
    buildAchievements(achievementsEl, state);

    spinBtn.disabled = spinning || !canAfford(cost);
    if (!canAfford(cost) && !spinning) {
      resultTitleEl.textContent = "Insufficient tokens.";
      resultDetailEl.textContent = "Your balance is out of alignment with reality.";
    }

    marqueeTextEl.textContent = `${randomMarquee()}  •  Mood: ${moodMessage(state.modelMood)}`;
    saveState(state);
  }

  function bumpCounts(symbols) {
    for (const s of symbols) state.symbolCounts[s] = (state.symbolCounts[s] ?? 0) + 1;
    if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
      state.tripleCounts[symbols[0]] = (state.tripleCounts[symbols[0]] ?? 0) + 1;
      state.totalWins3x += 1;
    }
  }

  function prettyCombo(symbols) {
    return symbols.map((s) => s.padEnd(13, " ")).join(" | ").trim();
  }

  function kickReels(symbols, cost, payout) {
    for (const r of reelEls) r.classList.remove("pop");
    for (const r of reelEls) r.classList.add("spin");

    const filler = [
      "GPU",
      "PROMPT",
      "CACHE",
      "TOKEN",
      "⌛",
      "HALLUCINATION",
      "ALIGNMENT",
      "429",
      "500",
      "∑",
      "🤖",
      "✨",
    ];

    for (let i = 0; i < stripEls.length; i++) {
      const ul = stripEls[i];
      const list = [];
      for (let k = 0; k < 22; k++) {
        const idx = Math.floor(cryptoRandomFloat01() * filler.length);
        list.push(filler[idx]);
      }
      list.push(symbols[i]);
      list.push(filler[Math.floor(cryptoRandomFloat01() * filler.length)]);
      buildReelStrip(ul, list);
      ul.style.transform = "translateY(0px)";
      void ul.offsetHeight;
      spinStrip(ul, symbols[i], { spinMs: 900 + i * 180, overshoot: 2 + (2 - i) });
      reelResultEls[i].textContent = symbols[i];
    }

    const settleMs = 1200;
    window.setTimeout(() => {
      for (const r of reelEls) r.classList.remove("spin");
      if (payout > 0) reelEls.forEach((r) => r.classList.add("pop"));
    }, settleMs);
  }

  function spinOnce() {
    audio.unlock();
    ensureMoodFresh(state);
    const cost = getSpinCost(state);
    if (spinning) return;
    if (!canAfford(cost)) {
      updateHUD();
      return;
    }

    spinning = true;
    spinBtn.disabled = true;

    state.tokens -= cost;
    state.totalPaid += cost;
    state.totalSpins += 1;

    const picked = [0, 1, 2].map(() => cryptoPickWeighted(SYMBOLS).label);
    const payout = computePayout(picked, cost);
    state.tokens += payout;
    state.totalWon += payout;
    bumpCounts(picked);

    kickReels(picked, cost, payout);

    const k = sameCount(picked[0], picked[1], picked[2]);
    const winType = k === 3 ? "jackpot" : k === 2 ? "win" : "lose";

    if (!state.muted) audio.beep(winType === "jackpot" ? "jackpot" : winType);
    if (winType === "jackpot") vibrate([20, 40, 20, 80, 20]);
    else if (winType === "win") vibrate([25, 35, 25]);
    else vibrate([10]);

    const mood = state.modelMood;
    const flavor = SYMBOLS.find((s) => s.label === picked[0])?.flavor;

    if (k === 3) {
      resultTitleEl.textContent =
        picked[0] === "HALLUCINATION"
          ? "JACKPOT: HALLUCINATION ×3"
          : `JACKPOT: ${picked[0]} ×3`;
      resultDetailEl.textContent =
        picked[0] === "HALLUCINATION"
          ? `You won ${formatInt(payout)} tokens and an unsolicited explanation. (${prettyCombo(
              picked
            )})`
          : `You won ${formatInt(payout)} tokens. ${flavor ?? ""} (${prettyCombo(picked)})`;
    } else if (k === 2) {
      resultTitleEl.textContent = "Pair bonus: mostly aligned.";
      resultDetailEl.textContent = `You got ${formatInt(
        payout
      )} tokens back. The model calls it “generalization”. (${prettyCombo(picked)})`;
    } else {
      resultTitleEl.textContent = "No match. The model shrugs.";
      const lines = [
        `Spent ${formatInt(cost)} tokens to learn nothing.`,
        "The machine suggests: try again (it is not a fiduciary).",
        "Have you considered a different prompt?",
        `Mood check: ${moodLabel(mood)}.`,
      ];
      resultDetailEl.textContent = `${lines[Math.floor(cryptoRandomFloat01() * lines.length)]} (${prettyCombo(
        picked
      )})`;
    }

    state.lastReceipt = {
      at: Date.now(),
      cost,
      payout,
      symbols: picked,
      mood: moodLabel(state.modelMood),
      tokensAfter: state.tokens,
    };

    const settleMs = 1250;
    window.setTimeout(() => {
      spinning = false;
      updateHUD();
      scheduleAutospin();
    }, settleMs);
  }

  async function shareReceipt() {
    audio.unlock();
    const r = state.lastReceipt;
    if (!r) {
      resultTitleEl.textContent = "No receipt yet.";
      resultDetailEl.textContent = "Spin once so we can itemize your regret.";
      return;
    }
    const when = new Date(r.at).toLocaleString();
    const combo = r.symbols.join(" | ");
    const net = r.payout - r.cost;
    const line = `TokenSpin™ Receipt (${when})
Combo: ${combo}
Cost: ${r.cost} tokens
Payout: ${r.payout} tokens
Net: ${net >= 0 ? "+" : "−"}${Math.abs(net)} tokens
Mood: ${r.mood}
Balance: ${r.tokensAfter} tokens
`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "TokenSpin™ Receipt",
          text: line,
        });
        resultTitleEl.textContent = "Shared.";
        resultDetailEl.textContent = "Thank you for exporting your shame.";
        return;
      }
    } catch {
      // user cancelled or share failed; fall through to copy
    }

    try {
      await navigator.clipboard.writeText(line);
      resultTitleEl.textContent = "Copied.";
      resultDetailEl.textContent = "Receipt copied to clipboard. Litigation pending.";
    } catch {
      resultTitleEl.textContent = "Copy blocked.";
      resultDetailEl.textContent = "Your browser refused to cooperate. You are free (for now).";
    }
  }

  function scheduleAutospin() {
    if (autospinTimer) {
      window.clearTimeout(autospinTimer);
      autospinTimer = null;
    }
    if (!state.autospin) return;
    if (spinning) return;
    const cost = getSpinCost(state);
    if (!canAfford(cost)) return;
    autospinTimer = window.setTimeout(() => {
      spinOnce();
    }, 700);
  }

  function toggleFullscreen() {
    const root = document.documentElement;
    if (!document.fullscreenElement) {
      root.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  function hardReset() {
    if (!confirm("Factory reset TokenSpin? This deletes your imaginary fortune.")) return;
    localStorage.removeItem(STORAGE_KEY);
    const fresh = defaultState();
    Object.assign(state, fresh);
    reelResultEls.forEach((el) => (el.textContent = "—"));
    resultTitleEl.textContent = "Reset complete.";
    resultDetailEl.textContent = "All tokens were returned to the void (environmentally friendly).";
    setMuted(false);
    setAutospin(false);
    updateHUD();
  }

  spinBtn.addEventListener("click", spinOnce);
  autospinBtn.addEventListener("click", () => {
    setAutospin(!state.autospin);
    updateHUD();
    scheduleAutospin();
  });
  muteBtn.addEventListener("click", () => setMuted(!state.muted));
  shareBtn.addEventListener("click", () => void shareReceipt());
  fullscreenBtn.addEventListener("click", toggleFullscreen);
  resetBtn.addEventListener("click", hardReset);

  window.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") {
      if (document.activeElement && document.activeElement.tagName === "BUTTON") return;
      e.preventDefault();
      spinOnce();
    }
    if (e.key.toLowerCase() === "m") setMuted(!state.muted);
    if (e.key.toLowerCase() === "a") {
      setAutospin(!state.autospin);
      scheduleAutospin();
      updateHUD();
    }
    if (e.key.toLowerCase() === "f") toggleFullscreen();
    if (e.key.toLowerCase() === "s") void shareReceipt();
  });

  // Initial UI
  setMuted(Boolean(state.muted));
  setAutospin(Boolean(state.autospin));
  updateHUD();
  scheduleAutospin();
}

document.addEventListener("DOMContentLoaded", main);

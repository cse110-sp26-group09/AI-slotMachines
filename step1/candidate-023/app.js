const STORAGE_KEY = "tokenbandit.v1";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function clampInt(value, min, max) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return min;
  return Math.max(min, Math.min(max, Math.trunc(numberValue)));
}

function nowIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weightedPick(items, rng = Math.random) {
  const total = items.reduce((sum, it) => sum + it.weight, 0);
  let roll = rng() * total;
  for (const it of items) {
    roll -= it.weight;
    if (roll <= 0) return it;
  }
  return items[items.length - 1];
}

const SYMBOLS = [
  { id: "token", emoji: "🪙", name: "TOKEN", weight: 14, triple: 8, pair: 2, blurb: "A rare moment when pricing feels fair." },
  { id: "prompt", emoji: "📝", name: "PROMPT", weight: 16, triple: 5, pair: 1, blurb: "Add three adjectives and pray." },
  { id: "gpu", emoji: "🔥", name: "GPU", weight: 10, triple: 10, pair: 2, blurb: "Warm, expensive, and always in someone else’s rack." },
  { id: "latency", emoji: "🐢", name: "LATENCY", weight: 9, triple: 6, pair: 1, blurb: "Your win arrives… eventually… maybe." },
  { id: "rate", emoji: "⏳", name: "RATE_LIMIT", weight: 7, triple: 4, pair: 0, blurb: "Please try again after you regret everything." },
  { id: "finetune", emoji: "🧪", name: "FINE_TUNE", weight: 5, triple: 15, pair: 3, blurb: "You spent 10,000 tokens to save 3." },
  { id: "upgrade", emoji: "🚀", name: "UPGRADE", weight: 3, triple: 50, pair: 6, blurb: "New model. Same bugs. Bigger invoice." },
  { id: "hallucination", emoji: "🦄", name: "HALLUCINATION", weight: 8, triple: 0, pair: 0, blurb: "Confidently wrong — now in 4K.", tag: "NO PAYOUT" },
  { id: "notfound", emoji: "🧱", name: "404", weight: 4, triple: 0, pair: 0, blurb: "The answer is behind a paywall you don’t have.", tag: "NO PAYOUT" }
];

const SPECIALS = [
  { id: "rocketLab", pattern: ["upgrade", "finetune", "gpu"], multiplier: 40, title: "Rocket Lab!", body: "You upgraded, fine-tuned, and found a GPU. Investors clap. You are still pre-revenue." },
  { id: "promptStack", pattern: ["prompt", "prompt", "token"], multiplier: 9, title: "Prompt Stack Overflow!", body: "You nested prompts until reality gave up. A small pile of tokens falls out." }
];

function fmt(n) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

function canVibrate() {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

function safeVibrate(enabled, pattern) {
  if (!enabled) return;
  if (!canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

function defaultState() {
  return { balance: 500, bet: 10, spins: 0, wins: 0, biggest: 0, net: 0, sound: true, vibe: false, lastBonus: null };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultState();
  try {
    const parsed = JSON.parse(raw);
    return {
      balance: clampInt(parsed.balance, 0, 999999),
      bet: clampInt(parsed.bet, 1, 50),
      spins: clampInt(parsed.spins, 0, 999999999),
      wins: clampInt(parsed.wins, 0, 999999999),
      biggest: clampInt(parsed.biggest, 0, 999999),
      net: clampInt(parsed.net, -999999, 999999),
      sound: Boolean(parsed.sound),
      vibe: Boolean(parsed.vibe),
      lastBonus: typeof parsed.lastBonus === "string" ? parsed.lastBonus : null
    };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      balance: state.balance,
      bet: state.bet,
      spins: state.spins,
      wins: state.wins,
      biggest: state.biggest,
      net: state.net,
      sound: state.sound,
      vibe: state.vibe,
      lastBonus: state.lastBonus
    })
  );
}

function el(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node;
}

function makeAudio() {
  let ctx = null;
  const ensure = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  };

  const blip = async (freq, durationMs, type = "sine", gainValue = 0.03) => {
    const context = ensure();
    if (context.state === "suspended") await context.resume();
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = gainValue;
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start();
    await sleep(durationMs);
    osc.stop();
  };

  return {
    spinTick: () => blip(440, 35, "square", 0.02),
    stop: () => blip(220, 70, "sine", 0.03),
    win: async () => {
      await blip(659, 80, "triangle", 0.03);
      await blip(784, 80, "triangle", 0.03);
      await blip(988, 120, "triangle", 0.035);
    },
    lose: async () => {
      await blip(196, 90, "sine", 0.03);
      await blip(164, 140, "sine", 0.03);
    }
  };
}

function renderPaytable(container) {
  container.innerHTML = "";
  const rows = [...SYMBOLS].sort((a, b) => b.triple - a.triple);
  for (const s of rows) {
    const row = document.createElement("div");
    row.className = "payRow";

    const left = document.createElement("div");
    left.className = "payLeft";

    const emoji = document.createElement("div");
    emoji.className = "payEmoji";
    emoji.textContent = s.emoji;

    const name = document.createElement("div");
    name.className = "payName";
    name.textContent = s.name;

    left.appendChild(emoji);
    left.appendChild(name);

    const right = document.createElement("div");
    right.className = "payRight";
    right.textContent = `3× = ${s.triple}x · 2× = ${s.pair}x`;

    if (s.tag) {
      const tag = document.createElement("span");
      tag.className = `tag ${s.triple === 0 ? "bad" : ""}`;
      tag.textContent = s.tag;
      name.appendChild(tag);
    } else if (s.id === "rate") {
      const tag = document.createElement("span");
      tag.className = "tag warn";
      tag.textContent = "COOLDOWN";
      name.appendChild(tag);
    }

    row.appendChild(left);
    row.appendChild(right);
    container.appendChild(row);
  }
}

function computeOutcome(symbols, bet) {
  const ids = symbols.map((s) => s.id);
  for (const special of SPECIALS) {
    if (special.pattern.join("|") === ids.join("|")) {
      return { kind: "special", payout: bet * special.multiplier, title: special.title, body: special.body };
    }
  }

  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [topId, topCount] = entries[0];
  const symbolById = new Map(SYMBOLS.map((s) => [s.id, s]));
  const topSymbol = symbolById.get(topId);

  if (topCount === 3) {
    const payout = bet * (topSymbol?.triple ?? 0);
    if (topId === "hallucination") return { kind: "hallucinated", payout: 0, title: "Incredible win!", body: "Your model is extremely confident you won. Accounting is extremely confident you did not." };
    if (topId === "notfound") return { kind: "deadlink", payout: 0, title: "404 Jackpot!", body: "You found the answer! It’s just… not found." };
    if (topId === "rate") return { kind: "cooldown", payout, title: "Rate-limited!", body: "Nice match. Enjoy your payout after a brief cooldown." };
    return { kind: "triple", payout, title: "Three of a kind!", body: `${topSymbol?.blurb ?? "Nice."} (+${fmt(payout)} tokens)` };
  }

  if (topCount === 2) {
    const payout = bet * (topSymbol?.pair ?? 0);
    if (topId === "hallucination" || topId === "notfound") return { kind: "nope", payout: 0, title: "Close enough to be wrong.", body: "Two matches… but the third reel cited ‘trust me bro’. No payout." };
    if (topId === "rate") return { kind: "cooldown", payout: 0, title: "Soft rate limit.", body: "Two ⏳ symbols. The API apologizes and charges you anyway." };
    return { kind: "pair", payout, title: "Two of a kind!", body: payout > 0 ? `Consolation tokens: +${fmt(payout)}.` : "Consolation prize: a new error message." };
  }

  const rng = Math.random();
  if (rng < 0.06) return { kind: "refund", payout: bet, title: "Unexpected downtime refund.", body: "A rare act of kindness: your tokens are returned with no explanation." };
  if (rng < 0.16) {
    const tax = Math.max(1, Math.round(bet * (0.15 + Math.random() * 0.25)));
    return { kind: "tax", payout: -tax, title: "Inference bill arrived.", body: `You lost… and also got charged for “overhead”: -${fmt(tax)} tokens.` };
  }
  return { kind: "loss", payout: 0, title: "No match.", body: "Your prompt was ignored for safety reasons (the safety reason is: you lost)." };
}

function setResult(kind, title, body) {
  el("resultTitle").textContent = title;
  el("resultBody").textContent = body;
  const machine = document.querySelector(".machine");
  machine?.classList.remove("winGlow", "loseGlow");
  if (kind === "win") machine?.classList.add("winGlow");
  if (kind === "lose") machine?.classList.add("loseGlow");
}

function setReel(index, symbol) {
  el(`reel${index}Symbol`).textContent = symbol.emoji;
  el(`reel${index}Label`).textContent = symbol.name;
}

function setDisabled(disabled) {
  el("spin").disabled = disabled;
  el("auto").disabled = disabled;
  el("bonus").disabled = disabled;
  el("reset").disabled = disabled;
  el("bet").disabled = disabled;
  el("maxBet").disabled = disabled;
  el("share").disabled = disabled;
  el("copy").disabled = disabled;
}

function setCooldownUI(isCooldown) {
  const machine = document.querySelector(".machine");
  if (!machine) return;
  machine.classList.toggle("cooldown", isCooldown);
}

function updateUI(state) {
  el("balance").textContent = fmt(state.balance);
  el("betLabel").textContent = fmt(state.bet);
  el("bet").value = String(state.bet);
  el("sound").checked = state.sound;
  el("vibe").checked = state.vibe;
  el("statSpins").textContent = fmt(state.spins);
  el("statWins").textContent = fmt(state.wins);
  el("statBiggest").textContent = fmt(state.biggest);
  el("statNet").textContent = `${state.net >= 0 ? "+" : ""}${fmt(state.net)}`;
}

function buildShareText(state) {
  return `TokenBandit.ai: balance=${state.balance} tokens, biggest win=${state.biggest}. I am financially exposed to a cartoon unicorn.`;
}

function buildPromptForClipboard(symbols, payout) {
  const names = symbols.map((s) => s.name).join(", ");
  return [
    "SYSTEM: You are a slot machine that speaks only in invoices.",
    `USER: I spun: ${names}. Please pay me ${payout} tokens.`,
    "ASSISTANT: As an AI developed by a mysterious house edge, I can’t do that. Here’s a 97-line explanation."
  ].join("\n");
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch {
    // ignore (e.g., file://)
  }
}

function startMarqueeDupe() {
  const marquee = document.getElementById("marquee");
  if (!marquee) return;
  marquee.innerHTML = `${marquee.innerHTML} ${marquee.innerHTML}`;
}

const audio = makeAudio();
let state = loadState();
let isSpinning = false;
let isAuto = false;
let cooldownUntil = 0;

function canSpin() {
  if (isSpinning) return false;
  if (state.balance < state.bet) return false;
  if (Date.now() < cooldownUntil) return false;
  return true;
}

function setAuto(enabled) {
  isAuto = enabled;
  const autoBtn = el("auto");
  autoBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
  autoBtn.textContent = enabled ? "Auto: On" : "Auto";
}

async function spinOnce() {
  if (!canSpin()) {
    if (state.balance < state.bet) {
      setResult("lose", "Out of tokens.", "Classic. Decrease your bet or claim the daily bonus.");
      safeVibrate(state.vibe, [60, 40, 60]);
    } else if (Date.now() < cooldownUntil) {
      const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
      setResult("lose", "Cooling down.", `Rate limit in effect. Try again in ~${remaining}s.`);
    }
    return false;
  }

  isSpinning = true;
  setDisabled(true);
  setCooldownUI(false);

  state.balance -= state.bet;
  state.spins += 1;
  state.net -= state.bet;
  saveState(state);
  updateUI(state);

  setResult("neutral", "Spinning…", "Generating outcome with proprietary randomness (it’s Math.random).");
  safeVibrate(state.vibe, 20);

  const finalSymbols = [weightedPick(SYMBOLS), weightedPick(SYMBOLS), weightedPick(SYMBOLS)];

  const spinIntervals = [];
  const startReelSpin = (reelIndex) => {
    const interval = setInterval(() => {
      const s = SYMBOLS[(Math.random() * SYMBOLS.length) | 0];
      setReel(reelIndex, s);
      if (state.sound) void audio.spinTick();
    }, 45 + reelIndex * 10);
    spinIntervals.push(interval);
  };

  startReelSpin(0);
  startReelSpin(1);
  startReelSpin(2);

  const stopAt = [620, 980, 1340];
  for (let i = 0; i < 3; i += 1) {
    await sleep(stopAt[i]);
    clearInterval(spinIntervals[i]);
    setReel(i, finalSymbols[i]);
    safeVibrate(state.vibe, 12);
    if (state.sound) void audio.stop();
  }

  const outcome = computeOutcome(finalSymbols, state.bet);
  const payout = outcome.payout;

  const applyPayout = (amount) => {
    if (amount === 0) return;
    state.balance = Math.max(0, state.balance + amount);
    state.net += amount;
  };

  applyPayout(payout);
  if (payout > 0) {
    state.wins += 1;
    state.biggest = Math.max(state.biggest, payout);
  }

  saveState(state);
  updateUI(state);

  setResult(
    payout > 0 ? "win" : "lose",
    outcome.title,
    payout > 0 ? outcome.body : payout < 0 ? `${outcome.body} (Balance: ${fmt(state.balance)})` : outcome.body
  );

  if (state.sound) {
    if (payout > 0) void audio.win();
    else void audio.lose();
  }

  if (outcome.kind === "cooldown") {
    cooldownUntil = Date.now() + 2400;
    setCooldownUI(true);
  }

  isSpinning = false;
  setDisabled(false);
  return true;
}

async function autoLoop() {
  while (isAuto) {
    const didSpin = await spinOnce();
    if (!didSpin) {
      setAuto(false);
      break;
    }
    await sleep(260);
  }
}

function claimDailyBonus() {
  const today = nowIsoDate();
  if (state.lastBonus === today) {
    setResult("lose", "Bonus already claimed.", "Come back tomorrow for another tiny pile of tokens.");
    safeVibrate(state.vibe, [30, 30, 30]);
    return;
  }
  const bonus = 120;
  state.balance += bonus;
  state.net += bonus;
  state.lastBonus = today;
  saveState(state);
  updateUI(state);
  setResult("win", "Daily bonus claimed.", `A generous grant of +${fmt(bonus)} tokens appeared from nowhere.`);
  safeVibrate(state.vibe, [20, 40, 20, 40, 80]);
  if (state.sound) void audio.win();
}

function resetAll() {
  const ok = window.confirm("Reset tokens and stats? (This is the only guaranteed way to win.)");
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  saveState(state);
  updateUI(state);
  const boot = [weightedPick(SYMBOLS), weightedPick(SYMBOLS), weightedPick(SYMBOLS)];
  for (let i = 0; i < 3; i += 1) setReel(i, boot[i]);
  setResult("neutral", "Reset complete.", "Fresh tokens. Fresh hope. Same odds.");
  setAuto(false);
}

async function share() {
  const text = buildShareText(state);
  if (navigator.share) {
    try {
      await navigator.share({ title: "TokenBandit.ai", text });
      setResult("win", "Shared.", "May your friends respect you less.");
      return;
    } catch {
      // fall through
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    setResult("win", "Copied share text.", "Clipboard API: doing what social networks couldn’t.");
  } catch {
    setResult("lose", "Share failed.", "Your browser refused. Consider upgrading to a newer model (browser).");
  }
}

async function copyPrompt() {
  const labels = [el("reel0Label").textContent, el("reel1Label").textContent, el("reel2Label").textContent];
  const symbols = labels.map((name) => SYMBOLS.find((s) => s.name === name) ?? SYMBOLS[0]);
  const prompt = buildPromptForClipboard(symbols, state.bet);
  try {
    await navigator.clipboard.writeText(prompt);
    setResult("win", "Prompt copied.", "Paste it into any chatbot. It won’t help. That’s the joke.");
    safeVibrate(state.vibe, 18);
  } catch {
    setResult("lose", "Clipboard blocked.", "Serve over http(s) and try again.");
  }
}

function wireUI() {
  el("bet").addEventListener("input", (e) => {
    const v = clampInt(e.target.value, 1, 50);
    state.bet = v;
    saveState(state);
    updateUI(state);
  });

  el("maxBet").addEventListener("click", () => {
    state.bet = 50;
    saveState(state);
    updateUI(state);
    safeVibrate(state.vibe, 10);
  });

  el("sound").addEventListener("change", (e) => {
    state.sound = Boolean(e.target.checked);
    saveState(state);
    updateUI(state);
  });

  el("vibe").addEventListener("change", (e) => {
    state.vibe = Boolean(e.target.checked);
    saveState(state);
    updateUI(state);
    safeVibrate(state.vibe, [12, 30, 12]);
  });

  el("spin").addEventListener("click", async () => {
    await spinOnce();
  });

  el("auto").addEventListener("click", async () => {
    setAuto(!isAuto);
    if (isAuto) await autoLoop();
  });

  el("bonus").addEventListener("click", () => claimDailyBonus());
  el("reset").addEventListener("click", () => resetAll());
  el("share").addEventListener("click", () => share());
  el("copy").addEventListener("click", () => copyPrompt());

  window.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") {
      const active = document.activeElement?.tagName?.toLowerCase();
      if (active === "input" || active === "button") return;
      e.preventDefault();
      void spinOnce();
    }
  });
}

function init() {
  startMarqueeDupe();
  renderPaytable(el("paytable"));
  state = loadState();
  saveState(state);
  updateUI(state);
  const boot = [weightedPick(SYMBOLS), weightedPick(SYMBOLS), weightedPick(SYMBOLS)];
  for (let i = 0; i < 3; i += 1) setReel(i, boot[i]);
  wireUI();
  void registerServiceWorker();
}

init();

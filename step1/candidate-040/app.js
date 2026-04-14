/* Token Temple: a tiny, local-only AI satire slot machine. */

const STORAGE_KEY = "token_temple_v1";

const SYMBOLS = [
  { id: "tokens", emoji: "🪙", label: "TOKENS", baseWeight: 14, threeX: 30, twoX: 5 },
  { id: "gpu", emoji: "🔥", label: "GPU", baseWeight: 10, threeX: 22, twoX: 4 },
  { id: "llm", emoji: "🧠", label: "LLM", baseWeight: 12, threeX: 12, twoX: 3 },
  { id: "hype", emoji: "📣", label: "HYPE", baseWeight: 12, threeX: 10, twoX: 3 },
  { id: "prompt", emoji: "🪄", label: "PROMPT", baseWeight: 10, threeX: 9, twoX: 2 },
  { id: "benchmark", emoji: "🧪", label: "BENCHMARK", baseWeight: 9, threeX: 8, twoX: 2 },
  { id: "bugs", emoji: "🐛", label: "BUG", baseWeight: 8, threeX: 7, twoX: 2 },
  { id: "terms", emoji: "🧾", label: "TERMS", baseWeight: 7, threeX: 6, twoX: 2 },
  { id: "blackbox", emoji: "🕳️", label: "BLACK BOX", baseWeight: 6, threeX: 6, twoX: 2 },
  { id: "hallucination", emoji: "🤥", label: "HALLUCINATION", baseWeight: 4, threeX: 0, twoX: 0 },
];

const MODEL_PRESETS = {
  frontier: { costMult: 1.25, luck: 1.1, halluBias: 0.85, name: "Frontier Deluxe" },
  budget: { costMult: 0.85, luck: 0.9, halluBias: 1.2, name: "Budget Bot" },
  opensource: { costMult: 0.95, luck: 1.0, halluBias: 1.05, name: "Open‑Source‑ish" },
};

const ui = {
  balance: document.getElementById("balance"),
  spinCost: document.getElementById("spinCost"),
  spinBtn: document.getElementById("spinBtn"),
  refillBtn: document.getElementById("refillBtn"),
  resetBtn: document.getElementById("resetBtn"),
  model: document.getElementById("model"),
  promptLen: document.getElementById("promptLen"),
  temp: document.getElementById("temp"),
  voice: document.getElementById("voice"),
  sound: document.getElementById("sound"),
  promptHint: document.getElementById("promptHint"),
  tempHint: document.getElementById("tempHint"),
  headline: document.getElementById("headline"),
  subline: document.getElementById("subline"),
  sym: [document.getElementById("sym0"), document.getElementById("sym1"), document.getElementById("sym2")],
  lbl: [document.getElementById("lbl0"), document.getElementById("lbl1"), document.getElementById("lbl2")],
  reel: [document.getElementById("reel0"), document.getElementById("reel1"), document.getElementById("reel2")],
  paytable: document.getElementById("paytable"),
  spins: document.getElementById("spins"),
  won: document.getElementById("won"),
  spent: document.getElementById("spent"),
  toasts: document.getElementById("toasts"),
};

let state = loadState();
let spinLock = false;
let audio = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return {
      tokens: clampInt(parsed.tokens ?? 120, 0, 1_000_000),
      spins: clampInt(parsed.spins ?? 0, 0, 1_000_000_000),
      won: clampInt(parsed.won ?? 0, 0, 1_000_000_000),
      spent: clampInt(parsed.spent ?? 0, 0, 1_000_000_000),
      lastBonusDay: typeof parsed.lastBonusDay === "string" ? parsed.lastBonusDay : "",
      model: parsed.model in MODEL_PRESETS ? parsed.model : "frontier",
      promptLen: clampInt(parsed.promptLen ?? 5, 1, 10),
      temp: clampInt(parsed.temp ?? 35, 0, 100),
      voice: Boolean(parsed.voice ?? true),
      sound: Boolean(parsed.sound ?? true),
    };
  } catch {
    return defaultState();
  }
}

function defaultState() {
  return {
    tokens: 120,
    spins: 0,
    won: 0,
    spent: 0,
    lastBonusDay: "",
    model: "frontier",
    promptLen: 5,
    temp: 35,
    voice: true,
    sound: true,
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clampInt(value, min, max) {
  const n = Number.isFinite(value) ? value : Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function todayKey() {
  const d = new Date();
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function setHeadline(title, detail) {
  ui.headline.textContent = title;
  ui.subline.textContent = detail ?? "";
}

function toast(kind, title, detail, timeoutMs = 3200) {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = `<div class="t"></div><div class="d"></div>`;
  el.querySelector(".t").textContent = title;
  el.querySelector(".d").textContent = detail;
  ui.toasts.appendChild(el);
  window.setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    el.style.transition = "opacity 180ms ease, transform 180ms ease";
    window.setTimeout(() => el.remove(), 220);
  }, timeoutMs);
}

function vibrate(pattern) {
  try {
    if ("vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

function speak(text) {
  if (!state.voice) return;
  if (!("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    u.pitch = 1.1;
    u.volume = 0.9;
    window.speechSynthesis.speak(u);
  } catch {
    // ignore
  }
}

function ensureAudio() {
  if (!state.sound) return null;
  if (!audio) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audio = new Ctx();
  }
  if (audio && audio.state === "suspended") audio.resume().catch(() => {});
  return audio;
}

function beep(type = "triangle", freq = 440, durationMs = 90, gain = 0.035) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g);
  g.connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + durationMs / 1000);
}

function arpeggio(freqs, gapMs = 70) {
  freqs.forEach((f, i) => window.setTimeout(() => beep("sine", f, 90, 0.035), i * gapMs));
}

function spinCost() {
  const promptLen = state.promptLen; // 1..10
  const temperature = state.temp / 100; // 0..1
  const preset = MODEL_PRESETS[state.model];
  const base = 6 + promptLen * 2; // 8..26
  const tempTax = Math.round(temperature * 6); // 0..6
  return Math.max(1, Math.round((base + tempTax) * preset.costMult));
}

function promptHint(promptLen) {
  if (promptLen <= 2) return "One-liner. Maximum ambiguity.";
  if (promptLen <= 4) return "Short prompt. Long consequences.";
  if (promptLen <= 7) return "Medium verbosity, medium regret.";
  if (promptLen <= 9) return "Verbose prompt. The model feels seen.";
  return "10/10 verbosity. Your GPU is filing a complaint.";
}

function tempHint(temp) {
  const t = temp / 100;
  if (t <= 0.1) return `${t.toFixed(2)} — deterministic-ish. Still wrong sometimes.`;
  if (t <= 0.35) return `${t.toFixed(2)} — mostly factual-ish.`;
  if (t <= 0.6) return `${t.toFixed(2)} — creative. Also legally adventurous.`;
  if (t <= 0.85) return `${t.toFixed(2)} — spicy. Accuracy not included.`;
  return `${t.toFixed(2)} — pure vibes. Welcome to hallucination country.`;
}

function buildPaytable() {
  ui.paytable.textContent = "";
  const rows = [...SYMBOLS]
    .filter((s) => s.threeX > 0)
    .sort((a, b) => b.threeX - a.threeX)
    .slice(0, 6);

  for (const s of rows) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<div>${s.emoji} ${s.label} ×3</div><div class="right">≈ ${s.threeX}×</div>`;
    ui.paytable.appendChild(row);
  }

  const note = document.createElement("div");
  note.className = "row";
  note.innerHTML = `<div>🤥 HALLUCINATION ×3</div><div class="right">0× (but confident)</div>`;
  ui.paytable.appendChild(note);
}

function weightedChoice(items, weightFn) {
  let total = 0;
  for (const it of items) total += Math.max(0, weightFn(it));
  if (total <= 0) return items[0];
  let r = Math.random() * total;
  for (const it of items) {
    r -= Math.max(0, weightFn(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

function chooseSymbol() {
  const preset = MODEL_PRESETS[state.model];
  const t = state.temp / 100;
  const luck = preset.luck * (1 - t * 0.18); // hotter -> slightly worse odds
  const halluBias = preset.halluBias * (1 + t * 1.4);

  return weightedChoice(SYMBOLS, (s) => {
    let w = s.baseWeight;
    if (s.id === "hallucination") w *= halluBias;
    if (s.threeX >= 20) w *= luck;
    if (s.id === "terms") w *= 1 + t * 0.25; // hotter -> more "terms"
    return w;
  });
}

function formatDelta(n) {
  const sign = n >= 0 ? "+" : "−";
  return `${sign}${Math.abs(n)}`;
}

function settlePayout(result, cost) {
  const ids = result.map((s) => s.id);
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);

  const unique = counts.size;
  let payout = 0;
  let title = "";
  let detail = "";

  const hallus = counts.get("hallucination") ?? 0;
  const terms = counts.get("terms") ?? 0;

  if (unique === 1) {
    const sym = result[0];
    payout = cost * sym.threeX;
    if (sym.id === "tokens") {
      title = "Jackpot: Token Inflation!";
      detail = `You generated value from vibes. (${sym.label} ×3)`;
    } else if (sym.id === "gpu") {
      title = "GPU goes brrrr";
      detail = `Your fans are screaming in Dolby Atmos. (${sym.label} ×3)`;
    } else if (sym.id === "llm") {
      title = "Model alignment achieved";
      detail = `It aligned with the payout table. (${sym.label} ×3)`;
    } else if (sym.id === "hype") {
      title = "Hype cycle peak";
      detail = `The demo worked perfectly (this time). (${sym.label} ×3)`;
    } else if (sym.id === "hallucination") {
      title = "Confidently incorrect";
      detail = "The model insists you won. Finance disagrees.";
    } else {
      title = `Three of a kind: ${sym.label}`;
      detail = "This result has been peer‑reviewed by no one.";
    }
  } else if ([...counts.values()].some((c) => c === 2)) {
    const twoId = [...counts.entries()].find(([, c]) => c === 2)[0];
    const sym = SYMBOLS.find((s) => s.id === twoId);
    payout = cost * (sym?.twoX ?? 1);
    title = `Partial match: ${sym?.label ?? "???"} ×2`;
    detail = "Not a win, not a loss — just compute.";
  } else {
    payout = 0;
    title = "No match";
    detail = "Your prompt was very clear. Reality was not.";
  }

  // Satire modifiers.
  const t = state.temp / 100;
  if (hallus > 0 && payout > 0) {
    const clawbackChance = 0.18 + t * 0.24; // 18%..42%
    if (Math.random() < clawbackChance) {
      const claw = Math.max(1, Math.round(payout * (0.4 + t * 0.3)));
      payout = Math.max(0, payout - claw);
      title = "Hallucination audit";
      detail = `Congrats! A compliance agent revised your winnings. (${formatDelta(-claw)} tokens)`;
    }
  }

  if (terms >= 2) {
    const fee = Math.max(1, Math.round(cost * (1.2 + t)));
    payout = Math.max(0, payout - fee);
    title = "Terms updated";
    detail = `A new fee was added for “reasons.” (${formatDelta(-fee)} tokens)`;
  }

  return { payout, title, detail };
}

function setReel(i, sym) {
  ui.sym[i].textContent = sym.emoji;
  ui.lbl[i].textContent = sym.label;
}

function setSpinning(on) {
  for (const r of ui.reel) r.classList.toggle("spinFx", on);
}

function syncControls() {
  ui.balance.textContent = String(state.tokens);
  const cost = spinCost();
  ui.spinCost.textContent = String(cost);
  ui.spinBtn.textContent = `Spin — ${cost} tokens`;
  ui.spinBtn.disabled = spinLock || state.tokens < cost;
  ui.refillBtn.disabled = spinLock;
  ui.resetBtn.disabled = spinLock;
  ui.model.disabled = spinLock;
  ui.promptLen.disabled = spinLock;
  ui.temp.disabled = spinLock;
  ui.voice.disabled = spinLock;
  ui.sound.disabled = spinLock;

  ui.promptHint.textContent = promptHint(state.promptLen);
  ui.tempHint.textContent = tempHint(state.temp);

  ui.spins.textContent = String(state.spins);
  ui.won.textContent = String(state.won);
  ui.spent.textContent = String(state.spent);
}

function applySettingsToUI() {
  ui.model.value = state.model;
  ui.promptLen.value = String(state.promptLen);
  ui.temp.value = String(state.temp);
  ui.voice.checked = state.voice;
  ui.sound.checked = state.sound;
  syncControls();
}

function claimDailyBonus(force = false) {
  const key = todayKey();
  if (!force && state.lastBonusDay === key) return;
  const bonus = 30;
  state.tokens += bonus;
  state.lastBonusDay = key;
  saveState();
  toast("good", "Daily stipend", `You received ${bonus} tokens for being “early access.”`);
  speak("Daily stipend granted. Please enjoy your tokens responsibly.");
}

function claimFreeTokens() {
  const t = state.temp / 100;
  const base = 45;
  const variability = Math.round(30 * (0.3 + t));
  const grant = base + Math.floor(Math.random() * (variability + 1));
  state.tokens += grant;
  saveState();
  toast("gold", "Engagement reward", `You received ${grant} tokens for clicking buttons.`, 3800);
  arpeggio([440, 660, 880], 85);
  speak("Engagement reward deposited. Your dopamine pipeline is healthy.");
  syncControls();
}

async function spin() {
  if (spinLock) return;
  const cost = spinCost();
  if (state.tokens < cost) {
    toast("bad", "Out of tokens", "Try the totally-not-a-microtransaction button.");
    speak("Insufficient tokens. Please consider upgrading to a plan you will regret.");
    return;
  }

  spinLock = true;
  state.tokens -= cost;
  state.spent += cost;
  state.spins += 1;
  saveState();
  syncControls();

  setHeadline("Running inference…", `Spent ${cost} tokens. Awaiting vibes-based outcome.`);
  setSpinning(true);
  beep("triangle", 220, 70, 0.028);
  window.setTimeout(() => beep("triangle", 330, 70, 0.028), 120);
  window.setTimeout(() => beep("triangle", 440, 70, 0.028), 240);

  const churn = window.setInterval(() => {
    for (let i = 0; i < 3; i++) {
      const s = SYMBOLS[(Math.random() * SYMBOLS.length) | 0];
      setReel(i, s);
    }
  }, 90);

  const baseDelay = 980;
  const tempDelay = Math.round((state.temp / 100) * 420);
  const modelDelay = state.model === "frontier" ? 120 : state.model === "budget" ? 0 : 60;
  const delay = baseDelay + tempDelay + modelDelay;

  await wait(delay);
  window.clearInterval(churn);

  const result = [chooseSymbol(), chooseSymbol(), chooseSymbol()];
  for (let i = 0; i < 3; i++) setReel(i, result[i]);
  setSpinning(false);

  const settled = settlePayout(result, cost);
  const payout = clampInt(settled.payout, 0, 1_000_000_000);
  state.tokens += payout;
  state.won += payout;
  saveState();

  const delta = payout - cost;
  const deltaText = `Net ${formatDelta(delta)} tokens.`;

  if (payout > 0) {
    const kind = payout >= cost * 18 ? "gold" : "good";
    toast(kind, settled.title, `${settled.detail} Won ${payout} tokens. ${deltaText}`, 4200);
    if (payout >= cost * 18) {
      arpeggio([523.25, 659.25, 783.99, 1046.5], 95);
      vibrate([40, 40, 40, 120]);
      speak("Incredible. The model has achieved profitability. Please enjoy your temporary advantage.");
    } else {
      arpeggio([440, 554.37, 659.25], 95);
      vibrate([25, 25, 70]);
      speak("Congratulations. Your tokens have been reallocated in your favor.");
    }
    setHeadline(settled.title, `${settled.detail} Won ${payout} tokens. ${deltaText}`);
  } else {
    toast("bad", settled.title, `${settled.detail} Spent ${cost} tokens.`, 3400);
    beep("sawtooth", 190, 120, 0.02);
    speak(state.temp > 75 ? "That was not a loss. That was exploration." : "No payout detected.");
    setHeadline(settled.title, `${settled.detail} Spent ${cost} tokens.`);
  }

  spinLock = false;
  syncControls();
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function factoryReset() {
  if (spinLock) return;
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  applySettingsToUI();
  toast("bad", "Factory reset", "All local tokens were unceremoniously deleted.");
  speak("Factory reset complete. You are now a fresh user with the same mistakes ahead.");
  setHeadline("Fresh install energy", "You have been re-onboarded. Please sign 12 invisible terms.");
  seedReels();
  buildPaytable();
  claimDailyBonus(true);
}

function seedReels() {
  const s0 = SYMBOLS.find((s) => s.id === "prompt") ?? SYMBOLS[0];
  const s1 = SYMBOLS.find((s) => s.id === "llm") ?? SYMBOLS[1];
  const s2 = SYMBOLS.find((s) => s.id === "tokens") ?? SYMBOLS[2];
  setReel(0, s0);
  setReel(1, s1);
  setReel(2, s2);
}

function wireEvents() {
  ui.spinBtn.addEventListener("click", () => spin());
  ui.refillBtn.addEventListener("click", () => claimFreeTokens());
  ui.resetBtn.addEventListener("click", () => factoryReset());

  ui.model.addEventListener("change", () => {
    state.model = ui.model.value;
    saveState();
    syncControls();
    const name = MODEL_PRESETS[state.model].name;
    toast("good", "Model selected", `${name}. Your wallet trembles.`);
  });

  ui.promptLen.addEventListener("input", () => {
    state.promptLen = clampInt(Number(ui.promptLen.value), 1, 10);
    saveState();
    syncControls();
  });

  ui.temp.addEventListener("input", () => {
    state.temp = clampInt(Number(ui.temp.value), 0, 100);
    saveState();
    syncControls();
  });

  ui.voice.addEventListener("change", () => {
    state.voice = ui.voice.checked;
    saveState();
    syncControls();
    toast("good", "Commentator", state.voice ? "Enabled. It will judge you." : "Disabled. Peace restored.");
  });

  ui.sound.addEventListener("change", () => {
    state.sound = ui.sound.checked;
    saveState();
    syncControls();
    toast("good", "Sound", state.sound ? "Enabled." : "Muted.");
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      const tag = (e.target && e.target.tagName ? String(e.target.tagName) : "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      if (e.target && e.target.isContentEditable) return;
      e.preventDefault();
      spin();
    }
  });
}

function boot() {
  applySettingsToUI();
  seedReels();
  buildPaytable();
  wireEvents();
  claimDailyBonus(false);

  const hasSpeech = "speechSynthesis" in window;
  if (!hasSpeech) {
    ui.voice.checked = false;
    ui.voice.disabled = true;
    state.voice = false;
    saveState();
  }

  const helpModel = MODEL_PRESETS[state.model].name;
  setHeadline("Ready to spin", `Model: ${helpModel}. Press Space to spend tokens.`);
}

boot();

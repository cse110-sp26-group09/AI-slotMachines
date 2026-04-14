/* Vanilla AI satire slot machine.
 * Platform APIs used: Web Crypto RNG, localStorage, Web Audio, Vibration, Share/Clipboard, <dialog>.
 */

const SYMBOLS = [
  { id: "TOKEN", g: "🪙" },
  { id: "BOT", g: "🤖" },
  { id: "PROMPT", g: "📝" },
  { id: "GPU", g: "🔥" },
  { id: "INVOICE", g: "🧾" },
  { id: "BRAIN", g: "🧠" },
  { id: "DOWN", g: "📉" },
];

const MODELS = [
  "gpt-Overconfident-XL",
  "llm-ProbablyFine-13B",
  "claude-ButMakeItLong",
  "open-source-Wrapper-Pro",
  "deepseek-AccidentallyHonest",
  "prompt-Engineer-Supreme",
];

const KEY = "candidate-012.ai-slots.v1";
const $ = (s) => document.querySelector(s);

const el = {
  balance: $("#balance"),
  bill: $("#bill"),
  bet: $("#bet"),
  model: $("#model"),
  temp: $("#temp"),
  tempLabel: $("#tempLabel"),
  compliance: $("#compliance"),
  r: [$("#r0"), $("#r1"), $("#r2")],
  spin: $("#spin"),
  share: $("#share"),
  reset: $("#reset"),
  betUp: $("#betUp"),
  betDown: $("#betDown"),
  status: $("#status"),
  sub: $("#sub"),
  log: $("#log"),
  sound: $("#sound"),
  haptics: $("#haptics"),
  cooldowns: $("#cooldowns"),
  hackData: $("#hackData"),
  hackWrapper: $("#hackWrapper"),
  hackApology: $("#hackApology"),
  modal: $("#modal"),
  mt: $("#mt"),
  mb: $("#mb"),
};

let spinning = false;
let audio = null;

let state = load();

function load() {
  const d = {
    balance: 200,
    bill: 0,
    bet: 10,
    temp: 55,
    compliance: false,
    sound: true,
    haptics: true,
    log: [],
    cooldowns: { data: 0, wrapper: 0, apology: 0 },
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const p = JSON.parse(raw);
    return {
      ...d,
      ...p,
      log: Array.isArray(p.log) ? p.log.slice(0, 20) : [],
      cooldowns: { ...d.cooldowns, ...(p.cooldowns || {}) },
    };
  } catch {
    return d;
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function fmt(n) {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(n));
  return sign + abs.toLocaleString();
}

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}

function setStatus(a, b = "") {
  el.status.textContent = a;
  el.sub.textContent = b;
}

function reducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ---------- Web Crypto RNG ----------
function u32() {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0] >>> 0;
}
function f01() {
  return u32() / 2 ** 32;
}
function ri(maxExclusive) {
  const max = Math.floor(maxExclusive);
  if (!(max > 0)) return 0;
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  while (true) {
    const x = u32();
    if (x < limit) return x % max;
  }
}

function pickModel() {
  return MODELS[ri(MODELS.length)];
}

function render() {
  el.balance.textContent = fmt(state.balance);
  el.bill.textContent = fmt(state.bill);
  el.bet.textContent = fmt(state.bet);
  el.temp.value = String(state.temp);
  el.tempLabel.textContent = (state.temp / 100).toFixed(2);
  el.compliance.checked = !!state.compliance;
  el.sound.checked = !!state.sound;
  el.haptics.checked = !!state.haptics;

  el.spin.disabled = spinning;
  el.betUp.disabled = spinning;
  el.betDown.disabled = spinning;
  el.share.disabled = spinning;
  el.reset.disabled = spinning;

  renderCooldowns();
  renderLog();
}

function renderLog() {
  el.log.innerHTML = "";
  const items = state.log.slice(0, 10);
  if (items.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No spins yet. The model is “warming up”.";
    el.log.appendChild(li);
    return;
  }
  for (const it of items) {
    const li = document.createElement("li");
    const sign = it.delta >= 0 ? "+" : "";
    li.textContent = `${it.glyphs.join(" ")}  ${sign}${fmt(it.delta)} (${it.note})`;
    el.log.appendChild(li);
  }
}

function renderCooldowns() {
  const t = Date.now();
  const s = (ms) => Math.max(0, Math.ceil(ms / 1000));
  const left = (k) => Math.max(0, (state.cooldowns?.[k] || 0) - t);

  const a = left("data");
  const b = left("wrapper");
  const c = left("apology");

  el.hackData.disabled = spinning || a > 0;
  el.hackWrapper.disabled = spinning || b > 0;
  el.hackApology.disabled = spinning || c > 0;

  const parts = [];
  if (a > 0) parts.push(`data in ${s(a)}s`);
  if (b > 0) parts.push(`wrapper in ${s(b)}s`);
  if (c > 0) parts.push(`apology in ${s(c)}s`);
  el.cooldowns.textContent = parts.length ? `Cooldowns: ${parts.join(" · ")}` : "";
}

// ---------- Audio + haptics ----------
function ensureAudio() {
  if (audio) return audio;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0.12;
  master.connect(ctx.destination);
  audio = { ctx, master };
  return audio;
}

function beep(freq, ms, type = "sine") {
  if (!state.sound) return;
  const a = ensureAudio();
  if (!a) return;
  if (a.ctx.state === "suspended") a.ctx.resume().catch(() => {});

  const o = a.ctx.createOscillator();
  const g = a.ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = 0.0001;
  o.connect(g);
  g.connect(a.master);
  const t0 = a.ctx.currentTime;
  const t1 = t0 + ms / 1000;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.85, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t1);
  o.start(t0);
  o.stop(t1 + 0.02);
}

function buzz(kind) {
  if (state.haptics && navigator.vibrate) {
    if (kind === "jackpot") navigator.vibrate([40, 40, 70, 40, 120]);
    else if (kind === "win") navigator.vibrate([30, 20, 40]);
    else if (kind === "lose") navigator.vibrate([90]);
    else if (kind === "stop") navigator.vibrate([12]);
    else if (kind === "error") navigator.vibrate([30, 40, 30]);
  }

  if (!state.sound) return;
  if (kind === "start") beep(180, 60, "triangle");
  else if (kind === "stop") beep(420, 45, "square");
  else if (kind === "win") {
    beep(520, 90, "sine");
    setTimeout(() => beep(680, 110, "sine"), 90);
  } else if (kind === "lose") beep(140, 140, "sawtooth");
  else if (kind === "jackpot") {
    beep(520, 120, "sine");
    setTimeout(() => beep(780, 120, "sine"), 110);
    setTimeout(() => beep(1040, 160, "triangle"), 220);
  } else if (kind === "meh") beep(240, 70, "triangle");
  else if (kind === "error") beep(110, 160, "sawtooth");
}

// ---------- Modal ----------
function confirmModal(title, body) {
  if (typeof el.modal.showModal !== "function") {
    return Promise.resolve(confirm(`${title}\n\n${body}`));
  }
  return new Promise((resolve) => {
    el.mt.textContent = title;
    el.mb.textContent = body;
    el.modal.showModal();
    el.modal.addEventListener("close", () => resolve(el.modal.returnValue === "ok"), { once: true });
  });
}

function showModal(title, body) {
  if (typeof el.modal.showModal !== "function") {
    alert(`${title}\n\n${body}`);
    return;
  }
  el.mt.textContent = title;
  el.mb.textContent = body;
  el.modal.showModal();
}

// ---------- Gameplay ----------
function spinCost() {
  const t = state.temp / 100;
  const fee = Math.ceil(state.bet * (0.08 + 0.18 * t));
  return state.bet + fee;
}

function canSpin(cost) {
  // allow a bit of “startup debt”
  return state.balance - cost >= -150;
}

function weightedPickIndex() {
  const t = state.temp / 100;
  const weights = [
    ["INVOICE", 1.15 - 0.25 * t],
    ["PROMPT", 1.1 - 0.15 * t],
    ["BOT", 1.0 - 0.1 * t],
    ["BRAIN", 0.95],
    ["TOKEN", 0.75 + 0.7 * t],
    ["GPU", 0.65 + 0.5 * t],
    ["DOWN", 0.55 + 0.6 * t],
  ];
  const idx = (id) => SYMBOLS.findIndex((s) => s.id === id);
  const w = weights.map(([id, ww]) => ({ i: idx(id), w: Math.max(0.05, ww) }));
  const total = w.reduce((a, x) => a + x.w, 0);
  let r = f01() * total;
  for (const x of w) {
    r -= x.w;
    if (r <= 0) return x.i;
  }
  return w[w.length - 1].i;
}

function score(finals) {
  const ids = finals.map((s) => s.id);
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
  const all = counts.size === 1;
  const two = counts.size === 2;

  let mult = 0;
  let note = "The model refuses to elaborate.";
  let kind = "normal";
  let billDelta = 0;

  if (all) {
    const id = ids[0];
    if (id === "TOKEN") {
      mult = 50;
      kind = "jackpot";
      note = "Jackpot: you won tokens. The bill will still find you.";
    } else if (id === "BOT") {
      mult = 18;
      note = "Triple bot: synergy achieved. Also, it’s probably wrong.";
    } else if (id === "GPU") {
      mult = 14;
      note = "Triple GPU: your fans are loud, your runway is short.";
      billDelta += Math.ceil(state.bet * 6);
    } else if (id === "INVOICE") {
      mult = 8;
      note = "Triple invoice: congratulations, you invoiced yourself.";
      billDelta += Math.ceil(state.bet * 10);
    } else if (id === "DOWN") {
      mult = 0;
      note = "Triple downround: the market has spoken.";
      billDelta += Math.ceil(state.bet * 12);
    } else if (id === "PROMPT") {
      mult = 11;
      note = "Triple prompt: prompt engineering is now a religion.";
    } else if (id === "BRAIN") {
      mult = 12;
      note = "Triple brain: you found an actual insight. Refund pending...";
    } else {
      mult = 10;
      note = "A perfectly aligned coincidence.";
    }
  } else if (two) {
    const pair = [...counts.entries()].find(([, c]) => c === 2)?.[0] || ids[0];
    if (pair === "INVOICE") {
      mult = 0.6;
      note = "Two invoices: your winnings were redirected to “fees”.";
      billDelta += Math.ceil(state.bet * 4);
    } else if (pair === "DOWN") {
      mult = 0;
      note = "Two downrounds: your valuation got clipped.";
      billDelta += Math.ceil(state.bet * 3);
    } else if (pair === "TOKEN") {
      mult = 4.2;
      note = "Two tokens: you’re basically profitable (in vibes).";
    } else {
      mult = 2.5;
      note = "Two of a kind: plausible. Not necessarily true.";
    }
  } else {
    const t = state.temp / 100;
    if (t > 0.9 && f01() < 0.06) {
      mult = 3;
      note = "Hallucination bonus: confidently incorrect, accidentally lucrative.";
    } else {
      mult = 0;
      note = "No match: the model is “still learning”.";
    }
  }

  if (state.compliance && mult > 0) {
    mult *= 0.77;
    billDelta += Math.ceil(state.bet * 2);
    note += " (Compliance tax applied.)";
  }

  const payout = Math.max(0, Math.floor(state.bet * mult));
  return { payout, billDelta, note, kind };
}

async function animateSpin(finals) {
  const rm = reducedMotion();
  const base = rm ? 160 : 900;
  const step = rm ? 70 : 95;
  const stops = [base, base + 240, base + 520];

  const intervals = [];
  const timers = [];

  for (let i = 0; i < 3; i++) {
    intervals[i] = setInterval(() => {
      const idx = weightedPickIndex();
      el.r[i].textContent = SYMBOLS[idx].g;
      el.r[i].style.transform = `translateY(${ri(10) - 5}px)`;
      el.r[i].style.filter = "blur(0.6px) drop-shadow(0 14px 18px rgba(0,0,0,0.45))";
    }, step);

    timers[i] = setTimeout(() => {
      clearInterval(intervals[i]);
      el.r[i].textContent = finals[i].g;
      el.r[i].style.transform = "translateY(0)";
      el.r[i].style.filter = "drop-shadow(0 14px 18px rgba(0,0,0,0.45))";
      buzz("stop");
    }, stops[i]);
  }

  await new Promise((r) => setTimeout(r, stops[2] + 60));
}

function flash() {
  for (const x of el.r) {
    x.animate(
      [
        { transform: "translateY(0) scale(1)" },
        { transform: "translateY(-3px) scale(1.05)" },
        { transform: "translateY(0) scale(1)" },
      ],
      { duration: 820, iterations: 2, easing: "cubic-bezier(.2,.9,.2,1)" }
    );
  }
}

async function spin() {
  if (spinning) return;
  const cost = spinCost();
  if (!canSpin(cost)) {
    setStatus("Rate limit exceeded: insufficient tokens.", "Use Token Hacks on the right.");
    buzz("error");
    return;
  }

  spinning = true;
  state.balance -= cost;
  state.bill += Math.ceil(cost * 0.35);
  el.model.textContent = pickModel();
  save();
  render();

  setStatus(`Spinning... (charged ${fmt(cost)} tokens)`, "This spin is not tax deductible.");
  buzz("start");

  const finals = [weightedPickIndex(), weightedPickIndex(), weightedPickIndex()].map((i) => SYMBOLS[i]);
  await animateSpin(finals);

  const out = score(finals);
  state.balance += out.payout;
  state.bill += out.billDelta;

  const net = out.payout - cost;
  state.log.unshift({
    t: Date.now(),
    glyphs: finals.map((s) => s.g),
    delta: net,
    note: out.note,
  });
  state.log = state.log.slice(0, 20);
  save();

  const sign = net >= 0 ? "+" : "";
  setStatus(`Result: ${finals.map((s) => s.g).join(" ")}  (${sign}${fmt(net)} net)`, out.note);
  if (out.kind === "jackpot") {
    buzz("jackpot");
    flash();
  } else if (net > 0) buzz("win");
  else if (net < 0) buzz("lose");
  else buzz("meh");

  spinning = false;
  render();
}

function adjustBet(d) {
  if (spinning) return;
  state.bet = clamp(state.bet + d, 1, 100);
  save();
  render();
}

function hack(kind) {
  if (spinning) return;
  const t = Date.now();
  const until = state.cooldowns?.[kind] || 0;
  if (until > t) return;

  let delta = 0;
  let note = "";
  let cd = 0;
  if (kind === "data") {
    delta = 50;
    cd = 45_000;
    note = "Sold data. It was ‘anonymized’ by deleting the word anonymized.";
  } else if (kind === "wrapper") {
    delta = 20;
    cd = 22_000;
    note = "Shipped wrapper. It calls the same API, but with confidence.";
  } else if (kind === "apology") {
    delta = 10;
    cd = 12_000;
    note = "Generated apology. Added ‘deeply’ to sound sincere.";
  } else return;

  state.balance += delta;
  state.bill += Math.ceil(delta * 0.2);
  state.cooldowns[kind] = t + cd;
  state.log.unshift({ t, glyphs: ["🪙", "🪙", "🪙"], delta: delta, note });
  state.log = state.log.slice(0, 20);
  save();
  render();
  setStatus(`+${fmt(delta)} tokens`, note);
  buzz("win");
}

async function share() {
  const last = state.log[0];
  const text = last
    ? `AI Token Slot Machine\nResult: ${last.glyphs.join(" ")}\nNet: ${last.delta >= 0 ? "+" : ""}${fmt(
        last.delta
      )} tokens\n\nTemperature: ${(state.temp / 100).toFixed(2)}\nCompliance: ${state.compliance ? "ON" : "OFF"}`
    : "AI Token Slot Machine\nNo spins yet. I am ‘still training’ (on your patience).";

  try {
    if (navigator.share) {
      await navigator.share({ title: "AI Token Slot Machine", text });
      setStatus("Shared.", "Your friends will now also lose tokens.");
      return;
    }
  } catch {
    // fall back
  }

  try {
    await navigator.clipboard.writeText(text);
    setStatus("Copied to clipboard.", "Paste it into a VC pitch deck.");
  } catch {
    showModal("Share", text);
  }
}

function init() {
  const seed = new Date().getHours() % SYMBOLS.length;
  for (let i = 0; i < 3; i++) el.r[i].textContent = SYMBOLS[(seed + i) % SYMBOLS.length].g;

  el.model.textContent = pickModel();

  el.temp.addEventListener("input", () => {
    state.temp = clamp(Number(el.temp.value) || 0, 0, 100);
    el.tempLabel.textContent = (state.temp / 100).toFixed(2);
    save();
  });
  el.compliance.addEventListener("change", () => {
    state.compliance = !!el.compliance.checked;
    save();
    setStatus(
      state.compliance ? "Compliance enabled: winnings will be “safely” reduced." : "Compliance disabled: raw vibes, raw losses.",
      state.compliance ? "You are now protected from fun." : "You are now protected from accuracy."
    );
  });
  el.sound.addEventListener("change", () => {
    state.sound = !!el.sound.checked;
    save();
  });
  el.haptics.addEventListener("change", () => {
    state.haptics = !!el.haptics.checked;
    save();
  });

  el.betUp.addEventListener("click", () => adjustBet(+5));
  el.betDown.addEventListener("click", () => adjustBet(-5));
  el.spin.addEventListener("click", spin);
  el.share.addEventListener("click", share);

  el.hackData.addEventListener("click", () => hack("data"));
  el.hackWrapper.addEventListener("click", () => hack("wrapper"));
  el.hackApology.addEventListener("click", () => hack("apology"));

  el.reset.addEventListener("click", async () => {
    const ok = await confirmModal(
      "Reset",
      "This wipes your balance, bill, settings, and spin log. Like a pivot, but with fewer press releases."
    );
    if (!ok) return;
    try {
      localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
    state = load();
    el.model.textContent = pickModel();
    setStatus("Reset complete.", "You are now pre-seed again.");
    render();
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      spin();
    }
    if (e.key === "+" || e.key === "=") adjustBet(+5);
    if (e.key === "-" || e.key === "_") adjustBet(-5);
  });

  setInterval(() => {
    if (document.hidden) return;
    renderCooldowns();
  }, 250);

  render();
}

init();


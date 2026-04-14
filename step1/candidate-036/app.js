/* AI Token Slot Machine
 * Vanilla browser app with a few platform APIs (Crypto RNG, Storage, Audio, Vibration, Share/Clipboard, SW).
 */

const SYMBOLS = [
  { id: "TOKEN", glyph: "🪙", name: "Token" },
  { id: "BOT", glyph: "🤖", name: "Bot" },
  { id: "BRAIN", glyph: "🧠", name: "Brain" },
  { id: "PROMPT", glyph: "📝", name: "Prompt" },
  { id: "FIRE", glyph: "🔥", name: "GPU" },
  { id: "INVOICE", glyph: "🧾", name: "Invoice" },
  { id: "DOWN", glyph: "📉", name: "Downround" },
];

const MODEL_LINES = [
  "gpt-Overconfident-XL",
  "claude-ButMakeItLong",
  "llama-ProbablyFine-13B",
  "deepseek-AccidentallyHonest",
  "open-source-Wrapper-Pro",
  "prompt-Engineer-Supreme",
];

const STORAGE_KEY = "aiSlotMachine.v1";

const $ = (sel) => document.querySelector(sel);

const els = {
  balance: $("#balance"),
  bill: $("#bill"),
  bet: $("#bet"),
  statusLine: $("#statusLine"),
  subLine: $("#subLine"),
  modelLine: $("#modelLine"),
  temp: $("#temp"),
  tempLabel: $("#tempLabel"),
  compliance: $("#compliance"),
  sound: $("#sound"),
  haptics: $("#haptics"),
  reels: [$("#r0"), $("#r1"), $("#r2")],
  spin: $("#spin"),
  cashout: $("#cashout"),
  share: $("#share"),
  betUp: $("#betUp"),
  betDown: $("#betDown"),
  sellData: $("#sellData"),
  shipWrapper: $("#shipWrapper"),
  apologize: $("#apologize"),
  cooldowns: $("#cooldowns"),
  log: $("#log"),
  reset: $("#reset"),
  modal: $("#modal"),
  modalTitle: $("#modalTitle"),
  modalBody: $("#modalBody"),
};

/** @type {{balance:number, bill:number, bet:number, temp:number, compliance:boolean, sound:boolean, haptics:boolean, log:Array<any>, cooldowns:Record<string,number>}} */
let state = loadState();

let isSpinning = false;
let audio = /** @type {null | {ctx: AudioContext, master: GainNode}} */ (null);

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}

function now() {
  return Date.now();
}

function formatInt(n) {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(n));
  return sign + abs.toLocaleString(undefined);
}

function setStatus(line, sub = "") {
  els.statusLine.textContent = line;
  els.subLine.textContent = sub;
}

function reducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function loadState() {
  const defaults = {
    balance: 200,
    bill: 0,
    bet: 10,
    temp: 55,
    compliance: false,
    sound: true,
    haptics: true,
    log: [],
    cooldowns: {
      sellData: 0,
      shipWrapper: 0,
      apologize: 0,
    },
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      ...defaults,
      ...parsed,
      cooldowns: { ...defaults.cooldowns, ...(parsed.cooldowns || {}) },
      log: Array.isArray(parsed.log) ? parsed.log.slice(0, 20) : [],
    };
  } catch {
    return defaults;
  }
}

function render() {
  els.balance.textContent = formatInt(state.balance);
  els.bill.textContent = formatInt(state.bill);
  els.bet.textContent = formatInt(state.bet);
  els.temp.value = String(state.temp);
  els.tempLabel.textContent = (state.temp / 100).toFixed(2);
  els.compliance.checked = !!state.compliance;
  els.sound.checked = !!state.sound;
  els.haptics.checked = !!state.haptics;

  els.betDown.disabled = isSpinning;
  els.betUp.disabled = isSpinning;
  els.spin.disabled = isSpinning;
  els.cashout.disabled = isSpinning;
  els.share.disabled = isSpinning;

  renderCooldowns();
  renderLog();
}

function renderLog() {
  els.log.innerHTML = "";
  const items = state.log.slice(0, 10);
  if (items.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No spins yet. The model is still “warming up”.";
    els.log.appendChild(li);
    return;
  }
  for (const it of items) {
    const li = document.createElement("li");
    const g = it.glyphs.join(" ");
    const delta = it.delta;
    const sign = delta >= 0 ? "+" : "";
    li.textContent = `${g}  ${sign}${formatInt(delta)} tokens (${it.note})`;
    els.log.appendChild(li);
  }
}

function renderCooldowns() {
  const lines = [];
  const cd = state.cooldowns || {};
  const m = (ms) => Math.max(0, Math.ceil(ms / 1000));
  const left = (key) => (cd[key] ? cd[key] - now() : 0);

  const s0 = left("sellData");
  const s1 = left("shipWrapper");
  const s2 = left("apologize");

  els.sellData.disabled = isSpinning || s0 > 0;
  els.shipWrapper.disabled = isSpinning || s1 > 0;
  els.apologize.disabled = isSpinning || s2 > 0;

  if (s0 > 0) lines.push(`Sell data in ${m(s0)}s`);
  if (s1 > 0) lines.push(`Wrapper in ${m(s1)}s`);
  if (s2 > 0) lines.push(`Apology in ${m(s2)}s`);

  els.cooldowns.textContent = lines.length ? `Cooldowns: ${lines.join(" · ")}` : "";
}

function pickModelLine() {
  const i = randInt(MODEL_LINES.length);
  return MODEL_LINES[i];
}

function init() {
  // Seed reels with something deterministic-ish so first paint looks intentional.
  const seed = (new Date()).getHours() % SYMBOLS.length;
  for (let i = 0; i < 3; i++) els.reels[i].textContent = SYMBOLS[(seed + i) % SYMBOLS.length].glyph;

  els.modelLine.textContent = pickModelLine();
  render();
  setStatus("Insert ego. Press Spin.", "Tip: higher temperature = higher chaos.");

  // Periodic cooldown updates without re-rendering everything.
  setInterval(() => {
    if (document.hidden) return;
    renderCooldowns();
  }, 250);

  wireEvents();
  maybeRegisterServiceWorker();
}

function wireEvents() {
  els.temp.addEventListener("input", () => {
    state.temp = clamp(Number(els.temp.value) || 0, 0, 100);
    els.tempLabel.textContent = (state.temp / 100).toFixed(2);
    saveState();
  });

  els.compliance.addEventListener("change", () => {
    state.compliance = !!els.compliance.checked;
    saveState();
    setStatus(
      state.compliance ? "Compliance enabled: winnings will be “safely” reduced." : "Compliance disabled: raw vibes, raw losses.",
      state.compliance ? "You are now protected from fun." : "You are now protected from accuracy."
    );
    render();
  });

  els.sound.addEventListener("change", () => {
    state.sound = !!els.sound.checked;
    saveState();
  });

  els.haptics.addEventListener("change", () => {
    state.haptics = !!els.haptics.checked;
    saveState();
  });

  els.betUp.addEventListener("click", () => adjustBet(+5));
  els.betDown.addEventListener("click", () => adjustBet(-5));
  els.spin.addEventListener("click", spin);
  els.cashout.addEventListener("click", cashOut);
  els.share.addEventListener("click", shareLast);

  els.sellData.addEventListener("click", () => hack("sellData"));
  els.shipWrapper.addEventListener("click", () => hack("shipWrapper"));
  els.apologize.addEventListener("click", () => hack("apologize"));

  els.reset.addEventListener("click", () => {
    confirmModal(
      "Factory Reset",
      "This will wipe your balance, bill, settings, and spin log. Like a startup pivot, but for your dignity."
    ).then((ok) => {
      if (!ok) return;
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      state = loadState();
      els.modelLine.textContent = pickModelLine();
      setStatus("Factory reset complete.", "You are now pre-seed again.");
      render();
    });
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      // Avoid scrolling.
      e.preventDefault();
      spin();
    }
    if (e.key === "+" || e.key === "=") adjustBet(+5);
    if (e.key === "-" || e.key === "_") adjustBet(-5);
  });
}

function adjustBet(delta) {
  if (isSpinning) return;
  const next = clamp(state.bet + delta, 1, 100);
  state.bet = next;
  saveState();
  render();
}

function canAffordSpin() {
  // Allow a little debt to keep the satire going.
  return state.balance - state.bet >= -150;
}

function computeSpinCost() {
  // Always costs the bet. Additionally: "tokenization fee" proportional to temperature.
  const temp = state.temp / 100;
  const fee = Math.ceil(state.bet * (0.08 + 0.18 * temp));
  return state.bet + fee;
}

function weightedSymbolIndex() {
  // Temperature controls skew:
  // low temp = more "predictable" symbols (Invoices, Prompts, Bots),
  // high temp = more chaos (Tokens, Fire, Downround).
  const t = state.temp / 100;
  /** @type {Array<{idx:number,w:number}>} */
  const weights = [
    { idx: symIndex("INVOICE"), w: 1.15 - 0.25 * t },
    { idx: symIndex("PROMPT"), w: 1.1 - 0.15 * t },
    { idx: symIndex("BOT"), w: 1.0 - 0.1 * t },
    { idx: symIndex("BRAIN"), w: 0.95 },
    { idx: symIndex("TOKEN"), w: 0.75 + 0.7 * t },
    { idx: symIndex("FIRE"), w: 0.65 + 0.5 * t },
    { idx: symIndex("DOWN"), w: 0.55 + 0.6 * t },
  ];
  const total = weights.reduce((a, x) => a + Math.max(0.05, x.w), 0);
  let r = randFloat() * total;
  for (const x of weights) {
    r -= Math.max(0.05, x.w);
    if (r <= 0) return x.idx;
  }
  return weights[weights.length - 1].idx;
}

function symIndex(id) {
  const i = SYMBOLS.findIndex((s) => s.id === id);
  return i >= 0 ? i : 0;
}

function spin() {
  if (isSpinning) return;

  const cost = computeSpinCost();
  if (!canAffordSpin()) {
    setStatus("Rate limit exceeded: insufficient tokens.", "Try Token Hacks on the right.");
    buzz("error");
    return;
  }

  isSpinning = true;
  state.balance -= cost;
  state.bill += Math.ceil(cost * 0.35); // your “usage” mysteriously costs extra later
  els.modelLine.textContent = pickModelLine();
  saveState();
  render();

  setStatus(`Spinning... (charged ${formatInt(cost)} tokens)`, "This spin is not tax deductible.");
  buzz("start");

  const finalIdx = [weightedSymbolIndex(), weightedSymbolIndex(), weightedSymbolIndex()];
  const finals = finalIdx.map((i) => SYMBOLS[i]);

  animateSpin(finals)
    .then(() => {
      const outcome = score(finals, state.bet, state.compliance);
      state.balance += outcome.payout;
      state.bill += outcome.billDelta;
      state.log.unshift({
        t: now(),
        glyphs: finals.map((s) => s.glyph),
        delta: outcome.payout - cost,
        note: outcome.note,
      });
      state.log = state.log.slice(0, 20);
      saveState();

      const net = outcome.payout - cost;
      const sign = net >= 0 ? "+" : "";
      setStatus(
        `Result: ${finals.map((s) => s.glyph).join(" ")}  (${sign}${formatInt(net)} net)`,
        outcome.note
      );

      if (outcome.kind === "jackpot") {
        buzz("jackpot");
        flashReels();
      } else if (net > 0) {
        buzz("win");
      } else if (net < 0) {
        buzz("lose");
      } else {
        buzz("meh");
      }

      render();
    })
    .finally(() => {
      isSpinning = false;
      render();
    });
}

function score(finals, bet, compliance) {
  const ids = finals.map((s) => s.id);
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);

  const allSame = counts.size === 1;
  const twoSame = counts.size === 2;

  // Base payout in tokens (not net).
  let mult = 0;
  let note = "The model refuses to elaborate.";
  let kind = "normal";
  let billDelta = 0;

  if (allSame) {
    const id = ids[0];
    if (id === "TOKEN") {
      mult = 50;
      kind = "jackpot";
      note = "Jackpot: you won tokens. The bill will still find you.";
    } else if (id === "BOT") {
      mult = 18;
      note = "Triple bot: synergy achieved. Also, it’s probably wrong.";
    } else if (id === "FIRE") {
      mult = 14;
      note = "Triple GPU: your fans are loud, your runway is short.";
      billDelta += Math.ceil(bet * 6);
    } else if (id === "INVOICE") {
      mult = 8;
      note = "Triple invoice: congratulations, you invoiced yourself.";
      billDelta += Math.ceil(bet * 10);
    } else if (id === "DOWN") {
      mult = 0;
      note = "Triple downround: the market has spoken.";
      billDelta += Math.ceil(bet * 12);
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
  } else if (twoSame) {
    // Two-of-a-kind: smaller payout, except invoices.
    const pairId = [...counts.entries()].find(([, c]) => c === 2)?.[0] || ids[0];
    if (pairId === "INVOICE") {
      mult = 0.6;
      note = "Two invoices: your winnings were redirected to “fees”.";
      billDelta += Math.ceil(bet * 4);
    } else if (pairId === "DOWN") {
      mult = 0;
      note = "Two downrounds: your valuation got clipped.";
      billDelta += Math.ceil(bet * 3);
    } else if (pairId === "TOKEN") {
      mult = 4.2;
      note = "Two tokens: you’re basically profitable (in vibes).";
    } else {
      mult = 2.5;
      note = "Two of a kind: plausible. Not necessarily true.";
    }
  } else {
    // No match: maybe “hallucination bonus” at high temperature (tiny chance).
    const t = state.temp / 100;
    if (t > 0.9 && randFloat() < 0.06) {
      mult = 3;
      note = "Hallucination bonus: confidently incorrect, accidentally lucrative.";
    } else {
      mult = 0;
      note = "No match: the model is “still learning”.";
    }
  }

  // Compliance tax: reduce payouts and increase bill, because of course.
  if (compliance && mult > 0) {
    mult *= 0.77;
    billDelta += Math.ceil(bet * 2);
    note += " (Compliance tax applied.)";
  }

  // Always round down, because casinos.
  const payout = Math.max(0, Math.floor(bet * mult));
  return { payout, billDelta, note, kind };
}

async function animateSpin(finals) {
  const rm = reducedMotion();
  const base = rm ? 160 : 900;
  const step = rm ? 70 : 95;
  const stops = [base, base + 240, base + 520];

  const timers = [];
  const intervals = [];

  for (let i = 0; i < 3; i++) {
    intervals[i] = setInterval(() => {
      const idx = weightedSymbolIndex();
      els.reels[i].textContent = SYMBOLS[idx].glyph;
      els.reels[i].style.transform = `translateY(${randInt(10) - 5}px)`;
      els.reels[i].style.filter = "blur(0.6px) drop-shadow(0 14px 18px rgba(0,0,0,0.45))";
    }, step);

    timers[i] = setTimeout(() => {
      clearInterval(intervals[i]);
      els.reels[i].textContent = finals[i].glyph;
      els.reels[i].style.transform = "translateY(0)";
      els.reels[i].style.filter = "drop-shadow(0 14px 18px rgba(0,0,0,0.45))";
      buzz("stop");
    }, stops[i]);
  }

  await new Promise((resolve) => setTimeout(resolve, stops[2] + 60));
}

function flashReels() {
  for (const el of els.reels) {
    el.animate(
      [
        { transform: "translateY(0) scale(1)", filter: "drop-shadow(0 14px 18px rgba(0,0,0,0.45))" },
        { transform: "translateY(-3px) scale(1.05)", filter: "drop-shadow(0 20px 26px rgba(41,240,179,0.55))" },
        { transform: "translateY(0) scale(1)", filter: "drop-shadow(0 14px 18px rgba(0,0,0,0.45))" },
      ],
      { duration: 820, iterations: 2, easing: "cubic-bezier(.2,.9,.2,1)" }
    );
  }
}

function cashOut() {
  if (isSpinning) return;
  const youHave = state.balance;
  const bill = state.bill;
  const net = youHave - bill;
  const mood =
    net >= 0
      ? "Congratulations, you beat the invoice (for now)."
      : "You cashed out negative. That’s called ‘enterprise pricing’ now.";

  confirmModal(
    "Cash Out",
    `Balance: ${formatInt(youHave)} tokens\nAPI bill: ${formatInt(bill)} tokens\n\nNet: ${formatInt(net)} tokens\n\n${mood}`
  ).then((ok) => {
    if (!ok) {
      setStatus("Cash out cancelled.", "Keeping your bill warm for later.");
      buzz("meh");
      return;
    }
      // “Settle up” by converting bill into balance loss (can go negative).
      state.balance = state.balance - state.bill;
      state.bill = 0;
      saveState();
      render();

      setStatus(
        "Cashed out.",
        net >= 0 ? "The house is updating its terms of service." : "We’ll email you a PDF invoice."
      );
      buzz(net >= 0 ? "win" : "lose");
  });
}

async function shareLast() {
  const last = state.log[0];
  const payload = last
    ? `AI Token Slot Machine\nResult: ${last.glyphs.join(" ")}\nNet: ${last.delta >= 0 ? "+" : ""}${formatInt(last.delta)} tokens\n\nTemperature: ${(state.temp / 100).toFixed(2)}\nCompliance tax: ${state.compliance ? "ON" : "OFF"}`
    : "AI Token Slot Machine\nNo spins yet. I am ‘still training’ (on your patience).";

  try {
    if (navigator.share) {
      await navigator.share({ title: "AI Token Slot Machine", text: payload });
      setStatus("Shared.", "Your friends will now also lose tokens.");
      return;
    }
  } catch {
    // fall through to clipboard
  }

  try {
    await navigator.clipboard.writeText(payload);
    setStatus("Copied to clipboard.", "Paste it into a VC pitch deck.");
  } catch {
    showModal("Share", payload);
  }
}

function hack(kind) {
  if (isSpinning) return;
  const cd = state.cooldowns || {};
  const until = cd[kind] || 0;
  if (until > now()) {
    buzz("error");
    return;
  }

  let delta = 0;
  let note = "";
  let cooldownMs = 0;
  if (kind === "sellData") {
    delta = 50;
    cooldownMs = 45_000;
    note = "Sold data. It was ‘anonymized’ by deleting the word anonymized.";
  } else if (kind === "shipWrapper") {
    delta = 20;
    cooldownMs = 22_000;
    note = "Shipped wrapper. It calls the same API, but with confidence.";
  } else if (kind === "apologize") {
    delta = 10;
    cooldownMs = 12_000;
    note = "Generated apology. Added ‘deeply’ to sound sincere.";
  } else {
    return;
  }

  state.balance += delta;
  state.bill += Math.ceil(delta * 0.2);
  state.cooldowns[kind] = now() + cooldownMs;
  state.log.unshift({
    t: now(),
    glyphs: ["🪙", "🪙", "🪙"],
    delta,
    note: note,
  });
  state.log = state.log.slice(0, 20);
  saveState();
  render();

  setStatus(`+${formatInt(delta)} tokens`, note);
  buzz("win");
}

function showModal(title, body) {
  els.modalTitle.textContent = title;
  els.modalBody.textContent = body;
  if (typeof els.modal.showModal === "function") {
    els.modal.showModal();
  } else {
    alert(`${title}\n\n${body}`);
  }
}

function confirmModal(title, body) {
  if (typeof els.modal.showModal !== "function") {
    return Promise.resolve(confirm(`${title}\n\n${body}`));
  }

  return new Promise((resolve) => {
    els.modalTitle.textContent = title;
    els.modalBody.textContent = body;
    els.modal.showModal();
    els.modal.addEventListener("close", () => resolve(els.modal.returnValue === "ok"), { once: true });
  });
}

// ---------- RNG (Web Crypto) ----------

function randU32() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] >>> 0;
}

function randFloat() {
  // [0,1)
  return randU32() / 2 ** 32;
}

function randInt(maxExclusive) {
  const max = Math.floor(maxExclusive);
  if (!(max > 0)) return 0;

  // Rejection sampling to avoid modulo bias.
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  while (true) {
    const x = randU32();
    if (x < limit) return x % max;
  }
}

// ---------- Audio + Haptics ----------

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

  // Some browsers require user gesture before audio; resume if possible.
  if (a.ctx.state === "suspended") a.ctx.resume().catch(() => {});

  const osc = a.ctx.createOscillator();
  const gain = a.ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = 0.0001;
  osc.connect(gain);
  gain.connect(a.master);

  const t0 = a.ctx.currentTime;
  const t1 = t0 + ms / 1000;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.9, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t1);
  osc.start(t0);
  osc.stop(t1 + 0.02);
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

// ---------- Service worker ----------

function maybeRegisterServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  // Only register on http(s). (file:// can be flaky across browsers.)
  if (!(location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) return;

  navigator.serviceWorker.register("./sw.js").catch(() => {
    // ignore
  });
}

init();
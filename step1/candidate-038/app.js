(() => {
  "use strict";

  const STORAGE_KEY = "prompt-payout:v1";

  const ICON = {
    token: "\u{1FA99}",
    prompt: "\u{1F4AC}",
    tools: "\u{1F6E0}\uFE0F",
    cache: "\u{1F5C4}\uFE0F",
    latency: "\u23F1\uFE0F",
    rate: "\u{1F6AB}",
    hallucination: "\u{1F916}",
    gpu: "\u{1F525}",
    alignment: "\u{1F9FC}",
    open: "\u{1F4E6}",
    invoice: "\u{1F9FE}",
    unicorn: "\u{1F984}",
  };

  const SYMBOLS = [
    { icon: ICON.token, name: "Tokens", kind: "good", w: 14 },
    { icon: ICON.cache, name: "Cache Hit", kind: "good", w: 11 },
    { icon: ICON.tools, name: "Tool Call", kind: "good", w: 10 },
    { icon: ICON.open, name: "Open Source", kind: "good", w: 9 },
    { icon: ICON.unicorn, name: "Unicorn Feature", kind: "good", w: 4 },
    { icon: ICON.prompt, name: "Prompt", kind: "neutral", w: 12 },
    { icon: ICON.latency, name: "Latency", kind: "neutral", w: 10 },
    { icon: ICON.alignment, name: "Alignment", kind: "neutral", w: 9 },
    { icon: ICON.invoice, name: "Invoice", kind: "neutral", w: 8 },
    { icon: ICON.rate, name: "Rate Limit", kind: "bad", w: 7 },
    { icon: ICON.gpu, name: "GPU Toast", kind: "bad", w: 6 },
    { icon: ICON.hallucination, name: "Hallucination", kind: "bad", w: 6 },
  ];

  const PAYTABLE = [
    {
      label: "4x Cache Hit",
      combo: [ICON.cache, ICON.cache, ICON.cache, ICON.cache],
      delta: (cost) => cost * 12 + 30,
      flavor: "A rare moment of competence: the answer was already computed.",
      fx: "win",
    },
    {
      label: "4x Tokens",
      combo: [ICON.token, ICON.token, ICON.token, ICON.token],
      delta: (cost) => cost * 9 + 22,
      flavor: "Congratulations, you invented a token economy. Again.",
      fx: "win",
    },
    {
      label: "4x Tool Call",
      combo: [ICON.tools, ICON.tools, ICON.tools, ICON.tools],
      delta: (cost) => cost * 7 + 18,
      flavor: "The model actually used tools. The timeline is not ready.",
      fx: "win",
    },
    {
      label: "4x Unicorn Feature",
      combo: [ICON.unicorn, ICON.unicorn, ICON.unicorn, ICON.unicorn],
      delta: (cost) => cost * 15 + 40,
      flavor: "You shipped a miracle. It immediately violates policy.",
      fx: "win",
    },
    {
      label: "4x Rate Limit",
      combo: [ICON.rate, ICON.rate, ICON.rate, ICON.rate],
      delta: (cost) => -(cost * 4 + 14),
      flavor: "429. Try again later. Or never. Mostly later.",
      fx: "loss",
      negative: true,
    },
    {
      label: "4x Hallucination",
      combo: [ICON.hallucination, ICON.hallucination, ICON.hallucination, ICON.hallucination],
      delta: (cost) => -(cost * 5 + 18),
      flavor: "Confidently incorrect. You pay for the confidence.",
      fx: "loss",
      negative: true,
    },
    {
      label: "4x GPU Toast",
      combo: [ICON.gpu, ICON.gpu, ICON.gpu, ICON.gpu],
      delta: (cost) => -(cost * 3 + 12),
      flavor: "You smelled toast. The cloud bill agreed.",
      fx: "loss",
      negative: true,
    },
  ];

  const $ = (sel) => document.querySelector(sel);
  const reelEls = [$("#r0"), $("#r1"), $("#r2"), $("#r3")];
  const reelBoxes = [...document.querySelectorAll(".reel")];

  const tokensOut = $("#tokens");
  const spinCostOut = $("#spinCost");
  const cacheOut = $("#cache");
  const spinsOut = $("#spins");
  const wonOut = $("#won");
  const spentOut = $("#spent");
  const statusEl = $("#status");
  const logEl = $("#log");

  const tierSel = $("#tier");
  const autoToggle = $("#auto");
  const spinBtn = $("#spinBtn");
  const maxBtn = $("#maxBtn");
  const boostBtn = $("#boostBtn");
  const bragBtn = $("#bragBtn");
  const notifyBtn = $("#notifyBtn");
  const resetBtn = $("#resetBtn");
  const installBtn = $("#installBtn");

  const soundToggle = $("#sound");
  const hapticsToggle = $("#haptics");
  const reduceMotionToggle = $("#reduceMotion");
  const wakeToggle = $("#wake");

  const fxCanvas = $("#fx");
  const fxCtx = fxCanvas.getContext("2d", { alpha: true });

  let spinning = false;
  let autoTimer = 0;
  let audioCtx = null;
  let wakeLock = null;
  let deferredInstallPrompt = null;
  let sparks = [];
  let sparksRaf = 0;

  const state = {
    tokens: 45,
    spins: 0,
    won: 0,
    spent: 0,
    tier: "turbo",
    sound: true,
    haptics: true,
    reduceMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false,
    notify: false,
    cacheSpins: 0,
    boostSpins: 0,
    last: ["?", "?", "?", "?"],
  };

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const nowMs = () => Date.now();
  const sleep = (ms) => new Promise((r) => window.setTimeout(r, ms));

  function randU32() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0];
  }

  function rand01() {
    return randU32() / 2 ** 32;
  }

  function weightedPick(list) {
    const total = list.reduce((a, x) => a + x.w, 0);
    let r = rand01() * total;
    for (const item of list) {
      r -= item.w;
      if (r <= 0) return item;
    }
    return list[list.length - 1];
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function setStatus(msg) {
    statusEl.textContent = msg;
  }

  function log(msg, level = "info") {
    const div = document.createElement("div");
    div.className = `entry ${level}`;
    const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    div.innerHTML = `<strong>${ts}</strong> ${escapeHtml(msg)}`;
    logEl.prepend(div);
    while (logEl.children.length > 60) logEl.removeChild(logEl.lastChild);
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state }));
    } catch {
      // ignore
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      Object.assign(state, parsed);
    } catch {
      // ignore
    }
  }

  function ensureAudio() {
    if (!state.sound) return null;
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function tone(freq, dur, type, gain) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = 0;
    o.connect(g);
    g.connect(ctx.destination);
    const t0 = ctx.currentTime;
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function beep(kind) {
    if (!state.sound) return;
    if (kind === "spin") {
      tone(220, 0.08, "square", 0.035);
      tone(330, 0.08, "square", 0.03);
    } else if (kind === "win") {
      tone(440, 0.10, "sine", 0.06);
      tone(660, 0.12, "sine", 0.055);
      tone(880, 0.14, "sine", 0.05);
    } else if (kind === "loss") {
      tone(220, 0.14, "sawtooth", 0.05);
      tone(165, 0.16, "sawtooth", 0.045);
    } else {
      tone(350, 0.06, "triangle", 0.035);
    }
  }

  function haptic(pattern) {
    if (!state.haptics) return;
    navigator.vibrate?.(pattern);
  }

  function resizeFx() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    fxCanvas.width = Math.floor(window.innerWidth * dpr);
    fxCanvas.height = Math.floor(window.innerHeight * dpr);
    fxCanvas.style.width = "100%";
    fxCanvas.style.height = "100%";
    fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function burst(kind) {
    const n = kind === "win" ? 120 : 60;
    const colors =
      kind === "win"
        ? ["#38e2a7", "#ff4fd8", "rgba(255,255,255,0.85)"]
        : ["#ff4d6d", "rgba(255,255,255,0.35)", "rgba(0,0,0,0.25)"];

    for (let i = 0; i < n; i += 1) {
      sparks.push({
        x: window.innerWidth * (0.35 + rand01() * 0.3),
        y: window.innerHeight * (0.18 + rand01() * 0.2),
        vx: (rand01() - 0.5) * (kind === "win" ? 7 : 5),
        vy: (rand01() - 0.7) * (kind === "win" ? 9 : 6),
        r: 1.5 + rand01() * 3.0,
        rot: rand01() * Math.PI * 2,
        vr: (rand01() - 0.5) * 0.25,
        g: kind === "win" ? 0.16 : 0.22,
        life: 70 + Math.floor(rand01() * 40),
        color: colors[Math.floor(rand01() * colors.length)],
      });
    }

    if (!sparksRaf) sparksRaf = requestAnimationFrame(tickFx);
  }

  function tickFx() {
    fxCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of sparks) {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= 1;
      fxCtx.save();
      fxCtx.translate(p.x, p.y);
      fxCtx.rotate(p.rot);
      fxCtx.fillStyle = p.color;
      fxCtx.fillRect(-p.r, -p.r, p.r * 2.3, p.r * 1.2);
      fxCtx.restore();
    }
    sparks = sparks.filter((p) => p.life > 0 && p.y < window.innerHeight + 40);
    if (sparks.length) sparksRaf = requestAnimationFrame(tickFx);
    else sparksRaf = 0;
  }

  function tierConfig(tier) {
    if (tier === "budget") return { baseCost: 2, maxMul: 4, delay: 520, brag: "cheap & dramatic" };
    if (tier === "frontier") return { baseCost: 6, maxMul: 3, delay: 740, brag: "expensive & confident" };
    return { baseCost: 4, maxMul: 4, delay: 620, brag: "fast-ish" };
  }

  function spinCost({ maxMode }) {
    const t = tierConfig(state.tier);
    const cacheDiscount = state.cacheSpins > 0 ? 2 : 0;
    const boostPenalty = state.boostSpins > 0 ? 1 : 0;
    const base = clamp(t.baseCost + boostPenalty - cacheDiscount, 1, 99);
    return maxMode ? base * t.maxMul : base;
  }

  function pickSymbol() {
    if (state.boostSpins <= 0) return weightedPick(SYMBOLS);
    const boosted = SYMBOLS.map((s) => {
      const mult = s.kind === "good" ? 1.35 : s.kind === "bad" ? 0.82 : 1.05;
      return { ...s, w: s.w * mult };
    });
    return weightedPick(boosted);
  }

  function payout(result, cost) {
    const row = PAYTABLE.find((r) => r.combo.every((x, i) => x === result[i]));
    if (row) return { delta: row.delta(cost), row };

    const counts = new Map();
    for (const s of result) counts.set(s, (counts.get(s) ?? 0) + 1);
    const maxCount = Math.max(...counts.values());

    if (maxCount === 3) return { delta: Math.floor(cost * 3.2) + 5, row: { flavor: "3 of a kind. 'Basically perfect.'", fx: "win" } };
    if (maxCount === 2) return { delta: Math.floor(cost * 1.2), row: { flavor: "2 of a kind. 'Ship the demo.'", fx: "win" } };
    return { delta: -cost, row: { flavor: "No match. The model recommends 'trying a better prompt'.", fx: "loss" } };
  }

  function setReels(result) {
    for (let i = 0; i < reelEls.length; i += 1) reelEls[i].textContent = result[i];
  }

  function setGlow(kind) {
    const machine = document.querySelector(".machine");
    machine.classList.remove("glowWin", "glowLoss");
    if (kind === "win") machine.classList.add("glowWin");
    if (kind === "loss") machine.classList.add("glowLoss");
    window.setTimeout(() => machine.classList.remove("glowWin", "glowLoss"), 650);
  }

  function maybeNotify(title, body) {
    if (!state.notify) return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    try {
      new Notification(title, { body, icon: "./icon.svg", tag: "prompt-payout" });
    } catch {
      // ignore
    }
  }

  function lockControls(locked) {
    spinning = locked;
    spinBtn.disabled = locked;
    maxBtn.disabled = locked;
    boostBtn.disabled = locked;
    tierSel.disabled = locked;
  }

  async function doSpin({ maxMode }) {
    if (spinning) return;
    const cost = spinCost({ maxMode });

    if (state.tokens < cost) {
      setStatus("Insufficient tokens. Please request a grant, sell a vibe, or stop spinning.");
      log(`Denied: need ${cost}, have ${state.tokens}.`, "loss");
      beep("loss");
      haptic([25, 50, 25]);
      autoToggle.checked = false;
      return;
    }

    lockControls(true);
    state.tokens -= cost;
    state.spent += cost;
    state.spins += 1;
    if (state.cacheSpins > 0) state.cacheSpins -= 1;
    if (state.boostSpins > 0) state.boostSpins -= 1;
    save();
    render();

    reelBoxes.forEach((b) => b.classList.add("spinning"));
    setStatus(maxMode ? "MAX: paying extra to feel less empty." : "Spinning… (the model is 'thinking')");
    beep("spin");
    haptic(18);

    const t = tierConfig(state.tier);
    await sleep(state.reduceMotion ? 120 : t.delay);

    const result = [pickSymbol().icon, pickSymbol().icon, pickSymbol().icon, pickSymbol().icon];
    state.last = result;
    setReels(result);
    reelBoxes.forEach((b) => b.classList.remove("spinning"));

    const { delta, row } = payout(result, cost);
    const normalized = delta === -cost ? 0 : delta;

    if (normalized > 0) {
      state.tokens += normalized;
      state.won += normalized;
      setGlow("win");
      burst("win");
      beep("win");
      haptic([15, 25, 15]);
      const msg = `+${normalized} tokens. ${row?.flavor ?? "The model approves (for now)."}`;
      log(msg, "win");
      setStatus(msg);
      maybeNotify("Win", msg);
    } else if (normalized < 0) {
      state.tokens += normalized;
      setGlow("loss");
      burst("loss");
      beep("loss");
      haptic([35, 45, 35]);
      const msg = `${normalized} tokens. ${row?.flavor ?? "Oops."}`;
      log(msg, "loss");
      setStatus(msg);
      maybeNotify("Loss", msg);
    } else {
      setGlow("loss");
      beep("loss");
      haptic(26);
      const msg = `-${cost} tokens. ${row?.flavor ?? "No match."}`;
      log(msg, "loss");
      setStatus(msg);
      maybeNotify("Loss", msg);
    }

    const cacheHits = result.filter((x) => x === ICON.cache).length;
    if (cacheHits >= 2) {
      const add = cacheHits === 4 ? 10 : cacheHits === 3 ? 6 : 3;
      state.cacheSpins += add;
      log(`Cache warmed: +${add} discounted spins. (Finally: reuse.)`, "info");
      setStatus(`Cache warmed: +${add} discounted spins.`);
      beep("click");
    }

    state.tokens = Math.max(0, Math.floor(state.tokens));
    save();
    render();
    lockControls(false);

    if (autoToggle.checked) {
      if (state.tokens < spinCost({ maxMode: false })) {
        autoToggle.checked = false;
        setStatus("Auto stopped: you ran out of tokens. The model suggests 'raising a round'.");
      } else {
        window.clearTimeout(autoTimer);
        autoTimer = window.setTimeout(() => doSpin({ maxMode: false }), state.reduceMotion ? 120 : 240);
      }
    }
  }

  function renderPaytable() {
    const pay = $("#pay");
    pay.textContent = "";
    for (const row of PAYTABLE) {
      const div = document.createElement("div");
      div.className = "payRow";
      const left = document.createElement("div");
      left.className = "payCombo";
      left.textContent = `${row.combo.join(" ")}  ${row.label}`;
      const right = document.createElement("div");
      right.className = "payPayout";
      right.textContent = row.negative ? "???" : "scales";
      div.append(left, right);
      div.title = row.flavor;
      pay.append(div);
    }
  }

  function render() {
    tokensOut.textContent = `${state.tokens}`;
    spinCostOut.textContent = `${spinCost({ maxMode: false })}`;
    cacheOut.textContent = `${state.cacheSpins}`;
    spinsOut.textContent = `${state.spins}`;
    wonOut.textContent = `${state.won}`;
    spentOut.textContent = `${state.spent}`;

    tierSel.value = state.tier;
    soundToggle.checked = !!state.sound;
    hapticsToggle.checked = !!state.haptics;
    reduceMotionToggle.checked = !!state.reduceMotion;
    wakeToggle.checked = !!wakeLock;

    spinBtn.disabled = spinning || state.tokens < spinCost({ maxMode: false });
    maxBtn.disabled = spinning || state.tokens < spinCost({ maxMode: true });
    boostBtn.disabled = spinning || state.tokens < 18;
  }

  async function brag() {
    const t = tierConfig(state.tier);
    const msg = `Prompt Payout: ${state.tokens} tokens. Tier: ${t.brag}. ROI: mostly emotional damage.`;
    const payload = { title: "Prompt Payout", text: msg };

    try {
      if (navigator.share) {
        await navigator.share(payload);
        log("Shared successfully. The timeline will not forgive you.", "info");
        setStatus("Shared. Your cringe is now distributed.");
        return;
      }
    } catch {
      // ignore
    }

    try {
      await navigator.clipboard?.writeText?.(msg);
      log("Copied brag text to clipboard.", "info");
      setStatus("Copied to clipboard. Paste at your own risk.");
    } catch {
      log("Share/clipboard not available. Brag manually like it's 1999.", "info");
      setStatus("Couldn't share automatically. Brag manually.");
    }
  }

  function buyBoost() {
    const cost = 18;
    if (spinning) return;
    if (state.tokens < cost) {
      setStatus("Declined: insufficient tokens. Your wallet returned HTTP 402.");
      log("Boost denied: broke.", "loss");
      beep("loss");
      haptic([20, 50, 20]);
      return;
    }
    state.tokens -= cost;
    state.spent += cost;
    state.boostSpins = Math.max(state.boostSpins, 10);
    save();
    render();
    log(`Boost purchased: +10 spins of placebo performance. (-${cost})`, "info");
    setStatus("Boost purchased: +10 spins of placebo performance.");
    beep("click");
    haptic(14);
  }

  function enableNotifications() {
    if (!("Notification" in window)) {
      setStatus("Notifications unavailable in this browser.");
      log("Notifications not supported.", "info");
      return;
    }
    Notification.requestPermission().then((perm) => {
      state.notify = perm === "granted";
      save();
      render();
      const msg =
        perm === "granted"
          ? "Notifications enabled. The app can now heckle you outside the tab."
          : "Notifications denied. The app will heckle you inside the tab like a professional.";
      setStatus(msg);
      log(msg, "info");
      if (state.notify) maybeNotify("Prompt Payout", "Notifications enabled. Prepare for smugness.");
    });
  }

  async function setWakeLock(enabled) {
    if (!("wakeLock" in navigator)) {
      setStatus("Wake Lock not supported in this browser.");
      wakeToggle.checked = false;
      return;
    }
    try {
      if (enabled) {
        wakeLock = await navigator.wakeLock.request("screen");
        setStatus("Wake Lock enabled. The app refuses to let you rest.");
        log("Wake Lock acquired.", "info");
        wakeLock.addEventListener("release", () => {
          wakeLock = null;
          wakeToggle.checked = false;
          log("Wake Lock released.", "info");
        });
      } else if (wakeLock) {
        await wakeLock.release();
        wakeLock = null;
        setStatus("Wake Lock disabled. Sleep returns to the ecosystem.");
        log("Wake Lock released.", "info");
      }
    } catch {
      wakeLock = null;
      wakeToggle.checked = false;
      setStatus("Wake Lock failed. The browser said: no.");
      log("Wake Lock request failed.", "loss");
    }
  }

  function reset() {
    const ok = confirm("Reset your save? This deletes your tokens and your delusions.");
    if (!ok) return;
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  }

  function initHotkeys() {
    window.addEventListener("keydown", (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.code === "Space") {
        e.preventDefault();
        doSpin({ maxMode: false });
      }
    });
  }

  function initInstall() {
    if (!installBtn) return;
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      installBtn.hidden = false;
      log("Install available. Put gambling in your pocket and call it productivity.", "info");
    });
    window.addEventListener("appinstalled", () => {
      installBtn.hidden = true;
      deferredInstallPrompt = null;
      log("Installed. Congratulations: you packaged sarcasm.", "win");
      setStatus("Installed. The app now lives rent-free on your device.");
    });
    installBtn.addEventListener("click", async () => {
      if (!deferredInstallPrompt) {
        setStatus("Install isn't available right now. Try serving over http://localhost or HTTPS.");
        return;
      }
      try {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice?.outcome === "accepted") log("Install accepted. The machine is now a lifestyle.", "win");
        else log("Install dismissed. Commitment issues detected.", "info");
      } catch {
        log("Install failed. The browser said: maybe later.", "loss");
      } finally {
        deferredInstallPrompt = null;
        installBtn.hidden = true;
      }
    });
  }

  function init() {
    load();
    resizeFx();
    window.addEventListener("resize", resizeFx, { passive: true });

    tierSel.value = state.tier;
    soundToggle.checked = !!state.sound;
    hapticsToggle.checked = !!state.haptics;
    reduceMotionToggle.checked = !!state.reduceMotion;

    tierSel.addEventListener("change", () => {
      state.tier = tierSel.value;
      save();
      render();
      setStatus(`Model tier set to: ${tierSel.options[tierSel.selectedIndex].textContent}`);
      log(`Tier changed: ${state.tier}.`, "info");
      beep("click");
    });

    spinBtn.addEventListener("click", () => doSpin({ maxMode: false }));
    maxBtn.addEventListener("click", () => doSpin({ maxMode: true }));
    boostBtn.addEventListener("click", buyBoost);
    bragBtn.addEventListener("click", brag);
    notifyBtn.addEventListener("click", enableNotifications);
    resetBtn.addEventListener("click", reset);

    autoToggle.addEventListener("change", () => {
      if (autoToggle.checked) {
        setStatus("Auto enabled. The machine will keep going until reality intervenes.");
        log("Auto enabled.", "info");
        if (!spinning) doSpin({ maxMode: false });
      } else {
        window.clearTimeout(autoTimer);
        setStatus("Auto disabled. A rare moment of self-control.");
        log("Auto disabled.", "info");
      }
    });

    soundToggle.addEventListener("change", () => {
      state.sound = !!soundToggle.checked;
      save();
      render();
      setStatus(state.sound ? "Sound on. Your ears consented under duress." : "Sound off. Silence is the new alignment.");
      if (state.sound) beep("click");
    });

    hapticsToggle.addEventListener("change", () => {
      state.haptics = !!hapticsToggle.checked;
      save();
      render();
      setStatus(state.haptics ? "Haptics on. The device will judge you physically." : "Haptics off.");
      if (state.haptics) haptic(24);
    });

    reduceMotionToggle.addEventListener("change", () => {
      state.reduceMotion = !!reduceMotionToggle.checked;
      save();
      render();
      setStatus(state.reduceMotion ? "Reduce motion enabled." : "Reduce motion disabled.");
    });

    wakeToggle.addEventListener("change", () => setWakeLock(!!wakeToggle.checked));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && wakeToggle.checked) setWakeLock(true);
    });

    renderPaytable();
    setReels(state.last);
    render();
    initHotkeys();
    initInstall();

    log("Booted. Tokens loaded from localStorage (or invented if missing).", "info");
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").then(
        () => log("Offline cache armed (service worker registered).", "info"),
        () => log("Service worker not registered. Offline mode unavailable.", "info"),
      );
    }
  }

  init();
})();


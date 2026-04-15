(() => {
  "use strict";

  const els = {
    tokens: document.getElementById("tokens"),
    lastWin: document.getElementById("lastWin"),
    streak: document.getElementById("streak"),

    bet: document.getElementById("bet"),
    betNumber: document.getElementById("betNumber"),
    betValue: document.getElementById("betValue"),
    chips: Array.from(document.querySelectorAll("[data-bet]")),

    temp: document.getElementById("temp"),
    tempValue: document.getElementById("tempValue"),

    spin: document.getElementById("spin"),
    auto: document.getElementById("auto"),
    claim: document.getElementById("claim"),
    reset: document.getElementById("reset"),
    sound: document.getElementById("sound"),

    haptics: document.getElementById("haptics"),
    reducedFx: document.getElementById("reducedFx"),
    volume: document.getElementById("volume"),
    volumeValue: document.getElementById("volumeValue"),
    speed: document.getElementById("speed"),
    speedValue: document.getElementById("speedValue"),

    status: document.getElementById("status"),
    reels: [document.getElementById("reel0"), document.getElementById("reel1"), document.getElementById("reel2")],
    shop: document.getElementById("shop"),
    buffBar: document.getElementById("buffBar"),
    payline: document.getElementById("payline"),
    cabinetLights: document.getElementById("cabinetLights"),

    fx: document.getElementById("fx"),
    bigWin: document.getElementById("bigWin"),
    bigWinTitle: document.getElementById("bigWinTitle"),
    bigWinSub: document.getElementById("bigWinSub"),

    totalSpins: document.getElementById("totalSpins"),
    winLoss: document.getElementById("winLoss"),
    totalWon: document.getElementById("totalWon"),
    totalLost: document.getElementById("totalLost"),
    bestWin: document.getElementById("bestWin"),
    history: document.getElementById("history"),
  };

  const STORAGE_KEY = "aiSlots.v2";
  const DAILY_GRANT = 80;
  const START_TOKENS = 120;

  const SYMBOLS = [
    { key: "bot", face: "🤖", baseWeight: 18 },
    { key: "brain", face: "🧠", baseWeight: 14 },
    { key: "coin", face: "🪙", baseWeight: 5 },
    { key: "fire", face: "🔥", baseWeight: 8 },
    { key: "docs", face: "404", baseWeight: 6 },
    { key: "bug", face: "🐛", baseWeight: 12 },
    { key: "gpu", face: "🧩", baseWeight: 10 }, // "plug-in dependency"
    { key: "chart", face: "📈", baseWeight: 9 },
  ];

  const PAY_MULTIPLIERS = new Map([
    ["coin", 20],
    ["bot", 12],
    ["brain", 10],
    ["docs", 9],
    ["fire", 8],
  ]);

  const shopItems = [
    {
      id: "context",
      name: "Context window++",
      cost: 30,
      desc: "Next 6 spins: +25% payout (rounded).",
      apply: (s) => {
        s.buffs.payoutBoostSpins = Math.max(s.buffs.payoutBoostSpins, 6);
      },
    },
    {
      id: "gpu",
      name: "Rent a GPU minute",
      cost: 25,
      desc: "Next 5 spins: 20% chance your bet gets refunded (latency discount).",
      apply: (s) => {
        s.buffs.refundChanceSpins = Math.max(s.buffs.refundChanceSpins, 5);
      },
    },
    {
      id: "review",
      name: "Pay for a human code review",
      cost: 20,
      desc: "Once: bug tax reduction on your next bug loss.",
      apply: (s) => {
        s.buffs.bugShield = Math.max(s.buffs.bugShield, 1);
      },
    },
    {
      id: "lucky",
      name: "Lucky prompt (unreproducible)",
      cost: 40,
      desc: "Next 8 spins: coins show up more often.",
      apply: (s) => {
        s.buffs.luckSpins = Math.max(s.buffs.luckSpins, 8);
      },
    },
    {
      id: "patch",
      name: "Patch Tuesday hotfix",
      cost: 35,
      desc: "Next 6 spins: bug tax is reduced by 50%.",
      apply: (s) => {
        s.buffs.bugTaxHalfSpins = Math.max(s.buffs.bugTaxHalfSpins, 6);
      },
    },
  ];

  /** @type {{tokens:number, streak:number, auto:boolean, bestWin:number, totalSpins:number, winSpins:number, lossSpins:number, totalWon:number, totalLost:number, history:{ts:number, bet:number, payout:number, refund:boolean, net:number, faces:string, headline:string, tier:string}[], buffs:{payoutBoostSpins:number, refundChanceSpins:number, bugShield:number, luckSpins:number, bugTaxHalfSpins:number}, settings:{soundOn:boolean, volume:number, haptics:boolean, reducedFx:boolean, speed:number}, lastDailyClaimISO:string|null}} */
  let state = {
    tokens: START_TOKENS,
    streak: 0,
    auto: false,
    bestWin: 0,
    totalSpins: 0,
    winSpins: 0,
    lossSpins: 0,
    totalWon: 0,
    totalLost: 0,
    history: [],
    buffs: {
      payoutBoostSpins: 0,
      refundChanceSpins: 0,
      bugShield: 0,
      luckSpins: 0,
      bugTaxHalfSpins: 0,
    },
    settings: {
      soundOn: true,
      volume: 0.7,
      haptics: true,
      reducedFx: false,
      speed: 1.0,
    },
    lastDailyClaimISO: null,
  };

  let spinning = false;
  let autoTimer = null;
  let audio = null;
  let fx = null;
  let spinLoop = null;
  let spinSessionId = 0;
  let ui = {
    displayTokens: START_TOKENS,
    tokenRaf: 0,
    tokenFrom: START_TOKENS,
    tokenTo: START_TOKENS,
    tokenStart: 0,
    tokenDur: 0,
    tokenDir: 0,
    lastTickValue: START_TOKENS,
    lastTickAt: 0,
  };
  let bg = {
    mx: 0.5,
    my: 0.5,
    mood: 0,
    hue: 0,
    raf: 0,
    lastTs: 0,
    ptrRaf: 0,
    nextMx: 0.5,
    nextMy: 0.5,
  };

  function todayISO() {
    const now = new Date();
    const yyyy = String(now.getFullYear()).padStart(4, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function clampInt(value, min, max) {
    if (!Number.isFinite(value)) return min;
    const v = Math.trunc(value);
    return Math.max(min, Math.min(max, v));
  }

  function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }

  function syncBgVars() {
    document.documentElement.style.setProperty("--mx", String(bg.mx));
    document.documentElement.style.setProperty("--my", String(bg.my));
    document.documentElement.style.setProperty("--mood", String(bg.mood));
    document.documentElement.style.setProperty("--hue", String(bg.hue));

    document.body.classList.toggle("moodWin", bg.mood > 0.06);
    document.body.classList.toggle("moodLoss", bg.mood < -0.06);
  }

  function kickBg() {
    if (bg.raf) return;
    bg.lastTs = performance.now();
    bg.raf = requestAnimationFrame(tickBg);
  }

  function tickBg(ts) {
    bg.raf = 0;
    const dt = Math.max(0, ts - bg.lastTs);
    bg.lastTs = ts;
    const decay = Math.pow(0.0008, dt / 1600);
    bg.mood *= decay;
    if (Math.abs(bg.mood) < 0.004) bg.mood = 0;
    syncBgVars();
    if (bg.mood !== 0) bg.raf = requestAnimationFrame(tickBg);
  }

  function pulseBg({ moodDelta = 0, hueDelta = 0, nearMiss = false } = {}) {
    bg.mood = clamp(bg.mood + moodDelta, -1, 1);
    bg.hue = ((bg.hue + hueDelta) % 360 + 360) % 360;
    syncBgVars();
    kickBg();
    if (nearMiss) {
      document.body.classList.add("nearMiss");
      setTimeout(() => document.body.classList.remove("nearMiss"), 520);
    }
  }

  function flashScreen(tier) {
    if (state.settings.reducedFx) return;
    const cls =
      tier === "jackpot" ? "flashJackpot" : tier === "mega" || tier === "big" ? "flashMega" : tier === "win" ? "flashWin" : null;
    if (!cls) return;
    document.body.classList.add(cls);
    setTimeout(() => document.body.classList.remove(cls), tier === "jackpot" ? 1320 : tier === "mega" || tier === "big" ? 1020 : 820);
  }

  function wireBackground() {
    const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reducedMotion) {
      window.addEventListener(
        "pointermove",
        (ev) => {
          bg.nextMx = clamp(ev.clientX / Math.max(1, window.innerWidth), 0, 1);
          bg.nextMy = clamp(ev.clientY / Math.max(1, window.innerHeight), 0, 1);
          if (bg.ptrRaf) return;
          bg.ptrRaf = requestAnimationFrame(() => {
            bg.ptrRaf = 0;
            bg.mx = bg.nextMx;
            bg.my = bg.nextMy;
            syncBgVars();
          });
        },
        { passive: true },
      );
    }

    window.addEventListener(
      "pointerdown",
      (ev) => {
        if (state.settings.reducedFx) return;
        if (!fx) return;
        initAudio();
        void resumeAudio();
        const x = clamp(ev.clientX, 0, window.innerWidth);
        const y = clamp(ev.clientY, 0, window.innerHeight);

        const spinningNow = document.body.classList.contains("spinning");
        const winMood = bg.mood > 0.06;
        const lossMood = bg.mood < -0.06;

        if (spinningNow) {
          clickSfx({ gain: 0.09, bright: 0.7 });
          thumpSfx({ gain: 0.12, punch: 0.9, at: 0.01 });
          vibrate(6);
        } else if (winMood) {
          clickSfx({ gain: 0.12, bright: 1 });
          beep({ type: "triangle", freq: 990, ms: 70, gain: 0.10, sweepTo: 1320 });
          vibrate(8);
        } else if (lossMood) {
          thumpSfx({ gain: 0.14, punch: 0.8 });
          beep({ type: "sawtooth", freq: 180, ms: 90, gain: 0.08, sweepTo: 120 });
          vibrate(8);
        } else {
          clickSfx({ gain: 0.08, bright: 0.5 });
          vibrate(6);
        }

        fx.burst({
          x,
          y,
          count: (spinningNow ? 10 : winMood ? 22 : lossMood ? 12 : 14) + Math.round(Math.abs(bg.mood) * 16),
          power: (spinningNow ? 3.6 : winMood ? 5.6 : lossMood ? 4.4 : 4.2) + Math.abs(bg.mood) * 2.2,
          colors: winMood
            ? ["rgba(125,255,139,0.85)", "rgba(0,229,255,0.82)", "rgba(255,200,87,0.80)"]
            : lossMood
              ? ["rgba(255,61,113,0.85)", "rgba(255,43,214,0.78)", "rgba(0,229,255,0.55)"]
              : ["rgba(0,229,255,0.85)", "rgba(255,43,214,0.82)", "rgba(125,255,139,0.78)", "rgba(255,200,87,0.80)"],
        });
      },
      { passive: true },
    );
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;

      if (typeof parsed.tokens === "number") state.tokens = clampInt(parsed.tokens, 0, 999999);
      if (typeof parsed.streak === "number") state.streak = clampInt(parsed.streak, 0, 999999);
      if (typeof parsed.auto === "boolean") state.auto = parsed.auto;
      if (typeof parsed.bestWin === "number") state.bestWin = clampInt(parsed.bestWin, 0, 999999);
      if (typeof parsed.totalSpins === "number") state.totalSpins = clampInt(parsed.totalSpins, 0, 99999999);
      if (typeof parsed.winSpins === "number") state.winSpins = clampInt(parsed.winSpins, 0, 99999999);
      if (typeof parsed.lossSpins === "number") state.lossSpins = clampInt(parsed.lossSpins, 0, 99999999);
      if (typeof parsed.totalWon === "number") state.totalWon = clampInt(parsed.totalWon, 0, 999999999);
      if (typeof parsed.totalLost === "number") state.totalLost = clampInt(parsed.totalLost, 0, 999999999);

      if (Array.isArray(parsed.history)) {
        const next = [];
        for (const item of parsed.history) {
          if (!item || typeof item !== "object") continue;
          const ts = Number(item.ts);
          const bet = Number(item.bet);
          const payout = Number(item.payout);
          const net = Number(item.net);
          const refund = Boolean(item.refund);
          const faces = typeof item.faces === "string" ? item.faces : "";
          const headline = typeof item.headline === "string" ? item.headline : "";
          const tier = typeof item.tier === "string" ? item.tier : "";
          if (!Number.isFinite(ts) || !Number.isFinite(bet) || !Number.isFinite(payout) || !Number.isFinite(net)) continue;
          next.push({
            ts: clampInt(ts, 0, 9999999999999),
            bet: clampInt(bet, 1, 999),
            payout: clampInt(payout, -999999, 999999),
            refund,
            net: clampInt(net, -999999, 999999),
            faces,
            headline,
            tier,
          });
        }
        state.history = next.slice(-28);
      }

      if (parsed.buffs && typeof parsed.buffs === "object") {
        state.buffs.payoutBoostSpins = clampInt(parsed.buffs.payoutBoostSpins ?? 0, 0, 999);
        state.buffs.refundChanceSpins = clampInt(parsed.buffs.refundChanceSpins ?? 0, 0, 999);
        state.buffs.bugShield = clampInt(parsed.buffs.bugShield ?? 0, 0, 99);
        state.buffs.luckSpins = clampInt(parsed.buffs.luckSpins ?? 0, 0, 999);
        state.buffs.bugTaxHalfSpins = clampInt(parsed.buffs.bugTaxHalfSpins ?? 0, 0, 999);
      }

      if (parsed.settings && typeof parsed.settings === "object") {
        state.settings.soundOn = Boolean(parsed.settings.soundOn ?? true);
        state.settings.volume = clamp(Number(parsed.settings.volume ?? 0.7), 0, 1);
        state.settings.haptics = Boolean(parsed.settings.haptics ?? true);
        state.settings.reducedFx = Boolean(parsed.settings.reducedFx ?? false);
        state.settings.speed = clamp(Number(parsed.settings.speed ?? 1), 0.7, 1.35);
      }

      state.lastDailyClaimISO = typeof parsed.lastDailyClaimISO === "string" ? parsed.lastDailyClaimISO : null;
    } catch {
      // ignore
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }

  function setStatus(text, tone) {
    els.status.textContent = text;
    els.status.classList.remove("good", "bad");
    if (tone === "good") els.status.classList.add("good");
    if (tone === "bad") els.status.classList.add("bad");
  }

  function initAudio() {
    if (audio) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const master = ctx.createGain();
      master.gain.value = state.settings.volume * 0.35;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.knee.value = 22;
      comp.ratio.value = 10;
      comp.attack.value = 0.005;
      comp.release.value = 0.16;
      master.connect(comp);
      comp.connect(ctx.destination);

      const noiseSeconds = 1;
      const noiseLen = Math.max(1, Math.floor(ctx.sampleRate * noiseSeconds));
      const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < noiseLen; i++) {
        const white = Math.random() * 2 - 1;
        last = last * 0.92 + white * 0.08;
        data[i] = last;
      }

      audio = { ctx, master, noiseBuf };
    } catch {
      audio = null;
    }
  }

  async function resumeAudio() {
    if (!audio) return;
    if (audio.ctx.state === "suspended") {
      try {
        await audio.ctx.resume();
      } catch {
        // ignore
      }
    }
  }

  function syncMasterGain() {
    if (!audio) return;
    audio.master.gain.value = (state.settings.soundOn ? 1 : 0) * state.settings.volume * 0.35;
  }

  function sfxOk() {
    return state.settings.soundOn && state.settings.volume > 0.001;
  }

  function beep({ type = "sine", freq = 440, ms = 80, gain = 0.35, sweepTo = null, at = 0, pan = 0 } = {}) {
    if (!audio || !sfxOk()) return;
    const { ctx, master } = audio;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const p = typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = 0.0001;
    o.connect(g);
    if (p) {
      p.pan.value = clamp(Number(pan), -1, 1);
      g.connect(p);
      p.connect(master);
    } else {
      g.connect(master);
    }
    const now = ctx.currentTime;
    const t0 = now + Math.max(0, Number(at) || 0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    if (sweepTo && Number.isFinite(sweepTo)) {
      o.frequency.setValueAtTime(freq, t0);
      o.frequency.exponentialRampToValueAtTime(sweepTo, t0 + ms / 1000);
    }
    o.start(t0);
    o.stop(t0 + ms / 1000 + 0.03);
  }

  function noise({
    ms = 90,
    gain = 0.22,
    at = 0,
    pan = 0,
    filterFrom = 1200,
    filterTo = 260,
    q = 0.8,
    hp = 50,
  } = {}) {
    if (!audio || !sfxOk()) return;
    const { ctx, master, noiseBuf } = audio;
    if (!noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = clamp(Number(q), 0.0001, 24);
    const hpF = ctx.createBiquadFilter();
    hpF.type = "highpass";
    hpF.frequency.value = clamp(Number(hp), 0, 12000);
    const p = typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;

    g.gain.value = 0.0001;
    src.connect(hpF);
    hpF.connect(lp);
    lp.connect(g);
    if (p) {
      p.pan.value = clamp(Number(pan), -1, 1);
      g.connect(p);
      p.connect(master);
    } else {
      g.connect(master);
    }

    const now = ctx.currentTime;
    const t0 = now + Math.max(0, Number(at) || 0);
    const dur = Math.max(0.02, ms / 1000);

    lp.frequency.setValueAtTime(Math.max(30, Number(filterFrom) || 1200), t0);
    lp.frequency.exponentialRampToValueAtTime(Math.max(30, Number(filterTo) || 260), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }

  function panForReel(i) {
    if (i === 0) return -0.25;
    if (i === 2) return 0.25;
    return 0;
  }

  function clickSfx({ pan = 0, gain = 0.08, bright = 1, at = 0 } = {}) {
    if (!audio || !sfxOk()) return;
    const b = clamp(Number(bright), 0, 1);
    noise({
      ms: 16 + b * 14,
      gain: gain * (0.7 + b * 0.9),
      at,
      pan,
      filterFrom: 5200 + b * 2200,
      filterTo: 900 + b * 900,
      q: 1.2,
      hp: 700 + b * 500,
    });
    beep({
      type: "square",
      freq: 1200 + b * 1000 + randomBetween(-60, 60),
      ms: 18 + b * 12,
      gain: gain * (0.35 + b * 0.55),
      at,
      pan,
      sweepTo: 520 + b * 420,
    });
  }

  function thumpSfx({ pan = 0, gain = 0.18, at = 0, punch = 1 } = {}) {
    if (!audio || !sfxOk()) return;
    const p = clamp(Number(punch), 0, 1.4);
    beep({ type: "sine", freq: 90 + p * 35, ms: 95 + p * 40, gain: gain * (0.55 + p * 0.35), at, pan, sweepTo: 55 });
    noise({ ms: 65 + p * 55, gain: gain * (0.18 + p * 0.14), at: at + 0.01, pan, filterFrom: 900, filterTo: 180, q: 0.7, hp: 60 });
  }

  function stopSpinLoop({ fadeMs = 140 } = {}) {
    if (!spinLoop) return;
    const loop = spinLoop;
    spinLoop = null;
    try {
      const { ctx } = loop;
      const now = ctx.currentTime;
      const t1 = now + clamp(Number(fadeMs) / 1000, 0.02, 0.6);
      loop.gain.gain.cancelScheduledValues(now);
      loop.gain.gain.setValueAtTime(Math.max(0.0001, loop.gain.gain.value), now);
      loop.gain.gain.exponentialRampToValueAtTime(0.0001, t1);
      loop.src.stop(t1 + 0.05);
      loop.lfo.stop(t1 + 0.05);
      loop.sub.stop(t1 + 0.05);
    } catch {
      // ignore
    }
  }

  function startSpinLoop({ intensity = 1 } = {}) {
    if (!audio || !sfxOk()) return;
    stopSpinLoop({ fadeMs: 40 });

    const { ctx, master, noiseBuf } = audio;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 160;
    bp.Q.value = 0.9;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;

    const g = ctx.createGain();
    g.gain.value = 0.0001;

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 6.3;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 34;
    lfo.connect(lfoG);
    lfoG.connect(bp.frequency);

    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = 36;
    const subG = ctx.createGain();
    subG.gain.value = 0.0001;

    src.connect(bp);
    bp.connect(lp);
    lp.connect(g);
    g.connect(master);

    sub.connect(subG);
    subG.connect(master);

    const now = ctx.currentTime;
    const i = clamp(Number(intensity), 0.35, 1.35);
    const target = 0.03 + i * 0.03;

    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(target, now + 0.06);
    subG.gain.setValueAtTime(0.0001, now);
    subG.gain.exponentialRampToValueAtTime(0.012 + i * 0.012, now + 0.06);

    src.start(now);
    lfo.start(now);
    sub.start(now);

    spinLoop = { ctx, src, gain: g, lfo, sub, bp, lp, subG };
  }

  function setSpinLoopIntensity(v) {
    if (!spinLoop) return;
    const i = clamp(Number(v), 0, 1.5);
    try {
      spinLoop.bp.frequency.value = 140 + i * 120;
      spinLoop.lp.frequency.value = 1200 + i * 1600;
      spinLoop.sub.frequency.value = 34 + i * 12;
    } catch {
      // ignore
    }
  }

  function playSpinStartSfx() {
    clickSfx({ gain: 0.10, bright: 0.7 });
    thumpSfx({ gain: 0.16, punch: 0.9, at: 0.01 });
    noise({ ms: 140, gain: 0.10, filterFrom: 2400, filterTo: 520, q: 0.9, hp: 120 });
    startSpinLoop({ intensity: 0.95 });
  }

  function playReelTickSfx(reelIndex, phase01 = 0) {
    const pan = panForReel(reelIndex);
    const p = clamp(Number(phase01), 0, 1);
    const gain = 0.03 + p * 0.06;
    clickSfx({ pan, gain, bright: 0.35 + p * 0.55 });
  }

  function playReelStopSfx(reelIndex, phase01 = 1) {
    const pan = panForReel(reelIndex);
    const p = clamp(Number(phase01), 0, 1);
    thumpSfx({ pan, gain: 0.16 + p * 0.06, punch: 0.9 + p * 0.2 });
    clickSfx({ pan, gain: 0.10 + p * 0.05, bright: 0.6 + p * 0.35, at: 0.01 });
  }

  function playAnticipationSfx() {
    noise({ ms: 160, gain: 0.11, filterFrom: 3000, filterTo: 1200, q: 1.2, hp: 220 });
    beep({ type: "triangle", freq: 660, ms: 90, gain: 0.12, sweepTo: 990 });
    beep({ type: "triangle", freq: 990, ms: 130, gain: 0.10, at: 0.05, sweepTo: 1320 });
  }

  function playIconStopSfx(symbolKey, reelIndex) {
    const pan = panForReel(reelIndex);
    switch (symbolKey) {
      case "coin":
        beep({ type: "triangle", freq: 1040, ms: 70, gain: 0.20, sweepTo: 720, pan });
        beep({ type: "sine", freq: 1560, ms: 35, gain: 0.08, at: 0.02, pan });
        return;
      case "bot":
        beep({ type: "square", freq: 260, ms: 55, gain: 0.14, sweepTo: 520, pan });
        return;
      case "brain":
        beep({ type: "sine", freq: 420, ms: 55, gain: 0.13, sweepTo: 740, pan });
        beep({ type: "sine", freq: 740, ms: 40, gain: 0.09, at: 0.03, pan });
        return;
      case "fire":
        noise({ ms: 110, gain: 0.12, filterFrom: 1600, filterTo: 320, pan, hp: 120 });
        beep({ type: "sawtooth", freq: 210, ms: 85, gain: 0.12, sweepTo: 110, pan });
        return;
      case "docs":
        noise({ ms: 70, gain: 0.10, filterFrom: 1000, filterTo: 240, pan, q: 1.1, hp: 90 });
        beep({ type: "square", freq: 480, ms: 55, gain: 0.10, sweepTo: 404, pan });
        return;
      case "bug":
        noise({ ms: 90, gain: 0.10, filterFrom: 520, filterTo: 180, pan, q: 0.6, hp: 60 });
        beep({ type: "sawtooth", freq: 120, ms: 120, gain: 0.11, sweepTo: 78, pan });
        return;
      case "gpu":
        beep({ type: "square", freq: 220, ms: 40, gain: 0.11, sweepTo: 880, pan });
        beep({ type: "square", freq: 880, ms: 35, gain: 0.08, at: 0.03, pan });
        return;
      case "chart":
        beep({ type: "triangle", freq: 330, ms: 45, gain: 0.12, sweepTo: 660, pan });
        beep({ type: "triangle", freq: 660, ms: 45, gain: 0.10, at: 0.03, sweepTo: 990, pan });
        return;
      default:
        beep({ type: "square", freq: 380, ms: 32, gain: 0.08, sweepTo: 260, pan });
    }
  }

  function playOutcomeSfx(tier, opts = {}) {
    const { nearMiss = false } = opts;
    if (nearMiss) {
      noise({ ms: 170, gain: 0.12, filterFrom: 3200, filterTo: 520, q: 1.1, hp: 160 });
      beep({ type: "square", freq: 860, ms: 55, gain: 0.13, sweepTo: 260 });
      beep({ type: "square", freq: 260, ms: 90, gain: 0.12, at: 0.05, sweepTo: 120 });
      return;
    }

    if (tier === "win") {
      clickSfx({ gain: 0.10, bright: 0.9 });
      beep({ type: "triangle", freq: 520, ms: 110, gain: 0.15, sweepTo: 880 });
      beep({ type: "triangle", freq: 660, ms: 140, gain: 0.12, at: 0.04, sweepTo: 990 });
      return;
    }
    if (tier === "big") {
      thumpSfx({ gain: 0.18, punch: 1.0 });
      beep({ type: "triangle", freq: 520, ms: 140, gain: 0.18, sweepTo: 1040 });
      beep({ type: "triangle", freq: 780, ms: 160, gain: 0.14, at: 0.03, sweepTo: 1560 });
      noise({ ms: 150, gain: 0.11, at: 0.02, filterFrom: 2800, filterTo: 1100, hp: 200 });
      return;
    }
    if (tier === "mega") {
      thumpSfx({ gain: 0.20, punch: 1.2 });
      beep({ type: "triangle", freq: 660, ms: 160, gain: 0.20, sweepTo: 1320 });
      beep({ type: "triangle", freq: 990, ms: 190, gain: 0.16, at: 0.03, sweepTo: 1980 });
      beep({ type: "sine", freq: 1320, ms: 240, gain: 0.10, at: 0.06, sweepTo: 2640 });
      noise({ ms: 190, gain: 0.12, at: 0.03, filterFrom: 3600, filterTo: 1400, hp: 240 });
      return;
    }
    if (tier === "jackpot") {
      thumpSfx({ gain: 0.22, punch: 1.35 });
      beep({ type: "triangle", freq: 660, ms: 190, gain: 0.23, sweepTo: 1980 });
      beep({ type: "triangle", freq: 990, ms: 240, gain: 0.17, at: 0.03, sweepTo: 2970 });
      beep({ type: "triangle", freq: 1320, ms: 300, gain: 0.12, at: 0.06, sweepTo: 3960 });
      noise({ ms: 280, gain: 0.14, at: 0.03, filterFrom: 4200, filterTo: 1500, hp: 280 });
      for (let i = 0; i < 4; i++) {
        beep({ type: "sine", freq: 1560 + i * 90, ms: 55, gain: 0.07, at: 0.12 + i * 0.07 });
      }
      return;
    }
    if (tier === "loss") {
      thumpSfx({ gain: 0.16, punch: 0.8 });
      noise({ ms: 160, gain: 0.10, filterFrom: 620, filterTo: 160, q: 0.7, hp: 70 });
      beep({ type: "sawtooth", freq: 220, ms: 180, gain: 0.13, sweepTo: 120 });
      beep({ type: "sawtooth", freq: 150, ms: 220, gain: 0.09, at: 0.08, sweepTo: 90 });
      return;
    }
    // none
    clickSfx({ gain: 0.08, bright: 0.4 });
    beep({ type: "square", freq: 240, ms: 70, gain: 0.12, sweepTo: 210 });
  }

  function vibrate(pattern) {
    if (!state.settings.haptics) return;
    if (!("vibrate" in navigator)) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }

  function ensureReelSpan(reelEl) {
    const existing = reelEl.querySelector("span");
    if (existing) return existing;
    const span = document.createElement("span");
    span.textContent = reelEl.textContent || "🪙";
    reelEl.textContent = "";
    reelEl.appendChild(span);
    return span;
  }

  function setReelFace(reelEl, face) {
    ensureReelSpan(reelEl).textContent = face;
  }

  function temperatureAdjustedWeights(temp) {
    // temp in [0..2]. Higher temp flattens distribution (more chaos).
    const flatten = 0.45 + temp; // [0.45..2.45]
    const exp = 1 / flatten; // lower exp => flatter

    // Base weights
    const weights = SYMBOLS.map((s) => Math.pow(s.baseWeight, exp));

    // Buff: luck spins makes coins more likely (still chaotic).
    if (state.buffs.luckSpins > 0) {
      const coinIdx = SYMBOLS.findIndex((s) => s.key === "coin");
      if (coinIdx >= 0) weights[coinIdx] *= 1.65;
      const bugIdx = SYMBOLS.findIndex((s) => s.key === "bug");
      if (bugIdx >= 0) weights[bugIdx] *= 0.85;
    }

    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map((w) => w / sum);
  }

  function pickSymbol(temp) {
    const probs = temperatureAdjustedWeights(temp);
    let r = Math.random();
    for (let i = 0; i < SYMBOLS.length; i++) {
      r -= probs[i];
      if (r <= 0) return SYMBOLS[i];
    }
    return SYMBOLS[SYMBOLS.length - 1];
  }

  function betMax() {
    return clampInt(Number(els.bet.max), 1, 999);
  }

  function getBet() {
    return clampInt(Number(els.bet.value), 1, betMax());
  }

  function setBetValue(v) {
    const bet = clampInt(Number(v), 1, betMax());
    els.bet.value = String(bet);
    els.betNumber.value = String(bet);
    updateUI();
  }

  function getTemp() {
    const t = Number(els.temp.value);
    if (!Number.isFinite(t)) return 1;
    return Math.max(0, Math.min(2, t));
  }

  function spinSpeed() {
    return clamp(Number(state.settings.speed), 0.7, 1.35);
  }

  function syncDisplayedTokensNow() {
    if (ui.tokenRaf) cancelAnimationFrame(ui.tokenRaf);
    ui.tokenRaf = 0;
    ui.displayTokens = state.tokens;
    ui.tokenFrom = state.tokens;
    ui.tokenTo = state.tokens;
    ui.lastTickValue = state.tokens;
    ui.lastTickAt = 0;
    if (els.tokens) els.tokens.textContent = String(ui.displayTokens);
  }

  function playCreditTick(dir, intensity01 = 0.6) {
    const p = clamp(Number(intensity01), 0, 1);
    const g = 0.06 + p * 0.06;
    const bright = 0.4 + p * 0.6;
    if (dir > 0) {
      clickSfx({ gain: g, bright });
      beep({ type: "triangle", freq: 740 + p * 520, ms: 30 + p * 22, gain: 0.05 + p * 0.04, sweepTo: 520 + p * 320 });
    } else {
      clickSfx({ gain: g * 0.85, bright: bright * 0.85 });
      beep({ type: "sine", freq: 220 + p * 120, ms: 36 + p * 28, gain: 0.05 + p * 0.03, sweepTo: 160 });
    }
  }

  function animateDisplayedTokensTo(target, { ms = 520, dir = 0, coinTicks = false, intensity = 0.7 } = {}) {
    const to = clampInt(Number(target), 0, 999999999);
    if (!Number.isFinite(to)) return;

    if (ui.tokenRaf) cancelAnimationFrame(ui.tokenRaf);
    ui.tokenRaf = 0;

    const from = clampInt(Number(ui.displayTokens), 0, 999999999);
    ui.tokenFrom = from;
    ui.tokenTo = to;
    ui.tokenStart = performance.now();
    ui.tokenDur = clamp(Number(ms), 160, 2400);
    ui.tokenDir = dir === 0 ? (to >= from ? 1 : -1) : dir;

    const tickEveryMs = clamp(70 - clamp(Number(intensity), 0, 1) * 36, 28, 78);
    ui.lastTickAt = 0;
    ui.lastTickValue = from;

    function easeOutCubic(x) {
      const t = clamp(x, 0, 1);
      return 1 - Math.pow(1 - t, 3);
    }

    const raf = (ts) => {
      const p = clamp((ts - ui.tokenStart) / ui.tokenDur, 0, 1);
      const e = easeOutCubic(p);
      const next = clampInt(Math.round(ui.tokenFrom + (ui.tokenTo - ui.tokenFrom) * e), 0, 999999999);
      ui.displayTokens = next;
      if (els.tokens) els.tokens.textContent = String(next);

      if (coinTicks) {
        if (ui.lastTickAt === 0) ui.lastTickAt = ts;
        const dt = ts - ui.lastTickAt;
        if (dt >= tickEveryMs && next !== ui.lastTickValue) {
          const delta = Math.abs(next - ui.lastTickValue);
          const burst = clamp(delta / 12, 0.15, 1);
          playCreditTick(ui.tokenDir, clamp(Number(intensity) * burst, 0.25, 1));
          ui.lastTickValue = next;
          ui.lastTickAt = ts;
        }
      }

      if (p < 1) {
        ui.tokenRaf = requestAnimationFrame(raf);
      } else {
        ui.tokenRaf = 0;
        ui.displayTokens = ui.tokenTo;
        if (els.tokens) els.tokens.textContent = String(ui.displayTokens);
      }
    };

    ui.tokenRaf = requestAnimationFrame(raf);
  }

  function renderBuffBar() {
    if (!els.buffBar) return;

    const parts = [];
    if (state.buffs.payoutBoostSpins > 0) parts.push({ tone: "good", text: `Context++ ×${state.buffs.payoutBoostSpins}` });
    if (state.buffs.refundChanceSpins > 0) parts.push({ tone: "warn", text: `Latency discount ×${state.buffs.refundChanceSpins}` });
    if (state.buffs.luckSpins > 0) parts.push({ tone: "good", text: `Lucky prompt ×${state.buffs.luckSpins}` });
    if (state.buffs.bugTaxHalfSpins > 0) parts.push({ tone: "good", text: `Bug tax ½ ×${state.buffs.bugTaxHalfSpins}` });
    if (state.buffs.bugShield > 0) parts.push({ tone: "good", text: `Human review ×${state.buffs.bugShield}` });

    els.buffBar.innerHTML = "";
    if (parts.length === 0) {
      const empty = document.createElement("div");
      empty.className = "buffEmpty";
      empty.textContent = "No active boosts. (Yet.)";
      els.buffBar.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    for (const p of parts) {
      const chip = document.createElement("span");
      chip.className = `buffChip ${p.tone}`.trim();
      chip.textContent = p.text;
      frag.appendChild(chip);
    }
    els.buffBar.appendChild(frag);
  }

  function renderShop() {
    els.shop.innerHTML = "";
    for (const item of shopItems) {
      const row = document.createElement("div");
      row.className = "shopItem";

      const left = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = item.name;
      const desc = document.createElement("p");
      desc.textContent = item.desc;
      left.appendChild(title);
      left.appendChild(desc);

      const right = document.createElement("div");
      const price = document.createElement("span");
      price.className = "price";
      price.textContent = `${item.cost} 🪙`;
      const buy = document.createElement("button");
      buy.type = "button";
      buy.textContent = "Buy";
      buy.disabled = state.tokens < item.cost || spinning;
      buy.addEventListener("click", () => {
        if (spinning) return;
        if (state.tokens < item.cost) {
          setStatus("Insufficient tokens. Try spinning or claim the daily grant.", "bad");
          initAudio();
          void resumeAudio();
          beep({ type: "sawtooth", freq: 160, ms: 90, gain: 0.24, sweepTo: 90 });
          vibrate([20, 40, 20]);
          return;
        }
        state.tokens -= item.cost;
        animateDisplayedTokensTo(state.tokens, { ms: 260, dir: -1, coinTicks: true, intensity: 0.55 });
        item.apply(state);
        save();
        updateUI();
        setStatus(`Purchased: ${item.name}. Productivity increased by vibes.`, "good");
        initAudio();
        void resumeAudio();
        beep({ type: "triangle", freq: 740, ms: 90, gain: 0.30, sweepTo: 990 });
        vibrate(12);
      });

      right.appendChild(price);
      right.appendChild(buy);

      row.appendChild(left);
      row.appendChild(right);
      els.shop.appendChild(row);
    }
  }

  function canClaimDaily() {
    const t = todayISO();
    return state.lastDailyClaimISO !== t;
  }

  function claimDaily() {
    const t = todayISO();
    if (state.lastDailyClaimISO === t) {
      setStatus("Daily grant already claimed. Come back tomorrow for more free money.", null);
      initAudio();
      void resumeAudio();
      beep({ type: "square", freq: 240, ms: 70, gain: 0.16, sweepTo: 180 });
      return;
    }
    state.lastDailyClaimISO = t;
    state.tokens += DAILY_GRANT;
    animateDisplayedTokensTo(state.tokens, { ms: 520, dir: 1, coinTicks: true, intensity: 0.75 });
    save();
    updateUI();
    setStatus(`Daily grant received: +${DAILY_GRANT} 🪙. The token printer goes brrr.`, "good");
    initAudio();
    void resumeAudio();
    beep({ type: "triangle", freq: 520, ms: 110, gain: 0.30, sweepTo: 880 });
    vibrate([10, 15, 18]);
  }

  function computePayout(symbolKeys, bet, buffs) {
    const [a, b, c] = symbolKeys;
    const counts = new Map();
    for (const k of symbolKeys) counts.set(k, (counts.get(k) ?? 0) + 1);

    const hasBug = (counts.get("bug") ?? 0) > 0;
    let payout = 0;
    let headline = "";
    let usedBugShield = false;

    const threeOfKindKey = [...counts.entries()].find(([, n]) => n === 3)?.[0] ?? null;
    const hasPair = [...counts.values()].some((n) => n === 2);

    if (threeOfKindKey && PAY_MULTIPLIERS.has(threeOfKindKey)) {
      const mult = PAY_MULTIPLIERS.get(threeOfKindKey);
      payout = bet * mult;
      headline = `JACKPOT: ${SYMBOLS.find((s) => s.key === threeOfKindKey)?.face ?? threeOfKindKey} ×${mult}`;
    } else if (a === "docs" && b === "docs" && c === "docs") {
      payout = bet * 9;
      headline = "404404404: You found the docs (they moved).";
    } else if (hasPair) {
      payout = bet * 2;
      headline = "Pair hit: That’s a valid demo result.";
    } else {
      payout = 0;
      headline = "No match: The model says “try again.”";
    }

    if (hasBug) {
      const bugTaxMult = (buffs?.bugTaxHalfSpins ?? 0) > 0 ? 0.5 : 1;
      const bugTax = Math.round(3 * bet * bugTaxMult);
      payout -= bugTax;
      headline = headline ? `${headline} (🐛 bug tax)` : "🐛 Bug tax: reality has entered the chat.";
    }

    // Optional “human review” shield: reduces one bug tax hit once.
    if (hasBug && (buffs?.bugShield ?? 0) > 0 && payout < 0) {
      const cap = Math.round(3 * bet * ((buffs?.bugTaxHalfSpins ?? 0) > 0 ? 0.5 : 1));
      const refund = Math.min(cap, -payout);
      payout += refund;
      usedBugShield = refund > 0;
    }

    // Buff: payout boost
    if (payout > 0 && (buffs?.payoutBoostSpins ?? 0) > 0) payout = Math.round(payout * 1.25);

    return { payout, headline, usedBugShield };
  }

  function formatFaces(symbolKeys) {
    return symbolKeys.map((k) => SYMBOLS.find((s) => s.key === k)?.face ?? k).join(" ");
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatStamp(ts) {
    const d = new Date(ts);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }

  function renderHistory() {
    if (!els.history) return;
    els.history.innerHTML = "";
    if (!state.history || state.history.length === 0) {
      const empty = document.createElement("div");
      empty.className = "historyItem";
      empty.innerHTML = `<span class="historyStamp">—</span><span class="historyMsg">No spins logged yet. Feed the model some tokens.</span><span class="historyDelta"> </span>`;
      els.history.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    const rows = [...state.history].slice(-24).reverse();
    for (const h of rows) {
      const row = document.createElement("div");
      const tone = h.net > 0 ? "good" : h.net < 0 ? "bad" : "";
      row.className = `historyItem ${tone}`.trim();

      const stamp = document.createElement("span");
      stamp.className = "historyStamp";
      stamp.textContent = formatStamp(h.ts);

      const msg = document.createElement("span");
      msg.className = "historyMsg";
      const refundTag = h.refund ? " (refund)" : "";
      msg.textContent = `${h.faces} — bet ${h.bet} 🪙 — ${h.headline}${refundTag}`;

      const delta = document.createElement("span");
      delta.className = "historyDelta";
      delta.textContent = h.net > 0 ? `+${h.net} 🪙` : h.net < 0 ? `−${Math.abs(h.net)} 🪙` : "±0";

      row.appendChild(stamp);
      row.appendChild(msg);
      row.appendChild(delta);
      frag.appendChild(row);
    }
    els.history.appendChild(frag);
  }

  function spinReel(reelEl, finalFace, durationMs, onStop, opts = {}) {
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const totalMs = reduced ? Math.min(240, durationMs) : durationMs;
    const sessionId = Number.isFinite(opts.sessionId) ? Number(opts.sessionId) : null;
    const reelIndex = Number.isFinite(opts.reelIndex) ? Number(opts.reelIndex) : 1;

    reelEl.classList.add("spinning");
    reelEl.classList.remove("win", "lose", "pop", "hold");

    const start = performance.now();
    const teaseFace = typeof opts.teaseFace === "string" ? opts.teaseFace : null;
    const teaseStartMs = Number.isFinite(opts.teaseStartMs) ? Number(opts.teaseStartMs) : totalMs * 0.78;
    const teaseEndMs = Number.isFinite(opts.teaseEndMs) ? Number(opts.teaseEndMs) : totalMs * 0.92;
    const onTease = typeof opts.onTease === "function" ? opts.onTease : null;

    function easeOutQuad(x) {
      const t = clamp(x, 0, 1);
      return 1 - (1 - t) * (1 - t);
    }

    function easeInCubic(x) {
      const t = clamp(x, 0, 1);
      return t * t * t;
    }

    function lerp(a, b, t) {
      return a + (b - a) * t;
    }

    function intervalFor(p) {
      if (reduced) return 75;
      if (p < 0.14) return lerp(58, 22, easeOutQuad(p / 0.14)) + randomBetween(-2, 2);
      if (p < 0.66) return 20 + randomBetween(0, 5);
      const u = (p - 0.66) / 0.34;
      return lerp(26, 170, easeInCubic(u)) + randomBetween(-2, 4);
    }

    return new Promise((resolve) => {
      let lastFace = "";
      let lastSfxAt = 0;
      let teased = false;

      const tick = () => {
        if (sessionId != null && sessionId !== spinSessionId) {
          resolve();
          return;
        }

        const now = performance.now();
        const t = now - start;
        const p = clamp(t / totalMs, 0, 1);

        if (t >= totalMs) {
          setReelFace(reelEl, finalFace);
          reelEl.classList.remove("spinning", "hold");
          reelEl.classList.add("pop");
          setTimeout(() => reelEl.classList.remove("pop"), 220);
          playReelStopSfx(reelIndex, 1);
          if (onStop) onStop();
          resolve();
          return;
        }

        const slowPhase = clamp((p - 0.55) / 0.45, 0, 1);
        const minSfxGap = 24 + (1 - slowPhase) * 14;
        if (now - lastSfxAt > minSfxGap) {
          playReelTickSfx(reelIndex, slowPhase);
          lastSfxAt = now;
        }

        let face = "";
        if (teaseFace && t >= teaseStartMs && t <= teaseEndMs) {
          face = teaseFace;
          if (!teased) {
            teased = true;
            if (onTease) onTease();
          }
        } else {
          face = SYMBOLS[(Math.random() * SYMBOLS.length) | 0].face;
          if (face === lastFace) face = SYMBOLS[(Math.random() * SYMBOLS.length) | 0].face;
        }

        if (face !== lastFace) setReelFace(reelEl, face);
        lastFace = face;

        const delay = intervalFor(p);
        setTimeout(tick, clamp(delay, 16, 240));
      };

      tick();
    });
  }

  function winTier(payout, bet) {
    if (payout >= bet * 20) return "jackpot";
    if (payout >= bet * 12) return "mega";
    if (payout >= bet * 8) return "big";
    if (payout > 0) return "win";
    if (payout < 0) return "loss";
    return "none";
  }

  function showBigWin(tier, payout) {
    if (state.settings.reducedFx) return;
    if (tier !== "big" && tier !== "mega" && tier !== "jackpot") return;
    const label = tier === "jackpot" ? "JACKPOT" : tier === "mega" ? "MEGA WIN" : "BIG WIN";
    els.bigWinTitle.textContent = label;
    els.bigWinSub.textContent = `+${payout} tokens`;
    els.bigWin.classList.add("show");
    setTimeout(() => els.bigWin.classList.remove("show"), tier === "jackpot" ? 1050 : 780);
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function createFx(canvas) {
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return null;

    /** @type {{x:number,y:number,vx:number,vy:number,life:number,ttl:number,r:number,color:string}[]} */
    let particles = [];
    let raf = 0;
    let w = 1;
    let h = 1;
    let dpr = 1;

    function resize() {
      dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      w = Math.max(1, Math.floor(window.innerWidth));
      h = Math.max(1, Math.floor(window.innerHeight));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function burst({ x, y, count, power, colors }) {
      const c = clampInt(count, 6, 240);
      const p = clamp(Number(power), 1, 12);
      for (let i = 0; i < c; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = randomBetween(1.2, 1.0 + p);
        particles.push({
          x,
          y,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp - randomBetween(0.2, 1.2),
          life: 0,
          ttl: randomBetween(520, 980),
          r: randomBetween(1.4, 2.6),
          color: colors[(Math.random() * colors.length) | 0],
        });
      }
      kick();
    }

    function kick() {
      if (raf) return;
      raf = requestAnimationFrame(tick);
    }

    function tick(ts) {
      raf = 0;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      const gravity = 0.028;
      const drag = 0.988;
      const next = [];

      for (const part of particles) {
        part.life += 16;
        const t = part.life / part.ttl;
        if (t >= 1) continue;
        part.vx *= drag;
        part.vy = part.vy * drag + gravity;
        part.x += part.vx * 6;
        part.y += part.vy * 6;

        const a = 1 - t;
        ctx.globalAlpha = a * a;
        ctx.fillStyle = part.color;
        ctx.beginPath();
        ctx.arc(part.x, part.y, part.r, 0, Math.PI * 2);
        ctx.fill();
        next.push(part);
      }

      ctx.globalAlpha = 1;
      particles = next;

      if (particles.length > 0) raf = requestAnimationFrame(tick);
    }

    resize();

    return {
      resize,
      burst,
    };
  }

  function celebrateWin(tier, payout, bet) {
    if (state.settings.reducedFx) return;
    if (!fx) return;

    const colors = ["rgba(0,229,255,0.9)", "rgba(255,43,214,0.85)", "rgba(125,255,139,0.85)", "rgba(255,200,87,0.8)"];

    const ratio = bet > 0 ? payout / bet : 0;
    const centerX = window.innerWidth * 0.5;
    const topY = window.innerHeight * 0.26;

    if (tier === "win") {
      fx.burst({ x: centerX, y: topY, count: 18, power: 4, colors });
      return;
    }

    if (tier === "big") {
      fx.burst({ x: centerX, y: topY, count: 34, power: 6, colors });
      setTimeout(() => fx && fx.burst({ x: centerX * 0.66, y: topY * 1.1, count: 28, power: 5.4, colors }), 120);
      setTimeout(() => fx && fx.burst({ x: centerX * 1.34, y: topY * 1.05, count: 28, power: 5.4, colors }), 180);
      document.body.classList.add("shake");
      setTimeout(() => document.body.classList.remove("shake"), 420);
      return;
    }

    if (tier === "mega" || tier === "jackpot") {
      const n = tier === "jackpot" ? 7 : 5;
      const count = tier === "jackpot" ? 72 : 54;
      const power = tier === "jackpot" ? 9 : 7.5;
      for (let i = 0; i < n; i++) {
        setTimeout(() => {
          if (!fx) return;
          fx.burst({
            x: randomBetween(window.innerWidth * 0.18, window.innerWidth * 0.82),
            y: randomBetween(window.innerHeight * 0.14, window.innerHeight * 0.5),
            count: Math.round(count + ratio * 1.2),
            power,
            colors,
          });
        }, i * 130);
      }
      document.body.classList.add("shake");
      setTimeout(() => document.body.classList.remove("shake"), tier === "jackpot" ? 680 : 520);
    }
  }

  function setAuto(on) {
    state.auto = on;
    save();
    updateUI();
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
    if (!on) return;

    autoTimer = setInterval(() => {
      if (spinning) return;
      const bet = getBet();
      if (state.tokens < bet) {
        setAuto(false);
        setStatus("Auto-spin stopped: insufficient tokens (fiscal responsibility activated).", "bad");
        return;
      }
      void doSpin();
    }, 920);
  }

  function updateUI() {
    if (!ui.tokenRaf) ui.displayTokens = state.tokens;
    els.tokens.textContent = String(ui.displayTokens);
    els.streak.textContent = String(state.streak);

    if (els.lastWin) {
      const last = [...state.history].slice().reverse().find((h) => h.net > 0)?.net ?? 0;
      els.lastWin.textContent = String(clampInt(Number(last), 0, 999999999));
    }

    const bet = getBet();
    els.betValue.textContent = String(bet);
    els.betNumber.value = String(bet);

    const temp = getTemp();
    els.tempValue.textContent = temp.toFixed(1);

    const canSpin = !spinning && state.tokens >= bet;
    els.spin.disabled = !canSpin;
    els.spin.textContent = canSpin ? `SPIN (pay ${bet} 🪙)` : "SPIN (need tokens)";

    els.auto.setAttribute("aria-pressed", String(state.auto));
    els.auto.textContent = state.auto ? "Auto-spin: ON" : "Auto-spin: OFF";

    const claimable = canClaimDaily();
    els.claim.disabled = !claimable;
    els.claim.textContent = claimable ? `Claim daily grant (+${DAILY_GRANT} 🪙)` : "Daily grant claimed";

    els.sound.setAttribute("aria-pressed", String(state.settings.soundOn));
    els.sound.textContent = state.settings.soundOn ? "Sound: ON" : "Sound: OFF";

    els.haptics.checked = Boolean(state.settings.haptics);
    els.reducedFx.checked = Boolean(state.settings.reducedFx);

    els.volume.value = String(Math.round(state.settings.volume * 100));
    els.volumeValue.textContent = String(Math.round(state.settings.volume * 100));

    els.speed.value = String(state.settings.speed);
    els.speedValue.textContent = state.settings.speed.toFixed(2);

    if (els.totalSpins) els.totalSpins.textContent = String(state.totalSpins);
    if (els.winLoss) els.winLoss.textContent = `${state.winSpins} / ${state.lossSpins}`;
    if (els.totalWon) els.totalWon.textContent = String(state.totalWon);
    if (els.totalLost) els.totalLost.textContent = String(state.totalLost);
    if (els.bestWin) els.bestWin.textContent = String(state.bestWin);
    renderBuffBar();
    renderShop();
    renderHistory();
  }

  async function doSpin() {
    if (spinning) return;
    const bet = getBet();
    if (state.tokens < bet) {
      setStatus("Not enough tokens. Claim the daily grant or reduce your bet.", "bad");
      initAudio();
      await resumeAudio();
      beep({ type: "sawtooth", freq: 170, ms: 90, gain: 0.22, sweepTo: 120 });
      vibrate(40);
      return;
    }

    initAudio();
    await resumeAudio();
    syncMasterGain();

    spinning = true;
    updateUI();

    // Pay tokens to the “model”.
    state.tokens -= bet;
    save();
    animateDisplayedTokensTo(state.tokens, { ms: 240, dir: -1, coinTicks: true, intensity: 0.65 });
    updateUI();

    const temp = getTemp();
    const picked = [pickSymbol(temp), pickSymbol(temp), pickSymbol(temp)];
    const symbolKeys = picked.map((s) => s.key);
    const preview = computePayout(symbolKeys, bet, state.buffs);
    const previewTier = winTier(preview.payout, bet);

    setStatus(`Spinning… spending ${bet} tokens on “inference”.`, null);
    document.body.classList.add("spinning");
    document.body.classList.remove("anticipation", "paylineWin", "paylineJackpot");
    playSpinStartSfx();
    vibrate(12);

    const speed = spinSpeed();
    const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const sessionId = (spinSessionId += 1);
    const tierBoostMs = previewTier === "jackpot" ? 280 : previewTier === "mega" ? 180 : previewTier === "big" ? 100 : 0;
    const base = clamp((1660 + tierBoostMs) / speed, 980, 2350);
    const durations = [base * 0.90, base * 1.05, base * 1.22];

    const pairFirstTwo = symbolKeys[0] === symbolKeys[1];
    if (pairFirstTwo && !reducedMotion) durations[2] += 240 / speed;
    const teaseKey = pairFirstTwo && symbolKeys[2] !== symbolKeys[0] && !reducedMotion && Math.random() < 0.78 ? symbolKeys[0] : null;
    const teaseFace = teaseKey ? SYMBOLS.find((s) => s.key === teaseKey)?.face ?? null : null;
    const teaseMsStart = durations[2] - 330 / speed;
    const teaseMsEnd = durations[2] - 170 / speed;

    let anticipationOn = false;
    const nearMissUsed = Boolean(teaseFace);

    const promises = picked.map((sym, i) =>
      spinReel(
        els.reels[i],
        sym.face,
        durations[i],
        () => {
          playIconStopSfx(sym.key, i);

          if (i === 1 && pairFirstTwo && !anticipationOn) {
            anticipationOn = true;
            document.body.classList.add("anticipation");
            els.reels[2].classList.add("hold");
            setSpinLoopIntensity(1.2);
            if (previewTier === "jackpot") {
              playAnticipationSfx();
              beep({ type: "triangle", freq: 520, ms: 140, gain: 0.12, sweepTo: 1560 });
              beep({ type: "triangle", freq: 780, ms: 190, gain: 0.10, at: 0.05, sweepTo: 2340 });
            } else if (previewTier === "mega" || previewTier === "big") {
              playAnticipationSfx();
              beep({ type: "triangle", freq: 520, ms: 120, gain: 0.10, sweepTo: 1320 });
            } else {
              playAnticipationSfx();
            }
            vibrate([10, 20, 10]);
          }

          if (i === 2) {
            document.body.classList.remove("anticipation");
            els.reels[2].classList.remove("hold");
          }
        },
        {
          sessionId,
          reelIndex: i,
          teaseFace: i === 2 ? teaseFace : null,
          teaseStartMs: i === 2 && teaseFace ? teaseMsStart : null,
          teaseEndMs: i === 2 && teaseFace ? teaseMsEnd : null,
          onTease:
            i === 2 && teaseFace
              ? () => {
                  clickSfx({ pan: panForReel(2), gain: 0.12, bright: 1 });
                  beep({ type: "triangle", freq: 990, ms: 70, gain: 0.10, sweepTo: 1560, pan: panForReel(2) });
                }
              : null,
        },
      ),
    );
    await Promise.all(promises);
    stopSpinLoop({ fadeMs: 180 });

    // Buff: refund chance (latency discount)
    let refundApplied = false;
    if (state.buffs.refundChanceSpins > 0) {
      const refund = Math.random() < 0.2;
      if (refund) {
        refundApplied = true;
        state.tokens += bet;
        animateDisplayedTokensTo(state.tokens, { ms: 300, dir: 1, coinTicks: true, intensity: 0.75 });
        setStatus("Latency discount applied: bet refunded. The GPU was… “busy”.", "good");
        beep({ type: "triangle", freq: 520, ms: 90, gain: 0.22, sweepTo: 820 });
        vibrate([10, 15, 10]);
      }
      state.buffs.refundChanceSpins -= 1;
    }

    const { payout, headline, usedBugShield } = computePayout(symbolKeys, bet, state.buffs);

    if (usedBugShield && state.buffs.bugShield > 0) state.buffs.bugShield -= 1;

    if (state.buffs.payoutBoostSpins > 0) state.buffs.payoutBoostSpins -= 1;
    if (state.buffs.luckSpins > 0) state.buffs.luckSpins -= 1;
    if (state.buffs.bugTaxHalfSpins > 0) state.buffs.bugTaxHalfSpins -= 1;

    const beforePayoutTokens = state.tokens;
    state.tokens = clampInt(state.tokens + payout, 0, 999999);
    const appliedDelta = state.tokens - beforePayoutTokens;

    const tier = winTier(payout, bet);
    const faces = formatFaces(symbolKeys);
    const net = payout - bet + (refundApplied ? bet : 0);

    if (appliedDelta !== 0) {
      const mag = Math.abs(appliedDelta);
      const intensity = clamp(mag / Math.max(1, bet * 10), 0.35, 1);
      const ms = clamp(320 + mag * 3.2, 320, tier === "jackpot" ? 1900 : tier === "mega" ? 1500 : tier === "big" ? 1100 : 800);
      animateDisplayedTokensTo(state.tokens, { ms, dir: appliedDelta >= 0 ? 1 : -1, coinTicks: appliedDelta > 0, intensity });
    }

    state.totalSpins += 1;
    if (net > 0) state.winSpins += 1;
    else if (net < 0) state.lossSpins += 1;
    state.totalWon = clampInt(state.totalWon + Math.max(0, net), 0, 999999999);
    state.totalLost = clampInt(state.totalLost + Math.max(0, -net), 0, 999999999);
    state.bestWin = Math.max(state.bestWin, Math.max(0, net));
    state.history.push({ ts: Date.now(), bet, payout, refund: refundApplied, net, faces, headline, tier });
    state.history = state.history.slice(-28);

    if (tier === "win" || tier === "big" || tier === "mega" || tier === "jackpot") {
      state.streak += 1;
      const teaseTag = nearMissUsed && tier === "win" ? " (almost jackpot!)" : "";
      setStatus(`${headline}${teaseTag} You won +${payout} 🪙. Result: ${faces}`, "good");
      flashScreen(tier);
      document.body.classList.add(tier === "jackpot" ? "paylineJackpot" : "paylineWin");
      setTimeout(() => document.body.classList.remove("paylineWin", "paylineJackpot"), tier === "jackpot" ? 980 : 720);
      pulseBg({ moodDelta: clamp(0.28 + (bet > 0 ? payout / bet : 0) * 0.04, 0.25, 1), hueDelta: 16 + Math.random() * 34 });

      for (const r of els.reels) r.classList.add("win");
      setTimeout(() => els.reels.forEach((r) => r.classList.remove("win")), 650);

      playOutcomeSfx(tier);
      vibrate(tier === "jackpot" ? [25, 20, 35, 18, 45] : tier === "mega" ? [22, 18, 32, 16, 38] : [20, 18, 30]);

      showBigWin(tier, payout);
      celebrateWin(tier, payout, bet);
    } else if (tier === "loss") {
      state.streak = 0;
      setStatus(
        `${headline}${nearMissUsed ? " Almost a win—then the model “corrected” itself." : ""} You paid an extra ${Math.abs(payout)} 🪙. Result: ${faces}`,
        "bad",
      );
      pulseBg({ moodDelta: nearMissUsed ? -0.42 : -0.30, hueDelta: -(10 + Math.random() * 16), nearMiss: nearMissUsed });
      for (const r of els.reels) r.classList.add("lose");
      setTimeout(() => els.reels.forEach((r) => r.classList.remove("lose")), 520);
      playOutcomeSfx("loss", { nearMiss: nearMissUsed });
      vibrate([40, 30, 20]);
    } else {
      state.streak = 0;
      setStatus(`${headline}${nearMissUsed ? " Almost. The AI refused to comply." : ""} Result: ${faces}`, null);
      pulseBg({ moodDelta: nearMissUsed ? -0.26 : -0.14, hueDelta: nearMissUsed ? -(8 + Math.random() * 10) : -(4 + Math.random() * 8), nearMiss: nearMissUsed });
      playOutcomeSfx("none", { nearMiss: nearMissUsed });
      vibrate(8);
    }

    document.body.classList.remove("spinning", "anticipation");
    save();
    spinning = false;
    updateUI();

    if (state.tokens === 0) {
      setStatus("You are out of tokens. Claim the daily grant and pretend it’s “venture funding”.", "bad");
    }
  }

  function wire() {
    els.bet.addEventListener("input", () => setBetValue(els.bet.value));
    els.betNumber.addEventListener("input", () => setBetValue(els.betNumber.value));

    for (const chip of els.chips) {
      chip.addEventListener("click", () => {
        const raw = chip.getAttribute("data-bet");
        if (raw === "max") setBetValue(betMax());
        else setBetValue(raw);
        initAudio();
        void resumeAudio();
        beep({ type: "square", freq: 320, ms: 45, gain: 0.10, sweepTo: 240 });
      });
    }

    els.temp.addEventListener("input", () => updateUI());

    els.spin.addEventListener("click", () => void doSpin());

    els.auto.addEventListener("click", () => {
      if (spinning) return;
      setAuto(!state.auto);
      setStatus(state.auto ? "Auto-spin engaged. Good luck, operator." : "Auto-spin off.", null);
      initAudio();
      void resumeAudio();
      beep({ type: "square", freq: state.auto ? 330 : 220, ms: 70, gain: 0.14, sweepTo: state.auto ? 440 : 180 });
      vibrate(10);
    });

    els.claim.addEventListener("click", () => {
      initAudio();
      void resumeAudio();
      claimDaily();
    });

    els.sound.addEventListener("click", () => {
      const turningOff = state.settings.soundOn;
      initAudio();
      void resumeAudio().then(() => {
        // If turning sound off, play a tiny "power-down" before muting.
        if (turningOff) {
          beep({ type: "square", freq: 260, ms: 55, gain: 0.12, sweepTo: 140 });
          stopSpinLoop({ fadeMs: 120 });
        }
        state.settings.soundOn = !turningOff;
        syncMasterGain();
        // If turning sound on, play a tiny "power-up" after unmuting.
        if (!turningOff) {
          beep({ type: "square", freq: 360, ms: 55, gain: 0.12, sweepTo: 560 });
        }
        save();
        updateUI();
      });
    });

    els.haptics.addEventListener("change", () => {
      state.settings.haptics = Boolean(els.haptics.checked);
      save();
      updateUI();
      vibrate(12);
    });

    els.reducedFx.addEventListener("change", () => {
      state.settings.reducedFx = Boolean(els.reducedFx.checked);
      save();
      updateUI();
    });

    els.volume.addEventListener("input", () => {
      state.settings.volume = clamp(Number(els.volume.value) / 100, 0, 1);
      initAudio();
      void resumeAudio().then(() => syncMasterGain());
      save();
      updateUI();
    });

    els.speed.addEventListener("input", () => {
      state.settings.speed = clamp(Number(els.speed.value), 0.7, 1.35);
      save();
      updateUI();
      initAudio();
      void resumeAudio();
      beep({ type: "triangle", freq: 300 + state.settings.speed * 120, ms: 45, gain: 0.10, sweepTo: 220 + state.settings.speed * 140 });
    });

    els.reset.addEventListener("click", () => {
      if (!confirm("Reset tokens and power-ups? This only affects localStorage.")) return;
      state = {
        tokens: START_TOKENS,
        streak: 0,
        auto: false,
        bestWin: 0,
        totalSpins: 0,
        winSpins: 0,
        lossSpins: 0,
        totalWon: 0,
        totalLost: 0,
        history: [],
        buffs: { payoutBoostSpins: 0, refundChanceSpins: 0, bugShield: 0, luckSpins: 0, bugTaxHalfSpins: 0 },
        settings: { ...state.settings },
        lastDailyClaimISO: null,
      };
      save();
      setAuto(false);
      syncDisplayedTokensNow();
      updateUI();
      setStatus("Reset complete. Your progress has been successfully… deprecated.", null);
      initAudio();
      void resumeAudio();
      beep({ type: "square", freq: 210, ms: 70, gain: 0.12, sweepTo: 160 });
      vibrate([10, 12, 10]);
    });

    // One-time hint.
    setStatus("Tip: crank Temperature for chaos; buy a buff in the Token Shop.", null);
  }

  function start() {
    for (const r of els.reels) ensureReelSpan(r);
    load();
    syncDisplayedTokensNow();
    fx = createFx(els.fx);
    window.addEventListener("resize", () => fx && fx.resize(), { passive: true });
    syncBgVars();
    wireBackground();
    wire();
    updateUI();
    setAuto(state.auto);
    syncMasterGain();

    // Orchestrated page-load reveal
    requestAnimationFrame(() => {
      document.body.classList.remove("preload");
      document.body.classList.add("loaded");
    });
  }

  start();
})();


  const autoBtn = $("#autoBtn");
  const cashoutBtn = $("#cashoutBtn");
  const bragBtn = $("#bragBtn");
  const grantBtn = $("#grantBtn");
  const notifyBtn = $("#notifyBtn");
  const resetBtn = $("#resetBtn");

    reduceMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false,
    notify: false,
    lastCashoutAt: 0,
    lastGrantDay: "",
  };

  let spinning = false;

    const canSpin = !spinning && state.tokens >= state.spinCost;
    spinBtn.disabled = !canSpin;
    maxBtn.disabled = spinning || state.tokens < state.spinCost;
    maxBtn.disabled = spinning || state.tokens < state.spinCost * 2;
    autoBtn.disabled = spinning || state.tokens < state.spinCost;
    cashoutBtn.disabled = spinning;

    if (grantBtn) grantBtn.disabled = spinning || state.lastGrantDay === localDayKey();
  }

  function localDayKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function setReels(symbols) {
    }
  }

  function claimDailyGrant() {
    const today = localDayKey();
    if (state.lastGrantDay === today) {
      setStatus("Daily grant already claimed. Come back tomorrow and pretend this is 'sustainable'.");
      beep("loss");
      haptic([25, 40, 25]);
      return;
    }

    const base = 18;
    const auditFee = rand01() < 0.12 ? Math.max(1, Math.floor(base * 0.33)) : 0;
    const net = base - auditFee;

    state.lastGrantDay = today;
    state.tokens += net;
    state.tokens = Math.max(0, Math.floor(state.tokens));
    save();
    render();

    const msg =
      auditFee > 0
        ? `Grant approved: +${base}. Surprise "AI tax": −${auditFee}. Net: +${net}.`
        : `Grant approved: +${net} tokens. Please don't call it UBI.`;

    log(msg, "info");
    setStatus(msg);
    beep("win");
    haptic([15, 20, 15]);
    maybeNotify("Grant approved", msg);
  }

  function cashOut() {
    const cooldownMs = 6000;
    if (nowMs() - state.lastCashoutAt < cooldownMs) {
    state.spent = 0;
    state.lastResult = ["?", "?", "?"];
    state.notify = false;
    state.lastGrantDay = "";
    save();
    renderPaytable();
    setReels(state.lastResult);
    });
    cashoutBtn.addEventListener("click", cashOut);
    bragBtn.addEventListener("click", brag);
    grantBtn?.addEventListener("click", claimDailyGrant);
    notifyBtn.addEventListener("click", enableNotifications);
    resetBtn.addEventListener("click", resetSave);
  }

  init();
})();

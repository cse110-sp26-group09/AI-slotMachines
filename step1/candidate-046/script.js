    initToggles();
    initHotkeys();
    log("Booted. Tokens loaded from localStorage (or invented if missing).", "info");

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").then(
        () => log("Offline cache armed (service worker registered).", "info"),
        () => log("Service worker not registered. Offline mode unavailable.", "info"),
      );
    }
  }

  init();
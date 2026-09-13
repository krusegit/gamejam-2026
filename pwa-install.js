/**
 * PWA Install Wizard
 * Detects platform (iOS/Android/Desktop) and guides users through app installation
 */

(function () {
  "use strict";

  // Configuration
  const CONFIG = {
    showDelay: 2000, // Delay before showing prompt (ms)
    dismissStorageKey: "pwa_install_dismissed",
    installedStorageKey: "pwa_installed",
    maxDismissals: 3, // Show again after this many dismissals
    dismissalResetDays: 7, // Reset dismissal count after this many days
  };

  // Install-prompt icons, from the vendored set in lucide-icons.js. Every icon
  // sits beside its own label, so if that script is missing the dialog simply
  // renders without icons rather than showing a broken glyph.
  const Icons = {
    svg(name, className) {
      return window.LucideIcons ? window.LucideIcons.svg(name, className) : "";
    },
    hint(name) {
      const markup = this.svg(name);
      return markup ? `<span class="pwa-hint-icon">${markup}</span>` : "";
    },
  };

  // Platform detection
  const Platform = {
    isIOS() {
      return window.BroccoliPlatform ? window.BroccoliPlatform.isIOS() : false;
    },
    isIPadOS() {
      return window.BroccoliPlatform
        ? window.BroccoliPlatform.isIPadOS()
        : false;
    },
    isAndroid() {
      return window.BroccoliPlatform
        ? window.BroccoliPlatform.isAndroid()
        : /Android/i.test(navigator.userAgent);
    },
    isMobile() {
      return window.BroccoliPlatform
        ? window.BroccoliPlatform.isMobile()
        : this.isAndroid();
    },
    isStandalone() {
      return window.BroccoliPlatform
        ? window.BroccoliPlatform.isStandalone()
        : false;
    },
    isSafari() {
      return window.BroccoliPlatform
        ? window.BroccoliPlatform.isSafari()
        : false;
    },
    isChrome() {
      return (
        /Chrome/.test(navigator.userAgent) &&
        /Google Inc/.test(navigator.vendor)
      );
    },
    isFirefox() {
      return /Firefox/.test(navigator.userAgent);
    },
    isSamsung() {
      return /SamsungBrowser/.test(navigator.userAgent);
    },
    getName() {
      if (this.isIOS() || this.isIPadOS()) {
        return "ios";
      }
      if (this.isAndroid()) {
        return "android";
      }
      return "desktop";
    },
    getBrowserName() {
      if (this.isSafari()) {
        return "Safari";
      }
      if (this.isChrome()) {
        return "Chrome";
      }
      if (this.isFirefox()) {
        return "Firefox";
      }
      if (this.isSamsung()) {
        return "Samsung Internet";
      }
      return "your browser";
    },
  };

  // Storage helpers
  const Storage = {
    get(key) {
      try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
      } catch (e) {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        console.warn("[PWA] Storage unavailable");
      }
    },
  };

  // PWA Install Manager
  const PWAInstall = {
    deferredPrompt: null,
    overlay: null,

    init() {
      console.log("[PWA] Initializing install wizard...");
      console.log("[PWA] Platform:", Platform.getName());
      console.log("[PWA] Standalone:", Platform.isStandalone());
      console.log("[PWA] Browser:", Platform.getBrowserName());

      // If already running as PWA, don't show anything
      if (Platform.isStandalone()) {
        console.log(
          "[PWA] Running in standalone mode - skipping install prompt",
        );
        Storage.set(CONFIG.installedStorageKey, true);
        return;
      }

      // Listen for the beforeinstallprompt event (Chrome/Edge/Samsung)
      window.addEventListener("beforeinstallprompt", (e) => {
        console.log("[PWA] beforeinstallprompt event fired");
        e.preventDefault();
        this.deferredPrompt = e;
        // The game's Install App button opens the wizard on demand.
      });

      // Listen for successful installation
      window.addEventListener("appinstalled", () => {
        console.log("[PWA] App was installed");
        Storage.set(CONFIG.installedStorageKey, true);
        this.hideOverlay();
        this.deferredPrompt = null;
      });

      // Keep first-load gameplay visible, including on small landscape screens.
      // Manual iOS instructions remain available from the Install App button.
    },

    shouldShowPrompt() {
      // Already installed
      if (Storage.get(CONFIG.installedStorageKey)) {
        return false;
      }

      // Check dismissal data
      const dismissData = Storage.get(CONFIG.dismissStorageKey);
      if (dismissData) {
        const daysSinceDismissal =
          (Date.now() - dismissData.timestamp) / (1000 * 60 * 60 * 24);

        // Reset if enough time has passed
        if (daysSinceDismissal > CONFIG.dismissalResetDays) {
          Storage.set(CONFIG.dismissStorageKey, null);
          return true;
        }

        // Don't show if dismissed too many times recently
        if (dismissData.count >= CONFIG.maxDismissals) {
          return false;
        }
      }

      return true;
    },

    showInstallUI() {
      if (!this.shouldShowPrompt()) {
        console.log("[PWA] Prompt suppressed due to previous dismissals");
        return;
      }

      console.log("[PWA] Showing install UI");
      this.createOverlay();

      setTimeout(() => {
        if (this.overlay) {
          this.overlay.classList.add("active");
        }
      }, 100);
    },

    createOverlay() {
      if (this.overlay) {
        document.body.removeChild(this.overlay);
      }

      const platform = Platform.getName();
      const html = this.getDialogHTML(platform);

      this.overlay = document.createElement("div");
      this.overlay.className = "pwa-overlay";
      this.overlay.innerHTML = html;
      document.body.appendChild(this.overlay);

      // Bind events
      this.bindEvents();
    },

    getDialogHTML(platform) {
      const appName =
        document.title.replace(" - Unity WebGL Player", "").trim() || "Game";

      let instructionsHTML = "";
      let primaryButtonHTML = "";

      if (platform === "ios") {
        instructionsHTML = this.getIOSInstructions();
        primaryButtonHTML = `
          <button class="pwa-btn pwa-btn-secondary" onclick="PWAInstall.dismiss()">
            Got it, I'll add it later
          </button>
        `;
      } else if (platform === "android" && this.deferredPrompt) {
        instructionsHTML = this.getAndroidNativeInstructions();
        primaryButtonHTML = `
          <button class="pwa-btn pwa-btn-primary" onclick="PWAInstall.triggerInstall()">
            ${Icons.svg("download")} Install App
          </button>
          <button class="pwa-btn pwa-btn-secondary" onclick="PWAInstall.dismiss()">
            Maybe Later
          </button>
        `;
      } else if (platform === "android") {
        instructionsHTML = this.getAndroidManualInstructions();
        primaryButtonHTML = `
          <button class="pwa-btn pwa-btn-secondary" onclick="PWAInstall.dismiss()">
            Got it, I'll add it later
          </button>
        `;
      } else if (this.deferredPrompt) {
        // Desktop with install prompt available
        instructionsHTML = this.getDesktopInstructions();
        primaryButtonHTML = `
          <button class="pwa-btn pwa-btn-primary" onclick="PWAInstall.triggerInstall()">
            ${Icons.svg("download")} Install App
          </button>
          <button class="pwa-btn pwa-btn-secondary" onclick="PWAInstall.dismiss()">
            Continue in Browser
          </button>
        `;
      } else {
        // Desktop without install prompt
        instructionsHTML = `
          <div class="pwa-fullscreen-hint">
            ${Icons.hint("lightbulb")} Tip: Press <strong>F11</strong> for fullscreen mode
          </div>
        `;
        primaryButtonHTML = `
          <button class="pwa-btn pwa-btn-primary" onclick="PWAInstall.requestFullscreen()">
            ${Icons.svg("maximize")} Enter Fullscreen
          </button>
          <button class="pwa-btn pwa-btn-secondary" onclick="PWAInstall.dismiss()">
            Continue
          </button>
        `;
      }

      return `
        <div class="pwa-dialog">
          <div class="pwa-header">
            <img src="icons/icon-192x192.png" alt="${appName}" class="pwa-icon" onerror="this.style.display='none'">
            <h2 class="pwa-title">${appName}</h2>
            <p class="pwa-subtitle">Install for the best experience</p>
          </div>

          <div class="pwa-benefits">
            <div class="pwa-benefit">
              <div class="pwa-benefit-icon">${Icons.svg("monitor")}</div>
              <span>Full screen gameplay without browser UI</span>
            </div>
            <div class="pwa-benefit">
              <div class="pwa-benefit-icon">${Icons.svg("zap")}</div>
              <span>Launch instantly from your home screen</span>
            </div>
            <div class="pwa-benefit">
              <div class="pwa-benefit-icon">${Icons.svg("wifi-off")}</div>
              <span>Play offline after first load</span>
            </div>
          </div>

          ${instructionsHTML}

          <div class="pwa-buttons">
            ${primaryButtonHTML}
            <button class="pwa-btn pwa-btn-text" onclick="PWAInstall.dismissPermanently()">
              Don't show this again
            </button>
          </div>
        </div>
      `;
    },

    getIOSInstructions() {
      return `
        <div class="pwa-instructions">
          <h3 class="pwa-instructions-title">
            ${Icons.svg("smartphone", "platform-icon")} Add to Home Screen
          </h3>
          <div class="pwa-step">
            <div class="pwa-step-number">1</div>
            <div class="pwa-step-text">
              Tap the <span class="pwa-step-highlight">Share</span> button 
              <span class="ios-share-icon"></span> at the bottom of Safari
            </div>
          </div>
          <div class="pwa-step">
            <div class="pwa-step-number">2</div>
            <div class="pwa-step-text">
              Scroll down and tap <span class="pwa-step-highlight">Add to Home Screen</span>
            </div>
          </div>
          <div class="pwa-step">
            <div class="pwa-step-number">3</div>
            <div class="pwa-step-text">
              Tap <span class="pwa-step-highlight">Add</span> in the top right corner
            </div>
          </div>
        </div>
      `;
    },

    getAndroidNativeInstructions() {
      return `
        <div class="pwa-fullscreen-hint">
          ${Icons.hint("sparkles")} Tap "Install App" to add this game to your home screen for a fullscreen experience!
        </div>
      `;
    },

    getAndroidManualInstructions() {
      const browser = Platform.getBrowserName();
      return `
        <div class="pwa-instructions">
          <h3 class="pwa-instructions-title">
            ${Icons.svg("smartphone", "platform-icon")} Add to Home Screen
          </h3>
          <div class="pwa-step">
            <div class="pwa-step-number">1</div>
            <div class="pwa-step-text">
              Tap the <span class="pwa-step-highlight">menu</span> button (⋮) in ${browser}
            </div>
          </div>
          <div class="pwa-step">
            <div class="pwa-step-number">2</div>
            <div class="pwa-step-text">
              Tap <span class="pwa-step-highlight">Add to Home screen</span> or <span class="pwa-step-highlight">Install app</span>
            </div>
          </div>
          <div class="pwa-step">
            <div class="pwa-step-number">3</div>
            <div class="pwa-step-text">
              Confirm by tapping <span class="pwa-step-highlight">Add</span>
            </div>
          </div>
        </div>
      `;
    },

    getDesktopInstructions() {
      return `
        <div class="pwa-fullscreen-hint">
          ${Icons.hint("sparkles")} Install as an app for a native fullscreen gaming experience!
        </div>
      `;
    },

    async triggerInstall() {
      if (!this.deferredPrompt) {
        console.warn("[PWA] No install prompt available");
        return;
      }

      console.log("[PWA] Triggering install prompt");
      this.deferredPrompt.prompt();

      const { outcome } = await this.deferredPrompt.userChoice;
      console.log("[PWA] User choice:", outcome);

      if (outcome === "accepted") {
        Storage.set(CONFIG.installedStorageKey, true);
      }

      this.deferredPrompt = null;
      this.hideOverlay();
    },

    requestFullscreen() {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        elem.requestFullscreen();
      } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
      } else if (elem.msRequestFullscreen) {
        elem.msRequestFullscreen();
      }
      this.hideOverlay();
    },

    dismiss() {
      console.log("[PWA] User dismissed prompt");

      const dismissData = Storage.get(CONFIG.dismissStorageKey) || { count: 0 };
      dismissData.count++;
      dismissData.timestamp = Date.now();
      Storage.set(CONFIG.dismissStorageKey, dismissData);

      this.hideOverlay();
    },

    dismissPermanently() {
      console.log("[PWA] User permanently dismissed prompt");
      Storage.set(CONFIG.dismissStorageKey, {
        count: CONFIG.maxDismissals + 1,
        timestamp: Date.now(),
      });
      this.hideOverlay();
    },

    hideOverlay() {
      if (this.overlay) {
        this.overlay.classList.add("dismissing");
        setTimeout(() => {
          if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
            this.overlay = null;
          }
        }, 300);
      }
    },

    bindEvents() {
      // Close on backdrop click
      if (this.overlay) {
        this.overlay.addEventListener("click", (e) => {
          if (e.target === this.overlay) {
            this.dismiss();
          }
        });
      }

      // Close on escape key
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.overlay) {
          this.dismiss();
        }
      });
    },

    // Public method to manually show the install prompt (can be called from game)
    show() {
      // Reset dismissal to allow showing
      Storage.set(CONFIG.dismissStorageKey, null);
      this.showInstallUI();
    },
  };

  // Make PWAInstall globally accessible
  window.PWAInstall = PWAInstall;

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => PWAInstall.init());
  } else {
    PWAInstall.init();
  }
})();

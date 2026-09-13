(function (root) {
  "use strict";

  function getEnvironment() {
    return {
      navigator: root.navigator || {},
      window: root,
      document: root.document || {},
    };
  }

  function detect(environment) {
    var env = environment || getEnvironment();
    var nav = env.navigator || {};
    var win = env.window || {};
    var doc = env.document || {};
    var userAgent = nav.userAgent || nav.vendor || "";
    var platform = nav.platform || "";
    var maxTouchPoints = Number(nav.maxTouchPoints || 0);
    var hasTouch = "ontouchstart" in win || maxTouchPoints > 0;
    var isIOSUserAgent = /iPad|iPhone|iPod/i.test(userAgent);

    // iPadOS can request desktop sites and report MacIntel. A real iPad still
    // includes Apple's Mobile token; desktop Safari does not. Requiring both
    // prevents a touch-capable Mac from being downgraded to the iOS profile.
    var isIPadOS =
      platform === "MacIntel" &&
      maxTouchPoints > 1 &&
      /AppleWebKit/i.test(userAgent) &&
      /Mobile\//i.test(userAgent);
    var isAppleMobile = isIOSUserAgent || isIPadOS;
    var browserDevicePixelRatio = Number(win.devicePixelRatio || 1);
    if (
      !Number.isFinite(browserDevicePixelRatio) ||
      browserDevicePixelRatio <= 0
    ) {
      browserDevicePixelRatio = 1;
    }
    // A 1x drawing buffer is visibly blurry on Retina iPhones and iPads because
    // Safari stretches it across several physical pixels. Cap Apple mobile at
    // 2x for crisp UI and world rendering without paying the 9x pixel cost of a
    // full 3x iPhone framebuffer. Keeping this policy here also prevents a
    // touch-capable Mac from accidentally receiving the mobile cap.
    var unityDevicePixelRatio = isAppleMobile
      ? Math.min(browserDevicePixelRatio, 2)
      : browserDevicePixelRatio;
    var isAndroid = /Android/i.test(userAgent);
    var isOtherMobile = /webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    // A narrow window or a touch-capable laptop still uses desktop controls.
    var isMobile = isAppleMobile || isAndroid || isOtherMobile;
    var isSafari =
      /Safari/i.test(userAgent) &&
      !/Chrome|Chromium|CriOS|Android|Edg|OPR|Firefox|FxiOS/i.test(userAgent);
    var displayModeStandalone = false;

    try {
      displayModeStandalone =
        (typeof win.matchMedia === "function" &&
          (win.matchMedia("(display-mode: standalone)").matches ||
            win.matchMedia("(display-mode: fullscreen)").matches)) ||
        nav.standalone === true ||
        String(doc.referrer || "").indexOf("android-app://") === 0;
    } catch (error) {
      displayModeStandalone = false;
    }

    return {
      userAgent,
      platform,
      maxTouchPoints,
      hasTouch,
      isIOS: isIOSUserAgent,
      isIPadOS,
      isAppleMobile,
      unityDevicePixelRatio,
      isAndroid,
      isMobile,
      isSafari,
      isStandalone: displayModeStandalone,
    };
  }

  function current() {
    return detect(getEnvironment());
  }

  var api = {
    detect,
    current,
    isIOS() {
      return current().isIOS;
    },
    isIPadOS() {
      return current().isIPadOS;
    },
    isAppleMobile() {
      return current().isAppleMobile;
    },
    isAndroid() {
      return current().isAndroid;
    },
    isMobile() {
      return current().isMobile;
    },
    isStandalone() {
      return current().isStandalone;
    },
    isSafari() {
      return current().isSafari;
    },
    shouldUseIOSOptimizations() {
      return current().isAppleMobile;
    },
  };

  root.BroccoliPlatform = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

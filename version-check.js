/**
 * Version Check System for PWA Updates
 *
 * This module checks for new versions of the game before loading.
 * It compares a local cached version ID with the remote version on GitHub Pages,
 * and forces a cache refresh if they don't match.
 *
 * CRITICAL: This module is designed to NEVER block game loading.
 * All errors are caught and logged - the game will always attempt to start.
 */

const VersionChecker = (function () {
  "use strict";

  // Detect if we're on a staging path or the production build (root)
  function detectBuildPath() {
    try {
      const base = new URL("./", window.location.href);
      const isLocal = ["localhost", "127.0.0.1", "::1"].includes(base.hostname);
      return {
        isLocal,
        isStaging: /\/(?:BranchStaging|BranchMain)(?:\/|$)/.test(base.pathname),
        basePath: base.pathname,
        versionUrl: new URL("version.json", base).href,
        cachePrefix: isLocal ? "local" : encodeURIComponent(base.pathname),
      };
    } catch (err) {
      console.warn("[VersionCheck] detectBuildPath error:", err);
      return {
        isLocal: false,
        isStaging: false,
        basePath: "./",
        versionUrl: "version.json",
        cachePrefix: "release",
      };
    }
  }

  const BUILD_INFO = detectBuildPath();

  // Configuration
  const CONFIG = {
    // Remote URL to check for version (GitHub Pages) - dynamically set based on build
    remoteVersionUrl: BUILD_INFO.versionUrl,
    // Local storage key for cached version - separate for production vs staging
    localVersionKey: `brocoli_cached_version_${BUILD_INFO.cachePrefix}`,
    // Cache name used by service worker (must match sw.js)
    cacheVersion: "v6",
    cacheName: `unity-game-cache-v6-${BUILD_INFO.cachePrefix}`,
    cachePrefix: "unity-game-cache-",
    // Timeout for version check (ms)
    checkTimeout: 5000,
    // Enable debug logging
    debug: true,
    // Build info for reference
    buildInfo: BUILD_INFO,
  };

  function log(...args) {
    if (CONFIG.debug) {
      console.log(
        "[VersionCheck]",
        `[${CONFIG.buildInfo.isStaging ? "STAGING" : "PRODUCTION"}]`,
        ...args,
      );
    }
  }

  function warn(...args) {
    console.warn("[VersionCheck]", ...args);
  }

  /**
   * Fetches the remote version.json with cache-busting
   */
  async function fetchRemoteVersion() {
    const cacheBuster = Date.now();
    const url = `${CONFIG.remoteVersionUrl}?_=${cacheBuster}`;

    log("Fetching remote version from:", url);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.checkTimeout);

    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store", // Bypass browser cache
        signal: controller.signal,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const version = await response.json();

      // Check if this is an offline fallback response from service worker
      if (version && version.offline === true) {
        log("Received offline fallback from service worker");
        return null; // Treat as if we couldn't fetch (offline mode)
      }

      log("Remote version:", version);
      return version;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        warn("Version check timed out");
      } else {
        warn("Failed to fetch remote version:", err.message);
      }
      return null;
    }
  }

  /**
   * Gets the locally cached version info
   */
  function getLocalVersion() {
    try {
      const stored = localStorage.getItem(CONFIG.localVersionKey);
      if (stored) {
        const version = JSON.parse(stored);
        log("Local cached version:", version);
        return version;
      }
    } catch (err) {
      warn("Failed to read local version:", err);
    }
    log("No local version cached");
    return null;
  }

  /**
   * Saves the version info locally
   */
  function saveLocalVersion(version) {
    try {
      localStorage.setItem(CONFIG.localVersionKey, JSON.stringify(version));
      log("Saved local version:", version);
    } catch (err) {
      warn("Failed to save local version:", err);
    }
  }

  /**
   * Clears all service worker caches
   * Always returns gracefully - never throws
   */
  async function clearAllCaches() {
    log("Clearing game caches for this build channel...");

    try {
      if (typeof caches === "undefined") {
        log("Cache API not available");
        return false;
      }
      const cacheNames = await caches.keys();
      log("Found caches:", cacheNames);

      const buildSuffix = `-${CONFIG.buildInfo.cachePrefix}`;
      const matchingCaches = cacheNames.filter(
        (name) =>
          name.startsWith(CONFIG.cachePrefix) && name.endsWith(buildSuffix),
      );

      await Promise.all(
        matchingCaches.map((name) => {
          try {
            log("Deleting cache:", name);
            return caches.delete(name);
          } catch (e) {
            warn("Failed to delete cache:", name, e);
            return Promise.resolve();
          }
        }),
      );

      log("Build-channel caches cleared");
      return true;
    } catch (err) {
      warn("Failed to clear caches (non-blocking):", err);
      return false;
    }
  }

  /**
   * Requests a fresh service worker without leaving the page uncontrolled.
   * Always returns gracefully - never throws
   */
  async function refreshServiceWorker() {
    try {
      if (!("serviceWorker" in navigator)) {
        return false;
      }

      log("Checking service worker for updates...");

      const registrations = await navigator.serviceWorker.getRegistrations();

      for (const registration of registrations) {
        try {
          if (!window.location.href.startsWith(registration.scope)) {
            continue;
          }
          log("Updating service worker:", registration.scope);
          await registration.update();
          if (registration.waiting) {
            registration.waiting.postMessage({ type: "SKIP_WAITING" });
          }
        } catch (e) {
          warn("Failed to update SW (non-blocking):", e);
        }
      }

      log("Service worker update check complete");
      return true;
    } catch (err) {
      warn("Failed to refresh service worker (non-blocking):", err);
      return false;
    }
  }

  /**
   * Compares two version objects
   * Returns true if they are different (update needed)
   */
  function versionsAreDifferent(local, remote) {
    if (!local || !remote) {
      return false; // Can't compare, assume no update needed
    }

    // Primary comparison: buildId
    if (local.buildId !== remote.buildId) {
      log(`Build ID changed: ${local.buildId} -> ${remote.buildId}`);
      return true;
    }

    // Secondary comparison: buildNumber (if available)
    if (local.buildNumber !== undefined && remote.buildNumber !== undefined) {
      if (local.buildNumber !== remote.buildNumber) {
        log(
          `Build number changed: ${local.buildNumber} -> ${remote.buildNumber}`,
        );
        return true;
      }
    }

    // Tertiary comparison: buildTimestamp (if available)
    if (local.buildTimestamp && remote.buildTimestamp) {
      if (local.buildTimestamp !== remote.buildTimestamp) {
        log(
          `Build timestamp changed: ${local.buildTimestamp} -> ${remote.buildTimestamp}`,
        );
        return true;
      }
    }

    log("Versions match, no update needed");
    return false;
  }

  /**
   * Updates the loading screen with a message
   */
  function updateLoadingMessage(message, isError = false) {
    const loadingText = document.querySelector(".loading-text");
    if (loadingText) {
      loadingText.textContent = message;
      if (isError) {
        loadingText.style.color = "#ff6b6b";
      }
    }
  }

  /**
   * Main function: Check for updates and handle accordingly
   * Returns a promise that resolves when it's safe to start the game
   * NEVER throws - always allows the game to start (offline-first PWA)
   */
  async function checkForUpdates() {
    log("Starting version check...");

    try {
      if (CONFIG.buildInfo.isLocal) {
        log("Local build, skipping hosted version check");
        updateLoadingMessage("Loading game...");
        return { updated: false, reason: "local" };
      }

      // Check if we're offline first - skip version check entirely
      if (!navigator.onLine) {
        log("Device is offline, skipping version check - using cached game");
        updateLoadingMessage("Loading cached game...");
        return { updated: false, reason: "offline" };
      }

      updateLoadingMessage("Checking for updates...");

      // Get local and remote versions in parallel
      const localVersion = getLocalVersion();
      let remoteVersion = null;

      try {
        remoteVersion = await fetchRemoteVersion();
      } catch (fetchErr) {
        log(
          "Version fetch failed, continuing with cached game:",
          fetchErr.message,
        );
      }

      // If we couldn't fetch remote version, continue with cached version (offline-friendly)
      if (!remoteVersion) {
        log("Could not fetch remote version, continuing with cached game");
        updateLoadingMessage("Loading game...");
        return { updated: false, reason: "fetch-failed" };
      }

      // If no local version, this is a fresh install - just save and continue
      if (!localVersion) {
        log("Fresh install, saving version and continuing");
        saveLocalVersion(remoteVersion);
        updateLoadingMessage("Loading game...");
        return { updated: false, reason: "fresh-install" };
      }

      // Compare versions
      if (versionsAreDifferent(localVersion, remoteVersion)) {
        log("Update detected! Clearing caches and reloading...");
        updateLoadingMessage("New version found! Updating...");

        // Clear all caches
        await clearAllCaches();

        // Refresh service worker
        await refreshServiceWorker();

        // Save the new version before reloading
        saveLocalVersion(remoteVersion);

        // Give a moment for the UI to update
        await new Promise((resolve) => {
          setTimeout(resolve, 500);
        });

        updateLoadingMessage("Reloading with new version...");

        // Small delay to show the message
        await new Promise((resolve) => {
          setTimeout(resolve, 500);
        });

        // Hard reload the page to get fresh content
        log("Reloading page...");
        window.location.reload(true);

        // Return a promise that never resolves (page will reload)
        return new Promise(() => {});
      }

      // Versions match, continue normally
      log("Version is up to date");
      updateLoadingMessage("Loading game...");
      return { updated: false, reason: "up-to-date" };
    } catch (err) {
      // NEVER block game start due to version check errors
      warn(
        "Version check encountered an error, continuing anyway:",
        err.message,
      );
      updateLoadingMessage("Loading game...");
      return { updated: false, reason: "error", error: err.message };
    }
  }

  /**
   * Force clear cache and reload (can be called manually)
   * Always attempts reload even if clearing fails
   */
  async function forceUpdate() {
    try {
      log("Forcing update...");
      updateLoadingMessage("Forcing update...");

      // Clear local version to force re-download
      try {
        localStorage.removeItem(CONFIG.localVersionKey);
      } catch (e) {
        /* ignore */
      }

      // Clear all caches (non-blocking)
      await clearAllCaches();

      // Refresh service worker (non-blocking)
      await refreshServiceWorker();
    } catch (err) {
      warn("forceUpdate had errors (proceeding with reload):", err);
    }

    // Always reload regardless of errors
    window.location.reload(true);
  }

  // Expose public API
  return {
    checkForUpdates,
    forceUpdate,
    getLocalVersion,
    clearAllCaches,
    CONFIG,
  };
})();

// Make it available globally with a fallback that never blocks game loading
try {
  window.VersionChecker = VersionChecker;
} catch (e) {
  console.warn("[VersionCheck] Failed to initialize, creating no-op fallback");
  window.VersionChecker = {
    checkForUpdates() {
      return Promise.resolve({ updated: false, reason: "init-failed" });
    },
    forceUpdate() {
      window.location.reload(true);
    },
    getLocalVersion() {
      return null;
    },
    clearAllCaches() {
      return Promise.resolve(false);
    },
    CONFIG: {},
  };
}

/**
 * Retell Voice Agent — Embeddable Widget (self-contained)
 *
 * Usage — just two lines, no extra script tags needed:
 *   <script src="retell-widget.js"></script>
 *   <script>
 *     RetellWidget.init({ agentId: "agent_xxx", useNetlify: true });
 *   </script>
 */

// ── Dynamic SDK loader ───────────────────────────────────────────────
// Loads eventemitter3 → livekit-client → retell SDK, then boots widget
(function () {
  var scripts = [
    "https://unpkg.com/eventemitter3@5.0.4/dist/eventemitter3.umd.js",
    "https://unpkg.com/livekit-client@2.18.1/dist/livekit-client.umd.js",
  ];
  var retellSrc = "https://unpkg.com/retell-client-js-sdk@2.0.7/dist/index.umd.js";

  var loaded = 0;

  function loadScript(src, onload) {
    var s = document.createElement("script");
    s.src = src;
    s.onload = onload;
    s.onerror = function () {
      console.error("[RetellWidget] Failed to load: " + src);
    };
    document.head.appendChild(s);
  }

  function onDepLoaded() {
    loaded++;
    if (loaded < scripts.length) return;

    // Shim globals: the Retell UMD expects lowercase names
    window.eventemitter3 = window.EventEmitter3;
    window.livekitClient = window.LivekitClient;

    // Now load Retell SDK itself
    loadScript(retellSrc, function () {
      // Wait for both SDK and DOM to be ready
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
          initWidget();
        });
      } else {
        initWidget();
      }
    });
  }

  // Load both deps in parallel
  for (var i = 0; i < scripts.length; i++) {
    loadScript(scripts[i], onDepLoaded);
  }
})();

// ── Widget core (runs after SDK is ready) ────────────────────────────
function initWidget() {
  "use strict";

  // ── State ──────────────────────────────────────────────────────────
  var retellClient = null;
  var isCallActive = false;
  var isConnecting = false;
  var config = {};

  // ── Inline styles (all !important to survive host CSS) ──────────
  var FAB_BASE_STYLE = 'position:fixed !important; bottom:24px !important; right:24px !important; ' +
    'z-index:2147483647 !important; width:60px !important; height:60px !important; ' +
    'border-radius:50% !important; background:#6C63FF !important; border:none !important; ' +
    'cursor:pointer !important; display:flex !important; align-items:center !important; ' +
    'justify-content:center !important; color:#fff !important; ' +
    'box-shadow:0 4px 14px rgba(108,99,255,0.4) !important; ' +
    'transition:background 0.2s,transform 0.15s,box-shadow 0.2s !important; ' +
    'padding:0 !important; margin:0 !important; opacity:1 !important; ' +
    'visibility:visible !important; pointer-events:auto !important;';

  var STATUS_BASE_STYLE = 'position:fixed !important; bottom:92px !important; right:24px !important; ' +
    'z-index:2147483647 !important; background:#1F2937 !important; color:#fff !important; ' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif !important; ' +
    'font-size:13px !important; padding:8px 14px !important; border-radius:8px !important; ' +
    'box-shadow:0 2px 10px rgba(0,0,0,0.15) !important; ' +
    'opacity:0 !important; transform:translateY(6px) !important; ' +
    'transition:opacity 0.25s,transform 0.25s !important; pointer-events:none !important;';

  // Keyframes still need a <style> tag — inject minimal one
  function injectKeyframes() {
    var style = document.createElement("style");
    style.textContent =
      "@keyframes retell-pulse{0%{transform:scale(1);opacity:.6}100%{transform:scale(1.6);opacity:0}}" +
      "@keyframes retell-spin{to{transform:rotate(360deg)}}";
    document.head.appendChild(style);
  }

  // ── DOM ────────────────────────────────────────────────────────────
  var fabEl, statusEl;

  function createDOM() {
    injectKeyframes();

    fabEl = document.createElement("button");
    fabEl.id = "retell-widget-fab";
    fabEl.title = "Start voice call";
    fabEl.style.cssText = FAB_BASE_STYLE;
    fabEl.innerHTML = micIcon();
    fabEl.addEventListener("click", handleFabClick);
    document.body.appendChild(fabEl);

    statusEl = document.createElement("div");
    statusEl.id = "retell-widget-status";
    statusEl.style.cssText = STATUS_BASE_STYLE;
    document.body.appendChild(statusEl);
  }

  // ── Icons (inline SVG) ────────────────────────────────────────────
  function micIcon() {
    return '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="9" y="1" width="6" height="12" rx="3"/>' +
      '<path d="M19 10v2a7 7 0 0 1-14 0v-2"/>' +
      '<line x1="12" y1="19" x2="12" y2="23"/>' +
      '<line x1="8" y1="23" x2="16" y2="23"/>' +
      '</svg>';
  }

  function phoneOffIcon() {
    return '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="1" y1="1" x2="23" y2="23"/>' +
      '<path d="M16.5 16.5C14.8 18.1 12.5 19 10 19a9.96 9.96 0 0 1-6.5-2.4"/>' +
      '<path d="M8.6 8.6A4 4 0 0 0 12 16a4 4 0 0 0 3.4-6.4"/>' +
      '<rect x="9" y="1" width="6" height="12" rx="3"/>' +
      '</svg>';
  }

  function spinnerIcon() {
    return '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">' +
      '<path d="M12 2a10 10 0 0 1 10 10" style="animation:retell-spin .7s linear infinite;transform-origin:center">' +
      '</path>' +
      '<style>@keyframes retell-spin{to{transform:rotate(360deg)}}</style>' +
      '</svg>';
  }

  // ── Status helpers ─────────────────────────────────────────────────
  function showStatus(text, duration) {
    statusEl.textContent = text;
    statusEl.style.opacity = "1";
    statusEl.style.transform = "translateY(0)";
    if (duration) {
      setTimeout(function () { hideStatus(); }, duration);
    }
  }

  function hideStatus() {
    statusEl.style.opacity = "0";
    statusEl.style.transform = "translateY(6px)";
  }

  function setFabState(state) {
    if (state === "active") {
      fabEl.style.cssText = FAB_BASE_STYLE +
        'background:#DC2626 !important; box-shadow:0 4px 14px rgba(220,38,38,0.4) !important;';
      fabEl.innerHTML = phoneOffIcon();
      fabEl.title = "End call";
    } else if (state === "connecting") {
      fabEl.style.cssText = FAB_BASE_STYLE +
        'background:#F59E0B !important; box-shadow:0 4px 14px rgba(245,158,11,0.4) !important; pointer-events:none !important;';
      fabEl.innerHTML = spinnerIcon();
      fabEl.title = "Connecting\u2026";
    } else {
      fabEl.style.cssText = FAB_BASE_STYLE;
      fabEl.innerHTML = micIcon();
      fabEl.title = "Start voice call";
    }
  }

  // ── Call lifecycle ─────────────────────────────────────────────────
  function startCall() {
    if (isCallActive || isConnecting) return;
    isConnecting = true;
    setFabState("connecting");
    showStatus("Connecting\u2026");

    var endpoint = config.useNetlify
      ? (config.serverUrl || "") + "/.netlify/functions/create-web-call"
      : config.serverUrl + "/api/create-web-call";

    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: config.agentId }),
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            throw new Error(body.error || "Server returned " + res.status);
          });
        }
        return res.json();
      })
      .then(function (data) {
        retellClient = new retellClientJsSdk.RetellWebClient();

        retellClient.on("call_started", function () {
          isCallActive = true;
          isConnecting = false;
          setFabState("active");
          showStatus("Call started \u2014 speak now", 3000);
        });

        retellClient.on("call_ended", function () {
          cleanupCall();
          showStatus("Call ended", 2500);
        });

        retellClient.on("error", function (error) {
          console.error("[RetellWidget] error:", error);
          cleanupCall();
          showStatus("Call error \u2014 try again", 3000);
        });

        retellClient.on("agent_start_talking", function () {
          showStatus("Agent is speaking\u2026");
        });

        retellClient.on("agent_stop_talking", function () {
          hideStatus();
        });

        return retellClient.startCall({
          accessToken: data.access_token,
          sampleRate: 24000,
        });
      })
      .catch(function (err) {
        console.error("[RetellWidget] Failed to start call:", err);
        isConnecting = false;
        setFabState("idle");
        showStatus("Failed to connect \u2014 " + err.message, 4000);
      });
  }

  function stopCall() {
    if (retellClient) {
      retellClient.stopCall();
    }
    cleanupCall();
    showStatus("Call ended", 2500);
  }

  function cleanupCall() {
    isCallActive = false;
    isConnecting = false;
    retellClient = null;
    setFabState("idle");
  }

  function handleFabClick() {
    if (isCallActive) {
      stopCall();
    } else {
      startCall();
    }
  }

  // ── Public API ─────────────────────────────────────────────────────
  window.RetellWidget = {
    init: function (opts) {
      if (!opts.agentId) {
        console.error("[RetellWidget] agentId is required");
        return;
      }
      if (!opts.useNetlify && !opts.serverUrl) {
        console.error("[RetellWidget] serverUrl is required when useNetlify is false");
        return;
      }
      config = opts;
      createDOM();
    },
    start: startCall,
    stop: stopCall,
  };

  // Check for queued config — use setTimeout to let inline scripts run first
  setTimeout(function () {
    if (window._retellWidgetPendingOpts) {
      window.RetellWidget.init(window._retellWidgetPendingOpts);
      delete window._retellWidgetPendingOpts;
    }
  }, 0);
}

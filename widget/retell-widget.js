/**
 * Retell Voice Agent — Embeddable Widget
 *
 * Usage:
 *   <script src="https://cdn.jsdelivr.net/npm/retell-client-js-sdk@2/dist/index.umd.min.js"></script>
 *   <script src="retell-widget.js"></script>
 *   <script>
 *     RetellWidget.init({ serverUrl: "https://your-server.com", agentId: "agent_xxx" });
 *   </script>
 */
(function () {
  "use strict";

  // ── State ──────────────────────────────────────────────────────────
  let retellClient = null;
  let isCallActive = false;
  let isConnecting = false;
  let config = {};

  // ── DOM ────────────────────────────────────────────────────────────
  function injectStyles() {
    const css = `
      #retell-widget-fab {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        background: #4F46E5;
        color: #fff;
        box-shadow: 0 4px 14px rgba(79,70,229,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
        z-index: 99999;
      }
      #retell-widget-fab:hover {
        transform: scale(1.08);
        box-shadow: 0 6px 20px rgba(79,70,229,0.5);
      }
      #retell-widget-fab.active {
        background: #DC2626;
        box-shadow: 0 4px 14px rgba(220,38,38,0.4);
      }
      #retell-widget-fab.active:hover {
        box-shadow: 0 6px 20px rgba(220,38,38,0.5);
      }
      #retell-widget-fab.connecting {
        background: #F59E0B;
        box-shadow: 0 4px 14px rgba(245,158,11,0.4);
        pointer-events: none;
      }

      /* Pulse ring while call is active */
      #retell-widget-fab.active::after {
        content: '';
        position: absolute;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        border: 3px solid #DC2626;
        animation: retell-pulse 1.5s ease-out infinite;
      }
      @keyframes retell-pulse {
        0%   { transform: scale(1);   opacity: 0.6; }
        100% { transform: scale(1.6); opacity: 0; }
      }

      /* Status badge */
      #retell-widget-status {
        position: fixed;
        bottom: 92px;
        right: 24px;
        background: #1F2937;
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        padding: 8px 14px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.15);
        z-index: 99999;
        opacity: 0;
        transform: translateY(6px);
        transition: opacity 0.25s, transform 0.25s;
        pointer-events: none;
      }
      #retell-widget-status.visible {
        opacity: 1;
        transform: translateY(0);
      }
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function createDOM() {
    // Floating action button
    const fab = document.createElement("button");
    fab.id = "retell-widget-fab";
    fab.title = "Start voice call";
    fab.innerHTML = micIcon();
    fab.addEventListener("click", handleFabClick);
    document.body.appendChild(fab);

    // Status label
    const status = document.createElement("div");
    status.id = "retell-widget-status";
    document.body.appendChild(status);
  }

  // ── Icons (inline SVG) ────────────────────────────────────────────
  function micIcon() {
    return `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="1" width="6" height="12" rx="3"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>`;
  }

  function phoneOffIcon() {
    return `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M16.5 16.5C14.8 18.1 12.5 19 10 19a9.96 9.96 0 0 1-6.5-2.4"/>
      <path d="M8.6 8.6A4 4 0 0 0 12 16a4 4 0 0 0 3.4-6.4"/>
      <rect x="9" y="1" width="6" height="12" rx="3"/>
    </svg>`;
  }

  function spinnerIcon() {
    return `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <path d="M12 2a10 10 0 0 1 10 10" style="animation:retell-spin .7s linear infinite;transform-origin:center">
      </path>
      <style>@keyframes retell-spin{to{transform:rotate(360deg)}}</style>
    </svg>`;
  }

  // ── Status helpers ─────────────────────────────────────────────────
  function showStatus(text, duration) {
    const el = document.getElementById("retell-widget-status");
    el.textContent = text;
    el.classList.add("visible");
    if (duration) {
      setTimeout(() => el.classList.remove("visible"), duration);
    }
  }

  function hideStatus() {
    document.getElementById("retell-widget-status").classList.remove("visible");
  }

  function setFabState(state) {
    const fab = document.getElementById("retell-widget-fab");
    fab.classList.remove("active", "connecting");

    if (state === "active") {
      fab.classList.add("active");
      fab.innerHTML = phoneOffIcon();
      fab.title = "End call";
    } else if (state === "connecting") {
      fab.classList.add("connecting");
      fab.innerHTML = spinnerIcon();
      fab.title = "Connecting…";
    } else {
      fab.innerHTML = micIcon();
      fab.title = "Start voice call";
    }
  }

  // ── Call lifecycle ─────────────────────────────────────────────────
  async function startCall() {
    if (isCallActive || isConnecting) return;
    isConnecting = true;
    setFabState("connecting");
    showStatus("Connecting…");

    try {
      // 1. Get access token from your backend
      // On Netlify the function lives at /.netlify/functions/create-web-call
      // For a custom server it lives at /api/create-web-call
      const endpoint = config.useNetlify
        ? (config.serverUrl || "") + "/.netlify/functions/create-web-call"
        : config.serverUrl + "/api/create-web-call";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: config.agentId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Server returned " + res.status);
      }

      const { access_token } = await res.json();

      // 2. Start WebRTC call via Retell SDK
      var SDK = window.retellClientJsSdk;
      if (!SDK || !SDK.RetellWebClient) {
        throw new Error("Retell SDK not loaded — check script tag");
      }
      retellClient = new SDK.RetellWebClient();

      retellClient.on("call_started", () => {
        isCallActive = true;
        isConnecting = false;
        setFabState("active");
        showStatus("Call started — speak now", 3000);
      });

      retellClient.on("call_ended", () => {
        cleanupCall();
        showStatus("Call ended", 2500);
      });

      retellClient.on("error", (error) => {
        console.error("[RetellWidget] error:", error);
        cleanupCall();
        showStatus("Call error — try again", 3000);
      });

      retellClient.on("agent_start_talking", () => {
        showStatus("Agent is speaking…");
      });

      retellClient.on("agent_stop_talking", () => {
        hideStatus();
      });

      await retellClient.startCall({
        accessToken: access_token,
        sampleRate: 24000,
      });
    } catch (err) {
      console.error("[RetellWidget] Failed to start call:", err);
      isConnecting = false;
      setFabState("idle");
      showStatus("Failed to connect — " + err.message, 4000);
    }
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
    /**
     * Initialize the widget.
     * @param {Object} opts
     * @param {string} opts.serverUrl  — Your backend URL (e.g. "https://my-app.com")
     * @param {string} opts.agentId    — Your Retell agent ID
     */
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
      injectStyles();
      createDOM();
    },

    /** Programmatically start a call */
    start: startCall,

    /** Programmatically stop a call */
    stop: stopCall,
  };
})();

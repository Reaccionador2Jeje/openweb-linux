(() => {
  "use strict";

  const CONFIG = window.OPENWEB_TTY_CONFIG || {};
  const root = document.getElementById("terminal");
  const loginButton = document.getElementById("github-login");

  let terminal;
  let fitAddon;
  let socket;
  let state = "boot";

  function getBackendUrl() {
    const value = CONFIG.backendUrl || "";
    if (!value) return null;
    try {
      const url = new URL(value, location.href);
      if (!["ws:", "wss:"].includes(url.protocol)) return null;
      if (location.protocol === "https:" && url.protocol !== "wss:") return null;
      if (url.pathname !== "/terminal") return null;
      url.search = "";
      url.hash = "";
      return url;
    } catch {
      return null;
    }
  }

  function getApiUrl(path) {
    const backend = getBackendUrl();
    if (!backend) return null;
    const api = new URL(path, backend);
    api.protocol = backend.protocol === "wss:" ? "https:" : "http:";
    return api;
  }

  function write(value) {
    terminal.write(value);
  }

  function showError(message) {
    state = "error";
    write("\r\n\x1b[31m[error] " + String(message) + "\x1b[0m\r\n");
  }

  async function exchangeLoginCode(code) {
    const api = getApiUrl("/api/session");
    if (!api) {
      showError("The backend URL is missing or invalid.");
      return;
    }

    state = "authenticating";
    write("\r\nVerifying your GitHub account...\r\n");

    try {
      const response = await fetch(api.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        cache: "no-store",
        referrerPolicy: "no-referrer"
      });
      const result = await response.json();
      if (!response.ok || typeof result.ticket !== "string") {
        const reason = result.error === "not_allowlisted" || result.error === "user_not_allowed"
          ? "Your GitHub account is not on the access list."
          : result.error === "github_login_not_configured"
            ? "GitHub login has not been configured by the administrator."
            : "GitHub sign-in failed or the temporary code expired.";
        throw new Error(reason);
      }
      if (loginButton) loginButton.hidden = true;
      write("\x1b[32mSigned in as " + String(result.user || "GitHub user") + ".\x1b[0m\r\n");
      connect(result.ticket);
    } catch (error) {
      showError(error.message || "Could not verify GitHub sign-in.");
      if (loginButton) loginButton.hidden = false;
    }
  }

  function connect(ticket) {
    const backend = getBackendUrl();
    if (!backend) {
      showError("WebSocket backend URL is missing or invalid.");
      return;
    }

    const wsUrl = new URL(backend);
    wsUrl.searchParams.set("ticket", ticket);
    state = "connecting";
    write("Connecting to the NELRoot Ubuntu runtime...\r\n");

    try {
      socket = new WebSocket(wsUrl.toString());
    } catch {
      showError("Could not create the WebSocket connection.");
      return;
    }

    socket.addEventListener("message", event => {
      if (typeof event.data !== "string") return;
      let message;
      try { message = JSON.parse(event.data); }
      catch { if (state === "ready") write(event.data); return; }
      if (!message || typeof message !== "object") return;

      switch (message.type) {
        case "ready":
          state = "ready";
          write("\r\n\x1b[32mConnected to NELRoot.\x1b[0m\r\n");
          write("\x1b[90mRuntime: " + String(message.runtime || "Linux") +
            " · Image: " + String(message.image || "Ubuntu") + "\x1b[0m\r\n\r\n");
          terminal.focus();
          sendResize();
          break;
        case "output":
          if (state === "ready" && typeof message.data === "string") write(message.data);
          break;
        case "error":
          showError(message.message || "The backend rejected this session.");
          if (typeof message.hint === "string" && message.hint) {
            write("\x1b[33m[diagnostic] " + message.hint + "\x1b[0m\\r\\n");
          }
          if (typeof message.code === "string" && message.code) {
            write("\x1b[90mCode: " + message.code + "\x1b[0m\\r\\n");
          }
          if (socket.readyState === WebSocket.OPEN) socket.close();
          break;
        case "exit":
          state = "disconnected";
          write("\r\n\x1b[33m[session ended] " +
            String(message.reason || "Shell exited") + "\x1b[0m\r\n");
          break;
        default:
          break;
      }
    });

    socket.addEventListener("close", event => {
      if (state === "ready" || state === "connecting") {
        state = "disconnected";
        write("\r\n\x1b[33m[disconnected] WebSocket closed (" +
          event.code + "). Reload to reconnect.\x1b[0m\r\n");
      }
    });

    socket.addEventListener("error", () => {
      if (state !== "error") {
        state = "disconnected";
        write("\r\n\x1b[31m[network error] Could not reach the NELRoot backend.\x1b[0m\r\n");
      }
    });
  }

  function sendResize() {
    if (socket && socket.readyState === WebSocket.OPEN && state === "ready") {
      socket.send(JSON.stringify({
        type: "resize",
        cols: terminal.cols,
        rows: terminal.rows
      }));
    }
  }

  function boot() {
    if (!window.Terminal || !window.FitAddon) {
      root.textContent = "OpenWeb Linux TTY: terminal libraries could not be loaded.";
      return;
    }

    terminal = new Terminal({
      cursorBlink: true,
      convertEol: false,
      scrollback: 5000,
      fontSize: 14,
      lineHeight: 1.25,
      fontFamily: '"Cascadia Code","SFMono-Regular",Consolas,"Liberation Mono",monospace',
      theme: {
        background: "#000000",
        foreground: "#f2f2f2",
        cursor: "#ffffff",
        cursorAccent: "#000000",
        selectionBackground: "#555555",
        black: "#000000",
        brightBlack: "#777777",
        white: "#f2f2f2",
        brightWhite: "#ffffff"
      }
    });

    fitAddon = new FitAddon.FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(root);
    fitAddon.fit();

    write("\x1b[97mOpenWeb Linux TTY 2.2\x1b[0m\r\n");
    write("Rootless Ubuntu runtime · powered by NELRoot\r\n\r\n");

    const backend = getBackendUrl();
    if (!backend) {
      showError("No valid WSS backend URL configured.");
      return;
    }

    const params = new URLSearchParams(location.search);
    const authCode = params.get("auth_code");
    const authError = params.get("auth_error");
    if (authCode || authError) {
      history.replaceState({}, document.title, location.pathname + location.hash);
    }

    if (loginButton) {
      const loginUrl = getApiUrl("/auth/github");
      loginButton.href = loginUrl ? loginUrl.toString() : "#";
      loginButton.hidden = Boolean(authCode);
    }

    if (authError) {
      const messages = {
        not_allowlisted: "Your GitHub account is not authorized for OpenWeb Linux.",
        invalid_oauth_state: "The sign-in request expired or could not be verified. Try again.",
        github_auth_failed: "GitHub sign-in could not be completed. Try again."
      };
      showError(messages[authError] || "GitHub sign-in failed.");
      write("Use the Sign in with GitHub button to try again.\r\n");
    } else if (authCode) {
      if (loginButton) loginButton.hidden = true;
      exchangeLoginCode(authCode);
    } else {
      state = "signed_out";
      write("Sign in with GitHub to start a terminal session.\r\n");
      write("Your account must be approved by the OpenWeb Linux administrator.\r\n");
    }

    terminal.onData(data => {
      if (state === "ready" && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "input", data }));
      }
    });
    terminal.onResize(sendResize);

    window.addEventListener("resize", () => {
      fitAddon.fit();
      sendResize();
    }, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        fitAddon.fit();
        sendResize();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();

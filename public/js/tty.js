(() => {
  "use strict";

  const CONFIG = window.OPENWEB_TTY_CONFIG || {};
  const root = document.getElementById("terminal");
  const STORAGE_KEY = "openweb-linux-workspace-v1";
  let terminal;
  let fitAddon;
  let socket;
  let state = "boot";
  let tokenBuffer = "";
  let workspaceId = "";

  function getWorkspaceId() {
    try {
      let id = localStorage.getItem(STORAGE_KEY);
      if (!/^[a-f0-9-]{36}$/i.test(id || "")) {
        id = crypto.randomUUID();
        localStorage.setItem(STORAGE_KEY, id);
      }
      return id;
    } catch {
      return crypto.randomUUID();
    }
  }

  function getBackendUrl() {
    const override = new URLSearchParams(location.search).get("backend");
    const value = override || CONFIG.backendUrl || "";
    if (!value) return "";
    try {
      const url = new URL(value, location.href);
      if (!["ws:", "wss:"].includes(url.protocol)) return "";
      if (location.protocol === "https:" && url.protocol !== "wss:") return "";
      return url.toString();
    } catch {
      return "";
    }
  }

  function write(value) {
    terminal.write(value);
  }

  function showError(message) {
    state = "error";
    write("\r\n\x1b[31m[error] " + message + "\x1b[0m\r\n");
    write("Configure public/js/config.js with the backend WSS URL, then reload.\r\n");
  }

  function connect(token) {
    const url = getBackendUrl();
    if (!url) {
      showError("WebSocket backend URL is not configured.");
      return;
    }

    state = "connecting";
    write("\r\nConnecting to Ubuntu backend...\r\n");
    socket = new WebSocket(url);

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({
        type: "auth",
        token,
        workspaceId,
        cols: terminal.cols,
        rows: terminal.rows
      }));
    });

    socket.addEventListener("message", event => {
      if (typeof event.data !== "string") return;
      if (event.data.startsWith("{")) {
        try {
          const control = JSON.parse(event.data);
          if (control.type === "ready") {
            state = "ready";
            write("\r\n\x1b[32mConnected to Ubuntu workspace.\x1b[0m\r\n\r\n");
            terminal.focus();
            return;
          }
          if (control.type === "error") {
            showError(control.message || "The backend rejected this session.");
            socket.close();
            return;
          }
        } catch {
          // Normal PTY output is not a control message.
        }
      }
      if (state === "ready") write(event.data);
    });

    socket.addEventListener("close", event => {
      if (state === "ready" || state === "connecting") {
        state = "disconnected";
        write("\r\n\x1b[33m[disconnected] WebSocket closed (" + event.code + "). Reload to reconnect.\x1b[0m\r\n");
      }
    });

    socket.addEventListener("error", () => {
      if (state !== "error") {
        state = "disconnected";
        write("\r\n\x1b[31m[network error] Could not reach the backend.\x1b[0m\r\n");
      }
    });
  }

  function handleTokenInput(data) {
    for (const char of data) {
      if (char === "\r" || char === "\n") {
        if (!tokenBuffer) {
          write("\r\nAccess token: ");
          continue;
        }
        const token = tokenBuffer;
        tokenBuffer = "";
        write("\r\n");
        connect(token);
        return;
      }
      if (char === "\u007f" || char === "\b") {
        if (tokenBuffer.length) {
          tokenBuffer = tokenBuffer.slice(0, -1);
          write("\b \b");
        }
      } else if (char >= " " && char !== "\u007f") {
        tokenBuffer += char;
        write("*");
      }
    }
  }

  function resize() {
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
    workspaceId = getWorkspaceId();

    write("\x1b[97mOpenWeb Linux TTY 2.0\x1b[0m\r\n");
    write("Ubuntu 24.04 LTS · interactive web terminal\r\n\r\n");

    if (!getBackendUrl()) {
      showError("No backend URL configured.");
      return;
    }

    state = "token";
    write("Access token: ");

    terminal.onData(data => {
      if (state === "token") {
        handleTokenInput(data);
      } else if (state === "ready" && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    });

    terminal.onResize(resize);
    window.addEventListener("resize", () => {
      fitAddon.fit();
      resize();
    }, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        fitAddon.fit();
        resize();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();

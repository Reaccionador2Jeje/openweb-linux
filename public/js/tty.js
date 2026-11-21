(() => {
  "use strict";

  const CONFIG = window.OPENWEB_TTY_CONFIG || {};
  const root = document.getElementById("terminal");
  let terminal;
  let fitAddon;
  let socket;
  let state = "boot";
  let tokenBuffer = "";

  function backendUrl(token) {
    const override = new URLSearchParams(location.search).get("backend");
    const value = override || CONFIG.backendUrl || "";
    if (!value) return null;
    try {
      const url = new URL(value, location.href);
      if (!["ws:", "wss:"].includes(url.protocol)) return null;
      if (location.protocol === "https:" && url.protocol !== "wss:") return null;
      if (!url.pathname.endsWith("/terminal")) return null;
      url.searchParams.set("token", token);
      return url.toString();
    } catch { return null; }
  }

  function write(value) { terminal.write(value); }

  function showError(message) {
    state = "error";
    write("\r\n\x1b[31m[error] " + String(message) + "\x1b[0m\r\n");
    write("Check the backend URL and NELRoot service, then reload.\r\n");
  }

  function connect(token) {
    const url = backendUrl(token);
    if (!url) return showError("WebSocket backend URL is missing or invalid.");
    state = "connecting";
    write("\r\nConnecting to the NELRoot Ubuntu runtime...\r\n");
    try { socket = new WebSocket(url); }
    catch { return showError("Could not create the WebSocket connection."); }

    socket.addEventListener("message", event => {
      if (typeof event.data !== "string") return;
      let message;
      try { message = JSON.parse(event.data); }
      catch {
        if (state === "ready") write(event.data);
        return;
      }
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
          if (socket.readyState === WebSocket.OPEN) socket.close();
          break;
        case "exit":
          state = "disconnected";
          write("\r\n\x1b[33m[session ended] " +
            String(message.reason || "Shell exited") + "\x1b[0m\r\n");
          break;
        default: break;
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

  function handleTokenInput(data) {
    for (const char of data) {
      if (char === "\r" || char === "\n") {
        if (!tokenBuffer) { write("\r\nAccess token: "); continue; }
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

  function sendResize() {
    if (socket && socket.readyState === WebSocket.OPEN && state === "ready") {
      socket.send(JSON.stringify({type:"resize",cols:terminal.cols,rows:terminal.rows}));
    }
  }

  function boot() {
    if (!window.Terminal || !window.FitAddon) {
      root.textContent = "OpenWeb Linux TTY: terminal libraries could not be loaded.";
      return;
    }
    terminal = new Terminal({
      cursorBlink:true, convertEol:false, scrollback:5000, fontSize:14, lineHeight:1.25,
      fontFamily:'"Cascadia Code","SFMono-Regular",Consolas,"Liberation Mono",monospace',
      theme:{
        background:"#000000",foreground:"#f2f2f2",cursor:"#ffffff",
        cursorAccent:"#000000",selectionBackground:"#555555",black:"#000000",
        brightBlack:"#777777",white:"#f2f2f2",brightWhite:"#ffffff"
      }
    });
    fitAddon = new FitAddon.FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(root);
    fitAddon.fit();

    write("\x1b[97mOpenWeb Linux TTY 2.1\x1b[0m\r\n");
    write("Rootless Ubuntu runtime · powered by NELRoot\r\n\r\n");
    if (!CONFIG.backendUrl && !new URLSearchParams(location.search).get("backend")) {
      showError("No backend URL configured in public/js/config.js.");
      return;
    }

    state = "token";
    write("Access token: ");
    terminal.onData(data => {
      if (state === "token") handleTokenInput(data);
      else if (state === "ready" && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({type:"input",data}));
      }
    });
    terminal.onResize(sendResize);
    window.addEventListener("resize", () => { fitAddon.fit(); sendResize(); }, {passive:true});
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) { fitAddon.fit(); sendResize(); }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, {once:true});
  } else boot();
})();

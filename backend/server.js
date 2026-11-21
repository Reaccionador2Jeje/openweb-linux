"use strict";

const http = require("node:http");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const pty = require("node-pty");
const { WebSocketServer, WebSocket } = require("ws");

const execFileAsync = promisify(execFile);
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8787);
const ACCESS_TOKEN = process.env.OPENWEB_ACCESS_TOKEN || "";
const ALLOWED_ORIGINS = new Set((process.env.OPENWEB_ALLOWED_ORIGINS || "")
  .split(",").map(value => value.trim()).filter(Boolean));
const MAX_WORKSPACES = Number(process.env.OPENWEB_MAX_WORKSPACES || 20);
const IDLE_MS = Number(process.env.OPENWEB_IDLE_MINUTES || 15) * 60 * 1000;
const IMAGE = process.env.OPENWEB_IMAGE || "openweb-linux-ubuntu:24.04";
const MEMORY = process.env.OPENWEB_MEMORY || "768m";
const CPUS = process.env.OPENWEB_CPUS || "1.0";
const PIDS = String(Number(process.env.OPENWEB_PIDS || 256));

const activeWorkspaces = new Set();
const idleTimers = new Map();
const sessions = new Set();

if (ACCESS_TOKEN.length < 32) {
  console.error("OPENWEB_ACCESS_TOKEN must contain at least 32 characters.");
  process.exit(1);
}
if (ALLOWED_ORIGINS.size === 0) {
  console.error("Set OPENWEB_ALLOWED_ORIGINS to an explicit origin allowlist.");
  process.exit(1);
}

function sendControl(ws, type, message, extra = {}) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, ...(message ? { message } : {}), ...extra }));
  }
}

function safeEqual(candidate) {
  if (typeof candidate !== "string") return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(ACCESS_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function validWorkspaceId(value) {
  return typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value);
}

function namesFor(id) {
  const compact = id.replaceAll("-", "").toLowerCase();
  return {
    container: "owl-" + compact,
    volume: "owl-data-" + compact
  };
}

async function docker(args, timeout = 30000) {
  const result = await execFileAsync("docker", args, {
    timeout,
    maxBuffer: 1024 * 1024,
    windowsHide: true
  });
  return result.stdout.trim();
}

async function ensureWorkspace(id) {
  const names = namesFor(id);
  let exists = false;

  try {
    await docker(["inspect", names.container], 10000);
    exists = true;
  } catch {
    // A missing container is created below.
  }

  if (exists) {
    const running = await docker([
      "inspect", "--format", "{{.State.Running}}", names.container
    ]);
    if (running !== "true") await docker(["start", names.container]);
    return names;
  }

  const existing = await docker([
    "ps", "-a", "--filter", "name=^/owl-", "--format", "{{.Names}}"
  ]);
  const count = existing.split("\n").filter(Boolean).length;
  if (count >= MAX_WORKSPACES) {
    throw new Error("Workspace capacity reached. Try again later.");
  }

  await docker(["volume", "create", names.volume]);
  try {
    await docker([
      "run", "--detach",
      "--name", names.container,
      "--hostname", "ubuntu",
      "--init",
      "--restart", "no",
      "--memory", MEMORY,
      "--cpus", CPUS,
      "--pids-limit", PIDS,
      "--security-opt", "no-new-privileges",
      "--cap-drop", "ALL",
      "--network", "bridge",
      "--mount", "type=volume,src=" + names.volume + ",dst=/home/openweb",
      IMAGE
    ], 60000);
  } catch (error) {
    try { await docker(["volume", "rm", names.volume]); } catch { /* best effort */ }
    throw error;
  }
  return names;
}

function scheduleIdleStop(workspaceId, containerName) {
  const previous = idleTimers.get(workspaceId);
  if (previous) clearTimeout(previous);

  const timer = setTimeout(async () => {
    idleTimers.delete(workspaceId);
    if (activeWorkspaces.has(workspaceId)) return;
    try {
      await docker(["stop", "--time", "5", containerName], 15000);
    } catch (error) {
      console.error("Idle workspace stop failed:", error.message);
    }
  }, IDLE_MS);

  timer.unref();
  idleTimers.set(workspaceId, timer);
}

async function authenticateAndStart(ws, firstMessage) {
  let auth;
  try {
    auth = JSON.parse(firstMessage.toString());
  } catch {
    throw new Error("First message must be an authentication JSON object.");
  }

  if (auth.type !== "auth" || !safeEqual(auth.token)) {
    throw new Error("Authentication failed.");
  }
  if (!validWorkspaceId(auth.workspaceId)) {
    throw new Error("Invalid workspace identifier.");
  }

  const workspaceId = auth.workspaceId;
  if (activeWorkspaces.has(workspaceId)) {
    throw new Error("This workspace already has an active terminal session.");
  }

  const timer = idleTimers.get(workspaceId);
  if (timer) {
    clearTimeout(timer);
    idleTimers.delete(workspaceId);
  }

  activeWorkspaces.add(workspaceId);
  let names;

  try {
    names = await ensureWorkspace(workspaceId);
    const cols = Math.max(40, Math.min(240, Number(auth.cols) || 100));
    const rows = Math.max(10, Math.min(100, Number(auth.rows) || 30));

    const shell = pty.spawn("docker", [
      "exec", "-it", "--user", "openweb",
      names.container, "/bin/bash", "--login"
    ], {
      name: "xterm-256color",
      cols,
      rows,
      cwd: process.cwd(),
      env: { ...process.env, TERM: "xterm-256color" }
    });

    ws.workspaceId = workspaceId;
    ws.containerName = names.container;
    ws.pty = shell;
    sessions.add(ws);

    shell.onData(data => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });

    shell.onExit(({ exitCode }) => {
      if (ws.readyState === WebSocket.OPEN) {
        sendControl(ws, "error", "The Ubuntu shell exited (code " + exitCode + ").");
        ws.close(1011, "PTY exited");
      }
    });

    sendControl(ws, "ready", null, { workspaceId });
  } catch (error) {
    activeWorkspaces.delete(workspaceId);
    if (names) scheduleIdleStop(workspaceId, names.container);
    throw error;
  }
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store"
    });
    res.end(JSON.stringify({
      status: "ok",
      service: "openweb-linux-tty",
      runtime: "ubuntu-24.04",
      activeSessions: sessions.size
    }));
    return;
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("Not found\n");
});

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 64 * 1024,
  perMessageDeflate: false
});

server.on("upgrade", (req, socket, head) => {
  const origin = req.headers.origin;
  let pathname;

  try {
    pathname = new URL(req.url, "http://localhost").pathname;
  } catch {
    socket.destroy();
    return;
  }

  if (pathname !== "/terminal" || !origin || !ALLOWED_ORIGINS.has(origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, ws => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", ws => {
  let authenticated = false;
  const authTimeout = setTimeout(() => {
    if (!authenticated) ws.close(1008, "Authentication timeout");
  }, 8000);

  ws.once("message", async data => {
    try {
      await authenticateAndStart(ws, data);
      authenticated = true;
      clearTimeout(authTimeout);
    } catch (error) {
      clearTimeout(authTimeout);
      sendControl(ws, "error", error.message || "Could not start workspace.");
      ws.close(1008, "Session rejected");
    }
  });

  ws.on("message", data => {
    if (!authenticated || !ws.pty) return;

    const value = data.toString();
    if (value.startsWith("{")) {
      try {
        const control = JSON.parse(value);
        if (control.type === "resize") {
          const cols = Math.max(40, Math.min(240, Number(control.cols) || 100));
          const rows = Math.max(10, Math.min(100, Number(control.rows) || 30));
          ws.pty.resize(cols, rows);
          return;
        }
      } catch {
        // Non-JSON terminal input is passed to the PTY.
      }
    }
    ws.pty.write(value);
  });

  ws.on("close", () => {
    clearTimeout(authTimeout);
    sessions.delete(ws);
    if (ws.pty) ws.pty.kill();
    if (ws.workspaceId) {
      activeWorkspaces.delete(ws.workspaceId);
      scheduleIdleStop(ws.workspaceId, ws.containerName);
    }
  });

  ws.on("error", error => console.error("WebSocket error:", error.message));
});

server.listen(PORT, HOST, () => {
  console.log("OpenWeb Linux TTY backend listening on " + HOST + ":" + PORT);
});

async function shutdown() {
  for (const ws of sessions) {
    try { ws.close(1001, "Server shutting down"); } catch { /* ignore */ }
    if (ws.pty) ws.pty.kill();
  }
  for (const timer of idleTimers.values()) clearTimeout(timer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

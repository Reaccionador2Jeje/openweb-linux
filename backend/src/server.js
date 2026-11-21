'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const pty = require('node-pty');
const WebSocket = require('ws');
const { NelRootRuntime } = require('./runtime');
const { safeEqual, parseAllowedOrigins, originAllowed, validTerminalSize } = require('./security');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number.parseInt(process.env.PORT || '8787', 10);
const TOKEN = process.env.OPENWEB_ACCESS_TOKEN || '';
const MAX_SESSIONS = Math.max(1, Math.min(20, Number.parseInt(process.env.OPENWEB_MAX_SESSIONS || '3', 10)));
const IDLE_TIMEOUT_MS = Math.max(60_000, Number.parseInt(process.env.OPENWEB_IDLE_TIMEOUT_MS || '1800000', 10));
const MAX_INPUT_BYTES = Math.max(1024, Math.min(65536, Number.parseInt(process.env.OPENWEB_MAX_INPUT_BYTES || '16384', 10)));
const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.OPENWEB_ALLOWED_ORIGINS || '');
const runtime = new NelRootRuntime();
const sessions = new Map();

if (!TOKEN || TOKEN.length < 32) {
  throw new Error('OPENWEB_ACCESS_TOKEN must be set to a random secret of at least 32 characters');
}
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('PORT is invalid');

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  response.end(body);
}

function authorized(request) {
  const header = request.headers.authorization || '';
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
  return safeEqual(supplied, TOKEN);
}

function closeSession(id, reason = 'session closed') {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  clearTimeout(session.idleTimer);
  try { session.terminal.kill(); } catch {}
  try {
    if (session.socket.readyState === WebSocket.OPEN) {
      session.socket.send(JSON.stringify({ type: 'exit', reason }));
      session.socket.close(1000, 'session ended');
    }
  } catch {}
}

function touchSession(id) {
  const session = sessions.get(id);
  if (!session) return;
  clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(() => closeSession(id, 'idle timeout'), IDLE_TIMEOUT_MS);
  session.idleTimer.unref?.();
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { service: 'openweb-linux-backend', status: 'ok' });
  }
  if (request.method === 'GET' && url.pathname === '/api/status') {
    if (!authorized(request)) return sendJson(response, 401, { error: 'unauthorized' });
    const status = await runtime.inspect();
    return sendJson(response, status.ready ? 200 : 503, {
      ...status,
      active_sessions: sessions.size,
      max_sessions: MAX_SESSIONS
    });
  }
  return sendJson(response, 404, { error: 'not_found' });
});

const wss = new WebSocket.Server({ noServer: true, maxPayload: MAX_INPUT_BYTES + 1024 });

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, 'http://localhost');
  const origin = request.headers.origin || '';
  if (url.pathname !== '/terminal' || !originAllowed(origin, ALLOWED_ORIGINS)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  if (!safeEqual(url.searchParams.get('token') || '', TOKEN)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  if (sessions.size >= MAX_SESSIONS) {
    socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
});

wss.on('connection', (socket) => {
  const id = crypto.randomUUID();
  const command = runtime.shellCommand();
  let terminal;
  try {
    terminal = pty.spawn(command.file, command.args, {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
        HOME: '/root',
        USER: 'root',
        LOGNAME: 'root',
        SHELL: runtime.shell,
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        HISTFILE: '/dev/null',
        TMPDIR: '/tmp',
        TERM: 'xterm-256color',
        LANG: 'C.UTF-8',
        NO_COLOR: '0'
      },
      encoding: 'utf8'
    });
  } catch (error) {
    socket.send(JSON.stringify({ type: 'error', message: 'Could not start the NELRoot shell: ' + String(error.message).slice(0, 200) }));
    socket.close(1011, 'runtime launch failed');
    return;
  }

  const session = { id, socket, terminal, idleTimer: null };
  sessions.set(id, session);
  touchSession(id);
  socket.send(JSON.stringify({ type: 'ready', session_id: id, runtime: 'NELRoot', image: runtime.image }));

  terminal.onData((data) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'output', data }));
    touchSession(id);
  });
  terminal.onExit(({ exitCode, signal }) => {
    if (sessions.has(id)) {
      sessions.delete(id);
      clearTimeout(session.idleTimer);
    }
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'exit', exit_code: exitCode, signal }));
      socket.close(1000, 'shell exited');
    }
  });

  socket.on('message', (raw) => {
    touchSession(id);
    let message;
    try { message = JSON.parse(raw.toString()); }
    catch { socket.close(1003, 'invalid message'); return; }
    if (!message || typeof message !== 'object') return;
    if (message.type === 'input') {
      if (typeof message.data !== 'string' || Buffer.byteLength(message.data) > MAX_INPUT_BYTES) {
        socket.close(1009, 'input too large');
        return;
      }
      terminal.write(message.data);
    } else if (message.type === 'resize') {
      if (!validTerminalSize(message.cols, message.rows)) return;
      terminal.resize(message.cols, message.rows);
    } else if (message.type === 'ping') {
      socket.send(JSON.stringify({ type: 'pong' }));
    }
  });
  socket.on('close', () => closeSession(id, 'client disconnected'));
  socket.on('error', () => closeSession(id, 'websocket error'));
});

function shutdown() {
  for (const id of [...sessions.keys()]) closeSession(id, 'backend shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, HOST, () => {
  process.stdout.write(`OpenWeb Linux NELRoot backend listening on http://${HOST}:${PORT}\n`);
});

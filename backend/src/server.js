'use strict';

require('dotenv').config();

const http = require('node:http');
const crypto = require('node:crypto');
const pty = require('node-pty');
const WebSocket = require('ws');
const { createRuntime } = require('./runtime');
const {
  safeEqual,
  parseAllowedOrigins,
  originAllowed,
  validTerminalSize,
  createTicketStore
} = require('./security');

const HOST = (process.env.OPENWEB_RUNTIME || 'docker').toLowerCase() === 'proot' ? '127.0.0.1' : (process.env.HOST || '127.0.0.1');
const PORT = Number.parseInt(process.env.PORT || '8787', 10);
const TOKEN = process.env.OPENWEB_ACCESS_TOKEN || '';
const MAX_SESSIONS = Math.max(1, Math.min(20, Number.parseInt(process.env.OPENWEB_MAX_SESSIONS || '3', 10)));
const IDLE_TIMEOUT_MS = Math.max(60_000, Number.parseInt(process.env.OPENWEB_IDLE_TIMEOUT_MS || '1800000', 10));
const MAX_INPUT_BYTES = Math.max(1024, Math.min(65536, Number.parseInt(process.env.OPENWEB_MAX_INPUT_BYTES || '16384', 10)));
const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.OPENWEB_ALLOWED_ORIGINS || '');
const TICKET_TTL_MS = 30_000;
const GITHUB_CLIENT_ID = process.env.OPENWEB_GITHUB_CLIENT_ID || '';
const LOCAL_AUTH_ENABLED = process.env.OPENWEB_ENABLE_LOCAL_AUTH === 'true';
const GITHUB_CLIENT_SECRET = process.env.OPENWEB_GITHUB_CLIENT_SECRET || '';
const BACKEND_PUBLIC_URL = (process.env.OPENWEB_BACKEND_PUBLIC_URL || '').replace(/\/$/, '');
const FRONTEND_URL = process.env.OPENWEB_FRONTEND_URL || 'https://reaccionador2jeje.github.io/openweb-linux/';
const GITHUB_ALLOWED_USERS = new Set(
  (process.env.OPENWEB_GITHUB_ALLOWED_USERS || '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
);
const OAUTH_STATE_TTL_MS = 5 * 60_000;
const LOGIN_CODE_TTL_MS = 60_000;
const oauthStates = new Map();
const loginCodes = new Map();

const runtime = createRuntime();
const sessions = new Map();
const ticketStore = createTicketStore({ ttlMs: TICKET_TTL_MS });
let serviceManagerSmokeTest = { status: 'pending' };
let serviceManagerSmokeTestPromise = Promise.resolve();
let shuttingDown = false;

if (!TOKEN || TOKEN.length < 32) {
  throw new Error('OPENWEB_ACCESS_TOKEN must be set to a random secret of at least 32 characters');
}
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT is invalid');
}

function sendJson(response, status, payload, origin = '') {
  const body = JSON.stringify(payload);
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  };

  if (origin && originAllowed(origin, ALLOWED_ORIGINS)) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-headers'] = 'Authorization, Content-Type';
    headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
    headers.vary = 'Origin';
  }

  response.writeHead(status, headers);
  response.end(body);
}

function authorized(request) {
  const header = request.headers.authorization || '';
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
  return safeEqual(supplied, TOKEN);
}

function readJsonBody(request, maxBytes = 4096) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    request.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error('request_too_large'));
        request.destroy();
        return;
      }
      body += chunk.toString('utf8');
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('invalid_json')); }
    });
    request.on('error', reject);
  });
}

function cookieValue(request, name) {
  const cookies = request.headers.cookie || '';
  for (const part of cookies.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return '';
}

function pruneAuthStores() {
  const now = Date.now();
  for (const [state, expiresAt] of oauthStates) {
    if (expiresAt <= now) oauthStates.delete(state);
  }
  for (const [code, entry] of loginCodes) {
    if (entry.expiresAt <= now) loginCodes.delete(code);
  }
}

function redirect(response, location, extraHeaders = {}) {
  response.writeHead(302, {
    location,
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    ...extraHeaders
  });
  response.end();
}

async function beginGithubLogin(response) {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !BACKEND_PUBLIC_URL || GITHUB_ALLOWED_USERS.size === 0) {
    return sendJson(response, 503, { error: 'github_login_not_configured' });
  }

  pruneAuthStores();
  const state = crypto.randomBytes(32).toString('base64url');
  oauthStates.set(state, Date.now() + OAUTH_STATE_TTL_MS);
  const callback = BACKEND_PUBLIC_URL + '/auth/github/callback';
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', GITHUB_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', callback);
  authorize.searchParams.set('scope', 'read:user');
  authorize.searchParams.set('state', state);

  return redirect(response, authorize.toString(), {
    'set-cookie': 'openweb_oauth_state=' + encodeURIComponent(state) + '; HttpOnly; Secure; SameSite=Lax; Path=/auth/github/callback; Max-Age=300'
  });
}

async function finishGithubLogin(request, response, url) {
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const cookieState = cookieValue(request, 'openweb_oauth_state');
  const stateExpiry = oauthStates.get(state);
  oauthStates.delete(state);

  const clearStateCookie = 'openweb_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/auth/github/callback; Max-Age=0';
  if (!state || !code || !cookieState || !safeEqual(state, cookieState) || !stateExpiry || stateExpiry <= Date.now()) {
    return redirect(response, FRONTEND_URL + '?auth_error=invalid_oauth_state', { 'set-cookie': clearStateCookie });
  }

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: BACKEND_PUBLIC_URL + '/auth/github/callback'
      }),
      signal: AbortSignal.timeout(10_000)
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || typeof tokenData.access_token !== 'string') {
      throw new Error('github_token_exchange_failed');
    }

    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        authorization: 'Bearer ' + tokenData.access_token,
        accept: 'application/vnd.github+json',
        'user-agent': 'OpenWeb-Linux'
      },
      signal: AbortSignal.timeout(10_000)
    });
    const user = await userResponse.json();
    if (!userResponse.ok || typeof user.login !== 'string') {
      throw new Error('github_identity_failed');
    }

    if (!GITHUB_ALLOWED_USERS.has(user.login.toLowerCase())) {
      return redirect(response, FRONTEND_URL + '?auth_error=not_allowlisted', { 'set-cookie': clearStateCookie });
    }

    pruneAuthStores();
    const loginCode = crypto.randomBytes(32).toString('base64url');
    loginCodes.set(loginCode, { login: user.login, expiresAt: Date.now() + LOGIN_CODE_TTL_MS });
    return redirect(response, FRONTEND_URL + '?auth_code=' + encodeURIComponent(loginCode), { 'set-cookie': clearStateCookie });
  } catch {
    return redirect(response, FRONTEND_URL + '?auth_error=github_auth_failed', { 'set-cookie': clearStateCookie });
  }
}

function closeSession(id, reason = 'session closed') {
  const session = sessions.get(id);
  if (!session) return;

  sessions.delete(id);
  clearTimeout(session.idleTimer);

  try { session.terminal.kill(); } catch {}
  Promise.resolve(runtime.destroySession(session.runtimeSession)).catch(() => {});

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
  session.idleTimer = setTimeout(
    () => closeSession(id, 'idle timeout'),
    IDLE_TIMEOUT_MS
  );
  session.idleTimer.unref?.();
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const origin = request.headers.origin || '';

  if (url.pathname === '/api/runtime-status') {
    if (!originAllowed(origin, ALLOWED_ORIGINS)) {
      return sendJson(response, 403, { error: 'origin_not_allowed' });
    }

    if (request.method === 'OPTIONS') {
      const headers = {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'Content-Type',
        'access-control-max-age': '300',
        'vary': 'Origin',
        'cache-control': 'no-store'
      };
      if ((process.env.OPENWEB_RUNTIME || '').toLowerCase() === 'proot'
          && request.headers['access-control-request-private-network'] === 'true') {
        headers['access-control-allow-private-network'] = 'true';
      }
      response.writeHead(204, headers);
      return response.end();
    }

    if (request.method !== 'GET') {
      return sendJson(response, 405, { error: 'method_not_allowed' }, origin);
    }

    let status;
    try {
      status = await runtime.inspect();
    } catch {
      return sendJson(response, 503, {
        provider: runtime.provider,
        ready: false,
        local_only: runtime.provider === 'PRoot'
      }, origin);
    }
    return sendJson(response, status.ready ? 200 : 503, {
      provider: status.provider,
      ready: Boolean(status.ready),
      local_only: Boolean(status.local_only),
      environment: status.environment || (runtime.provider === 'PRoot' ? 'local' : 'remote'),
      isolation: status.isolation || (runtime.provider === 'Docker' ? 'container' : 'host-managed'),
      architecture: status.architecture || process.arch
    }, origin);
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, {
      service: 'openweb-linux-backend',
      status: 'ok'
    });
  }

  if (request.method === 'GET' && url.pathname === '/auth/github') {
    return beginGithubLogin(response);
  }

  if (request.method === 'GET' && url.pathname === '/auth/github/callback') {
    return finishGithubLogin(request, response, url);
  }

  if (url.pathname === '/api/session') {
    if (!originAllowed(origin, ALLOWED_ORIGINS)) {
      return sendJson(response, 403, { error: 'origin_not_allowed' });
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'Content-Type',
        'access-control-max-age': '300',
        'vary': 'Origin',
        'cache-control': 'no-store'
      });
      return response.end();
    }

    if (request.method !== 'POST') {
      return sendJson(response, 405, { error: 'method_not_allowed' }, origin);
    }

    let payload;
    try { payload = await readJsonBody(request); }
    catch (error) {
      return sendJson(response, error.message === 'request_too_large' ? 413 : 400, { error: error.message }, origin);
    }

    const loginCode = typeof payload.code === 'string' ? payload.code : '';
    pruneAuthStores();
    const login = loginCodes.get(loginCode);
    if (!login || login.expiresAt <= Date.now()) {
      return sendJson(response, 401, { error: 'login_code_invalid_or_expired' }, origin);
    }
    loginCodes.delete(loginCode);

    if (!GITHUB_ALLOWED_USERS.has(login.login.toLowerCase())) {
      return sendJson(response, 403, { error: 'user_not_allowed' }, origin);
    }

    const ticket = ticketStore.issue(origin);
    return sendJson(response, 200, {
      ticket,
      expires_in: TICKET_TTL_MS / 1000,
      user: login.login
    }, origin);
  }

  if (url.pathname === '/api/local-session') {
    if (!originAllowed(origin, ALLOWED_ORIGINS)) {
      return sendJson(response, 403, { error: 'origin_not_allowed' });
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'Authorization',
        'access-control-max-age': '300',
        'vary': 'Origin',
        'cache-control': 'no-store'
      });
      return response.end();
    }

    if (request.method !== 'POST') {
      return sendJson(response, 405, { error: 'method_not_allowed' }, origin);
    }

    if (!LOCAL_AUTH_ENABLED) {
      return sendJson(response, 403, { error: 'local_auth_disabled' }, origin);
    }

    if (!authorized(request)) {
      return sendJson(response, 401, { error: 'unauthorized' }, origin);
    }

    const ticket = ticketStore.issue(origin);
    return sendJson(response, 200, {
      ticket,
      expires_in: TICKET_TTL_MS / 1000,
      user: 'local-device'
    }, origin);
  }

  if (request.method === 'GET' && url.pathname === '/api/status') {
    if (!authorized(request)) {
      return sendJson(response, 401, { error: 'unauthorized' });
    }

    const status = await runtime.inspect();

    return sendJson(response, status.ready ? 200 : 503, {
      ...status,
      active_sessions: sessions.size,
      max_sessions: MAX_SESSIONS,
      service_manager_smoke_test: serviceManagerSmokeTest
    });
  }

  return sendJson(response, 404, { error: 'not_found' });
});

const wss = new WebSocket.Server({
  noServer: true,
  maxPayload: MAX_INPUT_BYTES + 1024
});

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, 'http://localhost');
  const origin = request.headers.origin || '';

  if (url.pathname !== '/terminal' || !originAllowed(origin, ALLOWED_ORIGINS)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  if (sessions.size >= MAX_SESSIONS) {
    socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const ticket = url.searchParams.get('ticket') || '';

  if (!ticketStore.consume(ticket, origin)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', async (socket) => {
  let preflight;
  try {
    preflight = await runtime.inspect();
  } catch (error) {
    preflight = { ready: false, error: String(error?.message || error).slice(0, 240) };
  }

  if (!preflight || !preflight.ready) {
    if (socket.readyState === WebSocket.OPEN) {
      const dockerRuntime = runtime.provider === 'Docker';
      const prootRuntime = runtime.provider === 'PRoot';
      socket.send(JSON.stringify({
        type: 'error',
        code: dockerRuntime ? 'DOCKER_ENGINE_UNAVAILABLE' : (prootRuntime ? 'PROOT_PREFLIGHT_FAILED' : 'ROOTLESS_PREFLIGHT_FAILED'),
        message: dockerRuntime
          ? 'OpenWeb no puede alcanzar el Docker Engine configurado o la imagen de sesión no está disponible.'
          : (prootRuntime ? 'El entorno PRoot local no superó las comprobaciones básicas.' : 'NELRoot no superó la comprobación de aislamiento en este host. La terminal se mantiene deshabilitada por seguridad.'),
        hint: dockerRuntime
          ? 'Comprueba el Docker Engine y la imagen configurada.'
          : 'Consulta el diagnóstico del backend en /api/status o en los logs del servicio.'
      }));
      socket.close(1013, 'runtime preflight failed');
    }
    return;
  }

  const id = crypto.randomUUID();
  let runtimeSession = null;
  let terminal;

  try {
    if (runtime.provider === 'Docker') {
      runtimeSession = await runtime.createSession();
    }
    const command = runtime.provider === 'Docker'
      ? runtime.shellCommand(runtimeSession)
      : runtime.shellCommand();

    terminal = pty.spawn(command.file, command.args, {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd: runtime.provider === 'PRoot' ? runtime.home : process.cwd(),
      env: {
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
        HOME: runtime.provider === 'Docker' ? '/tmp' : (process.env.HOME || '/home/openweb'),
        USER: runtime.provider === 'Docker' ? 'openweb' : 'root',
        LOGNAME: runtime.provider === 'Docker' ? 'openweb' : 'root',
        SHELL: runtime.shell || '/bin/bash',
        HISTFILE: '/dev/null',
        TMPDIR: '/tmp',
        TERM: 'xterm-256color',
        LANG: 'C.UTF-8',
        NO_COLOR: '0'
      },
      encoding: 'utf8'
    });
  } catch (error) {
    if (runtimeSession) await runtime.destroySession(runtimeSession).catch(() => {});
    socket.send(JSON.stringify({
      type: 'error',
      message: 'Could not start the ' + runtime.provider + ' shell: ' + String(error.message).slice(0, 200)
    }));
    socket.close(1011, 'runtime launch failed');
    return;
  }

  const session = { id, socket, terminal, runtimeSession, idleTimer: null };
  sessions.set(id, session);
  touchSession(id);

  socket.send(JSON.stringify({
    type: 'ready',
    session_id: id,
    runtime: runtime.provider,
    image: runtime.image
  }));

  terminal.onData((data) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'output', data }));
    }
    touchSession(id);
  });

  terminal.onExit(({ exitCode, signal }) => {
    if (sessions.has(id)) {
      sessions.delete(id);
      clearTimeout(session.idleTimer);
    }
    Promise.resolve(runtime.destroySession(runtimeSession)).catch(() => {});

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'exit', exit_code: exitCode, signal }));
      socket.close(1000, 'shell exited');
    }
  });

  socket.on('message', (raw) => {
    touchSession(id);

    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      socket.close(1003, 'invalid message');
      return;
    }

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
  if (shuttingDown) return;
  shuttingDown = true;

  for (const id of [...sessions.keys()]) {
    closeSession(id, 'backend shutting down');
  }

  server.close(async () => {
    await runtime.stopServiceSmokeTest().catch(() => {});
    await Promise.race([
      serviceManagerSmokeTestPromise,
      new Promise((resolve) => setTimeout(resolve, 7000))
    ]);
    process.exit(0);
  });
  setTimeout(async () => {
    await runtime.stopServiceSmokeTest().catch(() => {});
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, HOST, () => {
  process.stdout.write(
    'OpenWeb Linux ' + runtime.provider + ' backend listening on http://' + HOST + ':' + PORT + '\n'
  );

  if (runtime.provider === 'PRoot') {
    serviceManagerSmokeTest = { status: 'not_applicable', runtime: 'PRoot' };
    runtime.inspect().then((status) => {
      process.stdout.write('PRoot runtime preflight: ' + JSON.stringify({
        ready: status.ready,
        proot_detected: status.proot_detected,
        shell: status.shell,
        shell_available: status.shell_available,
        local_only: status.local_only
      }) + '\\n');
    }).catch((error) => {
      process.stderr.write('PRoot runtime preflight failed: ' + String(error?.message || error).slice(0, 240) + '\\n');
    });
    return;
  }

  if (runtime.provider === 'Docker') {
    serviceManagerSmokeTest = { status: 'not_applicable', runtime: 'Docker' };
    runtime.inspect().then((status) => {
      process.stdout.write('Docker runtime preflight: ' + JSON.stringify({
        ready: status.ready,
        docker_available: status.docker_available,
        docker_version: status.docker_version,
        image: status.image,
        image_available: status.image_available,
        docker_error: status.docker_error,
        image_error: status.image_error
      }) + '\n');
    }).catch((error) => {
      process.stderr.write('Docker runtime preflight failed: ' + String(error?.message || error).slice(0, 240) + '\n');
    });
    return;
  }

  if (process.env.OPENWEB_NELROOT_SERVICE_SMOKE_TEST === 'false') {
    serviceManagerSmokeTest = { status: 'disabled' };
    return;
  }

  serviceManagerSmokeTest = { status: 'running' };
  serviceManagerSmokeTestPromise = runtime.inspect()
    .then((status) => {
      if (!status.ready) {
        const diagnostics = {
          binary_available: status.binary_available,
          version: status.version,
          engine_status_available: status.engine_status_available,
          image: status.image,
          image_available: status.image_available,
          rootless_probe_available: status.rootless_probe_available,
          engine_error: status.engine_error,
          image_error: status.image_error,
          rootless_probe_error: status.rootless_probe_error
        };
        process.stderr.write('NELRoot preflight diagnostics: ' + JSON.stringify(diagnostics) + '\n');
        return { ok: false, skipped: true, reason: 'rootless runtime preflight is not ready', diagnostics };
      }
      return runtime.serviceSmokeTest();
    })
    .then((result) => {
      serviceManagerSmokeTest = result;
      process.stdout.write('NELRoot service manager smoke test: ' + JSON.stringify(result) + '\n');
    })
    .catch((error) => {
      serviceManagerSmokeTest = { ok: false, error: String(error?.message || error).slice(0, 300) };
      process.stderr.write('NELRoot service manager smoke test failed: ' + serviceManagerSmokeTest.error + '\n');
    });
});

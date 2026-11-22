'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateImageName, validateShellPath, validateDockerImage, DockerRuntime, NelRootRuntime } = require('../src/runtime');
const { safeEqual, parseAllowedOrigins, originAllowed, validTerminalSize, createTicketStore } = require('../src/security');

test('image names accept simple registered identifiers', () => {
  assert.equal(validateImageName('ubuntu'), true);
  assert.equal(validateImageName('ubuntu-24.04'), true);
  assert.equal(validateImageName('../etc/passwd'), false);
  assert.equal(validateImageName('ubuntu;id'), false);
});

test('shell path must be absolute and traversal-free', () => {
  assert.equal(validateShellPath('/bin/bash'), true);
  assert.equal(validateShellPath('/usr/bin/zsh'), true);
  assert.equal(validateShellPath('bash'), false);
  assert.equal(validateShellPath('/bin/../etc/passwd'), false);
});

test('runtime constructs the documented NELRoot rootless command', () => {
  const runtime = new NelRootRuntime({ binary: '/usr/bin/nelroot', image: 'ubuntu', shell: '/bin/bash' });
  assert.deepEqual(runtime.shellCommand(), {
    file: '/usr/bin/nelroot',
    args: ['run-rootless', 'ubuntu', '--', '/bin/bash', '--noprofile', '--norc', '-i']
  });
});

test('runtime preflight uses the documented rootless CLI syntax', async () => {
  const runtime = new NelRootRuntime({ binary: '/usr/bin/nelroot', image: 'ubuntu' });
  const calls = [];
  runtime.command = async (args) => {
    calls.push(args);
    if (args[0] === '--version') return { stdout: 'NELRoot 0.1.0' };
    if (args[0] === 'engine') return { stdout: JSON.stringify({ schema_version: 1 }) };
    if (args[0] === 'image') return { stdout: '{}' };
    if (args[0] === 'run-rootless') return { stdout: '' };
    throw new Error('unexpected command');
  };
  const status = await runtime.inspect();
  assert.equal(status.ready, true);
  assert.equal(status.rootless_probe_available, true);
  assert.deepEqual(calls.find(args => args[0] === 'run-rootless'), ['run-rootless', 'ubuntu', '--', '/bin/true']);
});

test('runtime rejects unsafe image and shell configuration', () => {
  assert.throws(() => new NelRootRuntime({ image: '../../host' }));
  assert.throws(() => new NelRootRuntime({ shell: '/bin/../../bin/sh' }));
});


test('Docker image references accept pinned tags and reject unsafe input', () => {
  assert.equal(validateDockerImage('ubuntu:24.04'), true);
  assert.equal(validateDockerImage('ghcr.io/example/ubuntu:stable'), true);
  assert.equal(validateDockerImage('--privileged'), false);
  assert.equal(validateDockerImage('../../host'), false);
  assert.equal(validateDockerImage('ubuntu;id'), false);
});

test('Docker runtime builds a restricted per-session container command', async () => {
  const runtime = new DockerRuntime({
    binary: '/usr/bin/docker',
    image: 'ubuntu:24.04',
    shell: '/bin/bash'
  });
  let invocation;
  runtime.command = async (args) => {
    invocation = args;
    return { stdout: 'container-id' };
  };

  const session = await runtime.createSession();
  assert.match(session.id, /^openweb-[0-9a-f-]{36}$/);
  assert.equal(invocation[0], 'run');
  assert.ok(invocation.includes('--network'));
  assert.ok(invocation.includes('none'));
  assert.ok(invocation.includes('--read-only'));
  assert.ok(invocation.includes('--cap-drop'));
  assert.ok(invocation.includes('ALL'));
  assert.ok(invocation.includes('--pids-limit'));
  assert.ok(invocation.includes('128'));
  assert.ok(invocation.includes('--memory'));
  assert.ok(invocation.includes('512m'));
  assert.equal(invocation.at(-2), 'sleep');
  assert.equal(invocation.at(-1), 'infinity');

  assert.deepEqual(runtime.shellCommand(session), {
    file: '/usr/bin/docker',
    args: ['exec', '--interactive', '--tty', session.id, '/bin/bash', '--noprofile', '--norc', '-i']
  });
});


test('Docker preflight requires both a reachable Engine and the configured image', async () => {
  const runtime = new DockerRuntime({ image: 'ubuntu:24.04' });
  runtime.command = async (args) => {
    if (args[0] === 'info') return { stdout: 'Server Version: 27.5.1\n' };
    if (args[0] === 'image') return { stdout: '[{}]' };
    throw new Error('unexpected command');
  };
  const ready = await runtime.inspect();
  assert.equal(ready.provider, 'Docker');
  assert.equal(ready.ready, true);
  assert.equal(ready.docker_version, '27.5.1');

  runtime.command = async (args) => {
    if (args[0] === 'info') throw new Error('Docker daemon unavailable');
    if (args[0] === 'image') throw new Error('image not present');
    throw new Error('unexpected command');
  };
  const unavailable = await runtime.inspect();
  assert.equal(unavailable.ready, false);
  assert.equal(unavailable.docker_available, false);
  assert.equal(unavailable.image_available, false);
});

test('Docker runtime refuses a malformed session identifier', () => {
  const runtime = new DockerRuntime();
  assert.throws(() => runtime.shellCommand({ id: '--privileged' }));
});

test('bearer secret comparison handles mismatched values safely', () => {
  assert.equal(safeEqual('secret', 'secret'), true);
  assert.equal(safeEqual('secret', 'other'), false);
  assert.equal(safeEqual('short', 'longer'), false);
  assert.equal(safeEqual(undefined, 'secret'), false);
});

test('origin allowlist requires exact browser origin matches', () => {
  const origins = parseAllowedOrigins('https://example.test, https://app.example.test');
  assert.equal(originAllowed('', origins), false);
  assert.equal(originAllowed('https://example.test', origins), true);
  assert.equal(originAllowed('https://evil.test', origins), false);
});

test('terminal dimensions are bounded', () => {
  assert.equal(validTerminalSize(100, 30), true);
  assert.equal(validTerminalSize(1, 30), false);
  assert.equal(validTerminalSize(301, 30), false);
  assert.equal(validTerminalSize(100, 121), false);
});


test('temporary tickets are single-use and bound to their origin', () => {
  const store = createTicketStore({ ttlMs: 30000 });
  const ticket = store.issue('https://example.test');

  assert.equal(typeof ticket, 'string');
  assert.equal(ticket.length > 30, true);
  assert.equal(store.consume(ticket, 'https://evil.test'), false);
  assert.equal(store.consume(ticket, 'https://example.test'), false);
});

test('temporary tickets expire', () => {
  let currentTime = 1000;
  const store = createTicketStore({
    ttlMs: 30000,
    now: () => currentTime
  });

  const ticket = store.issue('https://example.test');

  currentTime = 31001;

  assert.equal(store.consume(ticket, 'https://example.test'), false);
  assert.equal(store.size, 0);
});

test('temporary tickets cannot be issued without an origin', () => {
  const store = createTicketStore();

  assert.throws(() => store.issue(''));
  assert.throws(() => store.issue(undefined));
});

test('a valid temporary ticket succeeds only once', () => {
  const store = createTicketStore({ ttlMs: 30000 });
  const ticket = store.issue('https://example.test');

  assert.equal(store.consume(ticket, 'https://example.test'), true);
  assert.equal(store.consume(ticket, 'https://example.test'), false);
});

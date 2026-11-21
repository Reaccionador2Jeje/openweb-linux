'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateImageName, validateShellPath, NelRootRuntime } = require('../src/runtime');
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

test('runtime constructs a fixed NELRoot command, not user-provided shell text', () => {
  const runtime = new NelRootRuntime({ binary: '/usr/bin/nelroot', image: 'ubuntu', shell: '/bin/bash' });
  assert.deepEqual(runtime.shellCommand(), {
    file: '/usr/bin/nelroot',
    args: [
      'run-rootless', 'ubuntu',
      '--cwd', '/',
      '--memory', '512M',
      '--cpu-time', '300',
      '--max-files', '256',
      '--max-file-size', '64M',
      '--', '/bin/bash', '--noprofile', '--norc', '-i'
    ]
  });
});


test('runtime accepts administrator-configured resource limits', () => {
  const runtime = new NelRootRuntime({
    memory: '1G',
    cpuTime: '90',
    maxFiles: '128',
    maxFileSize: '32M'
  });
  assert.deepEqual(runtime.shellCommand().args.slice(4, 12), [
    '--memory', '1G',
    '--cpu-time', '90',
    '--max-files', '128',
    '--max-file-size', '32M'
  ]);
});

test('runtime rejects invalid resource limit configuration', () => {
  assert.throws(() => new NelRootRuntime({ memory: '512M;id' }));
  assert.throws(() => new NelRootRuntime({ cpuTime: '0' }));
  assert.throws(() => new NelRootRuntime({ maxFiles: '-1' }));
  assert.throws(() => new NelRootRuntime({ maxFileSize: 'oops' }));
});

test('runtime rejects unsafe image and shell configuration', () => {
  assert.throws(() => new NelRootRuntime({ image: '../../host' }));
  assert.throws(() => new NelRootRuntime({ shell: '/bin/../../bin/sh' }));
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

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateImageName, validateShellPath, NelRootRuntime } = require('../src/runtime');
const { safeEqual, parseAllowedOrigins, originAllowed, validTerminalSize } = require('../src/security');

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
    args: ['run-rootless', 'ubuntu', '--cwd', '/', '--', '/bin/bash', '--noprofile', '--norc', '-i']
  });
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
  assert.equal(originAllowed('', origins), true);
  assert.equal(originAllowed('https://example.test', origins), true);
  assert.equal(originAllowed('https://evil.test', origins), false);
});

test('terminal dimensions are bounded', () => {
  assert.equal(validTerminalSize(100, 30), true);
  assert.equal(validTerminalSize(1, 30), false);
  assert.equal(validTerminalSize(301, 30), false);
  assert.equal(validTerminalSize(100, 121), false);
});

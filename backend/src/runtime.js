'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function validateImageName(name) {
  return typeof name === 'string'
    && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(name);
}

function validateShellPath(shell) {
  return typeof shell === 'string'
    && /^\/[a-zA-Z0-9_./+-]+$/.test(shell)
    && !shell.split('/').includes('..');
}

class NelRootRuntime {
  constructor(options = {}) {
    this.binary = options.binary || process.env.NELROOT_BIN || 'nelroot';
    this.image = options.image || process.env.NELROOT_IMAGE || 'ubuntu';
    this.shell = options.shell || process.env.NELROOT_SHELL || '/bin/bash';
    this.execTimeoutMs = options.execTimeoutMs || 8000;
    if (!validateImageName(this.image)) throw new Error('NELROOT_IMAGE has an invalid name');
    if (!validateShellPath(this.shell)) throw new Error('NELROOT_SHELL must be a safe absolute path');
  }

  async command(args) {
    return execFileAsync(this.binary, args, {
      timeout: this.execTimeoutMs,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, NO_COLOR: '1' }
    });
  }

  async inspect() {
    const [versionResult, engineResult, imageResult, rootlessResult] = await Promise.allSettled([
      this.command(['--version']),
      this.command(['engine', 'status', '--json']),
      this.command(['image', 'inspect', this.image]),
      this.command(['run-rootless', this.image, '--', '/bin/true'])
    ]);

    const version = versionResult.status === 'fulfilled'
      ? versionResult.value.stdout.trim().slice(0, 160)
      : null;
    let engine = null;
    let engineError = null;
    if (engineResult.status === 'fulfilled') {
      try { engine = JSON.parse(engineResult.value.stdout); }
      catch { engineError = 'NELRoot returned invalid JSON from engine status'; }
    } else {
      engineError = String(engineResult.reason?.message || 'NELRoot engine status failed').slice(0, 300);
    }

    const imageAvailable = imageResult.status === 'fulfilled';
    const binaryAvailable = versionResult.status === 'fulfilled';
    const rootlessAvailable = rootlessResult.status === 'fulfilled';
    return {
      provider: 'NELRoot',
      binary_available: binaryAvailable,
      version,
      engine_status_available: Boolean(engine),
      image: this.image,
      image_available: imageAvailable,
      rootless_probe_available: rootlessAvailable,
      ready: binaryAvailable && Boolean(engine) && imageAvailable && rootlessAvailable,
      limitations: [
        'NELRoot rootless execution currently uses the host kernel and requires a same-architecture Linux image.',
        'The guest root filesystem is read-only except for its temporary /tmp mount.',
        'NELRoot does not yet enforce CPU, memory, process-count or file-size quotas.',
        'The private /dev mount is minimal and does not yet provide standard device nodes.',
        'Persistent host workspace mounts are not yet provided by NELRoot.',
        'This backend does not provide a VM or a complete security sandbox.'
      ],
      ...(engineError ? { engine_error: engineError } : {}),
      ...(imageAvailable ? {} : { image_error: String(imageResult.reason?.message || 'Image is not registered').slice(0, 300) }),
      ...(rootlessAvailable ? {} : { rootless_probe_error: String(rootlessResult.reason?.message || 'Rootless execution preflight failed').slice(0, 300) })
    };
  }

  shellCommand() {
    // Only fixed, administrator-configured executable and image values reach the PTY.
    return {
      file: this.binary,
      args: [
        'run-rootless',
        this.image,
        '--',
        this.shell,
        '--noprofile',
        '--norc',
        '-i'
      ]
    };
  }
}

module.exports = { NelRootRuntime, validateImageName, validateShellPath };

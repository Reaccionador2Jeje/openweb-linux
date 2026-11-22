'use strict';

const crypto = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

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
    this.provider = 'NELRoot';
    this.binary = options.binary || process.env.NELROOT_BIN || 'nelroot';
    this.image = options.image || process.env.NELROOT_IMAGE || 'ubuntu';
    this.shell = options.shell || process.env.NELROOT_SHELL || '/bin/bash';
    this.execTimeoutMs = options.execTimeoutMs || 8000;
    this.smokeTestDaemon = null;
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
        'NELRoot uses the host Linux kernel and requires a same-architecture Linux image; it is not a virtual machine.',
        'The guest root filesystem is read-only except for bounded temporary storage.',
        'NELRoot applies address-space, CPU-time, open-file and file-size limits, but process-count and storage quotas are not implemented.',
        'The guest has private user, mount, PID and network namespaces; its private /dev tmpfs does not yet provide the full standard device-node set.',
        'Persistent host workspace mounts and host port publishing are not implemented.',
        'The OpenWeb TTY currently exposes an interactive shell only; it does not yet expose NELRoot service-daemon lifecycle controls.',
        'This backend is not a complete security boundary for untrusted multi-user workloads.'
      ],
      ...(engineError ? { engine_error: engineError } : {}),
      ...(imageAvailable ? {} : { image_error: String(imageResult.reason?.message || 'Image is not registered').slice(0, 300) }),
      ...(rootlessAvailable ? {} : { rootless_probe_error: String(rootlessResult.reason?.message || 'Rootless execution preflight failed').slice(0, 300) })
    };
  }

  async serviceSmokeTest() {
    const environment = `openweb-smoke-${process.pid}-${Date.now()}`;
    const service = 'sleep-probe';
    const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'nelroot-openweb-'));
    const manifestPath = path.join(tempDirectory, 'service.toml');
    let environmentCreated = false;
    let daemon = null;
    let daemonSpawnError = null;

    const run = (args) => this.command(args);
    const parseStatus = (result) => {
      const payload = JSON.parse(result.stdout);
      if (payload.result !== 'status' || !payload.data) {
        throw new Error('NELRoot returned an unexpected service status response');
      }
      return payload.data;
    };

    try {
      await fs.writeFile(manifestPath, [
        'schema_version = 1',
        '',
        '[[services]]',
        `name = "${service}"`,
        'command = "/bin/sleep"',
        'args = ["30"]',
        'working_directory = "/"',
        'restart = "never"',
        ''
      ].join('\n'), { mode: 0o600 });

      await run(['server', 'create', this.image, '--name', environment]);
      environmentCreated = true;

      daemon = spawn(this.binary, ['service', 'daemon'], {
        stdio: 'ignore',
        env: { ...process.env, NO_COLOR: '1' }
      });
      daemon.on('error', (error) => { daemonSpawnError = error; });
      this.smokeTestDaemon = daemon;

      let ready = false;
      let lastError = null;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (daemonSpawnError) throw daemonSpawnError;
        if (daemon.exitCode !== null || daemon.signalCode !== null) {
          throw new Error(`NELRoot service daemon exited early with code ${daemon.exitCode}`);
        }
        try {
          await run(['service', 'list', environment]);
          ready = true;
          break;
        } catch (error) {
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      if (!ready) {
        throw new Error(`NELRoot service daemon did not become ready: ${String(lastError?.message || 'timeout').slice(0, 240)}`);
      }

      await run(['service', 'register', environment, manifestPath]);
      parseStatus(await run(['service', 'start', environment, service]));
      const running = parseStatus(await run(['service', 'status', environment, service]));
      if (running.state !== 'running') {
        throw new Error(`service did not reach running state (state: ${running.state})`);
      }

      const stopped = parseStatus(await run(['service', 'stop', environment, service]));
      if (stopped.state !== 'stopped') {
        throw new Error(`service did not reach stopped state (state: ${stopped.state})`);
      }

      return {
        ok: true,
        environment,
        service,
        started_state: running.state,
        stopped_state: stopped.state
      };
    } finally {
      if (daemon && daemon.pid && daemon.exitCode === null && daemon.signalCode === null) {
        await this.stopServiceSmokeTest();
      }
      if (this.smokeTestDaemon === daemon) this.smokeTestDaemon = null;
      if (environmentCreated) {
        try { await run(['server', 'remove', environment]); } catch {}
      }
      await fs.rm(tempDirectory, { recursive: true, force: true });
    }
  }

  async destroySession() {}

  async stopServiceSmokeTest() {
    const daemon = this.smokeTestDaemon;
    if (!daemon || !daemon.pid || daemon.exitCode !== null || daemon.signalCode !== null) {
      return;
    }

    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2000);
      daemon.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
      daemon.kill('SIGTERM');
    });

    if (daemon.exitCode === null && daemon.signalCode === null) {
      daemon.kill('SIGKILL');
    }
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


function validateDockerImage(name) {
  return typeof name === 'string'
    && /^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,127}$/.test(name);
}

class DockerRuntime {
  constructor(options = {}) {
    this.provider = 'Docker';
    this.binary = options.binary || process.env.DOCKER_BIN || 'docker';
    this.image = options.image || process.env.OPENWEB_DOCKER_IMAGE || 'ubuntu:24.04';
    this.shell = options.shell || process.env.OPENWEB_DOCKER_SHELL || '/bin/bash';
    this.execTimeoutMs = options.execTimeoutMs || 15000;
    if (!validateDockerImage(this.image)) throw new Error('OPENWEB_DOCKER_IMAGE has an invalid name');
    if (!validateShellPath(this.shell)) throw new Error('OPENWEB_DOCKER_SHELL must be a safe absolute path');
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
    const [daemon, image] = await Promise.allSettled([
      this.command(['info']),
      this.command(['image', 'inspect', this.image])
    ]);
    const daemonOutput = daemon.status === 'fulfilled' ? daemon.value.stdout : '';
    const daemonAvailable = daemon.status === 'fulfilled'
      && /Server Version:/i.test(daemonOutput);
    const dockerVersion = daemonAvailable
      ? (daemonOutput.match(/Server Version:\s*([^\r\n]+)/i)?.[1] || 'available').trim()
      : null;
    const imageAvailable = image.status === 'fulfilled';
    return {
      provider: 'Docker',
      docker_available: daemonAvailable,
      docker_version: dockerVersion,
      image: this.image,
      image_available: imageAvailable,
      ready: daemonAvailable && imageAvailable,
      ...(daemonAvailable ? {} : {
        docker_error: String(daemon.reason?.message || 'Docker Engine is unreachable').slice(0, 300)
      }),
      ...(imageAvailable ? {} : {
        image_error: String(image.reason?.message || 'Docker image is not present on the configured engine').slice(0, 300)
      }),
      limitations: [
        'Each terminal receives a separate container with no network, no host volumes and a read-only root filesystem.',
        'The container has bounded memory, CPU, process count, file descriptors and temporary storage.',
        'The Docker Engine endpoint is highly privileged; use a dedicated host and never expose an unauthenticated TCP Docker API.',
        'Session data is ephemeral and the container is removed when the session ends.',
        'This is an early single-user terminal runtime, not a reviewed public multi-tenant execution platform.'
      ]
    };
  }

  async createSession() {
    const id = 'openweb-' + crypto.randomUUID();
    const args = [
      'run', '--detach', '--rm',
      '--name', id,
      '--network', 'none',
      '--memory', '512m',
      '--memory-swap', '512m',
      '--cpus', '1',
      '--pids-limit', '128',
      '--ulimit', 'nofile=256:256',
      '--ulimit', 'fsize=67108864:67108864',
      '--read-only',
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
      '--tmpfs', '/run:rw,noexec,nosuid,size=16m',
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges',
      '--user', '1000:1000',
      '--workdir', '/tmp',
      '--env', 'HOME=/tmp',
      '--env', 'TERM=xterm-256color',
      '--env', 'HISTFILE=/dev/null',
      this.image,
      'sleep', 'infinity'
    ];
    await this.command(args);
    return { id };
  }

  shellCommand(session) {
    if (!session || typeof session.id !== 'string' || !/^openweb-[0-9a-f-]{36}$/.test(session.id)) {
      throw new Error('Invalid Docker session');
    }
    return {
      file: this.binary,
      args: ['exec', '--interactive', '--tty', session.id, this.shell, '--noprofile', '--norc', '-i']
    };
  }

  async destroySession(session) {
    if (!session || typeof session.id !== 'string' || !/^openweb-[0-9a-f-]{36}$/.test(session.id)) return;
    try { await this.command(['rm', '--force', session.id]); } catch {}
  }

  async stopServiceSmokeTest() {}
}

function createRuntime() {
  const provider = (process.env.OPENWEB_RUNTIME || 'docker').toLowerCase();
  if (provider === 'docker') return new DockerRuntime();
  if (provider === 'nelroot') return new NelRootRuntime();
  throw new Error('OPENWEB_RUNTIME must be either docker or nelroot');
}

module.exports = { NelRootRuntime, DockerRuntime, createRuntime, validateImageName, validateShellPath, validateDockerImage };

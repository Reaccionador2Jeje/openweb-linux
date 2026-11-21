# OpenWeb Linux — TTY

**OpenWeb Linux is a fullscreen terminal interface for a real Ubuntu userspace, powered by NELRoot.** The browser renders xterm.js; a separate Node.js backend launches the interactive shell through NELRoot. This is not the old JavaScript shell simulation.

[Open the GitHub Pages demo](https://reaccionador2jeje.github.io/openweb-linux/) · [Source code](https://github.com/Reaccionador2Jeje/openweb-linux) · [Backend setup](backend/README.md)

> **Status:** TTY frontend and experimental NELRoot backend are integrated into `main`. GitHub Pages deployment is configured to run automatically on pushes to `main`. The backend has not been deployed to a Linux host yet, so the page can render the TTY but cannot execute Ubuntu commands until a host is configured and connected.

## TTY interface

- Fullscreen pure-black terminal; no desktop panels, tabs or simulated shell UI.
- xterm.js with ANSI colors, cursor, scrollback and terminal resizing.
- Access token requested in the terminal prompt and masked while typing.
- WebSocket PTY connection to the NELRoot backend.
- JSON messages for terminal input, output, resize, readiness and exit.
- Backend URL configured in `public/js/config.js`; no permanent token is embedded in frontend source.

## Architecture

```text
Browser / GitHub Pages
  index.html + xterm.js
        |
        | WSS /terminal?token=...
        v
OpenWeb Linux Node.js backend
  WebSocket + node-pty
        |
        | fixed NELRoot CLI arguments
        v
NELRoot rootless launcher
        |
        v
Ubuntu root filesystem + host Linux kernel
```

GitHub Pages serves only static files. It cannot run the Linux backend. The backend needs a separate Linux host with NELRoot, a registered Ubuntu image, Node.js 22+, npm and the native build requirements for `node-pty`.

## Frontend setup

Set the backend endpoint in `public/js/config.js`:

```js
window.OPENWEB_TTY_CONFIG = Object.freeze({
  backendUrl: "wss://tty-api.example.com/terminal"
});
```

Do not put the access token in this file. Users enter the token into the terminal prompt. For local testing, a URL override is supported:

```text
?backend=ws://127.0.0.1:8787/terminal
```

An HTTPS frontend requires WSS; browsers block insecure WebSocket connections from HTTPS pages.

## Backend setup

Read [backend/README.md](backend/README.md) and [NELRoot integration notes](docs/NELROOT-BACKEND.md).

Quick setup on the Linux host:

```sh
cd backend
cp .env.example .env
# Configure a unique random OPENWEB_ACCESS_TOKEN (at least 32 characters).
npm install
npm test
npm run check
npm start
```

The service binds to `127.0.0.1:8787` by default. Put it behind a TLS reverse proxy; do not expose the Node.js port directly to the public internet. NELRoot must be installed and available to the unprivileged service account, and the Ubuntu rootfs image must already be registered.

## Current NELRoot limitations

This is an integration milestone, not a production multi-tenant cloud workspace:

- NELRoot currently uses the host Linux kernel and requires a same-architecture image.
- The guest root filesystem is read-only except for temporary `/tmp`.
- Persistent host workspace mounts are not implemented yet.
- PID namespace supervision, guest `/proc` and `/dev`, resource quotas and isolated networking are not implemented yet.
- Package installation with `apt`, persistent project files and long-running background services are not promised by this stage.
- This is not a VM or an absolute security boundary.

Do not use this backend for untrusted public workloads until the missing runtime controls and a security review are complete.

## API

- `GET /health` — backend liveness.
- `GET /api/status` — authenticated NELRoot and image preflight.
- `GET /terminal?token=...` — authenticated WebSocket PTY.

The WebSocket client sends JSON `input` and `resize` messages. The server emits `ready`, `output`, `error` and `exit` messages. The query-token mechanism is for controlled testing; before public multi-user launch it should be replaced with a short-lived session exchange to reduce credential exposure in URLs and proxy logs.

## Legacy browser simulator

The previous JavaScript simulation files are retained in the repository as historical/reference code. The active `index.html` no longer loads that simulator; it loads only the TTY frontend.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` publishes the static frontend from `main` on every push. The TTY frontend is now integrated into `main`; check the GitHub Actions Pages deployment run for publication status. The NELRoot backend must be deployed separately on a Linux host.


# Native Linux deployment (recommended for NELRoot)

Render's current container rejects NELRoot's private mount-propagation operation with `EPERM`. This deployment runs the OpenWeb backend directly as an unprivileged Linux account instead of nesting NELRoot inside Render's container.

## Host requirements

- A Linux host/VM where the kernel and hosting policy permit unprivileged user namespaces, mount namespaces, and the mount operations used by NELRoot.
- Node.js 22+, npm, and the native build prerequisites required by `node-pty` (a C/C++ toolchain and Python).
- NELRoot installed for the host architecture.
- An Ubuntu rootfs image registered in NELRoot under the name configured by `NELROOT_IMAGE`.
- A TLS reverse proxy in front of the backend. The Node service binds to loopback only.

Do not assume that every VPS/container provider allows these kernel features. Run the preflight before configuring the public endpoint. Do not grant broad capabilities such as `SYS_ADMIN`, run the backend as root, or replace NELRoot with `chroot`/PRoot to force a green check.

## 1. Install the application

Place this repository at `/opt/openweb-linux`, install Node.js 22 and NELRoot, and create a dedicated unprivileged account:

```sh
sudo useradd --system --create-home --shell /usr/sbin/nologin openweb
sudo install -d -o openweb -g openweb /home/openweb/.nelroot
sudo install -d -o root -g openweb -m 0750 /etc/openweb-linux
sudo chown -R openweb:openweb /opt/openweb-linux
```

Install backend dependencies (including the native `node-pty` module):

```sh
cd /opt/openweb-linux/backend
npm ci --omit=dev
```

Initialize NELRoot and register the rootfs as the `openweb` account. The exact image import command depends on how the rootfs archive was obtained; the final requirement is that `nelroot image inspect ubuntu` succeeds while running as `openweb`.

## 2. Configure secrets

Create `/etc/openweb-linux/openweb.env` with the values below. Use the actual backend URL and GitHub OAuth values. Never commit this file.

```dotenv
OPENWEB_ACCESS_TOKEN=replace-with-a-random-secret-of-at-least-32-characters
NELROOT_BIN=/usr/local/bin/nelroot
NELROOT_IMAGE=ubuntu
NELROOT_SHELL=/bin/bash
OPENWEB_ALLOWED_ORIGINS=https://reaccionador2jeje.github.io
OPENWEB_GITHUB_CLIENT_ID=
OPENWEB_GITHUB_CLIENT_SECRET=
OPENWEB_BACKEND_PUBLIC_URL=https://your-backend.example
OPENWEB_FRONTEND_URL=https://reaccionador2jeje.github.io/openweb-linux/
OPENWEB_GITHUB_ALLOWED_USERS=Reaccionador2Jeje
OPENWEB_MAX_SESSIONS=2
OPENWEB_IDLE_TIMEOUT_MS=1800000
OPENWEB_MAX_INPUT_BYTES=16384
```

Protect the file:

```sh
sudo chown root:openweb /etc/openweb-linux/openweb.env
sudo chmod 0640 /etc/openweb-linux/openweb.env
```

Generate a strong token on the host (for example, with `openssl rand -hex 32`) and paste it into the environment file. Do not share it in chat or GitHub.

## 3. Run the real capability preflight

Run as the same unprivileged account that will run the backend:

```sh
sudo -u openweb env NELROOT_BIN=/usr/local/bin/nelroot NELROOT_IMAGE=ubuntu /opt/openweb-linux/deploy/native/preflight.sh
```

The script checks the binary, engine status, image registration, and actually launches `/bin/true` through `run-rootless`. The final probe is decisive: if it reports `Permission denied` or `Operation not permitted`, this host is not suitable yet. Keep the TTY disabled and choose a host that explicitly supports the required namespace and mount operations.

## 4. Install and start systemd unit

```sh
sudo install -m 0644 /opt/openweb-linux/deploy/native/openweb-linux.service /etc/systemd/system/openweb-linux.service
sudo systemctl daemon-reload
sudo systemctl enable --now openweb-linux
sudo systemctl status openweb-linux
```

The unit runs the preflight again before every start. It runs as `openweb`, binds to `127.0.0.1:8787`, and restarts after unexpected failures. The service deliberately does not enable extra systemd mount/user namespace sandboxing because those restrictions can interfere with NELRoot's own namespace setup. Keep the host dedicated to this workload and review the isolation model before allowing untrusted users.

## 5. Reverse proxy and frontend

Configure a TLS reverse proxy to forward HTTPS and WebSocket traffic to `http://127.0.0.1:8787`. Set `OPENWEB_BACKEND_PUBLIC_URL` to the public HTTPS URL and update the GitHub OAuth callback to:

`https://your-backend.example/auth/github/callback`

Set the frontend's `backendUrl` to the matching secure WebSocket endpoint, for example `wss://your-backend.example/terminal`. Keep the admin token server-side only.

## 6. Troubleshooting

- `mount propagation private: Permission denied`: hosting policy/kernel restriction. Do not bypass it; move to a compatible Linux host.
- `image is not registered`: register the Ubuntu rootfs as the `openweb` user and rerun preflight.
- `NELRoot executable not found`: set `NELROOT_BIN` to the absolute path.
- Backend starts but GitHub login fails: verify OAuth client credentials, callback URL, allowlist, frontend origin and public backend URL.
- Inspect logs with `sudo journalctl -u openweb-linux -n 100 --no-pager`.

This is a deployment path, not a claim that the current Render service can run NELRoot. Render may continue hosting other components, but the interactive backend must point to a host that passes the actual rootless preflight.

# OpenWeb Local Mode (Android / Termux)

OpenWeb Local Mode lets the GitHub Pages interface connect to a backend running on the **same device**. It does not require a VPS, public backend URL, port forwarding, or exposing a terminal to the internet.

This is an experimental development path. Android is not a standard Linux server: Termux uses Android's kernel and Bionic environment, and Android security policy may block the namespace and mount operations NELRoot needs. The native `node-pty` dependency may also fail to build on some Android devices. **Do not assume it works until both the backend and NELRoot preflight succeed.**

## How it is wired

```text
Chrome on Android
  GitHub Pages: /openweb-linux/?mode=local
       |
       | HTTP + WebSocket to loopback only
       v
127.0.0.1:8787 (Termux / Node.js backend)
       |
       v
NELRoot rootless preflight
       |
       v
Ubuntu rootfs (only if Android permits it)
```

The browser uses `127.0.0.1`, not a public IP. The backend must bind to `127.0.0.1`; do not change it to `0.0.0.0` for this mode.

## Backend configuration

In the backend environment file, configure:

```dotenv
HOST=127.0.0.1
PORT=8787
OPENWEB_ENABLE_LOCAL_AUTH=true
OPENWEB_ALLOWED_ORIGINS=https://reaccionador2jeje.github.io
OPENWEB_ACCESS_TOKEN=your-own-long-random-secret
NELROOT_BIN=nelroot
NELROOT_IMAGE=ubuntu
NELROOT_SHELL=/bin/bash
OPENWEB_NELROOT_SERVICE_SMOKE_TEST=false
```

Keep the access token only in Termux/backend configuration. Do not commit it, paste it into GitHub, send it to anyone, or put it in `public/js/config.js`. The local page sends it only to `http://127.0.0.1:8787` to obtain a short-lived, single-use WebSocket ticket. It is not saved in local storage and the input is cleared after use.

The local-session endpoint is disabled by default and only works when `OPENWEB_ENABLE_LOCAL_AUTH=true`. It still requires the exact allowed Origin and the bearer token.

## Open the local interface

Once the backend is running and listening on `127.0.0.1:8787`, open:

`https://reaccionador2jeje.github.io/openweb-linux/?mode=local`

Enter the local access token configured for the backend. The browser connects to the loopback backend; the normal hosted GitHub OAuth flow is not used in Local Mode.

If the browser reports a connection error, check that the backend is running and that Android/browser policy permits the local WebSocket connection.

## Android / NELRoot compatibility

Before treating this as usable, all of these must work on the device:

1. Node.js 22 and the backend dependencies install successfully, including the native `node-pty` module.
2. NELRoot can run on the device's Android/Linux environment.
3. The configured Ubuntu image matches the device architecture.
4. Running `nelroot run-rootless ubuntu -- /bin/true` as the same unprivileged Termux user succeeds.
5. The backend can open a PTY and the browser can connect to its loopback WebSocket.

Android may reject user namespaces, mount namespaces, mount propagation, or `pivot_root` even when Termux itself works. If the NELRoot preflight fails, keep the terminal disabled. Do not root the phone, disable SELinux, grant broad capabilities, or substitute `chroot`/PRoot and describe it as NELRoot isolation.

## Limitations

- Local Mode is for development on the same device, not a public multi-user terminal host.
- The backend and NELRoot process stop when Termux is stopped or Android terminates the process.
- No background uptime, public access, port publishing, or persistent cloud storage is provided.
- A GitHub Pages outage or internet disconnection prevents loading the hosted interface, even though the backend is local.
- If Android cannot run NELRoot, Local Mode can still be used to test the connection UI, but it cannot provide a real Ubuntu shell.

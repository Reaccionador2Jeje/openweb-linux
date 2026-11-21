# OpenWeb Linux on Render

This deployment package builds the NELRoot CLI from a pinned NELRoot commit,
creates a minimal Ubuntu 24.04 root filesystem during the Docker build, and
runs the Node.js WebSocket backend as an unprivileged service user.

## Important deployment boundary

This is an **admin-only runtime compatibility preview**, not the public
multi-user product. It deliberately keeps the existing shared administrator
access token. Do not publish the token, place it in frontend JavaScript, or
give it to ordinary users.

The current NELRoot rootless runtime is not a VM or a complete security
sandbox. It uses Linux user and mount namespaces and the host kernel. A
hosting platform may block those operations inside its container. A successful
Render health check only proves that the Node.js process is alive; it does not
prove that NELRoot can launch a shell.

Before enabling any public terminal access, verify all of the following:
- `GET /health` returns HTTP 200.
- Authenticated `GET /api/status` reports the binary, engine and Ubuntu image.
- A controlled shell test successfully starts and exits inside NELRoot.
- The runtime is reviewed for namespace isolation, process supervision,
  networking, writable workspaces and aggregate resource quotas.

The current integration does not provide persistent user workspaces, per-user
Linux identities, public account registration, aggregate cgroup quotas,
isolated guest networking, or complete PID supervision. Do not advertise
persistent files, apt installation, or multi-user shell accounts yet.

## Render configuration

The root `render.yaml` describes one free Docker web service in Oregon.
It does not create a database or persistent disk and does not modify any
existing Render service. Free instances can sleep and their writable container
filesystem is ephemeral; this is suitable only for compatibility testing.

Render requires a secret value for `OPENWEB_ACCESS_TOKEN`. Set it privately
in the service Environment page. Use a randomly generated value of at least
32 characters. Never commit it or paste it into chat.

The service uses:
- `HOST=0.0.0.0` and Render's injected `PORT`;
- the exact GitHub Pages origin allowlist;
- a two-session limit and per-process NELRoot limits;
- a non-root Linux account for the backend and NELRoot launcher.

## Local container validation

Build and run on a Linux host that permits unprivileged user namespaces:

```sh
docker build -t openweb-linux-backend .
docker run --rm -p 10000:10000 \
  -e OPENWEB_ACCESS_TOKEN='replace-with-a-random-secret-of-32-or-more-characters' \
  -e OPENWEB_ALLOWED_ORIGINS='https://reaccionador2jeje.github.io' \
  openweb-linux-backend
```

Check liveness at `http://127.0.0.1:10000/health`. Use the existing
authenticated status endpoint to inspect NELRoot, then perform a controlled
shell test. If namespace creation is denied, the backend must remain
unavailable for terminal sessions on that host.

## Next production milestones

1. Prove NELRoot compatibility and strengthen process/network isolation on the
   selected hosting kernel.
2. Implement real accounts, invite-only enrollment, secure cookie sessions and
   short-lived WebSocket tickets. Keep the administrator token admin-only.
3. Add separate persistent home/workspace storage and per-user Linux identity
   mapping.
4. Enforce aggregate CPU, memory, process, disk and session quotas.
5. Run a security review before opening terminal access to the public.

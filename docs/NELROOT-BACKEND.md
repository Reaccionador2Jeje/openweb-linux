# OpenWeb Linux — NELRoot backend integration

OpenWeb Linux delegates terminal process creation to NELRoot. The backend does not emulate Linux commands and does not invoke Docker.

## Request path

```text
Browser / xterm.js
       |
       | WebSocket (terminal input/output + resize)
       v
OpenWeb Node.js backend
       |
       | fixed PTY command
       v
NELRoot CLI
       |
       | run-rootless <image> -- <shell>
       v
Linux host kernel + registered Ubuntu rootfs
```

## Why this is a staged integration

The NELRoot rootless runtime launches a same-architecture program from a read-only rootfs with bounded writable temporary storage, private user/mount/PID/network namespaces, guest `/proc`, a private tmpfs `/dev`, a host-side process supervisor and basic process resource limits. Persistent host workspace mounts, full standard device nodes, graceful signal forwarding, process-count/storage quotas and host port publishing remain pending. The local NELRoot service daemon and CLI lifecycle controls are implemented on Linux, but this OpenWeb backend currently exposes only the interactive TTY; it does not yet bridge those service controls into the web application. Consequently this is an interactive shell integration target, not a full cloud development workspace.

OpenWeb Linux must not claim that `apt install`, persistent files, background services or arbitrary multi-user workloads are supported until the corresponding NELRoot capabilities exist and pass integration tests.

### Host capability gate observed on Render

The current Render deployment has the NELRoot binary and Ubuntu image, but the real `run-rootless ubuntu -- /bin/true` probe fails when NELRoot attempts `mount(MS_REC | MS_PRIVATE)` after entering its user and mount namespaces. The kernel returns `EPERM` (`Permission denied`, errno 13). OpenWeb keeps the TTY disabled in this case. This is a hosting-policy/kernel capability restriction; it cannot be repaired by changing the Ubuntu rootfs, and OpenWeb must not bypass it with `chroot` or privileged fallback behavior. Deploy the backend on a Linux host that explicitly permits the required user-namespace and mount operations.

## Startup service-manager smoke test

The backend runs a bounded integration check after it begins listening (unless `OPENWEB_NELROOT_SERVICE_SMOKE_TEST=false`). If the rootless preflight succeeds, it creates a temporary server-environment definition, launches the local `nelroot service daemon`, registers a manifest for `/bin/sleep`, confirms the service reaches `running`, stops it, and removes the temporary environment. The result is logged and exposed in the administrator-protected `/api/status` response. This verifies the NELRoot service lifecycle on the actual OpenWeb host; it does not expose guest networking or add service controls to the browser TTY.


## Configuration

See [backend/README.md](../backend/README.md) and [backend/.env.example](../backend/.env.example).

The image name and shell executable are operator-controlled environment variables. User messages are never interpolated into a host shell command.

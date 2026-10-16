# OpenWeb Linux

OpenWeb Linux runs Alpine Linux in a browser with the v86 x86 emulator. The bundled Alpine virt image boots directly into a lightweight live console; run `setup-alpine` to configure and install it to the virtual disk.

## Features

- Alpine Linux 3.24.2 x86 (32-bit), using the official virt ISO
- v86, SeaBIOS, and VGA BIOS bundled with the project
- 256 MiB emulated RAM and a 512 MiB virtual disk
- The Alpine `apk` package manager and OpenRC service manager
- Multiple browser workspace terminals, shared files, and local workspace backups
- On-screen touch keyboard that can send keys to the virtual machine
- Local IndexedDB or downloadable v86 state backups; no account required

## Browser workspace

Before entering Alpine, the page offers a local file workspace. Commands include `help`, `pwd`, `ls`, `cd`, `tree`, `find`, `cat`, `head`, `tail`, `grep`, `wc`, `echo`, `history`, `touch`, `write`, `mkdir`, `rmdir`, `cp`, `mv`, `rm`, `download`, and `save`.

This workspace is not an operating-system shell: its commands only operate on files stored by the browser. Use the Alpine VM for Linux commands. Workspace files are shared across browser terminal tabs.

## Start and install Alpine

1. Open the site over HTTPS and choose **Arrancar Alpine**.
2. At the Alpine console, enter `root` to log in; the live image starts without asking for a password.
3. Run `setup-alpine` and follow the prompts. For networking, select `eth0`; choose a nearby Alpine mirror.
4. Choose the virtual disk `/dev/sda` when asked to install Alpine. The virtual disk is 512 MiB; keep the installation minimal.
5. After setup, save the v86 state. The virtual disk and live session are lost when the page is closed or reloaded unless the VM state is saved.

Alpine uses `apk`, not `apt`. For example, run `apk update`, `apk add <package>`, or `apk info` inside the Alpine console. Alpine uses OpenRC rather than systemd; use `rc-status`, `rc-service <service> status`, or `rc-update add <service> default`.

The VM network is relayed through the public `wss://relay.widgetry.org/` endpoint. The connection passes through a third-party relay; do not enter sensitive credentials while using it.

## Terminal tabs and touch keyboard

Use **+** and **×** on the terminal tab bar to open or close browser workspace terminals. Each tab keeps its own command history while sharing workspace files. The VM, when running, is one shared machine.

Choose **⌨ Teclado** to show the on-screen keyboard. It writes into the browser workspace, or sends characters and special keys to Alpine when the VM is active.

## Save and restore

No sign-in or cloud account is required. **Guardar** offers a workspace `.json` download and, while the VM is running, a local browser copy or a v86 state `.bin` download. **Abrir** restores a local Alpine snapshot or imports a backup.

Browser-local copies are limited to that browser and may be removed or restricted by its storage quota. Transfer the `.bin` file to move a VM to another device. Older Debian VM state files created by the previous Debian configuration are not compatible with this Alpine VM; workspace JSON files remain usable.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` deploys the static site when changes are pushed to `main`. In the repository settings, select **GitHub Actions** as the Pages source. GitHub Pages serves the site over HTTPS; v86 does not work from `file://`.

## Bundled assets

Asset origins, licenses, and SHA-256 hashes are documented in [public/ASSETS.md](./public/ASSETS.md). The Alpine x86 virt ISO can also be downloaded from [Alpine Linux](https://dl-cdn.alpinelinux.org/alpine/latest-stable/releases/x86/alpine-virt-3.24.2-x86.iso).

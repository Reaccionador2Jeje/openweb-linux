

# OpenWeb Linux

OpenWeb Linux is an experimental project for installing a minimal Debian 12 i386 system in the browser. It boots Debian's network installer with the v86 JavaScript emulator; the guest OS must first be installed to the browser's virtual disk.

## Overview

OpenWeb Linux is a browser-based Linux installer focused on accessibility, portability, and usability. The installer runs in the web page; the installed guest system and its package manager run inside the emulated machine.

## Features

- Boots the Debian 12 i386 network installer in the browser
- Built on the v86 emulator
- Provides apt after Debian is installed in the virtual machine
- Documents Debian `systemd` service management and GRUB bootloader basics
- Includes an OpenWeb Linux logo and browser-tab icon
- Supports local file commands, command history, and JSON workspace backups
- Provides multiple browser terminal tabs that share the same workspace files
- Designed to be complete and self-contained
- Boots from the Debian installer ISO bundled with the site; no separate ISO download is required
- No third-party asset host is needed for the default kernel and emulator files
- Lightweight and portable enough to use from nearly any browser

## How it works

OpenWeb Linux serves the default kernel and emulator assets directly from the project itself. The browser loads the Linux environment through the v86 emulator, which emulates an x86 machine and boots the operating system inside the page.

This approach makes OpenWeb Linux more than a static browser demo: it boots the real Debian installer in the web page. Completing the Debian installation is necessary before using the guest OS or apt. Before booting, the browser terminal also provides a local workspace (`help`, `write`, `touch`, `download`, `save`); it is not a shell and does not execute arbitrary operating-system commands.

## Package Manager

After Debian is installed, apt can install and manage software inside the emulated environment. The bundled mini ISO is an installer, not a live system, so apt is not available in a normal guest shell until setup is complete.

## Services and bootloader

The Debian installer can install GRUB to the virtual disk as part of setup; a second bootloader is not needed for a single Debian installation. After booting the installed system, manage services with `systemctl` (for example, `systemctl --type=service --state=running` or `sudo systemctl enable --now <service>`). Install a service's package first with apt. The website's apt guide includes copy buttons for common `systemd` commands and `sudo update-grub`. These commands must run in the Debian VM, not in the browser workspace prompt.

## Why it stands out

By combining an x86 emulator with Debian's installer, OpenWeb Linux makes it possible to set up a portable Debian environment directly from the browser. The project is experimental and the guest OS must be installed before it is ready for everyday use.

## Project Status

OpenWeb Linux is a lightweight, experimental, and highly portable Linux distribution designed to run directly in the browser using the v86 emulator.

## Repository

This repository contains the project assets and configuration required to boot and run OpenWeb Linux in a web browser.

## Publicación HTTPS

El workflow de GitHub Pages publica el sitio de forma estática en HTTPS cuando se actualiza la rama `main`. Tras subir el repositorio, revisa **Settings → Pages** y selecciona **GitHub Actions** como fuente si aún no está configurada. GitHub entrega el sitio bajo `https://<usuario>.github.io/<repositorio>/`; activa **Enforce HTTPS** en Pages cuando aparezca disponible.

La página debe abrirse desde HTTPS (o desde `localhost` en desarrollo), no como `file://`: v86 necesita cargar WebAssembly y los archivos de arranque por HTTP.

## Arrancar el instalador Debian

Se incluyen las compilaciones de v86, SeaBIOS, VGA BIOS y la mini ISO oficial de Debian 12 para i386. Pulsa **Arrancar Debian** para iniciar el instalador en la pantalla completa. La máquina virtual usa 512 MiB de RAM y un disco temporal de 1 GiB, destinado a probar una instalación mínima. Necesita Internet; al completar la instalación, usa **Guardar** para descargar el estado de la máquina y **Abrir** para restaurarlo en otra sesión. El disco virtual se pierde al cerrar o recargar la página si no guardas un estado.

El acceso a red usa el relay público `wss://relay.widgetry.org/` (el mismo endpoint que muestra un ejemplo oficial de v86). La conexión se comparte con un servicio externo; no introduzcas contraseñas ni información sensible en una sesión conectada. Al enfocar el botón de arranque, la página prepara el emulador en segundo plano para acortar el tiempo de inicio; la ISO y los paquetes Debian aún dependen de la conexión.

La mini ISO es un instalador de red, no un sistema live: `apt` está disponible después de instalar Debian. Para una instalación más rápida, selecciona un mirror Debian cercano y no instales un entorno de escritorio; puedes añadir paquetes después con apt. La descarga del sistema base sigue limitada por la conexión y el mirror escogido.

Usa **+** y **×** en la barra de pestañas para abrir y cerrar terminales del espacio web. Cada pestaña conserva su historial por separado; los archivos y directorios se comparten entre ellas. La VM Debian sigue siendo una única máquina virtual compartida.

Los orígenes, licencias y hashes SHA-256 de los binarios incluidos se documentan en [public/ASSETS.md](./public/ASSETS.md). La mini ISO también puede descargarse directamente desde [Debian](https://deb.debian.org/debian/dists/bookworm/main/installer-i386/current/images/netboot/mini.iso).

## Guardar y restaurar

No se requiere iniciar sesión ni conectar servicios externos. El espacio de trabajo del navegador se guarda automáticamente en ese navegador. Pulsa **Guardar** para elegir entre guardar el estado de la VM en el almacenamiento local del navegador, descargar el estado de v86 como archivo `.bin` o descargar el espacio de trabajo como `.json`. **Abrir** permite restaurar la copia local o importar un archivo. Las copias locales no se sincronizan entre navegadores o dispositivos; para mover una VM, descarga y transfiere el archivo `.bin`. Los estados pueden ocupar mucho espacio, y el navegador puede limitar o borrar el almacenamiento local.

El sitio ya no se conecta a Supabase ni ofrece cuentas. Si habías guardado snapshots allí anteriormente, siguen en tu proyecto y debes borrarlos desde Supabase Storage si ya no los necesitas.

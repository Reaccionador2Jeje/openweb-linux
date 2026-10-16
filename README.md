# OpenWeb Linux

**Prueba Alpine Linux en tu navegador.** OpenWeb Linux ejecuta una VM x86 ligera con [v86](https://github.com/copy/v86), ofrece un espacio de trabajo local con terminales y permite guardar respaldos sin crear una cuenta.

**Try Alpine Linux in your browser.** OpenWeb Linux runs a lightweight x86 virtual machine with [v86](https://github.com/copy/v86), includes a local terminal workspace, and lets you save backups without creating an account.

**[Abrir la demo en vivo](https://reaccionador2jeje.github.io/openweb-linux/) · [Ver el código fuente](https://github.com/Reaccionador2Jeje/openweb-linux)**

> Proyecto experimental: el rendimiento y la compatibilidad dependen del navegador y del dispositivo. La consola del espacio de trabajo es una simulación para archivos locales, no un shell Linux; Alpine sí se ejecuta dentro de la VM.

## Qué incluye / What’s included

- Alpine Linux 3.24.2 x86 (32-bit) desde la ISO oficial `virt`
- Emulador v86, SeaBIOS y VGA BIOS incluidos en el proyecto
- VM configurada con 256 MiB de RAM y disco virtual de 512 MiB
- Terminales de espacio de trabajo con archivos compartidos y comandos básicos de archivos
- Teclado en pantalla para móviles
- Guardado local en el navegador y exportación/importación de respaldos; sin inicio de sesión
- Interfaz estática, alojada con GitHub Pages y servida por HTTPS

## Pruébalo / Quick start

1. Visita la [demo de OpenWeb Linux](https://reaccionador2jeje.github.io/openweb-linux/) desde un navegador moderno.
2. Pulsa **Arrancar Alpine** y escribe `root` en la consola cuando aparezca el inicio de sesión.
3. Para instalar Alpine en el disco virtual, ejecuta `setup-alpine` y sigue las indicaciones. Elige `eth0` para la red y `/dev/sda` como disco; la instalación debe mantenerse pequeña para caber en 512 MiB.
4. Usa **Guardar** para conservar el espacio de trabajo o exportar un estado de v86. Las copias locales solo existen en ese navegador.

The live demo needs HTTPS because v86 uses WebAssembly. At the Alpine console, log in as `root`; run `setup-alpine` if you want to install the system on the 512 MiB virtual disk. Keep the installation minimal.

## Espacio de trabajo y VM / Workspace and VM

El espacio de trabajo del navegador ofrece comandos como `ls`, `cd`, `tree`, `find`, `cat`, `grep`, `touch`, `write`, `mkdir`, `cp`, `mv`, `rm`, `download` y `save`. Solo administran archivos guardados por la página; no ejecutan programas ni comandos Linux.

La consola real de Alpine se ejecuta en una VM separada. Alpine usa `apk` para paquetes y OpenRC para servicios:

```sh
apk update
apk add <paquete>
rc-status
```

El acceso de red de la VM usa el relay público `wss://relay.widgetry.org/`, operado por terceros. No introduzcas contraseñas ni información sensible mientras uses ese relay.

## Guardar y restaurar / Save and restore

No hay cuentas ni sincronización en la nube. El espacio de trabajo puede exportarse como JSON; el estado de la VM puede guardarse en almacenamiento local del navegador o descargarse como archivo `.bin`. Los estados de VM pueden ocupar mucho espacio y solo son portables mediante el archivo exportado. La cuota del navegador puede limitar el guardado local.

## Ejecutarlo localmente / Run locally

Sirve la raíz del repositorio con un servidor HTTP local y abre la dirección local en el navegador. v86 no funciona desde `file://`; fuera de `localhost`, el sitio debe servirse por HTTPS.

La configuración de GitHub Pages está en `.github/workflows/pages.yml` y despliega al hacer push a `main`. En la configuración del repositorio, selecciona **GitHub Actions** como origen de Pages.

## Activos / Assets

Los orígenes, licencias y hashes SHA-256 están en [public/ASSETS.md](./public/ASSETS.md). La ISO Alpine x86 virt se publica en el [mirror oficial de Alpine](https://dl-cdn.alpinelinux.org/alpine/latest-stable/releases/x86/alpine-virt-3.24.2-x86.iso).

---

Si te resulta útil, comparte la [demo](https://reaccionador2jeje.github.io/openweb-linux/) o abre un [issue](https://github.com/Reaccionador2Jeje/openweb-linux/issues) con errores y sugerencias. Si sabes programar, las contribuciones son bienvenidas.

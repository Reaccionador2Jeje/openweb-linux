

# OpenWeb Linux

OpenWeb Linux is an experimental project for installing a minimal Debian 12 i386 system in the browser. It boots Debian's network installer with the v86 JavaScript emulator; the guest OS must first be installed to the browser's virtual disk.

## Overview

OpenWeb Linux is a browser-based Linux installer focused on accessibility, portability, and usability. The installer runs in the web page; the installed guest system and its package manager run inside the emulated machine.

## Features

- Boots the Debian 12 i386 network installer in the browser
- Built on the v86 emulator
- Provides apt after Debian is installed in the virtual machine
- Designed to be complete and self-contained
- Boots from the Debian installer ISO bundled with the site; no separate ISO download is required
- No third-party asset host is needed for the default kernel and emulator files
- Lightweight and portable enough to use from nearly any browser

## How it works

OpenWeb Linux serves the default kernel and emulator assets directly from the project itself. The browser loads the Linux environment through the v86 emulator, which emulates an x86 machine and boots the operating system inside the page.

This approach makes OpenWeb Linux more than a static browser demo: it boots the real Debian installer in the web page. Completing the Debian installation is necessary before using the guest OS or apt.

## Package Manager

After Debian is installed, apt can install and manage software inside the emulated environment. The bundled mini ISO is an installer, not a live system, so apt is not available in a normal guest shell until setup is complete.

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

El acceso a red usa el relay público `wss://relay.widgetry.org/` (el mismo endpoint que muestra un ejemplo oficial de v86). La conexión se comparte con un servicio externo; no introduzcas contraseñas ni información sensible en una sesión conectada.

La mini ISO es un instalador de red, no un sistema live: `apt` está disponible después de instalar Debian. Para paquetes desde el instalador también se necesita que la red esté configurada.

Los orígenes, licencias y hashes SHA-256 de los binarios incluidos se documentan en [public/ASSETS.md](./public/ASSETS.md). La mini ISO también puede descargarse directamente desde [Debian](https://deb.debian.org/debian/dists/bookworm/main/installer-i386/current/images/netboot/mini.iso).

## Cuenta y sincronización privada con Supabase

El código incluye inicio de sesión OAuth con Google y GitHub, persistencia de sesión, subida reanudable del snapshot y restauración en otro dispositivo. Para proteger el contenido, cifra cada snapshot en el navegador con AES-GCM y PBKDF2 antes de subirlo. Supabase solo recibe datos cifrados; la frase secreta no se transmite ni se guarda. **Si se pierde esa frase, no es posible recuperar el snapshot.** El guardado en la nube requiere una máquina v86 iniciada. Los proveedores no estarán disponibles hasta configurar las cuentas y credenciales OAuth indicadas abajo.

El propietario del repositorio no puede provisionar servicios dentro de la cuenta Supabase personal del usuario. Este sitio ya usa la URL y la clave publishable del proyecto elegido, por lo que no hace falta copiarlas en cada navegador. La clave publishable es pública por diseño; nunca publiques `service_role` ni secretos OAuth. La activación de los proveedores aún requiere configurar sus credenciales en las cuentas:

1. En Supabase **SQL Editor**, ejecuta [`supabase/setup.sql`](./supabase/setup.sql). Crea el bucket privado `vm-snapshots`, limita cada objeto a 2 GiB y aplica políticas que restringen lectura, subida, reemplazo y borrado a la carpeta UUID del usuario conectado. La configuración de tamaño requiere un plan Supabase cuyo límite de archivo sea de al menos 2 GiB; los planes gratuitos tienen un límite menor y no podrán almacenar snapshots grandes.
2. Configura la URL pública del sitio en **Authentication → URL Configuration** y añade `https://reaccionador2jeje.github.io/openweb-linux/` (y `http://localhost:8765/` para pruebas locales) a las Redirect URLs.
3. En cada proveedor que quieras activar, crea una aplicación OAuth y configura sus credenciales **en el panel de Supabase**, no en el sitio. En la consola de Google/GitHub registra como callback `https://<project-ref>.supabase.co/auth/v1/callback`. Consulta las guías de [Google](https://supabase.com/docs/guides/auth/social-login/auth-google) y [GitHub](https://supabase.com/docs/guides/auth/social-login/auth-github).
4. Autoriza el inicio de sesión con Google o GitHub. Supabase conserva la sesión en el navegador; cada persona debe aprobar su propio acceso. Pulsa **Guardar VM cifrada** y elige una frase secreta fuerte de al menos 12 caracteres; usa **Restaurar VM** en cualquier dispositivo para recuperar el estado con esa misma frase. La subida TUS se reanuda si la conexión falla; cada usuario puede acceder solo a su propia ruta.

**Coste, tamaño y memoria:** v86 guarda tanto la memoria como el disco virtual. Según el estado, el archivo cifrado puede ser muy grande; la cuota, el almacenamiento y el ancho de banda dependen del plan Supabase. Crear y cifrar un snapshot también necesita memoria RAM libre en el navegador. No introduzcas datos sensibles en el invitado sin una frase secreta que solo tú controles. El guardado local mediante archivo sigue disponible como alternativa.

La autenticación usa el cliente oficial Supabase JS y la subida grande usa `tus-js-client`, cargados desde esm.sh cuando se necesitan. Las funciones de la VM que no usan autenticación no requieren esos paquetes remotos.

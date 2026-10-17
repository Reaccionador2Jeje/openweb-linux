# OpenWeb Linux

**Un shell de Linux completo en tu navegador.** OpenWeb Linux es un sistema de terminal inspirado en Alpine Linux (busybox, apk y OpenRC simulados) que corre entero en JavaScript, con sistema de archivos persistente, paquetes, servicios, tuberías y respaldos sin crear una cuenta.

**A complete Linux shell in your browser.** OpenWeb Linux is an Alpine Linux-inspired terminal system (simulated busybox, apk and OpenRC) that runs entirely in JavaScript, with a persistent filesystem, packages, services, pipelines, and backups without an account.

**[Abrir la demo en vivo](https://reaccionador2jeje.github.io/openweb-linux/) · [Ver el código fuente](https://github.com/Reaccionador2Jeje/openweb-linux)**

> Proyecto experimental. Es una simulación completa y honesta: no hay VM ni WebAssembly, los comandos se ejecutan con JavaScript en la propia página. Nada se envía a ningún servidor.

## Qué incluye / What's included

- Shell tipo ash con comandos de archivos: `ls`, `cd`, `cat`, `head`, `tail`, `grep`, `wc`, `find`, `tree`, `touch`, `mkdir`, `rm`, `cp`, `mv`, `echo`…
- Tuberías (`|`), redirección (`>`, `>>`) y lectura de archivos (`<`)
- Sistema de archivos virtual con árbol tipo Alpine (`/etc`, `/root`, `/tmp`, `/var`…) que persiste en el navegador
- Gestor de paquetes `apk` simulado con catálogo: instalar comandos reales (`cowsay`, `neofetch`, `figlet`…), `apk search`, `apk info`
- Servicios estilo OpenRC: `rc-status`, `rc-service`, `rc-update` (algunos servicios aparecen al instalar su paquete)
- Asistente `setup-alpine` con instalación simulada a disco, más `ps`, `top`, `free`, `df`, `dmesg`, `neofetch`
- Varias sesiones de terminal (pestañas) que comparten el sistema, con historial y autocompletado con Tab
- Teclado en pantalla para móviles
- Guardado local automático y exportación/importación de respaldos JSON; sin inicio de sesión
- Interfaz estática, alojada con GitHub Pages y servida por HTTPS (también funciona abriendo `index.html` por `file://`)

## Pruébalo / Quick start

1. Visita la [demo de OpenWeb Linux](https://reaccionador2jeje.github.io/openweb-linux/) desde un navegador moderno.
2. El shell arranca al instante: escribe `help` para ver los comandos o `neofetch` para fichar el sistema.
3. Instala paquetes simulados y pruébalos:

```sh
apk add cowsay
cowsay hola desde OpenWeb Linux
apk add figlet
figlet openweb
echo "hola" > /tmp/saludo.txt
cat /tmp/saludo.txt | grep hola | wc -l
```

4. Usa **Guardar** para descargar el sistema como JSON. Las copias locales solo existen en ese navegador.

## Sistema de archivos y paquetes / Filesystem and packages

El directorio inicial es `/root`; el sistema de archivos vive en el almacenamiento local del navegador y se restaura al volver a abrir la página. El paquete base (`alpine-base`, `busybox`) viene instalado; el resto del catálogo se consulta con `apk search` y `apk info`.

Los servicios de base son `networking` y `crond`. Al instalar `openssh-server`, `nginx` o `ntp` aparecen sus servicios (`sshd`, `nginx`, `ntpd`), listos para `rc-service … start` y `rc-update add … default`.

## Guardar y restaurar / Save and restore

No hay cuentas ni sincronización en la nube. El sistema se guarda solo en este navegador y puede exportarse como JSON (archivos, paquetes, servicios e historial de cada terminal). El archivo es un respaldo pequeño y editable a mano; la cuota del navegador puede limitar el guardado local.

## Ejecutarlo localmente / Run locally

Abre `index.html` directamente con doble clic (`file://`) o sirve la raíz del repositorio con cualquier servidor HTTP local. No hace falta build ni dependencias.

La configuración de GitHub Pages está en `.github/workflows/pages.yml` y despliega al hacer push a `main`. En la configuración del repositorio, selecciona **GitHub Actions** como origen de Pages.

## Activos / Assets

Los orígenes y licencias están en [public/ASSETS.md](./public/ASSETS.md).

---

Si te resulta útil, comparte la [demo](https://reaccionador2jeje.github.io/openweb-linux/) o abre un [issue](https://github.com/Reaccionador2Jeje/openweb-linux/issues) con errores y sugerencias. Si sabes programar, las contribuciones son bienvenidas.

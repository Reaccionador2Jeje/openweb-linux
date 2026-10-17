(() => {
  "use strict";

  /* ============================================================
     1. Estado del sistema
     ============================================================ */

  const STORAGE_KEY = "openweb-linux-shell-v2";
  const SYSTEM_VERSION = 2;

  const files = Object.create(null);        // ruta sin "/" inicial -> contenido
  const directories = new Set(["/"]);       // rutas absolutas
  const mtimes = Object.create(null);       // ruta -> ISO
  const packages = new Set();               // paquetes apk instalados
  const services = Object.create(null);     // nombre -> { started, runlevels: [] }
  const bootLog = [];                       // dmesg simulado

  const env = {
    HOME: "/root",
    USER: "root",
    LOGNAME: "root",
    SHELL: "/bin/ash",
    TERM: "linux",
    PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    PWD: "/root",
    OLDPWD: "/",
  };

  const startTime = Date.now();
  let hostname = "openweb";
  let installedToDisk = false;
  let currentPath = "/root";
  let previousPath = "/";
  let nextPid = 200;
  let interactiveHandler = null;            // paso activo de setup-alpine

  /* ---------- DOM ---------- */

  let output = document.getElementById("terminal-content");
  const scroll = document.getElementById("terminal-scroll");
  const terminalTabs = document.getElementById("terminal-tabs");
  const terminalPanels = document.getElementById("terminal-sessions");
  const restoreInput = document.getElementById("restore-input");
  const storageStatus = document.getElementById("storage-status");
  const toast = document.getElementById("toast");
  const keyboardPanel = document.getElementById("mobile-keyboard");
  const keyboardToggle = document.getElementById("keyboard-toggle");

  /* ---------- datos del sistema ---------- */

  const APK_CATALOG = [
    { name: "alpine-base", version: "3.21.0", desc: "Base system utilities", kb: 120, base: true },
    { name: "busybox", version: "1.37.0", desc: "Lean multipurpose binary", kb: 900, base: true },
    { name: "curl", version: "8.10.1", desc: "Command line URL transfer tool", kb: 320 },
    { name: "wget", version: "1.24.5", desc: "Non-interactive network downloader", kb: 280 },
    { name: "git", version: "2.47.1", desc: "Version control system", kb: 2100 },
    { name: "openssh", version: "9.9_p2", desc: "SSH protocol tools", kb: 800 },
    { name: "openssh-server", version: "9.9_p2", desc: "OpenSSH server daemon", kb: 420, provides: "sshd" },
    { name: "nginx", version: "1.27.3", desc: "HTTP and reverse proxy server", kb: 610, provides: "nginx" },
    { name: "ntp", version: "4.2.8", desc: "Network Time Protocol client", kb: 340, provides: "ntpd" },
    { name: "python3", version: "3.12.7", desc: "Python programming language", kb: 1600 },
    { name: "nodejs", version: "22.11.0", desc: "JavaScript runtime", kb: 4500 },
    { name: "nano", version: "8.3", desc: "Small text editor", kb: 250 },
    { name: "vim", version: "9.1", desc: "Vi improved text editor", kb: 1500 },
    { name: "htop", version: "3.3.0", desc: "Interactive process viewer", kb: 180 },
    { name: "tmux", version: "3.5a", desc: "Terminal multiplexer", kb: 410 },
    { name: "sudo", version: "1.9.16", desc: "Delegated privilege control", kb: 130 },
    { name: "neofetch", version: "7.1.0", desc: "System information with style", kb: 90 },
    { name: "cowsay", version: "3.8.4", desc: "Talking cow in ASCII", kb: 20 },
    { name: "figlet", version: "2.2.5", desc: "Big letters from plain text", kb: 65 },
  ];

  const BASE_SERVICES = ["networking", "crond"];

  const SERVICE_DESCRIPTIONS = {
    networking: "Network interface configuration",
    crond: "Periodic command scheduler",
    sshd: "OpenSSH server (needs openssh-server)",
    nginx: "HTTP server (needs nginx)",
    ntpd: "Network time sync (needs ntp)",
  };

  const MANPAGES = {
    ls: "ls [-l] [DIR] — lista el contenido de un directorio.",
    cd: "cd [DIR] — cambia de directorio; cd - vuelve al anterior.",
    cat: "cat [-n] FILE — imprime archivos; sin argumentos lee la tubería.",
    grep: "grep [-i] TEXT FILE — filtra líneas; también acepta tuberías.",
    echo: "echo TEXT — imprime texto; usa > o >> para guardar en archivos.",
    apk: "apk [update|upgrade|add PKG|del PKG|search TXT|info|list] — gestor de paquetes simulado.",
    "rc-service": "rc-service SVCIO [start|stop|restart|status] — controla servicios OpenRC simulados.",
    "rc-update": "rc-update [add|del] SVC [default] — gestiona runlevels.",
    "setup-alpine": "setup-alpine — asistente de configuración e instalación simulado.",
    neofetch: "neofetch — muestra el banner del sistema.",
    cowsay: "cowsay TEXTO — la vaca dice lo que le pidas.",
    figlet: "figlet TEXTO — escribe texto con letras grandes.",
    write: "write FILE TEXT — crea o sobrescribe un archivo.",
    save: "save — descarga el sistema completo como JSON.",
    top: "top — instantánea de procesos y memoria.",
  };

  const APPLET_BINARIES = [
    "sh", "ash", "busybox", "ls", "cat", "cp", "mv", "rm", "mkdir", "rmdir", "ln", "chmod",
    "ps", "top", "free", "df", "du", "kill", "grep", "sed", "awk", "find", "tar", "gzip",
    "wget", "ping", "mount", "umount", "hostname", "ifconfig", "route", "vi", "clear", "date",
  ];
  const SBIN_BINARIES = [
    "init", "reboot", "poweroff", "halt", "ifup", "ifdown", "mdev", "udevadm",
    "rc-status", "rc-service", "rc-update", "setup-interfaces", "setup-alpine", "setup-disk", "apk",
  ];

  const FIGFONT = {
    A: [" ## ", "#  #", "####", "#  #", "#  #"],
    B: ["### ", "#  #", "### ", "#  #", "### "],
    C: [" ###", "#   ", "#   ", "#   ", " ###"],
    D: ["### ", "#  #", "#  #", "#  #", "### "],
    E: ["####", "#   ", "### ", "#   ", "####"],
    F: ["####", "#   ", "### ", "#   ", "#   "],
    G: [" ###", "#   ", "# ##", "#  #", " ###"],
    H: ["#  #", "#  #", "####", "#  #", "#  #"],
    I: ["###", " # ", " # ", " # ", "###"],
    J: ["  #", "  #", "  #", "# #", " ##"],
    K: ["#  #", "# # ", "##  ", "# # ", "#  #"],
    L: ["#   ", "#   ", "#   ", "#   ", "####"],
    M: ["#   #", "## ##", "# # #", "#   #", "#   #"],
    N: ["#  #", "## #", "# ##", "#  #", "#  #"],
    O: [" ## ", "#  #", "#  #", "#  #", " ## "],
    P: ["### ", "#  #", "### ", "#   ", "#   "],
    Q: [" ## ", "#  #", "#  #", "# ##", " ## #"],
    R: ["### ", "#  #", "### ", "# # ", "#  #"],
    S: [" ###", "#   ", " ## ", "   #", "### "],
    T: ["#####", "  #  ", "  #  ", "  #  ", "  #  "],
    U: ["#  #", "#  #", "#  #", "#  #", " ## "],
    V: ["#   #", "#   #", " # # ", " # # ", "  #  "],
    W: ["#   #", "#   #", "# # #", "## ##", "#   #"],
    X: ["#   #", " # # ", "  #  ", " # # ", "#   #"],
    Y: ["#   #", " # # ", "  #  ", "  #  ", "  #  "],
    Z: ["####", "  # ", " #  ", "#   ", "####"],
    "0": [" ## ", "#  #", "#  #", "#  #", " ## "],
    "1": [" # ", "## ", " # ", " # ", "###"],
    "2": ["### ", "   #", " ## ", "#   ", "####"],
    "3": ["### ", "   #", " ## ", "   #", "### "],
    "4": ["#  #", "#  #", "####", "   #", "   #"],
    "5": ["####", "#   ", "### ", "   #", "### "],
    "6": [" ## ", "#   ", "### ", "#  #", " ## "],
    "7": ["####", "   #", "  # ", " #  ", " #  "],
    "8": [" ## ", "#  #", " ## ", "#  #", " ## "],
    "9": [" ## ", "#  #", " ###", "   #", " ## "],
    " ": ["  ", "  ", "  ", "  ", "  "],
    "!": ["#", "#", "#", " ", "#"],
    "?": ["### ", "   #", " ## ", "    ", " #  "],
  };

  /* ============================================================
     2. Utilidades
     ============================================================ */

  let toastTimer;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
  }

  function appendLine(text, kind) {
    const line = document.createElement("div");
    line.className = "line" + (kind ? " " + kind : "");
    line.textContent = text;
    const livePrompt = output.lastElementChild;
    if (livePrompt && livePrompt.classList.contains("prompt-line")) output.insertBefore(line, livePrompt);
    else output.appendChild(line);
  }

  function fileSize(path) {
    const content = Object.prototype.hasOwnProperty.call(files, path) ? files[path] : "";
    return new Blob([content]).size;
  }

  function totalBytes() {
    return Object.keys(files).reduce((sum, path) => sum + fileSize(path), 0);
  }

  function humanSize(kb) {
    return kb >= 1024 ? (kb / 1024).toFixed(1) + "M" : kb + "k";
  }

  function formatKb(bytes) {
    return Math.max(1, Math.round(bytes / 1024));
  }

  function uptimeText() {
    const minutes = Math.floor((Date.now() - startTime) / 60000);
    if (minutes < 1) return "0 min";
    if (minutes < 60) return minutes + (minutes === 1 ? " min" : " mins");
    return Math.floor(minutes / 60) + "h " + (minutes % 60) + "m";
  }

  function displayPath(path) {
    if (path === env.HOME) return "~";
    if (path.startsWith(env.HOME + "/")) return "~" + path.slice(env.HOME.length);
    return path;
  }

  /* ============================================================
     3. Sistema de archivos virtual
     ============================================================ */

  function normalizePath(path) {
    const raw = (path || ".").replace(/^~(?=\/|$)/, env.HOME);
    const absolute = raw.startsWith("/") ? raw : currentPath.replace(/\/$/, "") + "/" + raw;
    const parts = [];
    absolute.split("/").forEach(part => {
      if (!part || part === ".") return;
      if (part === "..") parts.pop();
      else parts.push(part);
    });
    return "/" + parts.join("/");
  }

  function childrenOf(path) {
    const dirPrefix = path === "/" ? "/" : path.replace(/\/$/, "") + "/";
    const filePrefix = dirPrefix.slice(1);
    const found = new Set();
    directories.forEach(directory => {
      if (directory === path || !directory.startsWith(dirPrefix)) return;
      const rest = directory.slice(dirPrefix.length);
      if (rest) found.add(rest.split("/")[0] + "/");
    });
    Object.keys(files).forEach(file => {
      if (!filePrefix || !file.startsWith(filePrefix)) return;
      const rest = file.slice(filePrefix.length);
      if (rest) found.add(rest.split("/")[0] + (rest.includes("/") ? "/" : ""));
    });
    return [...found].sort((a, b) => a.localeCompare(b));
  }

  function directoryExists(path) {
    if (path === "/" || directories.has(path)) return true;
    const prefix = path.replace(/\/$/, "") + "/";
    return Object.keys(files).some(file => file.startsWith(prefix)) ||
      [...directories].some(directory => directory !== path && directory.startsWith(prefix));
  }

  function fileParent(path) {
    const separator = path.lastIndexOf("/");
    return separator > 0 ? path.slice(0, separator) : "/";
  }

  function touchPath(path) {
    mtimes[path] = new Date().toISOString();
  }

  function seedSystem() {
    [
      "/bin", "/sbin", "/boot", "/dev", "/etc", "/etc/apk", "/home", "/lib", "/media", "/mnt",
      "/opt", "/proc", "/root", "/run", "/srv", "/sys", "/tmp", "/usr", "/usr/bin", "/usr/sbin",
      "/usr/share", "/usr/share/man", "/var", "/var/cache", "/var/cache/apk", "/var/log",
    ].forEach(path => directories.add(path));

    files["etc/hostname"] = hostname + "\n";
    files["etc/issue"] = "OpenWeb Linux 1.0 (tty1)\\n\\l\n";
    files["etc/os-release"] = [
      'NAME="OpenWeb Linux"',
      'ID=openweb',
      'VERSION_ID="1.0"',
      'PRETTY_NAME="OpenWeb Linux 1.0 (shell simulado inspirado en Alpine)"',
      'HOME_URL="https://reaccionador2jeje.github.io/openweb-linux/"',
      "",
    ].join("\n");
    files["etc/passwd"] = [
      "root:x:0:0:root:/root:/bin/sh",
      "bin:x:1:1:bin:/bin:/sbin/nologin",
      "daemon:x:2:2:daemon:/sbin:/sbin/nologin",
      "nobody:x:65534:65534:nobody:/:/sbin/nologin",
      "",
    ].join("\n");
    files["etc/group"] = "root:x:0:root\nwheel:x:10:root\nnogroup:x:65534:\n";
    files["etc/profile"] = [
      "export HOME=/root",
      "export USER=root",
      "export PATH=\"" + env.PATH + "\"",
      "export PS1='\\w \\# '",
      "",
    ].join("\n");
    files["etc/repositories"] = [
      "# https://alpinelinux.org",
      "https://dl-cdn.alpinelinux.org/alpine/latest-stable/main",
      "https://dl-cdn.alpinelinux.org/alpine/latest-stable/community",
      "",
    ].join("\n");
    files["etc/apk/repositories"] = files["etc/repositories"];
    files["etc/motd"] = "Bienvenido a OpenWeb Linux.\nEscribe help para ver los comandos del sistema.\n";
    files["root/README.txt"] = [
      "Este es un shell completo simulado que corre entero en tu navegador.",
      "Nada se envía a ningún servidor: tus archivos, paquetes y servicios",
      "se guardan en el almacenamiento local de este navegador.",
      "Prueba: neofetch · apk add cowsay · cowsay hola · ls -l /etc",
      "",
    ].join("\n");
    files["var/log/messages"] = "Oct 17 08:30:01 openweb daemon.notice syslogd: restart\n";
    files["etc/network/interfaces"] = "auto lo\niface lo inet loopback\n\nauto eth0\niface eth0 inet dhcp\n";

    APPLET_BINARIES.forEach(name => { files["bin/" + name] = ""; touchPath("bin/" + name); });
    SBIN_BINARIES.forEach(name => { files["sbin/" + name] = ""; touchPath("sbin/" + name); });

    Object.keys(files).forEach(touchPath);

    BASE_SERVICES.forEach(name => {
      services[name] = { started: true, runlevels: name === "crond" ? ["default"] : ["boot", "default"] };
    });
    ["sshd", "nginx", "ntpd"].forEach(name => { services[name] = { started: false, runlevels: [] }; });
    APK_CATALOG.filter(pkg => pkg.base).forEach(pkg => packages.add(pkg.name));

    bootLog.push(
      "0.000000] Linux version 6.6.0-openweb (web@browser) (gcc 14.2.0) #1 SMP",
      "0.000000] Command line: console=tty0 quiet",
      "0.042011] Memory: 262144K/262144K available",
      "0.113557] VFS: Disk quotas disabled",
      "0.204468] virtio_blk virtio0: detected",
      "0.331204] EXT4-fs (vda): mounted filesystem with ordered data mode",
      "1.004873] crond: crond (busybox 1.37.0) started",
      "1.102336] OpenWeb shell ready (simulación completa en el navegador)",
    );
  }

  /* ============================================================
     4. Servicios y paquetes
     ============================================================ */

  function packageEntry(name) {
    return APK_CATALOG.find(pkg => pkg.name === name) || null;
  }

  function serviceFor(pkg) {
    return pkg && pkg.provides ? pkg.provides : null;
  }

  function serviceInstalled(name) {
    if (BASE_SERVICES.includes(name)) return true;
    const pkg = APK_CATALOG.find(item => serviceFor(item) === name);
    return Boolean(pkg && packages.has(pkg.name));
  }

  function installedSizeKb() {
    return APK_CATALOG.filter(pkg => packages.has(pkg.name)).reduce((sum, pkg) => sum + pkg.kb, 0);
  }

  function apkSummary() {
    const count = APK_CATALOG.filter(pkg => packages.has(pkg.name)).length;
    return "OK: " + humanSize(installedSizeKb() + 8) + " in " + (count + 37) + " packages";
  }

  function processList() {
    const rows = [
      { pid: 1, time: "0:00", cmd: "/sbin/init" },
      { pid: 14, time: "0:00", cmd: "[kworker/0:1]" },
      { pid: 26, time: "0:00", cmd: "/sbin/udevd --daemon" },
    ];
    if (services.crond && services.crond.started) rows.push({ pid: 33, time: "0:00", cmd: "/usr/sbin/crond" });
    if (services.sshd && services.sshd.started) rows.push({ pid: 47, time: "0:00", cmd: "/usr/sbin/sshd: listener" });
    if (services.nginx && services.nginx.started) {
      rows.push({ pid: 55, time: "0:00", cmd: "nginx: master process /usr/sbin/nginx" });
      rows.push({ pid: 56, time: "0:00", cmd: "nginx: worker process" });
    }
    if (services.ntpd && services.ntpd.started) rows.push({ pid: 61, time: "0:00", cmd: "/usr/sbin/ntpd -d" });
    terminalSessions.forEach(session => {
      rows.push({
        pid: session.pid,
        time: "0:0" + (session.id.length % 5),
        cmd: (session === activeTerminal ? "sh" : "sleep") + " -" + (session === activeTerminal ? "l" : "") + " (ash)",
      });
    });
    return rows;
  }

  /* ============================================================
     5. Motor del shell (tokenizador, tuberías, redirección)
     ============================================================ */

  function tokenize(input) {
    const tokens = [];
    let current = "";
    let quote = null;
    for (const character of input) {
      if (quote) {
        if (character === quote) quote = null;
        else current += character;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (/\s/.test(character)) {
        if (current) { tokens.push(current); current = ""; }
      } else {
        current += character;
      }
    }
    if (current) tokens.push(current);
    return tokens;
  }

  function parseSegments(input) {
    return input.split("|").map(part => {
      let tokens = tokenize(part.trim());
      let redirect = null;
      let stdinFile = null;
      for (let index = 0; index < tokens.length; index++) {
        if ((tokens[index] === ">" || tokens[index] === ">>") && tokens[index + 1]) {
          redirect = { append: tokens[index] === ">>", target: tokens[index + 1] };
          tokens = tokens.slice(0, index).concat(tokens.slice(index + 2));
          break;
        }
      }
      for (let index = 0; index < tokens.length; index++) {
        if (tokens[index] === "<" && tokens[index + 1]) {
          stdinFile = tokens[index + 1];
          tokens = tokens.slice(0, index).concat(tokens.slice(index + 2));
          break;
        }
      }
      return { tokens, redirect, stdinFile };
    });
  }

  function asLines(data) {
    if (data === null || data === undefined) return null;
    return data.map(item => (typeof item === "string" ? item : item.text));
  }

  function serialise(lines) {
    const list = asLines(lines);
    return list.length ? list.join("\n") + "\n" : "";
  }

  function runInput(raw) {
    addPrompt(raw);
    const input = raw.trim();
    if (!input) return;
    activeTerminal.history.push(raw);
    activeTerminal.historyIndex = activeTerminal.history.length;

    const segments = parseSegments(input);
    let data = null;

    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      const isLast = index === segments.length - 1;

      if (segment.stdinFile) {
        const path = normalizePath(segment.stdinFile).slice(1);
        if (!Object.prototype.hasOwnProperty.call(files, path)) {
          printError(segment.tokens[0] || "sh", "can't open '" + segment.stdinFile + "': No such file or directory");
          return;
        }
        data = files[path].replace(/\n$/, "").split("\n");
      }

      if (!segment.tokens.length) continue;
      const [command, ...args] = segment.tokens;

      if (segment.redirect) {
        const target = normalizePath(segment.redirect.target).slice(1);
        if (!target || !directoryExists(fileParent("/" + target))) {
          printError(command, "can't create '" + segment.redirect.target + "': No such file or directory");
          return;
        }
        const produced = runCommand(command, args, data, false);
        if (produced === null) return;
        const body = serialise(produced);
        files[target] = segment.redirect.append
          ? (Object.prototype.hasOwnProperty.call(files, target) ? files[target] : "") + body
          : body;
        touchPath(target);
        data = [];
        continue;
      }

      data = runCommand(command, args, data, isLast);
      if (data === null) return;
    }
  }

  function printError(command, message) {
    appendLine(command + ": " + message, "error");
  }

  function runCommand(command, args, stdin, loud) {
    const local = Object.create(null);
    local.stdin = asLines(stdin);
    local.path = currentPath;
    local.hostname = hostname;
    local.env = env;

    const handler = COMMANDS[command];
    if (!handler) {
      printError(command, "not found (escribe help)");
      return null;
    }
    try {
      const result = handler(args, local);
      if (result === undefined) return [];
      if (loud) {
        result.forEach(item => {
          if (typeof item === "string") appendLine(item);
          else if (item && item.text !== undefined) appendLine(item.text, item.kind);
        });
      }
      return asLines(result);
    } catch (error) {
      printError(command, error.message || String(error));
      return null;
    }
  }

  /* ============================================================
     6. Comandos
     ============================================================ */

  const COMMANDS = Object.create(null);

  /* ---------- ayuda y sistema ---------- */

  COMMANDS.help = () => [
    { text: "OpenWeb Linux 1.0 — shell completo simulado (todo ocurre en tu navegador)", kind: "green" },
    "",
    "Archivos    ls [-l|-a] · cd · pwd · cat · head · tail · grep · wc · find · tree",
    "            touch · mkdir [-p] · rmdir · rm [-r] · cp · mv · echo · write",
    "Sistema     ps · top · free · df · du · uptime · uname · hostname · id · whoami",
    "            env · which · dmesg · date · history · clear · man <comando>",
    "Paquetes    apk update · apk upgrade · apk add <pkg> · apk del <pkg> · apk search <txt> · apk info",
    "Servicios   rc-status · rc-service <svc> [start|stop|restart|status] · rc-update [add|del] <svc>",
    "Extras      neofetch · cowsay · figlet · sudo · setup-alpine · reboot · save · download <archivo>",
    "",
    "Uso: encadena con |, guarda con > o >> y lee archivos con <",
    "     p. ej.  ls /etc | grep e    ·    echo hola > /tmp/saludo.txt",
  ];

  COMMANDS.clear = () => { output.replaceChildren(); return undefined; };
  COMMANDS.history = (args, local) => {
    const source = local.terminal || activeTerminal;
    return source.history.map((entry, index) => String(index + 1).padStart(4, " ") + "  " + entry);
  };
  COMMANDS.date = () => [new Date().toString()];
  COMMANDS.whoami = () => ["root"];
  COMMANDS.id = () => ["uid=0(root) gid=0(root) groups=0(root),10(wheel)"];
  COMMANDS.hostname = args => {
    if (!args.length) return [hostname];
    hostname = args[0].replace(/[^a-zA-Z0-9-]/g, "") || hostname;
    files["etc/hostname"] = hostname + "\n";
    touchPath("etc/hostname");
    return [];
  };
  COMMANDS.uname = args => {
    if (args.includes("-a")) return ["Linux " + hostname + " 6.6.0-openweb #1 SMP " + new Date().getFullYear() + " x86_64 GNU/Linux (simulado)"];
    if (args.includes("-r")) return ["6.6.0-openweb"];
    if (args.includes("-m")) return ["x86_64"];
    return ["OpenWeb"];
  };
  COMMANDS.uptime = () => [" " + new Date().toLocaleTimeString("es-ES") + "  up " + uptimeText() + ",  1 user,  load average: 0.08, 0.12, 0.09"];
  COMMANDS.env = () => Object.keys(env).map(key => key + "=" + env[key]);
  COMMANDS.dmesg = () => bootLog.map(line => "[" + line);
  COMMANDS.which = args => {
    if (!args.length) return [""];
    return args.map(name => {
      if (!COMMANDS[name]) return name + " not found";
      return binaryPath(name) || "/bin/" + name;
    });
  };
  COMMANDS.man = args => {
    if (!args.length) return ["What manual page do you want?"];
    const page = MANPAGES[args[0]];
    return page ? ["", "OPENWEB(" + args[0] + ")                     Manual", "", page, ""] : ["No manual entry for " + args[0]];
  };
  COMMANDS.sudo = args => [
    { text: "root en este navegador ya lo puede todo: no hace falta sudo (" + (args.join(" ") || "nada") + " ejecutado)", kind: "muted" },
  ];
  COMMANDS.su = () => [{ text: "Ya eres root. Shell simulado: solo existe un usuario.", kind: "muted" }];
  COMMANDS.save = () => {
    downloadSystem();
    saveLocal();
    return [{ text: "Sistema descargado como openweb-linux-system.json", kind: "green" }];
  };
  COMMANDS.download = args => {
    if (!args.length) return [{ text: "usage: download <archivo>", kind: "error" }];
    const path = normalizePath(args[0]).slice(1);
    if (!Object.prototype.hasOwnProperty.call(files, path)) {
      return [{ text: "download: no existe el archivo: /" + path, kind: "error" }];
    }
    const url = URL.createObjectURL(new Blob([files[path]], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = path.split("/").pop();
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return [{ text: "Descarga iniciada: /" + path, kind: "green" }];
  };
  COMMANDS.exit = () => {
    setTimeout(() => closeActiveTerminalSession(), 0);
    return [];
  };
  COMMANDS.sleep = () => [];
  COMMANDS.reboot = args => rebootFlow(args);
  COMMANDS.halt = () => COMMANDS.reboot(["poweroff"]);
  COMMANDS.poweroff = () => COMMANDS.reboot(["poweroff"]);

  function rebootFlow(args) {
    const poweroff = args.includes("poweroff");
    if (poweroff) {
      appendLine("Broadcast message from root@" + hostname, "muted");
      appendLine("The system is going down for poweroff NOW!", "muted");
      setTimeout(() => {
        output.replaceChildren();
        appendLine("El sistema se apagó. Recarga la página para volver a encenderlo.", "muted");
      }, 600);
      return undefined;
    }
    appendLine("Broadcast message from root@" + hostname, "muted");
    appendLine("The system is going down for reboot NOW!", "muted");
    setTimeout(() => {
      output.replaceChildren();
      printBanner(false);
      focusPrompt();
    }, 800);
    return undefined;
  }

  /* ---------- archivos ---------- */

  COMMANDS.pwd = (args, local) => [local.path];

  COMMANDS.ls = (args, local) => {
    const flags = args.filter(arg => arg.startsWith("-")).join("");
    const long = flags.includes("l");
    const all = flags.includes("a");
    const target = args.find(arg => !arg.startsWith("-")) || ".";
    const path = normalizePath(target);

    if (!directoryExists(path)) return [{ text: "ls: can't access '" + target + "': No such file or directory", kind: "error" }];

    let entries = childrenOf(path);
    if (all && path !== "/") entries = ["../", ...entries];
    if (all && path === "/") entries = ["../", ...entries];

    if (!long) return [entries.join("  ")];

    const rows = [];
    entries.forEach(entry => {
      const isDirectory = entry.endsWith("/");
      const name = entry.slice(0, -1);
      const child = path === "/" ? "/" + name : path + "/" + name;
      const size = isDirectory ? 0 : fileSize(child.slice(1));
      const when = new Date(mtimes[child.slice(1)] || Date.now());
      const stamp = when.toLocaleDateString("es-ES", { month: "short", day: "2-digit" }) + " " +
        when.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
      rows.push(
        (isDirectory ? "drwxr-xr-x" : "-rw-r--r--") + " 1 root root " +
        String(size).padStart(6) + " " + stamp + " " + (isDirectory ? name + "/" : name)
      );
    });
    return rows;
  };

  COMMANDS.cd = args => {
    const target = args[0] || "~";
    const destination = target === "-" ? previousPath : normalizePath(target);
    if (!directoryExists(destination)) {
      return [{ text: "cd: can't cd to " + target + ": No such file or directory", kind: "error" }];
    }
    previousPath = currentPath;
    currentPath = destination;
    env.OLDPWD = previousPath;
    env.PWD = currentPath;
    if (target === "-") return [displayPath(currentPath)];
    return [];
  };

  COMMANDS.cat = (args, local) => {
    if (!args.length) {
      if (!local.stdin) return [{ text: "cat: missing operand (usa cat <archivo> o pásalo por tubería)", kind: "error" }];
      return local.stdin;
    }
    const output = [];
    args.forEach(name => {
      const path = normalizePath(name).slice(1);
      if (!Object.prototype.hasOwnProperty.call(files, path)) {
        output.push({ text: "cat: can't open '" + name + "': No such file or directory", kind: "error" });
      } else {
        files[path].replace(/\n$/, "").split("\n").forEach(line => output.push(line));
      }
    });
    return output;
  };

  function sliceCommand(name) {
    return (args, local) => {
      let count = 10;
      let filename = null;
      for (let index = 0; index < args.length; index++) {
        if (args[index] === "-n" && args[index + 1]) { count = Math.min(Number(args[index + 1]) || 10, 500); index++; }
        else filename = args[index];
      }
      if (!filename) {
        if (!local.stdin) return [{ text: name + ": usage: " + name + " [-n N] <archivo>", kind: "error" }];
        return name === "head" ? local.stdin.slice(0, count) : local.stdin.slice(-count);
      }
      const path = normalizePath(filename).slice(1);
      if (!Object.prototype.hasOwnProperty.call(files, path)) {
        return [{ text: name + ": can't open '" + filename + "': No such file or directory", kind: "error" }];
      }
      const lines = files[path].replace(/\n$/, "").split("\n");
      return name === "head" ? lines.slice(0, count) : lines.slice(-count);
    };
  }
  COMMANDS.head = sliceCommand("head");
  COMMANDS.tail = sliceCommand("tail");

  COMMANDS.grep = (args, local) => {
    const insensitive = args.includes("-i");
    const rest = args.filter(arg => arg !== "-i");
    const pattern = rest[0];
    const filename = rest[1];
    if (!pattern) return [{ text: "usage: grep [-i] <texto> [archivo]", kind: "error" }];
    let lines;
    if (filename) {
      const path = normalizePath(filename).slice(1);
      if (!Object.prototype.hasOwnProperty.call(files, path)) {
        return [{ text: "grep: " + filename + ": No such file or directory", kind: "error" }];
      }
      lines = files[path].replace(/\n$/, "").split("\n");
    } else if (local.stdin) {
      lines = local.stdin;
    } else {
      return [{ text: "grep: falta el archivo (o pásalo por tubería)", kind: "error" }];
    }
    const needle = insensitive ? pattern.toLowerCase() : pattern;
    return lines.filter(line => (insensitive ? line.toLowerCase() : line).includes(needle));
  };

  COMMANDS.wc = (args, local) => {
    const countLines = args.includes("-l");
    const targets = args.filter(arg => !arg.startsWith("-"));
    const measure = (text, label) => {
      const lines = text === "" ? 0 : text.replace(/\n$/, "").split("\n").length;
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      if (countLines) return [String(lines).padStart(6) + (label ? " " + label : "")];
      return [String(lines).padStart(6) + String(words).padStart(7) + String(text.length).padStart(7) + (label ? " " + label : "")];
    };
    if (!targets.length) {
      if (!local.stdin) return [{ text: "usage: wc [-l] <archivo>", kind: "error" }];
      return measure(local.stdin.join("\n"), "");
    }
    const output = [];
    targets.forEach(name => {
      const path = normalizePath(name).slice(1);
      if (!Object.prototype.hasOwnProperty.call(files, path)) {
        output.push({ text: "wc: " + name + ": No such file or directory", kind: "error" });
      } else {
        output.push(...measure(files[path], name));
      }
    });
    return output;
  };

  COMMANDS.find = args => {
    const root = normalizePath(args[0] || ".");
    if (!directoryExists(root)) return [{ text: "find: '" + (args[0] || ".") + "': No such file or directory", kind: "error" }];
    const prefix = root === "/" ? "/" : root.replace(/\/$/, "") + "/";
    return [...directories].filter(path => path.startsWith(prefix) && path !== root)
      .concat(Object.keys(files).map(path => "/" + path).filter(path => path.startsWith(prefix)))
      .sort((a, b) => a.localeCompare(b));
  };

  COMMANDS.tree = args => {
    const root = normalizePath(args[0] || ".");
    if (!directoryExists(root)) return [{ text: "tree: '" + (args[0] || ".") + "': No such file or directory", kind: "error" }];
    const lines = [root];
    const walk = (path, prefix) => {
      const entries = childrenOf(path);
      entries.forEach((entry, index) => {
        const last = index === entries.length - 1;
        lines.push(prefix + (last ? "└── " : "├── ") + entry);
        if (entry.endsWith("/")) walk(normalizePath(path + "/" + entry.slice(0, -1)), prefix + (last ? "    " : "│   "));
      });
    };
    walk(root, "");
    lines.push("");
    lines.push(String(childrenOf(root).length) + " directories, " + Object.keys(files).length + " files");
    return lines;
  };

  COMMANDS.echo = args => [args.join(" ")];

  COMMANDS.touch = args => {
    if (!args.length) return [{ text: "touch: missing file operand", kind: "error" }];
    args.forEach(name => {
      const path = normalizePath(name).slice(1);
      if (!path) return;
      if (!Object.prototype.hasOwnProperty.call(files, path)) files[path] = "";
      touchPath(path);
    });
    return [];
  };

  COMMANDS.write = args => {
    const match = args.length ? [args[0], args.slice(1).join(" ")] : [];
    if (!match[0]) return [{ text: "usage: write <archivo> <texto>", kind: "error" }];
    const path = normalizePath(match[0]).slice(1);
    if (!directoryExists(fileParent("/" + path))) {
      return [{ text: "write: can't create '" + match[0] + "': No such file or directory", kind: "error" }];
    }
    files[path] = match[1] + "\n";
    touchPath(path);
    return [{ text: "Guardado: /" + path, kind: "green" }];
  };

  COMMANDS.mkdir = args => {
    const parents = args.includes("-p");
    const targets = args.filter(arg => !arg.startsWith("-"));
    if (!targets.length) return [{ text: "usage: mkdir [-p] <carpeta>", kind: "error" }];
    targets.forEach(name => {
      const path = normalizePath(name);
      const parts = path.split("/").filter(Boolean);
      let built = "";
      for (const part of parts) {
        built += "/" + part;
        if (!directories.has(built)) {
          if (!parents && built !== path) return;
          directories.add(built);
          touchPath(built.slice(1));
        }
      }
    });
    return [];
  };

  COMMANDS.rmdir = args => {
    if (!args.length) return [{ text: "usage: rmdir <carpeta>", kind: "error" }];
    const output = [];
    args.forEach(name => {
      const path = normalizePath(name);
      if (!directories.has(path) || path === "/") {
        output.push({ text: "rmdir: failed to remove '" + name + "': No such directory", kind: "error" });
      } else if (childrenOf(path).length) {
        output.push({ text: "rmdir: failed to remove '" + name + "': Directory not empty", kind: "error" });
      } else {
        directories.delete(path);
      }
    });
    return output;
  };

  COMMANDS.rm = args => {
    const recursive = args.some(arg => arg.startsWith("-") && arg.includes("r"));
    const targets = args.filter(arg => !arg.startsWith("-"));
    if (!targets.length) return [{ text: "usage: rm [-r] <archivo|carpeta>", kind: "error" }];
    const output = [];
    targets.forEach(name => {
      const path = normalizePath(name);
      if (Object.prototype.hasOwnProperty.call(files, path.slice(1))) {
        delete files[path.slice(1)];
        delete mtimes[path.slice(1)];
        return;
      }
      const prefix = path.replace(/\/$/, "");
      if (directoryExists(prefix)) {
        if (!recursive) {
          output.push({ text: "rm: can't remove '" + name + "': Is a directory (usa rm -r)", kind: "error" });
          return;
        }
        [...directories].forEach(dir => { if (dir === prefix || dir.startsWith(prefix + "/")) directories.delete(dir); });
        Object.keys(files).forEach(file => {
          if (file.startsWith(prefix.slice(1) + "/")) { delete files[file]; delete mtimes[file]; }
        });
        return;
      }
      output.push({ text: "rm: can't remove '" + name + "': No such file or directory", kind: "error" });
    });
    return output;
  };

  COMMANDS.cp = args => copyOrMove("cp", args);
  COMMANDS.mv = args => copyOrMove("mv", args);

  function copyOrMove(command, args) {
    const operands = args.filter(arg => !arg.startsWith("-"));
    if (operands.length !== 2) return [{ text: "usage: " + command + " <origen> <destino>", kind: "error" }];
    const source = normalizePath(operands[0]).slice(1);
    const destinationRaw = normalizePath(operands[1]);
    const destination = directoryExists(destinationRaw)
      ? (destinationRaw === "/" ? "/" + source : destinationRaw + "/" + source.split("/").pop())
      : destinationRaw;
    const target = destination.slice(1);
    if (!Object.prototype.hasOwnProperty.call(files, source)) {
      return [{ text: command + ": can't stat '" + operands[0] + "': No such file or directory", kind: "error" }];
    }
    if (!directoryExists(fileParent("/" + target))) {
      return [{ text: command + ": can't create '" + operands[1] + "': No such file or directory", kind: "error" }];
    }
    files[target] = files[source];
    touchPath(target);
    if (command === "mv") { delete files[source]; delete mtimes[source]; }
    return [];
  }

  COMMANDS.du = args => {
    const path = normalizePath(args.find(arg => !arg.startsWith("-")) || ".");
    if (!directoryExists(path)) return [{ text: "du: can't access '" + path + "': No such file or directory", kind: "error" }];
    const prefix = path === "/" ? "" : path.replace(/\/$/, "");
    const bytes = Object.keys(files)
      .filter(file => file.startsWith(prefix.slice(1)))
      .reduce((sum, file) => sum + fileSize(file), 0);
    return [String(Math.max(4, formatKb(bytes))).padStart(6) + "\t" + displayPath(path)];
  };

  /* ---------- procesos y recursos ---------- */

  COMMANDS.ps = () => {
    const rows = ["  PID USER     TIME  COMMAND"];
    processList().forEach(row => {
      rows.push(String(row.pid).padStart(5) + " root     " + row.time.padStart(4) + "  " + row.cmd);
    });
    return rows;
  };

  COMMANDS.top = () => {
    const used = 61 + formatKb(totalBytes());
    const rows = [
      "top - " + new Date().toLocaleTimeString("es-ES") + " up " + uptimeText() + ",  1 user,  load average: 0.08, 0.12, 0.09",
      "Tasks: " + processList().length + " total,   1 running, " + (processList().length - 1) + " sleeping",
      "%Cpu(s):  1.2 us,  0.4 sy,  0.0 ni, 98.3 id",
      "MiB Mem :   256.0 total,   " + (256 - used).toFixed(1) + " free,   " + used.toFixed(1) + " used",
      "",
      "  PID USER     TIME  COMMAND",
    ];
    processList().forEach(row => {
      rows.push(String(row.pid).padStart(5) + " root     " + row.time.padStart(4) + "  " + row.cmd);
    });
    rows.push("", "(instantánea: en este shell no hay modo interactivo)");
    return rows;
  };

  COMMANDS.free = () => {
    const used = 61 + formatKb(totalBytes());
    return [
      "              total        used        free      shared  buff/cache   available",
      "Mem:            256          " + used + "         " + (256 - used) + "           0           0         " + (256 - used),
      "Swap:             0           0           0",
    ];
  };

  COMMANDS.df = () => {
    const usedKb = formatKb(totalBytes());
    const percent = Math.min(99, Math.max(1, Math.round(usedKb / 512 * 100)));
    return [
      "Filesystem                Size  Used Avail Use% Mounted on",
      "/dev/vda                  512M  " + humanSize(usedKb + 120) + "  " + humanSize(512 * 1024 - usedKb - 120) + "   " + percent + "% /",
      "tmpfs                      64M     0   64M   0% /dev/shm",
      "proc                        0K     0     0K   0% /proc",
    ];
  };

  /* ---------- servicios (OpenRC simulado) ---------- */

  COMMANDS["rc-status"] = args => {
    const runlevel = args[0] || "default";
    const rows = [
      " * /run/openweb: " + (installedToDisk ? "installed" : "live"),
      " * " + runlevel + ": " + (installedToDisk ? "sys" : "live"),
      "",
      "service                 status",
    ];
    Object.keys(services).sort().forEach(name => {
      const state = serviceInstalled(name)
        ? (services[name].started ? "started" : "stopped")
        : "(no instalado)";
      rows.push(name.padEnd(24) + " " + state);
    });
    rows.push("", "You should invoke rc-update for runlevel changes.");
    return rows;
  };

  COMMANDS["rc-service"] = args => {
    const [name, action = "status"] = args;
    if (!name) return [{ text: "usage: rc-service <servicio> [start|stop|restart|status]", kind: "error" }];
    if (!serviceInstalled(name) || !services[name]) {
      return [{ text: "rc-service: " + name + " — no existe o su paquete no está instalado (mira apk search)", kind: "error" }];
    }
    const service = services[name];
    if (action === "status") {
      return [name + " | " + (service.started ? "started" : "stopped") + " | " + (SERVICE_DESCRIPTIONS[name] || "")];
    }
    if (action === "start") {
      if (service.started) return [name + " is already started"];
      service.started = true;
      return [{ text: " * Starting " + name + " ... [ ok ]", kind: "green" }];
    }
    if (action === "stop") {
      if (!service.started) return [name + " is not started"];
      service.started = false;
      return [{ text: " * Stopping " + name + " ... [ ok ]", kind: "green" }];
    }
    if (action === "restart") {
      service.started = false;
      service.started = true;
      return [{ text: " * Restarting " + name + " ... [ ok ]", kind: "green" }];
    }
    return [{ text: "rc-service: acción desconocida '" + action + "'", kind: "error" }];
  };

  COMMANDS["rc-update"] = args => {
    const [action, name, level = "default"] = args;
    if (!action) {
      const attached = Object.keys(services).filter(svc => services[svc].runlevels.length);
      return attached.length ? attached.map(svc => svc.padEnd(20) + " " + services[svc].runlevels.join(" ")) : ["(runlevels vacíos)"];
    }
    if (!name || !services[name] || !serviceInstalled(name)) {
      return [{ text: "rc-update: servicio desconocido o no instalado" + (name ? ": " + name : ""), kind: "error" }];
    }
    if (action === "add") {
      if (!services[name].runlevels.includes(level)) services[name].runlevels.push(level);
      return [{ text: name + " added to " + level, kind: "green" }];
    }
    if (action === "del") {
      services[name].runlevels = services[name].runlevels.filter(item => item !== level);
      return [{ text: name + " removed from " + level, kind: "green" }];
    }
    return [{ text: "rc-update: acción desconocida '" + action + "'", kind: "error" }];
  };

  /* ---------- paquetes (apk simulado) ---------- */

  COMMANDS.apk = args => {
    const [action, ...rest] = args;
    if (!action) return [{ text: "usage: apk [update|upgrade|add|del|search|info|list] — gestor simulado", kind: "error" }];

    if (action === "update") {
      return [
        { text: "fetch https://dl-cdn.alpinelinux.org/alpine/latest-stable/main/x86_64/APKINDEX.tar.gz", kind: "muted" },
        { text: "fetch https://dl-cdn.alpinelinux.org/alpine/latest-stable/community/x86_64/APKINDEX.tar.gz", kind: "muted" },
        "OK: 20480 distinct packages available",
      ];
    }

    if (action === "upgrade") return [apkSummary() + " (todo actualizado)"];

    if (action === "search") {
      const term = (rest[0] || "").toLowerCase();
      const hits = APK_CATALOG.filter(pkg => pkg.name.includes(term) || pkg.desc.toLowerCase().includes(term));
      if (!hits.length) return ["WARNING: No such package found: " + (rest[0] || "?")];
      return hits.map(pkg => pkg.name + "-" + pkg.version + (packages.has(pkg.name) ? " (instalado)" : ""));
    }

    if (action === "info" || action === "list") {
      const installed = APK_CATALOG.filter(pkg => packages.has(pkg.name));
      if (action === "info" && rest[0]) {
        const pkg = packageEntry(rest[0]);
        if (!pkg) return [{ text: "ERROR: package '" + rest[0] + "' not found", kind: "error" }];
        return [
          pkg.name + "-" + pkg.version,
          "descr=" + pkg.desc,
          "size=" + humanSize(pkg.kb),
          "state=" + (packages.has(pkg.name) ? "installed" : "available"),
        ];
      }
      return installed.map(pkg => pkg.name + "-" + pkg.version);
    }

    if (action === "add") {
      if (!rest.length) return [{ text: "apk add: falta el paquete (apk search <texto> para buscar)", kind: "error" }];
      const lines = [];
      let added = 0;
      for (const name of rest) {
        const pkg = packageEntry(name);
        if (!pkg) return [{ text: "ERROR: unable to select packages:\n  " + name + " (no such package)", kind: "error" }];
        if (packages.has(pkg.name)) { lines.push(pkg.name + " is already installed"); continue; }
        if (pkg.provides && services[pkg.provides] === undefined) services[pkg.provides] = { started: false, runlevels: [] };
        packages.add(pkg.name);
        if (binaryPath(pkg.name)) {
          files["usr/bin/" + pkg.name] = "";
          touchPath("usr/bin/" + pkg.name);
        }
        lines.push("(" + (++added) + "/" + rest.length + ") Installing " + pkg.name + " (" + pkg.version + ")");
      }
      lines.push({ text: apkSummary(), kind: "muted" });
      return lines;
    }

    if (action === "del") {
      if (!rest.length) return [{ text: "apk del: falta el paquete", kind: "error" }];
      const lines = [];
      rest.forEach((name, index) => {
        if (!packages.has(name)) { lines.push({ text: "WARNING: Skipping " + name + ": not installed", kind: "muted" }); return; }
        const pkg = packageEntry(name);
        packages.delete(name);
        if (pkg && pkg.provides && services[pkg.provides]) services[pkg.provides].started = false;
        if (binaryPath(name) && Object.prototype.hasOwnProperty.call(files, "usr/bin/" + name)) delete files["usr/bin/" + name];
        lines.push("(" + (index + 1) + "/" + rest.length + ") Removing " + name + " ...");
      });
      lines.push({ text: apkSummary(), kind: "muted" });
      return lines;
    }

    return [{ text: "apk: subcomando desconocido '" + action + "'", kind: "error" }];
  };

  function binaryPath(name) {
    if (!APK_CATALOG.some(pkg => pkg.name === name && !pkg.base)) return null;
    return "/usr/bin/" + name;
  }

  /* ---------- comandos que llegan con paquetes ---------- */

  COMMANDS.cowsay = args => {
    const text = args.join(" ") || "muuu";
    const border = "_".repeat(text.length + 2);
    return [
      " " + border,
      "< " + text + " >",
      " " + "-".repeat(text.length + 2),
      "        \\   ^__^",
      "         \\  (oo)\\_______",
      "            (__)\\       )\\/\\",
      "                ||----w |",
      "                ||     ||",
    ];
  };

  COMMANDS.neofetch = () => {
    const logo = [
      "        /\\",
      "       /  \\        root@" + hostname,
      "      / /\\ \\       --------------",
      "     / /  \\ \\      OS       OpenWeb Linux 1.0 (simulado)",
      "    / / /\\_\\ \\     Host     navegador web",
      "   / / /    \\ \\    Kernel   6.6.0-openweb",
      "  / / /  /\\  \\ \\   Uptime   " + uptimeText(),
      " /_/_/__/  \\__\\_\\  Packages " + packages.size + " (apk)",
      " \\_______________/ Shell    ash 1.37",
      "                   Screen   " + window.innerWidth + "x" + window.innerHeight,
      "                   CPU      " + (navigator.hardwareConcurrency || 4) + " x Browser CPU",
      "                   Memory   " + (61 + formatKb(totalBytes())) + "MiB / 256MiB",
    ];
    return logo.map(line => ({ text: line, kind: "green" }));
  };

  COMMANDS.figlet = args => {
    const text = (args.join(" ") || "openweb").toUpperCase();
    const lines = ["", "", "", "", ""];
    for (const character of text) {
      const glyph = FIGFONT[character] || FIGFONT["?"];
      glyph.forEach((row, index) => { lines[index] += row + " "; });
    }
    return lines;
  };

  COMMANDS.htop = () => COMMANDS.top();
  COMMANDS.nano = () => [{ text: "nano: el editor no está incluido en el modo simulado; usa echo \"texto\" > archivo", kind: "muted" }];
  COMMANDS.vim = () => [{ text: "vim: el editor no está incluido en el modo simulado; usa echo \"texto\" > archivo", kind: "muted" }];
  COMMANDS.vi = () => COMMANDS.vim();
  COMMANDS.curl = () => [{ text: "curl: (7) Fallo al conectar: este shell simulado no tiene red saliente", kind: "error" }];
  COMMANDS.wget = () => [{ text: "wget: unable to resolve host address (este shell simulado no tiene red)", kind: "error" }];
  COMMANDS.ping = () => [{ text: "ping: sendmsg: Network is unreachable (simulación sin red)", kind: "error" }];
  COMMANDS.git = () => [{ text: "fatal: not a git repository (o sí: el código de esta web está en GitHub)", kind: "muted" }];
  COMMANDS.python3 = () => [{ text: "Python 3.12.7 (OpenWeb simulado) — intérprete no incluido en el modo simulado", kind: "muted" }];
  COMMANDS.node = () => [{ text: "v22.11.0 (OpenWeb simulado) — intérprete no incluido en el modo simulado", kind: "muted" }];

  /* ---------- setup-alpine (asistente) ---------- */

  COMMANDS["setup-alpine"] = () => {
    startSetupWizard();
    return undefined;
  };

  function startSetupWizard() {
    const steps = [];
    steps.push(ask("Elige un hostname para el sistema [" + hostname + "]: ", answer => {
      const value = answer.trim();
      if (value) hostname = value.replace(/[^a-zA-Z0-9-]/g, "") || hostname;
      files["etc/hostname"] = hostname + "\n";
      touchPath("etc/hostname");
    }));
    steps.push(ask("Interfaz de red (eth0) y método (dhcp) [eth0/dhcp]: ", () => {
      printLater("configurando eth0 con dhcp...", "muted");
      printLater("eth0 tiene dirección 10.0.2.15/24 vía dhcp (red simulada)", "muted");
    }));
    steps.push(ask("Mirror de paquetes [1 — dl-cdn.alpinelinux.org]: ", () => {
      printLater("fetch https://dl-cdn.alpinelinux.org/alpine/latest-stable/main/x86_64/APKINDEX.tar.gz", "muted");
      printLater("OK: mirror configurado", "muted");
    }));
    steps.push(ask("¿Instalar el sistema en el disco virtual /dev/vda? [y/N]: ", answer => {
      if (!/^y(es)?$/i.test(answer.trim())) {
        printLater("Instalación omitida. El sistema sigue en modo live (en memoria del navegador).", "muted");
        return;
      }
      installedToDisk = true;
      files["etc/issue"] = "OpenWeb Linux 1.0 (tty1) — instalado\\n\\l\n";
      touchPath("etc/issue");
      [
        "WARNING: se borrará el contenido de /dev/vda",
        "Installing system to /dev/vda...",
        "Installing alpine-base, busybox y apk...",
        "Generating /etc/fstab...",
        "Installing boot loader...",
        "Installation complete. Usa reboot para arrancar desde el disco.",
      ].forEach((line, index) => printLater(line, index === 5 ? "green" : "muted", 400 * (index + 1)));
    }));

    runSteps(steps);
  }

  function ask(prompt, handler) {
    return { prompt, handler };
  }

  function runSteps(steps) {
    const step = steps.shift();
    if (!step) { interactiveHandler = null; saveLocal(); return; }
    appendLine(step.prompt.replace(/\n/g, ""), "blue");
    interactiveHandler = answer => {
      step.handler(answer);
      runSteps(steps);
    };
  }

  function printLater(text, kind, delay) {
    setTimeout(() => appendLine(text, kind), delay === undefined ? 350 : delay);
  }

  /* ============================================================
     7. Terminal: sesiones, pestañas y prompt
     ============================================================ */

  const terminalSessions = [];
  let activeTerminal = null;
  let nextTerminalNumber = 1;

  function renderTerminalTabs() {
    terminalTabs.querySelectorAll('[role="tab"]').forEach(tab => tab.remove());
    terminalSessions.forEach(session => {
      const tab = document.createElement("button");
      tab.className = "terminal-tab";
      tab.type = "button";
      tab.id = "tab-" + session.id;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", session.output.id);
      tab.setAttribute("aria-selected", String(session === activeTerminal));
      tab.tabIndex = session === activeTerminal ? 0 : -1;
      tab.textContent = session.name;
      tab.addEventListener("click", () => activateTerminalSession(session));
      tab.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const currentIndex = terminalSessions.indexOf(session);
        const targetIndex = event.key === "Home" ? 0
          : event.key === "End" ? terminalSessions.length - 1
          : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + terminalSessions.length) % terminalSessions.length;
        const target = terminalSessions[targetIndex];
        activateTerminalSession(target);
        document.getElementById("tab-" + target.id).focus();
      });
      terminalTabs.insertBefore(tab, document.getElementById("new-terminal-tab"));
      session.output.setAttribute("aria-labelledby", tab.id);
    });
    document.getElementById("close-terminal-tab").disabled = terminalSessions.length === 1;
  }

  function makeTerminalSession(name, sessionOutput) {
    const session = {
      id: "terminal-" + nextTerminalNumber++,
      pid: nextPid++,
      name,
      output: sessionOutput,
      history: [],
      historyIndex: 0,
      draft: "",
    };
    session.output.id = session.id + "-output";
    session.output.classList.add("terminal-session");
    session.output.setAttribute("role", "tabpanel");
    terminalSessions.push(session);
    return session;
  }

  function activateTerminalSession(session, focus = true, persist = true) {
    const previousInput = output.querySelector("#command-input");
    if (previousInput) {
      if (activeTerminal) activeTerminal.draft = previousInput.value;
      previousInput.remove();
    }
    activeTerminal = session;
    output = session.output;
    terminalSessions.forEach(item => { item.output.hidden = item !== session; });
    renderTerminalTabs();
    if (focus) focusPrompt();
    if (persist) saveLocal();
  }

  function addTerminalSession() {
    const sessionOutput = document.createElement("div");
    sessionOutput.className = "terminal-content terminal-session";
    terminalPanels.appendChild(sessionOutput);
    const session = makeTerminalSession("ash " + nextTerminalNumber, sessionOutput);
    activateTerminalSession(session, true, false);
    appendLine("Nueva sesión ash (PID " + session.pid + "). Todos los directorios se comparten.", "muted");
    focusPrompt();
    saveLocal();
  }

  function closeActiveTerminalSession() {
    if (terminalSessions.length < 2 || !activeTerminal) return;
    const index = terminalSessions.indexOf(activeTerminal);
    activeTerminal.output.remove();
    terminalSessions.splice(index, 1);
    const next = terminalSessions[Math.min(index, terminalSessions.length - 1)];
    activeTerminal = null;
    output = next.output;
    activateTerminalSession(next, true, false);
    saveLocal();
  }

  function promptParts() {
    const line = document.createElement("div");
    line.className = "line";
    const user = document.createElement("span");
    user.className = "prompt-user";
    user.textContent = "root@" + hostname;
    const path = document.createElement("span");
    path.className = "prompt-path";
    path.textContent = ":" + displayPath(currentPath);
    const symbol = document.createElement("span");
    symbol.className = "prompt-symbol";
    symbol.textContent = "#";
    line.append(user, path, symbol);
    return line;
  }

  function addPrompt(command) {
    const line = promptParts();
    line.appendChild(document.createTextNode(command));
    output.appendChild(line);
  }

  function focusPrompt() {
    const old = document.getElementById("command-input");
    if (old) old.remove();
    const session = activeTerminal;
    const line = promptParts();
    line.classList.add("prompt-line");
    const input = document.createElement("input");
    input.id = "command-input";
    input.autocomplete = "off";
    input.autocapitalize = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Comando de terminal");
    input.value = session.draft;
    session.draft = "";
    line.appendChild(input);
    output.appendChild(line);
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        const value = input.value;
        session.draft = "";
        line.remove();
        if (interactiveHandler) {
          activeTerminal.history.push(value);
          activeTerminal.historyIndex = activeTerminal.history.length;
          addPrompt(value);
          const handler = interactiveHandler;
          interactiveHandler = null;
          handler(value);
          focusPrompt();
          saveLocal();
        } else {
          runInput(value);
          focusPrompt();
          saveLocal();
        }
        scroll.scrollTop = scroll.scrollHeight;
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (interactiveHandler) return;
        if (session.historyIndex > 0) input.value = session.history[--session.historyIndex];
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        if (interactiveHandler) return;
        if (session.historyIndex < session.history.length - 1) input.value = session.history[++session.historyIndex];
        else { session.historyIndex = session.history.length; input.value = ""; }
      } else if (event.key === "Tab") {
        event.preventDefault();
        completeCommand(input);
      }
    });
    input.focus();
  }

  function completeCommand(input) {
    const value = input.value;
    const parts = value.split(" ");
    const token = parts[parts.length - 1];
    let candidates;
    if (parts.length === 1) {
      candidates = Object.keys(COMMANDS).filter(name => name.startsWith(token));
    } else {
      const base = normalizePath(token || ".");
      candidates = childrenOf(base).map(entry => entry.slice(0, -1) || entry)
        .filter(name => name.startsWith(token.split("/").pop()));
    }
    if (candidates.length === 1) {
      parts[parts.length - 1] = candidates[0] + (parts.length === 1 ? " " : "");
      input.value = parts.join(" ");
    } else if (candidates.length > 1) {
      appendLine(candidates.join("  "), "muted");
      scroll.scrollTop = scroll.scrollHeight;
    }
  }

  /* ============================================================
     8. Teclado táctil
     ============================================================ */

  let keyboardShift = false;

  function insertKeyboardText(input, text) {
    const start = input.selectionStart === null ? input.value.length : input.selectionStart;
    const end = input.selectionEnd === null ? start : input.selectionEnd;
    input.setRangeText(text, start, end, "end");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  }

  function pressWorkspaceKey(action) {
    const input = document.getElementById("command-input");
    if (!input) return;
    if (action === "backspace") {
      const start = input.selectionStart === null ? input.value.length : input.selectionStart;
      const end = input.selectionEnd === null ? start : input.selectionEnd;
      if (start === end && start > 0) input.setSelectionRange(start - 1, end);
      insertKeyboardText(input, "");
    } else if (action === "tab") {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    } else if (action === "enter") {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    } else if (action === "up" || action === "down") {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: action === "up" ? "ArrowUp" : "ArrowDown", bubbles: true }));
    } else if (action === "left" || action === "right") {
      const position = input.selectionStart === null ? input.value.length : input.selectionStart;
      const next = Math.max(0, Math.min(input.value.length, position + (action === "left" ? -1 : 1)));
      input.setSelectionRange(next, next);
      input.focus();
    } else if (action === "escape") {
      interactiveHandler = null;
      input.value = "";
      input.focus();
    }
  }

  function pressVirtualKey(action, text) {
    if (action === "shift") {
      keyboardShift = !keyboardShift;
      keyboardPanel.querySelector('[data-key-action="shift"]').setAttribute("aria-pressed", String(keyboardShift));
      return;
    }
    const value = text === undefined ? "" : (keyboardShift ? text.toUpperCase() : text);
    keyboardShift = false;
    keyboardPanel.querySelector('[data-key-action="shift"]').setAttribute("aria-pressed", "false");
    if (action) pressWorkspaceKey(action);
    else {
      const input = document.getElementById("command-input");
      if (input) insertKeyboardText(input, value);
    }
  }

  keyboardPanel.querySelectorAll("[data-key-row]").forEach(row => {
    for (const character of row.dataset.keyRow) {
      const button = document.createElement("button");
      button.className = "keyboard-key";
      button.type = "button";
      button.dataset.keyText = character;
      button.textContent = character;
      row.appendChild(button);
    }
  });
  keyboardPanel.querySelectorAll(".keyboard-key").forEach(button => {
    button.addEventListener("pointerdown", event => event.preventDefault());
    button.addEventListener("click", () => pressVirtualKey(button.dataset.keyAction, button.dataset.keyText));
  });
  function setKeyboardOpen(open) {
    keyboardPanel.hidden = !open;
    keyboardToggle.setAttribute("aria-expanded", String(open));
    keyboardToggle.textContent = open ? "⌨ Ocultar" : "⌨ Teclado";
  }
  keyboardToggle.addEventListener("click", () => setKeyboardOpen(keyboardPanel.hidden));
  if (window.matchMedia("(pointer: coarse)").matches) setKeyboardOpen(true);

  /* ============================================================
     9. Persistencia y respaldos
     ============================================================ */

  function snapshotSystem() {
    return {
      app: "OpenWeb Linux shell",
      version: SYSTEM_VERSION,
      exportedAt: new Date().toISOString(),
      files,
      directories: [...directories],
      mtimes: { ...mtimes },
      packages: [...packages],
      services: JSON.parse(JSON.stringify(services)),
      bootLog: bootLog.slice(),
      hostname,
      installedToDisk,
      currentPath,
      terminalTabs: terminalSessions.map(session => ({
        name: session.name,
        history: session.history.slice(-100),
      })),
      activeTerminal: terminalSessions.indexOf(activeTerminal),
    };
  }

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotSystem()));
      storageStatus.textContent = "Sistema guardado en este navegador";
      return true;
    } catch (error) {
      storageStatus.textContent = "No se pudo guardar localmente";
      showToast("No se pudo guardar el sistema. Usa save para descargar una copia.");
      return false;
    }
  }

  function downloadSystem() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshotSystem(), null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "openweb-linux-system.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function restoreTerminalSessions(savedTabs, selectedIndex) {
    if (!Array.isArray(savedTabs) || !savedTabs.length) return false;
    const validTabs = savedTabs.filter(tab => tab && typeof tab.name === "string" && Array.isArray(tab.history));
    if (!validTabs.length) return false;
    while (terminalSessions.length < validTabs.length) {
      const sessionOutput = document.createElement("div");
      sessionOutput.className = "terminal-content terminal-session";
      terminalPanels.appendChild(sessionOutput);
      makeTerminalSession("ash " + nextTerminalNumber, sessionOutput);
    }
    while (terminalSessions.length > validTabs.length) {
      terminalSessions.pop().output.remove();
    }
    validTabs.forEach((saved, index) => {
      terminalSessions[index].name = saved.name.slice(0, 40);
      terminalSessions[index].history = saved.history.filter(item => typeof item === "string").slice(-100);
      terminalSessions[index].historyIndex = terminalSessions[index].history.length;
    });
    const index = Number.isInteger(selectedIndex) ? Math.min(Math.max(selectedIndex, 0), terminalSessions.length - 1) : 0;
    activeTerminal = null;
    output = terminalSessions[index].output;
    activateTerminalSession(terminalSessions[index], false, false);
    return true;
  }

  function loadSystemData(data) {
    const validFiles = data.files && typeof data.files === "object" && !Array.isArray(data.files);
    if (!validFiles) return false;

    for (const [name, contents] of Object.entries(data.files)) {
      if (name && typeof contents === "string" && !name.startsWith("/") && !name.split("/").includes("..")) files[name] = contents;
    }
    if (Array.isArray(data.directories)) data.directories.forEach(name => {
      if (typeof name === "string" && name.startsWith("/") && !name.split("/").includes("..")) directories.add(normalizePath(name));
    });
    if (data.mtimes && typeof data.mtimes === "object") Object.assign(mtimes, data.mtimes);
    Object.keys(files).forEach(path => { if (!mtimes[path]) touchPath(path); });
    if (Array.isArray(data.packages)) data.packages.forEach(name => { if (typeof name === "string" && packageEntry(name)) packages.add(name); });
    if (data.services && typeof data.services === "object") Object.keys(services).forEach(name => {
      const saved = data.services[name];
      if (saved && typeof saved.started === "boolean") {
        services[name] = { started: saved.started, runlevels: Array.isArray(saved.runlevels) ? saved.runlevels : [] };
      }
    });
    if (Array.isArray(data.bootLog)) data.bootLog.forEach(line => { if (typeof line === "string") bootLog.push(line); });
    if (typeof data.hostname === "string" && /^[a-zA-Z0-9-]{1,64}$/.test(data.hostname)) hostname = data.hostname;
    if (typeof data.installedToDisk === "boolean") installedToDisk = data.installedToDisk;
    restoreTerminalSessions(data.terminalTabs, data.activeTerminal);
    currentPath = typeof data.currentPath === "string" && data.currentPath.startsWith("/") ? normalizePath(data.currentPath) : env.HOME;
    if (!directoryExists(currentPath)) currentPath = env.HOME;
    env.PWD = currentPath;
    return true;
  }

  /* ============================================================
     10. UI: diálogos y barra de herramientas
     ============================================================ */

  let modalReturnFocus = null;

  function openModal(id) {
    if (!document.querySelector(".modal-backdrop.open")) modalReturnFocus = document.activeElement;
    document.querySelectorAll(".modal-backdrop.open").forEach(modal => modal.classList.remove("open"));
    const modal = document.getElementById(id);
    modal.classList.add("open");
    modal.querySelector("[data-close]").focus();
  }

  function closeModals() {
    const hadOpenModal = Boolean(document.querySelector(".modal-backdrop.open"));
    document.querySelectorAll(".modal-backdrop.open").forEach(modal => modal.classList.remove("open"));
    if (hadOpenModal && modalReturnFocus instanceof HTMLElement && modalReturnFocus.isConnected) modalReturnFocus.focus();
    modalReturnFocus = null;
  }

  document.getElementById("guide-button").addEventListener("click", () => openModal("setup-modal"));
  document.getElementById("apk-button").addEventListener("click", () => openModal("apk-modal"));
  document.getElementById("save-button").addEventListener("click", () => openModal("save-modal"));
  document.getElementById("restore-button").addEventListener("click", () => openModal("restore-modal"));
  document.getElementById("new-terminal-tab").addEventListener("click", addTerminalSession);
  document.getElementById("close-terminal-tab").addEventListener("click", closeActiveTerminalSession);
  document.getElementById("download-system").addEventListener("click", () => {
    closeModals();
    downloadSystem();
    saveLocal();
    showToast("Sistema descargado como JSON. También vive en este navegador.");
  });
  document.getElementById("open-backup-file").addEventListener("click", () => {
    closeModals();
    restoreInput.click();
  });
  document.getElementById("fullscreen-button").addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) {
      showToast("El navegador no permitió cambiar a pantalla completa.");
    }
  });
  document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", closeModals));
  document.querySelectorAll(".modal-backdrop").forEach(backdrop => backdrop.addEventListener("click", event => {
    if (event.target === backdrop) closeModals();
  }));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && document.querySelector(".modal-backdrop.open")) closeModals();
    if (event.key === "Tab" && document.querySelector(".modal-backdrop.open")) {
      const modal = document.querySelector(".modal-backdrop.open");
      const controls = [...modal.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
        .filter(control => !control.hidden && control.getClientRects().length);
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  document.querySelectorAll("[data-command]").forEach(button => button.addEventListener("click", () => {
    closeModals();
    if (!navigator.clipboard || !window.isSecureContext) {
      showToast("Abre el sitio por HTTPS para copiar comandos al portapapeles.");
      return;
    }
    navigator.clipboard.writeText(button.dataset.command)
      .then(() => showToast("Comando copiado: " + button.dataset.command))
      .catch(error => showToast("No se pudo copiar: " + error.message));
  }));

  restoreInput.addEventListener("change", async () => {
    const file = restoreInput.files && restoreInput.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const usable = data && (data.version === SYSTEM_VERSION || data.version === 1) && data.files;
      if (!usable) throw new Error("Formato de respaldo no compatible.");
      for (const [name, contents] of Object.entries(data.files)) {
        if (typeof name !== "string" || !name || typeof contents !== "string" || name.startsWith("/") || name.split("/").includes("..")) {
          throw new Error("El respaldo contiene una ruta no válida.");
        }
      }
      Object.keys(files).forEach(name => { delete files[name]; delete mtimes[name]; });
      directories.clear();
      directories.add("/");
      Object.keys(services).forEach(name => { delete services[name]; });
      packages.clear();
      bootLog.length = 0;
      BASE_SERVICES.forEach(name => { services[name] = { started: true, runlevels: name === "crond" ? ["default"] : ["boot", "default"] }; });
      ["sshd", "nginx", "ntpd"].forEach(name => { services[name] = { started: false, runlevels: [] }; });
      loadSystemData(data);
      output.replaceChildren();
      appendLine("Sistema restaurado desde " + file.name, "green");
      appendLine("Archivos: " + Object.keys(files).length + " · paquetes: " + packages.size, "muted");
      saveLocal();
      focusPrompt();
      showToast("Respaldo restaurado.");
    } catch (error) {
      showToast("No se pudo restaurar: " + error.message);
    } finally {
      restoreInput.value = "";
    }
  });

  /* ============================================================
     11. Arranque
     ============================================================ */

  function printBanner(restored) {
    if (restored) {
      appendLine("OpenWeb Linux 1.0 (tty1) — sesión restaurada", "green");
    } else {
      appendLine("OpenWeb Linux 1.0 (tty1) — shell completo simulado inspirado en Alpine", "green");
      appendLine("Todo corre en tu navegador: archivos, paquetes y servicios persisten aquí.", "muted");
    }
    appendLine("Escribe help para ver los comandos o neofetch para fichar el sistema.", "muted");
  }

  makeTerminalSession("ash 1", output);
  activeTerminal = terminalSessions[0];
  nextTerminalNumber = 2;
  renderTerminalTabs();

  seedSystem();

  let restored = false;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && (saved.version === SYSTEM_VERSION || saved.version === 1) && saved.files && typeof saved.files === "object" && !Array.isArray(saved.files)) {
      restored = loadSystemData(saved);
      storageStatus.textContent = "Sistema restaurado de este navegador";
    }
  } catch (error) {
    appendLine("No se pudo leer el guardado local: " + error.message, "error");
  }

  printBanner(restored);
  if (restored) {
    appendLine("Archivos: " + Object.keys(files).length + " · paquetes: " + packages.size +
      " · servicios activos: " + Object.keys(services).filter(name => services[name].started).length, "muted");
  }
  appendLine("root@" + hostname + ":" + displayPath(currentPath) + "#  (escribe help)", "blue");
  focusPrompt();
})();

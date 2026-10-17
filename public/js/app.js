    (() => {
      "use strict";

      const STORAGE_KEY = "openweb-linux-workspace-v1";
      const VM_STATE_DATABASE = "openweb-linux-local-vm";
      const VM_STATE_STORE = "state";
      const VM_STATE_KEY = "alpine-latest-v1";
      let output = document.getElementById("terminal-content");
      const scroll = document.getElementById("terminal-scroll");
      const terminalTabs = document.getElementById("terminal-tabs");
      const terminalPanels = document.getElementById("terminal-sessions");
      const restoreInput = document.getElementById("restore-input");
      const storageStatus = document.getElementById("storage-status");
      const toast = document.getElementById("toast");
      const keyboardPanel = document.getElementById("mobile-keyboard");
      const keyboardToggle = document.getElementById("keyboard-toggle");
      const files = Object.assign(Object.create(null), { "README.txt": "Bienvenido a OpenWeb Linux.\nEste espacio de archivos se guarda en este navegador.\nUsa help para ver los comandos disponibles.\n" });
      const directories = new Set(["/"]);
      const terminalSessions = [];
      let emulator = null;
      let vmRunning = false;
      let currentPath = "/";
      let activeTerminal = null;
      let nextTerminalNumber = 1;
      let vmScreenVisible = false;
      let keyboardShift = false;
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
        output.style.display = vmScreenVisible ? "none" : "";
        renderTerminalTabs();
        if (!vmScreenVisible && focus) focusPrompt();
        if (persist) saveLocal();
      }

      function addTerminalSession() {
        const sessionOutput = document.createElement("div");
        sessionOutput.className = "terminal-content terminal-session";
        terminalPanels.appendChild(sessionOutput);
        const session = makeTerminalSession("Terminal " + nextTerminalNumber, sessionOutput);
        session.draft = "";
        activateTerminalSession(session, true, false);
        appendLine("Terminal nueva. Los archivos y directorios se comparten entre pestañas.", "muted");
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

      function saveTerminalSessions() {
        return {
          terminalTabs: terminalSessions.map(session => ({
            name: session.name,
            history: session.history.slice(-100),
          })),
          activeTerminal: terminalSessions.indexOf(activeTerminal),
        };
      }

      function restoreTerminalSessions(savedTabs, selectedIndex) {
        if (!Array.isArray(savedTabs) || !savedTabs.length) return false;
        const validTabs = savedTabs.filter(tab => tab && typeof tab.name === "string" && Array.isArray(tab.history));
        if (!validTabs.length) return false;
        while (terminalSessions.length < validTabs.length) {
          const sessionOutput = document.createElement("div");
          sessionOutput.className = "terminal-content terminal-session";
          terminalPanels.appendChild(sessionOutput);
          makeTerminalSession("Terminal " + nextTerminalNumber, sessionOutput);
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

      function addPrompt(command) {
        const line = document.createElement("div");
        line.className = "line";
        const user = document.createElement("span");
        user.className = "prompt-user";
        user.textContent = "openweb@browser";
        const path = document.createElement("span");
        path.className = "prompt-path";
        path.textContent = ":" + currentPath;
        const symbol = document.createElement("span");
        symbol.className = "prompt-symbol";
        symbol.textContent = "$";
        line.append(user, path, symbol, document.createTextNode(command));
        output.appendChild(line);
      }

      function saveLocal() {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, files, directories: [...directories], currentPath, history: activeTerminal ? activeTerminal.history.slice(-100) : [], ...saveTerminalSessions() }));
          storageStatus.textContent = "Cambios guardados en este navegador";
          return true;
        } catch (error) {
          storageStatus.textContent = "No se pudo guardar localmente";
          showToast("No se pudo guardar en el navegador. Descarga una copia antes de cerrar.");
          return false;
        }
      }

      function openVMStateDatabase() {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open(VM_STATE_DATABASE, 1);
          request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(VM_STATE_STORE)) {
              request.result.createObjectStore(VM_STATE_STORE);
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error("No se pudo abrir el almacenamiento local de VM."));
          request.onblocked = () => reject(new Error("El almacenamiento local está bloqueado por otra pestaña."));
        });
      }

      async function saveLocalVMState(state) {
        const database = await openVMStateDatabase();
        try {
          await new Promise((resolve, reject) => {
            const transaction = database.transaction(VM_STATE_STORE, "readwrite");
            transaction.objectStore(VM_STATE_STORE).put(new Blob([state], { type: "application/octet-stream" }), VM_STATE_KEY);
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error || new Error("No se pudo guardar la VM en el navegador."));
            transaction.onabort = () => reject(transaction.error || new Error("Se canceló el guardado local de la VM."));
          });
        } finally {
          database.close();
        }
      }

      async function loadLocalVMState() {
        const database = await openVMStateDatabase();
        try {
          const blob = await new Promise((resolve, reject) => {
            const transaction = database.transaction(VM_STATE_STORE, "readonly");
            const request = transaction.objectStore(VM_STATE_STORE).get(VM_STATE_KEY);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error || new Error("No se pudo leer el respaldo local de la VM."));
            transaction.onabort = () => reject(transaction.error || new Error("Se canceló la lectura del respaldo local."));
          });
          return blob ? await blob.arrayBuffer() : null;
        } finally {
          database.close();
        }
      }

      async function updateLocalVMRestoreButton() {
        const button = document.getElementById("restore-local-vm");
        if (!button) return;
        const state = await loadLocalVMState();
        button.disabled = !state;
        button.textContent = state ? "Restaurar VM de este navegador" : "No hay una VM guardada en este navegador";
      }

      function normalizePath(path) {
        const absolute = path.startsWith("/") ? path : currentPath.replace(/\/$/, "") + "/" + path;
        const parts = [];
        absolute.split("/").forEach(part => {
          if (!part || part === ".") return;
          if (part === "..") parts.pop();
          else parts.push(part);
        });
        return "/" + parts.join("/");
      }

      function childrenOf(path) {
        const prefix = path === "/" ? "/" : path.replace(/\/$/, "") + "/";
        const found = new Set();
        directories.forEach(directory => {
          if (directory === path || !directory.startsWith(prefix)) return;
          const rest = directory.slice(prefix.length);
          if (rest) found.add(rest.split("/")[0] + "/");
        });
        Object.keys(files).forEach(file => {
          if (!file.startsWith(prefix)) return;
          const rest = file.slice(prefix.length);
          if (rest) found.add(rest.split("/")[0] + (rest.includes("/") ? "/" : ""));
        });
        return [...found].sort((a, b) => a.localeCompare(b));
      }

      function directoryHasChildren(path) {
        const prefix = path === "/" ? "/" : path.replace(/\/$/, "") + "/";
        return directories.has(path) || Object.keys(files).some(file => file.startsWith(prefix)) ||
          [...directories].some(directory => directory !== path && directory.startsWith(prefix));
      }

      function fileParent(path) {
        const separator = path.lastIndexOf("/");
        return separator > 0 ? path.slice(0, separator) : "/";
      }

      function destinationFilePath(source, destination) {
        return directories.has(destination) ? normalizePath(destination + "/" + source.split("/").pop()).slice(1) : destination.slice(1);
      }

      function printTree(path, prefix = "") {
        const entries = childrenOf(path);
        entries.forEach((entry, index) => {
          const last = index === entries.length - 1;
          appendLine(prefix + (last ? "└── " : "├── ") + entry);
          if (entry.endsWith("/")) printTree(normalizePath(path + "/" + entry.slice(0, -1)), prefix + (last ? "    " : "│   "));
        });
      }

      function execute(raw) {
        const input = raw.trim();
        addPrompt(raw);
        if (!input) return;
        activeTerminal.history.push(raw);
        activeTerminal.historyIndex = activeTerminal.history.length;
        const [command, ...args] = input.split(/\s+/);
        const argument = args.join(" ");

        switch (command) {
          case "help":
            appendLine("Comandos disponibles en el espacio web (no ejecutan comandos del sistema):", "muted");
            appendLine("Archivos: ls, cd, pwd, tree, find, cat, head, tail, grep, wc, touch, write, mkdir, rmdir, cp, mv, rm");
            appendLine("Utilidades: echo, date, whoami, uname, history, clear, help, save, download, apk");
            appendLine("Los archivos se comparten entre pestañas y se guardan en este navegador.", "muted");
            break;
          case "echo":
            appendLine(input.replace(/^echo(?:\s+|$)/, ""));
            break;
          case "date":
            appendLine(new Date().toString());
            break;
          case "whoami":
            appendLine("openweb");
            break;
          case "uname":
            appendLine(args[0] === "-a" ? "OpenWeb browser-workspace 1.0 browser local" : "OpenWeb");
            break;
          case "history":
            activeTerminal.history.forEach((entry, index) => appendLine(String(index + 1).padStart(4, " ") + "  " + entry));
            break;
          case "pwd":
            appendLine(currentPath);
            break;
          case "ls": {
            const path = normalizePath(args[0] || ".");
            const entries = childrenOf(path);
            if (!directoryHasChildren(path)) appendLine("ls: no existe el directorio: " + path, "error");
            else appendLine(entries.join("  ") || "(vacío)");
            break;
          }
          case "tree": {
            const path = normalizePath(args[0] || ".");
            if (!directoryHasChildren(path)) appendLine("tree: no existe el directorio: " + path, "error");
            else {
              appendLine(path);
              printTree(path);
            }
            break;
          }
          case "find": {
            const root = normalizePath(args[0] || ".");
            if (!directoryHasChildren(root)) { appendLine("find: no existe el directorio: " + root, "error"); break; }
            const prefix = root === "/" ? "/" : root.replace(/\/$/, "") + "/";
            [...directories].filter(path => path.startsWith(prefix) && path !== root)
              .concat(Object.keys(files).map(path => "/" + path).filter(path => path.startsWith(prefix)))
              .sort((a, b) => a.localeCompare(b))
              .forEach(path => appendLine(path));
            break;
          }
          case "cat": {
            if (!argument) { appendLine("uso: cat <archivo>", "error"); break; }
            args.forEach(name => {
              const path = normalizePath(name);
              if (!Object.prototype.hasOwnProperty.call(files, path.slice(1))) appendLine("cat: no existe el archivo: " + path, "error");
              else files[path.slice(1)].split("\n").forEach(part => appendLine(part));
            });
            break;
          }
          case "head":
          case "tail": {
            if (!args.length) { appendLine("uso: " + command + " [-n líneas] <archivo>", "error"); break; }
            let count = 10;
            let filename = args[0];
            if (args[0] === "-n" && args.length > 2 && /^\d+$/.test(args[1])) {
              count = Math.min(Number(args[1]), 1000);
              filename = args[2];
            }
            const path = normalizePath(filename).slice(1);
            if (!Object.prototype.hasOwnProperty.call(files, path)) appendLine(command + ": no existe el archivo: /" + path, "error");
            else {
              const lines = files[path].split("\n");
              (command === "head" ? lines.slice(0, count) : lines.slice(-count)).forEach(line => appendLine(line));
            }
            break;
          }
          case "grep": {
            const insensitive = args[0] === "-i";
            const pattern = args[insensitive ? 1 : 0];
            const filename = args[insensitive ? 2 : 1];
            if (!pattern || !filename) { appendLine("uso: grep [-i] <texto> <archivo>", "error"); break; }
            const path = normalizePath(filename).slice(1);
            if (!Object.prototype.hasOwnProperty.call(files, path)) appendLine("grep: no existe el archivo: /" + path, "error");
            else {
              const needle = insensitive ? pattern.toLowerCase() : pattern;
              files[path].split("\n").filter(line => (insensitive ? line.toLowerCase() : line).includes(needle)).forEach(line => appendLine(line));
            }
            break;
          }
          case "wc": {
            if (!args.length) { appendLine("uso: wc <archivo>", "error"); break; }
            args.forEach(filename => {
              const path = normalizePath(filename).slice(1);
              if (!Object.prototype.hasOwnProperty.call(files, path)) appendLine("wc: no existe el archivo: /" + path, "error");
              else {
                const contents = files[path];
                const lines = contents ? contents.split("\n").filter((line, index, all) => index < all.length - 1 || line !== "").length : 0;
                const words = contents.trim() ? contents.trim().split(/\s+/).length : 0;
                appendLine(String(lines).padStart(6) + String(words).padStart(7) + String(contents.length).padStart(7) + " " + filename);
              }
            });
            break;
          }
          case "write": {
            const match = input.match(/^write\s+(\S+)\s*([\s\S]*)$/);
            if (!match) { appendLine("uso: write <archivo> <texto>", "error"); break; }
            const path = normalizePath(match[1]).slice(1);
            if (!path) { appendLine("write: indica el nombre de un archivo.", "error"); break; }
            if (!directories.has(fileParent("/" + path))) { appendLine("write: no existe el directorio padre de /" + path, "error"); break; }
            files[path] = match[2] + "\n";
            appendLine("Guardado: " + path, "green");
            break;
          }
          case "mkdir": {
            if (!argument) { appendLine("uso: mkdir <carpeta>", "error"); break; }
            const path = normalizePath(args[0]);
            const parent = path.slice(0, path.lastIndexOf("/")) || "/";
            if (directories.has(path)) appendLine("mkdir: ya existe: " + path, "error");
            else if (!directories.has(parent)) appendLine("mkdir: no existe el directorio padre: " + parent, "error");
            else { directories.add(path); appendLine("Directorio creado: " + path, "green"); }
            break;
          }
          case "cd": {
            const path = normalizePath(args[0] || "/");
            if (!directoryHasChildren(path)) appendLine("cd: no existe el directorio: " + path, "error");
            else currentPath = path;
            break;
          }
          case "cp":
          case "mv": {
            if (args.length !== 2) { appendLine("uso: " + command + " <origen> <destino>", "error"); break; }
            const source = normalizePath(args[0]).slice(1);
            const destination = destinationFilePath(source, normalizePath(args[1]));
            if (!Object.prototype.hasOwnProperty.call(files, source)) { appendLine(command + ": no existe el archivo: /" + source, "error"); break; }
            if (!directories.has(fileParent("/" + destination))) { appendLine(command + ": no existe el directorio de destino: /" + fileParent("/" + destination), "error"); break; }
            if (source === destination) { appendLine(command + ": origen y destino son iguales.", "error"); break; }
            files[destination] = files[source];
            if (command === "mv") delete files[source];
            appendLine((command === "cp" ? "Copiado: " : "Movido: ") + "/" + source + " → /" + destination, "green");
            break;
          }
          case "rm": {
            if (!argument) { appendLine("uso: rm <archivo>", "error"); break; }
            const path = normalizePath(args[0]).slice(1);
            if (!Object.prototype.hasOwnProperty.call(files, path)) appendLine("rm: no existe el archivo: /" + path, "error");
            else { delete files[path]; appendLine("Eliminado: " + path, "green"); }
            break;
          }
          case "rmdir": {
            if (!argument) { appendLine("uso: rmdir <carpeta>", "error"); break; }
            const path = normalizePath(args[0]);
            if (!directories.has(path) || path === "/") appendLine("rmdir: no existe la carpeta o no se puede borrar: " + path, "error");
            else if (directoryHasChildren(path) && childrenOf(path).length) appendLine("rmdir: la carpeta no está vacía: " + path, "error");
            else {
              directories.delete(path);
              appendLine("Carpeta eliminada: " + path, "green");
            }
            break;
          }
          case "clear":
            output.replaceChildren();
            break;
          case "save":
            downloadWorkspace();
            appendLine("Respaldo JSON descargado.", "green");
            break;
          case "touch": {
            if (!argument) { appendLine("uso: touch <archivo>", "error"); break; }
            args.forEach(filename => {
              const path = normalizePath(filename).slice(1);
              if (!path) appendLine("touch: indica el nombre de un archivo.", "error");
              else if (!directories.has(fileParent("/" + path))) appendLine("touch: no existe el directorio padre de /" + path, "error");
              else {
                if (!Object.prototype.hasOwnProperty.call(files, path)) files[path] = "";
                appendLine("Archivo listo: " + path, "green");
              }
            });
            break;
          }
          case "download": {
            if (!argument) { appendLine("uso: download <archivo>", "error"); break; }
            const path = normalizePath(args[0]).slice(1);
            if (!Object.prototype.hasOwnProperty.call(files, path)) {
              appendLine("download: no existe el archivo: /" + path, "error");
              break;
            }
            const url = URL.createObjectURL(new Blob([files[path]], { type: "text/plain;charset=utf-8" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = path.split("/").pop();
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            appendLine("Descarga iniciada: " + path, "green");
            break;
          }
          case "apk":
            appendLine("apk no se ejecuta en el espacio web; abre la VM Alpine y ejecuta apk en su consola.", "error");
            break;
          case "sudo":
            appendLine("Este espacio web no ejecuta comandos del sistema. En Alpine, inicia sesión como root o configura un usuario con doas.", "error");
            break;
          default:
            appendLine(command + ": comando no disponible en el espacio web. Escribe help.", "error");
        }
        saveLocal();
        scroll.scrollTop = scroll.scrollHeight;
      }

      function downloadWorkspace() {
        const data = JSON.stringify({ app: "OpenWeb Linux browser workspace", version: 1, exportedAt: new Date().toISOString(), files, directories: [...directories], currentPath, history: activeTerminal.history.slice(-100), ...saveTerminalSessions() }, null, 2);
        const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "openweb-linux-workspace.json";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }

      function focusPrompt() {
        const old = document.getElementById("command-input");
        if (old) old.remove();
        const session = activeTerminal;
        const line = document.createElement("div");
        line.className = "line prompt-line";
        const user = document.createElement("span");
        user.className = "prompt-user";
        user.textContent = "openweb@browser";
        const path = document.createElement("span");
        path.className = "prompt-path";
        path.textContent = ":" + currentPath;
        const symbol = document.createElement("span");
        symbol.className = "prompt-symbol";
        symbol.textContent = "$";
        const input = document.createElement("input");
        input.id = "command-input";
        input.autocomplete = "off";
        input.autocapitalize = "off";
        input.spellcheck = false;
        input.setAttribute("aria-label", "Comando de terminal");
        input.value = session.draft;
        session.draft = "";
        line.append(user, path, symbol, input);
        output.appendChild(line);
        input.addEventListener("keydown", event => {
          if (event.key === "Enter") {
            const value = input.value;
            session.draft = "";
            line.remove();
            execute(value);
            focusPrompt();
            scroll.scrollTop = scroll.scrollHeight;
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            if (session.historyIndex > 0) input.value = session.history[--session.historyIndex];
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            if (session.historyIndex < session.history.length - 1) input.value = session.history[++session.historyIndex];
            else { session.historyIndex = session.history.length; input.value = ""; }
          }
        });
        input.focus();
      }

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
        } else if (action === "tab") insertKeyboardText(input, "\t");
        else if (action === "enter") input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        else if (action === "up" || action === "down") input.dispatchEvent(new KeyboardEvent("keydown", { key: action === "up" ? "ArrowUp" : "ArrowDown", bubbles: true }));
        else if (action === "left" || action === "right") {
          const position = input.selectionStart === null ? input.value.length : input.selectionStart;
          const next = Math.max(0, Math.min(input.value.length, position + (action === "left" ? -1 : 1)));
          input.setSelectionRange(next, next);
          input.focus();
        } else if (action === "escape") {
          input.value = "";
          input.focus();
        }
      }

      function pressVirtualKey(action, text) {
        if (action === "shift") {
          keyboardShift = !keyboardShift;
          const shiftButton = keyboardPanel.querySelector('[data-key-action="shift"]');
          shiftButton.setAttribute("aria-pressed", String(keyboardShift));
          return;
        }
        const value = text === undefined ? "" : (keyboardShift ? text.toUpperCase() : text);
        keyboardShift = false;
        const shiftButton = keyboardPanel.querySelector('[data-key-action="shift"]');
        shiftButton.setAttribute("aria-pressed", "false");
        if (vmScreenVisible && vmRunning && emulator) {
          const keyCodes = { backspace: 8, tab: 9, enter: 13, escape: 27, left: 37, up: 38, right: 39, down: 40 };
          const operation = action ? emulator.keyboard_send_keys([keyCodes[action]]) : emulator.keyboard_send_text(value);
          operation.catch(error => showToast("No se pudo enviar la tecla a Alpine: " + error.message));
          return;
        }
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

      function openModal(id) {
        if (!document.querySelector(".modal-backdrop.open")) modalReturnFocus = document.activeElement;
        document.querySelectorAll(".modal-backdrop.open").forEach(modal => modal.classList.remove("open"));
        const modal = document.getElementById(id);
        modal.classList.add("open");
        modal.querySelector("[data-close]").focus();
      }

      let modalReturnFocus = null;

      function closeModals() {
        const hadOpenModal = Boolean(document.querySelector(".modal-backdrop.open"));
        document.querySelectorAll(".modal-backdrop.open").forEach(modal => modal.classList.remove("open"));
        if (hadOpenModal && modalReturnFocus instanceof HTMLElement && modalReturnFocus.isConnected) modalReturnFocus.focus();
        modalReturnFocus = null;
      }

      function showVmScreen(visible) {
        vmScreenVisible = visible;
        terminalTabs.hidden = visible;
        output.style.display = visible ? "none" : "";
        document.getElementById("vm-container").style.display = visible ? "flex" : "none";
        if (visible) document.getElementById("vm-screen").focus();
        else {
          const input = output.querySelector("#command-input");
          if (input) input.focus();
        }
      }

      let v86LoadPromise = null;

      function loadV86() {
        if (window.V86) return Promise.resolve();
        if (v86LoadPromise) return v86LoadPromise;
        v86LoadPromise = new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "./public/vendor/v86/libv86.js";
          script.onload = () => {
            if (window.V86) resolve();
            else {
              script.remove();
              v86LoadPromise = null;
              reject(new Error("El archivo de v86 no expuso su constructor."));
            }
          };
          script.onerror = () => {
            script.remove();
            v86LoadPromise = null;
            reject(new Error("No se pudo cargar v86. Abre el sitio mediante HTTPS o localhost."));
          };
          document.head.appendChild(script);
        });
        return v86LoadPromise;
      }

      let installerPreloadPromise = null;

      function preloadInstaller() {
        if (installerPreloadPromise) return installerPreloadPromise;
        installerPreloadPromise = Promise.all([
          loadV86(),
          import("./v86-config.js"),
          fetch("./public/vendor/v86/v86.wasm", { cache: "force-cache" }).then(response => {
            if (!response.ok) throw new Error("No se pudo precargar el motor WebAssembly de v86.");
            return response.arrayBuffer().then(() => undefined);
          }),
        ])
          .catch(error => {
            installerPreloadPromise = null;
            console.warn("No se pudo preparar el emulador en segundo plano; se intentará al arrancar.", error);
          });
        return installerPreloadPromise;
      }

      async function bootVM(state) {
        if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
          throw new Error("v86 necesita HTTPS. Publica el sitio en GitHub Pages o sírvelo desde localhost.");
        }
        if (installerPreloadPromise) await installerPreloadPromise;
        await loadV86();
        const { createV86Config } = await import("./v86-config.js");
        const config = createV86Config(document.getElementById("vm-screen"));
        config.autostart = !state;
        emulator = new window.V86(config);
        emulator.add_listener("download-progress", progress => {
          if (progress.lengthComputable && progress.total > 0) {
            const percent = Math.round(progress.loaded / progress.total * 100);
            storageStatus.textContent = "Cargando " + progress.file_name + " · " + percent + "%";
          } else {
            storageStatus.textContent = "Cargando " + progress.file_name;
          }
        });
        emulator.add_listener("download-error", error => {
          showToast("No se pudo cargar " + error.file_name + ". Revisa la conexión y vuelve a intentarlo.");
        });
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("v86 tardó demasiado en cargar el emulador y la ISO.")), 180000);
          emulator.add_listener("emulator-ready", () => {
            clearTimeout(timeout);
            resolve();
          });
        });
        if (state) {
          await emulator.restore_state(state);
          emulator.run();
        }
        vmRunning = true;
        showVmScreen(true);
        document.getElementById("boot-button").querySelector(".button-label").textContent = "Pausar Alpine";
        document.getElementById("boot-button").title = "Pausar la máquina virtual";
        document.getElementById("storage-status").textContent = "Alpine iniciado · red mediante relay público";
        document.querySelector(".session-status").lastChild.textContent = "Alpine Linux";
      }

      async function restoreVMState(state) {
        if (!emulator) {
          await bootVM(state);
          return;
        }
        emulator.stop();
        vmRunning = false;
        await emulator.restore_state(state);
        emulator.run();
        vmRunning = true;
        showVmScreen(true);
        document.getElementById("boot-button").querySelector(".button-label").textContent = "Pausar Alpine";
        document.getElementById("boot-button").title = "Pausar la máquina virtual";
        storageStatus.textContent = "Máquina virtual restaurada";
      }

      async function saveVMState() {
        if (!emulator) {
          downloadWorkspace();
          saveLocal();
          showToast("Espacio de trabajo descargado. Se guarda automáticamente en este navegador.");
          return;
        }
        try {
          storageStatus.textContent = "Creando respaldo de v86…";
          const state = await emulator.save_state();
          const url = URL.createObjectURL(new Blob([state], { type: "application/octet-stream" }));
          const link = document.createElement("a");
          link.href = url;
          link.download = "openweb-linux-v86-state.bin";
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          storageStatus.textContent = "Estado de v86 guardado en archivo";
          showToast("Respaldo de la máquina descargado. Puede ocupar varios GiB.");
        } catch (error) {
          storageStatus.textContent = "Falló el respaldo de v86";
          showToast("No se pudo guardar la máquina: " + error.message);
        }
      }

      async function saveLocalVM() {
        if (!emulator) throw new Error("Arranca Alpine antes de guardar el estado de la máquina virtual.");
        storageStatus.textContent = "Creando copia local de v86…";
        const state = await emulator.save_state();
        await saveLocalVMState(state);
        storageStatus.textContent = "VM guardada en este navegador";
        await updateLocalVMRestoreButton();
        showToast("VM guardada localmente. Esta copia solo está disponible en este navegador.");
      }

      async function restoreLocalVM() {
        const state = await loadLocalVMState();
        if (!state) {
          await updateLocalVMRestoreButton();
          throw new Error("No hay una copia local guardada. Usa Guardar para conservar la VM primero.");
        }
        storageStatus.textContent = "Restaurando la VM guardada en este navegador…";
        await restoreVMState(state);
        showToast("VM restaurada desde el almacenamiento local del navegador.");
      }

      function openSaveOptions() {
        const hasVM = Boolean(emulator);
        document.getElementById("save-local-vm").hidden = !hasVM;
        document.getElementById("download-vm-state").hidden = !hasVM;
        document.getElementById("download-workspace").hidden = hasVM;
        openModal("save-modal");
      }

      let bootingAlpine = false;

      function setSessionStatus(text) {
        const status = document.querySelector(".session-status");
        if (status && status.lastChild) status.lastChild.textContent = text;
      }

      async function startAlpine() {
        const button = document.getElementById("boot-button");
        if (bootingAlpine || emulator || !button) return;
        bootingAlpine = true;
        try {
          button.disabled = true;
          button.querySelector(".button-label").textContent = "Arrancando Alpine";
          button.title = "Arrancando la máquina virtual";
          storageStatus.textContent = "Iniciando v86 y cargando Alpine Linux…";
          setSessionStatus("Arrancando Alpine");
          appendLine("Arrancando Alpine Linux (v86)…", "green");
          appendLine("Cargando BIOS e ISO Alpine virt (~49 MiB); el progreso aparece en la barra inferior.", "muted");
          scroll.scrollTop = scroll.scrollHeight;
          try {
            preloadInstaller();
          } catch (preloadError) {
            console.warn("No se pudo precargar v86; se cargará durante el arranque.", preloadError);
          }
          await bootVM();
        } catch (error) {
          if (emulator) emulator.stop();
          emulator = null;
          vmRunning = false;
          storageStatus.textContent = "No se pudo iniciar Alpine";
          setSessionStatus("Espacio del navegador");
          appendLine("No se pudo iniciar Alpine: " + error.message, "error");
          appendLine("El espacio web sigue disponible; pulsa Arrancar Alpine para reintentar.", "muted");
          showToast("No se pudo iniciar v86: " + error.message);
          const label = button.querySelector(".button-label");
          if (label) label.textContent = "Arrancar Alpine";
          button.title = "Arrancar Alpine Linux";
        } finally {
          bootingAlpine = false;
          button.disabled = false;
        }
      }

      document.getElementById("boot-button").addEventListener("click", async () => {
        const button = document.getElementById("boot-button");
        if (bootingAlpine) return;
        if (emulator) {
          if (vmRunning) {
            emulator.stop();
            vmRunning = false;
            showVmScreen(false);
            button.querySelector(".button-label").textContent = "Reanudar Alpine";
            button.title = "Reanudar la máquina virtual";
            storageStatus.textContent = "Alpine pausado en memoria";
            setSessionStatus("Alpine en pausa");
          } else {
            emulator.run();
            vmRunning = true;
            showVmScreen(true);
            button.querySelector(".button-label").textContent = "Pausar Alpine";
            button.title = "Pausar la máquina virtual";
            storageStatus.textContent = "Alpine iniciado · red mediante relay público";
            setSessionStatus("Alpine Linux");
          }
          return;
        }
        await startAlpine();
      });
      document.getElementById("boot-button").addEventListener("pointerenter", preloadInstaller, { once: true });
      document.getElementById("boot-button").addEventListener("focus", preloadInstaller, { once: true });
      document.getElementById("new-terminal-tab").addEventListener("click", addTerminalSession);
      document.getElementById("close-terminal-tab").addEventListener("click", closeActiveTerminalSession);
      document.getElementById("save-button").addEventListener("click", openSaveOptions);
      document.getElementById("restore-button").addEventListener("click", () => {
        updateLocalVMRestoreButton().catch(error => showToast("No se pudo consultar el respaldo local: " + error.message));
        openModal("restore-modal");
      });
      document.getElementById("save-local-vm").addEventListener("click", async () => {
        const button = document.getElementById("save-local-vm");
        button.disabled = true;
        try {
          await saveLocalVM();
          closeModals();
        } catch (error) {
          showToast("No se pudo guardar la VM en este navegador: " + error.message);
          storageStatus.textContent = "Falló el guardado local de la VM";
        } finally {
          button.disabled = false;
        }
      });
      document.getElementById("download-vm-state").addEventListener("click", () => {
        closeModals();
        saveVMState();
      });
      document.getElementById("download-workspace").addEventListener("click", () => {
        closeModals();
        downloadWorkspace();
        saveLocal();
        showToast("Espacio de trabajo descargado. También se guarda en este navegador.");
      });
      document.getElementById("restore-local-vm").addEventListener("click", async () => {
        const button = document.getElementById("restore-local-vm");
        button.disabled = true;
        try {
          closeModals();
          await restoreLocalVM();
        } catch (error) {
          showToast("No se pudo restaurar la VM local: " + error.message);
          storageStatus.textContent = "Falló la restauración local";
        } finally {
          button.disabled = false;
        }
      });
      document.getElementById("open-backup-file").addEventListener("click", () => {
        closeModals();
        restoreInput.click();
      });
      document.getElementById("setup-button").addEventListener("click", () => openModal("setup-modal"));
      document.getElementById("apk-button").addEventListener("click", () => openModal("apk-modal"));
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
          showToast("Abre este sitio por HTTPS para copiar comandos apk.");
          return;
        }
        navigator.clipboard.writeText(button.dataset.command)
          .then(() => showToast("Comando copiado. Pégalo en la consola Alpine de la máquina virtual."))
          .catch(error => showToast("No se pudo copiar el comando: " + error.message));
      }));
      restoreInput.addEventListener("change", async () => {
        const file = restoreInput.files && restoreInput.files[0];
        if (!file) return;
        try {
          if (file.name.toLowerCase().endsWith(".bin")) {
            const state = await file.arrayBuffer();
            await restoreVMState(state);
            showToast("Estado de v86 restaurado.");
            return;
          }
          const data = JSON.parse(await file.text());
          if (!data || data.version !== 1 || !data.files || typeof data.files !== "object" || Array.isArray(data.files)) throw new Error("Formato de respaldo no compatible.");
          for (const [name, contents] of Object.entries(data.files)) {
            if (typeof name !== "string" || !name || typeof contents !== "string" || name.startsWith("/") || name.split("/").includes("..")) throw new Error("El respaldo contiene una ruta o archivo no válido.");
          }
          for (const name of Object.keys(files)) delete files[name];
          Object.assign(files, data.files);
          directories.clear();
          directories.add("/");
          if (Array.isArray(data.directories)) data.directories.forEach(name => {
            if (typeof name === "string" && name.startsWith("/") && !name.split("/").includes("..")) directories.add(normalizePath(name));
          });
          if (!restoreTerminalSessions(data.terminalTabs, data.activeTerminal) && Array.isArray(data.history)) {
            activeTerminal.history = data.history.filter(item => typeof item === "string").slice(-100);
            activeTerminal.historyIndex = activeTerminal.history.length;
          }
          currentPath = typeof data.currentPath === "string" && data.currentPath.startsWith("/") ? normalizePath(data.currentPath) : "/";
          output.replaceChildren();
          appendLine("Espacio de trabajo restaurado desde " + file.name, "green");
          appendLine("Archivos recuperados: " + Object.keys(files).length, "muted");
          saveLocal();
          focusPrompt();
          showToast("Respaldo restaurado y guardado en este navegador.");
        } catch (error) {
          showToast("No se pudo restaurar el respaldo: " + error.message);
        } finally {
          restoreInput.value = "";
        }
      });

      makeTerminalSession("Terminal 1", output);
      activeTerminal = terminalSessions[0];
      nextTerminalNumber = 2;
      renderTerminalTabs();

      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        if (saved && saved.version === 1 && saved.files && typeof saved.files === "object" && !Array.isArray(saved.files)) {
          Object.entries(saved.files).forEach(([name, contents]) => {
            if (name && typeof contents === "string" && !name.startsWith("/") && !name.split("/").includes("..")) files[name] = contents;
          });
          if (Array.isArray(saved.directories)) saved.directories.forEach(name => {
            if (typeof name === "string" && name.startsWith("/") && !name.split("/").includes("..")) directories.add(normalizePath(name));
          });
          if (!restoreTerminalSessions(saved.terminalTabs, saved.activeTerminal) && Array.isArray(saved.history)) {
            activeTerminal.history = saved.history.filter(item => typeof item === "string").slice(-100);
            activeTerminal.historyIndex = activeTerminal.history.length;
          }
          if (typeof saved.currentPath === "string" && saved.currentPath.startsWith("/")) currentPath = normalizePath(saved.currentPath);
          appendLine("Espacio de trabajo local restaurado.", "green");
        } else {
          appendLine("OpenWeb Linux · Terminal de espacio web", "green");
          appendLine("Tus archivos y respaldos se guardan en este navegador.", "muted");
        }
      } catch (error) {
        appendLine("No se pudo leer el guardado local: " + error.message, "error");
      }
      try {
        localStorage.removeItem("openweb-supabase-config-v1");
        localStorage.removeItem("sb-zdmeoisddxqknbvmslpn-auth-token");
        localStorage.removeItem("sb-zdmeoisddxqknbvmslpn-auth-token-code-verifier");
      } catch (error) {
        appendLine("No se pudo limpiar la sesión antigua de cuentas: " + error.message, "error");
      }
      updateLocalVMRestoreButton().catch(error => {
        appendLine("No se pudo consultar el almacenamiento local de VM: " + error.message, "error");
      });
      appendLine("OpenWeb Linux · el espacio de inicio es un shell de Alpine Linux", "green");
      appendLine("Alpine arranca automáticamente en la VM; escribe help para ver los comandos del espacio web.", "muted");
      focusPrompt();
      setTimeout(startAlpine, 250);
    })();

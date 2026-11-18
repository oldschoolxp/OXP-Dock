// Verbindung zum PowerShell-Systemhelfer (app/helfer/systemhelfer.ps1).
// Startet ihn bei Bedarf, schickt Befehle als JSON-Zeilen und startet ihn neu, falls er abstürzt.
import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";

export function createSystemhelfer(appDir) {
  // Im Installer liegt der Helfer entpackt neben dem app.asar (PowerShell kann nicht in asar lesen).
  const script = path.join(appDir.replace(/app\.asar(?=[\\/]|$)/, "app.asar.unpacked"), "helfer", "systemhelfer.ps1");
  let proc = null;
  let ready = null;
  let nextId = 1;
  const pending = new Map();
  let stopped = false;

  function start() {
    proc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    proc.stdin.setDefaultEncoding("utf8");
    let resolveReady;
    ready = new Promise((r) => (resolveReady = r));
    const rl = readline.createInterface({ input: proc.stdout });
    rl.on("line", (line) => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg.ready) return resolveReady(true);
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error || "Fehler im Systemhelfer"));
    });
    proc.stderr.on("data", (d) => console.error("Systemhelfer:", String(d).trim().slice(0, 300)));
    proc.on("exit", () => {
      for (const p of pending.values()) p.reject(new Error("Systemhelfer beendet"));
      pending.clear();
      proc = null;
      if (!stopped) setTimeout(() => !proc && !stopped && start(), 3000);
    });
  }

  async function call(cmd, args = {}, timeoutMs = 15000) {
    if (stopped) throw new Error("beendet");
    if (!proc) start();
    await ready;
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Zeitüberschreitung bei ${cmd}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      proc.stdin.write(JSON.stringify({ id, cmd, args }) + "\n");
    });
  }

  function stop() {
    stopped = true;
    try {
      proc?.stdin.end();
      proc?.kill();
    } catch {}
  }

  return { call, stop };
}

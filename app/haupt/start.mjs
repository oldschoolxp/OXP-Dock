// Eigenes OXP-Startmenü: angeheftete Apps, zuletzt verwendet, Reiter „Alle Apps“ (A–Z wie früher), Suche, Ein/Aus.
// Die App-Liste kommt aus derselben Quelle wie die Dock-Suche (alle Startmenü-Apps von Windows, auch Store-Apps).
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";

// Beim allerersten Öffnen vorbelegt (sofern installiert), dazu alles, was schon am Dock hängt
const STANDARD = [
  "Datei-Explorer", "Einstellungen", "Microsoft Edge", "Google Chrome", "Firefox", "Microsoft Store", "Rechner", "Fotos",
  "Editor", "Snipping Tool", "Paint", "Uhr", "Discord", "Steam", "OBS Studio", "Spotify",
];

export default function register(ctx, h) {
  const { shell, systemhelfer: sh } = h;
  const appStart = (appId) => "shell:AppsFolder\\" + appId;
  const starte = (appId) => spawn("explorer.exe", [appStart(appId)], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  const cfg = () => h.config();
  const ordner = { dokumente: "Documents", downloads: "Downloads", bilder: "Pictures", musik: "Music", videos: "Videos", persoenlich: "" };

  ctx.popup("start", async () => {
    let apps = [];
    try {
      apps = (await h.popupData("suche", {}))?.apps || [];
    } catch {}
    const c = cfg();
    if (!Array.isArray(c.startPins) && apps.length) {
      const namen = new Set([...STANDARD, ...(h.pins() || []).map((p) => p.name || "")].map((n) => n.toLowerCase()));
      const reihenfolge = (a) => {
        const i = STANDARD.findIndex((n) => n.toLowerCase() === a.name.toLowerCase());
        return i === -1 ? 99 : i;
      };
      c.startPins = apps
        .filter((a) => namen.has(a.name.toLowerCase()))
        .sort((a, b) => reihenfolge(a) - reihenfolge(b))
        .slice(0, 18)
        .map((a) => a.appId);
      h.saveConfig();
    }
    const einstellungen = c.startMenu || {};
    // zuletzt geöffnete Dateien (Windows-Liste „Zuletzt verwendet“), nur wenn gewünscht
    let dateien = [];
    if (einstellungen.dateien !== false) {
      try {
        dateien = ((await h.popupData("recent", {}))?.files || []).slice(0, 10);
      } catch {}
    }
    return { apps, pins: c.startPins || [], recent: c.startRecent || [], dateien, benutzer: os.userInfo().username, einstellungen };
  });

  async function exeVon(appId) {
    try {
      const r = await sh.call("resolveAppId", { appId });
      return typeof r === "string" ? r : "";
    } catch {
      return "";
    }
  }

  ctx.action("start", async (a, v) => {
    const c = cfg();
    if (a === "icons" && Array.isArray(v)) {
      const out = {};
      for (const id of v.slice(0, 40)) if (typeof id === "string") out[id] = await h.iconFor(appStart(id));
      return out;
    }
    if (a === "launch" && typeof v === "string") {
      starte(v);
      c.startRecent = [v, ...(c.startRecent || []).filter((x) => x !== v)].slice(0, 6);
      h.saveConfig();
      return;
    }
    if (a === "pin-start" && typeof v === "string") {
      c.startPins = [...(c.startPins || []).filter((x) => x !== v), v];
      h.saveConfig();
      return c.startPins;
    }
    if (a === "unpin-start" && typeof v === "string") {
      c.startPins = (c.startPins || []).filter((x) => x !== v);
      h.saveConfig();
      return c.startPins;
    }
    if (a === "move-start" && v && typeof v.id === "string") {
      // angeheftete App an eine andere Stelle schieben (nach vorne/hinten)
      const liste = (c.startPins || []).filter((x) => x !== v.id);
      liste.splice(Math.max(0, Math.min(liste.length, Number(v.to) || 0)), 0, v.id);
      c.startPins = liste;
      h.saveConfig();
      return c.startPins;
    }
    if (a === "forget-recent" && typeof v === "string") {
      c.startRecent = (c.startRecent || []).filter((x) => x !== v);
      h.saveConfig();
      return c.startRecent;
    }
    if (a === "pin-dock" && v?.appId) return h.pinApp(v.appId, v.name);
    if (a === "admin" && typeof v === "string") {
      const exe = (await exeVon(v)) || appStart(v);
      execFile("powershell.exe", ["-NoProfile", "-Command", `Start-Process -FilePath '${String(exe).replace(/'/g, "''")}' -Verb RunAs`], { windowsHide: true });
      return;
    }
    if (a === "folder" && typeof v === "string") {
      const exe = await exeVon(v);
      if (exe && path.isAbsolute(exe)) shell.showItemInFolder(exe);
      else spawn("explorer.exe", ["shell:AppsFolder"], { detached: true, stdio: "ignore" }).unref();
      return;
    }
    if (a === "uninstall") return shell.openExternal("ms-settings:appsfeatures");
    if (a === "ordner" && v in ordner) return shell.openPath(path.join(os.homedir(), ordner[v]));
    if (a === "ordner" && v === "netzwerk") return spawn("explorer.exe", ["shell:NetworkPlacesFolder"], { detached: true, stdio: "ignore" }).unref();
    // empfohlene Dateien: nur Pfade aus der Windows-Liste „Zuletzt verwendet“ öffnen
    if ((a === "datei" || a === "datei-ordner") && typeof v === "string") {
      const bekannt = ((await h.popupData("recent", {}))?.files || []).some((f) => f.file === v);
      if (!bekannt) return;
      return a === "datei" ? shell.openPath(v) : shell.showItemInFolder(v);
    }
    if (a === "explorer") return shell.openPath(path.join(process.env.SystemRoot || "C:\\Windows", "explorer.exe"));
    if (a === "einstellungen") return shell.openExternal("ms-settings:");
    if (a === "konto") return shell.openExternal("ms-settings:yourinfo");
    if (a === "dock-einstellungen") return h.openSettings();
    if (a === "windows-start") return h.win.openStartMenu() || h.win.pressKeys([h.win.VK.WIN]);
    if (a === "web" && typeof v === "string" && v.trim()) return shell.openExternal("https://www.google.com/search?q=" + encodeURIComponent(v.trim()));
    if (a === "power") {
      if (v === "lock") return h.win.lock();
      if (v === "signout") return execFile("shutdown.exe", ["/l"], { windowsHide: true });
      if (v === "sleep")
        return execFile("powershell.exe", ["-NoProfile", "-Command", "Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)"], { windowsHide: true });
      if (v === "restart") return execFile("shutdown.exe", ["/r", "/t", "0"], { windowsHide: true });
      if (v === "shutdown") return execFile("shutdown.exe", ["/s", "/hybrid", "/t", "0"], { windowsHide: true });
    }
  });
}

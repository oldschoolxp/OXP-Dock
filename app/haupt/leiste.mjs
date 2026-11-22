// Feste Teile der Leiste: Suche (Lupe) und Hintergrund-Programme („^“-Pfeil wie im Infobereich).
import fs from "node:fs";
import path from "node:path";
import { execFile, spawn } from "node:child_process";

/**
 * Was beim Klick auf ein Hintergrundprogramm gestartet wird. Oft läuft im Hintergrund nur ein Helfer, der sich
 * wie die App nennt: „NVIDIA App“ ist dort „NVIDIA App\CEF\NVIDIA Overlay.exe“ – den nochmal zu starten öffnet nichts.
 * Deshalb zuerst „<Anzeigename>.exe“ im selben oder bis zu 3 Ordnern darüber suchen (→ „NVIDIA App\CEF\NVIDIA App.exe“,
 * dasselbe Ziel wie die Startmenü-Verknüpfung).
 * nvcontainer.exe (das NVIDIA-Symbol im Infobereich) öffnet ebenfalls die NVIDIA App.
 */
export function startZiel(app) {
  const name = String(app.name || "").replace(/[<>:"/\\|?*]/g, "").trim();
  if (name) {
    let dir = path.dirname(app.path);
    for (let i = 0; i < 4; i++) {
      const kandidat = path.join(dir, name + ".exe");
      if (kandidat.toLowerCase() !== app.path.toLowerCase() && fs.existsSync(kandidat)) return kandidat;
      const hoch = path.dirname(dir);
      if (hoch === dir) break;
      dir = hoch;
    }
  }
  if (/\\nvcontainer\.exe$/i.test(app.path)) {
    const nvidia = path.join(process.env.ProgramFiles || "C:\\Program Files", "NVIDIA Corporation", "NVIDIA App", "CEF", "NVIDIA App.exe");
    if (fs.existsSync(nvidia)) return nvidia;
  }
  return app.path;
}

const spawnStart = (ziel) => spawn("explorer.exe", [ziel], { detached: true, stdio: "ignore", windowsHide: true }).unref();

// Häufige Windows-Einstellungen für die Suche
const EINSTELLUNGEN = [
  ["Bluetooth & Geräte", "ms-settings:bluetooth", "bluetooth geräte maus tastatur kopfhörer"],
  ["WLAN", "ms-settings:network-wifi", "wlan wifi internet netzwerk"],
  ["Netzwerk & Internet", "ms-settings:network", "netzwerk internet ethernet vpn"],
  ["Bildschirm", "ms-settings:display", "bildschirm anzeige monitor auflösung skalierung helligkeit"],
  ["Sound", "ms-settings:sound", "sound ton lautstärke lautsprecher mikrofon audio"],
  ["Hintergrund", "ms-settings:personalization-background", "hintergrund hintergrundbild wallpaper"],
  ["Farben & dunkler Modus", "ms-settings:colors", "farben dunkel hell modus design"],
  ["Taskleiste", "ms-settings:taskbar", "taskleiste"],
  ["Apps & Features", "ms-settings:appsfeatures", "apps programme deinstallieren entfernen"],
  ["Autostart-Apps", "ms-settings:startupapps", "autostart start"],
  ["Standard-Apps", "ms-settings:defaultapps", "standard apps browser"],
  ["Windows Update", "ms-settings:windowsupdate", "update aktualisieren"],
  ["Energie & Akku", "ms-settings:powersleep", "energie akku strom ruhezustand"],
  ["Speicher", "ms-settings:storagesense", "speicher festplatte platz"],
  ["Drucker & Scanner", "ms-settings:printers", "drucker scanner"],
  ["Datum & Uhrzeit", "ms-settings:dateandtime", "datum uhrzeit zeit"],
  ["Sprache & Region", "ms-settings:regionlanguage", "sprache tastatur region"],
  ["Benachrichtigungen", "ms-settings:notifications", "benachrichtigungen nicht stören"],
  ["Datenschutz", "ms-settings:privacy", "datenschutz kamera mikrofon"],
  ["Konten", "ms-settings:yourinfo", "konto anmelden"],
  ["Systemsteuerung", "control", "systemsteuerung"],
  ["Task-Manager", "taskmgr", "task manager prozesse"],
];

export default function register(ctx, h) {
  const { shell, systemhelfer: sh } = h;

  // ---------- Suche (wie die Windows-Suche) ----------
  // Apps: komplette Startmenü-Liste von Windows (auch Store-Apps wie Snipping Tool, Rechner, Fotos).
  // Dateien/Ordner: Windows-Suchindex. Dazu Einstellungen und Websuche.
  const appStart = (appId) => "shell:AppsFolder\\" + appId;
  let appsCache = null;
  async function alleApps() {
    if (appsCache && Date.now() - appsCache.at < 5 * 60_000) return appsCache.list;
    const list = ((await sh.call("startApps", {}, 30_000)) || []).filter((x) => x?.name && x?.appId && !/^[A-Z]:\\$/i.test(x.appId));
    appsCache = { at: Date.now(), list };
    return list;
  }
  // Liste schon vorbereiten, damit die Suche sofort Treffer hat
  setTimeout(() => alleApps().catch(() => {}), 15_000);

  ctx.popup("suche", async () => {
    let apps = [];
    try {
      apps = await alleApps();
    } catch {}
    return { apps, settings: EINSTELLUNGEN.map(([name, ziel, worte]) => ({ name, ziel, worte })) };
  });
  ctx.action("suche", async (a, v) => {
    if (a === "icons" && Array.isArray(v)) {
      // Symbole für sichtbare Treffer nachladen (Apps über ihre App-Kennung, Dateien über den Pfad)
      const out = {};
      for (const k of v.slice(0, 30)) {
        if (typeof k !== "string") continue;
        out[k] = await h.iconFor(k.startsWith("app:") ? appStart(k.slice(4)) : k);
      }
      return out;
    }
    if (a === "files" && typeof v === "string") {
      try {
        return await sh.call("searchFiles", { q: v, max: 12 }, 15_000);
      } catch {
        return [];
      }
    }
    if (a === "app" && typeof v === "string") spawnStart(appStart(v));
    if (a === "app-admin" && typeof v === "string") {
      let exe = v;
      try {
        exe = (await sh.call("resolveAppId", { appId: v })) || v;
      } catch {}
      execFile("powershell.exe", ["-NoProfile", "-Command", `Start-Process -FilePath '${String(exe).replace(/'/g, "''")}' -Verb RunAs`], { windowsHide: true });
    }
    if (a === "app-pin" && v?.appId) await h.pinApp(v.appId, v.name);
    if (a === "file" && typeof v === "string") shell.openPath(v);
    if (a === "file-folder" && typeof v === "string") shell.showItemInFolder(v);
    if (a === "setting" && typeof v === "string") {
      if (v.startsWith("ms-settings:")) shell.openExternal(v);
      else if (v === "control") execFile("control.exe", { windowsHide: false });
      else if (v === "taskmgr") shell.openPath(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "Taskmgr.exe"));
    }
    if (a === "web" && typeof v === "string" && v.trim()) shell.openExternal("https://www.google.com/search?q=" + encodeURIComponent(v.trim()));
    if (a === "dateien" && typeof v === "string" && v.trim()) shell.openExternal("search-ms:query=" + encodeURIComponent(v.trim()) + "&crumb=location:" + encodeURIComponent(process.env.USERPROFILE || "C:\\"));
    if (a === "windows") h.win.pressKeys([h.win.VK.WIN]);
  });

  // ---------- Hintergrund-Programme ----------
  // Genau wie der Infobereich der Windows-Taskleiste: nur laufende Programme mit eigenem Infobereich-Symbol
  // (siehe Systemhelfer „backgroundApps“). Dienste und Hilfsprozesse ohne Symbol erscheinen nicht mehr.
  // Windows-eigene Symbole öffnen dasselbe wie in der Windows-Taskleiste, dazu lesbare Namen.
  const SYSTEM_SYMBOLE = {
    "securityhealthsystray.exe": { name: "Windows-Sicherheit", ziel: "windowsdefender:" },
    "monotificationux.exe": { name: "Windows Update", ziel: "ms-settings:windowsupdate" },
  };
  const NAMEN = { "nvcontainer.exe": "NVIDIA", "razerappengine.exe": "Razer Synapse" };
  const schoenerName = (a) => {
    const exe = path.basename(a.path).toLowerCase();
    const n = SYSTEM_SYMBOLE[exe]?.name || NAMEN[exe] || a.name;
    return n.replace(/\s+v?\d+(?:\.\d+){1,}\S*$/i, "").trim(); // „MSI Afterburner v4.6.6.16757“ → „MSI Afterburner“
  };
  async function hintergrund() {
    const { apps } = await sh.call("backgroundApps", { ownPath: process.execPath }, 20_000);
    return apps
      .filter((a) => a.tray)
      // nvcontainer gehört zum NVIDIA-Treiber – nicht über „Beenden“ abschießen
      .map((a) => ({ ...a, name: schoenerName(a), canQuit: a.canQuit && !/\\nvcontainer\.exe$/i.test(a.path) }))
      .sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true }) || a.path.localeCompare(b.path, "de"));
  }

  ctx.popup("tray", async ({ laden }) => {
    if (!laden) return { loading: true };
    try {
      const apps = await hintergrund();
      return { apps: await Promise.all(apps.map(async (a) => ({
        name: a.name,
        path: a.path,
        canQuit: a.canQuit,
        icon: await h.iconFor(a.path),
      }))) };
    } catch (e) {
      console.error("Hintergrundprogramme:", e.message);
      return { error: "Die Programme konnten nicht geladen werden." };
    }
  });

  ctx.action("tray", async (a, v) => {
    if (!["open", "quit", "folder", "pin"].includes(a)) return;
    try {
      const app = (await hintergrund()).find((x) => x.path === v);
      if (!app) return { error: "Das Programm läuft nicht mehr.", refresh: true };
      if (a === "folder") {
        shell.showItemInFolder(startZiel(app));
        return { ok: true };
      }
      if (a === "pin") {
        if (app.appId) await h.pinApp(app.appId, app.name);
        else h.pinFile(startZiel(app));
        return { ok: true };
      }
      if (a === "open") {
        // Windows-Symbole (Sicherheit, Update): dieselbe Seite wie beim Klick in der Windows-Taskleiste
        const system = SYSTEM_SYMBOLE[path.basename(app.path).toLowerCase()];
        if (system?.ziel) {
          shell.openExternal(system.ziel);
          return { ok: true };
        }
        // Store-Apps (WhatsApp, Smartphone-Link, Claude …) lassen sich nur über ihre App-Kennung starten –
        // die .exe im WindowsApps-Ordner direkt aufzurufen wird von Windows verweigert
        if (app.appId) {
          const offen = h.windows().find((w) => app.pids.includes(w.pid));
          if (offen) h.win.activate(offen.hwnd);
          else spawnStart("shell:AppsFolder\\" + app.appId);
          return { ok: true };
        }
        const ziel = startZiel(app);
        const zielName = path.basename(ziel).toLowerCase();
        // offenes Fenster des Programms (oder des eigentlichen Hauptprogramms) nach vorn holen, sonst starten
        const fenster = h.windows().find((w) => app.pids.includes(w.pid) || path.basename(w.exe || "").toLowerCase() === zielName);
        if (fenster) h.win.activate(fenster.hwnd);
        else if (await shell.openPath(ziel)) {
          // Ersatz: über den Explorer starten (klappt auch bei Programmen, die openPath ablehnt)
          spawnStart(ziel);
        }
        return { ok: true };
      }
      if (!app.canQuit) return { error: "Dieses Programm kann hier nicht beendet werden." };
      const beendet = await sh.call("quitBackgroundApp", { path: app.path, pids: app.pids });
      return beendet ? { refresh: true } : { error: "Das Programm konnte nicht beendet werden." };
    } catch (e) {
      console.error("Hintergrundprogramm:", e.message);
      return { error: "Die Aktion konnte nicht ausgeführt werden." };
    }
  });
}

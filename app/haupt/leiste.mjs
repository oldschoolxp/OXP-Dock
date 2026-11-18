// Feste Teile der Leiste: Suche (Lupe) und Hintergrund-Programme („^“-Pfeil wie im Infobereich).
import path from "node:path";
import { execFile, spawn } from "node:child_process";

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
  // Windows-/Entwickler-Innereien, die man nicht „öffnen“ will
  const RAUS = /[\\/]nodejs[\\/]|node(_repl)?\.exe$|toast|feedprovider|packagemanager|ai host|addin|[\\/]claude-data[\\/]|[\\/]resources[\\/]|msedge\.exe$|searchhost|storedesktopextension|widgets|phoneexperience|yourphone|gamebar|lockapp|textinput|runtimebroker/i;
  const NEBEN = /crash|helper|host|updater|update|service|broker|renderer|native|daemon|agent|watchdog|launcher|setup|install|elevat|handler|reporter|monitor\.exe$|notifier|webview|cef|gpu|utility/i;
  async function hintergrund() {
    const fenster = h.windows();
    const pids = fenster.map((w) => w.pid);
    const ordnerMitFenster = [...new Set(fenster.map((w) => path.dirname(w.exe || "").toLowerCase()).filter(Boolean))];
    let liste = [];
    try {
      liste = await sh.call("backgroundApps", { visiblePids: pids }, 30_000);
    } catch {
      return [];
    }
    // Programme, die schon ein Fenster haben (oder zu so einem gehören), und Hilfsprozesse weglassen
    const out = [];
    for (const p of liste || []) {
      if (p.hasWindow) continue;
      const datei = path.basename(p.path);
      if (NEBEN.test(datei) || RAUS.test(p.path) || RAUS.test(p.name)) continue;
      const pl = p.path.toLowerCase();
      if (ordnerMitFenster.some((o) => pl.startsWith(o + "\\"))) continue;
      // pro Programmordner nur einen Eintrag (z. B. IGCC und IGCCTray)
      const name = String(p.name).replace(/.root$/i, "").replace(/tray$/i, "").trim() || p.name;
      if (out.some((x) => x.name.toLowerCase() === name.toLowerCase() || path.dirname(x.path).toLowerCase() === path.dirname(pl))) continue;
      out.push({ name, path: p.path, count: p.count, icon: await h.iconFor(p.path) });
    }
    return out;
  }
  ctx.popup("tray", async () => ({ apps: await hintergrund() }));
  ctx.action("tray", async (a, v) => {
    const liste = await hintergrund();
    const app = liste.find((x) => x.path === v);
    if (!app && a !== "settings") return;
    if (a === "open") {
      // die meisten Programme im Infobereich zeigen ihr Fenster wieder, wenn man sie erneut startet
      shell.openPath(app.path);
    }
    if (a === "quit") {
      const r = await h.dialog.showMessageBox(h.dock(), {
        type: "warning",
        buttons: ["Beenden", "Abbrechen"],
        defaultId: 1,
        cancelId: 1,
        title: "Programm beenden",
        message: `„${app.name}“ beenden?`,
      });
      if (r.response === 0) await new Promise((res) => execFile("taskkill", ["/IM", path.basename(app.path), "/F"], { windowsHide: true }, () => res()));
      return { apps: await hintergrund() };
    }
    if (a === "folder") shell.showItemInFolder(app.path);
    if (a === "settings") shell.openExternal("ms-settings:startupapps");
  });
}

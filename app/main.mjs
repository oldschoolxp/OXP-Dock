// OXP Dock – Hauptprozess.
// Ein schmales, immer sichtbares Fenster am unteren Bildschirmrand ersetzt die Windows-Taskleiste:
// OX-Startknopf, angeheftete Programme, offene Fenster und Live-Widgets.
import { app, BrowserWindow, ipcMain, screen, shell, Menu, dialog, nativeImage, Notification } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import * as win from "./win32.mjs";
import { WEBSITE, SUPABASE_URL, SUPABASE_ANON_KEY } from "./oeffentlich.mjs";
import { createBaukasten, GROUPS } from "./baukasten.mjs";
import { createSystemhelfer } from "./systemhelfer.mjs";
import { claudeUsage } from "./claude-login.mjs";
import { WIDGET_OPTIONEN } from "./widget-optionen.mjs";
import { initUpdater, jetztPruefen, updateZustand } from "./updater.mjs";
import * as lizenz from "./lizenz.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
// Messmodus (nur mit OXP_DOCK_PROFILE=1): wie viel Zeit verbrauchen die wiederkehrenden Aufgaben?
if (process.env.OXP_DOCK_PROFILE) {
  const zeiten = new Map();
  const orig = globalThis.setInterval;
  globalThis.setInterval = (fn, ms, ...rest) => {
    const name = (fn.name || fn.toString().replace(/s+/g, " ").slice(0, 60)) + " @" + ms;
    return orig(async (...a) => {
      const t = performance.now();
      try {
        await fn(...a);
      } finally {
        const z = zeiten.get(name) || { n: 0, ms: 0 };
        z.n++;
        z.ms += performance.now() - t;
        zeiten.set(name, z);
      }
    }, ms, ...rest);
  };
  orig(() => {
    const liste = [...zeiten].sort((x, y) => y[1].ms - x[1].ms).slice(0, 12);
    console.log(["PROFIL 30s:", ...liste.map(([k, v]) => `  ${v.ms.toFixed(0).padStart(6)} ms  ${String(v.n).padStart(4)}x  ${k}`)].join(String.fromCharCode(10)));
    zeiten.clear();
  }, 30_000);
}
// Einstellungen immer im selben Ordner – egal ob installiert („OXP Dock“) oder im Entwicklungsmodus („oxp-dock“)
app.setPath("userData", process.env.OXP_DOCK_DATA || path.join(app.getPath("appData"), "oxp-dock")); // OXP_DOCK_DATA nur zum Testen (frische Installation)
const BASE_HEIGHT = 60; // DIP inklusive Rand bei 100 %
const TIP_SPACE = 64; // durchklickbarer Platz über dem Dock für auch mehrzeilige Namens-Blasen
const APPBAR_MSG = 0x8000 + 0x51; // WM_APP + x
const dockHeight = () => Math.round(BASE_HEIGHT * config.look.scale);
const tipSpace = () => Math.round((TIP_SPACE + (config.look.magnify ? (config.look.magnifyLevel - 1) * 30 : 0)) * config.look.scale);

if (!app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId("de.oldschoolxp.dock");

// ---------- Einstellungen ----------

const configPath = path.join(app.getPath("userData"), "einstellungen.json");
const defaults = {
  pins: null, // null = beim ersten Start aus der Windows-Taskleiste übernehmen
  hideWindowsTaskbar: true,
  allMonitors: true, // Dock auf allen Bildschirmen
  autostart: false,
  channel: "oldschoolxptv",
  streamScope: "own", // "own" = nur eigener Kanal, "all" = alle Partner
  weatherCity: "",
  widgets: { live: true, stream: true, claude: false, media: true, system: true, weather: true }, // alt, nur noch zum Übernehmen
  widgetOrder: null, // Reihenfolge der Widgets in der Leiste (ids)
  widgetSettings: {}, // Einstellungen einzelner Widgets (z. B. Weltuhren, Kurse)
  widgetOptions: {}, // Optionen aus dem Reiter „Widget-Einstellungen“ (siehe widget-optionen.mjs)
  look: { barColor: "#18151f", accent: "#8f3cff", opacity: 0.94, scale: 1, magnify: false, magnifyLevel: 1.6, previews: true, fullWidth: false },
  autoUpdate: true, // beim Start und alle paar Stunden nach neuen Versionen sehen
};
let config = loadConfig();
if (!Array.isArray(config.widgetOrder)) {
  config.widgetOrder = ["live", "stream", "claude", "media", "system", "weather"].filter((k) => config.widgets[k]);
}

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return { ...defaults, ...raw, widgets: { ...defaults.widgets, ...(raw.widgets || {}) }, look: { ...defaults.look, ...(raw.look || {}) } };
  } catch {
    // Neue Installation: Grundeinrichtung aus standard.json (so, wie das Dock „ab Werk“ aussehen soll)
    let standard = {};
    try {
      standard = JSON.parse(fs.readFileSync(path.join(here, "standard.json"), "utf8"));
      delete standard._hinweis;
    } catch {}
    return { ...structuredClone(defaults), ...standard, look: { ...defaults.look, ...(standard.look || {}) } };
  }
}
function saveConfig() {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// ---------- Angeheftete Programme ----------

/** Gruppen-Schlüssel eines Fensters/Programms: Store-Apps nach Paketname, sonst Programmdatei. */
function groupKey(exe) {
  const m = /\\WindowsApps\\([^\\_]+)_/i.exec(exe || "");
  return m ? "pkg:" + m[1].toLowerCase() : win.exeBaseName(exe);
}

/** Programm starten – Store-Apps und Windows-Apps über „shell:AppsFolder\…“. */
function launchPin(p) {
  if (!p) return;
  if (/^shell:/i.test(p)) spawn("explorer.exe", [p], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  else shell.openPath(p);
}

/** App aus der Windows-App-Liste (Store-App wie Claude/ChatGPT oder „{Ordner}\\prog.exe“) als Pin. */
async function describeAppPin(appId, name) {
  let target = "";
  let match;
  const pkg = /^([^_!\\]+)_[a-z0-9]{13}!/i.exec(appId);
  if (pkg) match = "pkg:" + pkg[1].toLowerCase();
  else {
    try {
      target = (await systemhelfer.call("resolveAppId", { appId })) || "";
    } catch {}
    match = target ? win.exeBaseName(target) : "app:" + appId.toLowerCase();
  }
  return { path: "shell:AppsFolder\\" + appId, target, match, name, appId };
}

/** Anheftliste der Windows-Taskleiste in Windows-Reihenfolge: Verknüpfungen und Apps, ohne Doppelte. */
async function windowsPinItems() {
  let items;
  try {
    items = await systemhelfer.call("windowsPins", {}, 30_000);
  } catch {
    return null;
  }
  const dateien = windowsPinLinks();
  const out = [];
  let letzteLnk = null;
  for (const it of items || []) {
    if (it.kind === "lnk") {
      const f = dateien.find((d) => it.name.toLowerCase().endsWith(d.toLowerCase()));
      letzteLnk = { pos: it.pos, found: !!f, name: (f || it.name).replace(/.lnk$/i, "").toLowerCase() };
      if (f && !out.some((x) => x.file === f)) out.push({ kind: "lnk", file: f });
    } else {
      // Windows speichert zu jeder Verknüpfung auch die App-Kennung – die überspringen
      const n = it.name.toLowerCase();
      if (letzteLnk?.found && it.pos - letzteLnk.pos < 400 && (n.startsWith(letzteLnk.name) || letzteLnk.name.startsWith(n))) continue;
      if (!out.some((x) => x.appId === it.appId)) out.push({ kind: "app", appId: it.appId, name: it.name });
    }
  }
  return out;
}

function describePin(file) {
  let target = file;
  let args = "";
  if (file.toLowerCase().endsWith(".lnk")) {
    try {
      const link = shell.readShortcutLink(file);
      target = link.target || file;
      args = link.args || "";
    } catch {
      /* Verknüpfung nicht lesbar – dann eben die .lnk selbst */
    }
  }
  // Discord & Co. starten über Update.exe --processStart Discord.exe
  const ps = /--processStart\s+"?([^"\s]+)"?/i.exec(args);
  const match = ps ? ps[1].toLowerCase() : groupKey(target);
  const name = path.basename(file).replace(/\.(lnk|exe)$/i, "");
  return { path: file, target, match, name };
}

// Hier legt Windows bei „An Taskleiste anheften“ eine Verknüpfung ab.
const WIN_PIN_DIR = path.join(process.env.APPDATA || "", "Microsoft", "Internet Explorer", "Quick Launch", "User Pinned", "TaskBar");

function windowsPinLinks() {
  try {
    return fs.readdirSync(WIN_PIN_DIR).filter((f) => f.toLowerCase().endsWith(".lnk"));
  } catch {
    return [];
  }
}

function isUsablePin(p) {
  return !(p.match === "explorer.exe" || (/\.lnk$/i.test(p.target) && /explorer/i.test(p.name)));
}

function importWindowsPins() {
  const pins = [describePin("C:\\Windows\\explorer.exe")];
  pins[0].name = "Explorer";
  for (const f of windowsPinLinks()) {
    const p = describePin(path.join(WIN_PIN_DIR, f));
    if (isUsablePin(p)) pins.push(p);
  }
  return pins;
}

if (!config.pins) {
  config.pins = importWindowsPins();
  saveConfig();
}

// „An Taskleiste anheften“ / „Von Taskleiste lösen“ aus Windows-Menüs ans Dock weitergeben:
// den Ordner beobachten und nur Änderungen übernehmen (was du im Dock selbst gelöst hast, bleibt gelöst).
let knownWinPins = new Set(windowsPinLinks());
let winPinTimer = null;
function syncWindowsPins() {
  const now = new Set(windowsPinLinks());
  let changed = false;
  for (const f of now) {
    if (knownWinPins.has(f)) continue;
    const p = describePin(path.join(WIN_PIN_DIR, f));
    if (isUsablePin(p) && !config.pins.some((x) => x.match === p.match)) {
      config.pins.push(p);
      changed = true;
    }
  }
  for (const f of knownWinPins) {
    if (now.has(f)) continue;
    const full = path.join(WIN_PIN_DIR, f).toLowerCase();
    const before = config.pins.length;
    config.pins = config.pins.filter((p) => p.path.toLowerCase() !== full);
    if (config.pins.length !== before) changed = true;
  }
  knownWinPins = now;
  if (changed) {
    saveConfig();
    pushPins();
    sendSettingsState();
  }
}
// bekannte Windows-Apps merken (auch über Neustarts), damit nur wirklich neu angeheftete übernommen werden
let knownWinApps = config.appPinsImported ? new Set(config.knownWinApps || []) : null;
/** Apps (Store-Apps usw.) aus der Windows-Anheftliste übernehmen. Beim ersten Mal alle, danach nur neu angeheftete. */
async function syncWindowsAppPins() {
  const items = await windowsPinItems();
  if (!items) return;
  const apps = items.filter((x) => x.kind === "app");
  const ids = new Set(apps.map((x) => x.appId));
  let changed = false;
  const neu = !config.appPinsImported ? apps : knownWinApps ? apps.filter((x) => !knownWinApps.has(x.appId)) : [];
  for (const it of neu) {
    const p = await describeAppPin(it.appId, it.name);
    if (config.pins.some((x) => x.match === p.match || x.appId === p.appId)) continue;
    // an die Stelle wie in Windows: hinter das vorherige Windows-Element, das schon im Dock ist
    let pos = config.pins.length;
    const idx = items.indexOf(it);
    for (let i = idx - 1; i >= 0; i--) {
      const vor = items[i];
      const j = config.pins.findIndex((x) => (vor.kind === "app" ? x.appId === vor.appId : path.basename(x.path).toLowerCase() === vor.file.toLowerCase()));
      if (j >= 0) {
        pos = j + 1;
        break;
      }
    }
    config.pins.splice(pos, 0, p);
    changed = true;
  }
  // in Windows gelöste Apps auch im Dock lösen
  if (knownWinApps) {
    for (const id of knownWinApps) {
      if (ids.has(id)) continue;
      const vorher = config.pins.length;
      config.pins = config.pins.filter((x) => x.appId !== id);
      if (config.pins.length !== vorher) changed = true;
    }
  }
  if (JSON.stringify([...ids].sort()) !== JSON.stringify([...(knownWinApps || [])].sort())) changed = true;
  knownWinApps = ids;
  config.knownWinApps = [...ids];
  if (!config.appPinsImported) {
    config.appPinsImported = true;
    changed = true;
  }
  if (changed) {
    saveConfig();
    pushPins();
    sendSettingsState();
  }
}

function watchWindowsPins() {
  setTimeout(() => syncWindowsAppPins().catch(() => {}), 4000);
  setInterval(() => syncWindowsAppPins().catch(() => {}), 60_000);
  try {
    fs.mkdirSync(WIN_PIN_DIR, { recursive: true });
    fs.watch(WIN_PIN_DIR, () => {
      clearTimeout(winPinTimer);
      winPinTimer = setTimeout(syncWindowsPins, 600);
    });
  } catch (e) {
    console.error("Anheft-Ordner nicht beobachtbar:", e.message);
  }
  setInterval(syncWindowsPins, 30_000); // falls ein Ereignis verloren geht
}

// ---------- Symbole ----------

const iconCache = new Map();
async function iconFor(file) {
  const key = (file || "").toLowerCase();
  if (!key) return null;
  if (iconCache.has(key)) return iconCache.get(key);
  const failedAt = iconFailed.get(key);
  if (failedAt && Date.now() - failedAt < 20_000) return null;
  let url = null;
  // 1. Wie im Explorer über den Systemhelfer (scharf, 48 px, zuverlässig auch bei Edge & Co.)
  try {
    url = await systemhelfer.call("icon", { path: file, size: 48 }, 8000);
  } catch {}
  // 2. Ersatz: Electron selbst – bleibt bei manchen Dateien (v. a. direkt nach dem Start) hängen
  if (!url) {
    try {
      const img = await Promise.race([app.getFileIcon(file, { size: "large" }), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000))]);
      if (!img.isEmpty()) url = img.toDataURL();
    } catch (e) {
      console.error("Symbol fehlt (neuer Versuch später):", file, e.message);
      iconFailed.set(key, Date.now());
      return null;
    }
  }
  iconCache.set(key, url);
  return url;
}
const iconFailed = new Map();

// ---------- Dock-Fenster (eins pro Bildschirm) ----------

const docks = new Map(); // Bildschirm-ID -> { win, hwnd, displayId, barRect, ignoring, hiddenFs }
let dock = null; // Dock auf dem Hauptbildschirm (für Dialoge)
let settingsWin = null;

const displayById = (id) => screen.getAllDisplays().find((d) => d.id === id) || null;
const isDockHwnd = (h) => [...docks.values()].some((d) => d.hwnd === h);

/** Das Dock, über dem gerade die Maus ist (sonst das auf dem Hauptbildschirm). */
function entryAtCursor() {
  const p = screen.getCursorScreenPoint();
  for (const d of docks.values()) {
    const disp = displayById(d.displayId);
    if (disp && p.x >= disp.bounds.x && p.x < disp.bounds.x + disp.bounds.width && p.y >= disp.bounds.y && p.y < disp.bounds.y + disp.bounds.height) return d;
  }
  return docks.get(screen.getPrimaryDisplay().id) || [...docks.values()][0] || null;
}

/** Docks mit den angeschlossenen Bildschirmen abgleichen und alle neu ausrichten. */
function placeDock() {
  if (lizenzGesperrt) return; // ohne gültige Lizenz keine Leiste – dann bleibt die Windows-Taskleiste
  const wanted = config.allMonitors ? screen.getAllDisplays() : [screen.getPrimaryDisplay()];
  const ids = new Set(wanted.map((d) => d.id));
  for (const [id, d] of docks) {
    if (ids.has(id)) continue;
    try {
      win.releaseBottom(d.hwnd);
    } catch {}
    if (!d.win.isDestroyed()) d.win.destroy();
    docks.delete(id);
  }
  for (const disp of wanted) if (!docks.has(disp.id)) createDock(disp);
  for (const d of docks.values()) placeEntry(d);
  dock = docks.get(screen.getPrimaryDisplay().id)?.win || [...docks.values()][0]?.win || null;
}

function placeEntry(d) {
  const display = displayById(d.displayId);
  if (!display || d.win.isDestroyed()) return;
  // physische Maße des Bildschirms genau von Windows (Electron rechnet bei Skalierung bis zu 2 px daneben)
  const grob = screen.dipToScreenRect(null, display.bounds);
  const bounds = win.monitorAt(grob.x + grob.width / 2, grob.y + grob.height / 2) || grob;
  d.monitor = bounds;
  const h = dockHeight();
  try {
    win.reserveBottom(d.hwnd, bounds, Math.round(h * display.scaleFactor), APPBAR_MSG);
  } catch (e) {
    console.error("Platz reservieren fehlgeschlagen:", e);
  }
  // Fenster ist um tipSpace höher als der reservierte Bereich – dieser obere Teil ist durchklickbar.
  d.placedAt = Date.now();
  const total = h + tipSpace();
  d.barRect = { x: display.bounds.x, y: display.bounds.y + display.bounds.height - h, width: display.bounds.width, height: h };
  d.win.setBounds({ x: display.bounds.x, y: display.bounds.y + display.bounds.height - total, width: display.bounds.width, height: total });
  d.win.webContents.setZoomFactor(config.look.scale);
}

// Maus nur dort abfangen, wo die Leiste ist – darüber gehen Klicks an die Fenster dahinter.
// Per Mauszeiger-Abfrage statt Maus-Ereignissen, damit auch Ziehen aus dem Explorer aufs Dock klappt.
function updateMousePassThrough() {
  const p = screen.getCursorScreenPoint();
  for (const d of docks.values()) {
    if (d.win.isDestroyed() || !d.barRect) continue;
    const r = d.barRect;
    const bx = d.barX || { x: r.x, width: r.width };
    const over = p.x >= bx.x && p.x < bx.x + bx.width && p.y >= r.y + 4 && p.y <= r.y + r.height;
    const ignore = !over;
    if (ignore === d.ignoring) continue;
    d.ignoring = ignore;
    d.win.setIgnoreMouseEvents(ignore, { forward: true });
    if (ignore) d.win.webContents.send("mouse-left-bar", true);
  }
}

function createDock(display) {
  const w = new BrowserWindow({
    width: 800,
    height: BASE_HEIGHT + TIP_SPACE,
    x: display.bounds.x,
    y: display.bounds.y + display.bounds.height - BASE_HEIGHT - TIP_SPACE,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    hasShadow: false,
    thickFrame: false,
    show: false,
    title: "OXP Dock",
    icon: path.join(here, "assets", "icon.ico"),
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, sandbox: true },
  });
  const d = { win: w, hwnd: Number(w.getNativeWindowHandle().readBigUInt64LE(0)), displayId: display.id, barRect: null, ignoring: null, hiddenFs: false };
  docks.set(display.id, d);
  w.setAlwaysOnTop(true, "screen-saver");
  w.loadFile(path.join(here, "dock.html"));
  // Windows meldet über diese Nachricht, wenn sich Taskleisten verschieben.
  w.hookWindowMessage(APPBAR_MSG, (wParam) => {
    // ABN_POSCHANGED – nur gelegentlich nachziehen, sonst lösen sich mehrere Docks gegenseitig endlos aus
    if (wParam.readUInt32LE(0) === 1 && Date.now() - (d.placedAt || 0) > 1500) placeEntry(d);
  });
  w.once("ready-to-show", () => {
    placeEntry(d);
    w.showInactive();
  });
  return d;
}

function setFullscreen(d, on) {
  if (!d || d.win.isDestroyed() || on === d.hiddenFs) return;
  d.hiddenFs = on;
  if (on) {
    d.win.hide();
    if (popupState?.entry === d) hidePopup();
  } else {
    d.win.showInactive();
    d.win.setAlwaysOnTop(true, "screen-saver");
  }
}

// ---------- Fensterliste (wird regelmäßig abgefragt) ----------

let lastForeground = 0;
const iconStore = new Map(); // Programmdatei (klein geschrieben) -> Symbol als data-URL
let lastWindowsJson = "";
let windowsState = [];

/** Deckt das Vordergrundfenster den Bildschirm dieses Docks ganz ab (Spiel, Video im Vollbild)? */
function isFullscreenOn(fg, d) {
  if (!fg || isDockHwnd(fg)) return false;
  const cls = win.windowClass(fg);
  if (["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd"].includes(cls)) return false;
  const r = win.windowRect(fg);
  // genaue Maße des Bildschirms, auf dem dieses Dock liegt – direkt von Windows
  const b = d.monitor || win.monitorOfWindow(d.hwnd);
  if (!r || !b) return false;
  const t = 3; // kleine Toleranz (Fensterränder, Rundung)
  return r.left <= b.x + t && r.top <= b.y + t && r.right >= b.x + b.width - t && r.bottom >= b.y + b.height - t;
}

async function pollWindows() {
  try {
    if (taskbarHidden && !quitting) win.keepWindowsTaskbarHidden();
    const fg = win.foregroundWindow();
    if (fg && !isDockHwnd(fg)) lastForeground = fg;
    for (const d of docks.values()) setFullscreen(d, isFullscreenOn(fg, d));

    const list = win.listWindows(process.pid);
    const neueSymbole = {};
    for (const w of list) {
      w.group = groupKey(w.exe);
      w.iconKey = (w.exe || "").toLowerCase();
      if (w.iconKey && !iconStore.has(w.iconKey)) {
        const url = await iconFor(w.exe);
        if (url) {
          iconStore.set(w.iconKey, url);
          neueSymbole[w.iconKey] = url;
        }
      }
    }
    if (Object.keys(neueSymbole).length) send("icons", neueSymbole);
    windowsState = list;
    const json = JSON.stringify({ list, lastForeground });
    if (json !== lastWindowsJson) {
      lastWindowsJson = json;
      send("windows", { list, foreground: lastForeground });
    }
  } catch (e) {
    console.error("Fensterliste:", e);
  }
}

// ---------- Popup über der Leiste (Fenster-Vorschau, Widget-Fenster) ----------
// Ein einziges durchsichtiges Fenster, das je nach Bedarf eine „Ansicht“ zeigt.
// Vorschau: ohne Fokus, verschwindet, sobald die Maus weder auf dem Symbol noch auf der Vorschau ist.
// Widget-Fenster (Lautstärke, Kalender …): mit Fokus, verschwindet beim Wegklicken.

let popup = null;
let popupState = null; // { view, anchor:{x,y,width,height} (DIP, Bildschirm), sticky:boolean, key }
let popupLeftAt = 0;

function createPopup() {
  popup = new BrowserWindow({
    width: 300,
    height: 200,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    thickFrame: false,
    show: false,
    title: "OXP Dock Popup",
    paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  popup.setAlwaysOnTop(true, "screen-saver", 1);
  popup.loadFile(path.join(here, "popup.html"));
  popup.on("blur", () => {
    if (popupState?.sticky) hidePopup();
  });
}

/** Ansicht öffnen. anchorRect: Bereich des auslösenden Elements in Dock-Fenster-Koordinaten (CSS-Pixel). */
function openPopup(view, payload, anchorRect, { sticky = false, key = view, entry = entryAtCursor() } = {}) {
  if (!popup || popup.isDestroyed()) return;
  if (!entry || entry.win.isDestroyed()) return;
  const db = entry.win.getBounds();
  const z = config.look.scale;
  const anchor = { x: db.x + anchorRect.x * z, y: db.y + anchorRect.y * z, width: anchorRect.width * z, height: anchorRect.height * z };
  clearThumbs();
  popupState = { view, anchor, sticky, key, size: null, entry };
  popupLeftAt = 0;
  popup.webContents.send("popup-view", { view, payload, look: config.look });
}

function placePopup(width, height) {
  if (!popupState || !popup || popup.isDestroyed()) return;
  const d = displayById(popupState.entry?.displayId)?.bounds || screen.getPrimaryDisplay().bounds;
  const barRect = popupState.entry?.barRect;
  const z = config.look.scale;
  const w = Math.ceil(width * z);
  const h = Math.ceil(height * z);
  const cx = popupState.anchor.x + popupState.anchor.width / 2;
  const x = Math.round(Math.min(Math.max(cx - w / 2, d.x + 8), d.x + d.width - w - 8));
  // über vergrößerten Symbolen (Mac-Effekt) entsprechend höher setzen
  const lift = popupState.key?.startsWith("preview:") && config.look.magnify ? Math.round((config.look.magnifyLevel - 1) * 30 * z) : 0;
  const y = Math.round((barRect?.y ?? d.y + d.height - dockHeight()) - h - 8 - lift);
  popupState.size = { x, y, width: w, height: h };
  popup.setBounds({ x, y, width: w, height: h });
  popup.webContents.setZoomFactor(z);
  if (popupState.sticky) {
    popup.show();
    popup.focus();
  } else popup.showInactive();
  popup.setAlwaysOnTop(true, "screen-saver", 1);
}

function hidePopup() {
  clearThumbs();
  if (popupState?.key?.startsWith("preview:")) send("preview-closed", true);
  popupState = null;
  if (popup && !popup.isDestroyed() && popup.isVisible()) {
    popup.webContents.send("popup-view", { view: null });
    popup.hide();
  }
}

/** Nicht-feste Popups (Vorschau) schließen, wenn die Maus weder auf Auslöser noch auf Popup ist. */
function checkPopupHover() {
  if (!popupState || popupState.sticky || !popupState.size) return;
  if (process.env.OXP_DOCK_TEST) return; // beim automatischen Testen gibt es keine echte Maus
  const p = screen.getCursorScreenPoint();
  const inRect = (r, pad = 0) => r && p.x >= r.x - pad && p.x <= r.x + r.width + pad && p.y >= r.y - pad && p.y <= r.y + r.height + pad;
  // die Lücke zwischen Symbol und Vorschau zählt mit
  const bridge = { x: popupState.anchor.x, y: popupState.size.y + popupState.size.height, width: popupState.anchor.width, height: popupState.anchor.y - (popupState.size.y + popupState.size.height) };
  if (inRect(popupState.anchor, 2) || inRect(popupState.size, 2) || inRect(bridge)) {
    popupLeftAt = 0;
    return;
  }
  if (!popupLeftAt) popupLeftAt = Date.now();
  else if (Date.now() - popupLeftAt > 280) hidePopup();
}

ipcMain.handle("popup-size", (e, { width, height }) => {
  if (popup && e.sender === popup.webContents) placePopup(width, height);
});
ipcMain.handle("popup-close", () => hidePopup());

ipcMain.handle("bar-rect", (e, { left, width }) => {
  for (const d of docks.values()) {
    if (d.win.webContents !== e.sender) continue;
    const b = d.win.getBounds();
    const z = config.look.scale;
    d.barX = { x: b.x + left * z, width: width * z };
  }
});

// Live-Video-Hintergrund für „Läuft gerade“: welches Fenster spielt gerade? (Titel passt zum Lied/Video, sonst die App)
ipcMain.handle("np-quelle", () => {
  const m = baukasten.data.media;
  if (!m?.active) return null;
  const titel = String(m.title || "").toLowerCase().slice(0, 30);
  const app = String(m.app || "").toLowerCase().replace(/.exe$/, "");
  // nur ein Fenster, dessen Titel wirklich zum Lied/Video passt – sonst zeigt man womöglich ein ganz anderes
  // Fenster (z. B. Chrome mit einem anderen Tab vorne)
  const passt = (titel.length >= 4 && windowsState.find((w) => w.title.toLowerCase().includes(titel))) || null;
  void app;
  return passt ? { id: `window:${passt.hwnd}:0`, hwnd: passt.hwnd, minimized: passt.minimized } : null;
});

// ---------- Lizenz ----------
// Ohne gültige Lizenz (Testphase vorbei, Schlüssel gesperrt …) läuft keine Leiste: Die Windows-Taskleiste
// bleibt bzw. kommt zurück, und ein Fenster fragt nach dem Schlüssel.
let lizenzGesperrt = true;
let lizenzStatus = null;
let lizenzWin = null;

function dockStarten() {
  if (!lizenzGesperrt) return;
  lizenzGesperrt = false;
  if (config.hideWindowsTaskbar) hideTaskbar();
  placeDock();
}
function dockStoppen() {
  if (lizenzGesperrt) return;
  lizenzGesperrt = true;
  hidePopup();
  for (const d of docks.values()) {
    try {
      win.releaseBottom(d.hwnd);
    } catch {}
    if (!d.win.isDestroyed()) d.win.destroy();
  }
  docks.clear();
  dock = null;
  if (taskbarHidden) showTaskbar();
}
function lizenzFenster() {
  if (lizenzWin && !lizenzWin.isDestroyed()) return lizenzWin.show(), lizenzWin.focus();
  lizenzWin = new BrowserWindow({
    width: 500,
    height: 560,
    resizable: false,
    maximizable: false,
    title: "OXP Dock – Lizenz",
    backgroundColor: "#121016",
    autoHideMenuBar: true,
    icon: path.join(here, "assets", "icon.ico"),
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, sandbox: true },
  });
  lizenzWin.loadFile(path.join(here, "lizenz.html"));
}
function lizenzAnwenden(s) {
  lizenzStatus = s;
  if (s.valid) {
    dockStarten();
    if (lizenzWin && !lizenzWin.isDestroyed()) setTimeout(() => lizenzWin?.close(), 1200);
    // kurz vor Ende der Testphase einmal am Tag erinnern
    const tage = s.expiresAt ? (new Date(s.expiresAt) - Date.now()) / 864e5 : null;
    if (s.trial && tage !== null && tage <= 3 && config.lizenzErinnert !== new Date().toDateString()) {
      config.lizenzErinnert = new Date().toDateString();
      saveConfig();
      try {
        new Notification({ title: "OXP Dock – Testphase", body: `Die Testphase endet in ${Math.ceil(tage)} Tag(en). Schlüssel eingeben: Einstellungen → Info.` }).show();
      } catch {}
    }
  } else {
    dockStoppen();
    lizenzFenster();
  }
  const text = lizenz.beschreibung(s);
  settingsWin?.webContents.send("lizenz-status", { ...s, text });
  return { ...s, text };
}
async function lizenzStart() {
  lizenzAnwenden(await lizenz.pruefen());
  setInterval(async () => lizenzAnwenden(await lizenz.pruefen()), 6 * 60 * 60_000);
}
ipcMain.handle("lizenz-status", () => (lizenzStatus ? { ...lizenzStatus, text: lizenz.beschreibung(lizenzStatus) } : null));
ipcMain.handle("lizenz-pruefen", async () => lizenzAnwenden(await lizenz.pruefen()));
ipcMain.handle("lizenz-eingeben", async (_e, key) => {
  if (typeof key !== "string" || !/^DOCK-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(key.trim())) return { valid: false, text: "Ungültiges Format." };
  const s = await lizenz.pruefen(key);
  if (!s.valid) return { ...s, text: lizenz.grundText(s.reason) }; // falscher Schlüssel: bisherigen Zustand behalten
  return lizenzAnwenden(s);
});

// ---------- Kontextmenüs ----------
// Windows schließt ein Menü nur bei Klick daneben, wenn sein Fenster im Vordergrund ist.
// Das Dock ist sonst nie im Vordergrund (damit es anderen Fenstern den Fokus nicht klaut) –
// daher für die Dauer des Menüs kurz fokussierbar machen.
function showMenu(template) {
  const entry = entryAtCursor();
  if (!entry || entry.win.isDestroyed()) return;
  const w = entry.win;
  hidePopup();
  let gewaehlt = false;
  const markieren = (items) =>
    items.map((it) => {
      const neu = { ...it };
      if (it.click) neu.click = (...args) => ((gewaehlt = true), it.click(...args));
      if (Array.isArray(it.submenu)) neu.submenu = markieren(it.submenu);
      return neu;
    });
  w.setFocusable(true);
  w.focus();
  Menu.buildFromTemplate(markieren(template)).popup({
    window: w,
    callback: () => {
      w.setFocusable(false);
      w.blur();
      // nur wenn nichts gewählt wurde zum vorherigen Fenster zurück – sonst würde z. B. die Einstellung gleich wieder verdeckt
      if (!gewaehlt && lastForeground) win.activate(lastForeground);
    },
  });
}

// Rechtsklick auf eine freie Stelle der Leiste: Inhalt des Original-Menüs der Windows-Taskleiste
ipcMain.handle("bar-menu", () =>
  showMenu([
    { label: "Task-Manager", click: () => shell.openPath(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "Taskmgr.exe")) },
    { type: "separator" },
    { label: "Taskleisteneinstellungen", click: () => shell.openExternal("ms-settings:taskbar") },
  ]),
);

// ---------- Fenster-Vorschau ----------

// Live-Vorschau: Windows (DWM) zeichnet die Fenster direkt in die Kästchen des Popups –
// auch minimierte Fenster, ohne Bildschirmfotos aller Fenster zu machen.
let liveThumbs = [];
function clearThumbs() {
  for (const t of liveThumbs) {
    try {
      win.thumbClear(t);
    } catch {}
  }
  liveThumbs = [];
}
const popupHwnd = () => (popup && !popup.isDestroyed() ? Number(popup.getNativeWindowHandle().readBigUInt64LE(0)) : 0);

ipcMain.handle("preview-show", async (_e, { match, rect }) => {
  if (!config.look.previews) return;
  const wins = windowsState.filter((w) => groupKey(w.exe) === match).slice(0, 6);
  if (!wins.length) return;
  const items = wins.map((w) => ({ hwnd: w.hwnd, title: w.title, icon: iconStore.get(w.iconKey) || null, minimized: w.minimized, active: w.hwnd === lastForeground }));
  openPopup("preview", { items }, rect, { key: "preview:" + match });
});
// Das Popup meldet, wo die Bild-Kästchen liegen (CSS-Pixel) – dort zeichnet Windows die Fenster hinein
ipcMain.handle("preview-rects", (e, boxes) => {
  if (!popup || e.sender !== popup.webContents || !popupState?.key?.startsWith("preview:") || !Array.isArray(boxes)) return;
  clearThumbs();
  const disp = displayById(popupState.entry?.displayId) || screen.getPrimaryDisplay();
  const f = config.look.scale * disp.scaleFactor;
  const dest = popupHwnd();
  const erlaubt = new Set(windowsState.map((w) => w.hwnd));
  for (const bx of boxes.slice(0, 6)) {
    if (!erlaubt.has(bx.hwnd)) continue;
    const id = win.thumbShow(dest, bx.hwnd, { x: Math.round(bx.x * f), y: Math.round(bx.y * f), width: Math.round(bx.width * f), height: Math.round(bx.height * f) });
    if (id) liveThumbs.push(id);
  }
  return liveThumbs.length;
});
ipcMain.handle("preview-hide", () => {
  if (popupState && !popupState.sticky) hidePopup();
});
ipcMain.handle("preview-activate", (_e, hwnd) => {
  hidePopup();
  win.activate(hwnd);
});
ipcMain.handle("preview-close-window", (_e, hwnd) => win.close(hwnd));

// ---------- Widget-Baukasten ----------

const systemhelfer = createSystemhelfer(here);
const baukasten = createBaukasten({ send: (ch, p) => send(ch, p), getConfig: () => config });
{
  const w = baukasten.ctx.widget;
  w({ id: "live", group: "oxp", name: "Live-Status", desc: "Bist du live? Welche Partner sind live?" });
  w({ id: "stream", group: "oxp", name: "Nächster Stream", desc: "Aus dem Streamplan der Website" });
  baukasten.ctx.popup("claude", async () => ({}));
  baukasten.ctx.action("claude", async (a) => {
    if (a === "refresh") await refreshClaude();
    if (a === "open") shell.openExternal("https://claude.ai/settings/usage");
  });
  w({ id: "claude", group: "konten", name: "Claude-Nutzungslimit", desc: "Sitzung + Woche. Liest deine Claude-Code-Anmeldung auf diesem PC und fragt damit nur bei Anthropic nach." });
  w({ id: "media", group: "wetter", name: "Musik-Tasten", desc: "Zurück / Pause / Weiter, zeigt Spotify-Titel" });
  w({ id: "system", group: "system", name: "CPU & Arbeitsspeicher", desc: "Auslastung als Balken" });
  w({ id: "weather", group: "wetter", name: "Wetter", desc: "Temperatur, Tageshoch/-tief (Ort in den Daten-Einstellungen)" });
}

/** Lädt alle Widget-Module aus app/haupt. */
async function loadWidgetModules() {
  const dir = path.join(here, "haupt");
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".mjs")).sort();
  } catch {}
  const helpers = { pinApp: async (appId, name) => {
      const p = await describeAppPin(appId, name);
      if (config.pins.some((x) => x.match === p.match || x.appId === p.appId)) return;
      config.pins.push(p);
      saveConfig();
      pushPins();
      sendSettingsState();
    }, iconFor: (f) => iconFor(f), popupData: (id, req) => baukasten.popupData(id, req), streamData: () => data.stream, win, shell, app, here, systemhelfer, dialog, nativeImage, Menu, dock: () => dock, saveConfig, configPath, WEBSITE, getJson: (u, h) => getJson(u, h), windows: () => windowsState, foreground: () => lastForeground, openPopup, hidePopup };
  for (const f of files) {
    try {
      const mod = await import(new URL("./haupt/" + f, import.meta.url).href);
      await mod.default(baukasten.ctx, helpers);
    } catch (e) {
      console.error("Widget-Modul " + f + ":", e);
    }
  }
  baukasten.sync();
}

ipcMain.handle("widget-popup", async (e, { id, rect }) => {
  if (!baukasten.hasPopup(id)) return false;
  if (popupState?.key === "w:" + id) {
    hidePopup(); // zweiter Klick schließt
    return true;
  }
  const entry = [...docks.values()].find((d) => d.win.webContents === e.sender);
  const payload = await baukasten.popupData(id, {});
  openPopup(id, payload, rect, { sticky: true, key: "w:" + id, entry });
  pushData(); // aktuelle Widget-Daten auch ins Widget-Fenster (ohne Programmliste/Symbole)
  return true;
});
ipcMain.handle("widget-action", async (_e, { id, action, value }) => baukasten.act(id, action, value));
ipcMain.handle("widget-popup-refresh", async (_e, { id, req }) => {
  if (!popupState || popupState.key !== "w:" + id) return;
  const state = popupState;
  const payload = await baukasten.popupData(id, req);
  if (popupState !== state || !popup || popup.isDestroyed()) return;
  popup.webContents.send("popup-view", { view: id, payload, look: config.look });
});

// ---------- Widget-Daten ----------

const data = { live: null, stream: null, weather: null, system: null, claude: null, network: null };

let networkPending = false;
async function refreshNetwork() {
  if (networkPending) return;
  networkPending = true;
  let value;
  try {
    value = await systemhelfer.call("networkStatus", {}, 8000);
  } catch {
    value = { unavailable: true };
  } finally {
    networkPending = false;
  }
  if (JSON.stringify(value) === JSON.stringify(data.network)) return;
  data.network = value;
  send("widget", { key: "network", value });
}

function send(channel, payload) {
  for (const d of docks.values()) if (!d.win.isDestroyed()) d.win.webContents.send(channel, payload);
  if ((channel === "widget" || channel === "config") && popup && !popup.isDestroyed() && popupState) popup.webContents.send(channel, payload);
}

async function pushPins() {
  const pins = [];
  for (const p of config.pins) pins.push({ ...p, icon: (await iconFor(p.target)) || (await iconFor(p.path)) });
  send("pins", pins);
  // fehlende Symbole später nochmal holen
  if (pins.some((p) => !p.icon) && pinRetries++ < 6) setTimeout(pushPins, 25_000);
}
let pinRetries = 0;

function pushData() {
  for (const [k, v] of Object.entries(data)) if (v) send("widget", { key: k, value: v });
  baukasten.pushAll();
}

function pushAll() {
  pushPins();
  send("config", publicConfig());
  for (const [k, v] of Object.entries(data)) if (v) send("widget", { key: k, value: v });
  baukasten.pushAll();
  if (iconStore.size) send("icons", Object.fromEntries(iconStore));
  lastWindowsJson = "";
}

function publicConfig() {
  const widgets = Object.fromEntries(config.widgetOrder.map((id) => [id, true]));
  return { widgets, widgetOrder: config.widgetOrder, widgetSettings: config.widgetSettings, widgetOptions: config.widgetOptions || {}, look: config.look, channel: config.channel, weatherCity: config.weatherCity, hideWindowsTaskbar: config.hideWindowsTaskbar, allMonitors: config.allMonitors, autoUpdate: config.autoUpdate !== false, autostart: config.autostart, streamScope: config.streamScope };
}

// ---------- Claude-Nutzungslimit ----------
// Nur wenn das Widget in der Leiste ist: Claude-Code-Anmeldung dieses Windows-Kontos lesen (bei Bedarf
// erneuern, siehe claude-login.mjs) und bei Anthropic die eigene Auslastung abfragen.
async function refreshClaude() {
  if (!config.widgetOrder.includes("claude")) return;
  try {
    data.claude = await claudeUsage();
  } catch (e) {
    console.error("Claude-Nutzung:", e.message);
    data.claude = { error: "gerade nicht abrufbar" };
  }
  send("widget", { key: "claude", value: data.claude });
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${res.status} bei ${url}`);
  return res.json();
}

let partners = [];
async function refreshLive() {
  try {
    const j = await getJson(`${WEBSITE}/api/live`);
    partners = j.partners || [];
    const own = partners.find((p) => p.login?.toLowerCase() === config.channel.toLowerCase());
    data.live = {
      own: own ? { name: own.name, login: own.login, isLive: !!own.isLive, logoUrl: own.logoUrl } : null,
      liveOthers: partners.filter((p) => p.isLive && p !== own).map((p) => ({ name: p.name, login: p.login, logoUrl: p.logoUrl })),
    };
    send("widget", { key: "live", value: data.live });
  } catch (e) {
    console.error("Live:", e.message);
  }
}

async function refreshStream() {
  try {
    if (!partners.length) await refreshLive();
    const own = partners.find((p) => p.login?.toLowerCase() === config.channel.toLowerCase());
    const since = new Date(Date.now() - 12 * 3600_000).toISOString();
    let url = `${SUPABASE_URL}/rest/v1/streams?select=title,game,starts_at,ends_at,owner_id,category_box_art_url&is_cancelled=eq.false&ends_at=gte.${encodeURIComponent(new Date().toISOString())}&starts_at=gte.${encodeURIComponent(since)}&order=starts_at.asc&limit=5`;
    if (config.streamScope === "own" && own) url += `&owner_id=eq.${own.id}`;
    const rows = await getJson(url, { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` });
    const next = rows[0] || null;
    if (next) {
      const owner = partners.find((p) => p.id === next.owner_id);
      next.ownerName = owner?.name || "";
    }
    data.stream = { next, upcoming: rows };
    send("widget", { key: "stream", value: data.stream });
  } catch (e) {
    console.error("Streamplan:", e.message);
  }
}

let weatherCoords = null;
async function refreshWeather() {
  if (!config.weatherCity) {
    data.weather = { missing: true };
    send("widget", { key: "weather", value: data.weather });
    return;
  }
  try {
    if (!weatherCoords || weatherCoords.city !== config.weatherCity) {
      const g = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(config.weatherCity)}&count=1&language=de`);
      const hit = g.results?.[0];
      if (!hit) {
        data.weather = { error: "Ort nicht gefunden" };
        send("widget", { key: "weather", value: data.weather });
        return;
      }
      weatherCoords = { city: config.weatherCity, name: hit.name, lat: hit.latitude, lon: hit.longitude };
    }
    const w = await getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${weatherCoords.lat}&longitude=${weatherCoords.lon}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`,
    );
    data.weather = {
      place: weatherCoords.name,
      temp: Math.round(w.current.temperature_2m),
      code: w.current.weather_code,
      isDay: !!w.current.is_day,
      max: Math.round(w.daily.temperature_2m_max[0]),
      min: Math.round(w.daily.temperature_2m_min[0]),
    };
    send("widget", { key: "weather", value: data.weather });
  } catch (e) {
    console.error("Wetter:", e.message);
  }
}

let lastCpu = os.cpus();
function refreshSystem() {
  if (!config.widgetOrder.includes("system")) return; // nur messen, wenn das Widget in der Leiste ist
  const now = os.cpus();
  let idle = 0, total = 0;
  now.forEach((c, i) => {
    const a = lastCpu[i]?.times || c.times;
    const t = c.times;
    const dt = t.user + t.nice + t.sys + t.irq + t.idle - (a.user + a.nice + a.sys + a.irq + a.idle);
    total += dt;
    idle += t.idle - a.idle;
  });
  lastCpu = now;
  const cpu = total > 0 ? Math.round(100 * (1 - idle / total)) : 0;
  const ram = Math.round(100 * (1 - os.freemem() / os.totalmem()));
  data.system = { cpu, ram, ramGb: (os.totalmem() - os.freemem()) / 1024 ** 3, ramTotalGb: os.totalmem() / 1024 ** 3 };
  send("widget", { key: "system", value: data.system });
}

// ---------- Aktionen aus dem Dock ----------

function groupWindows(match) {
  return windowsState.filter((w) => groupKey(w.exe) === match);
}

ipcMain.handle("hello", () => pushAll());
ipcMain.handle("start-menu", () => win.pressKeys([win.VK.WIN]));
ipcMain.handle("keys", (_e, name) => {
  const map = { search: [win.VK.WIN, win.VK.S], quick: [win.VK.WIN, win.VK.A], notifications: [win.VK.WIN, win.VK.N], desktop: [win.VK.WIN, win.VK.D] };
  if (map[name]) win.pressKeys(map[name]);
});
ipcMain.handle("media", (_e, what) => {
  const vk = { prev: win.VK.MEDIA_PREV, play: win.VK.MEDIA_PLAY_PAUSE, next: win.VK.MEDIA_NEXT }[what];
  if (vk) win.pressKeys([vk]);
});

/** Klick auf ein Symbol: Programm starten, Fenster nach vorn holen, minimieren oder durchschalten. */
ipcMain.handle("click-group", (_e, { match, pinPath }) => {
  const wins = groupWindows(match);
  if (!wins.length) {
    if (pinPath) launchPin(pinPath);
    return;
  }
  const activeIdx = wins.findIndex((w) => w.hwnd === lastForeground);
  if (activeIdx === -1) return win.activate(wins[0].hwnd);
  if (wins.length === 1) return win.minimize(wins[0].hwnd);
  // mehrere Fenster: zum nächsten (hintersten) wechseln
  win.activate(wins[wins.length - 1].hwnd);
});

ipcMain.handle("launch-new", (_e, pinPath) => launchPin(pinPath));
ipcMain.handle("open-url", (_e, url) => {
  if (/^https:\/\//.test(url)) shell.openExternal(url);
});

ipcMain.handle("group-menu", (_e, { match, pinPath, name }) => {
  const wins = groupWindows(match);
  const pinned = config.pins.some((p) => p.match === match);
  const items = [];
  for (const w of wins) items.push({ label: w.title.length > 60 ? w.title.slice(0, 57) + "…" : w.title, click: () => win.activate(w.hwnd) });
  if (wins.length) items.push({ type: "separator" });
  const launchPath = pinPath || wins[0]?.exe;
  if (launchPath) items.push({ label: wins.length ? `Neues Fenster: ${name}` : `${name} starten`, click: () => launchPin(launchPath) });
  if (pinned) items.push({ label: "Vom Dock lösen", click: () => unpin(match) });
  else if (wins[0]?.exe) items.push({ label: "Am Dock anheften", click: () => pin(wins[0].exe) });
  if (wins.length) {
    items.push({ type: "separator" });
    items.push({ label: wins.length > 1 ? "Alle Fenster schließen" : "Fenster schließen", click: () => wins.forEach((w) => win.close(w.hwnd)) });
  }
  showMenu(items);
});

ipcMain.handle("start-menu-context", () => {
  showMenu([
    { label: "Task-Manager", click: () => shell.openPath("C:\\Windows\\System32\\Taskmgr.exe") },
    { label: "Explorer", click: () => shell.openPath("C:\\Windows\\explorer.exe") },
    { label: "Windows-Einstellungen", click: () => shell.openExternal("ms-settings:") },
    { label: "Ausführen …", click: () => win.pressKeys([win.VK.WIN, 0x52]) },
    { type: "separator" },
    { label: "OldschoolXP-Website", click: () => shell.openExternal(WEBSITE) },
    { label: "Twitch-Kanal", click: () => shell.openExternal(`https://www.twitch.tv/${config.channel}`) },
    { type: "separator" },
    { label: "Dock-Einstellungen …", click: openSettings },
    { label: "Dock beenden", click: () => app.quit() },
  ]);
});

ipcMain.handle("live-menu", () => {
  const items = [];
  const own = data.live?.own;
  if (own) items.push({ label: `${own.name} – ${own.isLive ? "LIVE" : "offline"}`, click: () => shell.openExternal(`https://www.twitch.tv/${own.login}`) });
  if (data.live?.liveOthers?.length) {
    items.push({ type: "separator" }, { label: "Partner gerade live", enabled: false });
    for (const p of data.live.liveOthers) items.push({ label: p.name, click: () => shell.openExternal(`https://www.twitch.tv/${p.login}`) });
  }
  items.push({ type: "separator" }, { label: "Live-Seite öffnen", click: () => shell.openExternal(`${WEBSITE}/live`) });
  showMenu(items);
});

ipcMain.handle("stream-menu", () => {
  const fmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const items = (data.stream?.upcoming || []).map((s) => ({
    label: `${fmt.format(new Date(s.starts_at))}  ${s.game || s.title}`,
    click: () => shell.openExternal(`${WEBSITE}/kalender`),
  }));
  if (!items.length) items.push({ label: "Keine geplanten Streams", enabled: false });
  items.push({ type: "separator" }, { label: "Streamplan öffnen", click: () => shell.openExternal(`${WEBSITE}/kalender`) });
  showMenu(items);
});

ipcMain.handle("dropped-files", (_e, { files, beforeMatch }) => {
  for (const f of files) if (/\.(exe|lnk)$/i.test(f)) pin(f, beforeMatch);
});

/** Symbol im Dock verschoben: Reihenfolge ändern – oder ein offenes, nicht angeheftetes Programm dabei anheften. */
ipcMain.handle("reorder-pin", (_e, { match, beforeMatch }) => {
  let idx = config.pins.findIndex((p) => p.match === match);
  let item;
  if (idx === -1) {
    const w = windowsState.find((x) => groupKey(x.exe) === match);
    if (!w?.exe) return;
    item = describePin(w.exe);
  } else {
    [item] = config.pins.splice(idx, 1);
  }
  let to = beforeMatch ? config.pins.findIndex((p) => p.match === beforeMatch) : -1;
  if (to === -1) to = config.pins.length;
  config.pins.splice(to, 0, item);
  saveConfig();
  pushPins();
  sendSettingsState();
});

function pin(file, beforeMatch = null) {
  const p = describePin(file);
  if (config.pins.some((x) => x.match === p.match)) return;
  const to = beforeMatch ? config.pins.findIndex((x) => x.match === beforeMatch) : -1;
  if (to === -1) config.pins.push(p);
  else config.pins.splice(to, 0, p);
  saveConfig();
  pushPins();
  sendSettingsState();
}
function unpin(match) {
  config.pins = config.pins.filter((p) => p.match !== match);
  saveConfig();
  pushPins();
  sendSettingsState();
}

// ---------- Einstellungsfenster ----------

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 760,
    minHeight: 520,
    title: "OXP Dock – Einstellungen",
    backgroundColor: "#16141c",
    autoHideMenuBar: true,
    icon: path.join(here, "assets", "icon.ico"),
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, sandbox: true },
  });
  settingsWin.loadFile(path.join(here, "einstellungen.html"));
}

async function sendSettingsState() {
  if (!settingsWin || settingsWin.isDestroyed()) return;
  const pins = [];
  for (const p of config.pins) pins.push({ ...p, icon: (await iconFor(p.target)) || (await iconFor(p.path)) });
  settingsWin.webContents.send("settings-state", { config: publicConfig(), pins, catalog: baukasten.catalog.map((w) => ({ ...w, options: WIDGET_OPTIONEN[w.id] || [] })), groups: GROUPS, version: app.getVersion() });
}

ipcMain.handle("settings-load", () => {
  sendSettingsState();
  settingsWin?.webContents.send("update-status", updateZustand());
});
ipcMain.handle("update-check", () => jetztPruefen());
ipcMain.handle("settings-save", (_e, patch) => {
  const before = { ...config, widgetOrder: [...config.widgetOrder], look: { ...config.look } };
  if (typeof patch.weatherCity === "string") config.weatherCity = patch.weatherCity.trim().slice(0, 80);
  if (typeof patch.channel === "string" && /^[a-z0-9_]{2,30}$/i.test(patch.channel.trim())) config.channel = patch.channel.trim().toLowerCase();
  if (patch.streamScope === "own" || patch.streamScope === "all") config.streamScope = patch.streamScope;
  if (typeof patch.hideWindowsTaskbar === "boolean") config.hideWindowsTaskbar = patch.hideWindowsTaskbar;
  if (typeof patch.autostart === "boolean") config.autostart = patch.autostart;
  if (typeof patch.autoUpdate === "boolean") config.autoUpdate = patch.autoUpdate;
  if (typeof patch.allMonitors === "boolean" && patch.allMonitors !== config.allMonitors) {
    config.allMonitors = patch.allMonitors;
    setTimeout(placeDock, 100);
  }
  if (Array.isArray(patch.widgetOrder)) {
    const known = new Set(baukasten.catalog.map((w) => w.id));
    config.widgetOrder = [...new Set(patch.widgetOrder.filter((id) => typeof id === "string" && known.has(id)))];
  }
  // eine Widget-Option setzen – nur Optionen, die es in widget-optionen.mjs gibt
  if (patch.widgetOption && typeof patch.widgetOption.id === "string") {
    const { id, key, value } = patch.widgetOption;
    const def = (WIDGET_OPTIONEN[id] || []).find((o) => o.key === key);
    if (def) {
      let v = value;
      if (def.type === "toggle") v = !!v;
      if (def.type === "range") v = Math.min(def.max, Math.max(def.min, Number(v) || def.default));
      if (def.type === "select" && !def.choices.some(([c]) => c === v)) v = def.default;
      if (def.type === "color" && !/^#[0-9a-f]{6}$/i.test(String(v))) v = def.default;
      config.widgetOptions ||= {};
      (config.widgetOptions[id] ||= {})[key] = v;
    }
  }
  if (patch.widgetOptionsReset && typeof patch.widgetOptionsReset === "string" && config.widgetOptions) delete config.widgetOptions[patch.widgetOptionsReset];
  if (patch.widgetSetting && typeof patch.widgetSetting.id === "string") {
    config.widgetSettings[patch.widgetSetting.id] = patch.widgetSetting.value;
  }
  saveConfig();

  if (before.hideWindowsTaskbar !== config.hideWindowsTaskbar) {
    if (config.hideWindowsTaskbar) hideTaskbar();
    else showTaskbar();
    setTimeout(placeDock, 300);
  }
  if (before.autostart !== config.autostart) applyAutostart();
  if (patch.look && typeof patch.look === "object") {
    const l = patch.look;
    const hex = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
    if (hex(l.barColor)) config.look.barColor = l.barColor;
    if (hex(l.accent)) config.look.accent = l.accent;
    if (typeof l.opacity === "number") config.look.opacity = Math.min(1, Math.max(0.2, l.opacity));
    if (typeof l.scale === "number") config.look.scale = Math.min(1.5, Math.max(0.75, Math.round(l.scale * 20) / 20));
    if (typeof l.magnify === "boolean") config.look.magnify = l.magnify;
    if (typeof l.previews === "boolean") config.look.previews = l.previews;
    if (typeof l.fullWidth === "boolean") config.look.fullWidth = l.fullWidth;
    if (typeof l.magnifyLevel === "number") config.look.magnifyLevel = Math.min(2.2, Math.max(1.2, l.magnifyLevel));
    saveConfig();
    if (before.look.scale !== config.look.scale || before.look.magnify !== config.look.magnify || before.look.magnifyLevel !== config.look.magnifyLevel) placeDock();
  }
  if (!before.widgetOrder.includes("claude") && config.widgetOrder.includes("claude")) refreshClaude();
  baukasten.sync();
  if (before.weatherCity !== config.weatherCity) refreshWeather();
  if (before.channel !== config.channel || before.streamScope !== config.streamScope) refreshLive().then(refreshStream);
  send("config", publicConfig());
  sendSettingsState();
});
ipcMain.handle("settings-move-pin", (_e, { index, dir }) => {
  const j = index + dir;
  if (j < 0 || j >= config.pins.length) return;
  [config.pins[index], config.pins[j]] = [config.pins[j], config.pins[index]];
  saveConfig();
  pushPins();
  sendSettingsState();
});
ipcMain.handle("settings-remove-pin", (_e, index) => {
  config.pins.splice(index, 1);
  saveConfig();
  pushPins();
  sendSettingsState();
});
ipcMain.handle("settings-add-pin", async () => {
  const r = await dialog.showOpenDialog(settingsWin, { title: "Programm anheften", properties: ["openFile"], filters: [{ name: "Programme", extensions: ["exe", "lnk"] }] });
  if (!r.canceled && r.filePaths[0]) pin(r.filePaths[0]);
});
ipcMain.handle("settings-import-windows-pins", () => {
  for (const p of importWindowsPins()) if (!config.pins.some((x) => x.match === p.match)) config.pins.push(p);
  saveConfig();
  pushPins();
  sendSettingsState();
});
ipcMain.handle("quit", () => app.quit());

function applyAutostart() {
  if (!app.isPackaged) return; // im Entwicklungsmodus nicht eintragen
  app.setLoginItemSettings({ openAtLogin: config.autostart, path: process.execPath });
}

// ---------- Aufräumen: Windows-Taskleiste immer zurückholen ----------

// Merkzettel auf der Festplatte: Solange die Taskleiste versteckt ist, steht hier ihr alter Zustand.
// Stürzt das Dock ab, holt der nächste Start die Taskleiste damit zuerst zurück.
const markerPath = path.join(app.getPath("userData"), "taskleiste-versteckt.json");
let taskbarHidden = false;
let quitting = false;

function hideTaskbar() {
  const prev = win.hideWindowsTaskbar();
  if (prev === null) return;
  taskbarHidden = true;
  try {
    if (!fs.existsSync(markerPath)) fs.writeFileSync(markerPath, JSON.stringify({ state: prev }));
  } catch {}
}

function showTaskbar() {
  taskbarHidden = false;
  let prev;
  try {
    prev = JSON.parse(fs.readFileSync(markerPath, "utf8")).state;
  } catch {}
  win.restoreWindowsTaskbar(prev);
  // Explorer zeigt die Leiste nach dem Umschalten manchmal erst beim zweiten Versuch
  setTimeout(() => {
    if (!taskbarHidden) win.restoreWindowsTaskbar(prev);
  }, 400);
  try {
    fs.rmSync(markerPath, { force: true });
  } catch {}
}

function recoverAfterCrash() {
  if (!fs.existsSync(markerPath)) return;
  console.log("Letzter Lauf wurde nicht sauber beendet – Windows-Taskleiste wird zurückgeholt.");
  showTaskbar();
}

let cleanedUp = false;
function cleanup() {
  quitting = true;
  try {
    systemhelfer.stop();
  } catch {}
  if (cleanedUp) return;
  cleanedUp = true;
  try {
    win.releaseBottom();
  } catch {}
  try {
    if (taskbarHidden || fs.existsSync(markerPath)) {
      const prev = (() => { try { return JSON.parse(fs.readFileSync(markerPath, "utf8")).state; } catch { return undefined; } })();
      win.restoreWindowsTaskbar(prev);
      fs.rmSync(markerPath, { force: true });
    }
  } catch {}
}
app.on("before-quit", () => (quitting = true));
app.on("will-quit", cleanup);
process.on("exit", cleanup);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => app.quit());
process.on("uncaughtException", (e) => {
  console.error(e);
  cleanup();
  app.exit(1);
});

// ---------- Start ----------

app.on("second-instance", () => (lizenzGesperrt ? lizenzFenster() : openSettings()));
app.on("window-all-closed", (e) => e.preventDefault?.());

app.whenReady().then(() => {
  recoverAfterCrash();
  lizenzStart();
  createPopup();
  loadWidgetModules();
  initUpdater({
    fenster: () => (settingsWin && !settingsWin.isDestroyed() ? settingsWin : null),
    onStatus: (z) => settingsWin && !settingsWin.isDestroyed() && settingsWin.webContents.send("update-status", z),
    automatisch: () => config.autoUpdate !== false,
  });
  screen.on("display-metrics-changed", () => setTimeout(placeDock, 200));
  screen.on("display-added", () => setTimeout(placeDock, 500));
  screen.on("display-removed", () => setTimeout(placeDock, 500));

  watchWindowsPins();
  setInterval(() => {
    updateMousePassThrough();
    checkPopupHover();
  }, 60);
  setInterval(pollWindows, 700);
  setInterval(refreshClaude, 5 * 60_000);
  refreshClaude();
  setInterval(refreshSystem, 2000);
  refreshNetwork();
  setInterval(refreshNetwork, 5000);
  setInterval(refreshLive, 60_000);
  setInterval(refreshStream, 5 * 60_000);
  setInterval(refreshWeather, 15 * 60_000);
  refreshLive().then(refreshStream);
  refreshWeather();
  applyAutostart();
});

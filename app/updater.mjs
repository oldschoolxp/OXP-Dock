// Selbst-Update über den eigenen Cloudflare-Speicher (https://updates.oldschoolxp.de/dock).
//
// Ablauf: Beim Start (nach kurzer Pause) und alle 4 Stunden still nachsehen. Gibt es eine neue Version,
// fragt das Dock „Jetzt aktualisieren? Ja / Nein“. Bei Ja wird geladen und danach automatisch neu gestartet.
// Bei Nein fragt es für diese Version erst wieder, wenn man in den Einstellungen selbst nachsieht.
import { app, dialog } from "electron";
import updaterPkg from "electron-updater";

const { autoUpdater } = updaterPkg;
const PRUEF_ABSTAND = 4 * 60 * 60_000;

let elternFenster = () => null;
let melden = () => {};
let manuell = false;
let abgelehnt = null; // Version, zu der „Nein“ gesagt wurde
let laedt = false;
let bereit = null;
let zustand = { text: "", version: null, fortschritt: null };

function setze(text, extra = {}) {
  zustand = { ...zustand, text, ...extra };
  melden(zustand);
}

function hinweisText(info) {
  const n = info?.releaseNotes;
  if (!n) return "";
  const t = Array.isArray(n) ? n.map((x) => x.note).join("\n") : String(n);
  // Die Beschreibung kann HTML enthalten (frühere GitHub-Releases)
  return t.replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 700);
}

async function fragen(info) {
  const { response } = await dialog.showMessageBox(elternFenster(), {
    type: "info",
    title: "OXP Dock – Update",
    message: `Version ${info.version} ist da (du hast ${app.getVersion()}).`,
    detail: `${hinweisText(info) || "Das Dock wurde verbessert."}\n\nJetzt aktualisieren? Das Dock startet danach von selbst neu – deine Einstellungen bleiben erhalten.`,
    buttons: ["Ja, jetzt aktualisieren", "Nein"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (response === 0) {
    laedt = true;
    setze(`Lade Version ${info.version} …`, { version: info.version, fortschritt: 0 });
    autoUpdater.downloadUpdate().catch((e) => fehler(e));
  } else {
    abgelehnt = info.version;
    setze(`Version ${info.version} ist verfügbar – über „Nach Updates suchen“ jederzeit installierbar.`, { version: info.version });
  }
}

function fehler(e) {
  laedt = false;
  console.error("[Update]", e?.message || e);
  setze("Update-Prüfung gerade nicht möglich – später nochmal versuchen.", { fortschritt: null });
  if (manuell) {
    dialog.showMessageBox(elternFenster(), {
      type: "warning",
      title: "OXP Dock – Update",
      message: "Updates konnten gerade nicht geprüft werden.",
      detail: "Bitte später nochmal versuchen. Das Dock funktioniert normal weiter.",
      noLink: true,
    });
  }
  manuell = false;
}

export function initUpdater({ fenster, onStatus, automatisch }) {
  if (fenster) elternFenster = fenster;
  if (onStatus) melden = onStatus;
  autoUpdater.autoDownload = false; // erst nach dem „Ja“
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = null;

  autoUpdater.on("checking-for-update", () => setze("Suche nach Updates …"));
  autoUpdater.on("update-available", (info) => {
    const warManuell = manuell;
    manuell = false;
    if (laedt || bereit) return;
    // Zu dieser Version wurde schon „Nein“ gesagt? Dann nur beim Nachsehen von Hand erneut fragen.
    if (abgelehnt === info.version && !warManuell) {
      setze(`Version ${info.version} ist verfügbar – über „Nach Updates suchen“ installierbar.`, { version: info.version });
      return;
    }
    fragen(info);
  });
  autoUpdater.on("update-not-available", () => {
    setze(`Du hast die neueste Version (${app.getVersion()}).`, { version: null, fortschritt: null });
    if (manuell) {
      dialog.showMessageBox(elternFenster(), { type: "info", title: "OXP Dock – Update", message: `Du hast die neueste Version (${app.getVersion()}).`, noLink: true });
    }
    manuell = false;
  });
  autoUpdater.on("download-progress", (p) => setze(`Lade Update … ${Math.round(p.percent)} %`, { fortschritt: Math.round(p.percent) }));
  autoUpdater.on("update-downloaded", (info) => {
    laedt = false;
    bereit = info.version;
    setze(`Version ${info.version} wird installiert …`, { fortschritt: 100 });
    // ohne Installer-Fenster installieren und danach wieder starten
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 800);
  });
  autoUpdater.on("error", fehler);

  if (!app.isPackaged) {
    setze("Updates gibt es nur in der installierten Version.");
    return;
  }
  const pruefen = () => {
    if (automatisch()) autoUpdater.checkForUpdates().catch(() => {});
  };
  setTimeout(pruefen, 20_000);
  setInterval(pruefen, PRUEF_ABSTAND);
}

/** Knopf „Nach Updates suchen“ in den Einstellungen. */
export function jetztPruefen() {
  if (!app.isPackaged) {
    setze("Updates gibt es nur in der installierten Version.");
    return;
  }
  if (laedt) return;
  manuell = true;
  autoUpdater.checkForUpdates().catch(fehler);
}

export const updateZustand = () => zustand;

// Lizenz des OXP Dock (wie beim OldschoolXP Clipper).
//  - Ohne Schlüssel: 7 Tage Testphase pro PC (vom Server verwaltet, startet bei Neuinstallation nicht neu)
//  - Mit Schlüssel (DOCK-XXXX-XXXX-XXXX, erstellt unter oldschoolxp.de/admin/lizenzen): Laufzeit ab dem
//    ersten Einlösen, fest an diesen PC gebunden, auch „Lebenslang“ möglich
//  - Offline: 5 Tage Schonfrist mit dem letzten gültigen Ergebnis
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { app } from "electron";
import { WEBSITE } from "./oeffentlich.mjs";

const SCHONFRIST = 5 * 24 * 60 * 60_000;
const datei = () => path.join(app.getPath("userData"), "lizenz.json");

const GRUENDE = {
  not_found: "Diesen Schlüssel gibt es nicht (Tippfehler? Dock-Schlüssel beginnen mit DOCK-).",
  revoked: "Dieser Schlüssel wurde gesperrt.",
  device_mismatch: "Dieser Schlüssel ist schon auf einem anderen PC aktiviert.",
  expired: "Die Lizenz ist abgelaufen.",
  bad_request: "Ungültige Anfrage.",
  server_error: "Der Lizenzserver hat gerade ein Problem – bitte später nochmal versuchen.",
  offline: "Keine Verbindung zum Lizenzserver.",
};
export const grundText = (r) => GRUENDE[r] || "Lizenz ungültig.";

/** Geräte-Kennung: aus der Windows-Kennung dieses PCs abgeleitet (bleibt bei Neuinstallation gleich). */
let geraet = null;
export function geraeteId() {
  if (geraet) return geraet;
  let basis = "";
  try {
    const out = execFileSync("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"], { windowsHide: true, encoding: "utf8" });
    basis = /MachineGuid\s+REG_SZ\s+(\S+)/i.exec(out)?.[1] || "";
  } catch {}
  if (!basis) {
    // Ersatz, falls die Windows-Kennung nicht lesbar ist: einmal zufällig erzeugen und merken
    const ersatz = path.join(app.getPath("userData"), "geraet.txt");
    try {
      basis = fs.readFileSync(ersatz, "utf8").trim();
    } catch {
      basis = crypto.randomUUID();
      fs.mkdirSync(path.dirname(ersatz), { recursive: true });
      fs.writeFileSync(ersatz, basis);
    }
  }
  geraet = crypto.createHash("sha256").update(basis + "|oxp-dock").digest("hex");
  return geraet;
}

function lesen() {
  try {
    return JSON.parse(fs.readFileSync(datei(), "utf8"));
  } catch {
    return {};
  }
}
function schreiben(d) {
  fs.mkdirSync(path.dirname(datei()), { recursive: true });
  fs.writeFileSync(datei(), JSON.stringify(d, null, 1));
}

const nochGueltig = (s) => s?.valid && (!s.expiresAt || new Date(s.expiresAt) > new Date());

/**
 * Lizenz prüfen. Ohne neuen Schlüssel wird der gespeicherte benutzt (oder die Testphase).
 * Ergebnis: { valid, trial, expiresAt, key, reason?, offline? }
 */
export async function pruefen(neuerSchluessel) {
  const gespeichert = lesen();
  const key = (neuerSchluessel ?? gespeichert.key ?? "").trim().toUpperCase();
  // nur zum Testen: abgelaufene Testphase vortäuschen (ein eingegebener Schlüssel wird trotzdem echt geprüft)
  if (process.env.OXP_DOCK_LIZENZ === "abgelaufen" && !key) return { valid: false, trial: true, expiresAt: null, reason: "expired", key: "" };
  // nur im Entwicklungsmodus (nicht in der installierten Version): ohne Server-Prüfung starten, z. B. zum Testen von Oberflächen
  if (!app.isPackaged && process.env.OXP_DOCK_LIZENZ === "test") return { valid: true, trial: false, expiresAt: null, reason: null, key: "TEST" };
  let antwort;
  try {
    const r = await fetch(`${WEBSITE}/api/dock/license`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(key ? { key, deviceId: geraeteId() } : { deviceId: geraeteId() }),
      signal: AbortSignal.timeout(15_000),
    });
    antwort = await r.json();
  } catch {
    // offline: letztes gültiges Ergebnis noch bis zu 5 Tage nutzen
    const s = gespeichert.status;
    if (!neuerSchluessel && nochGueltig(s) && Date.now() - (s.checkedAt || 0) < SCHONFRIST) return { ...s, key, offline: true };
    return { valid: false, reason: "offline", key, trial: !key };
  }
  const status = { valid: !!antwort.valid, trial: !!antwort.trial || !key, expiresAt: antwort.expiresAt ?? null, reason: antwort.reason, checkedAt: Date.now() };
  if (neuerSchluessel) {
    // einen neuen Schlüssel nur übernehmen, wenn er gültig ist
    if (status.valid) schreiben({ key, status });
    return { ...status, key };
  }
  schreiben({ key: gespeichert.key, status });
  return { ...status, key };
}

/** Text für die Anzeige, z. B. „Testphase: noch 5 Tage“ oder „Lebenslang“. */
export function beschreibung(s) {
  if (!s) return "";
  if (!s.valid) return s.trial && s.reason !== "offline" ? "Die 7-tägige Testphase ist abgelaufen." : grundText(s.reason);
  const tage = s.expiresAt ? Math.max(0, Math.ceil((new Date(s.expiresAt) - Date.now()) / 864e5)) : null;
  const bis = s.expiresAt ? new Date(s.expiresAt).toLocaleDateString("de-DE") : "";
  if (s.trial) return `Testphase: noch ${tage} ${tage === 1 ? "Tag" : "Tage"} (bis ${bis})`;
  return s.expiresAt ? `Lizenz aktiv bis ${bis} (noch ${tage} ${tage === 1 ? "Tag" : "Tage"})` : "Lizenz aktiv – Lebenslang";
}

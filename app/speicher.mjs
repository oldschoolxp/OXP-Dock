// Sicheres Speichern von Einstellungsdateien.
//  - Schreiben erst in eine Zwischendatei, dann umbenennen: wird das Dock mittendrin beendet (Update, Abmelden,
//    Absturz), bleibt immer die alte ODER die neue Datei vollständig erhalten – nie eine halbe.
//  - Einmal am Tag eine Sicherung (die letzten 7 Tage) im Unterordner „sicherung“.
//  - Lesen: ist die Datei kaputt oder fehlt, wird die Zwischendatei bzw. die neueste Sicherung genommen –
//    erst wenn es gar nichts gibt, gilt die Grundeinrichtung. Eine kaputte Datei wird beiseitegelegt, nicht überschrieben.
import fs from "node:fs";
import path from "node:path";

const HALTEN = 7;

function sicherungsOrdner(datei) {
  return path.join(path.dirname(datei), "sicherung");
}
function sicherungen(datei) {
  const ordner = sicherungsOrdner(datei);
  const name = path.basename(datei, ".json");
  try {
    return fs
      .readdirSync(ordner)
      .filter((f) => f.startsWith(name + "-") && f.endsWith(".json"))
      .sort()
      .reverse()
      .map((f) => path.join(ordner, f));
  } catch {
    return [];
  }
}
const parse = (f) => {
  // ein Byte-Order-Zeichen am Anfang (z. B. von Editor/PowerShell gespeichert) macht JSON.parse ungültig
  const t = fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "");
  if (!t.trim()) throw new Error("leer");
  return JSON.parse(t);
};

/** Liest eine JSON-Datei mit Rückfall auf Zwischendatei und Sicherungen. Gibt { daten, quelle } oder null. */
export function jsonLesen(datei) {
  const kandidaten = [datei, datei + ".neu", ...sicherungen(datei)];
  let kaputt = false;
  for (const f of kandidaten) {
    if (!fs.existsSync(f)) continue;
    try {
      const daten = parse(f);
      if (f !== datei) {
        // Hauptdatei fehlte oder war kaputt: kaputte Version aufheben und die gerettete wieder als Hauptdatei setzen
        if (kaputt) fs.copyFileSync(datei, datei.replace(/\.json$/, "") + `.kaputt-${Date.now()}.json`);
        fs.writeFileSync(datei, JSON.stringify(daten, null, 2));
      }
      return { daten, quelle: f === datei ? "datei" : path.basename(f) };
    } catch {
      if (f === datei) kaputt = true;
    }
  }
  if (kaputt) {
    try {
      fs.copyFileSync(datei, datei.replace(/\.json$/, "") + `.kaputt-${Date.now()}.json`);
    } catch {}
  }
  return null;
}

/** Schreibt eine JSON-Datei sicher (Zwischendatei + Umbenennen) und legt einmal am Tag eine Sicherung an. */
export function jsonSchreiben(datei, daten, einzug = 2) {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const neu = datei + ".neu";
  const text = JSON.stringify(daten, null, einzug);
  const fd = fs.openSync(neu, "w");
  try {
    fs.writeSync(fd, text);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(neu, datei);
  try {
    const tag = new Date().toISOString().slice(0, 10);
    const ordner = sicherungsOrdner(datei);
    const ziel = path.join(ordner, `${path.basename(datei, ".json")}-${tag}.json`);
    if (!fs.existsSync(ziel)) {
      fs.mkdirSync(ordner, { recursive: true });
      fs.writeFileSync(ziel, text);
      for (const alt of sicherungen(datei).slice(HALTEN)) fs.rmSync(alt, { force: true });
    }
  } catch {}
}

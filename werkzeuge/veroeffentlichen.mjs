// Neue Version veröffentlichen – danach bekommen alle installierten Docks die Update-Frage.
//
//   1. Version in package.json erhöhen (z. B. 1.0.0 → 1.0.1)
//   2. node werkzeuge/veroeffentlichen.mjs "Was ist neu (kurz)"
//
// Baut den Installer, erzeugt latest.yml (daran erkennen die Docks die neue Version) und legt mit der
// GitHub-CLI (gh, muss angemeldet sein) ein Release mit Installer, latest.yml und Blockmap an.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;
const notizen = process.argv[2] || `OXP Dock ${version}`;
const dist = path.join(root, "dist-installer");
const exe = `OXP-Dock-Setup-${version}.exe`;
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });

console.log(`Baue OXP Dock ${version} …`);
fs.rmSync(dist, { recursive: true, force: true });
run("npx", ["electron-builder", "--win", "nsis", "--publish", "never"]);

const daten = fs.readFileSync(path.join(dist, exe));
const sha512 = crypto.createHash("sha512").update(daten).digest("base64");
fs.writeFileSync(
  path.join(dist, "latest.yml"),
  `version: ${version}\nfiles:\n  - url: ${exe}\n    sha512: ${sha512}\n    size: ${daten.length}\npath: ${exe}\nsha512: ${sha512}\nreleaseDate: '${new Date().toISOString()}'\n`,
);

console.log("Lege das GitHub-Release an …");
run("gh", ["release", "create", `v${version}`, "--repo", "oldschoolxp/OXP-Dock", "--title", version, "--notes", JSON.stringify(notizen), path.join(dist, exe), path.join(dist, "latest.yml"), path.join(dist, `${exe}.blockmap`)]);
console.log(`Fertig: Version ${version} ist veröffentlicht. Installierte Docks fragen beim nächsten Prüfen nach dem Update.`);

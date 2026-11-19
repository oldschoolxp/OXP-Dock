// Stufe 2: System & Windows – Daten, Aktionen und Fenster-Inhalte.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";

export default function register(ctx, h) {
  const { win, shell, app, systemhelfer: sh, nativeImage } = h;
  const w = (id, name, desc, data = []) => ctx.widget({ id, group: "system", name, desc, data });

  // ---------- Katalog ----------
  w("audio", "Lautstärke", "Lautstärke, stumm, Ausgabegerät wählen. Mausrad = lauter/leiser", ["audio"]);
  w("mic", "Mikrofon", "Mikrofon stumm schalten mit einem Klick", ["audio"]);
  w("battery", "Akku", "Akkustand als Zahl mit Symbol", ["battery"]);
  w("batteryRing", "Akku (Ring)", "Akkustand als Ring", ["battery"]);
  w("batteryDots", "Akku (Punkte)", "Akkustand als fünf Punkte", ["battery"]);
  w("batteryGauge", "Akku (Balken)", "Akkustand als Balken mit Restzeit", ["battery"]);
  w("brightness", "Helligkeit", "Bildschirmhelligkeit (Laptop oder Monitor mit DDC/CI). Mausrad = heller/dunkler", ["brightness"]);
  w("toggles", "Schnellschalter", "WLAN, Bluetooth, Mikrofon, Sperren, Projizieren, Nachtlicht …", ["radios", "audio"]);
  w("dnd", "Nicht stören", "Zeigt, ob Benachrichtigungen stumm sind; Klick öffnet die Benachrichtigungen", ["dnd"]);
  w("topCpu", "Top-CPU", "Welches Programm gerade am meisten Prozessor braucht", ["procs"]);
  w("topRam", "Top-RAM", "Welches Programm am meisten Arbeitsspeicher braucht", ["procs"]);
  w("temperature", "Temperatur", "Temperatur des Rechners (wenn Windows sie liefert)", ["temp"]);
  w("keyboard", "Tastatursprache", "Aktuelle Tastatursprache, Klick = nächste Sprache", ["kbd"]);
  w("notifications", "Benachrichtigungen", "Öffnet Benachrichtigungen und Kalender (Win+N)");
  w("trash", "Papierkorb", "Anzahl und Größe, Klick öffnet, Rechtsklick leert", ["trash"]);
  w("storage", "Speicherplatz", "Freier Platz auf deinen Laufwerken", ["storage"]);
  w("netspeed", "Netzwerk-Tempo", "Aktuelle Download- und Upload-Geschwindigkeit", ["net"]);
  w("screenshots", "Screenshots", "Neuer Screenshot und die letzten Bilder", []);
  w("wallpaper", "Hintergrundbilder", "Hintergrundbild aus einer Galerie wählen", []);
  w("recent", "Zuletzt geöffnet", "Zuletzt benutzte Dateien", []);
  w("apps", "Alle Programme", "Alle Programme aus dem Startmenü mit Suche", []);
  w("switcher", "Fenster-Übersicht", "Alle Fenster und Desktops (Win+Tab)");
  w("lock", "Sperren", "Bildschirm sperren (Win+L)");

  // ---------- Datenquellen ----------
  ctx.provide("audio", 1500, () => sh.call("audio"));
  ctx.provide("battery", 20_000, () => win.battery());
  ctx.provide("brightness", 10_000, () => sh.call("brightness"));
  ctx.provide("radios", 8000, () => sh.call("radios"));
  ctx.provide("procs", 3000, () => sh.call("procs", {}, 20_000));
  ctx.provide("temp", 15_000, () => sh.call("temperature", {}, 20_000));
  ctx.provide("net", 2000, () => sh.call("net"));
  ctx.provide("trash", 15_000, () => win.recycleBin());
  ctx.provide("kbd", 1000, () => {
    const k = win.keyboardLayout(h.foreground());
    let name = "";
    try {
      const tag = new Intl.Locale(langTag(k.langId)).language;
      name = new Intl.DisplayNames(["de"], { type: "language" }).of(tag);
    } catch {}
    return { ...k, short: shortLang(k.langId), name };
  });
  ctx.provide("dnd", 10_000, () => readDnd());
  ctx.provide("storage", 60_000, () => drives());

  // ---------- Aktionen ----------
  ctx.action("audio", async (a, v) => {
    if (a === "volume") await sh.call("setVolume", { flow: 0, value: v });
    if (a === "step") {
      const cur = ctx.get("audio")?.volume ?? 50;
      await sh.call("setVolume", { flow: 0, value: Math.max(0, Math.min(100, cur + v)) });
    }
    if (a === "mute") await sh.call("setMute", { flow: 0, value: v });
    if (a === "micMute") await sh.call("setMute", { flow: 1, value: v });
    if (a === "micVolume") await sh.call("setVolume", { flow: 1, value: v });
    if (a === "device") await sh.call("setDefaultDevice", { id: v });
    if (a === "settings") shell.openExternal("ms-settings:sound");
    await ctx.refresh("audio");
  });
  ctx.action("mic", async (a) => {
    if (a === "toggle") await sh.call("setMute", { flow: 1, value: !ctx.get("audio")?.micMuted });
    await ctx.refresh("audio");
  });
  ctx.action("brightness", async (a, v) => {
    if (a === "set") await sh.call("setBrightness", { value: v });
    if (a === "step") {
      const cur = ctx.get("brightness")?.value ?? 50;
      await sh.call("setBrightness", { value: Math.max(0, Math.min(100, cur + v)) });
    }
    await ctx.refresh("brightness");
  });
  ctx.action("toggles", async (a, v) => {
    if (a === "radio") await sh.call("setRadio", { kind: v.kind, on: v.on });
    if (a === "mic") await sh.call("setMute", { flow: 1, value: v });
    if (a === "lock") win.lock();
    if (a === "project") win.pressKeys([win.VK.WIN, 0x50]); // Win+P
    if (a === "cast") win.pressKeys([win.VK.WIN, 0x4b]); // Win+K
    if (a === "settings") shell.openExternal(v);
    await Promise.all([ctx.refresh("radios"), ctx.refresh("audio")]);
  });
  ctx.action("dnd", async (a) => {
    if (a === "open") win.pressKeys([win.VK.WIN, win.VK.N]);
  });
  const procAction = async (a, v) => {
    if (a === "kill" && Number.isInteger(v?.pid)) {
      const r = await h.dialog.showMessageBox(h.dock(), {
        type: "warning",
        buttons: ["Beenden", "Abbrechen"],
        defaultId: 1,
        cancelId: 1,
        title: "Programm beenden",
        message: `„${v.name}“ beenden?`,
        detail: "Nicht gespeicherte Arbeit in diesem Programm geht verloren.",
      });
      if (r.response === 0) await new Promise((res) => execFile("taskkill", ["/IM", v.name + ".exe", "/F"], { windowsHide: true }, () => res()));
      await ctx.refresh("procs");
    }
    if (a === "taskmgr") shell.openPath("C:\\Windows\\System32\\Taskmgr.exe");
  };
  ctx.action("topCpu", procAction);
  ctx.action("topRam", procAction);
  ctx.action("keyboard", async (a) => {
    if (a === "next") win.nextKeyboardLayout(h.foreground());
    if (a === "settings") shell.openExternal("ms-settings:regionlanguage");
    setTimeout(() => ctx.refresh("kbd"), 250);
  });
  ctx.action("notifications", async () => win.pressKeys([win.VK.WIN, win.VK.N]));
  ctx.action("switcher", async () => win.pressKeys([win.VK.WIN, 0x09]));
  ctx.action("lock", async () => win.lock());
  ctx.action("trash", async (a) => {
    if (a === "open") shell.openExternal("shell:RecycleBinFolder");
    if (a === "empty") win.emptyRecycleBin();
    setTimeout(() => ctx.refresh("trash"), 500);
  });
  ctx.action("storage", async (a, v) => {
    if (a === "open" && /^[A-Z]:\\$/.test(v)) shell.openPath(v);
  });
  ctx.action("screenshots", async (a, v) => {
    if (a === "new") win.pressKeys([win.VK.WIN, 0x10, win.VK.S]); // Win+Umschalt+S
    if (a === "open" && typeof v === "string" && v.startsWith(screenshotDir())) shell.openPath(v);
    if (a === "folder") shell.openPath(screenshotDir());
  });
  ctx.action("wallpaper", async (a, v) => {
    if (a === "set" && typeof v === "string" && fs.existsSync(v)) win.setWallpaper(v);
    if (a === "folder") {
      const r = await h.dialog.showOpenDialog({ title: "Ordner mit Hintergrundbildern", properties: ["openDirectory"] });
      if (!r.canceled && r.filePaths[0]) {
        ctx.config().widgetSettings.wallpaper = { folder: r.filePaths[0] };
        h.saveConfig();
        wallCache = null;
        return true;
      }
    }
    if (a === "settings") shell.openExternal("ms-settings:personalization-background");
  });
  ctx.action("recent", async (a, v) => {
    if (a === "open" && typeof v === "string" && fs.existsSync(v)) shell.openPath(v);
  });
  ctx.action("apps", async (a, v) => {
    if (a === "open" && typeof v === "string" && v.toLowerCase().endsWith(".lnk") && fs.existsSync(v)) shell.openPath(v);
  });

  // ---------- Fenster-Inhalte ----------
  ctx.popup("audio", async () => ({ devices: await sh.call("audioDevices") }));
  ctx.popup("brightness", async () => ({}));
  ctx.popup("toggles", async () => ({}));
  ctx.popup("topCpu", async () => ({ sort: "cpu" }));
  ctx.popup("topRam", async () => ({ sort: "ram" }));
  ctx.popup("storage", async () => ({}));
  ctx.popup("battery", async () => ({}));
  ctx.popup("batteryRing", async () => ({}));
  ctx.popup("batteryDots", async () => ({}));
  ctx.popup("batteryGauge", async () => ({}));
  ctx.popup("netspeed", async () => ({}));
  ctx.popup("screenshots", async () => ({ shots: listImages(screenshotDir(), 9) }));
  ctx.popup("wallpaper", async () => ({ images: wallpapers() }));
  ctx.popup("recent", async () => ({ files: await recentFiles() }));
  ctx.popup("apps", async () => ({ apps: await startMenuApps() }));

  // ---------- Netzwerk-Menü (Klick auf das Netzwerksymbol, öffnet direkt darüber) ----------
  ctx.popup("netz", async ({ laden }) => {
    if (!laden) return { loading: true };
    const [network, radios, audio, wlan] = await Promise.all([
      sh.call("networkStatus", {}, 8000).catch(() => null),
      sh.call("radios").catch(() => []),
      sh.call("audio").catch(() => null),
      wlanListe().catch(() => ({ netze: [], verbunden: null, fehler: true })),
    ]);
    return { network, radios, audio, wlan };
  });
  ctx.action("netz", async (a, v) => {
    if (a === "radio") return sh.call("setRadio", { kind: v.kind, on: v.on }).catch((e) => e.message);
    if (a === "volume") return sh.call("setVolume", { flow: 0, value: Math.max(0, Math.min(100, Number(v) || 0)) });
    if (a === "mute") return sh.call("setMute", { flow: 0, value: !!v });
    if (a === "micMute") return sh.call("setMute", { flow: 1, value: !!v });
    if (a === "settings" && /^ms-settings:[a-z-]*$/.test(v)) return shell.openExternal(v);
    if (a === "windows") return win.pressKeys([win.VK.WIN, 0x41]); // Win+A: die Schnelleinstellungen von Windows
    if (a === "trennen") return netsh(["wlan", "disconnect"]).then(() => true);
    if (a === "verbinden") return wlanVerbinden(v || {});
  });

  async function netsh(args) {
    // Ausgabe als UTF-8 holen (sonst kommen Umlaute in Netzwerknamen verstümmelt an)
    const befehl = "chcp 65001>nul & netsh " + args.map((x) => (/[\s&|<>^"]/.test(x) ? `"${x.replace(/"/g, '\\"')}"` : x)).join(" ");
    return new Promise((res, rej) =>
      execFile("cmd.exe", ["/d", "/s", "/c", befehl], { windowsHide: true, encoding: "utf8", timeout: 15_000, maxBuffer: 4 << 20 }, (err, out) => (err && !out ? rej(err) : res(out || ""))),
    );
  }
  async function wlanListe() {
    const [netzeText, profileText, ifText] = await Promise.all([netsh(["wlan", "show", "networks", "mode=bssid"]), netsh(["wlan", "show", "profiles"]), netsh(["wlan", "show", "interfaces"])]);
    // gespeicherte Profile: Zeilen „    <Text> : <Name>“ nach der letzten Trennlinie
    const profile = new Set();
    const teile = profileText.split(/-{5,}/);
    for (const z of (teile[teile.length - 1] || "").split(/\r?\n/)) {
      const m = z.match(/^\s{4}\S.*?\s:\s(.+)$/);
      if (m) profile.add(m[1].trim());
    }
    const verbunden = (ifText.match(/^\s*SSID\s*:\s*(.+)$/m) || [])[1]?.trim() || null;
    const netze = [];
    const bloecke = netzeText.split(/^SSID \d+ ?: ?/m).slice(1);
    for (const b of bloecke) {
      const zeilen = b.split(/\r?\n/);
      const ssid = zeilen[0].trim();
      if (!ssid) continue; // versteckte Netze
      const auth = (zeilen[2] || "").split(":").slice(1).join(":").trim(); // Netzwerktyp, Authentifizierung, …
      const signal = Math.max(0, ...[...b.matchAll(/:\s*(\d{1,3})%/g)].map((m) => +m[1]));
      const offen = /^(offen|open)$/i.test(auth);
      const art = offen ? "open" : /WPA3-Personal|WPA3-Pers/i.test(auth) ? "WPA3SAE" : /WPA2-Personal|WPA-Personal/i.test(auth) ? "WPA2PSK" : "andere";
      if (!netze.some((n) => n.ssid === ssid)) netze.push({ ssid, signal, offen, art, auth, bekannt: profile.has(ssid), verbunden: ssid === verbunden });
    }
    netze.sort((x, y) => y.verbunden - x.verbunden || y.signal - x.signal);
    return { netze: netze.slice(0, 14), verbunden };
  }
  async function wlanVerbinden({ ssid, passwort, art }) {
    if (typeof ssid !== "string" || !ssid || ssid.length > 64) return { ok: false, fehler: "Ungültiges Netzwerk" };
    const { netze } = await wlanListe();
    const netz = netze.find((n) => n.ssid === ssid);
    if (netz && !netz.bekannt) {
      // neues Netz: Profil anlegen (offen oder WPA2/WPA3 mit Kennwort), dann verbinden
      if (netz.art === "andere") {
        shell.openExternal("ms-settings:network-wifi");
        return { ok: false, fehler: "Dieses Netz braucht eine Firmen-Anmeldung – bitte in den Windows-Einstellungen verbinden." };
      }
      if (!netz.offen && (typeof passwort !== "string" || passwort.length < 8 || passwort.length > 63)) return { ok: false, fehler: "Das Kennwort muss 8 bis 63 Zeichen haben." };
      const x = (s) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);
      const sicherheit = netz.offen
        ? "<authEncryption><authentication>open</authentication><encryption>none</encryption><useOneX>false</useOneX></authEncryption>"
        : `<authEncryption><authentication>${art === "WPA3SAE" || netz.art === "WPA3SAE" ? "WPA3SAE" : "WPA2PSK"}</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption><sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>${x(passwort)}</keyMaterial></sharedKey>`;
      const xml = `<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>${x(ssid)}</name><SSIDConfig><SSID><name>${x(ssid)}</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>auto</connectionMode><MSM><security>${sicherheit}</security></MSM></WLANProfile>`;
      const datei = path.join(os.tmpdir(), `oxp-wlan-${process.pid}-${Date.now()}.xml`);
      try {
        fs.writeFileSync(datei, xml, { mode: 0o600 });
        await netsh(["wlan", "add", "profile", `filename=${datei}`, "user=current"]);
      } finally {
        fs.rmSync(datei, { force: true }); // Kennwort nicht auf der Platte liegen lassen
      }
    }
    const aus = await netsh(["wlan", "connect", `name=${ssid}`]);
    // kurz warten, ob die Verbindung steht
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 800));
      const jetzt = (await wlanListe().catch(() => ({}))).verbunden;
      if (jetzt === ssid) return { ok: true };
    }
    return { ok: false, fehler: /erfolgreich|success/i.test(aus) ? "Verbindung wird noch aufgebaut …" : "Verbinden hat nicht geklappt. Stimmt das Kennwort?" };
  }


  // ---------- Hilfsfunktionen ----------
  function langTag(id) {
    const map = { 0x0407: "de-DE", 0x0409: "en-US", 0x0809: "en-GB", 0x040c: "fr-FR", 0x0410: "it-IT", 0x0c0a: "es-ES", 0x0413: "nl-NL", 0x0415: "pl-PL", 0x0419: "ru-RU", 0x041f: "tr-TR", 0x0807: "de-CH", 0x0c07: "de-AT" };
    return map[id] || "und";
  }
  function shortLang(id) {
    const t = langTag(id);
    return t === "und" ? "??" : t.split("-")[0].toUpperCase();
  }

  function readDnd() {
    return new Promise((resolve) => {
      execFile(
        "reg",
        ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings", "/v", "NOC_GLOBAL_SETTING_TOASTS_ENABLED"],
        { windowsHide: true },
        (err, out) => {
          const m = /0x([0-9a-f]+)/i.exec(out || "");
          resolve({ on: m ? parseInt(m[1], 16) === 0 : false });
        },
      );
    });
  }

  function drives() {
    const list = [];
    for (const l of "CDEFGHIJKLMNOPQRSTUVWXYZ") {
      const root = l + ":\\";
      try {
        const s = fs.statfsSync(root);
        const total = s.blocks * s.bsize;
        if (!total) continue;
        list.push({ root, total, free: s.bavail * s.bsize });
      } catch {}
    }
    return list;
  }

  function screenshotDir() {
    return path.join(app.getPath("pictures"), "Screenshots");
  }

  const thumbCache = new Map();
  function thumb(file, w = 220, hgt = 140) {
    const key = file + "|" + w;
    if (thumbCache.has(key)) return thumbCache.get(key);
    let url = null;
    try {
      const img = nativeImage.createFromPath(file);
      if (!img.isEmpty()) url = img.resize({ width: w, quality: "good" }).toDataURL();
    } catch {}
    if (thumbCache.size > 200) thumbCache.clear();
    thumbCache.set(key, url);
    return url;
  }

  function listImages(dir, max, recursive = false) {
    const out = [];
    const walk = (d, depth) => {
      let entries = [];
      try {
        entries = fs.readdirSync(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = path.join(d, e.name);
        if (e.isDirectory() && recursive && depth < 2) walk(full, depth + 1);
        else if (/\.(png|jpe?g|bmp|webp)$/i.test(e.name)) {
          try {
            out.push({ file: full, name: e.name, mtime: fs.statSync(full).mtimeMs });
          } catch {}
        }
      }
    };
    walk(dir, 0);
    out.sort((a, b) => b.mtime - a.mtime);
    return out.slice(0, max).map((x) => ({ ...x, thumb: thumb(x.file) }));
  }

  let wallCache = null;
  function wallpapers() {
    if (wallCache && Date.now() - wallCache.at < 60_000) return wallCache.list;
    const custom = ctx.config().widgetSettings?.wallpaper?.folder;
    const dirs = custom ? [custom] : ["C:\\Windows\\Web\\Wallpaper", path.join(app.getPath("pictures"), "Hintergrundbilder"), path.join(app.getPath("pictures"), "Wallpapers")];
    let list = [];
    for (const d of dirs) list = list.concat(listImages(d, 24, true));
    list = list.slice(0, 24);
    wallCache = { at: Date.now(), list };
    return list;
  }

  async function recentFiles() {
    const dir = path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Recent");
    let items = [];
    try {
      items = fs
        .readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith(".lnk"))
        .map((f) => ({ lnk: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
    } catch {}
    const out = [];
    for (const it of items) {
      if (out.length >= 14) break;
      try {
        const t = shell.readShortcutLink(it.lnk).target;
        if (!t || !fs.existsSync(t) || fs.statSync(t).isDirectory()) continue;
        let icon = null;
        try {
          icon = (await app.getFileIcon(t, { size: "small" })).toDataURL();
        } catch {}
        out.push({ file: t, name: path.basename(t), dir: path.dirname(t), when: it.mtime, icon });
      } catch {}
    }
    return out;
  }

  let appsCache = null;
  async function startMenuApps() {
    if (appsCache && Date.now() - appsCache.at < 10 * 60_000) return appsCache.list;
    const roots = [
      path.join(process.env.ProgramData || "C:\\ProgramData", "Microsoft", "Windows", "Start Menu", "Programs"),
      path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs"),
    ];
    const found = new Map();
    const walk = (d, depth) => {
      let entries = [];
      try {
        entries = fs.readdirSync(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = path.join(d, e.name);
        if (e.isDirectory() && depth < 3) walk(full, depth + 1);
        else if (e.name.toLowerCase().endsWith(".lnk")) {
          const name = e.name.replace(/\.lnk$/i, "");
          if (/uninstall|deinstall|readme|hilfe|help|website/i.test(name)) continue;
          if (!found.has(name.toLowerCase())) found.set(name.toLowerCase(), { name, lnk: full });
        }
      }
    };
    roots.forEach((r) => walk(r, 0));
    const list = [...found.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
    for (const a of list) {
      try {
        let target = a.lnk;
        try {
          target = shell.readShortcutLink(a.lnk).target || a.lnk;
        } catch {}
        a.icon = (await Promise.race([app.getFileIcon(target, { size: "normal" }), new Promise((_, r) => setTimeout(() => r(new Error("t")), 800))])).toDataURL();
      } catch {
        a.icon = null;
      }
    }
    appsCache = { at: Date.now(), list };
    return list;
  }
  // Programmliste schon im Hintergrund vorbereiten, damit das Fenster schnell aufgeht
  setTimeout(() => startMenuApps().catch(() => {}), 20_000);
  void os;
}

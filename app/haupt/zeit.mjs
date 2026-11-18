// Stufe 3: Zeit & Produktivität – Daten, Aktionen, Fenster-Inhalte.
import fs from "node:fs";
import path from "node:path";
import { Notification, ipcMain, nativeImage } from "electron";

export default function register(ctx, h) {
  const { app, shell, systemhelfer: sh } = h;
  const w = (id, name, desc, data = []) => ctx.widget({ id, group: "zeit", name, desc, data });

  // ---------- Katalog ----------
  w("flipClock", "Klappuhr", "Uhrzeit als Klappziffern");
  w("analogClock", "Analoge Uhr", "Kleine Uhr mit Zeigern");
  w("worldClocks", "Weltuhren", "Uhrzeit in anderen Städten (im Fenster einstellbar)", ["clocks"]);
  w("weekStrip", "7 Tage", "Die nächsten 7 Tage mit Terminen als Punkte", ["calendar"]);
  w("dayTimeline", "Tagesleiste", "Heute als Zeitstrahl mit Terminen und Streams", ["calendar"]);
  w("calendar", "Kalender", "Monatsansicht mit Terminen (Outlook, Google/iCal-Link, Streamplan)", ["calendar"]);
  w("todos", "Aufgaben", "Kleine Aufgabenliste", ["todos"]);
  w("notes", "Notizen", "Schnelle Notizen, werden sofort gespeichert", ["notes"]);
  w("pomodoro", "Pomodoro", "25 Minuten Fokus, 5 Minuten Pause", ["timers"]);
  w("timer", "Timer", "Countdown mit Hinweis am Ende", ["timers"]);
  w("stopwatch", "Stoppuhr", "Stoppuhr mit Rundenzeiten", ["timers"]);
  w("calculator", "Rechner", "Taschenrechner im Fenster über der Leiste");
  w("screenTime", "Bildschirmzeit", "Wie lange du heute welche Programme benutzt hast", ["screen"]);
  w("voiceMemo", "Sprachnotiz", "Sprachnotizen aufnehmen (Ordner Dokumente\\Sprachnotizen)", ["memos"]);
  w("fileShelf", "Ablage", "Dateien kurz parken und später irgendwohin ziehen", ["shelf"]);

  // ---------- eigener Speicher ----------
  const file = path.join(app.getPath("userData"), "zeit-daten.json");
  let store = { todos: [], notes: "", clocks: ["America/New_York", "Asia/Tokyo"], ics: [], screen: {}, shelf: [] };
  try {
    store = { ...store, ...JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch {}
  let saveTimer = null;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => fs.writeFileSync(file, JSON.stringify(store, null, 1)), 400);
  };
  const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  ctx.provide("todos", 60_000, () => store.todos);
  ctx.provide("notes", 60_000, () => ({ text: store.notes }));
  ctx.provide("clocks", 60_000, () => store.clocks);

  // ---------- Aufgaben & Notizen ----------
  ctx.action("todos", async (a, v) => {
    if (a === "add" && typeof v === "string" && v.trim()) store.todos.unshift({ id: id(), text: v.trim().slice(0, 200), done: false });
    if (a === "toggle") store.todos = store.todos.map((t) => (t.id === v ? { ...t, done: !t.done } : t));
    if (a === "remove") store.todos = store.todos.filter((t) => t.id !== v);
    if (a === "clearDone") store.todos = store.todos.filter((t) => !t.done);
    save();
    ctx.set("todos", store.todos);
  });
  ctx.action("notes", async (a, v) => {
    if (a === "save" && typeof v === "string") {
      store.notes = v.slice(0, 20000);
      save();
      ctx.set("notes", { text: store.notes });
    }
  });
  ctx.action("worldClocks", async (a, v) => {
    if (a === "add" && typeof v === "string" && !store.clocks.includes(v)) store.clocks.push(v);
    if (a === "remove") store.clocks = store.clocks.filter((z) => z !== v);
    save();
    ctx.set("clocks", store.clocks);
  });

  // ---------- Timer, Pomodoro, Stoppuhr ----------
  const timers = {
    pomodoro: { phase: "fokus", running: false, endAt: 0, remaining: 25 * 60_000, rounds: 0, work: 25, pause: 5 },
    timer: { running: false, endAt: 0, remaining: 5 * 60_000, duration: 5 * 60_000 },
    stopwatch: { running: false, startAt: 0, elapsed: 0, laps: [] },
  };
  ctx.provide("timers", 3_600_000, () => timers);
  const push = () => ctx.set("timers", JSON.parse(JSON.stringify(timers)));

  function hinweis(title, body) {
    try {
      new Notification({ title, body, silent: false }).show();
    } catch {}
    ctx.set("alarm", { at: Date.now(), title, body }); // Leiste spielt einen Ton
  }

  setInterval(() => {
    const now = Date.now();
    const p = timers.pomodoro;
    if (p.running && now >= p.endAt) {
      if (p.phase === "fokus") {
        p.rounds++;
        p.phase = "pause";
        p.remaining = (p.rounds % 4 === 0 ? 15 : p.pause) * 60_000;
        hinweis("Pomodoro: Pause!", p.rounds % 4 === 0 ? "Lange Pause – 15 Minuten." : `Kurze Pause – ${p.pause} Minuten.`);
      } else {
        p.phase = "fokus";
        p.remaining = p.work * 60_000;
        hinweis("Pomodoro: Weiter geht's", `${p.work} Minuten Fokus.`);
      }
      p.endAt = now + p.remaining;
      push();
    }
    const t = timers.timer;
    if (t.running && now >= t.endAt) {
      t.running = false;
      t.remaining = 0;
      hinweis("Timer abgelaufen", "Deine Zeit ist um.");
      push();
    }
  }, 500);

  ctx.action("pomodoro", async (a, v) => {
    const p = timers.pomodoro;
    if (a === "start") {
      p.running = true;
      p.endAt = Date.now() + p.remaining;
    }
    if (a === "pause") {
      p.running = false;
      p.remaining = Math.max(0, p.endAt - Date.now());
    }
    if (a === "reset") Object.assign(p, { phase: "fokus", running: false, remaining: p.work * 60_000, rounds: 0 });
    if (a === "skip") p.endAt = Date.now();
    if (a === "lengths" && v) {
      p.work = Math.max(1, Math.min(120, +v.work || 25));
      p.pause = Math.max(1, Math.min(60, +v.pause || 5));
      if (!p.running) p.remaining = (p.phase === "fokus" ? p.work : p.pause) * 60_000;
    }
    push();
  });
  ctx.action("timer", async (a, v) => {
    const t = timers.timer;
    if (a === "set" && +v > 0) Object.assign(t, { running: false, duration: +v, remaining: +v });
    if (a === "start" && t.remaining > 0) Object.assign(t, { running: true, endAt: Date.now() + t.remaining });
    if (a === "pause") Object.assign(t, { running: false, remaining: Math.max(0, t.endAt - Date.now()) });
    if (a === "reset") Object.assign(t, { running: false, remaining: t.duration });
    if (a === "add") {
      if (t.running) t.endAt += +v;
      else t.remaining += +v;
    }
    push();
  });
  ctx.action("stopwatch", async (a) => {
    const s = timers.stopwatch;
    const now = Date.now();
    if (a === "start") Object.assign(s, { running: true, startAt: now });
    if (a === "pause") Object.assign(s, { running: false, elapsed: s.elapsed + (now - s.startAt) });
    if (a === "lap") s.laps.unshift(s.elapsed + (s.running ? now - s.startAt : 0));
    if (a === "reset") Object.assign(s, { running: false, elapsed: 0, laps: [] });
    push();
  });
  for (const k of ["pomodoro", "timer", "stopwatch"]) ctx.popup(k, async () => ({}));

  // ---------- Bildschirmzeit ----------
  const heute = () => new Date().toLocaleDateString("sv-SE");
  setInterval(() => {
    const fg = h.foreground();
    const wnd = h.windows().find((x) => x.hwnd === fg);
    if (!wnd?.exe) return;
    const name = path.basename(wnd.exe).replace(/\.exe$/i, "");
    const d = (store.screen[heute()] ||= {});
    d[name] = (d[name] || 0) + 5;
    // nur 14 Tage aufheben
    const keys = Object.keys(store.screen).sort();
    while (keys.length > 14) delete store.screen[keys.shift()];
    zeitGeaendert = true;
  }, 5000);
  // Bildschirmzeit nur einmal pro Minute auf die Platte schreiben (statt alle 5 Sekunden)
  let zeitGeaendert = false;
  setInterval(() => {
    if (zeitGeaendert) (save(), (zeitGeaendert = false));
  }, 60_000);
  ctx.provide("screen", 30_000, () => {
    const d = store.screen[heute()] || {};
    const apps = Object.entries(d)
      .map(([name, sec]) => ({ name, sec }))
      .sort((a, b) => b.sec - a.sec);
    return { total: apps.reduce((s, x) => s + x.sec, 0), apps: apps.slice(0, 10) };
  });
  ctx.popup("screenTime", async () => {
    const tage = Object.keys(store.screen)
      .sort()
      .slice(-7)
      .map((d) => ({ day: d, total: Object.values(store.screen[d]).reduce((s, x) => s + x, 0) }));
    return { days: tage };
  });

  // ---------- Kalender: Outlook (falls offen), iCal-Links, Streamplan ----------
  const kalenderIntervall = 5 * 60_000;
  let kalenderStand = 0;
  ctx.provide("calendar", kalenderIntervall, async () => {
    const events = [];
    const quellen = [];
    try {
      const o = await sh.call("outlookEvents", { days: 35 }, 30_000);
      if (o.running) {
        quellen.push("Outlook");
        for (const e of o.events || []) events.push({ ...e, source: "Outlook" });
      }
    } catch {}
    for (const url of store.ics) {
      try {
        const res = await fetch(url.replace(/^webcal:/i, "https:"), { signal: AbortSignal.timeout(15000) });
        if (res.ok) {
          events.push(...parseIcs(await res.text()).map((e) => ({ ...e, source: "iCal" })));
          quellen.push("iCal");
        }
      } catch {}
    }
    const s = h.streamData?.();
    for (const st of s?.upcoming || []) events.push({ title: "Stream: " + (st.game || st.title), start: st.starts_at, end: st.ends_at, source: "Streamplan" });
    const von = new Date(new Date().setHours(0, 0, 0, 0)).getTime() - 31 * 864e5;
    const list = events
      .filter((e) => new Date(e.end || e.start).getTime() >= von)
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 300);
    kalenderStand = Date.now();
    return { events: list, sources: [...new Set(quellen)], ics: store.ics.length };
  });
  ctx.popup("calendar", () => {
    if (Date.now() - kalenderStand >= kalenderIntervall) void ctx.refresh("calendar");
    return { ics: store.ics };
  });
  ctx.action("calendar", async (a, v) => {
    if (a === "addIcs" && typeof v === "string" && /^(https|webcal):\/\//i.test(v.trim())) store.ics.push(v.trim());
    if (a === "removeIcs") store.ics = store.ics.filter((u) => u !== v);
    if (a === "outlook") shell.openExternal("outlook:calendar").catch(() => {});
    save();
    await ctx.refresh("calendar");
  });

  // ---------- Sprachnotizen ----------
  const memoDir = path.join(app.getPath("documents"), "Sprachnotizen");
  const memos = () => {
    try {
      return fs
        .readdirSync(memoDir)
        .filter((f) => /\.(webm|ogg)$/i.test(f))
        .map((f) => ({ name: f, path: path.join(memoDir, f), mtime: fs.statSync(path.join(memoDir, f)).mtimeMs, size: fs.statSync(path.join(memoDir, f)).size }))
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 8);
    } catch {
      return [];
    }
  };
  ctx.provide("memos", 60_000, () => memos());
  ctx.popup("voiceMemo", async () => ({}));
  ctx.action("voiceMemo", async (a, v) => {
    if (a === "save" && typeof v === "string" && v.length < 60_000_000) {
      fs.mkdirSync(memoDir, { recursive: true });
      const name = "Notiz " + new Date().toLocaleString("de-DE").replace(/[:.,]/g, "-").replace(/\s+/g, " ") + ".webm";
      fs.writeFileSync(path.join(memoDir, name), Buffer.from(v, "base64"));
      ctx.set("memos", memos());
    }
    if (a === "open" && typeof v === "string" && v.startsWith(memoDir)) shell.openPath(v);
    if (a === "folder") {
      fs.mkdirSync(memoDir, { recursive: true });
      shell.openPath(memoDir);
    }
    if (a === "delete" && typeof v === "string" && v.startsWith(memoDir)) {
      await shell.trashItem(v).catch(() => {});
      ctx.set("memos", memos());
    }
  });

  // ---------- Ablage (Dateien parken) ----------
  ctx.popup("fileShelf", async () => ({}));
  ctx.action("fileShelf", async (a, v) => {
    if (a === "add" && Array.isArray(v)) {
      for (const p of v) if (typeof p === "string" && fs.existsSync(p) && !store.shelf.some((x) => x.path === p)) store.shelf.unshift({ path: p, name: path.basename(p) });
      store.shelf = store.shelf.slice(0, 30);
    }
    if (a === "remove") store.shelf = store.shelf.filter((x) => x.path !== v);
    if (a === "clear") store.shelf = [];
    if (a === "open" && store.shelf.some((x) => x.path === v)) shell.openPath(v);
    if (a === "show" && store.shelf.some((x) => x.path === v)) shell.showItemInFolder(v);
    save();
    ctx.set("shelf", await shelfList());
  });
  async function shelfList() {
    const list = [];
    for (const f of store.shelf.filter((x) => fs.existsSync(x.path))) {
      let icon = null;
      try {
        icon = (await app.getFileIcon(f.path, { size: "normal" })).toDataURL();
      } catch {}
      list.push({ ...f, icon });
    }
    return list;
  }
  ctx.provide("shelf", 60_000, shelfList);
  // Datei aus der Ablage herausziehen (in Explorer, Mail, Discord …)
  ipcMain.handle("shelf-drag", async (e, p) => {
    if (!store.shelf.some((x) => x.path === p) || !fs.existsSync(p)) return;
    let icon;
    try {
      icon = await app.getFileIcon(p, { size: "normal" });
    } catch {
      icon = nativeImage.createEmpty();
    }
    e.sender.startDrag({ file: p, icon });
  });

  ctx.popup("calculator", async () => ({}));
  ctx.popup("worldClocks", async () => ({ zones: ZONES }));
  ctx.popup("todos", async () => ({}));
  ctx.popup("notes", async () => ({}));
  ctx.popup("weekStrip", async () => ({}));
  ctx.popup("dayTimeline", async () => ({}));
}

// Häufige Zeitzonen für die Weltuhren
const ZONES = [
  ["Berlin", "Europe/Berlin"], ["London", "Europe/London"], ["Lissabon", "Europe/Lisbon"], ["Moskau", "Europe/Moscow"], ["Istanbul", "Europe/Istanbul"],
  ["Dubai", "Asia/Dubai"], ["Indien (Delhi)", "Asia/Kolkata"], ["Bangkok", "Asia/Bangkok"], ["Peking", "Asia/Shanghai"], ["Tokio", "Asia/Tokyo"],
  ["Seoul", "Asia/Seoul"], ["Sydney", "Australia/Sydney"], ["Auckland", "Pacific/Auckland"], ["New York", "America/New_York"], ["Chicago", "America/Chicago"],
  ["Denver", "America/Denver"], ["Los Angeles", "America/Los_Angeles"], ["São Paulo", "America/Sao_Paulo"], ["Mexiko-Stadt", "America/Mexico_City"], ["Toronto", "America/Toronto"],
  ["Johannesburg", "Africa/Johannesburg"], ["Kairo", "Africa/Cairo"], ["Honolulu", "Pacific/Honolulu"], ["UTC", "UTC"],
];

/** Sehr einfacher iCal-Leser: Termine mit Start/Ende/Titel (Wiederholungen nur wöchentlich, max. 8 Wochen). */
function parseIcs(text) {
  const lines = text.replace(/\r\n[ \t]/g, "").split(/\r?\n/);
  const out = [];
  let cur = null;
  const date = (v) => {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/.exec(v);
    if (!m) return null;
    const [, y, mo, d, hh = "00", mi = "00", ss = "00", z] = m;
    return z ? new Date(Date.UTC(+y, mo - 1, +d, +hh, +mi, +ss)) : new Date(+y, mo - 1, +d, +hh, +mi, +ss);
  };
  for (const l of lines) {
    if (l === "BEGIN:VEVENT") cur = {};
    else if (l === "END:VEVENT" && cur) {
      if (cur.start) {
        out.push({ title: cur.title || "(ohne Titel)", start: cur.start.toISOString(), end: (cur.end || cur.start).toISOString(), allDay: cur.allDay, place: cur.place });
        if (/FREQ=WEEKLY/.test(cur.rrule || "")) {
          const dur = (cur.end || cur.start) - cur.start;
          for (let i = 1; i <= 8; i++) {
            const s = new Date(cur.start.getTime() + i * 7 * 864e5);
            out.push({ title: cur.title, start: s.toISOString(), end: new Date(s.getTime() + dur).toISOString(), allDay: cur.allDay });
          }
        }
      }
      cur = null;
    } else if (cur) {
      const i = l.indexOf(":");
      if (i < 0) continue;
      const key = l.slice(0, i).split(";")[0];
      const val = l.slice(i + 1);
      if (key === "SUMMARY") cur.title = val.replace(/\\,/g, ",").replace(/\\n/g, " ");
      if (key === "LOCATION") cur.place = val.replace(/\\,/g, ",");
      if (key === "DTSTART") {
        cur.start = date(val);
        cur.allDay = /VALUE=DATE(?!-)/.test(l) || val.length === 8;
      }
      if (key === "DTEND") cur.end = date(val);
      if (key === "RRULE") cur.rrule = val;
    }
  }
  return out;
}

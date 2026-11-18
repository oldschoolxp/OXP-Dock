// Stufe 3: Zeit & Produktivität – Fenster über der Leiste.
(() => {
  const A = OXPAnsichten;
  const two = (n) => String(n).padStart(2, "0");
  const dauer = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600);
    return h ? `${h}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}` : `${two(Math.floor(s / 60))}:${two(s % 60)}`;
  };
  const stdMin = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)} Std. ${Math.round((sec % 3600) / 60)} Min.` : `${Math.round(sec / 60)} Min.`);
  const amTag = (events, d) => {
    const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return events.filter((e) => new Date(e.start).getTime() < a + 864e5 && new Date(e.end || e.start).getTime() >= a);
  };
  const uhr = (iso) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

  // Sekündlich neu zeichnen, solange eine Uhr-Ansicht offen ist
  let tickFn = null;
  setInterval(() => tickFn?.(), 1000);
  const mitTick = (fn) => (k, d, w) => {
    tickFn = () => {
      if (document.activeElement?.tagName === "INPUT") return;
      fn(k, d, w);
    };
    fn(k, d, w);
  };
  const ohneTick = (fn) => (k, d, w) => {
    tickFn = null;
    fn(k, d, w);
  };

  // ---------- Kalender ----------
  let monat = null;
  const kalender = ohneTick((k, d, w) => {
    const cal = w.daten("calendar") || { events: [], sources: [] };
    const heute = new Date();
    monat ||= new Date(heute.getFullYear(), heute.getMonth(), 1);
    const erster = new Date(monat);
    const start = new Date(erster);
    start.setDate(1 - ((erster.getDay() + 6) % 7));
    let gitter = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((t) => `<span class="kal-kopf">${t}</span>`).join("");
    for (let i = 0; i < 42; i++) {
      const t = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const n = amTag(cal.events, t).length;
      const cls = [t.getMonth() !== erster.getMonth() ? "fremd" : "", t.toDateString() === heute.toDateString() ? "heute" : ""].join(" ");
      gitter += `<button class="kal-tag ${cls}" data-tag="${t.toISOString()}">${t.getDate()}${n ? `<i>${"•".repeat(Math.min(n, 3))}</i>` : ""}</button>`;
    }
    const kommend = cal.events.filter((e) => new Date(e.end || e.start) >= heute).slice(0, 7);
    const fmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
    k.innerHTML = `<div style="width:560px;display:flex;gap:14px">
      <div style="width:250px"><div class="zeile" style="padding:0 0 6px"><button class="knopf" id="zurueck">‹</button><b class="fuell" style="text-align:center">${erster.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</b><button class="knopf" id="vor">›</button></div>
        <div class="kal-gitter">${gitter}</div>
        <p class="leise" style="font-size:11px;margin:8px 0 0">Quellen: ${[...cal.sources, "Streamplan"].join(", ")}${cal.sources.includes("Outlook") ? "" : " · Outlook-Termine erscheinen, wenn Outlook geöffnet ist"}</p></div>
      <div style="flex:1;min-width:0"><h3>Demnächst</h3><div class="liste" style="max-height:220px">${
        kommend.map((e) => `<div class="eintrag" style="align-items:flex-start"><span class="leise" style="width:90px;flex:none;font-size:11.5px">${fmt.format(new Date(e.start))}${e.allDay ? "" : "<br>" + uhr(e.start)}</span><span style="flex:1"><b>${w.esc(e.title)}</b><br><span class="leise" style="font-size:11px">${w.esc(e.source)}${e.place ? " · " + w.esc(e.place) : ""}</span></span></div>`).join("") || '<p class="leise">Keine Termine.</p>'
      }</div>
        <h3 style="margin-top:10px">Google-/iCal-Kalender</h3>
        ${(d.ics || []).map((u) => `<div class="zeile" style="padding:2px 0"><span class="leise fuell" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px">${w.esc(u)}</span><button class="knopf" data-weg="${w.esc(u)}">✕</button></div>`).join("")}
        <div class="zeile" style="padding:4px 0"><input class="eingabe" id="ics" placeholder="Geheime iCal-Adresse einfügen …"><button class="knopf" id="icsplus">+</button></div>
        <p class="leise" style="font-size:10.5px;margin:0">Google Kalender → Einstellungen → Kalender → „Privatadresse im iCal-Format“</p></div></div>`;
    k.querySelector("#zurueck").onclick = () => ((monat = new Date(erster.getFullYear(), erster.getMonth() - 1, 1)), kalender(k, d, w), w.neuZeichnen());
    k.querySelector("#vor").onclick = () => ((monat = new Date(erster.getFullYear(), erster.getMonth() + 1, 1)), kalender(k, d, w), w.neuZeichnen());
    k.querySelector("#icsplus").onclick = async () => {
      const v = k.querySelector("#ics").value.trim();
      if (!v) return;
      await w.aktion("addIcs", v);
      w.neuLaden();
    };
    k.querySelectorAll("[data-weg]").forEach((b) => (b.onclick = async () => (await w.aktion("removeIcs", b.dataset.weg), w.neuLaden())));
  });
  A.add("calendar", kalender, { keys: ["calendar"] });
  A.add("weekStrip", kalender, { keys: ["calendar"] });

  A.add(
    "dayTimeline",
    ohneTick((k, d, w) => {
      const ev = amTag((w.daten("calendar") || {}).events || [], new Date());
      k.innerHTML = `<div style="width:300px"><h3>Heute</h3><div class="liste">${
        ev.map((e) => `<div class="eintrag"><span class="leise" style="width:90px">${e.allDay ? "ganztägig" : uhr(e.start) + "–" + uhr(e.end)}</span><span style="flex:1">${w.esc(e.title)}</span></div>`).join("") || '<p class="leise">Heute keine Termine.</p>'
      }</div></div>`;
    }),
    { keys: ["calendar"] },
  );

  // ---------- Weltuhren ----------
  A.add(
    "worldClocks",
    mitTick((k, d, w) => {
      const zonen = w.daten("clocks") || [];
      const name = (tz) => (d.zones || []).find((z) => z[1] === tz)?.[0] || tz.split("/").pop().replace(/_/g, " ");
      const jetzt = new Date();
      k.innerHTML = `<div style="width:300px"><h3>Weltuhren</h3>${zonen
        .map((tz) => {
          const t = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", weekday: "short", timeZone: tz }).format(jetzt);
          return `<div class="zeile"><span class="fuell">${w.esc(name(tz))}</span><b>${t}</b><button class="knopf" data-weg="${w.esc(tz)}">✕</button></div>`;
        })
        .join("")}<div class="zeile"><select class="eingabe" id="zone"><option value="">Stadt hinzufügen …</option>${(d.zones || [])
        .filter((z) => !zonen.includes(z[1]))
        .map((z) => `<option value="${z[1]}">${z[0]}</option>`)
        .join("")}</select></div></div>`;
      k.querySelectorAll("[data-weg]").forEach((b) => (b.onclick = () => w.aktion("remove", b.dataset.weg)));
      k.querySelector("#zone").onchange = (e) => e.target.value && w.aktion("add", e.target.value);
    }),
    { keys: ["clocks"] },
  );

  // ---------- Aufgaben ----------
  A.add(
    "todos",
    ohneTick((k, d, w) => {
      const t = w.daten("todos") || [];
      k.innerHTML = `<div style="width:320px"><h3>Aufgaben</h3>
        <div class="zeile" style="padding:0 0 6px"><input class="eingabe" id="neu" placeholder="Neue Aufgabe … (Enter)"></div>
        <div class="liste">${
          t.map((x) => `<div class="eintrag"><input type="checkbox" data-t="${x.id}" ${x.done ? "checked" : ""} style="accent-color:var(--lila)"><span style="flex:1;${x.done ? "text-decoration:line-through;color:var(--leise)" : ""}">${w.esc(x.text)}</span><button class="knopf" data-weg="${x.id}">✕</button></div>`).join("") || '<p class="leise">Nichts zu tun 🎉</p>'
        }</div>${t.some((x) => x.done) ? '<div class="zeile" style="justify-content:flex-end"><button class="knopf" id="erledigt">Erledigte löschen</button></div>' : ""}</div>`;
      const neu = k.querySelector("#neu");
      neu.onkeydown = async (e) => {
        if (e.key === "Enter" && neu.value.trim()) {
          const v = neu.value;
          neu.value = "";
          neu.blur();
          await w.aktion("add", v);
          setTimeout(() => k.querySelector("#neu")?.focus(), 30);
        }
      };
      k.querySelectorAll("[data-t]").forEach((c) => (c.onchange = () => w.aktion("toggle", c.dataset.t)));
      k.querySelectorAll("[data-weg]").forEach((b) => (b.onclick = () => w.aktion("remove", b.dataset.weg)));
      const er = k.querySelector("#erledigt");
      if (er) er.onclick = () => w.aktion("clearDone");
      setTimeout(() => neu.focus(), 30);
    }),
    { keys: ["todos"] },
  );

  // ---------- Notizen ----------
  A.add(
    "notes",
    ohneTick((k, d, w) => {
      const n = w.daten("notes")?.text || "";
      k.innerHTML = `<div style="width:360px"><h3>Notizen</h3><textarea class="eingabe" id="notiz" rows="12" placeholder="Einfach lostippen – wird automatisch gespeichert.">${w.esc(n)}</textarea></div>`;
      const ta = k.querySelector("#notiz");
      let t = null;
      ta.oninput = () => {
        clearTimeout(t);
        t = setTimeout(() => w.aktion("save", ta.value), 500);
      };
      ta.onblur = () => w.aktion("save", ta.value);
      setTimeout(() => (ta.focus(), (ta.selectionStart = ta.value.length)), 30);
    }),
  );

  // ---------- Pomodoro ----------
  A.add(
    "pomodoro",
    mitTick((k, d, w) => {
      const p = w.daten("timers")?.pomodoro;
      if (!p) return;
      const rest = p.running ? p.endAt - Date.now() : p.remaining;
      k.innerHTML = `<div style="width:260px;text-align:center"><h3>Pomodoro · ${p.phase === "fokus" ? "Fokus" : "Pause"}</h3>
        <div style="font-size:42px;font-weight:700;font-variant-numeric:tabular-nums;color:${p.phase === "fokus" ? "var(--text)" : "#5ad19a"}">${dauer(rest)}</div>
        <p class="leise">Runde ${p.rounds + 1} · ${p.work} / ${p.pause} Minuten</p>
        <div class="zeile" style="justify-content:center"><button class="knopf an" id="los">${p.running ? "Pause" : "Start"}</button><button class="knopf" id="skip">Überspringen</button><button class="knopf" id="reset">Zurücksetzen</button></div>
        <div class="zeile" style="justify-content:center"><span class="leise">Fokus</span><input class="eingabe" id="work" type="number" min="1" max="120" value="${p.work}" style="width:60px"><span class="leise">Pause</span><input class="eingabe" id="pause" type="number" min="1" max="60" value="${p.pause}" style="width:60px"></div></div>`;
      k.querySelector("#los").onclick = () => w.aktion(p.running ? "pause" : "start");
      k.querySelector("#skip").onclick = () => w.aktion("skip");
      k.querySelector("#reset").onclick = () => w.aktion("reset");
      const laenge = () => w.aktion("lengths", { work: +k.querySelector("#work").value, pause: +k.querySelector("#pause").value });
      k.querySelector("#work").onchange = laenge;
      k.querySelector("#pause").onchange = laenge;
    }),
    { keys: ["timers"] },
  );

  // ---------- Timer ----------
  A.add(
    "timer",
    mitTick((k, d, w) => {
      const t = w.daten("timers")?.timer;
      if (!t) return;
      const rest = t.running ? t.endAt - Date.now() : t.remaining;
      k.innerHTML = `<div style="width:280px;text-align:center"><h3>Timer</h3>
        <div style="font-size:42px;font-weight:700;font-variant-numeric:tabular-nums">${dauer(rest)}</div>
        <div class="zeile" style="justify-content:center;flex-wrap:wrap">${[1, 3, 5, 10, 15, 30, 60].map((m) => `<button class="knopf" data-min="${m}">${m} Min.</button>`).join("")}</div>
        <div class="zeile" style="justify-content:center"><button class="knopf an" id="los">${t.running ? "Pause" : "Start"}</button><button class="knopf" id="plus">+1 Min.</button><button class="knopf" id="reset">Zurück</button></div></div>`;
      k.querySelectorAll("[data-min]").forEach((b) => (b.onclick = async () => (await w.aktion("set", b.dataset.min * 60_000), w.aktion("start"))));
      k.querySelector("#los").onclick = () => w.aktion(t.running ? "pause" : "start");
      k.querySelector("#plus").onclick = () => w.aktion("add", 60_000);
      k.querySelector("#reset").onclick = () => w.aktion("reset");
    }),
    { keys: ["timers"] },
  );

  // ---------- Stoppuhr ----------
  A.add(
    "stopwatch",
    mitTick((k, d, w) => {
      const s = w.daten("timers")?.stopwatch;
      if (!s) return;
      const jetzt = s.elapsed + (s.running ? Date.now() - s.startAt : 0);
      k.innerHTML = `<div style="width:260px;text-align:center"><h3>Stoppuhr</h3>
        <div style="font-size:42px;font-weight:700;font-variant-numeric:tabular-nums">${dauer(jetzt)}</div>
        <div class="zeile" style="justify-content:center"><button class="knopf an" id="los">${s.running ? "Pause" : "Start"}</button><button class="knopf" id="runde">Runde</button><button class="knopf" id="reset">Zurück</button></div>
        <div class="liste" style="max-height:140px">${s.laps.map((l, i) => `<div class="eintrag"><span class="leise">Runde ${s.laps.length - i}</span><b style="margin-left:auto">${dauer(l)}</b></div>`).join("")}</div></div>`;
      k.querySelector("#los").onclick = () => w.aktion(s.running ? "pause" : "start");
      k.querySelector("#runde").onclick = () => w.aktion("lap");
      k.querySelector("#reset").onclick = () => w.aktion("reset");
    }),
    { keys: ["timers"] },
  );

  // ---------- Rechner (eigener kleiner Rechenkern, kein eval) ----------
  function rechne(text) {
    const s = text.replace(/,/g, ".").replace(/×/g, "*").replace(/÷/g, "/").replace(/\s+/g, "");
    let i = 0;
    const zahl = () => {
      const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(s.slice(i));
      if (!m) throw new Error("Zahl erwartet");
      i += m[0].length;
      return parseFloat(m[0]);
    };
    const faktor = () => {
      if (s[i] === "-") return i++, -faktor();
      if (s[i] === "+") return i++, faktor();
      let v;
      if (s[i] === "(") {
        i++;
        v = summe();
        if (s[i] !== ")") throw new Error(") fehlt");
        i++;
      } else v = zahl();
      if (s[i] === "%") (i++, (v /= 100));
      if (s[i] === "^") return i++, Math.pow(v, faktor());
      return v;
    };
    const produkt = () => {
      let v = faktor();
      while (s[i] === "*" || s[i] === "/") v = s[i++] === "*" ? v * faktor() : v / faktor();
      return v;
    };
    const summe = () => {
      let v = produkt();
      while (s[i] === "+" || s[i] === "-") v = s[i++] === "+" ? v + produkt() : v - produkt();
      return v;
    };
    const v = summe();
    if (i < s.length) throw new Error("unerwartet: " + s[i]);
    return v;
  }
  const verlauf = [];
  A.add(
    "calculator",
    ohneTick((k, d, w) => {
      const tasten = ["C", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "-", "1", "2", "3", "+", "%", "0", ",", "="];
      k.innerHTML = `<div style="width:250px"><input class="eingabe" id="calc" style="font-size:20px;text-align:right" autocomplete="off">
        <div id="erg" class="leise" style="text-align:right;height:18px;margin:4px 2px"></div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px">${tasten.map((t) => `<button class="knopf ${t === "=" ? "an" : ""}" data-k="${t}" style="padding:10px 0;font-size:15px">${t}</button>`).join("")}</div>
        <div class="liste" style="max-height:90px;margin-top:6px">${verlauf.map((v) => `<div class="eintrag leise" style="justify-content:flex-end;font-size:11.5px">${w.esc(v)}</div>`).join("")}</div></div>`;
      const ein = k.querySelector("#calc");
      const erg = k.querySelector("#erg");
      const vorschau = () => {
        try {
          erg.textContent = ein.value ? "= " + (+rechne(ein.value).toPrecision(12)).toLocaleString("de-DE", { maximumFractionDigits: 10 }) : "";
        } catch {
          erg.textContent = "";
        }
      };
      const fertig = () => {
        try {
          const v = +rechne(ein.value).toPrecision(12);
          verlauf.unshift(`${ein.value} = ${v.toLocaleString("de-DE", { maximumFractionDigits: 10 })}`);
          verlauf.splice(5);
          ein.value = String(v).replace(".", ",");
          erg.textContent = "";
        } catch {
          erg.textContent = "Fehler";
        }
      };
      ein.oninput = vorschau;
      ein.onkeydown = (e) => {
        if (e.key === "Enter") fertig();
      };
      k.querySelectorAll("[data-k]").forEach(
        (b) =>
          (b.onclick = () => {
            const t = b.dataset.k;
            if (t === "C") ein.value = "";
            else if (t === "=") fertig();
            else ein.value += t;
            vorschau();
            ein.focus();
          }),
      );
      setTimeout(() => ein.focus(), 30);
    }),
  );

  // ---------- Bildschirmzeit ----------
  A.add(
    "screenTime",
    ohneTick((k, d, w) => {
      const s = w.daten("screen") || { total: 0, apps: [] };
      const max = Math.max(1, ...(d.days || []).map((x) => x.total));
      const top = s.apps[0]?.sec || 1;
      k.innerHTML = `<div style="width:320px"><h3>Bildschirmzeit heute · ${stdMin(s.total)}</h3>
        ${s.apps.map((a) => `<div class="zeile" style="padding:3px 4px"><span style="width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${w.esc(a.name)}</span><div class="fuell" style="height:6px;border-radius:3px;background:#2c2836;overflow:hidden"><i style="display:block;height:100%;width:${(100 * a.sec) / top}%;background:var(--lila)"></i></div><span class="leise" style="width:72px;text-align:right">${stdMin(a.sec)}</span></div>`).join("")}
        <h3 style="margin-top:10px">Letzte Tage</h3><div style="display:flex;gap:6px;align-items:flex-end;height:70px">${(d.days || [])
          .map((x) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><i style="width:100%;border-radius:3px;background:var(--lila);height:${(52 * x.total) / max}px"></i><span class="leise" style="font-size:10px">${new Date(x.day).toLocaleDateString("de-DE", { weekday: "short" })}</span></div>`)
          .join("")}</div></div>`;
    }),
    { keys: ["screen"] },
  );

  // ---------- Sprachnotiz ----------
  let rec = null;
  let recStart = 0;
  A.add(
    "voiceMemo",
    mitTick((k, d, w) => {
      const memos = w.daten("memos") || [];
      const f = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      k.innerHTML = `<div style="width:300px"><h3>Sprachnotiz</h3>
        <div class="zeile" style="justify-content:center"><button class="knopf ${rec ? "an" : ""}" id="rec" style="padding:10px 18px">${rec ? "■ Stopp · " + dauer(Date.now() - recStart) : "● Aufnehmen"}</button></div>
        <div class="liste">${memos.map((m) => `<div class="eintrag"><span style="flex:1">${f.format(new Date(m.mtime))}</span><span class="leise">${Math.round(m.size / 1024)} KB</span><button class="knopf" data-play="${w.esc(m.path)}">▶</button><button class="knopf" data-weg="${w.esc(m.path)}">✕</button></div>`).join("") || '<p class="leise">Noch keine Notizen.</p>'}</div>
        <div class="zeile" style="justify-content:flex-end"><button class="knopf" id="ordner">Ordner</button></div></div>`;
      k.querySelector("#rec").onclick = async () => {
        if (rec) {
          rec.stop();
          return;
        }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const teile = [];
          rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
          rec.ondataavailable = (e) => teile.push(e.data);
          rec.onstop = async () => {
            stream.getTracks().forEach((t) => t.stop());
            const buf = await new Blob(teile, { type: "audio/webm" }).arrayBuffer();
            let bin = "";
            const b = new Uint8Array(buf);
            for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
            rec = null;
            await w.aktion("save", btoa(bin));
          };
          rec.start();
          recStart = Date.now();
        } catch (e) {
          rec = null;
          alert("Mikrofon nicht verfügbar: " + e.message);
        }
      };
      k.querySelectorAll("[data-play]").forEach((b) => (b.onclick = () => w.aktion("open", b.dataset.play)));
      k.querySelectorAll("[data-weg]").forEach((b) => (b.onclick = () => w.aktion("delete", b.dataset.weg)));
      k.querySelector("#ordner").onclick = () => w.aktion("folder");
    }),
    { keys: ["memos"] },
  );

  // ---------- Ablage ----------
  A.add(
    "fileShelf",
    ohneTick((k, d, w) => {
      const list = w.daten("shelf") || [];
      k.innerHTML = `<div style="width:320px"><h3>Ablage</h3>
        <div id="zone" style="border:1.5px dashed var(--kante);border-radius:10px;padding:10px;min-height:70px">${
          list.map((f) => `<div class="eintrag" draggable="true" data-pfad="${w.esc(f.path)}" title="${w.esc(f.path)}">${f.icon ? `<img src="${f.icon}" style="width:22px;height:22px">` : ""}<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${w.esc(f.name)}</span><button class="knopf" data-zeig="${w.esc(f.path)}" title="Im Ordner zeigen">📁</button><button class="knopf" data-weg="${w.esc(f.path)}">✕</button></div>`).join("") ||
          '<p class="leise" style="text-align:center;margin:14px 0">Dateien hierher ziehen.<br>Später einfach wieder herausziehen.</p>'
        }</div>${list.length ? '<div class="zeile" style="justify-content:flex-end"><button class="knopf" id="leeren">Leeren</button></div>' : ""}</div>`;
      const zone = k.querySelector("#zone");
      zone.ondragover = (e) => (e.preventDefault(), (zone.style.borderColor = "var(--lila)"));
      zone.ondragleave = () => (zone.style.borderColor = "");
      zone.ondrop = (e) => {
        e.preventDefault();
        zone.style.borderColor = "";
        const files = [...e.dataTransfer.files].map((f) => w.api.pathForFile(f)).filter(Boolean);
        if (files.length) w.aktion("add", files);
      };
      k.querySelectorAll("[data-pfad]").forEach((el) => {
        el.ondragstart = (e) => {
          e.preventDefault();
          w.api.invoke("shelf-drag", el.dataset.pfad);
        };
        el.ondblclick = () => w.aktion("open", el.dataset.pfad);
      });
      k.querySelectorAll("[data-zeig]").forEach((b) => (b.onclick = () => w.aktion("show", b.dataset.zeig)));
      k.querySelectorAll("[data-weg]").forEach((b) => (b.onclick = () => w.aktion("remove", b.dataset.weg)));
      const l = k.querySelector("#leeren");
      if (l) l.onclick = () => w.aktion("clear");
    }),
    { keys: ["shelf"] },
  );
})();

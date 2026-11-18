// Stufe 3: Zeit & Produktivität – Darstellung in der Leiste.
(() => {
  const W = OXPWidgets;
  const I = window.OXPIcons;
  const svg = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
  const two = (n) => String(n).padStart(2, "0");
  const dauer = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600);
    return h ? `${h}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}` : `${two(Math.floor(s / 60))}:${two(s % 60)}`;
  };
  window.OXPdauer = dauer;
  const stdMin = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)} Std. ${Math.round((sec % 3600) / 60)} Min.` : `${Math.round(sec / 60)} Min.`);
  window.OXPstdMin = stdMin;
  const zeitFmt = (tz) => new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  const stadt = (tz) => (tz === "UTC" ? "UTC" : tz.split("/").pop().replace(/_/g, " "));
  const Z = {
    todo: svg(`<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>`),
    note: svg(`<path d="M5 4h10l4 4v12H5z"/><path d="M14 4v5h5M8 13h8M8 17h5"/>`),
    tomato: svg(`<circle cx="12" cy="13" r="7"/><path d="M12 6V3M9 5l3 1 3-1"/>`),
    hourglass: svg(`<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9"/>`),
    stop: svg(`<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M10 2h4"/>`),
    calc: svg(`<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 18h.01M12 18h4"/>`),
    eye: svg(`<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`),
    mic: svg(`<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>`),
    tray: svg(`<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 2h6l1-2h5"/>`),
    globe: svg(`<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>`),
    cal: svg(`<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>`),
  };

  // ---------- Uhren ----------
  W.add("flipClock", {
    keys: ["tick"],
    render(el, c) {
      const d = new Date();
      const z = two(d.getHours()) + two(d.getMinutes()) + (c.option("sekunden", false) ? two(d.getSeconds()) : "");
      el.innerHTML = `<span class="flip">${[...z].map((c, i) => `${i === 2 || i === 4 ? '<span class="flip-dp">:</span>' : ""}<span class="flip-z">${c}</span>`).join("")}</span>`;
      el.dataset.tip = d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
    },
    click: (el, c) => c.api.invoke("keys", "notifications"),
  });
  W.add("analogClock", {
    keys: ["tick"],
    render(el, c) {
      const d = new Date();
      const s = d.getSeconds(), m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
      const zeiger = (deg, len, cls) => `<line x1="16" y1="16" x2="${16 + len * Math.sin((deg * Math.PI) / 180)}" y2="${16 - len * Math.cos((deg * Math.PI) / 180)}" class="${cls}"/>`;
      el.innerHTML = `<svg class="analog" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14.5" class="ziffernblatt"/>${[0, 90, 180, 270]
        .map((g) => `<line x1="${16 + 11.5 * Math.sin((g * Math.PI) / 180)}" y1="${16 - 11.5 * Math.cos((g * Math.PI) / 180)}" x2="${16 + 13.5 * Math.sin((g * Math.PI) / 180)}" y2="${16 - 13.5 * Math.cos((g * Math.PI) / 180)}" class="strich"/>`)
        .join("")}${zeiger(h * 30, 7.5, "std")}${zeiger(m * 6, 11, "min")}${c.option("sekunden", true) ? zeiger(s * 6, 12, "sek") : ""}<circle cx="16" cy="16" r="1.4" class="mitte"/></svg>`;
      el.dataset.tip = d.toLocaleTimeString("de-DE");
    },
    click: (el, c) => c.api.invoke("keys", "notifications"),
  });
  W.add("worldClocks", {
    keys: ["clocks", "tick"],
    render(el, c) {
      const z = (c.daten("clocks") || []).slice(0, c.option("anzahl", 3));
      if (!z.length) {
        el.innerHTML = `${Z.globe}<span class="klein">Weltuhren</span>`;
        return;
      }
      el.innerHTML = z.map((tz) => `<div class="stack"><span class="klein">${c.esc(stadt(tz))}</span><span class="gross">${zeitFmt(tz).format(new Date())}</span></div>`).join('<span class="mini-sep"></span>');
      el.dataset.tip = "Weltuhren · Klick = Städte bearbeiten";
    },
  });

  // ---------- Kalender-Widgets ----------
  const amTag = (events, d) => {
    const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const b = a + 864e5;
    return events.filter((e) => new Date(e.start).getTime() < b && new Date(e.end || e.start).getTime() >= a);
  };
  window.OXPamTag = amTag;
  W.add("weekStrip", {
    keys: ["calendar"],
    render(el, c) {
      const ev = c.daten("calendar")?.events || [];
      const heute = new Date();
      let html = '<span class="woche">';
      for (let i = 0; i < 7; i++) {
        const d = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() + i);
        const n = amTag(ev, d).length;
        html += `<span class="tag${i === 0 ? " heute" : ""}"><small>${d.toLocaleDateString("de-DE", { weekday: "short" }).slice(0, 2)}</small><b>${d.getDate()}</b><i>${"•".repeat(Math.min(n, 3))}</i></span>`;
      }
      el.innerHTML = html + "</span>";
      el.dataset.tip = "Die nächsten 7 Tage";
    },
  });
  W.add("dayTimeline", {
    keys: ["calendar", "tick"],
    render(el, c) {
      const ev = amTag(c.daten("calendar")?.events || [], new Date()).filter((e) => !e.allDay);
      const jetzt = new Date();
      const von = c.option("von", 7), bis = Math.max(c.option("bis", 23), c.option("von", 7) + 1);
      const pos = (d) => Math.max(0, Math.min(100, ((d.getHours() + d.getMinutes() / 60 - von) / (bis - von)) * 100));
      const naechster = ev.find((e) => new Date(e.end) > jetzt);
      el.innerHTML = `<div class="zeitstrahl"><div class="strahl">${ev
        .map((e) => {
          const a = pos(new Date(e.start)), b = pos(new Date(e.end));
          return `<i class="${e.source === "Streamplan" ? "stream" : ""}" style="left:${a}%;width:${Math.max(1.5, b - a)}%"></i>`;
        })
        .join("")}<b style="left:${pos(jetzt)}%"></b></div><span class="klein">${
        naechster ? c.esc((new Date(naechster.start) <= jetzt ? "jetzt: " : new Date(naechster.start).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " ") + naechster.title).slice(0, 40) : "heute keine Termine mehr"
      }</span></div>`;
      el.dataset.tip = `Heute von ${von} bis ${bis} Uhr`;
    },
  });
  W.add("calendar", {
    keys: ["calendar"],
    render(el, c) {
      const ev = c.daten("calendar")?.events || [];
      const jetzt = new Date();
      const n = ev.find((e) => new Date(e.end || e.start) > jetzt);
      el.innerHTML = `${Z.cal}${
        n
          ? `<div class="stack"><span class="klein">${new Date(n.start).toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</span><span class="gross">${c.esc(n.title.slice(0, 26))}</span></div>`
          : '<span class="klein">Kalender</span>'
      }`;
      el.dataset.tip = "Kalender";
    },
  });

  // ---------- Aufgaben, Notizen ----------
  W.add("todos", {
    keys: ["todos"],
    render(el, c) {
      const t = c.daten("todos") || [];
      const offen = t.filter((x) => !x.done);
      el.innerHTML = `${Z.todo}${offen.length ? `<div class="stack"><span class="klein">${offen.length} offen</span><span class="gross">${c.esc(offen[0].text.slice(0, 24))}</span></div>` : '<span class="klein">Aufgaben</span>'}`;
      el.dataset.tip = "Aufgaben";
    },
  });
  W.add("notes", {
    keys: ["notes"],
    render(el, c) {
      const t = (c.daten("notes")?.text || "").trim().split("\n")[0];
      el.innerHTML = `${Z.note}<span class="klein">${t ? c.esc(t.slice(0, 22)) : "Notizen"}</span>`;
      el.dataset.tip = "Notizen";
    },
  });

  // ---------- Pomodoro, Timer, Stoppuhr ----------
  W.add("pomodoro", {
    keys: ["timers", "tick"],
    render(el, c) {
      const p = c.daten("timers")?.pomodoro;
      if (!p) return false;
      const rest = p.running ? p.endAt - Date.now() : p.remaining;
      el.innerHTML = `${Z.tomato}<div class="stack"><span class="klein">${p.phase === "fokus" ? "Fokus" : "Pause"}${p.rounds ? " · " + p.rounds : ""}</span><span class="gross">${dauer(rest)}</span></div>`;
      el.classList.toggle("an", p.running);
      el.dataset.tip = "Pomodoro · Rechtsklick = Start/Pause";
    },
    context: (el, c) => c.aktion(c.daten("timers")?.pomodoro?.running ? "pause" : "start"),
  });
  W.add("timer", {
    keys: ["timers", "tick"],
    render(el, c) {
      const t = c.daten("timers")?.timer;
      if (!t) return false;
      el.innerHTML = `${Z.hourglass}<span class="gross">${dauer(t.running ? t.endAt - Date.now() : t.remaining)}</span>`;
      el.classList.toggle("an", t.running);
      el.dataset.tip = "Timer · Rechtsklick = Start/Pause";
    },
    context: (el, c) => c.aktion(c.daten("timers")?.timer?.running ? "pause" : "start"),
  });
  W.add("stopwatch", {
    keys: ["timers", "tick"],
    render(el, c) {
      const s = c.daten("timers")?.stopwatch;
      if (!s) return false;
      el.innerHTML = `${Z.stop}<span class="gross">${dauer(s.elapsed + (s.running ? Date.now() - s.startAt : 0))}</span>`;
      el.classList.toggle("an", s.running);
      el.dataset.tip = "Stoppuhr · Rechtsklick = Start/Pause";
    },
    context: (el, c) => c.aktion(c.daten("timers")?.stopwatch?.running ? "pause" : "start"),
  });

  // ---------- Rechner, Bildschirmzeit, Sprachnotiz, Ablage ----------
  W.add("calculator", { render: (el) => ((el.innerHTML = Z.calc), (el.dataset.tip = "Rechner")) });
  W.add("screenTime", {
    keys: ["screen"],
    render(el, c) {
      const s = c.daten("screen");
      el.innerHTML = `${Z.eye}<div class="stack"><span class="klein">Bildschirmzeit</span><span class="gross">${s ? stdMin(s.total) : "–"}</span></div>`;
      el.dataset.tip = s?.apps?.[0] ? `Am meisten: ${s.apps[0].name}` : "Bildschirmzeit heute";
    },
  });
  W.add("voiceMemo", {
    keys: ["memos"],
    render(el, c) {
      el.innerHTML = `${Z.mic}<span class="klein">Sprachnotiz</span>`;
      el.dataset.tip = "Sprachnotiz aufnehmen";
    },
  });
  W.add("fileShelf", {
    keys: ["shelf"],
    render(el, c) {
      const n = (c.daten("shelf") || []).length;
      el.innerHTML = `${Z.tray}<span class="klein">${n ? n + " Dateien" : "Ablage"}</span>`;
      el.dataset.tip = "Ablage · Dateien hierher ziehen";
      // Dateien direkt auf das Widget fallen lassen
      if (!el.dataset.drop) {
        el.dataset.drop = 1;
        el.addEventListener("drop", (e) => {
          const files = [...e.dataTransfer.files].map((f) => c.api.pathForFile(f)).filter(Boolean);
          if (files.length) {
            e.preventDefault();
            e.stopPropagation();
            c.aktion("add", files);
          }
        });
      }
    },
  });

  // ---------- Ton bei Timer-Ende ----------
  let letzterAlarm = 0;
  W.add("_alarm", { keys: ["alarm"] });
  const alt = W.datenDa.bind(W);
  W.datenDa = (key) => {
    alt(key);
    const a = window.OXPState.widgets.alarm;
    if (key === "alarm" && a && a.at !== letzterAlarm) {
      letzterAlarm = a.at;
      try {
        const ac = new AudioContext();
        [0, 0.25, 0.5].forEach((t) => {
          const o = ac.createOscillator(), g = ac.createGain();
          o.frequency.value = 880;
          g.gain.setValueAtTime(0.15, ac.currentTime + t);
          g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.2);
          o.connect(g).connect(ac.destination);
          o.start(ac.currentTime + t);
          o.stop(ac.currentTime + t + 0.22);
        });
      } catch {}
    }
  };
  void I;
})();

// Suche wie in Windows 11: links Treffer nach Art sortiert, rechts Details mit Aktionen.
(() => {
  const symbolCache = {};
  const fmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const svg = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
  const ICON = {
    lupe: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>'),
    setting: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
    web: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'),
    ordner: svg('<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    datei: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'),
    start: svg('<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>'),
    oeffnen: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
    admin: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'),
    pin: svg('<path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v8"/>'),
    kopie: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  };

  const punkte = (name, s) => {
    const n = name.toLowerCase();
    if (n === s) return 100;
    if (n.startsWith(s)) return 90;
    const worte = n.split(/[\s\-_.()]+/);
    if (worte.some((t) => t.startsWith(s))) return 75;
    // Anfangsbuchstaben („st“ → Snipping Tool)
    if (s.length >= 2 && worte.map((t) => t[0] || "").join("").startsWith(s)) return 60;
    if (n.includes(s)) return 45;
    return 0;
  };

  OXPAnsichten.add("suche", (karte, d, w) => {
    const apps = d.apps || [];
    const settings = d.settings || [];
    karte.innerHTML = `<div class="suche">
      <div class="such-kopf">${ICON.lupe}<input id="q" placeholder="Hier eingeben, um zu suchen" autocomplete="off" spellcheck="false"></div>
      <div class="such-koerper"><div class="such-liste" id="treffer"></div><div class="such-detail" id="detail"></div></div></div>`;
    const q = karte.querySelector("#q");
    const box = karte.querySelector("#treffer");
    const detail = karte.querySelector("#detail");
    let liste = [];
    let auswahl = 0;
    let dateien = [];
    let dateiSuche = "";
    let dateiTimer = null;

    const symbolSchluessel = (t) => (t.typ === "app" ? "app:" + t.wert : t.typ === "datei" || t.typ === "ordner" ? t.wert : null);
    const symbolHtml = (t, gross) => {
      const k = symbolSchluessel(t);
      const url = k && symbolCache[k];
      if (url) return `<img src="${url}" class="${gross ? "gross" : ""}" alt="">`;
      const ersatz = { app: ICON.start, setting: ICON.setting, web: ICON.web, ordner: ICON.ordner, datei: ICON.datei, windows: ICON.start };
      return `<span class="ersatz ${gross ? "gross" : ""}">${ersatz[t.typ] || ICON.datei}</span>`;
    };
    async function symboleLaden() {
      const fehlend = liste.map(symbolSchluessel).filter((k) => k && !(k in symbolCache));
      if (!fehlend.length) return;
      fehlend.forEach((k) => (symbolCache[k] = null));
      const neu = await w.aktion("icons", fehlend);
      Object.assign(symbolCache, neu || {});
      zeichnen(false);
    }

    function treffer() {
      const s = q.value.trim().toLowerCase();
      const out = [];
      if (!s) {
        // ohne Eingabe: Apps zum schnellen Start (wie „Top-Apps“ in Windows)
        return apps.slice().sort((a, b) => a.name.localeCompare(b.name, "de")).slice(0, 0);
      }
      const a = apps
        .map((x) => ({ x, p: punkte(x.name, s) }))
        .filter((y) => y.p)
        .sort((m, n) => n.p - m.p || m.x.name.length - n.x.name.length)
        .slice(0, 8)
        .map(({ x, p }) => ({ typ: "app", gruppe: "Apps", titel: x.name, info: "App", wert: x.appId, p }));
      const e = settings
        .filter((x) => x.name.toLowerCase().includes(s) || x.worte.split(" ").some((t) => t.startsWith(s)))
        .slice(0, 4)
        .map((x) => ({ typ: "setting", gruppe: "Einstellungen", titel: x.name, info: "Systemeinstellung", wert: x.ziel, p: punkte(x.name, s) || 50 }));
      const f = dateien.filter((x) => !x.folder).slice(0, 6).map((x) => ({ typ: "datei", gruppe: "Dateien", titel: x.name, info: x.type || "Datei", wert: x.path, zeit: x.modified }));
      const o = dateien.filter((x) => x.folder).slice(0, 4).map((x) => ({ typ: "ordner", gruppe: "Ordner", titel: x.name, info: "Ordner", wert: x.path, zeit: x.modified }));
      // beste Übereinstimmung: höchster App-/Einstellungs-Treffer, sonst erste Datei
      const kandidaten = [...a, ...e].sort((m, n) => n.p - m.p);
      const beste = kandidaten[0] || f[0] || o[0];
      if (beste) out.push({ ...beste, gruppe: "Beste Übereinstimmung", beste: true });
      const ohne = (l) => l.filter((x) => x !== beste);
      out.push(...ohne(a), ...ohne(e), ...ohne(f), ...ohne(o));
      out.push({ typ: "web", gruppe: "Im Web suchen", titel: q.value.trim(), info: "Websuche", wert: q.value.trim() });
      return out;
    }

    function zeichnen(neuBerechnen = true) {
      if (neuBerechnen) liste = treffer();
      auswahl = Math.max(0, Math.min(auswahl, liste.length - 1));
      if (!q.value.trim()) {
        box.innerHTML = `<div class="such-leer">${ICON.lupe}<p>Apps, Einstellungen, Dateien und das Web durchsuchen.</p><button class="knopf" id="startmenue">Windows-Startmenü öffnen</button></div>`;
        box.querySelector("#startmenue").onclick = () => (w.aktion("windows"), w.schliessen());
        detail.innerHTML = "";
        detail.hidden = true;
        w.neuZeichnen();
        return;
      }
      detail.hidden = false;
      let html = "";
      let gruppe = "";
      liste.forEach((t, i) => {
        if (t.gruppe !== gruppe) {
          gruppe = t.gruppe;
          html += `<div class="such-gruppe">${gruppe}</div>`;
        }
        const titel = t.typ === "web" ? `${w.esc(t.titel)} <span class="leise">– Webergebnisse anzeigen</span>` : w.esc(t.titel);
        html += `<button class="such-treffer ${t.beste ? "beste" : ""} ${i === auswahl ? "an" : ""}" data-i="${i}">${symbolHtml(t, t.beste)}<span class="such-text"><b>${titel}</b><small>${w.esc(t.info)}${t.typ === "datei" || t.typ === "ordner" ? " · " + w.esc(t.wert.replace(/\\[^\\]*$/, "")) : ""}</small></span></button>`;
      });
      if (dateiSuche === "laeuft") html += `<div class="such-gruppe leise">Dateien werden gesucht …</div>`;
      box.innerHTML = html;
      box.querySelectorAll("[data-i]").forEach((b) => {
        b.onclick = () => los(+b.dataset.i);
        b.onmouseenter = () => {
          if (auswahl === +b.dataset.i) return;
          auswahl = +b.dataset.i;
          box.querySelectorAll(".such-treffer.an").forEach((x) => x.classList.remove("an"));
          b.classList.add("an");
          detailZeichnen();
        };
      });
      detailZeichnen();
      w.neuZeichnen();
      symboleLaden();
    }

    function detailZeichnen() {
      const t = liste[auswahl];
      if (!t) return (detail.innerHTML = "");
      const aktionen = [];
      if (t.typ === "app") {
        aktionen.push(["oeffnen", "Öffnen", ICON.oeffnen], ["admin", "Als Administrator ausführen", ICON.admin], ["pin", "An Dock anheften", ICON.pin]);
      } else if (t.typ === "datei" || t.typ === "ordner") {
        aktionen.push(["oeffnen", "Öffnen", ICON.oeffnen], ["ort", "Dateispeicherort öffnen", ICON.ordner], ["kopie", "Pfad kopieren", ICON.kopie]);
      } else if (t.typ === "setting") aktionen.push(["oeffnen", "Öffnen", ICON.oeffnen]);
      else if (t.typ === "web") aktionen.push(["oeffnen", "Im Browser öffnen", ICON.oeffnen]);
      detail.innerHTML = `<div class="detail-kopf">${symbolHtml(t, true)}<b>${w.esc(t.typ === "web" ? t.titel + " – Webergebnisse" : t.titel)}</b><span class="leise">${w.esc(t.info)}</span>
          ${t.zeit ? `<span class="leise klein">Geändert: ${fmt.format(new Date(t.zeit))}</span>` : ""}
          ${t.typ === "datei" || t.typ === "ordner" ? `<span class="leise klein pfad">${w.esc(t.wert)}</span>` : ""}</div>
        <div class="detail-aktionen">${aktionen.map(([k, n, ic]) => `<button data-a="${k}">${ic}<span>${n}</span></button>`).join("")}</div>`;
      detail.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => aktion(t, b.dataset.a)));
    }

    function aktion(t, a) {
      if (a === "oeffnen") return los(liste.indexOf(t));
      if (a === "admin") w.aktion("app-admin", t.wert);
      if (a === "pin") w.aktion("app-pin", { appId: t.wert, name: t.titel });
      if (a === "ort") w.aktion("file-folder", t.wert);
      if (a === "kopie") navigator.clipboard?.writeText(t.wert).catch(() => {});
      if (a !== "kopie") w.schliessen();
    }

    function los(i) {
      const t = liste[i];
      if (!t) return;
      const art = { app: "app", setting: "setting", web: "web", datei: "file", ordner: "file" }[t.typ];
      w.aktion(art, t.wert);
      w.schliessen();
    }

    q.oninput = () => {
      auswahl = 0;
      // Dateien erst nach einer kleinen Tipp-Pause im Windows-Suchindex nachschlagen
      clearTimeout(dateiTimer);
      const text = q.value.trim();
      dateien = [];
      dateiSuche = text.length >= 2 ? "laeuft" : "";
      zeichnen();
      if (text.length < 2) return;
      dateiTimer = setTimeout(async () => {
        const res = await w.aktion("files", text);
        if (q.value.trim() !== text) return;
        dateien = Array.isArray(res) ? res : [];
        dateiSuche = "fertig";
        zeichnen();
      }, 220);
    };
    q.onkeydown = (e) => {
      if (e.key === "ArrowDown") (e.preventDefault(), (auswahl = Math.min(liste.length - 1, auswahl + 1)), zeichnen(false));
      if (e.key === "ArrowUp") (e.preventDefault(), (auswahl = Math.max(0, auswahl - 1)), zeichnen(false));
      if (e.key === "Enter") los(auswahl);
    };
    zeichnen();
    setTimeout(() => q.focus(), 30);
  });
})();

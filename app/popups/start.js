// OXP-Startmenü: Suche oben, Reiter „Angeheftet“ (mit „Zuletzt verwendet“) und „Alle Apps“ (A–Z mit
// Buchstaben-Sprung wie in früheren Windows-Startmenüs), unten Konto, Schnellordner und Ein/Aus.
// Rechtsklick auf eine App: Menü im OXP-Stil (Öffnen, Als Administrator, Anheften an Start/Dock, Speicherort, Deinstallieren).
(() => {
  const svg = (p) => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  const I = {
    lupe: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>'),
    app: svg('<rect x="4" y="4" width="16" height="16" rx="3"/>'),
    oeffnen: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
    admin: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'),
    pin: svg('<path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v8"/>'),
    unpin: svg('<path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v8M4 4l16 16"/>'),
    dock: svg('<rect x="3" y="15" width="18" height="5" rx="2"/><path d="M8 11V7m4 4V5m4 6V8"/>'),
    ordner: svg('<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    weg: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    links: svg('<path d="M15 6l-6 6 6 6"/>'),
    rechts: svg('<path d="M9 6l6 6-6 6"/>'),
    dokumente: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>'),
    downloads: svg('<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>'),
    bilder: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/>'),
    explorer: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10h18"/>'),
    zahnrad: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
    power: svg('<path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>'),
    schloss: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    abmelden: svg('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10"/>'),
    mond: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
    neustart: svg('<path d="M20 11a8 8 0 1 0-2 6m2-12v6h-6"/>'),
    web: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'),
    windows: svg('<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>'),
    oxp: svg('<rect x="3" y="15" width="18" height="5" rx="2"/><circle cx="12" cy="8" r="3"/>'),
  };
  const symbole = {}; // App-Kennung → Symbol (bleibt zwischen dem Öffnen erhalten)
  let reiter = "pins";

  const punkte = (name, s) => {
    const n = name.toLowerCase();
    if (n === s) return 100;
    if (n.startsWith(s)) return 90;
    const worte = n.split(/[\s\-_.()]+/);
    if (worte.some((t) => t.startsWith(s))) return 75;
    if (s.length >= 2 && worte.map((t) => t[0] || "").join("").startsWith(s)) return 60;
    return n.includes(s) ? 45 : 0;
  };
  const buchstabe = (name) => {
    const c = name.trim().charAt(0).toLocaleUpperCase("de").normalize("NFD").charAt(0);
    return /[A-Z]/.test(c) ? c : "#";
  };

  OXPAnsichten.add("start", (k, d, w) => {
    const apps = (d.apps || []).slice().sort((a, b) => a.name.localeCompare(b.name, "de", { sensitivity: "base", numeric: true }));
    const nachId = new Map(apps.map((a) => [a.appId, a]));
    let pins = (d.pins || []).filter((id) => nachId.has(id));
    let recent = (d.recent || []).filter((id) => nachId.has(id));

    k.innerHTML = `<div class="startm">
      <label class="sm-suche">${I.lupe}<input id="q" placeholder="Apps durchsuchen" autocomplete="off" spellcheck="false"></label>
      <nav class="sm-reiter" role="tablist">
        <button role="tab" data-r="pins">Angeheftet</button><button role="tab" data-r="alle">Alle Apps</button>
      </nav>
      <div class="sm-inhalt" id="inhalt"></div>
      <footer class="sm-fuss">
        <button class="sm-konto" id="konto" title="Konto-Einstellungen"><span class="sm-avatar">${w.esc((d.benutzer || "?").charAt(0).toUpperCase())}</span><span>${w.esc(d.benutzer || "")}</span></button>
        <div class="sm-schnell">
          <button data-o="dokumente" title="Dokumente">${I.dokumente}</button>
          <button data-o="downloads" title="Downloads">${I.downloads}</button>
          <button data-o="bilder" title="Bilder">${I.bilder}</button>
          <button data-x="explorer" title="Explorer">${I.explorer}</button>
          <button data-x="einstellungen" title="Windows-Einstellungen">${I.zahnrad}</button>
          <button id="power" title="Ein/Aus">${I.power}</button>
        </div>
      </footer>
    </div>`;

    const q = k.querySelector("#q");
    const inhalt = k.querySelector("#inhalt");

    // ---------- Symbole nach und nach laden (nur was sichtbar wird) ----------
    let warteschlange = new Set();
    let ladeTimer = null;
    const sichtbar = new IntersectionObserver(
      (eintraege) => {
        for (const e of eintraege) {
          if (!e.isIntersecting) continue;
          const id = e.target.dataset.id;
          sichtbar.unobserve(e.target);
          if (id && !(id in symbole)) warteschlange.add(id);
        }
        if (warteschlange.size && !ladeTimer) ladeTimer = setTimeout(symboleLaden, 60);
      },
      { root: inhalt, rootMargin: "120px" },
    );
    async function symboleLaden() {
      ladeTimer = null;
      const ids = [...warteschlange].slice(0, 40);
      ids.forEach((id) => {
        warteschlange.delete(id);
        symbole[id] = null;
      });
      const neu = (await w.aktion("icons", ids)) || {};
      Object.assign(symbole, neu);
      if (!k.contains(inhalt)) return;
      for (const id of ids) {
        if (!neu[id]) continue;
        inhalt.querySelectorAll(`[data-id="${CSS.escape(id)}"] .sm-ico`).forEach((el) => (el.outerHTML = `<img class="sm-ico" src="${neu[id]}" alt="">`));
      }
      if (warteschlange.size) ladeTimer = setTimeout(symboleLaden, 30);
    }
    const ico = (id) => (symbole[id] ? `<img class="sm-ico" src="${symbole[id]}" alt="">` : `<span class="sm-ico leer">${I.app}</span>`);
    const beobachten = () => inhalt.querySelectorAll("[data-id]").forEach((el) => !(el.dataset.id in symbole) && sichtbar.observe(el));

    // ---------- Ansichten ----------
    function kachel(a) {
      return `<button class="sm-kachel" data-id="${w.esc(a.appId)}" title="${w.esc(a.name)}">${ico(a.appId)}<span>${w.esc(a.name)}</span></button>`;
    }
    function zeile(a, extra = "") {
      return `<button class="sm-zeile" data-id="${w.esc(a.appId)}" title="${w.esc(a.name)}">${ico(a.appId)}<span class="sm-name">${w.esc(a.name)}</span>${extra}</button>`;
    }
    function zeigePins() {
      const angeheftet = pins.map((id) => nachId.get(id));
      const zuletzt = recent.map((id) => nachId.get(id)).filter((a) => a);
      inhalt.innerHTML = `
        <div class="sm-abschnitt"><b>Angeheftet</b><span class="leise">Rechtsklick für mehr</span></div>
        ${angeheftet.length ? `<div class="sm-gitter">${angeheftet.map(kachel).join("")}</div>` : `<p class="sm-hinweis">Noch nichts angeheftet. Unter „Alle Apps“ mit Rechtsklick → „An Start anheften“.</p>`}
        ${zuletzt.length ? `<div class="sm-abschnitt"><b>Zuletzt verwendet</b></div><div class="sm-zuletzt">${zuletzt.map((a) => zeile(a)).join("")}</div>` : ""}`;
    }
    function zeigeAlle() {
      let html = "";
      let akt = "";
      for (const a of apps) {
        const b = buchstabe(a.name);
        if (b !== akt) {
          akt = b;
          html += `<button class="sm-buchstabe" data-b="${b}" title="Zu einem Buchstaben springen">${b}</button>`;
        }
        html += zeile(a);
      }
      inhalt.innerHTML = `<div class="sm-abschnitt"><b>Alle Apps</b><span class="leise">${apps.length} Apps · Buchstabe anklicken zum Springen</span></div><div class="sm-alle">${html || '<p class="sm-hinweis">Apps werden geladen …</p>'}</div>`;
    }
    // Buchstaben-Raster wie im früheren Startmenü: Klick auf einen Buchstaben-Kopf → Raster → springen
    function buchstabenRaster() {
      const da = new Set(apps.map((a) => buchstabe(a.name)));
      const alle = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
      const raster = document.createElement("div");
      raster.className = "sm-raster";
      raster.innerHTML = alle.map((b) => `<button data-sprung="${b}"${da.has(b) ? "" : " disabled"}>${b}</button>`).join("");
      inhalt.append(raster);
      inhalt.scrollTop = 0;
      raster.onclick = (e) => {
        const b = e.target.closest("[data-sprung]")?.dataset.sprung;
        raster.remove();
        if (!b) return;
        const kopf = inhalt.querySelector(`.sm-buchstabe[data-b="${CSS.escape(b)}"]`);
        // an der ersten App unter dem Buchstaben ausrichten (der Buchstaben-Kopf selbst klebt beim Scrollen oben)
        const erste = kopf?.nextElementSibling;
        if (erste) inhalt.scrollTop = erste.offsetTop - kopf.offsetHeight - 12;
      };
    }
    function zeigeSuche(text) {
      const s = text.trim().toLowerCase();
      const treffer = apps
        .map((a) => ({ a, p: punkte(a.name, s) }))
        .filter((x) => x.p)
        .sort((m, n) => n.p - m.p || m.a.name.length - n.a.name.length)
        .slice(0, 12)
        .map((x) => x.a);
      inhalt.innerHTML = `<div class="sm-abschnitt"><b>${treffer.length ? "Apps" : "Keine passende App"}</b></div>
        <div class="sm-treffer">${treffer.map((a, i) => zeile(a, i === 0 ? '<span class="sm-enter">Enter</span>' : "")).join("")}
        <button class="sm-zeile" id="websuche"><span class="sm-ico leer">${I.web}</span><span class="sm-name">„${w.esc(text.trim())}“ im Web suchen</span></button></div>`;
      inhalt.querySelector("#websuche").onclick = () => (w.aktion("web", text), w.schliessen());
      return treffer;
    }
    let suchTreffer = [];
    function zeichnen() {
      k.querySelectorAll(".sm-reiter [data-r]").forEach((b) => b.classList.toggle("an", b.dataset.r === reiter && !q.value.trim()));
      if (q.value.trim()) suchTreffer = zeigeSuche(q.value);
      else if (reiter === "alle") zeigeAlle();
      else zeigePins();
      inhalt.scrollTop = 0;
      beobachten();
    }

    // ---------- Bedienung ----------
    const starte = (id) => (w.aktion("launch", id), w.schliessen());
    k.querySelector(".sm-reiter").onclick = (e) => {
      const r = e.target.closest("[data-r]")?.dataset.r;
      if (!r) return;
      reiter = r;
      q.value = "";
      zeichnen();
    };
    inhalt.onclick = (e) => {
      const r = e.target.closest("[data-r]")?.dataset.r;
      if (r) {
        reiter = r;
        return zeichnen();
      }
      if (e.target.closest(".sm-buchstabe")) return buchstabenRaster();
      const id = e.target.closest("[data-id]")?.dataset.id;
      if (id) starte(id);
    };
    inhalt.oncontextmenu = (e) => {
      const el = e.target.closest("[data-id]");
      if (!el) return;
      const a = nachId.get(el.dataset.id);
      if (!a) return;
      el.classList.add("offen");
      const angeheftet = pins.includes(a.appId);
      const pos = pins.indexOf(a.appId);
      OXPMenue.zeigen(e, [
        { titel: a.name },
        { text: "Öffnen", icon: I.oeffnen, tun: () => starte(a.appId) },
        { text: "Als Administrator ausführen", icon: I.admin, tun: () => (w.aktion("admin", a.appId), w.schliessen()) },
        { trenner: true },
        angeheftet
          ? { text: "Von Start lösen", icon: I.unpin, tun: async () => ((pins = (await w.aktion("unpin-start", a.appId)) || pins.filter((x) => x !== a.appId)), zeichnen()) }
          : { text: "An Start anheften", icon: I.pin, tun: async () => ((pins = (await w.aktion("pin-start", a.appId)) || [...pins, a.appId]), zeichnen()) },
        angeheftet && pos > 0 && reiter === "pins" && !q.value.trim()
          ? { text: "Nach vorne", icon: I.links, tun: async () => ((pins = (await w.aktion("move-start", { id: a.appId, to: 0 })) || pins), zeichnen()) }
          : null,
        { text: "Am Dock anheften", icon: I.dock, tun: () => w.aktion("pin-dock", { appId: a.appId, name: a.name }) },
        recent.includes(a.appId) && reiter === "pins" && !q.value.trim()
          ? { text: "Aus „Zuletzt verwendet“ entfernen", icon: I.weg, tun: async () => ((recent = (await w.aktion("forget-recent", a.appId)) || recent), zeichnen()) }
          : null,
        { trenner: true },
        { text: "Dateispeicherort öffnen", icon: I.ordner, tun: () => (w.aktion("folder", a.appId), w.schliessen()) },
        { text: "Deinstallieren …", icon: I.weg, gefahr: true, tun: () => (w.aktion("uninstall"), w.schliessen()) },
      ]);
    };
    q.oninput = zeichnen;
    q.onkeydown = (e) => {
      if (e.key === "Enter" && q.value.trim() && suchTreffer[0]) starte(suchTreffer[0].appId);
    };
    k.querySelector("#konto").onclick = () => (w.aktion("konto"), w.schliessen());
    k.querySelectorAll("[data-o]").forEach((b) => (b.onclick = () => (w.aktion("ordner", b.dataset.o), w.schliessen())));
    k.querySelectorAll("[data-x]").forEach((b) => (b.onclick = () => (w.aktion(b.dataset.x), w.schliessen())));
    k.querySelector("#power").onclick = (e) => {
      const power = (v) => () => (w.aktion("power", v), w.schliessen());
      OXPMenue.zeigen(e, [
        { text: "Sperren", icon: I.schloss, tun: power("lock") },
        { text: "Abmelden", icon: I.abmelden, tun: power("signout") },
        { text: "Energie sparen", icon: I.mond, tun: power("sleep") },
        { trenner: true },
        { text: "Neu starten", icon: I.neustart, tun: power("restart") },
        { text: "Herunterfahren", icon: I.power, gefahr: true, tun: power("shutdown") },
        { trenner: true },
        { text: "Windows-Startmenü öffnen", icon: I.windows, tun: () => (w.schliessen(), w.aktion("windows-start")) },
        { text: "Dock-Einstellungen", icon: I.oxp, tun: () => (w.aktion("dock-einstellungen"), w.schliessen()) },
      ]);
    };

    zeichnen();
    // sofort lostippen können, wie im Windows-Startmenü
    setTimeout(() => q.focus(), 30);
  });
})();

// Stufe 2: System & Windows – Fenster über der Leiste.
(() => {
  const A = OXPAnsichten;
  const bytes = (b) => {
    if (b == null) return "–";
    const u = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    while (b >= 1024 && i < u.length - 1) {
      b /= 1024;
      i++;
    }
    return (b >= 100 || i === 0 ? Math.round(b) : b.toFixed(1)) + " " + u[i];
  };
  // Regler: während des Ziehens nur gelegentlich senden
  function regler(el, fn) {
    let t = null;
    el.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => fn(+el.value), 40);
    });
  }

  // ---------- Lautstärke ----------
  A.add(
    "audio",
    (k, d, w) => {
      const a = w.daten("audio") || {};
      const dev = d.devices || { output: [], input: [] };
      k.innerHTML = `<div style="width:300px">
        <h3>Lautstärke</h3>
        <div class="zeile"><button class="knopf ${a.muted ? "an" : ""}" id="stumm">${a.muted ? "Stumm" : "Ton an"}</button>
          <input type="range" id="vol" min="0" max="100" value="${a.volume ?? 50}" class="fuell"><b style="width:38px;text-align:right">${a.volume ?? "–"}%</b></div>
        ${a.mic != null ? `<div class="zeile"><button class="knopf ${a.micMuted ? "an" : ""}" id="micstumm">${a.micMuted ? "Mikro aus" : "Mikro an"}</button>
          <input type="range" id="mic" min="0" max="100" value="${a.mic}" class="fuell"><b style="width:38px;text-align:right">${a.mic}%</b></div>` : ""}
        <h3 style="margin-top:10px">Ausgabegerät</h3>
        <div class="liste">${dev.output.map((x) => `<button class="eintrag ${x.isDefault ? "an" : ""}" data-dev="${w.esc(x.id)}">${x.isDefault ? "● " : ""}${w.esc(x.name)}</button>`).join("")}</div>
        ${dev.input.length > 1 ? `<h3 style="margin-top:10px">Mikrofon</h3><div class="liste">${dev.input.map((x) => `<button class="eintrag ${x.isDefault ? "an" : ""}" data-dev="${w.esc(x.id)}">${x.isDefault ? "● " : ""}${w.esc(x.name)}</button>`).join("")}</div>` : ""}
        <div class="zeile" style="justify-content:flex-end"><button class="knopf" id="einst">Sound-Einstellungen</button></div></div>`;
      regler(k.querySelector("#vol"), (v) => w.aktion("volume", v));
      const m = k.querySelector("#mic");
      if (m) regler(m, (v) => w.aktion("micVolume", v));
      k.querySelector("#stumm").onclick = () => w.aktion("mute", !a.muted);
      const ms = k.querySelector("#micstumm");
      if (ms) ms.onclick = () => w.aktion("micMute", !a.micMuted);
      k.querySelector("#einst").onclick = () => (w.aktion("settings"), w.schliessen());
      k.querySelectorAll("[data-dev]").forEach((b) => (b.onclick = async () => (await w.aktion("device", b.dataset.dev), w.neuLaden())));
    },
    { keys: ["audio"] },
  );

  // ---------- Helligkeit ----------
  A.add(
    "brightness",
    (k, d, w) => {
      const b = w.daten("brightness") || {};
      k.innerHTML =
        b.value == null
          ? `<div style="width:260px"><h3>Helligkeit</h3><p class="leise">Dieser Bildschirm lässt sich von Windows aus nicht dimmen (kein DDC/CI).</p></div>`
          : `<div style="width:280px"><h3>Helligkeit${b.source === "ddc" ? " (Monitor)" : ""}</h3><div class="zeile"><span>☀</span><input type="range" id="hell" min="0" max="100" value="${b.value}" class="fuell"><b style="width:38px;text-align:right">${b.value}%</b></div></div>`;
      const r = k.querySelector("#hell");
      if (r) regler(r, (v) => w.aktion("set", v));
    },
    { keys: ["brightness"] },
  );

  // ---------- Schnellschalter ----------
  A.add(
    "toggles",
    (k, d, w) => {
      const r = w.daten("radios") || [];
      const a = w.daten("audio") || {};
      const radio = (kind, label) => {
        const x = r.find((y) => y.kind === kind);
        if (!x) return "";
        return `<button class="kachel ${x.on ? "an" : ""}" data-radio="${kind}" data-on="${x.on ? 1 : 0}"><b>${label}</b><small>${x.on ? "an" : "aus"}</small></button>`;
      };
      k.innerHTML = `<div style="width:330px"><h3>Schnellschalter</h3><div class="kacheln">
        ${radio("WiFi", "WLAN")}${radio("Bluetooth", "Bluetooth")}${radio("MobileBroadband", "Mobilfunk")}
        ${a.mic != null ? `<button class="kachel ${a.micMuted ? "an" : ""}" data-mic="${a.micMuted ? 0 : 1}"><b>Mikro stumm</b><small>${a.micMuted ? "an" : "aus"}</small></button>` : ""}
        <button class="kachel" data-set="ms-settings:nightlight"><b>Nachtlicht</b><small>Einstellungen</small></button>
        <button class="kachel" data-set="ms-settings:batterysaver"><b>Energiesparen</b><small>Einstellungen</small></button>
        <button class="kachel" data-act="project"><b>Projizieren</b><small>Win+P</small></button>
        <button class="kachel" data-act="cast"><b>Übertragen</b><small>Win+K</small></button>
        <button class="kachel" data-act="lock"><b>Sperren</b><small>Win+L</small></button>
      </div></div>`;
      k.querySelectorAll("[data-radio]").forEach((b) => (b.onclick = () => w.aktion("radio", { kind: b.dataset.radio, on: b.dataset.on !== "1" })));
      k.querySelectorAll("[data-mic]").forEach((b) => (b.onclick = () => w.aktion("mic", b.dataset.mic === "1")));
      k.querySelectorAll("[data-set]").forEach((b) => (b.onclick = () => (w.aktion("settings", b.dataset.set), w.schliessen())));
      k.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => (w.schliessen(), w.aktion(b.dataset.act))));
    },
    { keys: ["radios", "audio"] },
  );

  // ---------- Prozesse ----------
  const prozesse = (art) => (k, d, w) => {
    const p = w.daten("procs") || {};
    const list = (art === "cpu" ? p.cpu : p.ram) || [];
    k.innerHTML = `<div style="width:340px"><h3>${art === "cpu" ? "Meiste Prozessorlast" : "Meister Arbeitsspeicher"}</h3>
      <div class="liste">${list
        .map(
          (x) => `<div class="eintrag"><span class="fuell" style="flex:1">${w.esc(x.name)}${x.count > 1 ? ` <span class="leise">×${x.count}</span>` : ""}</span>
          <b style="width:70px;text-align:right">${art === "cpu" ? x.cpu + "%" : bytes(x.ramMb * 1048576)}</b>
          <button class="knopf" data-kill="${w.esc(x.name)}" data-pid="${x.pid}" title="Beenden">✕</button></div>`,
        )
        .join("")}</div>
      <div class="zeile" style="justify-content:flex-end"><button class="knopf" id="tm">Task-Manager</button></div></div>`;
    k.querySelectorAll("[data-kill]").forEach((b) => (b.onclick = () => w.aktion("kill", { name: b.dataset.kill, pid: +b.dataset.pid })));
    k.querySelector("#tm").onclick = () => (w.aktion("taskmgr"), w.schliessen());
  };
  A.add("topCpu", prozesse("cpu"), { keys: ["procs"] });
  A.add("topRam", prozesse("ram"), { keys: ["procs"] });

  // ---------- Akku ----------
  const akku = (k, d, w) => {
    const b = w.daten("battery") || {};
    const zeit = b.secondsLeft ? `${Math.floor(b.secondsLeft / 3600)} Std. ${Math.round((b.secondsLeft % 3600) / 60)} Min.` : "–";
    k.innerHTML = `<div style="width:260px"><h3>Akku</h3>${
      b.hasBattery
        ? `<div class="gross">${b.percent}%</div><p class="leise">${b.plugged ? (b.charging ? "Wird geladen" : "Am Netz, voll") : `Restlaufzeit: ${zeit}`}${b.saver ? " · Energiesparen an" : ""}</p>`
        : '<p class="leise">Dieser PC hat keinen Akku.</p>'
    }</div>`;
  };
  ["battery", "batteryRing", "batteryDots", "batteryGauge"].forEach((id) => A.add(id, akku, { keys: ["battery"] }));

  // ---------- Speicher ----------
  A.add(
    "storage",
    (k, d, w) => {
      const list = w.daten("storage") || [];
      k.innerHTML = `<div style="width:300px"><h3>Laufwerke</h3>${list
        .map((x) => {
          const used = Math.round((100 * (x.total - x.free)) / x.total);
          return `<button class="eintrag" data-root="${w.esc(x.root)}" style="display:block;width:100%;text-align:left;padding:8px;border-radius:8px">
            <div style="display:flex;justify-content:space-between"><b>${x.root.slice(0, 2)}</b><span class="leise">${bytes(x.free)} frei von ${bytes(x.total)}</span></div>
            <div style="height:6px;border-radius:3px;background:#2c2836;margin-top:5px;overflow:hidden"><i style="display:block;height:100%;width:${used}%;background:${used > 90 ? "var(--live)" : "var(--lila)"}"></i></div></button>`;
        })
        .join("")}</div>`;
      k.querySelectorAll("[data-root]").forEach((b) => (b.onclick = () => (w.aktion("open", b.dataset.root), w.schliessen())));
    },
    { keys: ["storage"] },
  );

  // ---------- Bilder: Screenshots & Hintergrund ----------
  const galerie = (bilder, leer) =>
    bilder.length
      ? `<div style="display:grid;grid-template-columns:repeat(3,120px);gap:6px">${bilder
          .map((b) => `<button class="eintrag" data-file="${OXPAnsichten._esc(b.file)}" title="${OXPAnsichten._esc(b.name)}" style="padding:3px"><img src="${b.thumb || ""}" style="width:114px;height:72px;object-fit:cover;border-radius:6px"></button>`)
          .join("")}</div>`
      : `<p class="leise">${leer}</p>`;
  A._esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  A.add("screenshots", (k, d, w) => {
    k.innerHTML = `<div><h3>Screenshots</h3>${galerie(d.shots || [], "Noch keine Screenshots im Bilder-Ordner.")}
      <div class="zeile" style="justify-content:flex-end"><button class="knopf" id="ordner">Ordner</button><button class="knopf an" id="neu">Neuer Screenshot</button></div></div>`;
    k.querySelectorAll("[data-file]").forEach((b) => (b.onclick = () => (w.aktion("open", b.dataset.file), w.schliessen())));
    k.querySelector("#neu").onclick = () => (w.schliessen(), setTimeout(() => w.aktion("new"), 250));
    k.querySelector("#ordner").onclick = () => (w.aktion("folder"), w.schliessen());
  });
  A.add("wallpaper", (k, d, w) => {
    k.innerHTML = `<div><h3>Hintergrundbild</h3>${galerie(d.images || [], "Keine Bilder gefunden – wähle einen Ordner.")}
      <div class="zeile" style="justify-content:flex-end"><button class="knopf" id="einst">Einstellungen</button><button class="knopf" id="ordner">Ordner wählen …</button></div></div>`;
    k.querySelectorAll("[data-file]").forEach((b) => (b.onclick = () => w.aktion("set", b.dataset.file)));
    k.querySelector("#ordner").onclick = async () => {
      if (await w.aktion("folder")) w.neuLaden();
    };
    k.querySelector("#einst").onclick = () => (w.aktion("settings"), w.schliessen());
  });

  // ---------- Zuletzt geöffnet ----------
  A.add("recent", (k, d, w) => {
    const f = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    k.innerHTML = `<div style="width:340px"><h3>Zuletzt geöffnet</h3><div class="liste">${
      (d.files || [])
        .map(
          (x) => `<button class="eintrag" data-file="${w.esc(x.file)}" title="${w.esc(x.file)}">${x.icon ? `<img src="${x.icon}" style="width:18px;height:18px">` : ""}
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${w.esc(x.name)}</span><span class="leise" style="font-size:11px">${f.format(new Date(x.when))}</span></button>`,
        )
        .join("") || '<p class="leise">Nichts gefunden.</p>'
    }</div></div>`;
    k.querySelectorAll("[data-file]").forEach((b) => (b.onclick = () => (w.aktion("open", b.dataset.file), w.schliessen())));
  });

  // ---------- Alle Programme ----------
  A.add("apps", (k, d, w) => {
    const apps = d.apps || [];
    k.innerHTML = `<div style="width:520px"><input class="eingabe" id="suche" placeholder="Programm suchen …" autocomplete="off">
      <div id="appgitter" style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-top:8px;max-height:380px;overflow:auto"></div></div>`;
    const gitter = k.querySelector("#appgitter");
    const zeigen = (q) => {
      const s = q.trim().toLowerCase();
      const treffer = apps.filter((a) => !s || a.name.toLowerCase().includes(s)).slice(0, 80);
      gitter.innerHTML = treffer
        .map(
          (a) => `<button class="eintrag" data-lnk="${w.esc(a.lnk)}" title="${w.esc(a.name)}" style="flex-direction:column;gap:4px;padding:8px 4px">
          ${a.icon ? `<img src="${a.icon}" style="width:32px;height:32px">` : '<span style="width:32px;height:32px;border-radius:8px;background:#3a3348"></span>'}
          <span style="font-size:11px;text-align:center;line-height:1.2;max-height:2.4em;overflow:hidden">${w.esc(a.name)}</span></button>`,
        )
        .join("");
      gitter.querySelectorAll("[data-lnk]").forEach((b) => (b.onclick = () => (w.aktion("open", b.dataset.lnk), w.schliessen())));
    };
    const suche = k.querySelector("#suche");
    suche.oninput = () => zeigen(suche.value);
    suche.onkeydown = (e) => {
      if (e.key === "Enter") gitter.querySelector("[data-lnk]")?.click();
    };
    zeigen("");
    setTimeout(() => suche.focus(), 50);
  });

  // ---------- Netzwerk ----------
  A.add(
    "netspeed",
    (k, d, w) => {
      const n = w.daten("net") || {};
      k.innerHTML = `<div style="width:220px"><h3>Netzwerk</h3><div class="zeile"><span>↓ Download</span><b class="fuell" style="text-align:right">${bytes(n.down)}/s</b></div><div class="zeile"><span>↑ Upload</span><b class="fuell" style="text-align:right">${bytes(n.up)}/s</b></div></div>`;
    },
    { keys: ["net"] },
  );
})();

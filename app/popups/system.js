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

  // ---------- Netzwerk-Menü (über dem Netzwerksymbol) ----------
  const netzSvg = (d) => `<svg viewBox="0 0 24 24" style="width:16px;height:16px;flex:none">${d}</svg>`;
  const balken = (s) => {
    const n = s >= 75 ? 4 : s >= 50 ? 3 : s >= 25 ? 2 : 1;
    return `<svg viewBox="0 0 24 24" style="width:16px;height:16px;flex:none">${[1, 2, 3, 4].map((i) => `<rect x="${i * 5 - 3}" y="${20 - i * 4}" width="3" height="${i * 4}" rx="1" style="fill:currentColor;stroke:none;opacity:${i <= n ? 1 : 0.25}"/>`).join("")}</svg>`;
  };
  const netzArten = { ethernet: "LAN (Kabel)", wifi: "WLAN", network: "Netzwerk" };
  let netzOffen = null; // WLAN, für das gerade das Kennwortfeld offen ist
  let netzMeldung = "";
  A.add("netz", (k, d, w) => {
    if (d.loading) {
      k.innerHTML = `<div style="width:360px"><h3>Netzwerk</h3><p class="leise">Wird geladen …</p></div>`;
      netzMeldung = "";
      netzOffen = null;
      w.neuLaden({ laden: true });
      return;
    }
    const verb = d.network?.connections || [];
    const radios = d.radios || [];
    const a = d.audio || {};
    const wifiRadio = radios.find((r) => r.kind === "WiFi");
    const radio = (kind, label) => {
      const x = radios.find((y) => y.kind === kind);
      return x ? `<button class="kachel ${x.on ? "an" : ""}" data-radio="${kind}" data-on="${x.on ? 1 : 0}"><b>${label}</b><small>${x.on ? "an" : "aus"}</small></button>` : "";
    };
    const verbText = verb.length
      ? verb
          .map((c) => {
            const zugang = c.internet === true ? "Internet" : c.internet === false ? "Kein Internetzugang" : "Verbunden";
            const gleich = c.domain && (c.name || "").toLowerCase() === c.domain.toLowerCase();
            const name = [gleich ? "" : c.name, c.domain ? "Domäne " + c.domain : ""].filter(Boolean).join(" · ");
            return `<div class="eintrag an" style="cursor:default"><b>${w.esc(netzArten[c.kind] || "Netzwerk")}</b><span class="leise fuell" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${w.esc(name || c.adapter || "")}</span><small>${zugang}</small></div>`;
          })
          .join("")
      : `<p class="leise">Keine Netzwerkverbindung</p>`;
    const netze = d.wlan?.netze || [];
    const wlanListe = !wifiRadio
      ? ""
      : !wifiRadio.on
        ? `<p class="leise">WLAN ist ausgeschaltet.</p>`
        : !netze.length
          ? `<p class="leise">${d.wlan?.fehler ? "WLAN-Netze konnten nicht gelesen werden." : "Keine WLAN-Netze in der Nähe."}</p>`
          : netze
              .map((n) => {
                const info = n.verbunden ? "Verbunden" : n.bekannt ? "Gespeichert" : n.offen ? "Offen" : "Gesichert";
                const feld =
                  netzOffen === n.ssid
                    ? `<div class="zeile" style="padding:2px 4px 8px 32px">${
                        n.offen || n.bekannt
                          ? ""
                          : `<input type="password" class="eingabe" id="wlanpw" placeholder="Netzwerkkennwort" autocomplete="off" spellcheck="false">`
                      }<button class="knopf an" data-los="${w.esc(n.ssid)}">Verbinden</button></div>`
                    : "";
                return `<button class="eintrag ${n.verbunden ? "an" : ""}" data-wlan="${w.esc(n.ssid)}">${balken(n.signal)}<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${w.esc(n.ssid)}</span><small class="leise">${info}</small></button>${feld}${
                  n.verbunden && netzOffen === n.ssid ? `<div class="zeile" style="padding:2px 4px 8px 32px"><button class="knopf" id="trennen">Trennen</button></div>` : ""
                }`;
              })
              .join("");
    k.innerHTML = `<div style="width:360px">
      <h3>Netzwerk</h3>
      <div class="liste" style="max-height:none">${verbText}</div>
      <div class="kacheln" style="margin-top:10px">${radio("WiFi", "WLAN")}${radio("Bluetooth", "Bluetooth")}${radio("MobileBroadband", "Mobilfunk")}
        ${a.mic != null ? `<button class="kachel ${a.micMuted ? "an" : ""}" id="mikro"><b>Mikro stumm</b><small>${a.micMuted ? "an" : "aus"}</small></button>` : ""}</div>
      ${a.volume != null ? `<div class="zeile" style="margin-top:6px"><button class="knopf ${a.muted ? "an" : ""}" id="stumm" title="Stumm">${netzSvg(a.muted ? '<path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/>' : '<path d="M4 9h4l5-4v14l-5-4H4zM17 8a5 5 0 0 1 0 8"/>')}</button>
        <input type="range" id="vol" min="0" max="100" value="${a.volume}" class="fuell"><b style="width:38px;text-align:right" id="volz">${a.volume}%</b></div>` : ""}
      ${wifiRadio ? `<h3 style="margin-top:10px">WLAN-Netze</h3><div class="liste" style="max-height:300px">${wlanListe}</div>` : ""}
      ${netzMeldung ? `<p class="leise" role="status" style="margin:8px 4px 0">${w.esc(netzMeldung)}</p>` : ""}
      <div class="zeile" style="justify-content:space-between;margin-top:8px"><button class="knopf" id="neteinst">Netzwerkeinstellungen</button><button class="knopf" id="winmenue">Windows-Schnelleinstellungen</button></div>
    </div>`;
    const neu = () => w.neuLaden({ laden: true });
    k.querySelectorAll("[data-radio]").forEach((b) => (b.onclick = async () => (await w.aktion("radio", { kind: b.dataset.radio, on: b.dataset.on !== "1" }), neu())));
    const mikro = k.querySelector("#mikro");
    if (mikro) mikro.onclick = async () => (await w.aktion("micMute", !a.micMuted), neu());
    const vol = k.querySelector("#vol");
    if (vol) {
      regler(vol, (v) => w.aktion("volume", v));
      vol.addEventListener("input", () => (k.querySelector("#volz").textContent = vol.value + "%"));
      k.querySelector("#stumm").onclick = async () => (await w.aktion("mute", !a.muted), neu());
    }
    k.querySelectorAll("[data-wlan]").forEach(
      (b) =>
        (b.onclick = () => {
          netzOffen = netzOffen === b.dataset.wlan ? null : b.dataset.wlan;
          netzMeldung = "";
          A.liste.netz(k, d, w);
          w.neuZeichnen();
          k.querySelector("#wlanpw")?.focus();
        }),
    );
    const los = k.querySelector("[data-los]");
    if (los) {
      const verbinden = async () => {
        const pw = k.querySelector("#wlanpw");
        los.disabled = true;
        los.textContent = "Verbinde …";
        const r = await w.aktion("verbinden", { ssid: los.dataset.los, passwort: pw ? pw.value : undefined });
        netzMeldung = r?.ok ? "" : r?.fehler || "Verbinden hat nicht geklappt.";
        if (r?.ok) netzOffen = null;
        neu();
      };
      los.onclick = verbinden;
      k.querySelector("#wlanpw")?.addEventListener("keydown", (e) => e.key === "Enter" && verbinden());
    }
    const trennen = k.querySelector("#trennen");
    if (trennen) trennen.onclick = async () => (await w.aktion("trennen"), (netzOffen = null), neu());
    k.querySelector("#neteinst").onclick = () => (w.aktion("settings", "ms-settings:network"), w.schliessen());
    k.querySelector("#winmenue").onclick = () => (w.schliessen(), w.aktion("windows"));
  });

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

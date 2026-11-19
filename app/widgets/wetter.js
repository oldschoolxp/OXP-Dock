// Stufe 4: Wetter, Musik & Kurse – Darstellung in der Leiste.
(() => {
  const W = OXPWidgets;
  const svg = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
  const icon = (code, day = true) => {
    if (code === 0) return day ? "☀️" : "🌙";
    if (code <= 2) return day ? "🌤️" : "☁️";
    if (code === 3) return "☁️";
    if (code <= 48) return "🌫️";
    if (code <= 67 || (code >= 80 && code <= 82)) return "🌧️";
    if (code <= 77 || code === 85 || code === 86) return "🌨️";
    return "⛈️";
  };
  window.OXPwetterIcon = icon;
  const std = (iso) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const geld = (v, cur) => {
    if (v == null) return "–";
    const opt = { style: "currency", currency: (cur || "EUR").toUpperCase(), maximumFractionDigits: v >= 1000 ? 0 : v >= 1 ? 2 : 4 };
    try {
      return new Intl.NumberFormat("de-DE", opt).format(v);
    } catch {
      return v.toFixed(2) + " " + cur;
    }
  };
  window.OXPgeld = geld;
  const pfeil = (c) => (c == null ? "" : `<span class="${c >= 0 ? "plus" : "minus"}">${c >= 0 ? "▲" : "▼"} ${Math.abs(c).toFixed(1)}%</span>`);
  window.OXPpfeil = pfeil;
  const fehlt = (el, f) => {
    if (!f) return true;
    if (f.missing || f.error) {
      el.innerHTML = `<div class="stack"><span class="klein">Wetter</span><span class="gross">${f.error || "Ort einstellen"}</span></div>`;
      el.dataset.tip = "Wetter-Ort in den Dock-Einstellungen eintragen";
      return true;
    }
    return false;
  };

  W.add("weatherHourly", {
    keys: ["forecast"],
    render(el, c) {
      const f = c.daten("forecast");
      if (fehlt(el, f)) return f ? undefined : false;
      el.innerHTML = `<span class="stunden">${f.hours
        .slice(0, c.option("stunden", 6))
        .map((x) => `<span class="std"><small>${new Date(x.t).getHours()}h</small><b>${icon(x.code, x.day)}</b><small>${x.temp}°</small></span>`)
        .join("")}</span>`;
      el.dataset.tip = `${f.place} · die nächsten Stunden`;
    },
  });
  W.add("todayForecast", {
    keys: ["forecast"],
    render(el, c) {
      const f = c.daten("forecast");
      if (fehlt(el, f)) return f ? undefined : false;
      const heute = new Date().toDateString();
      const um = (h) => f.hours.find((x) => new Date(x.t).toDateString() === heute && new Date(x.t).getHours() === h) || null;
      const teile = [["Morgen", 8], ["Mittag", 13], ["Abend", 19]].map(([n, h]) => [n, um(h)]).filter(([, x]) => x);
      const d = f.days[0];
      el.innerHTML = `<span class="wetter-icon">${icon(d.code)}</span><div class="stack"><span class="gross">${d.min}° / ${d.max}°</span><span class="klein">${d.pop ?? 0}% Regen</span></div>${teile
        .map(([n, x]) => `<div class="stack"><span class="klein">${n}</span><span class="klein">${icon(x.code, x.day)} ${x.temp}°</span></div>`)
        .join("")}`;
      el.dataset.tip = `${f.place} · heute`;
    },
  });
  W.add("weatherStatus", {
    keys: ["forecast"],
    render(el, c) {
      const f = c.daten("forecast");
      if (fehlt(el, f)) return f ? undefined : false;
      const r = f.nextRain;
      let txt;
      if (f.current.rainNow > 0) txt = "Es regnet gerade";
      else if (r) {
        const min = Math.max(0, Math.round((new Date(r.at) - Date.now()) / 60000));
        txt = min < 15 ? "Gleich Regen" : min < 90 ? `Regen in ${min} Min.` : `Regen ab ${std(r.at)}`;
      } else txt = "Kein Regen in Sicht";
      el.innerHTML = `<span class="wetter-icon">${f.current.rainNow > 0 || r ? "☔" : icon(f.current.code, f.current.day)}</span><div class="stack"><span class="klein">${c.esc(f.place)} · ${f.current.temp}°</span><span class="gross">${txt}</span></div>`;
      el.dataset.tip = `Gefühlt ${f.current.feels}° · Wind ${f.current.wind} km/h`;
    },
  });
  W.add("sun", {
    keys: ["forecast"],
    render(el, c) {
      const f = c.daten("forecast");
      if (fehlt(el, f)) return f ? undefined : false;
      const d = f.days[0];
      const nacht = Date.now() > new Date(d.sunset).getTime();
      const auf = nacht && f.days[1] ? f.days[1].sunrise : d.sunrise;
      el.innerHTML = `<span class="wetter-icon">🌅</span><div class="stack"><span class="klein">↑ ${std(auf)}</span><span class="klein">↓ ${std(d.sunset)}</span></div>`;
      const hell = (new Date(d.sunset) - new Date(d.sunrise)) / 60000;
      el.dataset.tip = `Tageslicht heute: ${Math.floor(hell / 60)} Std. ${Math.round(hell % 60)} Min.`;
    },
    click: () => {},
  });

  // ---------- Läuft gerade ----------
  W.add("nowPlaying", {
    tag: "div",
    klasse: "jetzt",
    keys: ["media"],
    render(el, c) {
      const m = c.daten("media");
      if (!m) return false;
      // Aufbau: Hintergrund-Ebene (Cover oder Live-Video) + Inhalt darüber. Nur der Inhalt wird neu geschrieben,
      // damit ein laufendes Video nicht bei jeder Änderung neu startet.
      if (!el.querySelector(":scope > .np-inhalt")) el.innerHTML = '<span class="np-bg"></span><div class="np-inhalt"></div>';
      const bg = el.querySelector(":scope > .np-bg");
      const inhalt = el.querySelector(":scope > .np-inhalt");
      const modus = m.active ? c.option("hintergrund", "aus") : "aus";
      const staerke = c.option("staerke", 55) / 100;
      el.style.setProperty("--np-breite", c.option("breite", 200) + "px");

      // Hintergrund
      const bild = m.thumb || (el._standbild && el._standbild.titel === m.title ? el._standbild.url : null);
      // abgedunkelter Look nur, wenn wirklich ein Bild dahinter liegt (beim Video setzt npVideo das selbst)
      if (modus !== "video") el.classList.toggle("mit-hintergrund", modus === "cover" && !!bild);
      if (modus === "cover" && bild) {
        bg.style.cssText = `background-image:url("${bild}");opacity:${staerke};filter:blur(${c.option("unschaerfe", 6)}px) saturate(1.2)`;
      } else if (modus !== "video") bg.style.cssText = "opacity:0";
      // kein Cover geliefert (z. B. YouTube in Chrome): ein Einzelbild aus dem abspielenden Fenster holen
      if (modus === "cover" && !bild && m.active && el.isConnected) npStandbild(el, m.title, c);
      if (el.isConnected) npVideo(el, bg, modus === "video", staerke, c);

      if (!m.active) {
        inhalt.innerHTML = `${svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>')}<span class="klein">Nichts läuft</span>`;
        el.dataset.tip = "Keine Wiedergabe";
        return;
      }
      const knoepfe = c.option("knoepfe", true);
      inhalt.innerHTML = `${c.option("cover", true) ? (bild ? `<img class="cover" src="${bild}" alt="">` : `<span class="cover leer">♪</span>`) : ""}
        <div class="stack titel"><span class="gross">${c.esc(m.title || "")}</span><span class="klein">${c.esc(m.artist || m.app || "")}</span></div>
        ${
          knoepfe
            ? `<button data-eigen data-np="prev" data-tip="Zurück">${svg('<path d="M6 5v14M19 5 9 12l10 7z" class="fill"/>')}</button>
        <button data-eigen data-np="play" data-tip="Wiedergabe / Pause">${svg(m.playing ? '<path d="M7 5h3v14H7zM14 5h3v14h-3z" class="fill"/>' : '<path d="M7 5v14l11-7z" class="fill"/>')}</button>
        <button data-eigen data-np="next" data-tip="Weiter">${svg('<path d="M18 5v14M5 5l10 7-10 7z" class="fill"/>')}</button>`
            : ""
        }`;
      inhalt.querySelectorAll("[data-np]").forEach((b) => (b.onclick = () => c.aktion(b.dataset.np)));
      el.dataset.tip = `${m.title}${m.artist ? " – " + m.artist : ""}`;
    },
  });
  // Ein Einzelbild des abspielenden Fensters (klappt auch, wenn es minimiert ist) – einmal pro Titel
  async function npStandbild(el, titel, c) {
    if (el._standbildLaedt === titel) return;
    el._standbildLaedt = titel;
    let stream;
    try {
      const q = await c.api.invoke("np-quelle");
      if (!q || q.minimized) {
        el._standbildLaedt = null; // später nochmal versuchen, wenn das Fenster wieder offen ist
        return;
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: q.id, maxWidth: 480, maxHeight: 270, maxFrameRate: 5 } },
      });
      const v = document.createElement("video");
      v.muted = true;
      v.srcObject = stream;
      await v.play();
      await new Promise((r) => setTimeout(r, 400)); // ein paar Bilder abwarten
      const cv = document.createElement("canvas");
      cv.width = v.videoWidth || 480;
      cv.height = v.videoHeight || 270;
      cv.getContext("2d").drawImage(v, 0, 0, cv.width, cv.height);
      el._standbild = { titel, url: cv.toDataURL("image/jpeg", 0.8) };
      OXPWidgets.zeichnen("nowPlaying");
    } catch (e) {
      console.warn("Standbild nicht möglich:", e.message);
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
    }
  }

  // Live-Video des abspielenden Fensters als Hintergrund (kleine Aufnahme mit wenigen Bildern pro Sekunde)
  async function npVideo(el, bg, an, staerke, c) {
    const st = (el._np ||= { quelle: null, stream: null, laedt: false });
    const stop = () => {
      st.stream?.getTracks().forEach((t) => t.stop());
      st.stream = null;
      st.quelle = null;
      bg.querySelector("video")?.remove();
      el.classList.remove("mit-hintergrund");
    };
    if (!an) return stop();
    bg.style.cssText = `opacity:${staerke};filter:none;background:none`;
    if (st.laedt) return;
    st.laedt = true;
    try {
      const q = await c.api.invoke("np-quelle");
      // minimierte Fenster kann Windows nicht live aufnehmen
      if (!q || q.minimized) return stop();
      if (st.quelle === q.id && st.stream) return;
      stop();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: q.id, maxWidth: 480, maxHeight: 270, maxFrameRate: 8 } },
      });
      st.stream = stream;
      st.quelle = q.id;
      const v = document.createElement("video");
      v.muted = true;
      v.autoplay = true;
      v.srcObject = stream;
      bg.appendChild(v);
      v.play().catch(() => {});
      el.classList.add("mit-hintergrund");
      // endet die Aufnahme (Fenster zu/minimiert), Hintergrund wieder weg
      stream.getVideoTracks()[0].addEventListener("ended", stop);
    } catch (e) {
      console.warn("Live-Video nicht möglich:", e.message);
      stop();
    } finally {
      st.laedt = false;
    }
  }

  W.add("audioOutput", {
    keys: ["audioDevices"],
    render(el, c) {
      const d = c.daten("audioDevices");
      if (!d) return false;
      const cur = d.output.find((x) => x.isDefault);
      const name = (cur?.name || "–").replace(/\s*\(.*\)$/, "");
      el.innerHTML = `${svg('<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2" y="14" width="5" height="7" rx="2"/><rect x="17" y="14" width="5" height="7" rx="2"/>')}<span class="klein">${c.esc(name.slice(0, 22))}</span>`;
      el.dataset.tip = `Ausgabe: ${cur?.name || "–"} · Rechtsklick = nächstes Gerät`;
    },
    context: (el, c) => c.aktion("next"),
  });

  // ---------- Kurse ----------
  W.add("crypto", {
    keys: ["crypto"],
    render(el, c) {
      const k = c.daten("crypto");
      if (!k?.coins?.length) return false;
      el.innerHTML = k.coins
        .slice(0, c.option("anzahl", 3))
        .map((x) => `<div class="stack"><span class="klein">${x.sym} ${pfeil(x.change)}</span><span class="gross">${geld(x.price, k.currency)}</span></div>`)
        .join('<span class="mini-sep"></span>');
      el.dataset.tip = "Krypto-Kurse (24 Std.)";
    },
  });
  const spark = (pts) => {
    if (!pts || pts.length < 2) return "";
    const min = Math.min(...pts), max = Math.max(...pts);
    const d = pts.map((p, i) => `${(i / (pts.length - 1)) * 40},${14 - ((p - min) / (max - min || 1)) * 12}`).join(" ");
    return `<svg class="spark" viewBox="0 0 40 16"><polyline points="${d}" class="${pts.at(-1) >= pts[0] ? "plus" : "minus"}"/></svg>`;
  };
  window.OXPspark = spark;
  W.add("stocks", {
    keys: ["stocks"],
    render(el, c) {
      const s = (c.daten("stocks") || []).filter((x) => !x.error);
      if (!s.length) return false;
      el.innerHTML = s
        .slice(0, c.option("anzahl", 3))
        .map((x) => `<div class="stack"><span class="klein">${c.esc(x.sym.replace("^GDAXI", "DAX"))} ${pfeil(x.change)}</span><span class="gross">${geld(x.price, x.cur)}</span></div>${c.option("kurve", true) ? spark(x.spark) : ""}`)
        .join('<span class="mini-sep"></span>');
      el.dataset.tip = "Aktien heute";
    },
  });
  W.add("currency", {
    keys: ["currency"],
    render(el, c) {
      const k = c.daten("currency");
      if (!k?.rates) return false;
      el.innerHTML = `<span class="wetter-icon">💱</span>${k.show
        .slice(0, c.option("anzahl", 3))
        .map((s) => `<div class="stack"><span class="klein">1 ${k.base} =</span><span class="gross">${(k.rates[s] ?? 0).toLocaleString("de-DE", { maximumFractionDigits: 4 })} ${s}</span></div>`)
        .join('<span class="mini-sep"></span>')}`;
      el.dataset.tip = `EZB-Kurse vom ${new Date(k.date).toLocaleDateString("de-DE")}`;
    },
  });
})();

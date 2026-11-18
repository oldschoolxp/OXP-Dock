// Stufe 4: Wetter, Musik & Kurse – Fenster über der Leiste.
(() => {
  const A = OXPAnsichten;
  const icon = (code, day = true) => {
    if (code === 0) return day ? "☀️" : "🌙";
    if (code <= 2) return day ? "🌤️" : "☁️";
    if (code === 3) return "☁️";
    if (code <= 48) return "🌫️";
    if (code <= 67 || (code >= 80 && code <= 82)) return "🌧️";
    if (code <= 77 || code === 85 || code === 86) return "🌨️";
    return "⛈️";
  };
  const std = (iso) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const geld = (v, cur) => {
    if (v == null) return "–";
    try {
      return new Intl.NumberFormat("de-DE", { style: "currency", currency: (cur || "EUR").toUpperCase(), maximumFractionDigits: v >= 1000 ? 0 : v >= 1 ? 2 : 4 }).format(v);
    } catch {
      return v.toFixed(2) + " " + cur;
    }
  };
  const pfeil = (c) => (c == null ? "" : `<span style="color:${c >= 0 ? "#5ad19a" : "#ff6b81"}">${c >= 0 ? "▲" : "▼"} ${Math.abs(c).toFixed(2)}%</span>`);

  // ---------- Wetter (eine Ansicht für alle Wetter-Widgets) ----------
  const wetter = (k, d, w) => {
    const f = w.daten("forecast");
    if (!f || f.missing || f.error) {
      k.innerHTML = `<div style="width:260px"><h3>Wetter</h3><p class="leise">${f?.error || "Trag in den Dock-Einstellungen (Rechtsklick auf den Würfel) deinen Ort ein."}</p></div>`;
      return;
    }
    const c = f.current;
    const max = Math.max(...f.hours.map((x) => x.temp)), min = Math.min(...f.hours.map((x) => x.temp));
    k.innerHTML = `<div style="width:520px">
      <div class="zeile" style="padding:0 0 8px"><span style="font-size:40px">${icon(c.code, c.day)}</span>
        <div><div class="gross" style="font-size:28px">${c.temp}°</div><div class="leise">${w.esc(f.place)} · gefühlt ${c.feels}° · Wind ${c.wind} km/h</div></div>
        <div class="fuell" style="text-align:right" class="leise">↑ ${std(f.days[0].sunrise)} · ↓ ${std(f.days[0].sunset)}<br><span class="leise">${f.nextRain ? "Regen ab " + std(f.nextRain.at) : "kein Regen in Sicht"}</span></div></div>
      <h3>Die nächsten 24 Stunden</h3>
      <div style="display:flex;gap:2px;overflow:auto;padding-bottom:4px">${f.hours
        .map((x) => {
          const hoehe = 10 + ((x.temp - min) / (max - min || 1)) * 30;
          return `<div style="width:30px;flex:none;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px">
            <span class="leise">${new Date(x.t).getHours()}h</span><span style="font-size:14px">${icon(x.code, x.day)}</span>
            <div style="height:44px;display:flex;align-items:flex-end"><i style="width:6px;border-radius:3px;height:${hoehe}px;background:linear-gradient(var(--lila),transparent)"></i></div>
            <b>${x.temp}°</b><span style="color:#6cb6ff;font-size:10px">${x.pop ? x.pop + "%" : ""}</span></div>`;
        })
        .join("")}</div>
      <h3 style="margin-top:8px">Heute & morgen</h3>${f.days
        .map((x, i) => `<div class="zeile"><span style="width:70px">${i === 0 ? "Heute" : "Morgen"}</span><span>${icon(x.code)}</span><span class="fuell">${x.min}° / ${x.max}°</span><span class="leise">${x.pop ?? 0}% Regen</span></div>`)
        .join("")}</div>`;
  };
  for (const id of ["weatherHourly", "todayForecast", "weatherStatus", "sun"]) A.add(id, wetter, { keys: ["forecast"] });

  // ---------- Läuft gerade ----------
  A.add(
    "nowPlaying",
    (k, d, w) => {
      const m = w.daten("media") || {};
      if (!m.active) {
        k.innerHTML = '<div style="width:260px"><h3>Läuft gerade</h3><p class="leise">Gerade spielt nichts.</p></div>';
        return;
      }
      const pos = m.duration > 0 ? Math.min(100, (100 * m.position) / m.duration) : 0;
      k.innerHTML = `<div style="width:300px;text-align:center">
        ${m.thumb ? `<img src="${m.thumb}" style="width:200px;height:200px;object-fit:cover;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.4)">` : '<div style="width:200px;height:200px;margin:auto;border-radius:12px;background:#2c2836;display:grid;place-items:center;font-size:60px;color:var(--leise)">♪</div>'}
        <div style="margin-top:10px;font-weight:700;font-size:14px">${w.esc(m.title)}</div><div class="leise">${w.esc(m.artist || "")}${m.album ? " · " + w.esc(m.album) : ""}</div>
        ${m.duration > 0 ? `<div style="height:4px;border-radius:2px;background:#2c2836;margin:10px 0 0"><i style="display:block;height:100%;width:${pos}%;background:var(--lila);border-radius:2px"></i></div>` : ""}
        <div class="zeile" style="justify-content:center;gap:14px"><button class="knopf" data-a="prev">⏮</button><button class="knopf an" data-a="play" style="padding:8px 18px">${m.playing ? "⏸" : "▶"}</button><button class="knopf" data-a="next">⏭</button></div>
        <div class="leise" style="font-size:11px">${w.esc(m.app || "")}</div></div>`;
      k.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => w.aktion(b.dataset.a)));
    },
    { keys: ["media"] },
  );

  // ---------- Audio-Ausgabe ----------
  A.add(
    "audioOutput",
    (k, d, w) => {
      const dev = w.daten("audioDevices") || { output: [] };
      k.innerHTML = `<div style="width:320px"><h3>Ausgabegerät</h3><div class="liste">${dev.output
        .map((x) => `<button class="eintrag ${x.isDefault ? "an" : ""}" data-dev="${w.esc(x.id)}">${x.isDefault ? "● " : ""}${w.esc(x.name)}</button>`)
        .join("")}</div></div>`;
      k.querySelectorAll("[data-dev]").forEach((b) => (b.onclick = () => w.aktion("set", b.dataset.dev)));
    },
    { keys: ["audioDevices"] },
  );

  // ---------- Krypto ----------
  A.add(
    "crypto",
    (k, d, w) => {
      const kurse = w.daten("crypto") || { coins: [] };
      const gew = d.chosen || { coins: [] };
      k.innerHTML = `<div style="width:320px"><h3>Krypto · 24 Stunden</h3>${kurse.coins
        .map((x) => `<div class="zeile"><b style="width:46px">${x.sym}</b><span class="fuell leise">${w.esc(x.name)}</span><b>${geld(x.price, kurse.currency)}</b><span style="width:74px;text-align:right">${pfeil(x.change)}</span></div>`)
        .join("")}
        <h3 style="margin-top:10px">Anzeigen</h3><div style="display:flex;flex-wrap:wrap;gap:4px">${(d.all || [])
          .map((c) => `<button class="knopf ${gew.coins.includes(c[0]) ? "an" : ""}" data-coin="${c[0]}">${c[1]}</button>`)
          .join("")}</div>
        <div class="zeile"><span class="leise">Währung</span>${["eur", "usd", "chf", "gbp"].map((c) => `<button class="knopf ${gew.currency === c ? "an" : ""}" data-cur="${c}">${c.toUpperCase()}</button>`).join("")}</div>
        <p class="leise" style="font-size:10.5px;margin:4px 0 0">Daten: CoinGecko, alle 5 Minuten.</p></div>`;
      k.querySelectorAll("[data-coin]").forEach((b) => (b.onclick = async () => (await w.aktion("toggle", b.dataset.coin), w.neuLaden())));
      k.querySelectorAll("[data-cur]").forEach((b) => (b.onclick = async () => (await w.aktion("currency", b.dataset.cur), w.neuLaden())));
    },
    { keys: ["crypto"] },
  );

  // ---------- Aktien ----------
  A.add(
    "stocks",
    (k, d, w) => {
      const s = w.daten("stocks") || [];
      k.innerHTML = `<div style="width:360px"><h3>Aktien-Watchlist</h3>${s
        .map((x) =>
          x.error
            ? `<div class="zeile"><b style="width:70px">${w.esc(x.sym)}</b><span class="fuell leise">nicht gefunden</span><button class="knopf" data-weg="${w.esc(x.sym)}">✕</button></div>`
            : `<div class="zeile"><button class="eintrag fuell" data-open="${w.esc(x.sym)}" style="padding:2px 4px"><b style="width:66px">${w.esc(x.sym.replace("^GDAXI", "DAX"))}</b><span class="leise" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px">${w.esc(x.name)}</span></button><b>${geld(x.price, x.cur)}</b><span style="width:70px;text-align:right">${pfeil(x.change)}</span><button class="knopf" data-weg="${w.esc(x.sym)}">✕</button></div>`,
        )
        .join("")}
        <div class="zeile"><input class="eingabe" id="sym" placeholder="Kürzel, z. B. SAP.DE, TSLA, ^GDAXI"><button class="knopf" id="plus">+</button></div>
        <p class="leise" style="font-size:10.5px;margin:0">Kürzel wie bei Yahoo Finance. Kurse können verzögert sein.</p></div>`;
      const plus = async () => {
        const v = k.querySelector("#sym").value.trim();
        if (v) (await w.aktion("add", v), w.neuLaden());
      };
      k.querySelector("#plus").onclick = plus;
      k.querySelector("#sym").onkeydown = (e) => e.key === "Enter" && plus();
      k.querySelectorAll("[data-weg]").forEach((b) => (b.onclick = () => w.aktion("remove", b.dataset.weg)));
      k.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => w.aktion("open", b.dataset.open)));
    },
    { keys: ["stocks"] },
  );

  // ---------- Währungen & Umrechner ----------
  const WAEHR = ["EUR", "USD", "GBP", "CHF", "JPY", "PLN", "CZK", "SEK", "NOK", "DKK", "TRY", "CAD", "AUD", "CNY", "HUF"];
  A.add(
    "currency",
    (k, d, w) => {
      const c = w.daten("currency");
      if (!c) return;
      const kurs = (zu) => (zu === c.base ? 1 : c.rates[zu]);
      k.innerHTML = `<div style="width:320px"><h3>Umrechner</h3>
        <div class="zeile"><input class="eingabe" id="betrag" type="number" value="100" style="width:110px;flex:none"><select class="eingabe" id="von">${WAEHR.map((x) => `<option ${x === c.base ? "selected" : ""}>${x}</option>`).join("")}</select>
          <span>→</span><select class="eingabe" id="nach">${WAEHR.map((x) => `<option ${x === (c.show[0] || "USD") ? "selected" : ""}>${x}</option>`).join("")}</select></div>
        <div class="gross" id="ergebnis" style="text-align:center;margin:6px 0"></div>
        <h3>In der Leiste zeigen</h3><div style="display:flex;flex-wrap:wrap;gap:4px">${WAEHR.filter((x) => x !== c.base)
          .map((x) => `<button class="knopf ${c.show.includes(x) ? "an" : ""}" data-zeig="${x}">${x}</button>`)
          .join("")}</div>
        <p class="leise" style="font-size:10.5px;margin:6px 0 0">EZB-Referenzkurse vom ${new Date(c.date).toLocaleDateString("de-DE")}</p></div>`;
      const rechnen = () => {
        const b = +k.querySelector("#betrag").value || 0;
        const von = k.querySelector("#von").value, nach = k.querySelector("#nach").value;
        const vk = kurs(von), nk = kurs(nach);
        k.querySelector("#ergebnis").textContent = vk && nk ? `${b.toLocaleString("de-DE")} ${von} = ${((b / vk) * nk).toLocaleString("de-DE", { maximumFractionDigits: 2 })} ${nach}` : "Kurs fehlt";
      };
      ["betrag", "von", "nach"].forEach((id) => (k.querySelector("#" + id).oninput = rechnen));
      rechnen();
      k.querySelectorAll("[data-zeig]").forEach((b) => (b.onclick = () => w.aktion("toggle", b.dataset.zeig)));
    },
    { keys: ["currency"] },
  );
})();

// Stufe 4: Wetter, Musik & Kurse – Daten, Aktionen, Fenster-Inhalte.
// Alle Quellen sind kostenlos und ohne Konto: Open-Meteo (Wetter), CoinGecko (Krypto),
// Yahoo Finance (Aktien, inoffiziell), Frankfurter/EZB (Währungen).
import { desktopCapturer } from "electron";

export default function register(ctx, h) {
  const { systemhelfer: sh, getJson, shell } = h;
  const w = (id, name, desc, data = []) => ctx.widget({ id, group: "wetter", name, desc, data });

  w("weatherHourly", "Wetter stündlich", "Die nächsten Stunden mit Temperatur und Regen", ["forecast"]);
  w("todayForecast", "Wetter heute", "Morgens, mittags, abends auf einen Blick", ["forecast"]);
  w("weatherStatus", "Regen-Hinweis", "Sagt dir, wann der nächste Regen kommt", ["forecast"]);
  w("sun", "Sonnenauf- und -untergang", "Wann es hell und dunkel wird", ["forecast"]);
  w("nowPlaying", "Läuft gerade", "Titel, Cover und Steuerung – Spotify, YouTube, Browser …", ["media"]);
  w("audioOutput", "Audio-Ausgabe", "Schnell zwischen Kopfhörer und Lautsprechern wechseln", ["audioDevices"]);
  w("crypto", "Krypto", "Kurse von Bitcoin, Ethereum & Co. (CoinGecko)", ["crypto"]);
  w("stocks", "Aktien", "Deine Aktien-Watchlist (im Fenster einstellbar)", ["stocks"]);
  w("currency", "Währungen", "Wechselkurse und Umrechner (EZB-Kurse)", ["currency"]);

  const einst = (id, def) => ({ ...def, ...(ctx.config().widgetSettings?.[id] || {}) });
  const speichern = (id, wert) => {
    ctx.config().widgetSettings[id] = wert;
    h.saveConfig();
  };

  // ---------- Wettervorhersage ----------
  let ort = null;
  ctx.provide("forecast", 15 * 60_000, async () => {
    const stadt = ctx.config().weatherCity;
    if (!stadt) return { missing: true };
    if (!ort || ort.city !== stadt) {
      const g = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(stadt)}&count=1&language=de`);
      const hit = g.results?.[0];
      if (!hit) return { error: "Ort nicht gefunden" };
      ort = { city: stadt, name: hit.name, lat: hit.latitude, lon: hit.longitude };
    }
    const f = await getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${ort.lat}&longitude=${ort.lon}&timezone=auto&forecast_days=2` +
        `&current=temperature_2m,weather_code,is_day,precipitation,wind_speed_10m,apparent_temperature` +
        `&hourly=temperature_2m,weather_code,precipitation_probability,precipitation,is_day` +
        `&minutely_15=precipitation&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max`,
    );
    const jetzt = Date.now();
    const stunden = f.hourly.time
      .map((t, i) => ({ t, temp: Math.round(f.hourly.temperature_2m[i]), code: f.hourly.weather_code[i], pop: f.hourly.precipitation_probability[i], rain: f.hourly.precipitation[i], day: !!f.hourly.is_day[i] }))
      .filter((x) => new Date(x.t).getTime() > jetzt - 3600_000)
      .slice(0, 24);
    // nächster Regen aus den 15-Minuten-Werten
    let regen = null;
    const q = f.minutely_15;
    if (q?.time) {
      for (let i = 0; i < q.time.length; i++) {
        const t = new Date(q.time[i]).getTime();
        if (t < jetzt - 15 * 60_000) continue;
        if (q.precipitation[i] >= 0.1) {
          regen = { at: q.time[i], mm: q.precipitation[i] };
          break;
        }
        if (t > jetzt + 6 * 3600_000) break;
      }
    }
    return {
      place: ort.name,
      current: { temp: Math.round(f.current.temperature_2m), feels: Math.round(f.current.apparent_temperature), code: f.current.weather_code, day: !!f.current.is_day, rainNow: f.current.precipitation, wind: Math.round(f.current.wind_speed_10m) },
      hours: stunden,
      days: f.daily.time.map((t, i) => ({ t, max: Math.round(f.daily.temperature_2m_max[i]), min: Math.round(f.daily.temperature_2m_min[i]), code: f.daily.weather_code[i], pop: f.daily.precipitation_probability_max[i], sunrise: f.daily.sunrise[i], sunset: f.daily.sunset[i] })),
      nextRain: regen,
    };
  });
  for (const id of ["weatherHourly", "todayForecast", "weatherStatus", "sun"]) ctx.popup(id, async () => ({}));

  // ---------- Läuft gerade (Windows-Mediensteuerung) ----------
  let letzterTitel = "";
  let cover = null;
  ctx.provide("media", 2000, async () => {
    const m = await sh.call("media", { thumb: false }, 10_000);
    if (m.active && m.title !== letzterTitel) {
      letzterTitel = m.title;
      cover = null;
      // Cover nur bei neuem Titel holen (ist groß)
      sh.call("media", { thumb: true }, 15_000)
        .then(async (x) => {
          // Kein Cover geliefert (z. B. YouTube in Chrome)? Dann ein Standbild des abspielenden Fensters.
          cover = x.thumb || (await fensterStandbild(x.title, x.app)) || null;
          if (x.title === letzterTitel) ctx.set("media", { ...x, position: Math.round((x.position || 0) / 15) * 15, thumb: cover });
        })
        .catch(() => {});
    }
    // Position im Lied nur grob (alle 15 s) – sonst würde die Leiste alle 2 Sekunden neu gezeichnet
    return m.active ? { ...m, position: Math.round((m.position || 0) / 15) * 15, thumb: cover } : m;
  });
  /** Standbild des Fensters, in dem gerade Musik/Video läuft (Titel passt, sonst die App). */
  async function fensterStandbild(titel, app) {
    const t = String(titel || "").toLowerCase().slice(0, 30);
    const a = String(app || "").toLowerCase();
    const fenster = h.windows();
    const w = t.length >= 4 ? fenster.find((x) => x.title.toLowerCase().includes(t)) : null;
    void a;
    if (!w || w.minimized) return null;
    try {
      const quellen = await desktopCapturer.getSources({ types: ["window"], thumbnailSize: { width: 480, height: 270 }, fetchWindowIcons: false });
      const q = quellen.find((x) => x.id.startsWith(`window:${w.hwnd}:`));
      return q && !q.thumbnail.isEmpty() ? q.thumbnail.toDataURL() : null;
    } catch {
      return null;
    }
  }

  ctx.action("nowPlaying", async (a) => {
    if (["play", "next", "prev"].includes(a)) await sh.call("mediaControl", { action: a });
    setTimeout(() => ctx.refresh("media"), 300);
  });
  ctx.popup("nowPlaying", async () => ({}));

  // ---------- Audio-Ausgabe ----------
  ctx.provide("audioDevices", 10_000, () => sh.call("audioDevices"));
  ctx.action("audioOutput", async (a, v) => {
    if (a === "set") await sh.call("setDefaultDevice", { id: v });
    if (a === "next") {
      const d = (await sh.call("audioDevices")).output;
      const i = d.findIndex((x) => x.isDefault);
      if (d.length > 1) await sh.call("setDefaultDevice", { id: d[(i + 1) % d.length].id });
    }
    await ctx.refresh("audioDevices");
  });
  ctx.popup("audioOutput", async () => ({}));

  // ---------- Krypto ----------
  const COINS = [["bitcoin", "BTC", "Bitcoin"], ["ethereum", "ETH", "Ethereum"], ["solana", "SOL", "Solana"], ["ripple", "XRP", "XRP"], ["cardano", "ADA", "Cardano"], ["dogecoin", "DOGE", "Dogecoin"], ["litecoin", "LTC", "Litecoin"], ["polkadot", "DOT", "Polkadot"], ["chainlink", "LINK", "Chainlink"], ["tether", "USDT", "Tether"]];
  ctx.provide("crypto", 5 * 60_000, async () => {
    const e = einst("crypto", { coins: ["bitcoin", "ethereum"], currency: "eur" });
    const j = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${e.coins.join(",")}&vs_currencies=${e.currency}&include_24hr_change=true`);
    return {
      currency: e.currency,
      coins: e.coins.filter((id) => j[id]).map((id) => {
        const c = COINS.find((x) => x[0] === id) || [id, id.toUpperCase(), id];
        return { id, sym: c[1], name: c[2], price: j[id][e.currency], change: j[id][`${e.currency}_24h_change`] };
      }),
    };
  });
  ctx.popup("crypto", async () => ({ all: COINS, chosen: einst("crypto", { coins: ["bitcoin", "ethereum"], currency: "eur" }) }));
  ctx.action("crypto", async (a, v) => {
    const e = einst("crypto", { coins: ["bitcoin", "ethereum"], currency: "eur" });
    if (a === "toggle") e.coins = e.coins.includes(v) ? e.coins.filter((x) => x !== v) : [...e.coins, v].slice(0, 6);
    if (a === "currency" && ["eur", "usd", "chf", "gbp"].includes(v)) e.currency = v;
    speichern("crypto", e);
    await ctx.refresh("crypto");
  });

  // ---------- Aktien ----------
  ctx.provide("stocks", 5 * 60_000, async () => {
    const e = einst("stocks", { symbols: ["^GDAXI", "AAPL", "MSFT"] });
    const out = [];
    for (const s of e.symbols) {
      try {
        const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=1d&interval=15m`, { "User-Agent": "Mozilla/5.0" });
        const m = j.chart.result[0].meta;
        const prev = m.chartPreviousClose ?? m.previousClose;
        const closes = (j.chart.result[0].indicators.quote[0].close || []).filter((x) => x != null);
        out.push({ sym: s, name: m.shortName || m.longName || s, price: m.regularMarketPrice, cur: m.currency, change: prev ? ((m.regularMarketPrice - prev) / prev) * 100 : null, spark: closes.slice(-30) });
      } catch {
        out.push({ sym: s, error: true });
      }
    }
    return out;
  });
  ctx.popup("stocks", async () => ({ symbols: einst("stocks", { symbols: ["^GDAXI", "AAPL", "MSFT"] }).symbols }));
  ctx.action("stocks", async (a, v) => {
    const e = einst("stocks", { symbols: ["^GDAXI", "AAPL", "MSFT"] });
    if (a === "add" && typeof v === "string" && /^[\^A-Za-z0-9.\-=]{1,15}$/.test(v.trim())) e.symbols = [...new Set([...e.symbols, v.trim().toUpperCase()])].slice(0, 10);
    if (a === "remove") e.symbols = e.symbols.filter((x) => x !== v);
    if (a === "open") shell.openExternal(`https://finance.yahoo.com/quote/${encodeURIComponent(v)}`);
    speichern("stocks", e);
    await ctx.refresh("stocks");
  });

  // ---------- Währungen ----------
  ctx.provide("currency", 60 * 60_000, async () => {
    const e = einst("currency", { base: "EUR", show: ["USD", "GBP", "CHF"] });
    const j = await getJson(`https://api.frankfurter.app/latest?from=${e.base}`);
    return { base: e.base, date: j.date, rates: j.rates, show: e.show };
  });
  ctx.popup("currency", async () => ({}));
  ctx.action("currency", async (a, v) => {
    const e = einst("currency", { base: "EUR", show: ["USD", "GBP", "CHF"] });
    if (a === "base" && /^[A-Z]{3}$/.test(v)) e.base = v;
    if (a === "toggle" && /^[A-Z]{3}$/.test(v)) e.show = e.show.includes(v) ? e.show.filter((x) => x !== v) : [...e.show, v].slice(0, 4);
    speichern("currency", e);
    await ctx.refresh("currency");
  });
}

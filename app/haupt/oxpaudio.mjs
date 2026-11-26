// OldschoolXP Audio – Mikro-Status, Szenen und Stream-Lautheit über die lokale Schnittstelle
// von OldschoolXP Audio (http://127.0.0.1:47811). Die Anfragen laufen bewusst hier im Hauptprozess:
// OldschoolXP Audio lehnt Anfragen mit Origin-Kopfzeile (also aus Browser-Fenstern) ab.
//   GET  /api/events                       laufende Meldungen (Server-Sent Events)
//   GET  /api/state                        derselbe Zustand einmalig
//   POST /api/channel/<id>/both/mute       ?value=true|false|toggle
//   POST /api/scene/<id>
import http from "node:http";

const PORT = Number(process.env.OXP_DOCK_AUDIO_PORT) || 47811;
const NEU_VERSUCH_MS = 4000;

export default function register(ctx) {
  ctx.widget({
    id: "oxpAudio",
    group: "oxp",
    name: "OldschoolXP Audio",
    desc: "Mikro-Status aus OldschoolXP Audio (Klick = stumm/an), im Fenster Szenen und Stream-Lautheit",
    data: ["oxpAudio"],
  });

  let anfrage = null; // laufende Event-Verbindung
  let letzterTakt = 0; // wann die Datenquelle zuletzt gebraucht wurde
  let zuletzt = null; // letzter Zustand von OldschoolXP Audio
  let sigLeiste = "";
  let sigLaut = "";

  function verteilen(st) {
    zuletzt = st;
    const ch = (st.channels || []).find((c) => c.name.toLowerCase() === (st.mic?.name || "").toLowerCase());
    // ältere Versionen ohne „mic“: erster Kanal namens Mikrofon
    const micKanal = ch || (st.channels || []).find((c) => /mikro|mic/i.test(c.name));
    const mic = st.mic
      ? { name: st.mic.name, muted: !!st.mic.muted, id: ch?.id || null }
      : micKanal
        ? { name: micKanal.name, muted: !!(micKanal.stream?.mute || st.mixes?.stream?.mute), id: micKanal.id }
        : null;
    const leiste = { verbunden: true, version: st.version || null, mic, scenes: st.scenes || [] };
    const s1 = JSON.stringify(leiste);
    if (s1 !== sigLeiste) {
      sigLeiste = s1;
      ctx.set("oxpAudio", leiste);
    }
    const laut = { s: st.lufs?.s ?? null, i: st.lufs?.i ?? null, m: st.lufs?.m ?? null };
    const s2 = JSON.stringify(laut);
    if (s2 !== sigLaut) {
      sigLaut = s2;
      ctx.set("oxpAudioLufs", laut);
    }
  }

  function getrennt() {
    zuletzt = null;
    const leiste = { verbunden: false };
    const s = JSON.stringify(leiste);
    if (s !== sigLeiste) {
      sigLeiste = s;
      ctx.set("oxpAudio", leiste);
    }
    if (sigLaut !== "null") {
      sigLaut = "null";
      ctx.set("oxpAudioLufs", null);
    }
  }

  function verbinden() {
    if (anfrage) return;
    let puffer = "";
    const req = http.get({ host: "127.0.0.1", port: PORT, path: "/api/events", headers: { accept: "text/event-stream" }, timeout: 5000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        req.destroy();
        return;
      }
      req.setTimeout(0);
      res.setEncoding("utf8");
      res.on("data", (teil) => {
        // nicht mehr gebraucht (Widget entfernt)? Dann Verbindung schließen
        if (Date.now() - letzterTakt > 3 * NEU_VERSUCH_MS) return req.destroy();
        puffer += teil;
        let i;
        while ((i = puffer.indexOf("\n\n")) >= 0) {
          const block = puffer.slice(0, i);
          puffer = puffer.slice(i + 2);
          const zeilen = block.split("\n").filter((z) => z.startsWith("data:")).map((z) => z.slice(5).trimStart());
          if (!zeilen.length) continue;
          try {
            verteilen(JSON.parse(zeilen.join("\n")));
          } catch {}
        }
      });
      res.on("end", () => req.destroy());
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => {});
    req.on("close", () => {
      if (anfrage === req) anfrage = null;
      getrennt();
    });
    anfrage = req;
  }

  function senden(methode, pfad) {
    return new Promise((resolve) => {
      const req = http.request({ host: "127.0.0.1", port: PORT, path: pfad, method: methode, timeout: 3000 }, (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (t) => (text += t));
        res.on("end", () => {
          try {
            resolve({ ok: res.statusCode === 200, daten: JSON.parse(text) });
          } catch {
            resolve({ ok: false });
          }
        });
      });
      req.on("timeout", () => req.destroy());
      req.on("error", () => resolve({ ok: false }));
      req.end();
    });
  }

  async function nachladen() {
    const r = await senden("GET", "/api/state");
    if (r.ok) verteilen(r.daten);
  }

  // läuft nur, solange das Widget in der Leiste ist: Verbindung halten bzw. alle paar Sekunden neu versuchen
  ctx.provide("oxpAudio", NEU_VERSUCH_MS, async () => {
    letzterTakt = Date.now();
    if (!anfrage) {
      if (!zuletzt && sigLeiste === "") getrennt(); // erster Start: „nicht gestartet“ zeigen, bis Daten kommen
      verbinden();
    }
    return undefined;
  });

  ctx.popup("oxpAudio", async () => ({}));
  ctx.action("oxpAudio", async (aktion, wert) => {
    if (!zuletzt) {
      await nachladen();
      if (!zuletzt) return { ok: false };
    }
    let r = { ok: false };
    if (aktion === "mute") {
      const mic = ctx.get("oxpAudio")?.mic;
      if (!mic) return { ok: false };
      // ausdrücklich an/aus statt „toggle“: so passen Monitor und Stream danach sicher zusammen
      const ziel = mic.muted ? "false" : "true";
      r = await senden("POST", `/api/channel/${encodeURIComponent(mic.id || mic.name)}/both/mute?value=${ziel}`);
    }
    if (aktion === "scene" && wert) r = await senden("POST", `/api/scene/${encodeURIComponent(wert)}`);
    await nachladen();
    return { ok: r.ok };
  });
}

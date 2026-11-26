// OldschoolXP – eigene Programme: Fenster für OldschoolXP Audio (Mikro, Szenen, Stream-Lautheit).
(() => {
  const A = OXPAnsichten;
  const lufs = (v) => (v == null || v < -70 ? "–" : v.toFixed(1).replace(".", ",").replace("-", "−"));
  // YouTube/Twitch: etwa −14 LUFS. Grün in der Nähe, gelb etwas daneben, rot deutlich zu laut/leise
  const farbe = (v) => (v == null || v < -70 ? "var(--leise)" : Math.abs(v + 14) <= 2 ? "#3ddc84" : Math.abs(v + 14) <= 5 ? "#ffb02e" : "var(--live)");

  A.add(
    "oxpAudio",
    (k, d, w) => {
      const a = w.daten("oxpAudio") || { verbunden: false };
      if (!a.verbunden) {
        k.innerHTML = `<div style="width:300px"><h3>OldschoolXP Audio</h3>
          <div class="gross" style="font-size:16px">Audio nicht gestartet</div>
          <p class="leise" style="font-size:12px">Sobald OldschoolXP Audio läuft, erscheinen hier Mikro, Szenen und Lautheit. Das Dock versucht es alle paar Sekunden von selbst.</p></div>`;
        return;
      }
      const l = w.daten("oxpAudioLufs") || {};
      const m = a.mic;
      const szenen = a.scenes || [];
      k.innerHTML = `<div style="width:300px">
        <h3>OldschoolXP Audio${a.version ? ` · ${w.esc(a.version)}` : ""}</h3>
        ${m ? `<div class="zeile"><span class="fuell">${w.esc(m.name)}</span><button class="knopf ${m.muted ? "" : "an"}" id="stumm" style="${m.muted ? "background:color-mix(in srgb, var(--live) 70%, transparent);border-color:var(--live)" : ""}">${m.muted ? "Mikro stumm" : "Mikro an"}</button></div>` : '<p class="leise">Kein Mikrofon-Kanal gefunden.</p>'}
        <h3 style="margin-top:10px">Szenen</h3>
        ${szenen.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px">${szenen.map((s) => `<button class="knopf ${s.active ? "an" : ""}" data-szene="${w.esc(s.id)}">${w.esc(s.name)}</button>`).join("")}</div>` : '<p class="leise" style="font-size:12px">Noch keine Szenen. Szenen legst du im Mischpult von OldschoolXP Audio an.</p>'}
        <h3 style="margin-top:12px">Stream-Lautheit</h3>
        <div class="zeile" style="gap:18px">
          <div><div class="leise" style="font-size:11px">kurzzeitig</div><b style="font-size:20px;color:${farbe(l.s)}">${lufs(l.s)}</b> <span class="leise">LUFS</span></div>
          <div><div class="leise" style="font-size:11px">gesamt</div><b style="font-size:20px;color:${farbe(l.i)}">${lufs(l.i)}</b> <span class="leise">LUFS</span></div>
        </div>
        <p class="leise" style="font-size:10.5px;margin:2px 0 0">Ziel für YouTube und Twitch: etwa −14 LUFS</p></div>`;
      const st = k.querySelector("#stumm");
      if (st) st.onclick = () => w.aktion("mute");
      k.querySelectorAll("[data-szene]").forEach((b) => (b.onclick = () => w.aktion("scene", b.dataset.szene)));
    },
    { keys: ["oxpAudio", "oxpAudioLufs"] },
  );
})();

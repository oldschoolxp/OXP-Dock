// OldschoolXP – eigene Programme: OldschoolXP Audio (Mikro-Status) in der Leiste.
(() => {
  const W = OXPWidgets;
  const mic = (m) =>
    `<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>${m ? '<path d="M3 3l18 18"/>' : ""}</svg>`;

  W.add("oxpAudio", {
    keys: ["oxpAudio"],
    render(el, c) {
      const a = c.daten("oxpAudio");
      if (!a) return false;
      if (!a.verbunden) {
        el.innerHTML = `${mic(false)}<span class="klein">Audio aus</span>`;
        el.classList.remove("warnung");
        el.classList.add("aus");
        el.dataset.tip = "OldschoolXP Audio ist nicht gestartet – klicken für Details";
        return;
      }
      const m = a.mic;
      const stumm = !!m?.muted;
      const szene = (a.scenes || []).find((s) => s.active);
      el.classList.remove("aus");
      el.classList.toggle("warnung", stumm);
      el.innerHTML = `${mic(stumm)}<div class="stack"><span class="klein">${szene ? c.esc(szene.name) : "Mikro"}</span><span class="gross">${m ? (stumm ? "stumm" : "an") : "–"}</span></div>`;
      el.dataset.tip = m
        ? `${stumm ? "Mikrofon ist stumm – klicken zum Einschalten" : "Mikrofon an – klicken zum Stummschalten"} · Rechtsklick = Szenen & Lautheit`
        : "Kein Mikrofon-Kanal in OldschoolXP Audio";
    },
    click(el, c) {
      const a = c.daten("oxpAudio");
      if (a?.verbunden && a.mic) c.aktion("mute");
      else c.oeffnen();
    },
    context: (el, c) => c.oeffnen(),
  });
})();

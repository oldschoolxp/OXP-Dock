// Stufe 5: Konten & KI – Darstellung in der Leiste.
(() => {
  const W = OXPWidgets;
  const svg = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
  const zahl = (n) => (n == null ? "–" : n >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " Mio." : n >= 1e4 ? (n / 1e3).toFixed(1).replace(".", ",") + " Tsd." : n.toLocaleString("de-DE"));
  window.OXPzahl = zahl;
  const L = {
    twitch: `<svg viewBox="0 0 24 24" class="marke" style="color:#9146ff"><path class="fill" d="M4 3l-1 4v13h5v3h3l3-3h4l5-5V3zm16 11-3 3h-5l-3 3v-3H5V5h15z"/><path class="fill" d="M15 8h2v5h-2zM10 8h2v5h-2z"/></svg>`,
    youtube: `<svg viewBox="0 0 24 24" class="marke" style="color:#ff0033"><path class="fill" d="M22 8.2a3 3 0 0 0-2.1-2.1C18 5.6 12 5.6 12 5.6s-6 0-7.9.5A3 3 0 0 0 2 8.2 31 31 0 0 0 1.6 12 31 31 0 0 0 2 15.8a3 3 0 0 0 2.1 2.1c1.9.5 7.9.5 7.9.5s6 0 7.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .4-3.8 31 31 0 0 0-.4-3.8zM10 15V9l5.2 3z"/></svg>`,
    mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
    github: `<svg viewBox="0 0 24 24" class="marke"><path class="fill" d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2z"/></svg>`,
    whatsapp: `<svg viewBox="0 0 24 24" class="marke" style="color:#25d366"><path class="fill" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2s-1 .3-3.4-.7a11.6 11.6 0 0 1-4.6-4.1c-.4-.5-1-1.6-1-2.9s.7-2 1-2.3c.2-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.4.6-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.4 1.8 2.2 1.2 1.1 2.2 1.4 2.5 1.6.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.6.3.1.2.1.7-.1 1.2z"/></svg>`,
    ai: svg('<path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16 10.2 11.3 5.5 9.5l4.7-1.8z" class="fill"/><path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" class="fill"/>'),
  };

  W.add("social", {
    keys: ["social"],
    render(el, c) {
      const s = c.daten("social");
      if (!s) return false;
      const teile = [];
      if (s.twitch) teile.push(`${L.twitch}<div class="stack"><span class="klein">Follower</span><span class="gross">${zahl(s.twitch.followers)}</span></div>`);
      if (s.youtube) teile.push(`${L.youtube}<div class="stack"><span class="klein">Abos</span><span class="gross">${zahl(s.youtube.subscribers)}</span></div>`);
      el.innerHTML = teile.join('<span class="mini-sep"></span>') || `${L.twitch}<span class="klein">keine Zahlen</span>`;
      el.dataset.tip = "Twitch-Follower und YouTube-Abonnenten";
    },
  });
  W.add("outlookMail", {
    keys: ["outlookMail"],
    render(el, c) {
      const m = c.daten("outlookMail");
      if (!m) return false;
      el.innerHTML = `${L.mail}<div class="stack"><span class="klein">Outlook</span><span class="gross">${m.running ? (m.unread ? m.unread + " neu" : "alles gelesen") : "geschlossen"}</span></div>`;
      el.classList.toggle("an", !!m.unread);
      el.dataset.tip = m.running ? "Ungelesene Mails im Posteingang" : "Outlook ist nicht geöffnet";
    },
  });
  W.add("gmail", {
    keys: ["gmail"],
    render(el, c) {
      const g = c.daten("gmail");
      if (!g) return false;
      el.innerHTML = `${L.mail}<div class="stack"><span class="klein">Gmail</span><span class="gross">${g.setup ? "einrichten" : g.error ? "Fehler" : g.unread ? g.unread + " neu" : "alles gelesen"}</span></div>`;
      el.classList.toggle("an", !!g.unread);
      el.dataset.tip = g.error || g.user || "Gmail einrichten";
    },
  });
  W.add("github", {
    keys: ["github"],
    render(el, c) {
      const g = c.daten("github");
      if (!g) return false;
      if (g.error) {
        el.innerHTML = `${L.github}<span class="klein">nicht angemeldet</span>`;
        el.dataset.tip = "GitHub-CLI anmelden: gh auth login";
        return;
      }
      const tage = g.days.slice(-14);
      const max = Math.max(1, ...tage.map((d) => d.contributionCount));
      el.innerHTML = `${L.github}<span class="beitraege">${tage.map((d) => `<i style="opacity:${d.contributionCount ? 0.35 + (0.65 * d.contributionCount) / max : 0.12}"></i>`).join("")}</span><div class="stack"><span class="klein">heute ${g.today}</span><span class="gross">${g.notifications.length ? g.notifications.length + " 🔔" : g.total + " im Jahr"}</span></div>`;
      el.dataset.tip = `${g.login}: ${g.total} Beiträge im letzten Jahr`;
    },
  });
  W.add("whatsapp", {
    keys: ["windows"],
    render(el, c) {
      const offen = (c.fenster || []).some((x) => /whatsapp/i.test(x.exe || ""));
      el.innerHTML = `${L.whatsapp}<span class="klein">${offen ? "offen" : "WhatsApp"}</span>`;
      el.dataset.tip = offen ? "WhatsApp nach vorne holen" : "WhatsApp öffnen";
    },
    click: (el, c) => c.aktion("open"),
  });
  W.add("aiLimits", {
    keys: ["ai"],
    render(el, c) {
      const a = c.daten("ai");
      if (!a) return false;
      const teile = a.providers.map((p) => {
        if (p.error) return `<div class="stack"><span class="klein">${c.esc(p.name)}</span><span class="klein">⚠</span></div>`;
        if (p.balance) return `<div class="stack"><span class="klein">${c.esc(p.name)}</span><span class="gross">${c.esc(p.balance)}</span></div>`;
        const max = p.windows.reduce((m, x) => (x.pct > m.pct ? x : m), { pct: -1 });
        return `<div class="stack"><span class="klein">${c.esc(p.name)}</span><span class="gross ${max.pct >= 90 ? "minus" : ""}">${max.pct >= 0 ? max.pct + "%" : "–"}</span></div>`;
      });
      el.innerHTML = `${L.ai}${teile.join('<span class="mini-sep"></span>') || '<span class="klein">keine KI angemeldet</span>'}`;
      el.dataset.tip = "KI-Limits · höchste Auslastung je Anbieter";
    },
  });
})();

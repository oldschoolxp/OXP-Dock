// Stufe 5: Konten & KI – Fenster über der Leiste.
(() => {
  const A = OXPAnsichten;
  const zahl = (n) => (n == null ? "–" : n.toLocaleString("de-DE"));
  const wann = (iso) => {
    if (!iso) return "";
    const min = Math.round((new Date(iso) - Date.now()) / 60000);
    if (min <= 0) return "jetzt";
    if (min < 60) return `in ${min} Min.`;
    if (min < 24 * 60) return `in ${Math.floor(min / 60)} Std. ${min % 60} Min.`;
    return new Date(iso).toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  };
  const balken = (pct) =>
    `<div style="height:6px;border-radius:3px;background:#2c2836;overflow:hidden;margin-top:3px"><i style="display:block;height:100%;width:${Math.min(100, pct)}%;background:${pct >= 90 ? "var(--live)" : pct >= 70 ? "#ffb02e" : "var(--lila)"}"></i></div>`;

  A.add(
    "social",
    (k, d, w) => {
      const s = w.daten("social") || {};
      k.innerHTML = `<div style="width:300px"><h3>OldschoolXP in Zahlen</h3>
        ${s.twitch ? `<button class="eintrag" data-a="twitch" style="width:100%"><b style="color:#9146ff;width:70px">Twitch</b><span class="fuell" style="flex:1">Follower</span><b>${zahl(s.twitch.followers)}</b></button>` : '<p class="leise">Twitch-Zahlen gerade nicht verfügbar.</p>'}
        ${s.youtube ? `<button class="eintrag" data-a="youtube" style="width:100%"><b style="color:#ff0033;width:70px">YouTube</b><span style="flex:1">Abonnenten</span><b>${zahl(s.youtube.subscribers)}</b></button>
          <div class="eintrag"><span style="width:70px"></span><span style="flex:1" class="leise">Aufrufe</span><span>${zahl(s.youtube.views)}</span></div>
          <div class="eintrag"><span style="width:70px"></span><span style="flex:1" class="leise">Videos</span><span>${zahl(s.youtube.videos)}</span></div>` : '<p class="leise">YouTube-Zahlen gerade nicht verfügbar.</p>'}
        <p class="leise" style="font-size:10.5px;margin:6px 0 0">Stand ${s.at ? new Date(s.at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "–"} · aktualisiert alle 15 Minuten</p></div>`;
      k.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => (w.aktion(b.dataset.a), w.schliessen())));
    },
    { keys: ["social"] },
  );

  A.add(
    "outlookMail",
    (k, d, w) => {
      const m = w.daten("outlookMail") || {};
      const f = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      k.innerHTML = `<div style="width:360px"><h3>Outlook · ${m.running ? (m.unread || 0) + " ungelesen" : "nicht geöffnet"}</h3>
        <div class="liste">${(m.latest || []).map((x) => `<div class="eintrag" style="align-items:flex-start"><span style="flex:1;min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${w.esc(x.from)}</b><span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${w.esc(x.subject)}</span></span><span class="leise" style="font-size:11px">${f.format(new Date(x.when))}</span></div>`).join("") || `<p class="leise">${m.running ? "Keine ungelesenen Mails." : "Öffne Outlook, dann erscheinen hier deine ungelesenen Mails."}</p>`}</div>
        <div class="zeile" style="justify-content:flex-end"><button class="knopf an" id="auf">Outlook öffnen</button></div></div>`;
      k.querySelector("#auf").onclick = () => (w.aktion("open"), w.schliessen());
    },
    { keys: ["outlookMail"] },
  );

  A.add(
    "gmail",
    (k, d, w) => {
      const g = w.daten("gmail") || { setup: true };
      if (g.setup || g.error) {
        k.innerHTML = `<div style="width:340px"><h3>Gmail einrichten</h3>
          ${g.error ? `<p style="color:var(--live)">${w.esc(g.error)}</p>` : ""}
          <p class="leise" style="font-size:12px">Gmail braucht ein <b>App-Passwort</b> (nicht dein normales Passwort). Das erstellst du bei Google unter „App-Passwörter“ – dafür muss die Bestätigung in zwei Schritten an sein. Das Dock speichert es verschlüsselt nur auf diesem PC.</p>
          <div class="zeile" style="padding:3px 0"><input class="eingabe" id="user" placeholder="deine.adresse@gmail.com" value="${w.esc(g.user || "")}"></div>
          <div class="zeile" style="padding:3px 0"><input class="eingabe" id="pw" type="password" placeholder="App-Passwort (16 Zeichen)"></div>
          <div class="zeile" style="justify-content:space-between"><button class="knopf" id="hilfe">App-Passwort erstellen ↗</button><button class="knopf an" id="ok">Speichern</button></div></div>`;
        k.querySelector("#hilfe").onclick = () => w.aktion("help");
        k.querySelector("#ok").onclick = async () => {
          await w.aktion("save", { user: k.querySelector("#user").value, pw: k.querySelector("#pw").value });
          k.querySelector("#pw").value = "";
        };
        return;
      }
      k.innerHTML = `<div style="width:280px"><h3>Gmail</h3><div class="gross">${g.unread} ungelesen</div><p class="leise">${w.esc(g.user)}</p>
        <div class="zeile" style="justify-content:space-between"><button class="knopf" id="weg">Abmelden</button><button class="knopf an" id="auf">Gmail öffnen</button></div></div>`;
      k.querySelector("#auf").onclick = () => (w.aktion("open"), w.schliessen());
      k.querySelector("#weg").onclick = () => w.aktion("forget");
    },
    { keys: ["gmail"] },
  );

  A.add(
    "github",
    (k, d, w) => {
      const g = w.daten("github") || {};
      if (g.error) {
        k.innerHTML = `<div style="width:300px"><h3>GitHub</h3><p class="leise">Die GitHub-CLI ist nicht angemeldet. Im Terminal einmal <b>gh auth login</b> ausführen.</p></div>`;
        return;
      }
      const max = Math.max(1, ...(g.days || []).map((x) => x.contributionCount));
      k.innerHTML = `<div style="width:360px"><h3>GitHub · ${w.esc(g.login || "")}</h3>
        <div style="display:grid;grid-template-rows:repeat(7,9px);grid-auto-flow:column;gap:2px;margin-bottom:6px">${(g.days || [])
          .map((x) => `<i title="${x.date}: ${x.contributionCount}" style="width:9px;height:9px;border-radius:2px;background:${x.contributionCount ? `rgba(57,211,83,${0.3 + (0.7 * x.contributionCount) / max})` : "#2c2836"}"></i>`)
          .join("")}</div>
        <p class="leise" style="margin:0 0 8px">${g.total} Beiträge im letzten Jahr · heute ${g.today}</p>
        <h3>Benachrichtigungen (${(g.notifications || []).length})</h3><div class="liste" style="max-height:200px">${
          (g.notifications || []).map((n) => `<div class="eintrag" style="display:block"><b style="display:block;font-size:12px">${w.esc(n.title)}</b><span class="leise" style="font-size:11px">${w.esc(n.repo)} · ${w.esc(n.type)}</span></div>`).join("") || '<p class="leise">Keine neuen Benachrichtigungen.</p>'
        }</div>
        <div class="zeile" style="justify-content:flex-end"><button class="knopf" id="profil">Profil</button><button class="knopf an" id="auf">Benachrichtigungen</button></div></div>`;
      k.querySelector("#auf").onclick = () => (w.aktion("open"), w.schliessen());
      k.querySelector("#profil").onclick = () => (w.aktion("profile"), w.schliessen());
    },
    { keys: ["github"] },
  );

  // ---------- Claude-Nutzung (Klick auf das Claude-Widget) ----------
  A.add(
    "claude",
    (k, d, w) => {
      const c = w.daten("claude");
      const prognose = (part, std) => {
        if (!part?.resetsAt || !part.pct) return "";
        const total = std * 3600_000;
        const vergangen = total - (new Date(part.resetsAt) - Date.now());
        if (vergangen < total * 0.08) return "";
        return `<span class="leise" style="font-size:11px"> · bei diesem Tempo ~${Math.round(part.pct / (vergangen / total))}% zum Reset</span>`;
      };
      const zeile = (titel, part, std) =>
        part
          ? `<div style="margin:8px 0"><div style="display:flex;justify-content:space-between"><b>${titel}</b><b>${part.pct}%</b></div>${balken(part.pct)}
             <div class="leise" style="font-size:11.5px;margin-top:3px">Reset ${wann(part.resetsAt)}${prognose(part, std)}</div></div>`
          : "";
      if (!c) {
        k.innerHTML = `<div style="width:320px"><h3>Claude-Nutzung</h3><p class="leise">Wird geladen …</p></div>`;
        return;
      }
      if (c.error) {
        k.innerHTML = `<div style="width:340px"><h3>Claude-Nutzung</h3><p style="color:var(--live);margin:6px 0">${w.esc(c.error)}</p>
          <p class="leise" style="font-size:12px">Das Dock liest die Anmeldung von Claude Code auf diesem PC und erneuert sie bei Bedarf selbst. Klappt das nicht mehr, muss man sich einmal neu anmelden.</p>
          <div class="zeile" style="justify-content:space-between"><button class="knopf" id="web">Auf claude.ai ansehen</button><button class="knopf an" id="neu">Nochmal versuchen</button></div></div>`;
      } else {
        k.innerHTML = `<div style="width:340px"><h3>Claude-Nutzung${c.plan ? " · " + w.esc(c.plan) : ""}</h3>
          ${zeile("Sitzung (5 Stunden)", c.session, 5)}${zeile("Woche (alle Modelle)", c.week, 168)}${zeile("Woche (Opus)", c.opus, 168)}
          <div class="leise" style="font-size:10.5px">Stand ${c.at ? new Date(c.at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "–"}${c.renewed ? " · Anmeldung wurde gerade erneuert" : ""}</div>
          <div class="zeile" style="justify-content:space-between"><button class="knopf" id="web">Auf claude.ai ansehen</button><button class="knopf an" id="neu">Aktualisieren</button></div></div>`;
      }
      k.querySelector("#web").onclick = () => (w.aktion("open"), w.schliessen());
      k.querySelector("#neu").onclick = (e) => {
        e.target.textContent = "…";
        w.aktion("refresh");
      };
    },
    { keys: ["claude"] },
  );

  A.add(
    "aiLimits",
    (k, d, w) => {
      const a = w.daten("ai") || { providers: [], settings: {} };
      const s = a.settings || {};
      k.innerHTML = `<div style="width:360px"><h3>KI-Limits</h3>${
        a.providers
          .map((p) => {
            if (p.error) return `<div style="margin:6px 0"><b>${w.esc(p.name)}</b> <span class="leise" style="font-size:11.5px">· ${w.esc(p.error)}</span></div>`;
            if (p.balance) return `<div class="zeile"><b class="fuell">${w.esc(p.name)}</b><span>Guthaben ${w.esc(p.balance)}</span></div>`;
            return `<button class="eintrag" data-open="${w.esc(p.name)}" style="display:block;width:100%;margin:4px 0"><b>${w.esc(p.name)}</b>${p.plan ? ` <span class="leise">(${w.esc(p.plan)})</span>` : ""}${p.windows
              .map((x) => `<div style="margin-top:5px"><div style="display:flex;justify-content:space-between;font-size:11.5px"><span>${w.esc(x.label)}</span><span class="leise">${x.resetsAt ? "Reset " + wann(x.resetsAt) : ""}</span><b>${x.pct}%</b></div>${balken(x.pct)}</div>`)
              .join("")}</button>`;
          })
          .join("") || '<p class="leise">Kein KI-Programm auf diesem PC angemeldet.</p>'
      }
        <h3 style="margin-top:10px">Anbieter</h3><div style="display:flex;gap:4px;flex-wrap:wrap">${[["claude", "Claude Code"], ["chatgpt", "ChatGPT (Codex)"], ["gemini", "Gemini CLI"]]
          .map(([id, n]) => `<button class="knopf ${s[id] ? "an" : ""}" data-t="${id}">${n}</button>`)
          .join("")}</div>
        <div class="zeile" style="padding:6px 0 0"><input class="eingabe" id="ds" type="password" placeholder="${s.deepseek ? "DeepSeek-Schlüssel gespeichert – neu eintragen oder leer lassen" : "DeepSeek-API-Schlüssel (optional)"}"><button class="knopf" id="dsok">OK</button></div>
        <p class="leise" style="font-size:10.5px;margin:4px 0 0">Liest nur die Anmeldungen, die diese Programme auf deinem PC schon haben, und fragt damit beim jeweiligen Anbieter nach.</p></div>`;
      k.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => w.aktion("toggle", b.dataset.t)));
      k.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => w.aktion("open", b.dataset.open)));
      k.querySelector("#dsok").onclick = () => {
        w.aktion("deepseek", k.querySelector("#ds").value);
        k.querySelector("#ds").value = "";
      };
    },
    { keys: ["ai"] },
  );
})();

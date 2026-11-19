// Stufe 5: Konten & KI – Daten, Aktionen, Fenster-Inhalte.
// Grundsatz: Das Dock gibt nie selbst Passwörter ein. Logins kommen entweder aus Programmen,
// die auf diesem PC schon angemeldet sind (Outlook, GitHub-CLI, Claude Code, Codex, Gemini CLI),
// oder du trägst einen Schlüssel/ein App-Passwort selbst im Widget-Fenster ein (verschlüsselt gespeichert).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import { execFile } from "node:child_process";
import { safeStorage } from "electron";
import { claudeUsage } from "../claude-login.mjs";
import { holen as fetch } from "../netz.mjs";

export default function register(ctx, h) {
  const { shell, systemhelfer: sh, getJson, WEBSITE } = h;
  const w = (id, name, desc, data = []) => ctx.widget({ id, group: "konten", name, desc, data });

  w("social", "Follower & Abos", "Twitch-Follower und YouTube-Abonnenten von OldschoolXP", ["social"]);
  w("outlookMail", "Outlook-Mails", "Ungelesene Mails aus Outlook (wenn Outlook geöffnet ist)", ["outlookMail"]);
  w("gmail", "Gmail", "Ungelesene Gmail-Mails (App-Passwort im Fenster eintragen)", ["gmail"]);
  w("github", "GitHub", "Beiträge und Benachrichtigungen (nutzt die GitHub-CLI-Anmeldung)", ["github"]);
  w("whatsapp", "WhatsApp", "WhatsApp öffnen oder nach vorne holen", ["windows"]);
  w("aiLimits", "KI-Limits", "Claude, ChatGPT (Codex), Gemini (Gemini CLI), DeepSeek – liest die Anmeldungen dieser Programme auf diesem PC", ["ai"]);

  const einst = (id, def) => ({ ...def, ...(ctx.config().widgetSettings?.[id] || {}) });
  const speichern = (id, wert) => {
    ctx.config().widgetSettings[id] = wert;
    h.saveConfig();
  };
  // Geheimnisse (App-Passwort, API-Schlüssel) nur verschlüsselt ablegen (Windows-Benutzerkonto)
  const geheimSpeichern = (id, feld, wert) => {
    const e = einst(id, {});
    e[feld] = wert ? safeStorage.encryptString(wert).toString("base64") : null;
    speichern(id, e);
  };
  const geheim = (id, feld) => {
    const v = einst(id, {})[feld];
    if (!v) return null;
    try {
      return safeStorage.decryptString(Buffer.from(v, "base64"));
    } catch {
      return null;
    }
  };

  // ---------- Follower & Abos (Website) ----------
  ctx.provide("social", 15 * 60_000, () => getJson(`${WEBSITE}/api/social-stats`));
  ctx.action("social", async (a) => {
    if (a === "twitch") shell.openExternal("https://dashboard.twitch.tv/");
    if (a === "youtube") shell.openExternal("https://studio.youtube.com/");
  });
  ctx.popup("social", async () => ({}));

  // ---------- Outlook ----------
  ctx.provide("outlookMail", 60_000, () => sh.call("outlookUnread", { list: true }, 30_000));
  ctx.action("outlookMail", async () => {
    const outlook = h.windows().find((x) => /outlook\.exe$/i.test(x.exe));
    if (outlook) h.win.activate(outlook.hwnd);
    else shell.openExternal("outlook:inbox").catch(() => {});
  });
  ctx.popup("outlookMail", async () => ({}));

  // ---------- Gmail per IMAP (App-Passwort) ----------
  ctx.provide("gmail", 3 * 60_000, async () => {
    const e = einst("gmail", {});
    const pw = geheim("gmail", "pw");
    if (!e.user || !pw) return { setup: true, user: e.user || "" };
    try {
      const unread = await imapUnread("imap.gmail.com", e.user, pw);
      return { user: e.user, unread };
    } catch (err) {
      return { user: e.user, error: err.message };
    }
  });
  ctx.action("gmail", async (a, v) => {
    if (a === "save" && v && typeof v.user === "string") {
      const e = einst("gmail", {});
      e.user = v.user.trim();
      speichern("gmail", e);
      if (typeof v.pw === "string" && v.pw) geheimSpeichern("gmail", "pw", v.pw.replace(/\s+/g, ""));
    }
    if (a === "forget") speichern("gmail", {});
    if (a === "open") shell.openExternal("https://mail.google.com/");
    if (a === "help") shell.openExternal("https://myaccount.google.com/apppasswords");
    await ctx.refresh("gmail");
  });
  ctx.popup("gmail", async () => ({}));

  // ---------- GitHub über die GitHub-CLI ----------
  const gh = (args) =>
    new Promise((res, rej) =>
      execFile("gh", args, { windowsHide: true, timeout: 20_000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => (err ? rej(new Error("GitHub-CLI nicht angemeldet")) : res(out))),
    );
  ctx.provide("github", 10 * 60_000, async () => {
    try {
      const q = "query { viewer { login contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { contributionCount date } } } } } }";
      const j = JSON.parse(await gh(["api", "graphql", "-f", "query=" + q]));
      const v = j.data.viewer;
      const days = v.contributionsCollection.contributionCalendar.weeks.flatMap((x) => x.contributionDays);
      let notes = [];
      try {
        notes = JSON.parse(await gh(["api", "notifications?per_page=20"]));
      } catch {}
      const heute = new Date().toLocaleDateString("sv-SE");
      return {
        login: v.login,
        total: v.contributionsCollection.contributionCalendar.totalContributions,
        today: days.find((d) => d.date === heute)?.contributionCount ?? 0,
        days: days.slice(-84),
        notifications: notes.map((n) => ({ title: n.subject?.title, repo: n.repository?.full_name, type: n.subject?.type })),
      };
    } catch (e) {
      return { error: e.message };
    }
  });
  ctx.action("github", async (a) => {
    if (a === "open") shell.openExternal("https://github.com/notifications");
    if (a === "profile") shell.openExternal(`https://github.com/${ctx.get("github")?.login || ""}`);
  });
  ctx.popup("github", async () => ({}));

  // ---------- WhatsApp ----------
  ctx.action("whatsapp", async () => {
    const wa = h.windows().find((x) => /whatsapp/i.test(x.exe) || /^WhatsApp/.test(x.title));
    if (wa) h.win.activate(wa.hwnd);
    else shell.openExternal("whatsapp:").catch(() => shell.openExternal("https://web.whatsapp.com/"));
  });

  // ---------- KI-Limits ----------
  const home = os.homedir();
  const lesen = (p) => {
    try {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  };
  async function claude() {
    let u;
    try {
      u = await claudeUsage();
    } catch (e) {
      return { name: "Claude", error: e.message };
    }
    if (u.error) return { name: "Claude", error: u.error };
    return {
      name: "Claude",
      plan: u.plan,
      windows: [u.session && { label: "Sitzung (5 Std.)", ...u.session }, u.week && { label: "Woche", ...u.week }].filter(Boolean),
    };
  }
  async function chatgpt() {
    const a = lesen(path.join(process.env.CODEX_HOME || path.join(home, ".codex"), "auth.json"));
    const t = a?.tokens;
    if (!t?.access_token) return a?.OPENAI_API_KEY ? { name: "ChatGPT", error: "Codex nutzt einen API-Schlüssel – mit ChatGPT-Konto anmelden (codex login)" } : null;
    const r = await fetch("https://chatgpt.com/backend-api/wham/usage", {
      headers: { Authorization: `Bearer ${t.access_token}`, "ChatGPT-Account-Id": t.account_id || "", "User-Agent": "oxp-dock" },
      signal: AbortSignal.timeout(15000),
    });
    if (r.status === 401) return { name: "ChatGPT", error: "Anmeldung abgelaufen – Codex kurz öffnen" };
    if (!r.ok) return { name: "ChatGPT", error: `Antwort ${r.status}` };
    const j = await r.json();
    const fenster = (x, label) =>
      x && {
        label: x.limit_window_seconds ? (x.limit_window_seconds <= 6 * 3600 ? "Sitzung (5 Std.)" : "Woche") : label,
        pct: Math.round(x.used_percent || 0),
        resetsAt: x.reset_at ? new Date(x.reset_at * (x.reset_at < 1e12 ? 1000 : 1)).toISOString() : x.reset_after_seconds ? new Date(Date.now() + x.reset_after_seconds * 1000).toISOString() : null,
      };
    return { name: "ChatGPT", plan: j.plan_type || "", windows: [fenster(j.rate_limit?.primary_window, "Sitzung"), fenster(j.rate_limit?.secondary_window, "Woche")].filter(Boolean) };
  }
  async function gemini() {
    const c = lesen(path.join(home, ".gemini", "oauth_creds.json"));
    if (!c?.access_token) return null;
    if (c.expiry_date && c.expiry_date < Date.now()) return { name: "Gemini", error: "Anmeldung abgelaufen – Gemini CLI kurz öffnen" };
    const post = async (method, body) => {
      const r = await fetch(`https://cloudcode-pa.googleapis.com/v1internal:${method}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${c.access_token}`, "Content-Type": "application/json", "User-Agent": "oxp-dock" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new Error(`Antwort ${r.status}`);
      return r.json();
    };
    try {
      const load = await post("loadCodeAssist", { metadata: { ideType: "IDE_UNSPECIFIED", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" } });
      const project = load.cloudaicompanionProject?.id || load.cloudaicompanionProject;
      const q = await post("retrieveUserQuota", { project });
      const buckets = (q.buckets || []).filter((b) => b.remainingFraction != null);
      // pro Modell den knappsten Wert zeigen
      const nachModell = new Map();
      for (const b of buckets) {
        const used = Math.round((1 - b.remainingFraction) * 100);
        const alt = nachModell.get(b.modelId);
        if (!alt || used > alt.pct) nachModell.set(b.modelId, { label: b.modelId || "Gemini", pct: used, resetsAt: b.resetTime || null });
      }
      return { name: "Gemini", plan: load.currentTier?.name || "", windows: [...nachModell.values()].slice(0, 3) };
    } catch (e) {
      return { name: "Gemini", error: e.message };
    }
  }
  async function deepseek() {
    const key = geheim("aiLimits", "deepseek");
    if (!key) return null;
    const r = await fetch("https://api.deepseek.com/user/balance", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { name: "DeepSeek", error: `Antwort ${r.status}` };
    const j = await r.json();
    const b = j.balance_infos?.[0];
    return { name: "DeepSeek", balance: b ? `${b.total_balance} ${b.currency}` : "–" };
  }
  let nochmalGeplant = null;
  ctx.provide("ai", 5 * 60_000, async () => {
    const e = einst("aiLimits", { claude: true, chatgpt: true, gemini: true });
    const jobs = [e.claude && claude(), e.chatgpt && chatgpt(), e.gemini && gemini(), deepseek()].filter(Boolean);
    const res = await Promise.all(jobs.map((p) => p.catch((err) => ({ name: "KI", error: err.message }))));
    // Netz gerade weg (WLAN-Wechsel, Aufwachen, VPN …)? Dann nicht 5 Minuten warten, sondern in 1 Minute nochmal
    if (res.some((x) => x?.error && /Verbindung|Zeitüberschreitung|nicht erreichbar/.test(x.error)) && !nochmalGeplant) {
      nochmalGeplant = setTimeout(() => {
        nochmalGeplant = null;
        ctx.refresh("ai");
      }, 60_000);
    }
    return { providers: res.filter(Boolean), settings: { claude: e.claude, chatgpt: e.chatgpt, gemini: e.gemini, deepseek: !!einst("aiLimits", {}).deepseek } };
  });
  ctx.action("aiLimits", async (a, v) => {
    const e = einst("aiLimits", { claude: true, chatgpt: true, gemini: true });
    if (a === "toggle" && ["claude", "chatgpt", "gemini"].includes(v)) {
      e[v] = !e[v];
      speichern("aiLimits", e);
    }
    if (a === "deepseek") geheimSpeichern("aiLimits", "deepseek", typeof v === "string" ? v.trim() : "");
    if (a === "open") {
      const urls = { Claude: "https://claude.ai/settings/usage", ChatGPT: "https://chatgpt.com/codex/settings/usage", Gemini: "https://aistudio.google.com/", DeepSeek: "https://platform.deepseek.com/usage" };
      if (urls[v]) shell.openExternal(urls[v]);
    }
    await ctx.refresh("ai");
  });
  ctx.popup("aiLimits", async () => ({}));
}

/** Minimaler IMAP-Abruf: nur Anmelden und Anzahl ungelesener Mails im Posteingang. */
function imapUnread(host, user, pass) {
  const quote = (s) => '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  return new Promise((resolve, reject) => {
    const sock = tls.connect(993, host, { servername: host });
    let buf = "";
    let step = 0;
    const timer = setTimeout(() => (sock.destroy(), reject(new Error("Zeitüberschreitung"))), 20_000);
    const fertig = (err, val) => {
      clearTimeout(timer);
      try {
        sock.write("a3 LOGOUT\r\n");
        sock.end();
      } catch {}
      err ? reject(err) : resolve(val);
    };
    sock.on("data", (d) => {
      buf += d.toString("utf8");
      if (step === 0 && /^\* OK/m.test(buf)) {
        step = 1;
        buf = "";
        sock.write(`a1 LOGIN ${quote(user)} ${quote(pass)}\r\n`);
      } else if (step === 1 && /^a1 /m.test(buf)) {
        if (!/^a1 OK/m.test(buf)) return fertig(new Error("Anmeldung abgelehnt – App-Passwort prüfen"));
        step = 2;
        buf = "";
        sock.write("a2 STATUS INBOX (UNSEEN)\r\n");
      } else if (step === 2 && /^a2 /m.test(buf)) {
        const m = /UNSEEN (\d+)/.exec(buf);
        fertig(m ? null : new Error("Antwort unverständlich"), m ? +m[1] : null);
      }
    });
    sock.on("error", (e) => fertig(new Error("Keine Verbindung: " + e.message)));
  });
}

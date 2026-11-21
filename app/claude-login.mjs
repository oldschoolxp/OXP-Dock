// Claude-Anmeldung für die Nutzungsanzeige.
// Liest die Claude-Code-Anmeldung (%USERPROFILE%\.claude\.credentials.json). Ist sie abgelaufen,
// holt das Dock mit dem Erneuerungs-Schlüssel eine frische Anmeldung bei Anthropic und schreibt sie
// zurück in dieselbe Datei – genau so, wie Claude Code es selbst macht. Die Schlüssel gehen nur an
// Anthropic und werden nirgends sonst gespeichert oder angezeigt.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { holen as fetch } from "./netz.mjs";

const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"; // öffentliche Kennung von Claude Code
const TOKEN_URLS = ["https://console.anthropic.com/v1/oauth/token", "https://platform.claude.com/v1/oauth/token"];

export const credFile = () => path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), ".credentials.json");

function lesen() {
  try {
    return JSON.parse(fs.readFileSync(credFile(), "utf8"));
  } catch {
    return null;
  }
}

let laufend = null; // nie zwei Erneuerungen gleichzeitig (der Schlüssel ist danach verbraucht)

async function erneuern(alles) {
  const o = alles.claudeAiOauth;
  let letzterFehler = "Anthropic nicht erreichbar";
  for (const url of TOKEN_URLS) {
    let r;
    try {
      r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "oxp-dock" },
        body: JSON.stringify({ grant_type: "refresh_token", refresh_token: o.refreshToken, client_id: CLIENT_ID }),
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      letzterFehler = "Anthropic nicht erreichbar";
      continue;
    }
    if (r.status === 404) continue;
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      if (r.status === 400 || r.status === 401 || /invalid_grant/.test(txt)) {
        return { error: "Claude-Anmeldung abgelaufen – klicken zum Neu-Anmelden", dauerhaft: true, needsLogin: true };
      }
      letzterFehler = `Erneuern fehlgeschlagen (${r.status})`;
      continue;
    }
    const j = await r.json();
    if (!j.access_token) return { error: "Antwort ohne Anmeldung" };
    const neu = {
      ...alles,
      claudeAiOauth: {
        ...o,
        accessToken: j.access_token,
        refreshToken: j.refresh_token || o.refreshToken,
        expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000,
        ...(j.scope ? { scopes: String(j.scope).split(" ") } : {}),
      },
    };
    // sicher schreiben: erst in eine Nebendatei, dann austauschen
    const f = credFile();
    const tmp = f + ".oxp-dock.tmp";
    fs.writeFileSync(tmp, JSON.stringify(neu), { mode: 0o600 });
    fs.renameSync(tmp, f);
    return { oauth: neu.claudeAiOauth, renewed: true };
  }
  return { error: letzterFehler };
}

/** Gültige Anmeldung holen (bei Bedarf erneuern). force = auch erneuern, wenn sie noch gültig aussieht. */
export async function claudeLogin({ force = false } = {}) {
  const alles = lesen();
  const o = alles?.claudeAiOauth;
  if (!o?.accessToken) return { error: "Nicht bei Claude angemeldet – klicken zum Anmelden", needsLogin: true };
  const bald = o.expiresAt && o.expiresAt < Date.now() + 5 * 60_000;
  if (!force && !bald) return { oauth: o };
  if (!o.refreshToken) return { error: "Claude-Anmeldung abgelaufen – klicken zum Neu-Anmelden", needsLogin: true };
  if (!laufend) laufend = erneuern(alles).finally(() => setTimeout(() => (laufend = null), 0));
  return laufend;
}

/** Gibt es eine gespeicherte Anmeldung (Datei mit Zugangsschlüssel)? */
export function hatAnmeldung() {
  return !!lesen()?.claudeAiOauth?.accessToken;
}

/**
 * Anmelden per Klick: öffnet ein sichtbares PowerShell-Fenster, das (falls nötig) Claude Code mit dem offiziellen
 * Installer von Anthropic einrichtet und dann `claude auth login` startet. Die Anmeldung selbst passiert im Browser
 * bei Anthropic; Claude Code legt danach die Datei an, die das Dock liest. Das Dock fasst dabei keine Passwörter an.
 */
export function anmeldungStarten() {
  const skript = `
$Host.UI.RawUI.WindowTitle = 'OXP Dock - Claude-Anmeldung'
try {
  $c = (Get-Command claude -ErrorAction SilentlyContinue).Source
  $lokal = Join-Path $env:USERPROFILE '.local\\bin\\claude.exe'
  if (-not $c -and (Test-Path $lokal)) { $c = $lokal }
  if (-not $c) {
    Write-Host 'Claude Code ist noch nicht installiert - wird jetzt von Anthropic geladen (einmalig, ca. 1-2 Minuten) ...' -ForegroundColor Cyan
    Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression
    $c = $lokal
  }
  if (-not (Test-Path $c) -and -not (Get-Command $c -ErrorAction SilentlyContinue)) { throw 'Claude Code wurde nicht gefunden.' }
  Write-Host ''
  Write-Host 'Gleich oeffnet sich der Browser: dort bei Claude anmelden und bestaetigen.' -ForegroundColor Cyan
  Write-Host ''
  & $c auth login
  Write-Host ''
  Write-Host 'Fertig - das OXP Dock zeigt die Claude-Limits gleich an. Dieses Fenster schliesst sich in 10 Sekunden.' -ForegroundColor Green
  Start-Sleep -Seconds 10
} catch {
  Write-Host ''
  Write-Host ('Das hat nicht geklappt: ' + $_.Exception.Message) -ForegroundColor Red
  Write-Host 'Fenster mit Enter schliessen.'
  Read-Host | Out-Null
}
`;
  const encoded = Buffer.from(skript, "utf16le").toString("base64");
  // "start" öffnet ein eigenes, sichtbares Konsolenfenster (das Dock selbst hat keins).
  spawn("cmd.exe", ["/c", "start", "", "powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();
}

/** Nutzung abfragen: { session, week, plan, renewed } oder { error, needsLogin } */
export async function claudeUsage() {
  let login = await claudeLogin();
  if (login.error) return { error: login.error, needsLogin: !!login.needsLogin };
  const frage = (token) =>
    fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20", "User-Agent": "oxp-dock" },
      signal: AbortSignal.timeout(15000),
    });
  let r = await frage(login.oauth.accessToken);
  if (r.status === 401) {
    login = await claudeLogin({ force: true });
    if (login.error) return { error: login.error, needsLogin: !!login.needsLogin };
    r = await frage(login.oauth.accessToken);
  }
  if (!r.ok) return { error: `Anthropic antwortet ${r.status}` };
  const j = await r.json();
  const pick = (x) => (x ? { pct: Math.round(Number(x.utilization) || 0), resetsAt: x.resets_at || null } : null);
  return { session: pick(j.five_hour), week: pick(j.seven_day), opus: pick(j.seven_day_opus), plan: login.oauth.subscriptionType || "", renewed: !!login.renewed, at: new Date().toISOString() };
}

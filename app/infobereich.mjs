// Infobereich-Symbole mitlesen, damit ein Rechtsklick im Dock das ECHTE Menü eines Programms öffnet
// (z. B. Razer Synapse: „Synapse starten“, „Chroma verwalten“ …).
//
// So funktioniert der Infobereich: Ein Programm meldet sein Symbol mit Shell_NotifyIcon an. Windows schickt dazu eine
// WM_COPYDATA-Nachricht an das Fenster der Klasse „Shell_TrayWnd“ (die Taskleiste). Klickt man das Symbol rechts an,
// schickt die Taskleiste dem Programm seine „Rückruf-Nachricht“ – und das Programm zeigt dann selbst sein Menü.
//
// Das Dock legt dafür ein eigenes, unsichtbares Fenster derselben Klasse an und setzt es nach oben, sodass die
// Anmeldungen zuerst hier ankommen. JEDE Nachricht wird unverändert an die echte Taskleiste von Explorer
// weitergereicht und deren Antwort zurückgegeben – Windows merkt keinen Unterschied, und beendet sich das Dock,
// läuft alles wie vorher direkt über Explorer. (Andere Ersatz-Taskleisten wie RetroBar machen es genauso.)
// Nach dem Start bittet das Dock alle Programme mit „TaskbarCreated“, ihre Symbole neu anzumelden.
import koffi from "koffi";
import * as win from "./win32.mjs";

const user32 = koffi.load("user32.dll");
const kernel32 = koffi.load("kernel32.dll");

const WNDPROC = koffi.proto("intptr_t __stdcall OxpInfobereichProc(void *hwnd, uint32 msg, uintptr_t wp, void *lp)");
const WNDCLASSEXW = koffi.struct("OxpWndClassEx", {
  cbSize: "uint32", style: "uint32", lpfnWndProc: koffi.pointer(WNDPROC), cbClsExtra: "int32", cbWndExtra: "int32",
  hInstance: "void *", hIcon: "void *", hCursor: "void *", hbrBackground: "void *", lpszMenuName: "str16", lpszClassName: "str16", hIconSm: "void *",
});
const COPYDATASTRUCT = koffi.struct("OxpCopyData", { dwData: "uintptr_t", cbData: "uint32", lpData: "void *" });
const POINT = koffi.struct("OxpPoint", { x: "int32", y: "int32" });

const RegisterClassExW = user32.func("uint16 __stdcall RegisterClassExW(OxpWndClassEx *wc)");
const CreateWindowExW = user32.func("void * __stdcall CreateWindowExW(uint32 ex, str16 cls, str16 title, uint32 style, int x, int y, int w, int h, void *parent, void *menu, void *inst, void *param)");
const DestroyWindow = user32.func("bool __stdcall DestroyWindow(void *hwnd)");
const DefWindowProcW = user32.func("intptr_t __stdcall DefWindowProcW(void *hwnd, uint32 msg, uintptr_t wp, void *lp)");
const SendMessageTimeoutW = user32.func("intptr_t __stdcall SendMessageTimeoutW(intptr_t hwnd, uint32 msg, uintptr_t wp, void *lp, uint32 flags, uint32 timeout, _Out_ uintptr_t *result)");
const SetWindowPos = user32.func("bool __stdcall SetWindowPos(void *hwnd, intptr_t after, int x, int y, int w, int h, uint32 flags)");
const RegisterWindowMessageW = user32.func("uint32 __stdcall RegisterWindowMessageW(str16 name)");
const PostMessageW = user32.func("bool __stdcall PostMessageW(intptr_t hwnd, uint32 msg, uintptr_t wp, intptr_t lp)");
const IsWindow = user32.func("bool __stdcall IsWindow(intptr_t hwnd)");
const GetWindowThreadProcessId = user32.func("uint32 __stdcall GetWindowThreadProcessId(intptr_t hwnd, _Out_ uint32 *pid)");
const AllowSetForegroundWindow = user32.func("bool __stdcall AllowSetForegroundWindow(uint32 pid)");
const GetCursorPos = user32.func("bool __stdcall GetCursorPos(_Out_ OxpPoint *p)");
const GetModuleHandleW = kernel32.func("void * __stdcall GetModuleHandleW(str16 name)");
const RECT = koffi.struct("OxpRect", { left: "int32", top: "int32", right: "int32", bottom: "int32" });
const GetWindowRect = user32.func("bool __stdcall GetWindowRect(intptr_t hwnd, _Out_ OxpRect *r)");

const WM_COPYDATA = 0x4a;
const WM_RBUTTONDOWN = 0x204, WM_RBUTTONUP = 0x205, WM_CONTEXTMENU = 0x7b;
const HWND_TOPMOST = -1;
const SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOACTIVATE = 0x10, SWP_NOOWNERZORDER = 0x200;
const NIM_ADD = 0, NIM_MODIFY = 1, NIM_DELETE = 2, NIM_SETVERSION = 4;
const NIF_MESSAGE = 0x1;
const TRAY_SIGNATUR = 0x34753423;

let fenster = null; // eigenes Shell_TrayWnd (Zeiger)
let fensterNr = 0;
let rueckruf = null; // registrierte WndProc (muss am Leben bleiben)
let taskbarCreated = 0;
const symbole = new Map(); // "hwnd:uID" → { hwnd, uid, nachricht, version, tip }

/** Inhalt einer Infobereich-Anmeldung (SHELLTRAYDATA mit NOTIFYICONDATA in 32-Bit-Form) auswerten. */
function merken(bytes) {
  if (bytes.length < 8 + 24) return;
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length);
  if (b.readUInt32LE(0) !== TRAY_SIGNATUR) return;
  const aktion = b.readUInt32LE(4);
  const n = 8; // Beginn von NOTIFYICONDATA
  const hwnd = b.readUInt32LE(n + 4);
  const uid = b.readUInt32LE(n + 8);
  const flags = b.readUInt32LE(n + 12);
  const schluessel = hwnd + ":" + uid;
  if (aktion === NIM_DELETE) return void symbole.delete(schluessel);
  const alt = symbole.get(schluessel) || { hwnd, uid, nachricht: 0, version: 0, tip: "" };
  if (flags & NIF_MESSAGE) alt.nachricht = b.readUInt32LE(n + 16);
  if (b.length >= n + 24 + 256) {
    const tip = b.toString("utf16le", n + 24, n + 24 + 256).replace(/\0[\s\S]*$/, "");
    if (tip) alt.tip = tip;
  }
  if (aktion === NIM_SETVERSION && b.length >= n + 804) alt.version = b.readUInt32LE(n + 800);
  if (aktion === NIM_ADD || aktion === NIM_MODIFY || aktion === NIM_SETVERSION) symbole.set(schluessel, alt);
}

function fensterProc(hwnd, msg, wp, lp) {
  if (msg === WM_COPYDATA && lp) {
    try {
      const cds = koffi.decode(lp, COPYDATASTRUCT);
      if (Number(cds.dwData) === 1 && cds.lpData && cds.cbData) merken(koffi.decode(cds.lpData, koffi.array("uint8", cds.cbData, "Typed")));
    } catch {}
    // unverändert an die echte Taskleiste weiterreichen und deren Antwort zurückgeben
    const ziel = win.explorerTray();
    if (!ziel) return 1; // Explorer gerade nicht da: Programmen trotzdem „erledigt“ melden
    const antwort = [0];
    const ok = SendMessageTimeoutW(ziel, WM_COPYDATA, wp, lp, 0x2 /* SMTO_ABORTIFHUNG */, 4000, antwort);
    return ok ? Number(antwort[0]) : 0;
  }
  return DefWindowProcW(hwnd, msg, wp, lp);
}

/**
 * Unser Fenster vor das von Explorer setzen – nur dann landen die Anmeldungen zuerst hier. Dabei Position und Größe
 * der echten Taskleiste übernehmen (unsichtbar): Windows misst für „Wo ist die Taskleiste?“ (ABM_GETTASKBARPOS)
 * direkt dieses Fenster aus, sonst bekämen Programme ein leeres Rechteck.
 */
export function nachVorn() {
  if (!fenster) return;
  const r = {};
  const ziel = win.explorerTray();
  if (ziel && GetWindowRect(ziel, r)) SetWindowPos(fenster, HWND_TOPMOST, r.left, r.top, r.right - r.left, r.bottom - r.top, SWP_NOACTIVATE | SWP_NOOWNERZORDER);
  else SetWindowPos(fenster, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE | SWP_NOOWNERZORDER);
}

export function starten() {
  if (fenster) return true;
  try {
    rueckruf = koffi.register(fensterProc, koffi.pointer(WNDPROC));
    const inst = GetModuleHandleW(null);
    RegisterClassExW({
      cbSize: koffi.sizeof(WNDCLASSEXW), style: 0, lpfnWndProc: rueckruf, cbClsExtra: 0, cbWndExtra: 0, hInstance: inst,
      hIcon: null, hCursor: null, hbrBackground: null, lpszMenuName: null, lpszClassName: "Shell_TrayWnd", hIconSm: null,
    });
    // unsichtbar, ohne Taskleisten-Eintrag (WS_EX_TOOLWINDOW), ganz oben (WS_EX_TOPMOST)
    fenster = CreateWindowExW(0x80 | 0x8, "Shell_TrayWnd", "", 0x80000000 /* WS_POPUP */, 0, 0, 0, 0, null, null, inst, null);
    if (!fenster) throw new Error("Fenster nicht angelegt");
    fensterNr = Number(koffi.address(fenster));
    win.setEigenesTrayFenster(fensterNr);
    win.setAppbarHuelle(beiseite);
    nachVorn();
    // alle Programme bitten, ihre Symbole neu anzumelden (landet jetzt bei uns und wird an Explorer weitergereicht)
    taskbarCreated = RegisterWindowMessageW("TaskbarCreated");
    PostMessageW(0xffff /* HWND_BROADCAST */, taskbarCreated, 0, 0);
    return true;
  } catch (e) {
    console.error("Infobereich mitlesen nicht möglich:", e.message);
    beenden();
    return false;
  }
}

/** Für die eigenen AppBar-Aufrufe des Docks kurz hinter Explorers Taskleiste treten (siehe win32.SHAppBarMessage). */
function beiseite(aufruf) {
  if (!fenster) return aufruf();
  SetWindowPos(fenster, -2 /* HWND_NOTOPMOST */, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE | SWP_NOOWNERZORDER);
  SetWindowPos(fenster, 1 /* HWND_BOTTOM */, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE | SWP_NOOWNERZORDER);
  try {
    return aufruf();
  } finally {
    nachVorn();
  }
}

export function beenden() {
  win.setAppbarHuelle(null);
  if (fenster) {
    try {
      DestroyWindow(fenster);
    } catch {}
  }
  fenster = null;
  fensterNr = 0;
  win.setEigenesTrayFenster(0);
  symbole.clear();
}

/** Gibt es zu einem Programm (Pfad der .exe) ein angemeldetes Symbol mit Rückruf-Nachricht? */
export function symbolFuer(exePfad) {
  const ziel = String(exePfad || "").toLowerCase();
  for (const s of symbole.values()) {
    if (!s.nachricht || !IsWindow(s.hwnd)) continue;
    const pid = [0];
    GetWindowThreadProcessId(s.hwnd, pid);
    if (win.exeOfPid(pid[0]).toLowerCase() === ziel) return { ...s, pid: pid[0] };
  }
  return null;
}

/**
 * Öffnet das eigene Rechtsklick-Menü des Programms – genau wie die Windows-Taskleiste: Rückruf-Nachricht mit
 * Rechtsklick (bei NOTIFYICON_VERSION_4 zusätzlich WM_CONTEXTMENU mit Mausposition). Das Menü erscheint an der Maus.
 */
export function kontextmenue(exePfad) {
  const s = symbolFuer(exePfad);
  if (!s) return false;
  AllowSetForegroundWindow(s.pid); // das Programm darf sein Menü nach vorn holen
  const p = {};
  GetCursorPos(p);
  if (s.version >= 4) {
    const wp = ((p.y & 0xffff) << 16) | (p.x & 0xffff);
    const lp = (n) => ((s.uid & 0xffff) << 16) | n;
    PostMessageW(s.hwnd, s.nachricht, wp >>> 0, lp(WM_RBUTTONDOWN));
    PostMessageW(s.hwnd, s.nachricht, wp >>> 0, lp(WM_RBUTTONUP));
    PostMessageW(s.hwnd, s.nachricht, wp >>> 0, lp(WM_CONTEXTMENU));
  } else {
    PostMessageW(s.hwnd, s.nachricht, s.uid, WM_RBUTTONDOWN);
    PostMessageW(s.hwnd, s.nachricht, s.uid, WM_RBUTTONUP);
  }
  return true;
}

export const aktiv = () => !!fenster;
export const anzahl = () => symbole.size;

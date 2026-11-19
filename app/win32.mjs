// Direkte Windows-Aufrufe (user32/shell32/kernel32/dwmapi) über koffi.
// Alles hier ist bewusst klein gehalten: Fensterliste, Fenster umschalten,
// Platz am unteren Bildschirmrand reservieren (AppBar) und die normale
// Windows-Taskleiste aus- und wieder einblenden.
import koffi from "koffi";
import path from "node:path";

const user32 = koffi.load("user32.dll");
const shell32 = koffi.load("shell32.dll");
const kernel32 = koffi.load("kernel32.dll");
const dwmapi = koffi.load("dwmapi.dll");

const RECT = koffi.struct("RECT", { left: "int32", top: "int32", right: "int32", bottom: "int32" });
const APPBARDATA = koffi.struct("APPBARDATA", {
  cbSize: "uint32",
  hWnd: "intptr_t",
  uCallbackMessage: "uint32",
  uEdge: "uint32",
  rc: RECT,
  lParam: "intptr_t",
});

const EnumWindowsProc = koffi.proto("bool __stdcall EnumWindowsProc(intptr_t hwnd, intptr_t lParam)");
const EnumWindows = user32.func("bool __stdcall EnumWindows(EnumWindowsProc *cb, intptr_t lParam)");
const GetWindowTextW = user32.func("int __stdcall GetWindowTextW(intptr_t hWnd, void *buf, int max)");
const GetClassNameW = user32.func("int __stdcall GetClassNameW(intptr_t hWnd, void *buf, int max)");
const IsWindowVisible = user32.func("bool __stdcall IsWindowVisible(intptr_t hWnd)");
const IsWindow = user32.func("bool __stdcall IsWindow(intptr_t hWnd)");
const IsIconic = user32.func("bool __stdcall IsIconic(intptr_t hWnd)");
const IsZoomed = user32.func("bool __stdcall IsZoomed(intptr_t hWnd)");
const GetWindow = user32.func("intptr_t __stdcall GetWindow(intptr_t hWnd, uint32 cmd)");
const GetWindowLongPtrW = user32.func("intptr_t __stdcall GetWindowLongPtrW(intptr_t hWnd, int index)");
const GetWindowThreadProcessId = user32.func("uint32 __stdcall GetWindowThreadProcessId(intptr_t hWnd, _Out_ uint32 *pid)");
const GetForegroundWindow = user32.func("intptr_t __stdcall GetForegroundWindow()");
const SetForegroundWindow = user32.func("bool __stdcall SetForegroundWindow(intptr_t hWnd)");
const BringWindowToTop = user32.func("bool __stdcall BringWindowToTop(intptr_t hWnd)");
const ShowWindow = user32.func("bool __stdcall ShowWindow(intptr_t hWnd, int cmd)");
const SetWindowPos = user32.func("bool __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int32 x, int32 y, int32 width, int32 height, uint32 flags)");
const PostMessageW = user32.func("bool __stdcall PostMessageW(intptr_t hWnd, uint32 msg, uintptr_t w, intptr_t l)");
const GetWindowRect = user32.func("bool __stdcall GetWindowRect(intptr_t hWnd, _Out_ RECT *rect)");
const FindWindowW = user32.func("intptr_t __stdcall FindWindowW(str16 cls, str16 title)");
const keybd_event = user32.func("void __stdcall keybd_event(uint8 vk, uint8 scan, uint32 flags, uintptr_t extra)");
const SHAppBarMessage = shell32.func("uintptr_t __stdcall SHAppBarMessage(uint32 msg, _Inout_ APPBARDATA *data)");
const OpenProcess = kernel32.func("intptr_t __stdcall OpenProcess(uint32 access, bool inherit, uint32 pid)");
const CloseHandle = kernel32.func("bool __stdcall CloseHandle(intptr_t h)");
const QueryFullProcessImageNameW = kernel32.func(
  "bool __stdcall QueryFullProcessImageNameW(intptr_t h, uint32 flags, void *buf, _Inout_ uint32 *size)",
);
const DwmGetWindowAttribute = dwmapi.func("int32 __stdcall DwmGetWindowAttribute(intptr_t hWnd, uint32 attr, void *buf, uint32 size)");

const GW_OWNER = 4;
const GWL_STYLE = -16;
const GWL_EXSTYLE = -20;
const WS_CAPTION = 0x00c00000;
const WS_EX_TOOLWINDOW = 0x80;
const WS_EX_APPWINDOW = 0x40000;
const WS_EX_NOACTIVATE = 0x08000000;
const DWMWA_CLOAKED = 14;
const SW_HIDE = 0, SW_SHOW = 5, SW_MINIMIZE = 6, SW_RESTORE = 9;
const SWP_NOSIZE = 0x0001, SWP_NOZORDER = 0x0004, SWP_NOACTIVATE = 0x0010;
const WM_CLOSE = 0x10;

const ABM_NEW = 0, ABM_REMOVE = 1, ABM_QUERYPOS = 2, ABM_SETPOS = 3, ABM_GETSTATE = 4, ABM_SETSTATE = 10;
const ABE_BOTTOM = 3;
const ABS_AUTOHIDE = 1, ABS_ALWAYSONTOP = 2;

const IGNORED_CLASSES = new Set(["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "Windows.UI.Core.CoreWindow", "XamlExplorerHostIslandWindow"]);

const textBuf = Buffer.alloc(1024);
function readText(fn, hwnd) {
  const n = fn(hwnd, textBuf, 511);
  return n > 0 ? textBuf.toString("utf16le", 0, n * 2) : "";
}

const pathBuf = Buffer.alloc(2048);
const exeCache = new Map(); // pid -> exe path
function exeForPid(pid) {
  if (exeCache.has(pid)) return exeCache.get(pid);
  let exe = "";
  const h = OpenProcess(0x1000, false, pid); // PROCESS_QUERY_LIMITED_INFORMATION
  if (h) {
    const size = [1024];
    if (QueryFullProcessImageNameW(h, 0, pathBuf, size)) exe = pathBuf.toString("utf16le", 0, size[0] * 2);
    CloseHandle(h);
  }
  if (exeCache.size > 500) exeCache.clear();
  exeCache.set(pid, exe);
  return exe;
}

const cloakBuf = Buffer.alloc(4);
function isCloaked(hwnd) {
  cloakBuf.writeUInt32LE(0);
  return DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, cloakBuf, 4) === 0 && cloakBuf.readUInt32LE(0) !== 0;
}

/** Fenster, die Windows auch in der Taskleiste / bei Alt+Tab zeigen würde – in Z-Reihenfolge (oberstes zuerst). */
export function listWindows(ownPid) {
  const out = [];
  EnumWindows((hwnd) => {
    try {
      if (!IsWindowVisible(hwnd)) return true;
      const ex = Number(GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
      const isApp = (ex & WS_EX_APPWINDOW) !== 0;
      if (!isApp && (ex & WS_EX_TOOLWINDOW)) return true;
      if (!isApp && GetWindow(hwnd, GW_OWNER)) return true;
      if (!isApp && (ex & WS_EX_NOACTIVATE)) return true;
      const title = readText(GetWindowTextW, hwnd);
      if (!title) return true;
      const cls = readText(GetClassNameW, hwnd);
      if (IGNORED_CLASSES.has(cls)) return true;
      if (isCloaked(hwnd)) return true;
      const pid = [0];
      GetWindowThreadProcessId(hwnd, pid);
      if (pid[0] === ownPid) return true;
      const exe = exeForPid(pid[0]);
      out.push({ hwnd: Number(hwnd), title, cls, pid: pid[0], exe, minimized: IsIconic(hwnd) });
    } catch {
      /* einzelnes Fenster überspringen */
    }
    return true;
  }, 0);
  return out;
}

export function foregroundWindow() {
  return Number(GetForegroundWindow());
}

export function windowRect(hwnd) {
  const r = {};
  return GetWindowRect(hwnd, r) ? r : null;
}

/** Verschiebt das Dock an die Bildschirmkante in physischen Pixeln. */
export function alignWindowBottom(hwnd, { x, bottom }) {
  const r = windowRect(hwnd);
  if (!r) return false;
  if (r.left === x && r.bottom === bottom) return true;
  return SetWindowPos(hwnd, 0, x, bottom - (r.bottom - r.top), 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
}

export function windowClass(hwnd) {
  return readText(GetClassNameW, hwnd);
}

/** Fenster existiert, ist sichtbar und nicht minimiert. */
export function isShownWindow(hwnd) {
  return !!hwnd && !!IsWindow(hwnd) && !!IsWindowVisible(hwnd) && !IsIconic(hwnd);
}

export function isMaximized(hwnd) {
  return !!IsZoomed(hwnd);
}

export function isFramedMaximized(hwnd) {
  return IsZoomed(hwnd) && (Number(GetWindowLongPtrW(hwnd, GWL_STYLE)) & WS_CAPTION) === WS_CAPTION;
}

export function activate(hwnd) {
  if (!IsWindow(hwnd)) return;
  if (IsIconic(hwnd)) ShowWindow(hwnd, SW_RESTORE);
  if (!SetForegroundWindow(hwnd)) {
    // Windows lässt sich manchmal nur „überreden“, wenn gerade eine Taste gedrückt wurde.
    keybd_event(0x12, 0, 0, 0); // Alt drücken
    SetForegroundWindow(hwnd);
    keybd_event(0x12, 0, 2, 0); // Alt loslassen
  }
  BringWindowToTop(hwnd);
}

export function minimize(hwnd) {
  ShowWindow(hwnd, SW_MINIMIZE);
}

export function close(hwnd) {
  PostMessageW(hwnd, WM_CLOSE, 0, 0);
}

/** Tastenkombination drücken, z. B. [0x5B] = Windows-Taste, [0x5B, 0x41] = Win+A. */
export function pressKeys(keys) {
  for (const k of keys) keybd_event(k, 0, 0, 0);
  for (const k of [...keys].reverse()) keybd_event(k, 0, 2, 0);
}

export const VK = {
  WIN: 0x5b, A: 0x41, D: 0x44, N: 0x4e, S: 0x53, E: 0x45, X: 0x58,
  MEDIA_NEXT: 0xb0, MEDIA_PREV: 0xb1, MEDIA_PLAY_PAUSE: 0xb3,
};

// ---------- Windows-Taskleiste aus-/einblenden ----------

const FindWindowExW = user32.func("intptr_t __stdcall FindWindowExW(intptr_t parent, intptr_t after, str16 cls, str16 title)");

/** Haupt-Taskleiste zuerst, dann die Taskleisten der weiteren Bildschirme. */
function trayWindows() {
  const list = [];
  const main = Number(FindWindowW("Shell_TrayWnd", null));
  if (main) list.push(main);
  let h = 0;
  for (let i = 0; i < 16; i++) {
    h = Number(FindWindowExW(0, h, "Shell_SecondaryTrayWnd", null));
    if (!h) break;
    list.push(h);
  }
  return list;
}

let savedState = null;

/** Normale Taskleiste auf „automatisch ausblenden“ stellen und verstecken. Gibt den alten Zustand zurück. */
export function hideWindowsTaskbar() {
  const tray = trayWindows()[0];
  if (!tray) return null;
  const abd = { cbSize: koffi.sizeof(APPBARDATA), hWnd: tray, uCallbackMessage: 0, uEdge: 0, rc: { left: 0, top: 0, right: 0, bottom: 0 }, lParam: 0 };
  if (savedState === null) savedState = Number(SHAppBarMessage(ABM_GETSTATE, abd));
  abd.lParam = ABS_AUTOHIDE | (savedState & ABS_ALWAYSONTOP);
  SHAppBarMessage(ABM_SETSTATE, abd);
  for (const t of trayWindows()) ShowWindow(t, SW_HIDE);
  return savedState;
}

/** Wird regelmäßig aufgerufen: Windows blendet die Taskleiste z. B. beim Startmenü gern wieder ein. */
export function keepWindowsTaskbarHidden() {
  for (const t of trayWindows()) if (IsWindowVisible(t)) ShowWindow(t, SW_HIDE);
}

export function restoreWindowsTaskbar(previousState) {
  const tray = trayWindows()[0];
  if (!tray) return;
  const state = previousState ?? savedState ?? 0;
  const abd = { cbSize: koffi.sizeof(APPBARDATA), hWnd: tray, uCallbackMessage: 0, uEdge: 0, rc: { left: 0, top: 0, right: 0, bottom: 0 }, lParam: state };
  SHAppBarMessage(ABM_SETSTATE, abd);
  for (const t of trayWindows()) ShowWindow(t, SW_SHOW);
  savedState = null;
}

// ---------- Eigene Docks als AppBar anmelden (reservieren den Platz unten, eins pro Bildschirm) ----------

const registered = new Set();

/** Meldet ein Dock an und reserviert `height` Pixel (physisch) am unteren Rand von `bounds` (physisch). Gibt das endgültige Rechteck zurück. */
export function reserveBottom(hwnd, bounds, height, callbackMessage) {
  const base = { cbSize: koffi.sizeof(APPBARDATA), hWnd: hwnd, uCallbackMessage: callbackMessage, uEdge: ABE_BOTTOM, rc: { left: 0, top: 0, right: 0, bottom: 0 }, lParam: 0 };
  if (!registered.has(hwnd)) {
    SHAppBarMessage(ABM_NEW, base);
    registered.add(hwnd);
  }
  const abd = { ...base, rc: { left: bounds.x, right: bounds.x + bounds.width, top: bounds.y + bounds.height - height, bottom: bounds.y + bounds.height } };
  SHAppBarMessage(ABM_QUERYPOS, abd);
  abd.rc.top = abd.rc.bottom - height;
  SHAppBarMessage(ABM_SETPOS, abd);
  return { x: abd.rc.left, y: abd.rc.top, width: abd.rc.right - abd.rc.left, height: abd.rc.bottom - abd.rc.top };
}

/** Ein Dock abmelden – ohne Angabe alle. */
export function releaseBottom(hwnd) {
  for (const h of hwnd ? [hwnd] : [...registered]) {
    if (!registered.has(h)) continue;
    SHAppBarMessage(ABM_REMOVE, { cbSize: koffi.sizeof(APPBARDATA), hWnd: h, uCallbackMessage: 0, uEdge: 0, rc: { left: 0, top: 0, right: 0, bottom: 0 }, lParam: 0 });
    registered.delete(h);
  }
}

export function exeBaseName(p) {
  return path.basename(p || "").toLowerCase();
}

// ---------- Weitere Systemfunktionen für Widgets ----------

const SYSTEM_POWER_STATUS = koffi.struct("SYSTEM_POWER_STATUS", {
  ACLineStatus: "uint8",
  BatteryFlag: "uint8",
  BatteryLifePercent: "uint8",
  SystemStatusFlag: "uint8",
  BatteryLifeTime: "uint32",
  BatteryFullLifeTime: "uint32",
});
const GetSystemPowerStatus = kernel32.func("bool __stdcall GetSystemPowerStatus(_Out_ SYSTEM_POWER_STATUS *s)");

/** Akku: { hasBattery, percent, charging, plugged, saver, secondsLeft } */
export function battery() {
  const s = {};
  if (!GetSystemPowerStatus(s)) return { hasBattery: false };
  const none = (s.BatteryFlag & 128) !== 0 || s.BatteryFlag === 255;
  return {
    hasBattery: !none,
    percent: s.BatteryLifePercent === 255 ? null : s.BatteryLifePercent,
    plugged: s.ACLineStatus === 1,
    charging: (s.BatteryFlag & 8) !== 0,
    saver: s.SystemStatusFlag === 1,
    secondsLeft: s.BatteryLifeTime === 0xffffffff ? null : s.BatteryLifeTime,
  };
}

const GetKeyboardLayout = user32.func("intptr_t __stdcall GetKeyboardLayout(uint32 threadId)");
const GetKeyboardLayoutList = user32.func("int __stdcall GetKeyboardLayoutList(int n, _Out_ intptr_t *list)");

/** Tastatursprache des Vordergrundfensters als Sprachkennung (z. B. 0x0407 = Deutsch). */
export function keyboardLayout(hwnd) {
  const pid = [0];
  const tid = hwnd ? GetWindowThreadProcessId(hwnd, pid) : 0;
  const hkl = Number(GetKeyboardLayout(tid));
  const count = GetKeyboardLayoutList(0, null);
  return { langId: hkl & 0xffff, count };
}

/** Zur nächsten Tastatursprache wechseln (wie Win+Leertaste) – im Vordergrundfenster. */
export function nextKeyboardLayout(hwnd) {
  if (hwnd) PostMessageW(hwnd, 0x50, 0, 1); // WM_INPUTLANGCHANGEREQUEST, HKL_NEXT
}

const SHQUERYRBINFO = koffi.struct("SHQUERYRBINFO", { cbSize: "uint32", _pad: "uint32", size: "int64", items: "int64" });
const SHQueryRecycleBinW = shell32.func("int32 __stdcall SHQueryRecycleBinW(str16 root, _Inout_ SHQUERYRBINFO *info)");
const SHEmptyRecycleBinW = shell32.func("int32 __stdcall SHEmptyRecycleBinW(intptr_t hwnd, str16 root, uint32 flags)");

export function recycleBin() {
  const info = { cbSize: koffi.sizeof(SHQUERYRBINFO), _pad: 0, size: 0, items: 0 };
  const hr = SHQueryRecycleBinW(null, info);
  return hr === 0 ? { items: Number(info.items), bytes: Number(info.size) } : { items: 0, bytes: 0 };
}

/** Papierkorb leeren – Windows fragt selbst noch einmal nach. */
export function emptyRecycleBin() {
  return SHEmptyRecycleBinW(0, null, 0) === 0;
}

const SystemParametersInfoW = user32.func("bool __stdcall SystemParametersInfoW(uint32 action, uint32 param, str16 value, uint32 flags)");
export function setWallpaper(file) {
  return SystemParametersInfoW(0x0014, 0, file, 0x01 | 0x02); // SPI_SETDESKWALLPAPER, speichern + allen melden
}

const LockWorkStation = user32.func("bool __stdcall LockWorkStation()");
export function lock() {
  return LockWorkStation();
}

// ---------- Live-Vorschaubilder wie in der Windows-Taskleiste (DWM-Thumbnails) ----------
// Windows zeichnet das Fenster selbst live in unser Popup – klappt auch bei minimierten Fenstern
// (Windows hebt deren letztes Bild auf) und kostet kaum Rechenzeit.
const SIZE = koffi.struct("SIZE", { cx: "int32", cy: "int32" });
const DWM_THUMBNAIL_PROPERTIES = koffi.struct("DWM_THUMBNAIL_PROPERTIES", {
  dwFlags: "uint32",
  rcDestination: RECT,
  rcSource: RECT,
  opacity: "uint8",
  fVisible: "int",
  fSourceClientAreaOnly: "int",
});
const DwmRegisterThumbnail = dwmapi.func("int32 __stdcall DwmRegisterThumbnail(intptr_t dest, intptr_t src, _Out_ intptr_t *thumb)");
const DwmUnregisterThumbnail = dwmapi.func("int32 __stdcall DwmUnregisterThumbnail(intptr_t thumb)");
const DwmUpdateThumbnailProperties = dwmapi.func("int32 __stdcall DwmUpdateThumbnailProperties(intptr_t thumb, DWM_THUMBNAIL_PROPERTIES *p)");
const DwmQueryThumbnailSourceSize = dwmapi.func("int32 __stdcall DwmQueryThumbnailSourceSize(intptr_t thumb, _Out_ SIZE *s)");

/** Zeigt das Fenster `src` live im Rechteck `box` (physische Pixel, relativ zu `dest`). Gibt die Kennung zurück oder 0. */
export function thumbShow(dest, src, box) {
  const out = [0];
  if (DwmRegisterThumbnail(dest, src, out) !== 0 || !out[0]) return 0;
  const id = Number(out[0]);
  const s = {};
  let w = box.width, h = box.height;
  if (DwmQueryThumbnailSourceSize(id, s) === 0 && s.cx > 0 && s.cy > 0) {
    // Seitenverhältnis behalten, mittig in die Box
    const f = Math.min(box.width / s.cx, box.height / s.cy);
    w = Math.round(s.cx * f);
    h = Math.round(s.cy * f);
  }
  const x = Math.round(box.x + (box.width - w) / 2);
  const y = Math.round(box.y + (box.height - h) / 2);
  DwmUpdateThumbnailProperties(id, {
    dwFlags: 0x1 | 0x4 | 0x8 | 0x10, // Ziel, Deckkraft, sichtbar, nur Inhalt ohne Rahmen
    rcDestination: { left: x, top: y, right: x + w, bottom: y + h },
    rcSource: { left: 0, top: 0, right: 0, bottom: 0 },
    opacity: 255,
    fVisible: 1,
    fSourceClientAreaOnly: 1,
  });
  return id;
}

export function thumbClear(id) {
  if (id) DwmUnregisterThumbnail(id);
}

// ---------- Genaue Bildschirmmaße direkt von Windows ----------
// (Electron rechnet bei Skalierung manchmal 1–2 Pixel daneben – für die Vollbild-Erkennung zu ungenau)
const MONITORINFO = koffi.struct("MONITORINFO", { cbSize: "uint32", rcMonitor: RECT, rcWork: RECT, dwFlags: "uint32" });
const POINT = koffi.struct("POINT", { x: "int32", y: "int32" });
const MonitorFromWindow = user32.func("intptr_t __stdcall MonitorFromWindow(intptr_t hwnd, uint32 flags)");
const MonitorFromPoint = user32.func("intptr_t __stdcall MonitorFromPoint(POINT pt, uint32 flags)");
const GetMonitorInfoW = user32.func("bool __stdcall GetMonitorInfoW(intptr_t mon, _Inout_ MONITORINFO *info)");

function monitorRect(mon) {
  const info = { cbSize: koffi.sizeof(MONITORINFO), rcMonitor: {}, rcWork: {}, dwFlags: 0 };
  if (!mon || !GetMonitorInfoW(mon, info)) return null;
  const r = info.rcMonitor;
  return { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top };
}
/** Bildschirm (physische Pixel), auf dem ein Fenster liegt. */
export function monitorOfWindow(hwnd) {
  return monitorRect(Number(MonitorFromWindow(hwnd, 2))); // MONITOR_DEFAULTTONEAREST
}
/** Bildschirm (physische Pixel) an einem Punkt. */
export function monitorAt(x, y) {
  return monitorRect(Number(MonitorFromPoint({ x: Math.round(x), y: Math.round(y) }, 2)));
}

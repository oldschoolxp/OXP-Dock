# Hilfen für die Fenster-Tests des Docks: Fensterlage (sichtbarer Rahmen), Arbeitsfläche je Bildschirm, Maus.
Add-Type @'
using System; using System.Runtime.InteropServices; using System.Text; using System.Collections.Generic;
public class FW {
  public delegate bool EP(IntPtr h, IntPtr l); public delegate bool MP(IntPtr m, IntPtr dc, ref RECT r, IntPtr d);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EP e, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfoW(IntPtr m, ref INFO i);
  [DllImport("user32.dll")] public static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, MP cb, IntPtr d);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int s);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct INFO { public int cb; public RECT mon; public RECT work; public int flags; }
  public static IntPtr Finde(string titel) { IntPtr g = IntPtr.Zero; EnumWindows((h, l) => { if (!IsWindowVisible(h)) return true; var s = new StringBuilder(200); GetWindowTextW(h, s, 200); if (s.ToString() == titel) { g = h; return false; } return true; }, IntPtr.Zero); return g; }
  // sichtbarer Rahmen (ohne unsichtbaren Schatten-Rand)
  public static RECT Sichtbar(IntPtr h) { RECT r; if (DwmGetWindowAttribute(h, 9, out r, 16) != 0) GetWindowRect(h, out r); return r; }
  public static INFO Bildschirm(IntPtr h) { var i = new INFO(); i.cb = Marshal.SizeOf(i); GetMonitorInfoW(MonitorFromWindow(h, 2), ref i); return i; }
  public static List<INFO> Alle() { var l = new List<INFO>(); EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr m, IntPtr dc, ref RECT r, IntPtr d) => { var i = new INFO(); i.cb = Marshal.SizeOf(i); GetMonitorInfoW(m, ref i); l.Add(i); return true; }, IntPtr.Zero); l.Sort((a, b) => a.mon.L.CompareTo(b.mon.L)); return l; }
}
'@
[void][FW]::SetProcessDpiAwarenessContext([IntPtr](-4))
function Maus($x, $y) { [void][FW]::SetCursorPos([int]$x, [int]$y) }
Add-Type @'
using System; using System.Runtime.InteropServices; using System.Text; using System.Collections.Generic;
public class FW2 {
  public delegate bool EP(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EP e, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool PostMessageW(IntPtr h, uint m, IntPtr w, IntPtr l);
  public static IntPtr Enthaelt(string teil) { IntPtr g = IntPtr.Zero; EnumWindows((h, l) => { if (!IsWindowVisible(h)) return true; var s = new StringBuilder(300); GetWindowTextW(h, s, 300); if (s.Length > 0 && s.ToString().IndexOf(teil, StringComparison.OrdinalIgnoreCase) >= 0 && s.ToString().IndexOf("Claude", StringComparison.OrdinalIgnoreCase) < 0) { g = h; return false; } return true; }, IntPtr.Zero); return g; }
  public static void Hin(IntPtr h, int x, int y) { ShowWindow(h, 9); SetWindowPos(h, IntPtr.Zero, x, y, 0, 0, 0x0001 | 0x0004 | 0x0010); }
  public static void Max(IntPtr h) { ShowWindow(h, 3); }
  public static void Zu(IntPtr h) { PostMessageW(h, 0x10, IntPtr.Zero, IntPtr.Zero); }
}
'@
Add-Type @'
using System; using System.Runtime.InteropServices;
public class FW3 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);
  public static void Vorn(IntPtr h) { keybd_event(0x12, 0, 0, UIntPtr.Zero); SetForegroundWindow(h); keybd_event(0x12, 0, 2, UIntPtr.Zero); }
}
'@

# appbar-fremd.ps1 remove|new: sendet ABM_REMOVE / ABM_NEW für das größte sichtbare Fenster des Docks auf Bildschirm 1 (simuliert verlorene Anmeldung)
param([string]$Was = "remove", [int]$DockPid)
. "$PSScriptRoot\fenster-lib.ps1"
Add-Type @'
using System; using System.Runtime.InteropServices; using System.Collections.Generic;
public class AB {
  [StructLayout(LayoutKind.Sequential)] public struct RECT2 { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct APPBARDATA { public uint cbSize; public IntPtr hWnd; public uint uCallbackMessage; public uint uEdge; public RECT2 rc; public IntPtr lParam; }
  [DllImport("shell32.dll")] public static extern UIntPtr SHAppBarMessage(uint msg, ref APPBARDATA d);
  public delegate bool EP(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EP e, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT2 r);
  public static List<IntPtr> Docks(uint pid) { var l = new List<IntPtr>(); EnumWindows((h, x) => { uint p; GetWindowThreadProcessId(h, out p); RECT2 r; GetWindowRect(h, out r); if (p == pid && r.R - r.L > 1500 && r.B - r.T > 20 && r.B - r.T < 400) l.Add(h); return true; }, IntPtr.Zero); return l; }
  public static long Senden(uint msg, IntPtr h) { var d = new APPBARDATA(); d.cbSize = (uint)Marshal.SizeOf(d); d.hWnd = h; d.uEdge = 3; return (long)SHAppBarMessage(msg, ref d); }
}
'@ 
foreach ($h in [AB]::Docks([uint32]$DockPid)) {
  $r = if ($Was -eq "remove") { [AB]::Senden(1, $h) } else { [AB]::Senden(0, $h) }
  "Dock-Fenster $h : $Was -> $r"
}

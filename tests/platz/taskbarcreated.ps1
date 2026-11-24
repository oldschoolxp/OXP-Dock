param([int]$dockPid)
Add-Type @'
using System; using System.Runtime.InteropServices; using System.Collections.Generic;
public class TC {
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern uint RegisterWindowMessageW(string s);
  [DllImport("user32.dll")] public static extern bool PostMessageW(IntPtr h, uint m, IntPtr w, IntPtr l);
  public delegate bool EP(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EP e, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  public static int Senden(uint pid) { uint m = RegisterWindowMessageW("TaskbarCreated"); int n = 0; EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p == pid) { PostMessageW(h, m, IntPtr.Zero, IntPtr.Zero); n++; } return true; }, IntPtr.Zero); return n; }
}
'@
"an $([TC]::Senden([uint32]$dockPid)) Fenster des Docks geschickt"

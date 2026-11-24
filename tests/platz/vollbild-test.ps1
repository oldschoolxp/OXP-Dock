# vollbild-test.ps1 -Dock <pid>: öffnet ein Vollbild-Fenster auf Schirm 1, prüft Dock/Reservierung, schließt es, prüft erneut
param([int]$dockPid)
. "$PSScriptRoot\fenster-lib.ps1"
Add-Type @'
using System; using System.Runtime.InteropServices; using System.Collections.Generic;
public class DSX { public delegate bool EP(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EP e, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RR r);
  [StructLayout(LayoutKind.Sequential)] public struct RR { public int L, T, R, B; }
  public static int Sichtbar(uint pid, int links, int rechts) { int n = 0; EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p != pid || !IsWindowVisible(h)) return true; RR r; GetWindowRect(h, out r); if (r.R - r.L > 1500 && r.B - r.T < 400 && r.L >= links - 5 && r.R <= rechts + 5) n++; return true; }, IntPtr.Zero); return n; } }
'@
$m = [FW]::Alle()[1]
function Zeige($name) { $b = [FW]::Alle()[1]; "{0}: reserviert {1} px, Dock-Fenster auf Schirm 1 sichtbar: {2}" -f $name, ($b.mon.B - $b.work.B), [DSX]::Sichtbar([uint32]$dockPid, $m.mon.L, $m.mon.R) }
Maus ([int](($m.mon.L + $m.mon.R) / 2)) ([int](($m.mon.T + $m.mon.B) / 2)); Start-Sleep -Seconds 4
Zeige "vorher"
$e = (Resolve-Path (Join-Path $PSScriptRoot "..\..\node_modules\electron\dist\electron.exe")).Path
$p = Start-Process $e -ArgumentList "`"$PSScriptRoot\testfenster.cjs`"", "OXPTEST-FS", "1", "fs" -PassThru
Start-Sleep -Seconds 5; $h = [FW]::Finde("OXPTEST-FS"); [FW3]::Vorn($h); Start-Sleep -Seconds 3
Zeige "Vollbild-Fenster offen"
$s = [FW]::Sichtbar($h); "  Vollbild-Fenster: $($s.T)-$($s.B) (Bildschirm $($m.mon.T)-$($m.mon.B))"
Stop-Process -Id $p.Id -Force; Start-Sleep -Seconds 4
Zeige "nach Schließen"

# OXP Dock – Systemhelfer.
# Läuft dauerhaft im Hintergrund und beantwortet Anfragen des Docks (eine JSON-Zeile rein, eine JSON-Zeile raus):
#   {"id":1,"cmd":"audio"}  ->  {"id":1,"ok":true,"result":{...}}
# Nur lokale Windows-Funktionen: Lautstärke, Audiogeräte, Mikrofon, Helligkeit, WLAN/Bluetooth, Prozesse, Netzwerk, Medien.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.Encoding]::UTF8
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Net.NetworkInformation;

namespace OxpDock {
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
    int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
  }
  [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceCollection {
    int GetCount(out int count);
    int Item(int index, out IMMDevice device);
  }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
    int OpenPropertyStore(int access, out IPropertyStore store);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
  }
  [Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore {
    int GetCount(out int count);
    int GetAt(int index, out PropertyKey key);
    int GetValue(ref PropertyKey key, out PropVariant value);
  }
  [StructLayout(LayoutKind.Sequential)]
  struct PropertyKey { public Guid fmtid; public int pid; }
  [StructLayout(LayoutKind.Explicit)]
  struct PropVariant {
    [FieldOffset(0)] public short vt;
    [FieldOffset(8)] public IntPtr ptr;
  }
  [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr notify);
    int UnregisterControlChangeNotify(IntPtr notify);
    int GetChannelCount(out int count);
    int SetMasterVolumeLevel(float level, ref Guid ctx);
    int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
    int GetMasterVolumeLevel(out float level);
    int GetMasterVolumeLevelScalar(out float level);
    int SetChannelVolumeLevel(int ch, float level, ref Guid ctx);
    int SetChannelVolumeLevelScalar(int ch, float level, ref Guid ctx);
    int GetChannelVolumeLevel(int ch, out float level);
    int GetChannelVolumeLevelScalar(int ch, out float level);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }
  // Nicht offiziell dokumentiert, aber seit Windows 7 unverändert: Standard-Audiogerät umstellen.
  [Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPolicyConfig {
    int GetMixFormat(); int GetDeviceFormat(); int ResetDeviceFormat(); int SetDeviceFormat();
    int GetProcessingPeriod(); int SetProcessingPeriod(); int GetShareMode(); int SetShareMode();
    int GetPropertyValue(); int SetPropertyValue();
    int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
    int SetEndpointVisibility();
  }
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom {}
  [ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")] class PolicyConfigCom {}

  public class AudioDevice { public string id; public string name; public bool isDefault; }

  public static class Audio {
    static IMMDeviceEnumerator En() { return (IMMDeviceEnumerator)new MMDeviceEnumeratorCom(); }
    static IAudioEndpointVolume Vol(int flow) {
      IMMDevice dev; Marshal.ThrowExceptionForHR(En().GetDefaultAudioEndpoint(flow, 1, out dev));
      Guid iid = typeof(IAudioEndpointVolume).GUID; object o;
      Marshal.ThrowExceptionForHR(dev.Activate(ref iid, 23, IntPtr.Zero, out o));
      return (IAudioEndpointVolume)o;
    }
    public static float GetVolume(int flow) { float v; Vol(flow).GetMasterVolumeLevelScalar(out v); return v; }
    public static void SetVolume(int flow, float v) { Guid g = Guid.Empty; Vol(flow).SetMasterVolumeLevelScalar(Math.Max(0f, Math.Min(1f, v)), ref g); }
    public static bool GetMute(int flow) { bool m; Vol(flow).GetMute(out m); return m; }
    public static void SetMute(int flow, bool m) { Guid g = Guid.Empty; Vol(flow).SetMute(m, ref g); }
    static string Name(IMMDevice d) {
      IPropertyStore ps; d.OpenPropertyStore(0, out ps);
      PropertyKey k = new PropertyKey { fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14 };
      PropVariant v; ps.GetValue(ref k, out v);
      return v.vt == 31 ? Marshal.PtrToStringUni(v.ptr) : "Unbekanntes Gerät";
    }
    public static List<AudioDevice> Devices(int flow) {
      var list = new List<AudioDevice>(); var en = En();
      string defId = null;
      try { IMMDevice def; if (en.GetDefaultAudioEndpoint(flow, 1, out def) == 0) def.GetId(out defId); } catch {}
      IMMDeviceCollection col; Marshal.ThrowExceptionForHR(en.EnumAudioEndpoints(flow, 1, out col));
      int n; col.GetCount(out n);
      for (int i = 0; i < n; i++) {
        IMMDevice d; col.Item(i, out d); string id; d.GetId(out id);
        list.Add(new AudioDevice { id = id, name = Name(d), isDefault = id == defId });
      }
      return list;
    }
    public static void SetDefault(string id) {
      var pc = (IPolicyConfig)new PolicyConfigCom();
      for (int role = 0; role < 3; role++) pc.SetDefaultEndpoint(id, role);
    }
  }

  // Helligkeit externer Monitore über DDC/CI
  public static class Ddc {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct PHYSICAL_MONITOR { public IntPtr h; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string desc; }
    delegate bool MonEnum(IntPtr hMon, IntPtr hdc, IntPtr rc, IntPtr data);
    [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonEnum cb, IntPtr data);
    [DllImport("dxva2.dll")] static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr h, out uint n);
    [DllImport("dxva2.dll")] static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr h, uint n, [Out] PHYSICAL_MONITOR[] arr);
    [DllImport("dxva2.dll")] static extern bool DestroyPhysicalMonitors(uint n, PHYSICAL_MONITOR[] arr);
    [DllImport("dxva2.dll")] static extern bool GetMonitorBrightness(IntPtr h, out uint min, out uint cur, out uint max);
    [DllImport("dxva2.dll")] static extern bool SetMonitorBrightness(IntPtr h, uint v);
    static List<PHYSICAL_MONITOR[]> All() {
      var res = new List<PHYSICAL_MONITOR[]>();
      EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (h, dc, rc, d) => {
        uint n; if (GetNumberOfPhysicalMonitorsFromHMONITOR(h, out n) && n > 0) {
          var arr = new PHYSICAL_MONITOR[n]; if (GetPhysicalMonitorsFromHMONITOR(h, n, arr)) res.Add(arr);
        }
        return true;
      }, IntPtr.Zero);
      return res;
    }
    public static int Get() {
      int best = -1;
      foreach (var arr in All()) {
        foreach (var m in arr) { uint mn, cur, mx; if (best < 0 && GetMonitorBrightness(m.h, out mn, out cur, out mx) && mx > mn) best = (int)Math.Round(100.0 * (cur - mn) / (mx - mn)); }
        DestroyPhysicalMonitors((uint)arr.Length, arr);
      }
      return best;
    }
    public static int Set(int pct) {
      int ok = 0;
      foreach (var arr in All()) {
        foreach (var m in arr) { uint mn, cur, mx; if (GetMonitorBrightness(m.h, out mn, out cur, out mx) && mx > mn && SetMonitorBrightness(m.h, (uint)(mn + (mx - mn) * pct / 100))) ok++; }
        DestroyPhysicalMonitors((uint)arr.Length, arr);
      }
      return ok;
    }
  }

  // Programmsymbole wie im Explorer (IShellItemImageFactory) – liefert PNG mit Transparenz
  [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItemImageFactory { [PreserveSig] int GetImage(NativeSize size, int flags, out IntPtr phbm); }
  [StructLayout(LayoutKind.Sequential)] struct NativeSize { public int cx; public int cy; }

  public static class ShellIcon {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    static extern int SHCreateItemFromParsingName(string path, IntPtr pbc, ref Guid riid, out IShellItemImageFactory ppv);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr h);
    public static string Png(string path, int size) {
      Guid iid = typeof(IShellItemImageFactory).GUID;
      IShellItemImageFactory f;
      if (SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out f) != 0 || f == null) return null;
      IntPtr hbm;
      // 0x4 = nur Symbol (kein Vorschaubild), 0x1 = größer ist ok
      if (f.GetImage(new NativeSize { cx = size, cy = size }, 0x4 | 0x1, out hbm) != 0 || hbm == IntPtr.Zero) return null;
      try {
        using (var raw = System.Drawing.Image.FromHbitmap(hbm)) {
          var rect = new System.Drawing.Rectangle(0, 0, raw.Width, raw.Height);
          var bits = raw.LockBits(rect, System.Drawing.Imaging.ImageLockMode.ReadOnly, raw.PixelFormat);
          try {
            using (var argb = new System.Drawing.Bitmap(raw.Width, raw.Height, bits.Stride, System.Drawing.Imaging.PixelFormat.Format32bppPArgb, bits.Scan0))
            using (var copy = new System.Drawing.Bitmap(argb))
            using (var ms = new System.IO.MemoryStream()) {
              copy.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
              return "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());
            }
          } finally { raw.UnlockBits(bits); }
        }
      } finally { DeleteObject(hbm); }
    }
  }

  public class ProcInfo { public string name; public int pid; public double cpu; public double ramMb; public string path; }

  public static class Procs {
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool QueryFullProcessImageName(IntPtr process, int flags, System.Text.StringBuilder path, ref int size);
    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr handle);

    public static string ImagePath(int pid) {
      var handle = OpenProcess(0x1000, false, pid); // PROCESS_QUERY_LIMITED_INFORMATION
      if (handle == IntPtr.Zero) return null;
      try {
        var path = new System.Text.StringBuilder(32768);
        int size = path.Capacity;
        return QueryFullProcessImageName(handle, 0, path, ref size) ? path.ToString() : null;
      } finally { CloseHandle(handle); }
    }

    static Dictionary<int, TimeSpan> last = new Dictionary<int, TimeSpan>();
    static DateTime lastAt = DateTime.MinValue;
    public static List<ProcInfo> Sample() {
      var now = DateTime.UtcNow; double wall = lastAt == DateTime.MinValue ? 0 : (now - lastAt).TotalMilliseconds;
      var cur = new Dictionary<int, TimeSpan>(); var list = new List<ProcInfo>();
      foreach (var p in Process.GetProcesses()) {
        try {
          if (p.Id == 0) continue;
          var t = p.TotalProcessorTime; cur[p.Id] = t;
          double cpu = 0; TimeSpan prev;
          if (wall > 0 && last.TryGetValue(p.Id, out prev)) cpu = (t - prev).TotalMilliseconds / wall / Environment.ProcessorCount * 100;
          list.Add(new ProcInfo { name = p.ProcessName, pid = p.Id, cpu = Math.Round(cpu, 1), ramMb = Math.Round(p.WorkingSet64 / 1048576.0) });
        } catch {}
      }
      last = cur; lastAt = now;
      return list;
    }
  }

  public static class Net {
    static long lastRx = -1, lastTx = -1; static DateTime lastAt;
    public static double[] Speed() {
      long rx = 0, tx = 0;
      foreach (var n in NetworkInterface.GetAllNetworkInterfaces()) {
        if (n.OperationalStatus != OperationalStatus.Up || n.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
        try { var s = n.GetIPStatistics(); rx += s.BytesReceived; tx += s.BytesSent; } catch {}
      }
      var now = DateTime.UtcNow; double[] res = new double[] { 0, 0 };
      if (lastRx >= 0) { double sec = (now - lastAt).TotalSeconds; if (sec > 0) { res[0] = Math.Max(0, (rx - lastRx) / sec); res[1] = Math.Max(0, (tx - lastTx) / sec); } }
      lastRx = rx; lastTx = tx; lastAt = now;
      return res;
    }
  }
}
'@ -ReferencedAssemblies System.Drawing

# ---------- WinRT-Hilfen (WLAN/Bluetooth, Medien) ----------
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$script:asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$type) {
  $t = $script:asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $t.Wait(5000) | Out-Null
  $t.Result
}
function Radios {
  [Windows.Devices.Radios.Radio, Windows.System.Devices, ContentType = WindowsRuntime] | Out-Null
  Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
}
function MediaManager {
  [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
  if (-not $script:mm) { $script:mm = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]) }
  $script:mm
}

function ResolveKnownFolderPath([string]$value) {
  if ($value -notmatch '^\{([0-9A-F-]+)\}\\(.+)$') { return $value }
  $map = @{
    '6D809377-6AF0-444B-8957-A3773F02200E' = $env:ProgramW6432
    '7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E' = ${env:ProgramFiles(x86)}
    '905E63B6-C1BF-494E-B29C-65B732D3D21A' = $env:ProgramFiles
    'F38BF404-1D43-42F2-9305-67DE0B28FC23' = $env:SystemRoot
    '1AC14E77-02E7-4E5D-B744-2EB1AE5198B7' = (Join-Path $env:SystemRoot 'System32')
    'F1B32785-6FBA-4FCF-9D55-7B8E7F157091' = $env:LOCALAPPDATA
    '3EB685DB-65F9-4CF6-A03A-E3EF65729F3D' = $env:APPDATA
  }
  $base = $map[$Matches[1]]
  if ($base) { Join-Path $base $Matches[2] }
}

function NetworkStatus {
  $profileByIndex = @{}
  foreach ($profile in (Get-NetConnectionProfile)) {
    $profileByIndex[[int]$profile.InterfaceIndex] = $profile
  }
  $connections = foreach ($adapter in (Get-NetAdapter | Where-Object { $_.ifOperStatus -eq 'Up' })) {
    $profile = $profileByIndex[[int]$adapter.InterfaceIndex]
    # IANA-InterfaceType 6 = Ethernet, 71 = IEEE 802.11. Virtuelle Adapter haben ein eigenes Symbol.
    $kind = 'network'
    if ($adapter.HardwareInterface -and $adapter.InterfaceType -eq 6) { $kind = 'ethernet' }
    if ($adapter.HardwareInterface -and $adapter.InterfaceType -eq 71) { $kind = 'wifi' }
    if (-not $profile -and $kind -eq 'network') { continue }

    $domain = ''
    $category = [string]$profile.NetworkCategory
    if ($category -eq 'DomainAuthenticated') {
      if (-not $script:networkDomain) {
        try {
          $computer = Get-CimInstance -ClassName Win32_ComputerSystem -Property PartOfDomain,Domain
          if ($computer.PartOfDomain) { $script:networkDomain = $computer.Domain }
        } catch {}
      }
      $domain = $script:networkDomain
    }

    @{
      kind = $kind
      adapter = [string]$adapter.Name
      name = [string]$profile.Name
      category = $category
      domain = $domain
      internet = if ($profile) { 'Internet' -in @($profile.IPv4Connectivity, $profile.IPv6Connectivity) }
    }
  }
  # Physische Verbindungen zuerst. Unter ihnen hat eine Verbindung mit Internet Vorrang.
  @{ connections = @($connections | Where-Object { $_ } | Sort-Object @{ Expression = { $_.kind -eq 'network' } }, @{ Expression = { [bool]$_.internet }; Descending = $true }, kind, name) }
}

function Handle($req) {
  $a = $req.args
  switch ($req.cmd) {
    'ping' { 'pong' }
    'windowsPins' {
      # Angeheftete Elemente der Windows-Taskleiste in ihrer Reihenfolge: Verknüpfungen (.lnk) und Apps (Store-Apps usw.)
      $b = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Taskband' -Name Favorites -ErrorAction SilentlyContinue).Favorites
      if (-not $b) { return @() }
      # unverändert? dann das letzte Ergebnis (spart das teure Auflisten aller Apps)
      $sig = [Convert]::ToBase64String([Security.Cryptography.MD5]::Create().ComputeHash($b))
      if ($script:pinSig -eq $sig -and $script:pinErgebnis) { return $script:pinErgebnis }
      $s = [Text.Encoding]::Unicode.GetString($b)
      $treffer = @()
      foreach ($app in (Get-StartApps)) {
        $i = $s.IndexOf($app.AppID, [StringComparison]::OrdinalIgnoreCase)
        # manche Apps (z. B. Lenovo Vantage) stehen nur mit ihrem Paketnamen drin
        if ($i -lt 0 -and $app.AppID -match "^([^!]+_[a-z0-9]{13})!") { $i = $s.IndexOf($Matches[1], [StringComparison]::OrdinalIgnoreCase) }
        if ($i -ge 0) { $treffer += @{ kind = 'app'; name = $app.Name; appId = $app.AppID; pos = $i } }
      }
      foreach ($m in [regex]::Matches($s, '[^\x00-\x1F\\/:*?"<>|]{1,120}\.lnk')) {
        $name = $m.Value -replace '^[^\p{L}\p{N}(]+', ''
        $treffer += @{ kind = 'lnk'; name = $name; pos = $m.Index }
      }
      $script:pinErgebnis = @($treffer | Sort-Object { $_.pos })
      $script:pinSig = $sig
      $script:pinErgebnis
    }
    'unpinFromTaskbar' {
      # Von der Windows-Taskleiste lösen – derselbe Befehl wie „Von Taskleiste lösen“ im Rechtsklick-Menü.
      # files: angeheftete Verknüpfungen (User Pinned\TaskBar), appId: Store-App o. ä. aus shell:AppsFolder
      $sh = New-Object -ComObject Shell.Application
      $geloest = 0
      $ziele = @()
      foreach ($f in @($a.files)) {
        if (-not $f -or -not (Test-Path -LiteralPath $f)) { continue }
        $item = $sh.Namespace((Split-Path -LiteralPath $f)).ParseName((Split-Path -LiteralPath $f -Leaf))
        if ($item) { $ziele += $item }
      }
      if ($a.appId) {
        $item = $sh.Namespace('shell:AppsFolder').Items() | Where-Object { $_.Path -eq $a.appId } | Select-Object -First 1
        if ($item) { $ziele += $item }
      }
      foreach ($item in $ziele) {
        # ohne Umlaut im Suchmuster: Windows PowerShell liest diese Datei (ohne BOM) nicht als UTF-8
        $verb = $item.Verbs() | Where-Object { ($_.Name -replace '&', '') -match 'Von Taskleiste l.sen|Unpin from taskbar' } | Select-Object -First 1
        try {
          if ($verb) { $verb.DoIt() } else { $item.InvokeVerb('taskbarunpin') }
          $geloest++
        } catch {}
      }
      $geloest
    }
    'startApps' {
      # Alle Apps aus dem Startmenü – auch Store-Apps wie Snipping Tool, Rechner, Fotos (5 Minuten zwischengespeichert)
      if (-not $script:appsAt -or ((Get-Date) - $script:appsAt).TotalMinutes -gt 5) {
        $script:apps = @(Get-StartApps | ForEach-Object { @{ name = $_.Name; appId = $_.AppID } })
        $script:appsAt = Get-Date
      }
      $script:apps
    }
    'searchFiles' {
      # Dateien und Ordner über den Windows-Suchindex (dasselbe, was die Windows-Suche benutzt)
      $q = ([string]$a.q) -replace "['""%*\[\]]", ' '
      $q = $q.Trim()
      if ($q.Length -lt 2) { return @() }
      $max = [int]($a.max | ForEach-Object { if ($_) { $_ } else { 12 } })
      $worte = ($q -split '\s+' | Where-Object { $_ } | ForEach-Object { '"' + $_ + '*"' }) -join ' AND '
      $sql = "SELECT TOP $max System.ItemUrl, System.ItemNameDisplay, System.DateModified, System.ItemTypeText, System.Kind FROM SystemIndex WHERE SCOPE='file:' AND CONTAINS(System.ItemNameDisplay, '$worte') AND System.ItemUrl NOT LIKE '%/node_modules/%' AND System.ItemUrl NOT LIKE '%/.git/%' AND System.ItemUrl NOT LIKE '%/AppData/%' ORDER BY System.DateModified DESC"
      $con = New-Object -ComObject ADODB.Connection
      $rs = New-Object -ComObject ADODB.Recordset
      $liste = @()
      try {
        $con.Open("Provider=Search.CollatorDSO;Extended Properties='Application=Windows';")
        $rs.Open($sql, $con)
        while (-not $rs.EOF) {
          $kind = $rs.Fields.Item('System.Kind').Value
          $liste += @{
            path = ([string]$rs.Fields.Item('System.ItemUrl').Value -replace '^file:', '').Replace('/', [IO.Path]::DirectorySeparatorChar)
            name = $rs.Fields.Item('System.ItemNameDisplay').Value
            type = $rs.Fields.Item('System.ItemTypeText').Value
            modified = $(try { ([datetime]$rs.Fields.Item('System.DateModified').Value).ToString('o') } catch { $null })
            folder = [bool]($kind -and (@($kind) -contains 'folder'))
          }
          $rs.MoveNext()
        }
      } finally {
        try { $rs.Close() } catch {}
        try { $con.Close() } catch {}
      }
      $liste
    }
    'resolveAppId' {
      # „{Bekannter-Ordner-GUID}\pfad\prog.exe“ in einen echten Pfad umwandeln
      $id = [string]$a.appId
      if ($id -match '^\{[0-9A-F-]+\}\\') { ResolveKnownFolderPath $id }
    }
    'backgroundApps' {
      # Explorer speichert auch alte Einträge. Nur Pfade mit einem laufenden Prozess verwenden.
      $registriert = @{}
      foreach ($key in (Get-ChildItem -LiteralPath 'HKCU:\Control Panel\NotifyIconSettings' -ErrorAction SilentlyContinue)) {
        $wert = [string]$key.GetValue('ExecutablePath')
        if (-not $wert) { continue }
        $pfad = ResolveKnownFolderPath ([Environment]::ExpandEnvironmentVariables($wert))
        if ($pfad) { $registriert[$pfad] = $true }
      }
      $sitzung = [Diagnostics.Process]::GetCurrentProcess().SessionId
      $windowsOrdner = "$env:SystemRoot\"
      $explorer = Join-Path $env:SystemRoot 'explorer.exe'
      $werkzeug = '\\(nodejs|dotnet|Git|EdgeWebView)\\|\\node_modules\\electron\\dist\\'
      $liste = @{}
      foreach ($p in (Get-Process | Where-Object { $_.SessionId -eq $sitzung })) {
        try {
          $pfad = [OxpDock.Procs]::ImagePath($p.Id)
          if (-not $pfad -or $pfad -eq $explorer -or $pfad -eq $a.ownPath -or $p.ProcessName -eq 'OXP-Dock') { continue }
          $tray = $registriert.ContainsKey($pfad)
          $system = $pfad.StartsWith($windowsOrdner, [StringComparison]::OrdinalIgnoreCase)
          if (-not $tray -and ($system -or $pfad -match $werkzeug)) { continue }
          if (-not $liste.ContainsKey($pfad)) {
            $name = $null
            try { $name = [Diagnostics.FileVersionInfo]::GetVersionInfo($pfad).FileDescription } catch {}
            if (-not $name -or -not $name.Trim()) { $name = $p.ProcessName }
            $liste[$pfad] = @{ path = $pfad; name = $name.Trim(); pids = @(); tray = $tray; canQuit = -not $system }
          }
          $liste[$pfad].pids += $p.Id
        } catch {}
      }
      @{ apps = @($liste.Values) }
    }
    'quitBackgroundApp' {
      $sitzung = [Diagnostics.Process]::GetCurrentProcess().SessionId
      $fehler = $false
      foreach ($id in $a.pids) {
        $p = Get-Process -Id $id -ErrorAction SilentlyContinue
        if (-not $p -or $p.SessionId -ne $sitzung -or [OxpDock.Procs]::ImagePath($p.Id) -ne $a.path) { continue }
        try { $p.Kill() } catch { if (-not $p.HasExited) { $fehler = $true } }
      }
      -not $fehler
    }
    'icon' { [OxpDock.ShellIcon]::Png([string]$a.path, [int]($a.size | ForEach-Object { if ($_) { $_ } else { 48 } })) }
    'audio' {
      $out = @{ volume = [math]::Round([OxpDock.Audio]::GetVolume(0) * 100); muted = [OxpDock.Audio]::GetMute(0) }
      try { $out.mic = [math]::Round([OxpDock.Audio]::GetVolume(1) * 100); $out.micMuted = [OxpDock.Audio]::GetMute(1) } catch { $out.mic = $null }
      $out
    }
    'audioDevices' { @{ output = [OxpDock.Audio]::Devices(0); input = [OxpDock.Audio]::Devices(1) } }
    'setVolume' { [OxpDock.Audio]::SetVolume([int]$a.flow, [float]($a.value / 100)); $true }
    'setMute' { [OxpDock.Audio]::SetMute([int]$a.flow, [bool]$a.value); $true }
    'setDefaultDevice' { [OxpDock.Audio]::SetDefault([string]$a.id); $true }
    'brightness' {
      $wmi = $null
      try { $wmi = (Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness } catch {}
      if ($null -ne $wmi) { @{ value = [int]$wmi; source = 'intern' } }
      else { $d = [OxpDock.Ddc]::Get(); if ($d -ge 0) { @{ value = $d; source = 'ddc' } } else { @{ value = $null; source = $null } } }
    }
    'setBrightness' {
      $v = [int]$a.value; $done = $false
      try { $m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop; Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = [byte]$v } | Out-Null; $done = $true } catch {}
      if (-not $done) { [OxpDock.Ddc]::Set($v) | Out-Null }
      $true
    }
    'radios' { @(Radios | ForEach-Object { @{ name = $_.Name; kind = $_.Kind.ToString(); on = ($_.State.ToString() -eq 'On') } }) }
    'setRadio' {
      [Windows.Devices.Radios.RadioState, Windows.System.Devices, ContentType = WindowsRuntime] | Out-Null
      $r = Radios | Where-Object { $_.Kind.ToString() -eq $a.kind } | Select-Object -First 1
      if (-not $r) { throw "Kein Gerät: $($a.kind)" }
      $state = if ($a.on) { [Windows.Devices.Radios.RadioState]::On } else { [Windows.Devices.Radios.RadioState]::Off }
      (Await ($r.SetStateAsync($state)) ([Windows.Devices.Radios.RadioAccessStatus])).ToString()
    }
    'procs' {
      $list = [OxpDock.Procs]::Sample()
      # gleiche Programme zusammenfassen (z. B. viele chrome.exe)
      $groups = $list | Group-Object name | ForEach-Object {
        @{ name = $_.Name; count = $_.Count; cpu = [math]::Round(($_.Group | Measure-Object cpu -Sum).Sum, 1); ramMb = [math]::Round(($_.Group | Measure-Object ramMb -Sum).Sum); pid = $_.Group[0].pid }
      }
      @{ cpu = @($groups | Sort-Object { -$_.cpu } | Select-Object -First 8); ram = @($groups | Sort-Object { -$_.ramMb } | Select-Object -First 8) }
    }
    'net' { $s = [OxpDock.Net]::Speed(); @{ down = $s[0]; up = $s[1] } }
    'networkStatus' { NetworkStatus }
    'temperature' {
      $t = $null
      try { $z = Get-CimInstance -ClassName Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction Stop | Where-Object { $_.Temperature -gt 0 } | Sort-Object Temperature -Descending | Select-Object -First 1; if ($z) { $t = [math]::Round($z.Temperature - 273.15) } } catch {}
      @{ celsius = $t }
    }
    'media' {
      $m = MediaManager
      $s = $m.GetCurrentSession()
      if (-not $s) { return @{ active = $false } }
      [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
      $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $info = $s.GetPlaybackInfo(); $tl = $s.GetTimelineProperties()
      $thumb = $null
      if ($a.thumb -and $p.Thumbnail) {
        try {
          [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
          $st = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
          $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($st)
          $ms = New-Object System.IO.MemoryStream; $net.CopyTo($ms)
          $thumb = 'data:' + $st.ContentType + ';base64,' + [Convert]::ToBase64String($ms.ToArray())
        } catch {}
      }
      @{
        active = $true; app = $s.SourceAppUserModelId; title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle
        playing = ($info.PlaybackStatus.ToString() -eq 'Playing'); thumb = $thumb
        position = $tl.Position.TotalSeconds; duration = $tl.EndTime.TotalSeconds
      }
    }
    'mediaControl' {
      $s = (MediaManager).GetCurrentSession(); if (-not $s) { return $false }
      switch ($a.action) {
        'play' { Await ($s.TryTogglePlayPauseAsync()) ([bool]) }
        'next' { Await ($s.TrySkipNextAsync()) ([bool]) }
        'prev' { Await ($s.TrySkipPreviousAsync()) ([bool]) }
      }
    }
    'outlookEvents' {
      # Nur wenn Outlook schon läuft – das Dock startet Outlook nie selbst.
      $o = $null
      try { $o = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application') } catch { return @{ running = $false; events = @() } }
      $cal = $o.GetNamespace('MAPI').GetDefaultFolder(9)
      $items = $cal.Items; $items.IncludeRecurrences = $true; $items.Sort('[Start]')
      $von = (Get-Date).Date; $bis = $von.AddDays([int]($a.days | ForEach-Object { if ($_) { $_ } else { 14 } }))
      $filter = "[Start] >= '" + $von.ToString('g') + "' AND [Start] <= '" + $bis.ToString('g') + "'"
      $list = @()
      foreach ($i in $items.Restrict($filter)) {
        $list += @{ title = $i.Subject; start = $i.Start.ToString('o'); end = $i.End.ToString('o'); allDay = [bool]$i.AllDayEvent; place = $i.Location }
        if ($list.Count -ge 60) { break }
      }
      @{ running = $true; events = $list }
    }
    'outlookUnread' {
      $o = $null
      try { $o = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application') } catch { return @{ running = $false } }
      $inbox = $o.GetNamespace('MAPI').GetDefaultFolder(6)
      $neu = @()
      if ($a.list) {
        $its = $inbox.Items.Restrict('[UnRead] = True'); $its.Sort('[ReceivedTime]', $true)
        foreach ($m in $its) { $neu += @{ from = $m.SenderName; subject = $m.Subject; when = $m.ReceivedTime.ToString('o') }; if ($neu.Count -ge 8) { break } }
      }
      @{ running = $true; unread = $inbox.UnReadItemCount; latest = $neu }
    }
    default { throw "Unbekannter Befehl: $($req.cmd)" }
  }
}

[Console]::Out.WriteLine('{"ready":true}')
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if (-not $line.Trim()) { continue }
  $req = $null
  try {
    $req = $line | ConvertFrom-Json
    $res = Handle $req
    $json = @{ id = $req.id; ok = $true; result = $res } | ConvertTo-Json -Depth 6 -Compress
  } catch {
    $id = if ($req) { $req.id } else { 0 }
    $json = @{ id = $id; ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
  }
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
}

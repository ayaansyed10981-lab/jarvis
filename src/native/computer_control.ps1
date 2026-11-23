$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDevice {
    int Activate(ref Guid id, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr pNotify);
    int UnregisterControlChangeNotify(IntPtr pNotify);
    int GetChannelCount(out uint pnChannelCount);
    int SetMasterVolumeLevel(float fLevelDB, ref Guid pguidEventContext);
    int SetMasterVolumeLevelScalar(float fLevel, ref Guid pguidEventContext);
    int GetMasterVolumeLevel(out float pfLevelDB);
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int SetChannelVolumeLevel(uint nChannel, float fLevelDB, ref Guid pguidEventContext);
    int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, ref Guid pguidEventContext);
    int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
    int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid pguidEventContext);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute);
    int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
    int VolumeStepUp(ref Guid pguidEventContext);
    int VolumeStepDown(ref Guid pguidEventContext);
    int QueryHardwareSupport(out uint pdwHardwareSupportMask);
    int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
internal class MMDeviceEnumeratorComObject { }

public class Win32Control {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool LockWorkStation();

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public struct MEMORYSTATUSEX {
        public uint dwLength;
        public uint dwMemoryLoad;
        public ulong ullTotalPhys;
        public ulong ullAvailPhys;
        public ulong ullTotalPageFile;
        public ulong ullAvailPageFile;
        public ulong ullTotalVirtual;
        public ulong ullAvailVirtual;
        public ulong ullAvailExtendedVirtual;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);

    public static MEMORYSTATUSEX GetMemoryStatus() {
        var mem = new MEMORYSTATUSEX();
        mem.dwLength = (uint)Marshal.SizeOf(typeof(MEMORYSTATUSEX));
        GlobalMemoryStatusEx(ref mem);
        return mem;
    }

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, int dx, int dy, int dwData, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    private static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public const uint KEYEVENTF_KEYUP = 0x0002;
    public const uint WM_CLOSE = 0x0010;
    public const int SW_RESTORE = 9;
    public const int SW_MINIMIZE = 6;
    public const int SW_MAXIMIZE = 3;

    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
    public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    public const uint MOUSEEVENTF_WHEEL = 0x0800;

    public static void TapKey(byte vk) {
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    public static void PressCombo(byte[] vks) {
        for (int i = 0; i < vks.Length; i++) {
            keybd_event(vks[i], 0, 0, UIntPtr.Zero);
        }
        System.Threading.Thread.Sleep(40);
        for (int i = vks.Length - 1; i >= 0; i--) {
            keybd_event(vks[i], 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        }
    }

    public class WindowInfo {
        public long Handle;
        public string Title;
        public string ProcessName;
        public uint ProcessId;
    }

    public static List<WindowInfo> GetOpenWindows() {
        var list = new List<WindowInfo>();
        EnumWindows((hWnd, lParam) => {
            if (!IsWindowVisible(hWnd)) return true;
            int len = GetWindowTextLength(hWnd);
            if (len <= 0) return true;
            var sb = new StringBuilder(len + 1);
            GetWindowText(hWnd, sb, sb.Capacity);
            string title = sb.ToString().Trim();
            if (string.IsNullOrEmpty(title)) return true;

            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            string procName = "";
            try {
                procName = Process.GetProcessById((int)pid).ProcessName;
            } catch {}

            list.Add(new WindowInfo {
                Handle = hWnd.ToInt64(),
                Title = title,
                ProcessName = procName,
                ProcessId = pid
            });
            return true;
        }, IntPtr.Zero);
        return list;
    }

    public static int GetMasterVolume() {
        try {
            var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
            IMMDevice dev;
            if (enumerator.GetDefaultAudioEndpoint(0, 1, out dev) == 0 && dev != null) {
                Guid iid = typeof(IAudioEndpointVolume).GUID;
                object volObj;
                if (dev.Activate(ref iid, 1, IntPtr.Zero, out volObj) == 0 && volObj != null) {
                    var vol = (IAudioEndpointVolume)volObj;
                    float level;
                    vol.GetMasterVolumeLevelScalar(out level);
                    return (int)Math.Round(level * 100f);
                }
            }
        } catch {}
        return -1;
    }

    public static int SetMasterVolume(int percent) {
        try {
            percent = Math.Max(0, Math.Min(100, percent));
            var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
            IMMDevice dev;
            if (enumerator.GetDefaultAudioEndpoint(0, 1, out dev) == 0 && dev != null) {
                Guid iid = typeof(IAudioEndpointVolume).GUID;
                object volObj;
                if (dev.Activate(ref iid, 1, IntPtr.Zero, out volObj) == 0 && volObj != null) {
                    var vol = (IAudioEndpointVolume)volObj;
                    Guid ctx = Guid.Empty;
                    vol.SetMasterVolumeLevelScalar(percent / 100f, ref ctx);
                    return percent;
                }
            }
        } catch {}
        return -1;
    }

    public static int AdjustMasterVolume(int delta) {
        int cur = GetMasterVolume();
        if (cur < 0) cur = 50;
        int target = Math.Max(0, Math.Min(100, cur + delta));
        return SetMasterVolume(target);
    }
}
"@

function Emit-Json($obj) {
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 6))
    [Console]::Out.Flush()
}

$appAliases = @{
    "notepad"       = "notepad.exe"
    "calculator"    = "calc.exe"
    "calc"          = "calc.exe"
    "paint"         = "mspaint.exe"
    "explorer"      = "explorer.exe"
    "files"         = "explorer.exe"
    "file explorer" = "explorer.exe"
    "task manager"  = "taskmgr.exe"
    "taskmgr"       = "taskmgr.exe"
    "terminal"      = "wt.exe"
    "cmd"           = "cmd.exe"
    "powershell"    = "powershell.exe"
    "settings"      = "ms-settings:"
    "chrome"        = "chrome.exe"
    "google chrome" = "chrome.exe"
    "edge"          = "msedge.exe"
    "microsoft edge"= "msedge.exe"
    "vscode"        = "code"
    "vs code"       = "code"
    "code"          = "code"
    "spotify"       = "spotify:"
    "whatsapp"      = "whatsapp:"
    "mail"          = "outlookmail:"
    "calendar"      = "outlookcal:"
    "store"         = "ms-windows-store:"
    "clock"         = "ms-clock:"
    "camera"        = "microsoft.windows.camera:"
    "photos"        = "ms-photos:"
    "snipping tool" = "ms-screenclip:"
    "browser"       = "chrome.exe"
    "document"      = "winword.exe"
    "word document" = "winword.exe"
    "word"          = "winword.exe"
    "excel"         = "excel.exe"
    "powerpoint"    = "powerpnt.exe"
    "copilot"       = "ms-copilot:"
    "phone link"    = "ms-yourphone:"
    "phonelink"     = "ms-yourphone:"
    "phone"         = "ms-yourphone:"
    "your phone"    = "ms-yourphone:"
}

$vkMap = @{
    "ctrl" = 0x11; "control" = 0x11; "alt" = 0x12; "shift" = 0x10;
    "win" = 0x5B; "windows" = 0x5B; "meta" = 0x5B;
    "enter" = 0x0D; "return" = 0x0D; "tab" = 0x09; "esc" = 0x1B; "escape" = 0x1B;
    "space" = 0x20; "backspace" = 0x08; "delete" = 0x2E; "del" = 0x2E;
    "up" = 0x26; "down" = 0x28; "left" = 0x25; "right" = 0x27;
    "home" = 0x24; "end" = 0x23; "pageup" = 0x21; "pagedown" = 0x22;
    "f1" = 0x70; "f2" = 0x71; "f3" = 0x72; "f4" = 0x73; "f5" = 0x74; "f6" = 0x75;
    "f7" = 0x76; "f8" = 0x77; "f9" = 0x78; "f10" = 0x79; "f11" = 0x7A; "f12" = 0x7B;
    "printscreen" = 0x2C
}

function Resolve-Vk([string]$keyName) {
    $k = $keyName.Trim().ToLowerInvariant()
    if ($vkMap.ContainsKey($k)) { return [byte]$vkMap[$k] }
    if ($k.Length -eq 1) {
        $ch = [char]$k.ToUpperInvariant()[0]
        $code = [int]$ch
        if (($code -ge 0x30 -and $code -le 0x39) -or ($code -ge 0x41 -and $code -le 0x5A)) {
            return [byte]$code
        }
    }
    throw "Unsupported key in hotkey: $keyName"
}

function Handle-Action($req) {
    $action = $req.action
    $args = $req.args

    switch ($action) {
        "open_app" {
            $name = [string]$args.app
            $key = $name.Trim().ToLowerInvariant()
            $target = if ($appAliases.ContainsKey($key)) { $appAliases[$key] } else { $name.Trim() }
            if ($args.arguments) {
                Start-Process -FilePath $target -ArgumentList ([string]$args.arguments)
            } else {
                Start-Process -FilePath $target
            }
            return @{ message = "Launched $target" }
        }

        "open_url" {
            $url = [string]$args.url
            if (-not ($url -match "^https?://")) {
                $url = "https://" + $url
            }
            Start-Process $url
            return @{ message = "Opened $url in default browser" }
        }

        "close_app" {
            $raw = if ($args.app) { [string]$args.app } elseif ($args.name) { [string]$args.name } elseif ($args.title) { [string]$args.title } else { "this" }
            $target = $raw.Trim().ToLowerInvariant()
            $force = [bool]$args.force

            # 1. Close current / active window or tab
            if ([string]::IsNullOrWhiteSpace($target) -or $target -match '^(?:this|current|active)(?:\s+(?:app|window|program))?$|^window$') {
                $hwnd = [Win32Control]::GetForegroundWindow()
                if ($hwnd -ne [IntPtr]::Zero) {
                    [Win32Control]::PostMessage($hwnd, [Win32Control]::WM_CLOSE, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
                    return @{ message = "Closed active window" }
                }
                [Win32Control]::PressCombo([byte[]]@(0x12, 0x73)) # Alt+F4
                return @{ message = "Closed active window" }
            }

            if ($target -match '^(?:this\s+)?tab$') {
                [Win32Control]::PressCombo([byte[]]@(0x11, 0x57)) # Ctrl+W
                return @{ message = "Closed active tab" }
            }

            # 2. Resolve app aliases
            $procQuery = $target
            if ($appAliases.ContainsKey($target)) {
                $alias = $appAliases[$target]
                $procQuery = [System.IO.Path]::GetFileNameWithoutExtension($alias)
            }
            $procQuery = ($procQuery -replace '\.exe$', '').Trim()

            $isBrowser = ($target -eq "browser" -or $target -eq "web browser" -or $target -eq "the browser")
            $browserProcs = @("chrome", "msedge", "firefox", "brave")

            # 3. Gracefully close matching open top-level windows
            $wins = [Win32Control]::GetOpenWindows()
            $matchedWins = $wins | Where-Object {
                if ($isBrowser) {
                    $browserProcs -contains $_.ProcessName.ToLowerInvariant()
                } else {
                    $_.ProcessName.ToLowerInvariant() -like "*$procQuery*" -or $_.Title.ToLowerInvariant() -like "*$target*"
                }
            }

            $closedCount = 0
            if ($matchedWins) {
                foreach ($w in $matchedWins) {
                    $hwnd = [IntPtr]$w.Handle
                    [Win32Control]::PostMessage($hwnd, [Win32Control]::WM_CLOSE, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
                    $closedCount++
                }
            }

            # 4. If no window caught or force requested, use process cleanup
            if ($closedCount -eq 0 -or $force) {
                $procs = Get-Process -ErrorAction SilentlyContinue | Where-Object {
                    if ($isBrowser) {
                        $browserProcs -contains $_.ProcessName.ToLowerInvariant()
                    } else {
                        $_.ProcessName.ToLowerInvariant() -like "*$procQuery*" -or $_.MainWindowTitle.ToLowerInvariant() -like "*$target*"
                    }
                }
                if ($procs) {
                    foreach ($p in $procs) {
                        try {
                            if ($force) { $p.Kill() } else { $p.CloseMainWindow() | Out-Null }
                            $closedCount++
                        } catch {}
                    }
                }
            }

            if ($closedCount -gt 0) {
                return @{ message = "Closed $target" }
            } else {
                return @{ message = "No running window or app found for $target" }
            }
        }

        "media_volume" {
            $cmd = ([string]$args.command).Trim().ToLowerInvariant()
            $steps = if ($args.steps) { [Math]::Max(1, [Math]::Min(25, [int]$args.steps)) } else { 5 }
            $percent = if ($null -ne $args.percent) { [int]$args.percent } elseif ($null -ne $args.level) { [int]$args.level } else { -1 }

            switch ($cmd) {
                "set_volume" {
                    if ($percent -ge 0) {
                        $set = [Win32Control]::SetMasterVolume($percent)
                        if ($set -ge 0) { return @{ message = "Set volume to $set percent"; volume = $set } }
                    }
                    throw "Invalid volume percentage: $percent"
                }
                "get_volume" {
                    $cur = [Win32Control]::GetMasterVolume()
                    return @{ message = "Current volume is $cur percent"; volume = $cur }
                }
                "volume_up" {
                    $delta = if ($args.delta) { [int]$args.delta } else { [Math]::Max(4, $steps * 2) }
                    $newVol = [Win32Control]::AdjustMasterVolume($delta)
                    if ($newVol -ge 0) {
                        return @{ message = "Increased volume to $newVol percent"; volume = $newVol }
                    }
                    for ($i = 0; $i -lt $steps; $i++) { [Win32Control]::TapKey(0xAF); Start-Sleep -Milliseconds 25 }
                    return @{ message = "Increased volume by $steps steps" }
                }
                "volume_down" {
                    $delta = if ($args.delta) { [int]$args.delta } else { [Math]::Max(4, $steps * 2) }
                    $newVol = [Win32Control]::AdjustMasterVolume(-$delta)
                    if ($newVol -ge 0) {
                        return @{ message = "Decreased volume to $newVol percent"; volume = $newVol }
                    }
                    for ($i = 0; $i -lt $steps; $i++) { [Win32Control]::TapKey(0xAE); Start-Sleep -Milliseconds 25 }
                    return @{ message = "Decreased volume by $steps steps" }
                }
                "mute"        { [Win32Control]::TapKey(0xAD); return @{ message = "Toggled mute" } }
                "unmute"      { [Win32Control]::TapKey(0xAD); return @{ message = "Unmuted volume" } }
                "play_pause"  { [Win32Control]::TapKey(0xB3); return @{ message = "Toggled media play/pause" } }
                "next_track"  { [Win32Control]::TapKey(0xB0); return @{ message = "Skipped to next track" } }
                "prev_track"  { [Win32Control]::TapKey(0xB1); return @{ message = "Went to previous track" } }
                "stop_media"  { [Win32Control]::TapKey(0xB2); return @{ message = "Stopped media playback" } }
                "fullscreen"        { [Win32Control]::TapKey(0x46); return @{ message = "Toggled video fullscreen" } }
                "fullscreen_video"  { [Win32Control]::TapKey(0x46); return @{ message = "Toggled video fullscreen" } }
                "fullscreen_browser"{ [Win32Control]::TapKey(0x7A); return @{ message = "Toggled browser fullscreen" } }
                "exit_fullscreen"   { [Win32Control]::TapKey(0x1B); return @{ message = "Exited fullscreen" } }
                "theater_mode"      { [Win32Control]::TapKey(0x54); return @{ message = "Toggled theater mode" } }
                default       { throw "Unknown media/volume command: $cmd" }
            }
        }

        "list_windows" {
            $wins = [Win32Control]::GetOpenWindows() | Select-Object -First 30
            return @{
                windows = @($wins | ForEach-Object {
                    @{ title = $_.Title; process = $_.ProcessName; pid = $_.ProcessId }
                })
            }
        }

        "window_action" {
            $op = ([string]$args.operation).Trim().ToLowerInvariant()
            if ($op -eq "show_desktop") {
                [Win32Control]::PressCombo([byte[]]@(0x5B, 0x44))
                return @{ message = "Toggled show desktop" }
            }
            if ($op -eq "lock_screen") {
                [Win32Control]::LockWorkStation() | Out-Null
                return @{ message = "Locked Windows workstation" }
            }
            $query = ([string]$args.title).Trim()
            if ([string]::IsNullOrWhiteSpace($query)) {
                throw "Window title or process name is required for operation '$op'"
            }
            $wins = [Win32Control]::GetOpenWindows()
            $match = $wins | Where-Object {
                $_.Title -like "*$query*" -or $_.ProcessName -like "*$query*"
            } | Select-Object -First 1

            if ($null -eq $match) {
                throw "No open window found matching '$query'"
            }
            $hwnd = [IntPtr]$match.Handle
            switch ($op) {
                "focus"    { [Win32Control]::ShowWindow($hwnd, [Win32Control]::SW_RESTORE) | Out-Null; [Win32Control]::SetForegroundWindow($hwnd) | Out-Null; return @{ message = "Focused window: $($match.Title)" } }
                "minimize" { [Win32Control]::ShowWindow($hwnd, [Win32Control]::SW_MINIMIZE) | Out-Null; return @{ message = "Minimized window: $($match.Title)" } }
                "maximize" { [Win32Control]::ShowWindow($hwnd, [Win32Control]::SW_MAXIMIZE) | Out-Null; [Win32Control]::SetForegroundWindow($hwnd) | Out-Null; return @{ message = "Maximized window: $($match.Title)" } }
                "close"    { [Win32Control]::PostMessage($hwnd, [Win32Control]::WM_CLOSE, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null; return @{ message = "Sent close to window: $($match.Title)" } }
                default    { throw "Unknown window operation: $op" }
            }
        }

        "keyboard_type" {
            $text = [string]$args.text
            # Escape SendKeys special chars so arbitrary prose types safely
            $escaped = $text -replace '([+^%~(){}\[\]])', '{$1}'
            [System.Windows.Forms.SendKeys]::SendWait($escaped)
            if ($args.pressEnter) {
                [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
            }
            return @{ message = "Typed $($text.Length) characters" }
        }

        "keyboard_hotkey" {
            $combo = ([string]$args.keys).Trim()
            $parts = $combo.Split("+") | ForEach-Object { $_.Trim() } | Where-Object { $_.Length -gt 0 }
            $vks = New-Object byte[] $parts.Count
            for ($i = 0; $i -lt $parts.Count; $i++) {
                $vks[$i] = Resolve-Vk $parts[$i]
            }
            [Win32Control]::PressCombo($vks)
            return @{ message = "Pressed hotkey $combo" }
        }

        "mouse_action" {
            $op = ([string]$args.operation).Trim().ToLowerInvariant()
            if ($null -ne $args.x -and $null -ne $args.y) {
                [Win32Control]::SetCursorPos([int]$args.x, [int]$args.y) | Out-Null
                Start-Sleep -Milliseconds 30
            }
            switch ($op) {
                "move"         { return @{ message = "Moved cursor to ($($args.x), $($args.y))" } }
                "left_click"   { [Win32Control]::mouse_event([Win32Control]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero); [Win32Control]::mouse_event([Win32Control]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero); return @{ message = "Left-clicked" } }
                "double_click" {
                    for ($i = 0; $i -lt 2; $i++) {
                        [Win32Control]::mouse_event([Win32Control]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
                        [Win32Control]::mouse_event([Win32Control]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
                        Start-Sleep -Milliseconds 60
                    }
                    return @{ message = "Double-clicked" }
                }
                "right_click"  { [Win32Control]::mouse_event([Win32Control]::MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, [UIntPtr]::Zero); [Win32Control]::mouse_event([Win32Control]::MOUSEEVENTF_RIGHTUP, 0, 0, 0, [UIntPtr]::Zero); return @{ message = "Right-clicked" } }
                "scroll_up"    { $amt = if ($args.amount) { [int]$args.amount * 120 } else { 360 }; [Win32Control]::mouse_event([Win32Control]::MOUSEEVENTF_WHEEL, 0, 0, $amt, [UIntPtr]::Zero); return @{ message = "Scrolled up" } }
                "scroll_down"  { $amt = if ($args.amount) { [int]$args.amount * -120 } else { -360 }; [Win32Control]::mouse_event([Win32Control]::MOUSEEVENTF_WHEEL, 0, 0, $amt, [UIntPtr]::Zero); return @{ message = "Scrolled down" } }
                default        { throw "Unknown mouse operation: $op" }
            }
        }

        "screenshot" {
            $outPath = [string]$args.path
            $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
            $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            try {
                $g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
                $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
            } finally {
                $g.Dispose()
                $bmp.Dispose()
            }
            return @{ path = $outPath; width = $bounds.Width; height = $bounds.Height }
        }

        "clipboard_get" {
            $text = Get-Clipboard -Raw -ErrorAction SilentlyContinue
            return @{ text = if ($null -eq $text) { "" } else { [string]$text } }
        }

        "clipboard_set" {
            Set-Clipboard -Value ([string]$args.text)
            return @{ message = "Copied text to clipboard" }
        }

        "brightness" {
            $op = ([string]$args.operation).Trim().ToLowerInvariant()
            $cur = $null
            try {
                $cur = (Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness
            } catch {
                try {
                    $cur = (Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness
                } catch {}
            }
            if ($null -eq $cur) {
                throw "Screen brightness control is unavailable on this display."
            }
            if ($op -eq "get") {
                return @{ brightness = [int]$cur; message = "Current brightness is $cur percent" }
            }
            $target = [int]$cur
            if ($op -eq "up") { $target = [Math]::Min(100, $cur + 20) }
            elseif ($op -eq "down") { $target = [Math]::Max(5, $cur - 20) }
            elseif ($op -eq "set" -and $null -ne $args.level) { $target = [Math]::Max(0, [Math]::Min(100, [int]$args.level)) }
            else { throw "Unknown brightness operation: $op" }

            try {
                $m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop | Select-Object -First 1
                Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness -Arguments @{ Timeout = [uint32]1; Brightness = [byte]$target } | Out-Null
            } catch {
                $m = Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods -ErrorAction Stop | Select-Object -First 1
                $m.WmiSetBrightness(1, $target) | Out-Null
            }
            return @{ brightness = $target; message = "Set screen brightness to $target percent" }
        }

        "save_screenshot" {
            $destDir = if ($args.folder -and ([string]$args.folder).ToLowerInvariant() -eq "desktop") {
                Join-Path $env:USERPROFILE "Desktop"
            } else {
                Join-Path $env:USERPROFILE "Pictures\Screenshots"
            }
            if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
            $fileName = "Ultron_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".png"
            $outPath = Join-Path $destDir $fileName
            $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
            $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            try {
                $g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
                $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
            } finally {
                $g.Dispose()
                $bmp.Dispose()
            }
            return @{ path = $outPath; fileName = $fileName; message = "Saved screenshot as $fileName" }
        }

        "sleep_pc" {
            [System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false) | Out-Null
            return @{ message = "Putting computer to sleep" }
        }

        "system_info" {
            $now = Get-Date
            $power = [System.Windows.Forms.SystemInformation]::PowerStatus
            $batteryPct = [Math]::Round($power.BatteryLifePercent * 100)
            $charging = ($power.PowerLineStatus.ToString() -eq "Online")

            $mem = [Win32Control]::GetMemoryStatus()
            $freeRamGb = [Math]::Round($mem.ullAvailPhys / 1GB, 2)
            $totalRamGb = [Math]::Round($mem.ullTotalPhys / 1GB, 2)
            $ramUsedPct = [int]$mem.dwMemoryLoad

            $drive = Get-PSDrive C -ErrorAction SilentlyContinue
            $freeDiskGb = if ($drive) { [Math]::Round($drive.Free / 1GB, 1) } else { $null }

            return @{
                time = $now.ToString("hh:mm tt")
                date = $now.ToString("dddd, MMMM dd, yyyy")
                architecture = $env:PROCESSOR_ARCHITECTURE
                batteryPercent = $batteryPct
                pluggedIn = $charging
                freeRamGb = $freeRamGb
                totalRamGb = $totalRamGb
                ramUsedPercent = $ramUsedPct
                freeDiskCGb = $freeDiskGb
                computerName = $env:COMPUTERNAME
                userName = $env:USERNAME
            }
        }

        "check_call_status" {
            $inCall = $false
            $details = ""
            $procs = Get-Process -Name "PhoneExperienceHost","PhoneLink" -ErrorAction SilentlyContinue
            if ($null -ne $procs) {
                foreach ($p in $procs) {
                    if ($p.MainWindowTitle -match "(Call|Calling|Connected|Dialing)") {
                        $inCall = $true
                        $details = "Phone Link: $($p.MainWindowTitle)"
                        break
                    }
                }
            }
            if (-not $inCall) {
                $meet = Get-Process -ErrorAction SilentlyContinue | Where-Object {
                    $_.MainWindowTitle -match "(Meet\s*–|Google\s*Meet|Zoom\s*Meeting|Teams\s*Call|WhatsApp\s*Call|Skype\s*Call)"
                } | Select-Object -First 1
                if ($null -ne $meet) {
                    $inCall = $true
                    $details = "Active Call/Meeting: $($meet.MainWindowTitle)"
                }
            }
            return @{ inCall = $inCall; details = $details }
        }

        "whatsapp_send_message" {
            $contact = if ($null -ne $args.contact) { [string]$args.contact } else { [string]$req.contact }
            $msg = if ($null -ne $args.message) { [string]$args.message } else { [string]$req.message }
            $pressEnter = if ($null -ne $args.pressEnter) { [bool]$args.pressEnter } elseif ($null -ne $req.pressEnter) { [bool]$req.pressEnter } else { $true }

            if ([string]::IsNullOrWhiteSpace($contact) -or [string]::IsNullOrWhiteSpace($msg)) {
                throw "Both contact and message are required for whatsapp_send_message."
            }

            # If contact looks like a phone number (e.g. +1234567890 or digits with dashes)
            $cleanDigits = $contact -replace "[^0-9+]", ""
            $isPhone = ($cleanDigits.Length -ge 7) -and ($contact -match "^[\+]?[\d\s\-()]{7,}$")

            if ($isPhone) {
                $cleanNumber = $cleanDigits -replace "^\+", ""
                $encodedMsg = [System.Uri]::EscapeDataString($msg)
                Start-Process "whatsapp://send?phone=$cleanNumber&text=$encodedMsg" -ErrorAction SilentlyContinue
                Start-Sleep -Milliseconds 2200

                $wa = Get-Process -Name "WhatsApp" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
                if ($null -ne $wa) {
                    [Win32Control]::SetForegroundWindow($wa.MainWindowHandle)
                    [Win32Control]::ShowWindow($wa.MainWindowHandle, 9)
                    Start-Sleep -Milliseconds 400
                }
                if ($pressEnter) {
                    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
                }
                return @{ ok = $true; mode = "phone"; contact = $contact; message = $msg }
            }

            # Contact name search workflow in WhatsApp Desktop
            Start-Process "whatsapp:" -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 1200

            $wa = Get-Process -Name "WhatsApp" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
            if ($null -ne $wa) {
                [Win32Control]::SetForegroundWindow($wa.MainWindowHandle)
                [Win32Control]::ShowWindow($wa.MainWindowHandle, 9)
                Start-Sleep -Milliseconds 400
            }

            # Focus search box (Ctrl + F), clear previous search, paste contact name
            [System.Windows.Forms.SendKeys]::SendWait("^f")
            Start-Sleep -Milliseconds 250
            [System.Windows.Forms.SendKeys]::SendWait("^a{BACKSPACE}")
            Start-Sleep -Milliseconds 150

            Set-Clipboard -Value $contact
            [System.Windows.Forms.SendKeys]::SendWait("^v")
            Start-Sleep -Milliseconds 850

            # Press Enter to open the selected chat
            [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
            Start-Sleep -Milliseconds 500

            # Paste the message into the active chat box
            Set-Clipboard -Value $msg
            [System.Windows.Forms.SendKeys]::SendWait("^v")
            Start-Sleep -Milliseconds 250

            if ($pressEnter) {
                [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
            }

            return @{ ok = $true; mode = "contact"; contact = $contact; message = $msg }
        }

        "open_and_type" {
            $appName = if ($null -ne $args.app) { [string]$args.app } else { "notepad" }
            $textToType = if ($null -ne $args.text) { [string]$args.text } else { "" }
            $pressEnter = if ($null -ne $args.pressEnter) { [bool]$args.pressEnter } else { $true }

            $key = $appName.Trim().ToLowerInvariant()
            $target = if ($appAliases.ContainsKey($key)) { $appAliases[$key] } else { $appName.Trim() }

            # 1. Launch or activate target application
            Start-Process -FilePath $target -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 650

            # 2. Find and focus the newly opened or active window
            $procName = [System.IO.Path]::GetFileNameWithoutExtension($target)
            $p = Get-Process -Name $procName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
            if ($null -ne $p) {
                [Win32Control]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
                [Win32Control]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
                Start-Sleep -Milliseconds 250
            }

            # 3. Paste the text cleanly via Windows Clipboard + Ctrl+V
            if (-not [string]::IsNullOrWhiteSpace($textToType)) {
                Set-Clipboard -Value $textToType
                [System.Windows.Forms.SendKeys]::SendWait("^v")
                Start-Sleep -Milliseconds 150
                if ($pressEnter) {
                    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
                }
            }

            return @{ ok = $true; app = $appName; typedLength = $textToType.Length }
        }

        "type_active_window" {
            $textToType = if ($null -ne $args.text) { [string]$args.text } else { "" }
            $pressEnter = if ($null -ne $args.pressEnter) { [bool]$args.pressEnter } else { $true }

            if (-not [string]::IsNullOrWhiteSpace($textToType)) {
                Set-Clipboard -Value $textToType
                [System.Windows.Forms.SendKeys]::SendWait("^v")
                Start-Sleep -Milliseconds 100
                if ($pressEnter) {
                    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
                }
            }
            return @{ ok = $true; typedLength = $textToType.Length }
        }

        default {
            throw "Unknown computer control action: $action"
        }
    }
}

Emit-Json @{ type = "ready" }

while ($null -ne ($line = [Console]::In.ReadLine())) {
    $trimmed = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed)) { continue }

    $id = $null
    try {
        $req = $trimmed | ConvertFrom-Json
        $id = $req.id
        if ($req.action -eq "exit") {
            Emit-Json @{ id = $id; ok = $true }
            break
        }
        $data = Handle-Action $req
        Emit-Json @{ id = $id; ok = $true; data = $data }
    } catch {
        Emit-Json @{ id = $id; ok = $false; error = $_.Exception.Message }
    }
}

param(
    [string]$WebBaseUrl = "https://desapp.zeabur.app",
    [string]$WindowTitlePattern = "(?i)(Metin2|Projekt\s*Hard|Project\s*Hard)"
)

$ErrorActionPreference = "Stop"

$logDir = Join-Path $env:LOCALAPPDATA "DestiledCompanion"
$logFile = Join-Path $logDir "companion.log"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Write-CompanionLog {
    param([string]$Message)
    $line = "{0:yyyy-MM-dd HH:mm:ss.fff} {1}" -f (Get-Date), $Message
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

function Show-FatalError {
    param([System.Exception]$Exception)
    try {
        Write-CompanionLog ("FATAL: " + $Exception.ToString())
        Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
        [System.Windows.MessageBox]::Show(
            "DESTILED Companion nie może się uruchomić.`n`n$($Exception.Message)`n`nLog:`n$logFile",
            "DESTILED Companion — błąd",
            [System.Windows.MessageBoxButton]::OK,
            [System.Windows.MessageBoxImage]::Error
        ) | Out-Null
    } catch {
        Write-Host "DESTILED Companion error: $($Exception.Message)"
        Write-Host "Log: $logFile"
    }
}

try {
    Write-CompanionLog "Starting DESTILED Companion."

    if ([System.Threading.Thread]::CurrentThread.ApartmentState -ne [System.Threading.ApartmentState]::STA) {
        $windowsPowerShell = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
        if (-not (Test-Path $windowsPowerShell)) {
            throw "Aplikacja wymaga trybu STA, a Windows PowerShell nie został znaleziony."
        }

        $escapedScript = '"' + $PSCommandPath.Replace('"', '\"') + '"'
        $escapedBase = '"' + $WebBaseUrl.Replace('"', '\"') + '"'
        $escapedPattern = '"' + $WindowTitlePattern.Replace('"', '\"') + '"'
        Start-Process -FilePath $windowsPowerShell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -STA -File $escapedScript -WebBaseUrl $escapedBase -WindowTitlePattern $escapedPattern"
        exit 0
    }

    Add-Type -AssemblyName PresentationFramework
    Add-Type -AssemblyName PresentationCore
    Add-Type -AssemblyName WindowsBase
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class DestiledNative
{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
}
"@

    function Find-GameWindow {
        $result = [pscustomobject]@{
            Handle = [IntPtr]::Zero
            Title = $null
            Rect = $null
        }

        $callback = [DestiledNative+EnumWindowsProc]{
            param([IntPtr]$hWnd, [IntPtr]$lParam)

            if (-not [DestiledNative]::IsWindowVisible($hWnd)) {
                return $true
            }

            $length = [DestiledNative]::GetWindowTextLength($hWnd)
            if ($length -le 0) {
                return $true
            }

            $builder = New-Object System.Text.StringBuilder ($length + 1)
            [void][DestiledNative]::GetWindowText($hWnd, $builder, $builder.Capacity)
            $title = $builder.ToString()

            if ($title -match $WindowTitlePattern) {
                $rect = New-Object DestiledNative+RECT
                if ([DestiledNative]::GetWindowRect($hWnd, [ref]$rect)) {
                    $result.Handle = $hWnd
                    $result.Title = $title
                    $result.Rect = $rect
                    return $false
                }
            }

            return $true
        }

        [void][DestiledNative]::EnumWindows($callback, [IntPtr]::Zero)
        return $result
    }

    [xml]$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="DESTILED Companion"
        Width="330" Height="238"
        WindowStyle="None"
        ResizeMode="NoResize"
        AllowsTransparency="True"
        Background="Transparent"
        Topmost="True"
        ShowInTaskbar="False">
    <Border CornerRadius="14" BorderThickness="1" BorderBrush="#7C9B7A" Background="#EE111821" Padding="14">
        <Grid>
            <Grid.RowDefinitions>
                <RowDefinition Height="Auto"/>
                <RowDefinition Height="Auto"/>
                <RowDefinition Height="*"/>
                <RowDefinition Height="Auto"/>
            </Grid.RowDefinitions>

            <DockPanel Grid.Row="0" LastChildFill="True">
                <TextBlock Text="DESTILED" Foreground="#E5C778" FontWeight="Bold" FontSize="18" VerticalAlignment="Center"/>
                <Button x:Name="HideButton" DockPanel.Dock="Right" Content="—" Width="32" Height="26" Margin="8,0,0,0" ToolTip="Ukryj panel"/>
            </DockPanel>

            <StackPanel Grid.Row="1" Margin="0,10,0,10">
                <TextBlock x:Name="GameStatus" Text="Szukam okna Projekt Hard…" Foreground="#F3F6F8" FontSize="13"/>
                <TextBlock x:Name="HintText" Text="Ctrl+Shift+D — pokaż / ukryj" Foreground="#9FA9B3" FontSize="11" Margin="0,3,0,0"/>
            </StackPanel>

            <UniformGrid Grid.Row="2" Columns="2" Rows="2" Margin="0,0,0,10">
                <Button x:Name="TimersButton" Content="Timery" Margin="3" Height="48"/>
                <Button x:Name="MapsButton" Content="Party / Mapy" Margin="3" Height="48"/>
                <Button x:Name="WebButton" Content="WWW" Margin="3" Height="48"/>
                <Button x:Name="ExitButton" Content="Zamknij" Margin="3" Height="48"/>
            </UniformGrid>

            <TextBlock Grid.Row="3" Text="v0.1 • bez ingerencji w klienta gry" Foreground="#72808D" FontSize="10" HorizontalAlignment="Right"/>
        </Grid>
    </Border>
</Window>
'@

    $reader = New-Object System.Xml.XmlNodeReader $xaml
    $window = [Windows.Markup.XamlReader]::Load($reader)
    $statusText = $window.FindName("GameStatus")
    $hintText = $window.FindName("HintText")
    $hideButton = $window.FindName("HideButton")
    $timersButton = $window.FindName("TimersButton")
    $mapsButton = $window.FindName("MapsButton")
    $webButton = $window.FindName("WebButton")
    $exitButton = $window.FindName("ExitButton")

    $script:panelVisible = $true
    $script:exiting = $false
    $script:hotKeyRegistered = $false
    $script:hwndSource = $null
    $script:hook = $null
    $script:lastGameHandle = [IntPtr]::Zero

    function Open-CompanionUrl {
        param([string]$Path)
        $url = $WebBaseUrl.TrimEnd('/') + $Path
        Write-CompanionLog "Open URL: $url"
        Start-Process $url
    }

    function Set-WaitingPosition {
        $workArea = [System.Windows.SystemParameters]::WorkArea
        $window.Left = [Math]::Max($workArea.Left + 12, $workArea.Right - $window.Width - 18)
        $window.Top = [Math]::Max($workArea.Top + 12, $workArea.Top + 18)
    }

    function Set-GamePosition {
        param($GameWindow)

        if ($null -eq $GameWindow.Rect) {
            Set-WaitingPosition
            return
        }

        $dpi = [System.Windows.Media.VisualTreeHelper]::GetDpi($window)
        $scaleX = if ($dpi.DpiScaleX -gt 0) { $dpi.DpiScaleX } else { 1.0 }
        $scaleY = if ($dpi.DpiScaleY -gt 0) { $dpi.DpiScaleY } else { 1.0 }

        $left = [double]$GameWindow.Rect.Left / $scaleX
        $top = [double]$GameWindow.Rect.Top / $scaleY
        $right = [double]$GameWindow.Rect.Right / $scaleX

        $window.Left = [Math]::Max($left + 12, $right - $window.Width - 18)
        $window.Top = $top + 42
    }

    function Show-Panel {
        if (-not $script:panelVisible) {
            $script:panelVisible = $true
            $window.Show()
            $window.Activate() | Out-Null
        }
    }

    function Hide-Panel {
        if ($script:panelVisible) {
            $script:panelVisible = $false
            $window.Hide()
        }
    }

    function Toggle-Panel {
        if ($script:panelVisible) {
            Hide-Panel
        } else {
            Show-Panel
        }
    }

    $hideButton.Add_Click({ Hide-Panel })
    $timersButton.Add_Click({ Open-CompanionUrl "/timers" })
    $mapsButton.Add_Click({ Open-CompanionUrl "/maps" })
    $webButton.Add_Click({ Open-CompanionUrl "/" })
    $exitButton.Add_Click({
        $script:exiting = $true
        [System.Windows.Application]::Current.Shutdown()
    })

    $window.Add_Closing({
        param($sender, $eventArgs)
        if (-not $script:exiting) {
            $eventArgs.Cancel = $true
            Hide-Panel
        }
    })

    $tray = New-Object System.Windows.Forms.NotifyIcon
    $tray.Icon = [System.Drawing.SystemIcons]::Application
    $tray.Text = "DESTILED Companion"
    $tray.Visible = $true

    $trayMenu = New-Object System.Windows.Forms.ContextMenuStrip
    $trayToggle = $trayMenu.Items.Add("Pokaż / ukryj")
    $trayWeb = $trayMenu.Items.Add("Otwórz WWW")
    [void]$trayMenu.Items.Add("-")
    $trayExit = $trayMenu.Items.Add("Zamknij")
    $tray.ContextMenuStrip = $trayMenu

    $trayToggle.Add_Click({ Toggle-Panel })
    $trayWeb.Add_Click({ Open-CompanionUrl "/" })
    $trayExit.Add_Click({
        $script:exiting = $true
        [System.Windows.Application]::Current.Shutdown()
    })
    $tray.Add_DoubleClick({ Toggle-Panel })

    $window.Add_SourceInitialized({
        $helper = New-Object System.Windows.Interop.WindowInteropHelper $window
        $handle = $helper.Handle
        $script:hwndSource = [System.Windows.Interop.HwndSource]::FromHwnd($handle)

        $script:hook = [System.Windows.Interop.HwndSourceHook]{
            param([IntPtr]$hwnd, [int]$msg, [IntPtr]$wParam, [IntPtr]$lParam, [ref]$handled)
            if ($msg -eq 0x0312 -and $wParam.ToInt32() -eq 0xD357) {
                Toggle-Panel
                $handled.Value = $true
            }
            return [IntPtr]::Zero
        }
        $script:hwndSource.AddHook($script:hook)

        # MOD_CONTROL (0x0002) | MOD_SHIFT (0x0004), key D (0x44)
        $script:hotKeyRegistered = [DestiledNative]::RegisterHotKey($handle, 0xD357, 0x0006, 0x44)
        if (-not $script:hotKeyRegistered) {
            $hintText.Text = "Skrót Ctrl+Shift+D zajęty — użyj ikony w zasobniku"
            Write-CompanionLog "Global hotkey registration failed."
        } else {
            Write-CompanionLog "Global hotkey Ctrl+Shift+D registered."
        }
    })

    $pollTimer = New-Object System.Windows.Threading.DispatcherTimer
    $pollTimer.Interval = [TimeSpan]::FromMilliseconds(500)
    $pollTimer.Add_Tick({
        try {
            $game = Find-GameWindow
            if ($game.Handle -ne [IntPtr]::Zero) {
                if ($script:lastGameHandle -ne $game.Handle) {
                    Write-CompanionLog "Game window detected: $($game.Title)"
                    $script:lastGameHandle = $game.Handle
                }
                $statusText.Text = "Gra: $($game.Title)"
                $statusText.Foreground = [System.Windows.Media.Brushes]::LightGreen
                Set-GamePosition $game
            } else {
                if ($script:lastGameHandle -ne [IntPtr]::Zero) {
                    Write-CompanionLog "Game window lost."
                    $script:lastGameHandle = [IntPtr]::Zero
                }
                $statusText.Text = "Oczekiwanie na okno Projekt Hard…"
                $statusText.Foreground = [System.Windows.Media.Brushes]::WhiteSmoke
                Set-WaitingPosition
            }
        } catch {
            Write-CompanionLog ("Window polling error: " + $_.Exception.Message)
        }
    })

    $window.Add_Loaded({
        Set-WaitingPosition
        $pollTimer.Start()
        $tray.ShowBalloonTip(2000, "DESTILED Companion", "Aplikacja działa. Ctrl+Shift+D pokazuje lub ukrywa panel.", [System.Windows.Forms.ToolTipIcon]::Info)
        Write-CompanionLog "UI loaded."
    })

    $window.Add_Closed({
        try {
            $pollTimer.Stop()
            if ($script:hotKeyRegistered) {
                $helper = New-Object System.Windows.Interop.WindowInteropHelper $window
                [void][DestiledNative]::UnregisterHotKey($helper.Handle, 0xD357)
            }
            if ($script:hwndSource -and $script:hook) {
                $script:hwndSource.RemoveHook($script:hook)
            }
            $tray.Visible = $false
            $tray.Dispose()
            Write-CompanionLog "DESTILED Companion stopped."
        } catch {
            Write-CompanionLog ("Shutdown cleanup error: " + $_.Exception.Message)
        }
    })

    $app = New-Object System.Windows.Application
    $app.ShutdownMode = [System.Windows.ShutdownMode]::OnExplicitShutdown
    [void]$app.Run($window)
}
catch {
    Show-FatalError $_.Exception
    exit 1
}

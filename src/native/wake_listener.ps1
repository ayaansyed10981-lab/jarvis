param(
    [string]$WakeWords = "Jarvis,Hey Jarvis,Okay Jarvis,OK Jarvis",
    [string]$MinConfidence = "Medium"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime

# Background stdin reader so PAUSE / RESUME / EXIT never block recognition loop
Add-Type -TypeDefinition @"
using System;
using System.Collections.Concurrent;
using System.Threading;

public static class StdinReader {
    private static readonly ConcurrentQueue<string> _queue = new ConcurrentQueue<string>();
    private static volatile bool _closed = false;

    public static void Start() {
        var t = new Thread(() => {
            try {
                string line;
                while ((line = Console.In.ReadLine()) != null) {
                    _queue.Enqueue(line.Trim());
                }
            } catch {
            } finally {
                _closed = true;
            }
        });
        t.IsBackground = true;
        t.Start();
    }

    public static string TryDequeue() {
        string val;
        return _queue.TryDequeue(out val) ? val : null;
    }

    public static bool IsClosed {
        get { return _closed; }
    }
}
"@

function Emit-Json($obj) {
    $json = $obj | ConvertTo-Json -Compress -Depth 5
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
}

# WinRT async bridge helpers
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

$asTaskAction = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction'
})[0]

function ConvertTo-NetTask($winRtOp, $resultType) {
    return $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($winRtOp))
}

function Await-Action($winRtAction) {
    $task = $asTaskAction.Invoke($null, @($winRtAction))
    $task.Wait(3000) | Out-Null
}

[void][Windows.Media.SpeechRecognition.SpeechRecognizer, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime]
[void][Windows.Media.SpeechRecognition.ISpeechRecognitionConstraint, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime]
[void][Windows.Media.SpeechRecognition.SpeechRecognitionListConstraint, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime]
[void][Windows.Media.SpeechRecognition.SpeechRecognitionCompilationResult, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime]
[void][Windows.Media.SpeechRecognition.SpeechRecognitionResult, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime]

$icollType = [System.Collections.Generic.ICollection[Windows.Media.SpeechRecognition.ISpeechRecognitionConstraint]]
$addConstraintMethod = $icollType.GetMethod("Add")

$wordList = $WakeWords.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_.Length -gt 0 }
if ($wordList.Count -eq 0) {
    $wordList = @("Jarvis", "Hey Jarvis", "Okay Jarvis", "OK Jarvis")
}

function Confidence-Passes($confStr, $minStr) {
    $ranks = @{ "Rejected" = 0; "Low" = 1; "Medium" = 2; "High" = 3 }
    $actual = if ($ranks.ContainsKey($confStr)) { $ranks[$confStr] } else { 0 }
    $needed = if ($ranks.ContainsKey($minStr)) { $ranks[$minStr] } else { 2 }
    return ($actual -ge $needed)
}

function Create-Recognizer {
    $supported = [Windows.Media.SpeechRecognition.SpeechRecognizer]::SupportedTopicLanguages
    $rec = if ($supported.Count -gt 0) {
        New-Object Windows.Media.SpeechRecognition.SpeechRecognizer($supported[0])
    } else {
        New-Object Windows.Media.SpeechRecognition.SpeechRecognizer
    }
    $rec.Timeouts.InitialSilenceTimeout = [TimeSpan]::FromSeconds(8)
    $rec.Timeouts.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(220)
    $rec.Timeouts.BabbleTimeout = [TimeSpan]::FromSeconds(2.5)

    $phrases = [System.Collections.Generic.List[string]]::new()
    foreach ($w in $wordList) {
        [void]$phrases.Add($w)
    }

    $constraint = New-Object Windows.Media.SpeechRecognition.SpeechRecognitionListConstraint($phrases, "wakeword")
    [void]$addConstraintMethod.Invoke($rec.Constraints.PSObject.BaseObject, [object[]]@($constraint.PSObject.BaseObject))

    $compileTask = ConvertTo-NetTask ($rec.CompileConstraintsAsync()) ([Windows.Media.SpeechRecognition.SpeechRecognitionCompilationResult])
    [void]$compileTask.Wait(-1)
    $comp = $compileTask.Result
    if ($comp.Status.ToString() -ne "Success") {
        $rec.Dispose()
        throw "Failed to compile wake-word constraints: $($comp.Status)"
    }
    return $rec
}

[StdinReader]::Start()

$paused = $false
$running = $true
$recognizer = $null

try {
    $recognizer = Create-Recognizer
    Emit-Json @{ type = "ready"; words = $wordList; minConfidence = $MinConfidence }

    while ($running -and -not [StdinReader]::IsClosed) {
        # Drain any pending control commands
        while ($true) {
            $cmd = [StdinReader]::TryDequeue()
            if ($null -eq $cmd) { break }
            if ($cmd -eq "PAUSE") {
                $paused = $true
                Emit-Json @{ type = "paused" }
            } elseif ($cmd -eq "RESUME") {
                $paused = $false
                Emit-Json @{ type = "resumed" }
            } elseif ($cmd -eq "EXIT") {
                $running = $false
                break
            }
        }

        if (-not $running) { break }

        if ($paused) {
            Start-Sleep -Milliseconds 100
            continue
        }

        if ($null -eq $recognizer) {
            try {
                $recognizer = Create-Recognizer
                Emit-Json @{ type = "reconnected" }
            } catch {
                Emit-Json @{ type = "error"; message = $_.Exception.Message; recoverable = $true }
                Start-Sleep -Seconds 3
                continue
            }
        }

        try {
            $op = $recognizer.RecognizeAsync()
            $task = ConvertTo-NetTask $op ([Windows.Media.SpeechRecognition.SpeechRecognitionResult])

            $abortedForControl = $false
            while (-not $task.Wait(100)) {
                if ([StdinReader]::IsClosed) {
                    $running = $false
                    $abortedForControl = $true
                    try { Await-Action ($recognizer.StopRecognitionAsync()) } catch {}
                    break
                }
                $cmd = [StdinReader]::TryDequeue()
                if ($null -ne $cmd) {
                    if ($cmd -eq "PAUSE") {
                        $paused = $true
                        $abortedForControl = $true
                        try { Await-Action ($recognizer.StopRecognitionAsync()) } catch {}
                        Emit-Json @{ type = "paused" }
                        break
                    } elseif ($cmd -eq "EXIT") {
                        $running = $false
                        $abortedForControl = $true
                        try { Await-Action ($recognizer.StopRecognitionAsync()) } catch {}
                        break
                    } elseif ($cmd -eq "RESUME") {
                        $paused = $false
                    }
                }
            }

            if ($abortedForControl -or -not $running -or $paused) {
                continue
            }

            if ($task.IsFaulted) {
                throw $task.Exception.InnerException
            }

            $res = $task.Result
            if ($null -ne $res -and $res.Status.ToString() -eq "Success" -and -not [string]::IsNullOrWhiteSpace($res.Text)) {
                $conf = $res.Confidence.ToString()
                $rawConf = [Math]::Round($res.RawConfidence, 3)
                if (Confidence-Passes $conf $MinConfidence) {
                    # Pause immediately until Node.js finishes recording & speaking and sends RESUME
                    $paused = $true
                    Emit-Json @{
                        type = "wake"
                        text = $res.Text
                        confidence = $conf
                        rawConfidence = $rawConf
                    }
                }
            }
        } catch {
            $msg = $_.Exception.Message
            $hresult = if ($_.Exception.HResult) { ('0x{0:X8}' -f $_.Exception.HResult) } else { "" }

            # Detect privacy / microphone permission issues explicitly
            if ($hresult -eq "0x80045509" -or $msg -match "privacy" -or $msg -match "speech privacy") {
                Emit-Json @{
                    type = "permission_error"
                    code = $hresult
                    message = "Windows Speech Privacy policy not accepted. Open Settings > Privacy & security > Speech and enable Online speech recognition, OR Settings > Privacy & security > Microphone."
                }
                Start-Sleep -Seconds 6
            } elseif ($hresult -eq "0x80070005" -or $msg -match "Access is denied" -or $msg -match "microphone") {
                Emit-Json @{
                    type = "permission_error"
                    code = $hresult
                    message = "Microphone access denied. Enable Settings > Privacy & security > Microphone > Let desktop apps access your microphone."
                }
                Start-Sleep -Seconds 6
            } else {
                Emit-Json @{ type = "warn"; code = $hresult; message = "Recognizer restarted after: $msg" }
                try { $recognizer.Dispose() } catch {}
                $recognizer = $null
                Start-Sleep -Milliseconds 1500
            }
        }
    }
} catch {
    Emit-Json @{ type = "fatal"; message = $_.Exception.Message }
    exit 1
} finally {
    if ($null -ne $recognizer) {
        try { $recognizer.Dispose() } catch {}
    }
}

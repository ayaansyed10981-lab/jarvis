param(
    [Parameter(Mandatory=$true)][string]$OutputPath,
    [int]$WaitSpeechMs = 5500,
    [int]$SilenceMs = 1400,
    [int]$MaxDurationMs = 15000,
    [int]$VadThreshold = 450
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

public class WinMmVadRecorder {
    private const int CALLBACK_FUNCTION = 0x30000;
    private const int WIM_DATA = 0x3C0;
    private const int WAVE_FORMAT_PCM = 1;

    [StructLayout(LayoutKind.Sequential)]
    private struct WAVEFORMATEX {
        public ushort wFormatTag;
        public ushort nChannels;
        public uint nSamplesPerSec;
        public uint nAvgBytesPerSec;
        public ushort nBlockAlign;
        public ushort wBitsPerSample;
        public ushort cbSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WAVEHDR {
        public IntPtr lpData;
        public uint dwBufferLength;
        public uint dwBytesRecorded;
        public IntPtr dwUser;
        public uint dwFlags;
        public uint dwLoops;
        public IntPtr lpNext;
        public IntPtr reserved;
    }

    private delegate void WaveInProc(IntPtr hwi, uint uMsg, IntPtr dwInstance, IntPtr dwParam1, IntPtr dwParam2);

    [DllImport("winmm.dll")]
    private static extern uint waveInGetNumDevs();

    [DllImport("winmm.dll")]
    private static extern int waveInOpen(out IntPtr phwi, uint uDeviceID, ref WAVEFORMATEX pwfx, WaveInProc dwCallback, IntPtr dwInstance, uint fdwOpen);

    [DllImport("winmm.dll")]
    private static extern int waveInPrepareHeader(IntPtr hwi, IntPtr pwh, uint cbwh);

    [DllImport("winmm.dll")]
    private static extern int waveInUnprepareHeader(IntPtr hwi, IntPtr pwh, uint cbwh);

    [DllImport("winmm.dll")]
    private static extern int waveInAddBuffer(IntPtr hwi, IntPtr pwh, uint cbwh);

    [DllImport("winmm.dll")]
    private static extern int waveInStart(IntPtr hwi);

    [DllImport("winmm.dll")]
    private static extern int waveInStop(IntPtr hwi);

    [DllImport("winmm.dll")]
    private static extern int waveInReset(IntPtr hwi);

    [DllImport("winmm.dll")]
    private static extern int waveInClose(IntPtr hwi);

    public class RecordResult {
        public bool Ok;
        public bool HeardSpeech;
        public string Path;
        public int DurationMs;
        public int PeakRms;
        public string Error;
    }

    public static RecordResult Record(string outputPath, int waitSpeechMs, int silenceMs, int maxDurationMs, int vadThreshold) {
        var result = new RecordResult { Path = outputPath };

        if (waveInGetNumDevs() == 0) {
            result.Ok = false;
            result.Error = "No microphone input devices detected.";
            return result;
        }

        const int sampleRate = 16000;
        const int channels = 1;
        const int bitsPerSample = 16;
        const int chunkMs = 100;
        const int bufferBytes = (sampleRate * (bitsPerSample / 8) * channels * chunkMs) / 1000; // 3200 bytes = 100ms
        const int numBuffers = 4;

        var format = new WAVEFORMATEX {
            wFormatTag = WAVE_FORMAT_PCM,
            nChannels = channels,
            nSamplesPerSec = sampleRate,
            wBitsPerSample = bitsPerSample,
            nBlockAlign = (ushort)(channels * (bitsPerSample / 8)),
            nAvgBytesPerSec = sampleRate * channels * (bitsPerSample / 8),
            cbSize = 0
        };

        var pcmStream = new MemoryStream();
        var doneEvent = new ManualResetEventSlim(false);
        object syncLock = new object();

        bool heardSpeech = false;
        int speechFrames = 0;
        int elapsedMs = 0;
        int silentAfterSpeechMs = 0;
        int peakRms = 0;
        bool stopping = false;

        IntPtr hWaveIn = IntPtr.Zero;
        IntPtr[] hdrPtrs = new IntPtr[numBuffers];
        IntPtr[] dataPtrs = new IntPtr[numBuffers];

        WaveInProc callback = (IntPtr hwi, uint uMsg, IntPtr dwInstance, IntPtr dwParam1, IntPtr dwParam2) => {
            if (uMsg != WIM_DATA) return;

            lock (syncLock) {
                if (stopping) return;

                WAVEHDR hdr = (WAVEHDR)Marshal.PtrToStructure(dwParam1, typeof(WAVEHDR));
                int bytes = (int)hdr.dwBytesRecorded;
                if (bytes > 0) {
                    byte[] chunk = new byte[bytes];
                    Marshal.Copy(hdr.lpData, chunk, 0, bytes);
                    pcmStream.Write(chunk, 0, bytes);

                    // Calculate RMS amplitude of 16-bit PCM samples
                    double sumSq = 0;
                    int sampleCount = bytes / 2;
                    for (int i = 0; i < bytes - 1; i += 2) {
                        short sample = (short)(chunk[i] | (chunk[i + 1] << 8));
                        sumSq += (double)sample * sample;
                    }
                    int rms = sampleCount > 0 ? (int)Math.Sqrt(sumSq / sampleCount) : 0;
                    if (rms > peakRms) peakRms = rms;

                    elapsedMs += chunkMs;

                    if (rms >= vadThreshold) {
                        speechFrames++;
                        if (speechFrames >= 2) {
                            heardSpeech = true;
                        }
                        silentAfterSpeechMs = 0;
                    } else {
                        if (heardSpeech) {
                            silentAfterSpeechMs += chunkMs;
                        }
                    }

                    bool shouldStop = false;
                    if (elapsedMs >= maxDurationMs) {
                        shouldStop = true;
                    } else if (!heardSpeech && elapsedMs >= waitSpeechMs) {
                        shouldStop = true;
                    } else if (heardSpeech && silentAfterSpeechMs >= silenceMs) {
                        shouldStop = true;
                    }

                    if (shouldStop) {
                        stopping = true;
                        doneEvent.Set();
                        return;
                    }
                }

                if (!stopping) {
                    waveInAddBuffer(hwi, dwParam1, (uint)Marshal.SizeOf(typeof(WAVEHDR)));
                }
            }
        };

        GCHandle cbHandle = GCHandle.Alloc(callback);
        try {
            int openRes = waveInOpen(out hWaveIn, 0xFFFFFFFF /* WAVE_MAPPER */, ref format, callback, IntPtr.Zero, CALLBACK_FUNCTION);
            if (openRes != 0) {
                result.Ok = false;
                result.Error = "waveInOpen failed with MMRESULT code " + openRes;
                return result;
            }

            uint hdrSize = (uint)Marshal.SizeOf(typeof(WAVEHDR));
            for (int i = 0; i < numBuffers; i++) {
                dataPtrs[i] = Marshal.AllocHGlobal(bufferBytes);
                hdrPtrs[i] = Marshal.AllocHGlobal((int)hdrSize);
                var hdr = new WAVEHDR {
                    lpData = dataPtrs[i],
                    dwBufferLength = bufferBytes,
                    dwFlags = 0
                };
                Marshal.StructureToPtr(hdr, hdrPtrs[i], false);
                waveInPrepareHeader(hWaveIn, hdrPtrs[i], hdrSize);
                waveInAddBuffer(hWaveIn, hdrPtrs[i], hdrSize);
            }

            int startRes = waveInStart(hWaveIn);
            if (startRes != 0) {
                result.Ok = false;
                result.Error = "waveInStart failed with code " + startRes;
                return result;
            }

            doneEvent.Wait(maxDurationMs + 2000);

            lock (syncLock) {
                stopping = true;
            }

            waveInStop(hWaveIn);
            waveInReset(hWaveIn);

            for (int i = 0; i < numBuffers; i++) {
                if (hdrPtrs[i] != IntPtr.Zero) {
                    waveInUnprepareHeader(hWaveIn, hdrPtrs[i], hdrSize);
                }
            }

            byte[] pcmData = pcmStream.ToArray();
            if (heardSpeech && pcmData.Length > 0) {
                WriteWav(outputPath, pcmData, sampleRate, channels, bitsPerSample);
            }

            result.Ok = true;
            result.HeardSpeech = heardSpeech;
            result.DurationMs = elapsedMs;
            result.PeakRms = peakRms;
            return result;
        } finally {
            if (hWaveIn != IntPtr.Zero) {
                waveInClose(hWaveIn);
            }
            for (int i = 0; i < numBuffers; i++) {
                if (hdrPtrs[i] != IntPtr.Zero) Marshal.FreeHGlobal(hdrPtrs[i]);
                if (dataPtrs[i] != IntPtr.Zero) Marshal.FreeHGlobal(dataPtrs[i]);
            }
            if (cbHandle.IsAllocated) cbHandle.Free();
            doneEvent.Dispose();
            pcmStream.Dispose();
        }
    }

    private static void WriteWav(string path, byte[] pcm, int sampleRate, int channels, int bitsPerSample) {
        string dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) {
            Directory.CreateDirectory(dir);
        }
        using (var fs = new FileStream(path, FileMode.Create, FileAccess.Write))
        using (var bw = new BinaryWriter(fs)) {
            int byteRate = sampleRate * channels * (bitsPerSample / 8);
            short blockAlign = (short)(channels * (bitsPerSample / 8));
            bw.Write(new char[] { 'R', 'I', 'F', 'F' });
            bw.Write(36 + pcm.Length);
            bw.Write(new char[] { 'W', 'A', 'V', 'E' });
            bw.Write(new char[] { 'f', 'm', 't', ' ' });
            bw.Write(16);
            bw.Write((short)1);
            bw.Write((short)channels);
            bw.Write(sampleRate);
            bw.Write(byteRate);
            bw.Write(blockAlign);
            bw.Write((short)bitsPerSample);
            bw.Write(new char[] { 'd', 'a', 't', 'a' });
            bw.Write(pcm.Length);
            bw.Write(pcm);
        }
    }
}
"@

$res = [WinMmVadRecorder]::Record($OutputPath, $WaitSpeechMs, $SilenceMs, $MaxDurationMs, $VadThreshold)
@{
    ok = $res.Ok
    heardSpeech = $res.HeardSpeech
    path = $res.Path
    durationMs = $res.DurationMs
    peakRms = $res.PeakRms
    error = $res.Error
} | ConvertTo-Json -Compress

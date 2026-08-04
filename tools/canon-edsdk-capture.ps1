param(
  [string]$OutputDir = "C:\Users\hungm\Documents\glame\incoming-digicam",
  [string]$FilePrefix = "GLAME",
  [string]$SdkDir = (Join-Path $PSScriptRoot "..\vendor\canon-edsdk\EDSDK_64\Dll"),
  [int]$TimeoutSeconds = 20
)

$ErrorActionPreference = "Stop"
$SdkDir = [IO.Path]::GetFullPath($SdkDir)
$OutputDir = [IO.Path]::GetFullPath($OutputDir)
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

foreach ($name in @("EDSDK.dll", "EdsImage.dll")) {
  if (-not (Test-Path -LiteralPath (Join-Path $SdkDir $name))) {
    throw "Missing $name in $SdkDir"
  }
}

$code = @"
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

public static class CanonEdsdkCapture {
  private const uint EDS_ERR_OK = 0;
  private const uint PropID_SaveTo = 0x0000000b;
  private const int SaveTo_Host = 2;
  private const uint ObjectEvent_All = 0x00000200;
  private const uint ObjectEvent_DirItemRequestTransfer = 0x00000208;
  private const uint CameraCommand_PressShutterButton = 0x00000004;
  private const int ShutterButton_OFF = 0x00000000;
  private const int ShutterButton_Completely = 0x00000003;

  private static ManualResetEventSlim downloaded = new ManualResetEventSlim(false);
  private static string outputDir = "";
  private static string filePrefix = "";
  private static string capturedPath = "";
  private static string lastError = "";
  private static EdsObjectEventHandler objectHandler = HandleObjectEvent;

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool SetDllDirectory(string lpPathName);

  [DllImport("EDSDK.dll")]
  private static extern uint EdsInitializeSDK();
  [DllImport("EDSDK.dll")]
  private static extern uint EdsTerminateSDK();
  [DllImport("EDSDK.dll")]
  private static extern uint EdsGetCameraList(out IntPtr outCameraListRef);
  [DllImport("EDSDK.dll")]
  private static extern uint EdsGetChildCount(IntPtr inRef, out int outCount);
  [DllImport("EDSDK.dll")]
  private static extern uint EdsGetChildAtIndex(IntPtr inRef, int inIndex, out IntPtr outRef);
  [DllImport("EDSDK.dll")]
  private static extern uint EdsOpenSession(IntPtr inCameraRef);
  [DllImport("EDSDK.dll")]
  private static extern uint EdsCloseSession(IntPtr inCameraRef);
  [DllImport("EDSDK.dll")]
  private static extern uint EdsRelease(IntPtr inRef);
  [DllImport("EDSDK.dll")]
  private static extern uint EdsSetCapacity(IntPtr inCameraRef, EdsCapacity inCapacity);
  [DllImport("EDSDK.dll")]
  private static extern uint EdsSetObjectEventHandler(IntPtr inCameraRef, uint inEvent, EdsObjectEventHandler inObjectEventHandler, IntPtr inContext);
  [DllImport("EDSDK.dll")]
  private static extern uint EdsSendCommand(IntPtr inCameraRef, uint inCommand, int inParam);
  [DllImport("EDSDK.dll")]
  private static extern uint EdsSetPropertyData(IntPtr inRef, uint inPropertyID, int inParam, int inPropertySize, ref int inPropertyData);
  [DllImport("EDSDK.dll")]
  private static extern uint EdsGetDirectoryItemInfo(IntPtr inDirItemRef, out EdsDirectoryItemInfo outDirItemInfo);
  [DllImport("EDSDK.dll")]
  private static extern uint EdsCreateFileStream(string inFileName, uint inCreateDisposition, uint inDesiredAccess, out IntPtr outStream);
  [DllImport("EDSDK.dll")]
  private static extern uint EdsDownload(IntPtr inDirItemRef, ulong inReadSize, IntPtr outStream);
  [DllImport("EDSDK.dll")]
  private static extern uint EdsDownloadComplete(IntPtr inDirItemRef);

  private delegate uint EdsObjectEventHandler(uint inEvent, IntPtr inRef, IntPtr inContext);

  [StructLayout(LayoutKind.Sequential, Pack = 2)]
  private struct EdsCapacity {
    public int NumberOfFreeClusters;
    public int BytesPerSector;
    public int Reset;
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  private struct EdsDirectoryItemInfo {
    public ulong Size;
    public int IsFolder;
    public uint GroupID;
    public uint Option;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
    public string FileName;
    public uint Format;
    public uint DateTime;
  }

  public static void UseSdkDirectory(string path) {
    if (!SetDllDirectory(path)) throw new InvalidOperationException("SetDllDirectory failed.");
  }

  private static void Check(uint err, string op) {
    if (err != EDS_ERR_OK) throw new InvalidOperationException(op + " failed: 0x" + err.ToString("X8"));
  }

  private static uint HandleObjectEvent(uint inEvent, IntPtr inRef, IntPtr inContext) {
    try {
      if (inEvent == ObjectEvent_DirItemRequestTransfer && inRef != IntPtr.Zero) {
        EdsDirectoryItemInfo info;
        Check(EdsGetDirectoryItemInfo(inRef, out info), "EdsGetDirectoryItemInfo");
        string ext = Path.GetExtension(info.FileName);
        if (String.IsNullOrWhiteSpace(ext)) ext = ".jpg";
        string safePrefix = String.Concat(filePrefix.Split(Path.GetInvalidFileNameChars()));
        string destination = Path.Combine(outputDir, safePrefix + "_" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + ext);
        IntPtr stream;
        Check(EdsCreateFileStream(destination, 1, 2, out stream), "EdsCreateFileStream");
        try {
          Check(EdsDownload(inRef, info.Size, stream), "EdsDownload");
          Check(EdsDownloadComplete(inRef), "EdsDownloadComplete");
          capturedPath = destination;
          downloaded.Set();
        } finally {
          if (stream != IntPtr.Zero) EdsRelease(stream);
        }
      }
    } catch (Exception ex) {
      lastError = ex.Message;
      downloaded.Set();
    } finally {
      if (inRef != IntPtr.Zero) EdsRelease(inRef);
    }
    return EDS_ERR_OK;
  }

  public static string Capture(string sdkDir, string outDir, string prefix, int timeoutSeconds) {
    UseSdkDirectory(sdkDir);
    outputDir = outDir;
    filePrefix = prefix;
    capturedPath = "";
    lastError = "";
    downloaded.Reset();

    Check(EdsInitializeSDK(), "EdsInitializeSDK");
    IntPtr list = IntPtr.Zero;
    IntPtr camera = IntPtr.Zero;
    try {
      Check(EdsGetCameraList(out list), "EdsGetCameraList");
      int count;
      Check(EdsGetChildCount(list, out count), "EdsGetChildCount");
      if (count < 1) throw new InvalidOperationException("No Canon camera found.");
      Check(EdsGetChildAtIndex(list, 0, out camera), "EdsGetChildAtIndex");
      Check(EdsOpenSession(camera), "EdsOpenSession");
      try {
        int saveTo = SaveTo_Host;
        Check(EdsSetPropertyData(camera, PropID_SaveTo, 0, 4, ref saveTo), "EdsSetPropertyData(SaveToHost)");
        Check(EdsSetCapacity(camera, new EdsCapacity { NumberOfFreeClusters = 0x7fffffff, BytesPerSector = 0x1000, Reset = 1 }), "EdsSetCapacity");
        Check(EdsSetObjectEventHandler(camera, ObjectEvent_All, objectHandler, IntPtr.Zero), "EdsSetObjectEventHandler");
        Check(EdsSendCommand(camera, CameraCommand_PressShutterButton, ShutterButton_Completely), "EdsSendCommand(ShutterDown)");
        Check(EdsSendCommand(camera, CameraCommand_PressShutterButton, ShutterButton_OFF), "EdsSendCommand(ShutterOff)");
        if (!downloaded.Wait(TimeSpan.FromSeconds(timeoutSeconds))) throw new TimeoutException("Capture timed out waiting for Canon download event.");
        if (!String.IsNullOrEmpty(lastError)) throw new InvalidOperationException(lastError);
        if (String.IsNullOrEmpty(capturedPath)) throw new InvalidOperationException("Capture finished without downloaded file.");
        return capturedPath;
      } finally {
        EdsCloseSession(camera);
      }
    } finally {
      if (camera != IntPtr.Zero) EdsRelease(camera);
      if (list != IntPtr.Zero) EdsRelease(list);
      EdsTerminateSDK();
    }
  }
}
"@

Add-Type -TypeDefinition $code
$path = [CanonEdsdkCapture]::Capture($SdkDir, $OutputDir, $FilePrefix, $TimeoutSeconds)
[pscustomobject]@{ ok = $true; path = $path; name = [IO.Path]::GetFileName($path) } | ConvertTo-Json -Compress

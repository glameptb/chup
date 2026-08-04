param(
  [ValidateSet("list", "capture")]
  [string]$Command = "list",
  [string]$SdkDir = (Join-Path $PSScriptRoot "..\vendor\canon-edsdk\EDSDK_64\Dll")
)

$ErrorActionPreference = "Stop"
$SdkDir = [IO.Path]::GetFullPath($SdkDir)
if (-not (Test-Path -LiteralPath (Join-Path $SdkDir "EDSDK.dll"))) {
  $fallback = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\vendor\canon-photobooth"))
  if (Test-Path -LiteralPath (Join-Path $fallback "EDSDK.dll")) {
    $SdkDir = $fallback
  }
}

foreach ($name in @("EDSDK.dll", "EdsImage.dll")) {
  $path = Join-Path $SdkDir $name
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Missing $name in $SdkDir"
  }
}

function Get-PeMachine($Path) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  $peOffset = [BitConverter]::ToInt32($bytes, 0x3c)
  $machine = [BitConverter]::ToUInt16($bytes, $peOffset + 4)
  switch ($machine) {
    0x14c { "x86" }
    0x8664 { "x64" }
    0xaa64 { "arm64" }
    default { "unknown" }
  }
}

$machine = Get-PeMachine (Join-Path $SdkDir "EDSDK.dll")
if ($machine -eq "x86" -and [Environment]::Is64BitProcess) {
  $x86PowerShell = Join-Path $env:WINDIR "SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
  & $x86PowerShell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Command $Command -SdkDir $SdkDir
  exit $LASTEXITCODE
}
if ($machine -ne "x86" -and -not [Environment]::Is64BitProcess) {
  throw "Run this in 64-bit PowerShell. EDSDK.dll is $machine."
}

$code = @"
using System;
using System.Runtime.InteropServices;

public static class CanonEdsdkSmoke {
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool SetDllDirectory(string lpPathName);

  [DllImport("EDSDK.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern uint EdsInitializeSDK();

  [DllImport("EDSDK.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern uint EdsTerminateSDK();

  [DllImport("EDSDK.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern uint EdsGetCameraList(out IntPtr outCameraListRef);

  [DllImport("EDSDK.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern uint EdsGetChildCount(IntPtr inRef, out int outCount);

  [DllImport("EDSDK.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern uint EdsGetChildAtIndex(IntPtr inRef, int inIndex, out IntPtr outRef);

  [DllImport("EDSDK.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern uint EdsGetDeviceInfo(IntPtr inCameraRef, out EdsDeviceInfo outDeviceInfo);

  [DllImport("EDSDK.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern uint EdsOpenSession(IntPtr inCameraRef);

  [DllImport("EDSDK.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern uint EdsCloseSession(IntPtr inCameraRef);

  [DllImport("EDSDK.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern uint EdsRelease(IntPtr inRef);

  [DllImport("EDSDK.dll", CallingConvention = CallingConvention.Cdecl)]
  private static extern uint EdsSendCommand(IntPtr inCameraRef, uint inCommand, int inParam);

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct EdsDeviceInfo {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
    public string szPortName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
    public string szDeviceDescription;
    public uint deviceSubType;
    public uint reserved;
  }

  public static void UseSdkDirectory(string path) {
    if (!SetDllDirectory(path)) throw new InvalidOperationException("SetDllDirectory failed.");
  }

  private static void Check(uint err, string op) {
    if (err != 0) throw new InvalidOperationException(op + " failed: 0x" + err.ToString("X8"));
  }

  public static string ListCameras() {
    Check(EdsInitializeSDK(), "EdsInitializeSDK");
    IntPtr list = IntPtr.Zero;
    try {
      Check(EdsGetCameraList(out list), "EdsGetCameraList");
      int count;
      Check(EdsGetChildCount(list, out count), "EdsGetChildCount");
      string result = "Camera count: " + count;
      for (int i = 0; i < count; i++) {
        IntPtr camera;
        Check(EdsGetChildAtIndex(list, i, out camera), "EdsGetChildAtIndex");
        try {
          EdsDeviceInfo info;
          Check(EdsGetDeviceInfo(camera, out info), "EdsGetDeviceInfo");
          result += Environment.NewLine + (i + 1) + ". " + info.szDeviceDescription + " | " + info.szPortName;
        } finally {
          if (camera != IntPtr.Zero) EdsRelease(camera);
        }
      }
      return result;
    } finally {
      if (list != IntPtr.Zero) EdsRelease(list);
      EdsTerminateSDK();
    }
  }

  public static string CaptureFirstCamera() {
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
        Check(EdsSendCommand(camera, 0x00000000, 0), "EdsSendCommand(TakePicture)");
        return "Capture command sent.";
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
[CanonEdsdkSmoke]::UseSdkDirectory($SdkDir)

if ($Command -eq "capture") {
  [CanonEdsdkSmoke]::CaptureFirstCamera()
} else {
  [CanonEdsdkSmoke]::ListCameras()
}

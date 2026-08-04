#include <windows.h>
#include <winhttp.h>
#include <string>
#include "EDSDK.h"

#pragma comment(lib, "winhttp.lib")

struct CaptureContext {
  const wchar_t* sessionId;
  INTERNET_PORT port = 4173;
};

EdsError configureHostCapture(EdsCameraRef camera, CaptureContext* context);

static bool postJpeg(const CaptureContext& context, const void* data, DWORD size) {
  const std::wstring path = L"/api/camera/capture?session=" + std::wstring(context.sessionId);
  HINTERNET internet = WinHttpOpen(L"GLAME Canon Bridge/1.0", WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
                                   WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
  HINTERNET connection = internet ? WinHttpConnect(internet, L"127.0.0.1", context.port, 0) : nullptr;
  HINTERNET request = connection ? WinHttpOpenRequest(connection, L"POST", path.c_str(), nullptr,
                                                       WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, 0) : nullptr;
  const bool sent = request && WinHttpSendRequest(request, L"Content-Type: image/jpeg\r\n", -1L,
                                                   const_cast<void*>(data), size, size, 0)
                    && WinHttpReceiveResponse(request, nullptr);
  DWORD status = 0, statusSize = sizeof(status);
  const bool ok = sent && WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                                               nullptr, &status, &statusSize, nullptr)
                  && status >= 200 && status < 300;
  if (request) WinHttpCloseHandle(request);
  if (connection) WinHttpCloseHandle(connection);
  if (internet) WinHttpCloseHandle(internet);
  return ok;
}

// Register with EdsSetObjectEventHandler(camera, kEdsObjectEvent_All, onObjectEvent, &context).
EdsError EDSCALLBACK onObjectEvent(EdsObjectEvent event, EdsBaseRef object, EdsVoid* rawContext) {
  if (event != kEdsObjectEvent_DirItemRequestTransfer) {
    if (object) EdsRelease(object);
    return EDS_ERR_OK;
  }

  EdsDirectoryItemInfo info{};
  EdsStreamRef stream = nullptr;
  EdsError error = EdsGetDirectoryItemInfo(object, &info);
  if (error == EDS_ERR_OK) error = EdsCreateMemoryStream(info.size, &stream);
  if (error == EDS_ERR_OK) error = EdsDownload(static_cast<EdsDirectoryItemRef>(object), info.size, stream);
  if (error == EDS_ERR_OK) error = EdsDownloadComplete(static_cast<EdsDirectoryItemRef>(object));
  else EdsDownloadCancel(static_cast<EdsDirectoryItemRef>(object));

  if (error == EDS_ERR_OK) {
    EdsVoid* bytes = nullptr;
    EdsUInt64 length = 0;
    error = EdsGetPointer(stream, &bytes);
    if (error == EDS_ERR_OK) error = EdsGetLength(stream, &length);
    if (error == EDS_ERR_OK &&
        !postJpeg(*static_cast<CaptureContext*>(rawContext), bytes, static_cast<DWORD>(length))) {
      error = EDS_ERR_NOT_SUPPORTED;
    }
  }

  if (stream) EdsRelease(stream);
  if (object) EdsRelease(object);
  return error;
}

EdsError configureHostCapture(EdsCameraRef camera, CaptureContext* context) {
  const EdsUInt32 saveTo = kEdsSaveTo_Host;
  EdsError error = EdsSetPropertyData(camera, kEdsPropID_SaveTo, 0, sizeof(saveTo), &saveTo);
  if (error != EDS_ERR_OK) return error;
  const EdsCapacity capacity{0x7fffffff, 0x1000, 1};
  error = EdsSetCapacity(camera, capacity);
  if (error != EDS_ERR_OK) return error;
  return EdsSetObjectEventHandler(camera, kEdsObjectEvent_All, onObjectEvent, context);
}

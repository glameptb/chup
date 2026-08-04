const SHEETS = {
  teams: "Doi",
  members: "HoiVien",
  matches: "TranDau",
};

// Nếu bạn tạo Apps Script không phải từ menu Extensions của Google Sheet,
// hãy dán ID của Google Sheet vào đây. Nếu tạo từ Extensions thì để trống.
const SPREADSHEET_ID = "";

function testWrite() {
  const ss = getSpreadsheet_();
  const sheet = getOrCreateSheet_(ss, "KiemTraKetNoi");
  sheet.clearContents();
  sheet.getRange(1, 1, 2, 2).setValues([
    ["Trang thai", "Thoi gian"],
    ["Da ghi duoc vao Google Sheet", new Date()],
  ]);
}

function doGet(e) {
  const data = readState_();
  const callback = e && e.parameter && e.parameter.callback;
  if (callback) return jsonpResponse(callback, data);
  return jsonResponse(data);
}

function doPost(e) {
  try {
    const rawPayload = e.parameter && e.parameter.payload
      ? e.parameter.payload
      : (e.postData && e.postData.contents) || "{}";
    const payload = JSON.parse(rawPayload);
    if (payload.action !== "saveState" || !payload.state) {
      return jsonResponse({ ok: false, error: "Payload không hợp lệ" });
    }

    writeState_(payload.state);
    return jsonResponse({ ok: true, updatedAt: new Date().toISOString() });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) });
  }
}

function readState_() {
  const ss = getSpreadsheet_();
  const teams = readObjects_(ss, SHEETS.teams);
  const members = readObjects_(ss, SHEETS.members);
  const matches = readObjects_(ss, SHEETS.matches).map((match) => ({
    ...match,
    scoreA: Number(match.scoreA || 0),
    scoreB: Number(match.scoreB || 0),
    playersA: parseJson_(match.playersA, []),
    playersB: parseJson_(match.playersB, []),
  }));

  return { teams, members, matches };
}

function writeState_(state) {
  const ss = getSpreadsheet_();
  writeObjects_(ss, SHEETS.teams, ["id", "name", "roster"], (state.teams || []).map((team) => ({
    id: team.id,
    name: team.name,
    roster: JSON.stringify(team.roster || []),
  })));
  writeObjects_(ss, SHEETS.members, ["id", "name"], state.members || []);
  writeObjects_(ss, SHEETS.matches, ["id", "format", "type", "teamAId", "teamBId", "scoreA", "scoreB", "playersA", "playersB", "note", "createdAt"], (state.matches || []).map((match) => ({
    ...match,
    playersA: JSON.stringify(match.playersA || []),
    playersB: JSON.stringify(match.playersB || []),
  })));
}

function readObjects_(ss, sheetName) {
  const sheet = getOrCreateSheet_(ss, sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(String);
  return values.slice(1).filter((row) => row.some((cell) => cell !== "")).map((row) => {
    const object = {};
    headers.forEach((header, index) => {
      object[header] = row[index];
    });
    if (object.roster) object.roster = parseJson_(object.roster, []);
    return object;
  });
}

function writeObjects_(ss, sheetName, headers, rows) {
  const sheet = getOrCreateSheet_(ss, sheetName);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  if (!rows.length) {
    sheet.autoResizeColumns(1, headers.length);
    return;
  }

  const values = rows.map((row) => headers.map((header) => row[header] ?? ""));
  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  sheet.autoResizeColumns(1, headers.length);
}

function getOrCreateSheet_(ss, sheetName) {
  return ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
}

function getSpreadsheet_() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  const ss = SpreadsheetApp.getActive();
  if (!ss) throw new Error("Không tìm thấy Google Sheet đang liên kết. Hãy tạo Apps Script từ Extensions của Sheet hoặc điền SPREADSHEET_ID.");
  return ss;
}

function parseJson_(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonpResponse(callback, data) {
  const safeCallback = String(callback).replace(/[^\w.$]/g, "");
  return ContentService
    .createTextOutput(`${safeCallback}(${JSON.stringify(data)});`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

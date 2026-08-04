import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const [inputFile, outputFile] = process.argv.slice(2);
const data = JSON.parse(await fs.readFile(inputFile, "utf8"));
const workbook = Workbook.create();
const sheet = workbook.worksheets.add("S1a-HKD");
sheet.showGridLines = false;

sheet.getRange("A1:C1").merge();
sheet.getRange("A1").values = [[data.businessName || "HỘ KINH DOANH GLAME PHOTOBOOTH"]];
sheet.getRange("A2:C2").merge();
sheet.getRange("A2").values = [[`Địa chỉ: ${data.businessAddress || "........................................................"}`]];
sheet.getRange("B3:C3").merge();
sheet.getRange("B3").values = [["Mẫu số S1a-HKD"]];
sheet.getRange("B4:C4").merge();
sheet.getRange("B4").values = [["(Ban hành kèm theo Thông tư số 152/2025/TT-BTC ngày 31/12/2025 của Bộ trưởng Bộ Tài chính)"]];
sheet.getRange("A6:C6").merge();
sheet.getRange("A6").values = [["SỔ DOANH THU BÁN HÀNG HÓA, DỊCH VỤ"]];
sheet.getRange("A7:C7").merge();
sheet.getRange("A7").values = [[`Năm: ${data.year}`]];
sheet.getRange("A9:C10").values = [["Ngày, tháng ghi sổ", "Diễn giải", "Số tiền"], ["A", "B", "1"]];

const firstRow = 11;
const rows = data.rows.length ? data.rows : [{ date: "", description: "", amount: null }];
sheet.getRangeByIndexes(firstRow - 1, 0, rows.length, 3).values = rows.map((row) => [row.date, row.description, row.amount]);
const totalRow = firstRow + rows.length;
sheet.getRange(`A${totalRow}:B${totalRow}`).merge();
sheet.getRange(`A${totalRow}`).values = [["Cộng"]];
sheet.getRange(`C${totalRow}`).formulas = [[`=SUM(C${firstRow}:C${totalRow - 1})`]];
const noteRow = totalRow + 3;
sheet.getRange(`A${noteRow}:C${noteRow}`).merge();
sheet.getRange(`A${noteRow}`).values = [[`Ngày ..... tháng ..... năm ${data.year}`]];
sheet.getRange(`A${noteRow + 1}`).values = [["NGƯỜI LẬP"]];
sheet.getRange(`B${noteRow + 1}:C${noteRow + 1}`).merge();
sheet.getRange(`B${noteRow + 1}`).values = [["NGƯỜI ĐẠI DIỆN HỘ KINH DOANH"]];
sheet.getRange(`A${noteRow + 2}`).values = [["(Ký, họ tên)"]];
sheet.getRange(`B${noteRow + 2}:C${noteRow + 2}`).merge();
sheet.getRange(`B${noteRow + 2}`).values = [["(Ký, họ tên, đóng dấu nếu có)"]];
sheet.getRange(`A${noteRow + 5}:C${noteRow + 5}`).merge();
sheet.getRange(`A${noteRow + 5}`).values = [["Ghi chú: Mẫu S1a-HKD áp dụng theo Điều 4 Thông tư 152/2025/TT-BTC. Nguồn dữ liệu: GLAME Photobooth local."]];

sheet.getRange("A1:C2").format.font = { name: "Times New Roman", size: 11, bold: true };
sheet.getRange("B3:C4").format = { font: { name: "Times New Roman", size: 10, bold: true }, horizontalAlignment: "center", wrapText: true };
sheet.getRange("A6:C6").format = { font: { name: "Times New Roman", size: 16, bold: true }, horizontalAlignment: "center" };
sheet.getRange("A7:C7").format = { font: { name: "Times New Roman", size: 11, italic: true }, horizontalAlignment: "center" };
sheet.getRange(`A9:C${totalRow}`).format = { font: { name: "Times New Roman", size: 11 }, borders: { preset: "all", style: "thin", color: "#000000" }, verticalAlignment: "center" };
sheet.getRange("A9:C10").format = { fill: "#E7E6E6", font: { name: "Times New Roman", size: 11, bold: true }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true, borders: { preset: "all", style: "thin", color: "#000000" } };
sheet.getRange(`A${totalRow}:C${totalRow}`).format = { fill: "#F2F2F2", font: { name: "Times New Roman", size: 11, bold: true }, borders: { preset: "all", style: "thin", color: "#000000" } };
sheet.getRange(`C${firstRow}:C${totalRow}`).format.numberFormat = "#,##0";
sheet.getRange(`A${firstRow}:A${totalRow - 1}`).format.horizontalAlignment = "center";
sheet.getRange(`C${firstRow}:C${totalRow}`).format.horizontalAlignment = "right";
sheet.getRange(`A${noteRow}:C${noteRow + 2}`).format = { font: { name: "Times New Roman", size: 11 }, horizontalAlignment: "center" };
sheet.getRange(`A${noteRow + 1}`).format.font = { name: "Times New Roman", size: 11, bold: true };
sheet.getRange(`B${noteRow + 1}:C${noteRow + 1}`).format.font = { name: "Times New Roman", size: 11, bold: true };
sheet.getRange(`A${noteRow + 5}:C${noteRow + 5}`).format = { font: { name: "Times New Roman", size: 9, italic: true, color: "#666666" }, wrapText: true };
sheet.getRange("A:A").format.columnWidth = 20;
sheet.getRange("B:B").format.columnWidth = 52;
sheet.getRange("C:C").format.columnWidth = 26;
sheet.getRange("4:4").format.rowHeight = 38;
sheet.getRange("6:6").format.rowHeight = 28;
sheet.getRange("9:10").format.rowHeight = 28;
sheet.freezePanes.freezeRows(10);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputFile);
if (process.env.S1A_PREVIEW === "1") {
  const check = await workbook.inspect({ kind: "table", range: `S1a-HKD!A1:C${noteRow + 5}`, include: "values,formulas", tableMaxRows: 30, tableMaxCols: 3 });
  await fs.writeFile(`${outputFile}.qa.ndjson`, check.ndjson, "utf8");
  const preview = await workbook.render({ sheetName: "S1a-HKD", range: `A1:C${noteRow + 5}`, scale: 1.5, format: "png" });
  await fs.writeFile(`${outputFile}.png`, new Uint8Array(await preview.arrayBuffer()));
}

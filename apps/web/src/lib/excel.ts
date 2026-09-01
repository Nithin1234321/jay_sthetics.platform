import * as XLSX from "xlsx";

export type ExportSheet = {
  name: string;
  rows: Record<string, string | number | boolean | null | undefined>[];
};

function safeSheetName(name: string) {
  return name.replace(/[\\/*?:[\]]/g, "").slice(0, 31) || "Sheet";
}

export function downloadExcel(filename: string, sheets: ExportSheet[]) {
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const rows = sheet.rows.length ? sheet.rows : [{ Info: "No records available" }];
    const worksheet = XLSX.utils.json_to_sheet(rows);

    const headers = Object.keys(rows[0] ?? {});
    worksheet["!cols"] = headers.map((header) => {
      const longest = Math.max(
        header.length,
        ...rows.map((row) => String(row[header] ?? "").length)
      );
      return { wch: Math.min(Math.max(longest + 2, 12), 42) };
    });

    if (worksheet["!ref"]) {
      worksheet["!autofilter"] = { ref: worksheet["!ref"] };
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(sheet.name));
  }

  XLSX.writeFile(workbook, filename, {
    bookType: "xlsx",
    compression: true
  });
}

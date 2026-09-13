import ExcelJS from "exceljs";
import type { ExportData } from "./data.js";
import { addCharts, type ChartSeries } from "./charts.js";

const palette = { ink: "193B35", green: "176B55", teal: "168E95", gold: "DDA64D", coral: "D47562", light: "EDF5EF", muted: "61766F", white: "FFFFFF" };
const currency = '"₹"#,##0.00;[Red]("₹"#,##0.00);"—"';
const fill = (color: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: color } });
const number = (value: string) => Number(value); // Exact backend totals are converted only at Excel's numeric boundary.
const formula = (value: string, result: number): ExcelJS.CellFormulaValue => ({ formula: value, result });

function band(sheet: ExcelJS.Worksheet, range: string, text: string, color = palette.green, size = 11) {
  sheet.mergeCells(range); const cell = sheet.getCell(range.split(":")[0]!);
  cell.value = text; cell.fill = fill(color); cell.font = { name: "Calibri", size, bold: true, color: { argb: palette.white } };
  cell.alignment = { vertical: "middle", indent: 1, wrapText: true };
}
function base(workbook: ExcelJS.Workbook, name: string, widths: number[], color: string, subtitle: string) {
  const sheet = workbook.addWorksheet(name, { properties: { tabColor: { argb: color }, defaultRowHeight: 23 },
    views: [{ showGridLines: false, state: "frozen", ySplit: 6 }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  sheet.columns = widths.map((width) => ({ width }));
  const last = sheet.getColumn(widths.length).letter;
  band(sheet, `A1:${last}2`, `KharCha.  /  ${name}`, color, 23);
  sheet.mergeCells(`A3:${last}4`); sheet.getCell("A3").value = subtitle;
  sheet.getCell("A3").font = { name: "Calibri", size: 11, color: { argb: palette.muted } };
  sheet.getCell("A3").alignment = { wrapText: true, vertical: "middle", indent: 1 };
  sheet.pageSetup.printTitlesRow = "1:6";
  return sheet;
}
function table(sheet: ExcelJS.Worksheet, name: string, headers: string[], rows: ExcelJS.CellValue[][], moneyCols: number[]) {
  sheet.addTable({ name, ref: "A6", headerRow: true, style: { theme: "TableStyleMedium4", showRowStripes: true },
    columns: headers.map((header) => ({ name: header, filterButton: true })), rows: rows.length ? rows : [headers.map(() => null)] });
  sheet.getRow(6).height = 32;
  sheet.getRow(6).eachCell((cell) => { cell.fill = fill(palette.green); cell.font = { bold: true, color: { argb: palette.white }, size: 11 }; cell.alignment = { wrapText: true, vertical: "middle" }; });
  for (let r = 7; r <= Math.max(7, rows.length + 6); r++) {
    const row = sheet.getRow(r); row.height = 35;
    row.eachCell({ includeEmpty: true }, (cell) => { cell.font = { name: "Calibri", size: 11, color: { argb: palette.ink } }; cell.alignment = { wrapText: true, vertical: "middle" }; });
    for (const col of moneyCols) { row.getCell(col).numFmt = currency; row.getCell(col).font = { name: "Calibri", size: 11, color: { argb: palette.green } }; }
  }
}

export async function expenseWorkbook(data: ExportData) {
  const book = new ExcelJS.Workbook(); book.creator = "KharCha"; book.created = new Date(data.generated_at);
  book.calcProperties.fullCalcOnLoad = true;
  const period = data.start_date ? `${data.start_date} → ${data.end_date}` : "No expenses recorded";
  const summary = base(book, "Summary", Array(12).fill(12), palette.ink, `${data.selection}  ·  ${period}  ·  INR`);
  summary.views = [{ showGridLines: false }]; summary.pageSetup.fitToHeight = 1; summary.pageSetup.printArea = "A1:L38";
  const tx = base(book, "Transactions", [14, 12, 35, 24, 25, 23, 10, 22, 22, 22, 12, 12, 18, 45, 38, 38, 38, 14, 23, 28, 28, 20, 18, 14], palette.green,
    `${period} · All matching records, oldest first. Dates/times are local values; audit timestamps are UTC. Long notes can be read in Excel's formula bar.`);
  const cats = base(book, "Categories", [30, 22, 17, 22, 22, 22, 22, 15], palette.teal, "Your share of variable and generated recurring expenses. Categories ranked at export time.");
  const months = base(book, "Monthly", [18, 22, 22, 22, 22, 22, 15], palette.coral, "Months with recorded expenses, based on transaction date. Missing months have no transactions; this is not an account balance.");
  const headers = ["Date", "Time", "Description", "Merchant", "Category", "Expense nature", "Currency", "Total paid", "My share", "Recoverable", "Split", "Participants", "Payment method", "Notes", "Transaction ID", "Category ID", "Recurring rule ID", "Occurrence date", "Timezone", "Created at (UTC)", "Updated at (UTC)", "Subcategory", "Transaction type", "Split type"];
  table(tx, "ExpenseRecords", headers, data.rows.map((row) => [row.transaction_date, row.transaction_time, row.description, row.merchant,
    row.category_name, row.expense_nature === "variable" ? "Variable" : "Recurring", row.currency, number(row.total_amount), number(row.my_share),
    number(row.recoverable_amount), row.is_split ? "Yes" : "No", row.participant_count, row.payment_method, row.notes, row.id, row.category_id,
    row.recurring_expense_id, row.occurrence_date, row.time_zone, row.created_at, row.updated_at, row.subcategory, row.transaction_type, row.split_type]), [8, 9, 10]);
  tx.views = [{ showGridLines: false, state: "frozen", xSplit: 3, ySplit: 6 }];
  const last = Math.max(7, data.rows.length + 6);
  const source = (col: string) => `'Transactions'!$${col}$7:$${col}$${last}`;
  const total = (col: string, cached: string) => formula(`ROUND(SUM(${source(col)}),2)`, number(cached));
  const cards: [string, string, string, ExcelJS.CellValue, string][] = [
    ["A5:D5", "A6:D8", "PERSONAL SPENDING", total("I", data.totals.personal), palette.green],
    ["E5:H5", "E6:H8", "TOTAL PAID", total("H", data.totals.paid), palette.teal],
    ["I5:L5", "I6:L8", "RECOVERABLE", total("J", data.totals.recoverable), palette.coral],
    ["A10:D10", "A11:D12", "VARIABLE · YOUR SHARE", formula(`ROUND(SUMIF(${source("F")},"Variable",${source("I")}),2)`, number(data.totals.variable)), palette.green],
    ["E10:H10", "E11:H12", "RECURRING · YOUR SHARE", formula(`ROUND(SUMIF(${source("F")},"Recurring",${source("I")}),2)`, number(data.totals.recurring)), palette.teal],
    ["I10:L10", "I11:L12", "TRANSACTIONS", formula(`COUNTA(${source("O")})`, data.totals.count), palette.coral],
  ];
  for (const [labelRange, valueRange, label, value, color] of cards) {
    band(summary, labelRange, label, color); summary.mergeCells(valueRange);
    const cell = summary.getCell(valueRange.split(":")[0]!); cell.value = value; cell.fill = fill(palette.light);
    cell.font = { name: "Calibri", size: data.totals.paid.length > 12 ? 18 : 25, bold: true, color: { argb: color } };
    cell.alignment = { vertical: "middle", indent: 1 }; cell.numFmt = label === "TRANSACTIONS" ? "#,##0" : currency;
  }
  const sum = (criteriaCol: string, criteria: string, amountCol: string, cached: string) => formula(`ROUND(SUMIF(${source(criteriaCol)},${criteria},${source(amountCol)}),2)`, number(cached));
  table(cats, "CategoryAnalysis", ["Category", "Personal spending", "% of personal", "Total paid", "Recoverable", "Variable", "Recurring", "Transactions"], data.categories.map((item, i) => {
    const r = i + 7;
    // Category names may contain wildcard characters: escape Excel SUMIF criteria.
    const criteria = `"="&SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(A${r},"~","~~"),"*","~*"),"?","~?")`;
    return [item.name, sum("E", criteria, "I", item.personal), formula(`IFERROR(B${r}/'Summary'!A6,0)`, item.percentage), sum("E", criteria, "H", item.paid), sum("E", criteria, "J", item.recoverable),
      formula(`ROUND(SUMIFS(${source("I")},${source("E")},${criteria},${source("F")},"Variable"),2)`, number(item.variable)),
      formula(`ROUND(SUMIFS(${source("I")},${source("E")},${criteria},${source("F")},"Recurring"),2)`, number(item.recurring)), formula(`COUNTIF(${source("E")},${criteria})`, item.count)];
  }), [2, 4, 5, 6, 7]);
  cats.getColumn(3).numFmt = "0.0%";
  table(months, "MonthlyAnalysis", ["Month", "Personal spending", "Variable", "Recurring", "Total paid", "Recoverable", "Transactions"], data.months.map((item, i) => {
    const criteria = `A${i + 7}&"*"`;
    return [item.month, sum("A", criteria, "I", item.personal),
      formula(`ROUND(SUMIFS(${source("I")},${source("A")},${criteria},${source("F")},"Variable"),2)`, number(item.variable)),
      formula(`ROUND(SUMIFS(${source("I")},${source("A")},${criteria},${source("F")},"Recurring"),2)`, number(item.recurring)),
      sum("A", criteria, "H", item.paid), sum("A", criteria, "J", item.recoverable), formula(`COUNTIF(${source("A")},${criteria})`, item.count)];
  }), [2, 3, 4, 5, 6]);
  if (data.categories.length) cats.addConditionalFormatting({ ref: `C7:C${data.categories.length + 6}`, rules: [{ type: "colorScale", cfvo: [{ type: "num", value: 0 }, { type: "num", value: 1 }], color: [{ argb: "EDF5EF" }, { argb: "86CDC3" }], priority: 1 }] });
  band(summary, "A31:L31", "READ YOUR NUMBERS", palette.ink);
  const notes = ["Personal spending is your share. Total paid also includes money paid for others.",
    "Recoverable is the original split amount; repayments and settlements are not tracked.",
    "This is an export snapshot. Excel edits do not update KharCha. Existing summary formulas recalculate in Excel.",
    `Generated ${data.generated_at} (UTC). Full category/month tables are on their own tabs. Charts show up to 8 categories / 12 recorded months.`,
    "Filters on Transactions affect the detail view only; summary totals describe the complete exported selection.",
    "To include newly added rows or categories, export again. Amounts are INR; local dates are ISO text for reliable sorting."];
  notes.forEach((note, i) => { summary.mergeCells(`A${i + 32}:L${i + 32}`); const cell = summary.getCell(`A${i + 32}`); cell.value = note; cell.font = { name: "Calibri", size: 10, color: { argb: palette.muted } }; cell.alignment = { wrapText: true, vertical: "middle" }; summary.getRow(i + 32).height = 30; });
  const charts: ChartSeries[] = [];
  const top = data.categories.slice(0, 8); const recent = data.months.slice(-12); const monthStart = data.months.length - recent.length + 7;
  if (top.length) charts.push({ title: "Top categories · your share", labels: top.map((item) => item.name), values: top.map((item) => number(item.personal)), labelRange: `Categories!$A$7:$A$${top.length + 6}`, valueRange: `Categories!$B$7:$B$${top.length + 6}`, color: palette.teal });
  if (recent.length) charts.push({ title: "Monthly personal spending", labels: recent.map((item) => item.month), values: recent.map((item) => number(item.personal)), labelRange: `Monthly!$A$${monthStart}:$A$${data.months.length + 6}`, valueRange: `Monthly!$B$${monthStart}:$B$${data.months.length + 6}`, color: palette.coral });
  if (!data.rows.length) band(summary, "A17:L20", "No expenses in this selection. Try another date range or add your first expense.", palette.teal, 16);
  const buffer = Buffer.from(await book.xlsx.writeBuffer());
  return addCharts(buffer, charts);
}

// Verification-only approximation of worksheet layout, using the saved XLSX's
// cells/styles and chart caches. This is not a replacement for Excel rendering.
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const folder = resolve("../../Docs/verification");
const bytes = await readFile(resolve(folder, "KharCha_sample_export.xlsx"));
const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes);
const zip = await JSZip.loadAsync(bytes);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const colNum = (letters) => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
try {
  for (const entry of zip.file(/\.xml$/)) {
    const xml = await entry.async("string");
    const valid = await page.evaluate((text) => !new DOMParser().parseFromString(text, "application/xml").querySelector("parsererror"), xml);
    if (!valid) throw new Error(`Malformed XML: ${entry.name}`);
  }
  const chartData = [];
  for (const entry of zip.file(/^xl\/charts\/chart\d+\.xml$/)) {
    chartData.push(await page.evaluate((text) => {
      const doc = new DOMParser().parseFromString(text, "application/xml");
      const get = (node, tag) => [...node.getElementsByTagNameNS("*", tag)];
      return { title: get(doc, "t")[0].textContent,
        labels: get(get(doc, "strCache")[0], "v").map((n) => n.textContent),
        values: get(get(doc, "numCache")[0], "v").map((n) => Number(n.textContent)) };
    }, await entry.async("string")));
  }
  for (const sheet of book.worksheets) {
    const cols = sheet.name === "Summary" ? 12 : Math.min(sheet.columnCount, 10);
    const rowCount = Math.min(sheet.rowCount, 38); const spans = new Map(); const hidden = new Set();
    for (const range of sheet.model.merges) {
      const [a, b] = range.split(":"); const [, ac, ar] = a.match(/([A-Z]+)(\d+)/); const [, bc, br] = b.match(/([A-Z]+)(\d+)/);
      const left = colNum(ac), right = Math.min(cols, colNum(bc));
      if (left > cols) continue;
      spans.set(`${ar}:${left}`, { rows: Number(br) - Number(ar) + 1, cols: right - left + 1 });
      for (let r = Number(ar); r <= Number(br); r++) for (let c = left; c <= right; c++) if (r !== Number(ar) || c !== left) hidden.add(`${r}:${c}`);
    }
    const widths = Array.from({ length: cols }, (_, i) => Math.round((sheet.getColumn(i + 1).width || 12) * 7 + 5));
    let html = `<style>body{margin:24px;background:#e7ece8;font-family:Calibri,Arial}#sheet{position:relative;width:${widths.reduce((a,b)=>a+b,0)}px;background:white}table{border-collapse:collapse;table-layout:fixed;width:100%}td{padding:0 7px;box-sizing:border-box;overflow:hidden;white-space:pre-wrap;overflow-wrap:break-word}svg{position:absolute;background:white}</style><div id="sheet"><table><colgroup>${widths.map((w) => `<col style="width:${w}px">`).join("")}</colgroup>`;
    for (let r = 1; r <= rowCount; r++) {
      html += `<tr style="height:${(sheet.getRow(r).height || 23) * 4 / 3}px">`;
      for (let c = 1; c <= cols; c++) {
        if (hidden.has(`${r}:${c}`)) continue;
        const cell = sheet.getCell(r, c), span = spans.get(`${r}:${c}`);
        const value = cell.type === ExcelJS.ValueType.Formula ? cell.result : cell.value;
        if (typeof value === "object" && value?.error) throw new Error(`Formula error ${sheet.name}!${cell.address}`);
        const text = typeof value === "number" ? cell.numFmt?.includes("₹") ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value) : cell.numFmt?.includes("%") ? `${(value * 100).toFixed(1)}%` : value : value ?? "";
        const font = cell.font ?? {}, fill = cell.fill?.fgColor?.argb;
        html += `<td ${span ? `rowspan="${span.rows}" colspan="${span.cols}"` : ""} style="background:${fill ? `#${fill.slice(-6)}` : r > 6 && sheet.name !== "Summary" && r % 2 ? "#edf5ef" : "white"};color:#${font.color?.argb?.slice(-6) || "193b35"};font-size:${(font.size || 11) * 4 / 3}px;font-weight:${font.bold ? 700 : 400};vertical-align:middle;text-align:${typeof value === "number" && sheet.name !== "Summary" ? "right" : "left"}">${escape(text)}</td>`;
      }
      html += "</tr>";
    }
    html += "</table>";
    if (sheet.name === "Summary") chartData.forEach((chart, index) => {
      const w = widths.slice(0, 6).reduce((a,b)=>a+b,0), h = 15 * 23 * 4 / 3;
      const max = Math.max(1, ...chart.values), gap = (w - 90) / chart.values.length;
      html += `<svg width="${w}" height="${h}" style="left:${index * w}px;top:${14 * 23 * 4 / 3}px" viewBox="0 0 ${w} ${h}"><text x="22" y="32" fill="#193b35" font-size="17" font-weight="bold">${escape(chart.title)}</text>`;
      for (let n = 0; n <= 4; n++) { const y = 65 + n * (h - 155) / 4; html += `<line x1="65" x2="${w-15}" y1="${y}" y2="${y}" stroke="#e5ece8"/><text x="60" y="${y+4}" text-anchor="end" fill="#61766f" font-size="10">₹${Math.round(max * (4-n)/4).toLocaleString("en-IN")}</text>`; }
      chart.values.forEach((value, i) => { const bar = value / max * (h - 155), x = 70 + i * gap; html += `<rect x="${x}" y="${h-90-bar}" width="${gap*0.65}" height="${bar}" fill="${index ? "#d47562" : "#168e95"}"/><text x="${x+gap*0.325}" y="${h-65}" text-anchor="middle" fill="#61766f" font-size="11">${escape(chart.labels[i])}</text>`; }); html += "</svg>";
    });
    await page.setContent(html + "</div>");
    await page.locator("#sheet").screenshot({ path: resolve(folder, `v5-workbook-${sheet.name.toLowerCase()}.png`) });
    console.log(`Verified XML, cached values and layout preview: ${sheet.name}`);
  }
} finally { await browser.close(); }

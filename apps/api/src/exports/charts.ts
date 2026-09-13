import JSZip from "jszip";

export type ChartSeries = { title: string; labels: string[]; values: number[]; labelRange: string; valueRange: string; color: string };
const xml = (text: string) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const relationships = "http://schemas.openxmlformats.org/package/2006/relationships";
const office = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

// ExcelJS has no native chart writer. Add two small standard DrawingML chart parts
// with worksheet references and cached points so Excel can display them immediately.
export async function addCharts(buffer: Buffer, series: ChartSeries[]) {
  if (!series.length) return buffer;
  const zip = await JSZip.loadAsync(buffer);
  let types = await zip.file("[Content_Types].xml")!.async("string");
  const anchors: string[] = [];
  const links: string[] = [];
  series.forEach((item, index) => {
    const id = index + 1;
    const points = item.labels.map((label, i) => `<c:pt idx="${i}"><c:v>${xml(label)}</c:v></c:pt>`).join("");
    const values = item.values.map((value, i) => `<c:pt idx="${i}"><c:v>${value}</c:v></c:pt>`).join("");
    const chart = `${declaration}<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:lang val="en-IN"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:t>${xml(item.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>Personal spending (INR)</c:v></c:tx><c:spPr><a:solidFill><a:srgbClr val="${item.color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:cat><c:strRef><c:f>${xml(item.labelRange)}</c:f><c:strCache><c:ptCount val="${item.labels.length}"/>${points}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>${xml(item.valueRange)}</c:f><c:numCache><c:formatCode>#,##0</c:formatCode><c:ptCount val="${item.values.length}"/>${values}</c:numCache></c:numRef></c:val></c:ser><c:gapWidth val="70"/><c:axId val="100"/><c:axId val="200"/></c:barChart><c:catAx><c:axId val="100"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="b"/><c:tickLblPos val="nextTo"/><c:crossAx val="200"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx><c:valAx><c:axId val="200"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="&quot;₹&quot;#,##0" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="100"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx></c:plotArea><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:chartSpace>`;
    zip.file(`xl/charts/chart${id}.xml`, chart);
    types = types.replace("</Types>", `<Override PartName="/xl/charts/chart${id}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`);
    const col = index * 6;
    anchors.push(`<xdr:twoCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>14</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${col + 6}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>29</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="Spending chart ${id}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="${office}" r:id="rId${id}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`);
    links.push(`<Relationship Id="rId${id}" Type="${office}/chart" Target="../charts/chart${id}.xml"/>`);
  });
  zip.file("xl/drawings/drawing1.xml", `${declaration}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors.join("")}</xdr:wsDr>`);
  zip.file("xl/drawings/_rels/drawing1.xml.rels", `${declaration}<Relationships xmlns="${relationships}">${links.join("")}</Relationships>`);
  zip.file("xl/worksheets/_rels/sheet1.xml.rels", `${declaration}<Relationships xmlns="${relationships}"><Relationship Id="rIdExportCharts" Type="${office}/drawing" Target="../drawings/drawing1.xml"/></Relationships>`);
  const sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  // Drawing must precede tableParts/extLst, which the Summary sheet does not contain.
  zip.file("xl/worksheets/sheet1.xml", sheet.replace("</worksheet>", '<drawing r:id="rIdExportCharts"/></worksheet>'));
  types = types.replace("</Types>", '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
  zip.file("[Content_Types].xml", types);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

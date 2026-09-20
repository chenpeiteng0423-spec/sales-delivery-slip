const form = document.getElementById("receiptForm");
const editor = document.getElementById("itemsEditor");
const preview = document.getElementById("receiptPreview");
const statusEl = document.getElementById("status");
const downloadBar = document.getElementById("downloadBar");
const savedView = document.getElementById("savedView");
const workspace = document.getElementById("workspace");
const savedPreview = document.getElementById("savedPreview");
const savedStatus = document.getElementById("savedStatus");
const addButton = document.getElementById("addItem");
const fields = ["company", "companyAddress", "landline", "mobile", "qq", "formTitle", "recipient", "shippingAddress", "contact", "phone", "date", "number", "terms", "issuedBy", "receivedBy", "slogan"];
const itemFields = ["model", "brand", "unit", "qty", "price", "batch", "remark"];
const qr = { alipay: new Image(), wechat: new Image() };
const paperColors = {
  white: { body: "#fcfcf7", edge: "#f4f6f2", ring: "#d5dfe2" },
  blue: { body: "#eaf4fa", edge: "#e1eef6", ring: "#c7dce9", xlsx: "FFEAF4FA" },
  red: { body: "#fff0f1", edge: "#fae6e9", ring: "#e9ced3", xlsx: "FFFFF0F1" },
  yellow: { body: "#fff7df", edge: "#f8edcc", ring: "#e7dcc0", xlsx: "FFFFF7DF" },
};
const usageEndpoint = "https://sales-slip-usage.junext-home-preview.workers.dev/events";
const namedStaff = new URLSearchParams(location.search).get("staff")?.trim().slice(0, 32) || "";
let visitorId = crypto.randomUUID();
try {
  visitorId = localStorage.getItem("delivery-slip-visitor-v1") || visitorId;
  localStorage.setItem("delivery-slip-visitor-v1", visitorId);
} catch {}
let draftTimer = 0;
let revision = Date.now();
function recordUse(kind, data = null, format = "") {
  if (!usageEndpoint.startsWith("https://")) return Promise.resolve(false);
  const staff = namedStaff || form.elements.namedItem("issuedBy")?.value.trim().slice(0, 32) || "";
  return fetch(usageEndpoint, {
    method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
    body: JSON.stringify({ kind, visitorId, staff, format, data, revision: revision = Math.max(revision + 1, Date.now()) }),
  }).then(response => response.ok).catch(() => false);
}
function queueDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => recordUse("draft", collect()), 1800);
}
qr.alipay.src = "./assets/alipay.png";
qr.wechat.src = "./assets/wechat.png";
let savedData = null;

function today() {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
function blankItem() { return { model: "", brand: "", unit: "PCS", qty: "", price: "", batch: "", remark: "" }; }
function clean(value) { return String(value ?? "").trim(); }
function money(value) { return `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function lineAmount(item) {
  const qty = Number(item.qty), price = Number(item.price);
  return item.qty !== "" && item.price !== "" && Number.isFinite(qty) && Number.isFinite(price) ? Math.round((qty * price + Number.EPSILON) * 100) / 100 : null;
}
function totalOf(data) { return Math.round(data.items.reduce((sum, item) => sum + (lineAmount(item) || 0), 0) * 100) / 100; }
function upperAmount(value) {
  const cents = Math.round(value * 100);
  const digits = "零壹贰叁肆伍陆柒捌玖";
  const four = (n) => {
    let result = "", pending = false;
    const text = String(n).padStart(4, "0");
    for (let i = 0; i < 4; i++) {
      const d = Number(text[i]);
      if (!d) { if (result) pending = true; continue; }
      if (pending) result += "零";
      result += digits[d] + ["仟", "佰", "拾", ""][i];
      pending = false;
    }
    return result;
  };
  const integer = Math.floor(cents / 100);
  const groups = [integer % 10000, Math.floor(integer / 10000) % 10000, Math.floor(integer / 100000000) % 10000];
  let main = "", zeroGroup = false;
  for (let i = 2; i >= 0; i--) {
    const group = groups[i];
    if (!group) { if (main) zeroGroup = true; continue; }
    if (main && (zeroGroup || group < 1000)) main += "零";
    main += four(group) + ["", "万", "亿"][i];
    zeroGroup = false;
  }
  main = (main || "零") + "元";
  const jiao = Math.floor(cents / 10) % 10, fen = cents % 10;
  if (!jiao && !fen) return main + "整";
  return main + (jiao ? digits[jiao] + "角" : "") + (!jiao && fen ? "零" : "") + (fen ? digits[fen] + "分" : "");
}

function addItem(item = blankItem()) {
  if (editor.children.length >= 6) return;
  const row = document.createElement("div");
  row.className = "item-row";
  const head = document.createElement("div"); head.className = "item-row__head";
  const title = document.createElement("strong"); title.textContent = `明细 ${editor.children.length + 1}`;
  const remove = document.createElement("button"); remove.type = "button"; remove.className = "remove-item"; remove.textContent = "移除此行";
  remove.addEventListener("click", () => { if (editor.children.length === 1) return; row.remove(); renumber(); markDirty(); renderPreview(); queueDraft(); });
  head.append(title, remove);
  const grid = document.createElement("div"); grid.className = "item-grid";
  const defs = [
    ["model", "型号 / 品名", "text", 32], ["brand", "品牌", "text", 20], ["unit", "单位", "text", 10],
    ["qty", "数量", "text", null], ["price", "单价", "text", null],
    ["remark", "备注", "text", 38], ["batch", "批号", "text", 24],
  ];
  for (const [key, label, type, max] of defs) {
    const wrap = document.createElement("label"); wrap.className = `field item-${key}`; wrap.textContent = label;
    const input = document.createElement("input"); input.dataset.item = key; input.type = type; input.value = item[key] ?? "";
    if (max) input.maxLength = max;
    if (key === "qty" || key === "price") input.inputMode = "decimal";
    wrap.append(input); grid.append(wrap);
  }
  const amount = document.createElement("div"); amount.className = "line-amount"; amount.innerHTML = "<small>金额</small><strong>—</strong>"; grid.append(amount);
  row.append(head, grid); editor.append(row); renumber(); updateAmounts();
}
function renumber() {
  [...editor.children].forEach((row, i) => { row.querySelector(".item-row__head strong").textContent = `明细 ${i + 1}`; row.querySelector(".remove-item").disabled = editor.children.length === 1; });
  addButton.disabled = editor.children.length >= 6;
}
function collect() {
  const data = {};
  for (const key of fields) data[key] = clean(form.elements.namedItem(key).value);
  data.paperTone = form.elements.namedItem("paperTone").value;
  data.items = [...editor.children].map(row => Object.fromEntries(itemFields.map(key => [key, clean(row.querySelector(`[data-item="${key}"]`).value)])));
  return data;
}
function updateAmounts() {
  [...editor.children].forEach(row => {
    const item = Object.fromEntries(itemFields.map(key => [key, clean(row.querySelector(`[data-item="${key}"]`).value)]));
    const amount = lineAmount(item);
    row.querySelector(".line-amount strong").textContent = amount === null ? "—" : money(amount);
  });
  document.getElementById("totalDisplay").textContent = money(totalOf(collect()));
}
function markDirty() { savedData = null; statusEl.textContent = "有未保存的修改"; }
function focusInvalid(input, message) { input.setAttribute("aria-invalid", "true"); input.focus(); statusEl.textContent = message; return false; }
function validate(data) {
  form.querySelectorAll('[aria-invalid="true"]').forEach(el => el.removeAttribute("aria-invalid"));
  for (const [key, label] of [["formTitle", "单据标题"], ["recipient", "收货单位"], ["date", "日期"], ["number", "单号"]]) {
    if (!data[key]) return focusInvalid(form.elements.namedItem(key), `请填写${label}`);
  }
  let hasItem = false;
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i], row = editor.children[i];
    const used = itemFields.some(key => item[key] && !(key === "unit" && item[key] === "PCS"));
    if (!used) continue;
    hasItem = true;
    if (!item.model) return focusInvalid(row.querySelector('[data-item="model"]'), `请填写明细 ${i + 1} 的型号或品名`);
    if (!item.qty || !Number.isFinite(Number(item.qty)) || Number(item.qty) <= 0) return focusInvalid(row.querySelector('[data-item="qty"]'), `请填写明细 ${i + 1} 的有效数量`);
    if (item.price === "" || !Number.isFinite(Number(item.price)) || Number(item.price) < 0) return focusInvalid(row.querySelector('[data-item="price"]'), `请填写明细 ${i + 1} 的有效单价`);
    if (Number(item.qty) > 1000000 || Number(item.price) > 10000000 || !Number.isFinite(lineAmount(item))) return focusInvalid(row.querySelector('[data-item="price"]'), `明细 ${i + 1} 的金额超出可用范围`);
  }
  if (!hasItem) return focusInvalid(editor.children[0].querySelector('[data-item="model"]'), "请至少填写一行商品明细");
  if (totalOf(data) >= 1000000000000) { statusEl.textContent = "金额过大，无法生成大写金额"; return false; }
  return true;
}
function applyData(data) {
  for (const key of fields) form.elements.namedItem(key).value = data[key] || (key === "formTitle" ? "销售送货单" : "");
  form.elements.namedItem("paperTone").value = Object.hasOwn(paperColors, data.paperTone) ? data.paperTone : "white";
  editor.replaceChildren();
  for (const item of data.items?.length ? data.items.slice(0, 6) : [blankItem()]) addItem(item);
  updateAmounts(); renderPreview();
}

function drawReceipt(canvas, data) {
  const scale = canvas.width / 1760, ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const blue = "#6387a5", dark = "#4d7391", line = "#8faec4";
  const paper = Object.hasOwn(paperColors, data.paperTone) ? paperColors[data.paperTone] : paperColors.white;
  ctx.fillStyle = paper.body; ctx.fillRect(0, 0, 1760, 1000);
  function text(value, x, y, size = 21, bold = false, align = "left", maxWidth) {
    ctx.fillStyle = dark; ctx.font = `${bold ? "700" : "400"} ${size}px "Songti SC", "SimSun", serif`;
    ctx.textAlign = align; ctx.textBaseline = "middle";
    if (maxWidth) ctx.fillText(clean(value), x, y, maxWidth); else ctx.fillText(clean(value), x, y);
  }
  function rule(x1, y1, x2, y2, width = 1) { ctx.strokeStyle = line; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function field(label, value, x, y, valueX, maxWidth) { text(label, x, y, 21); text(value, valueX, y, 21, false, "left", maxWidth); }
  function wrapped(value, x, y, width, maxLines = 2, size = 19) {
    const chars = Array.from(clean(value));
    for (let fontSize = size; fontSize >= 12; fontSize--) {
      ctx.font = `400 ${fontSize}px "Songti SC", "SimSun", serif`;
      const lines = [""];
      for (const char of chars) { const old = lines.at(-1); if (old && ctx.measureText(old + char).width > width) lines.push(char); else lines[lines.length - 1] += char; }
      if (lines.length <= maxLines) { lines.forEach((part, i) => text(part, x, y + i * (fontSize + 2), fontSize)); return; }
    }
    text(value, x, y, 12, false, "left", width);
  }
  // Continuous-feed paper edges, tear lines, and tractor holes.
  for (const x of [0, 1670]) { ctx.fillStyle = paper.edge; ctx.fillRect(x, 0, 90, 1000); }
  ctx.save(); ctx.strokeStyle = blue; ctx.lineWidth = 2; ctx.setLineDash([10, 9]);
  for (const x of [94, 1666]) { ctx.beginPath(); ctx.moveTo(x, 15); ctx.lineTo(x, 986); ctx.stroke(); }
  ctx.restore();
  for (let y = 52; y <= 968; y += 92) for (const x of [45, 1715]) {
    ctx.fillStyle = paper.ring; ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#36515d"; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
  }
  // Header and the two exact payment codes supplied by the owner.
  text(data.company, 200, 134, 36, true, "left", 820);
  field("地址：", data.companyAddress, 200, 190, 280, 760);
  field("电话：", data.landline, 200, 231, 278, 270);
  field("手机：", data.mobile, 550, 231, 625, 240);
  field("QQ：", data.qq, 875, 231, 934, 185);
  ctx.drawImage(qr.alipay, 1125, 96, 154, 154);
  ctx.drawImage(qr.wechat, 1380, 96, 154, 154);
  ["支", "付", "宝"].forEach((v, i) => text(v, 1308, 126 + i * 39, 22));
  ["微", "信"].forEach((v, i) => text(v, 1564, 143 + i * 42, 23));
  rule(160, 274, 1600, 274, 3);
  text(data.formTitle || "销售送货单", 880, 317, 39, true, "center", 500);
  field("收货单位：", data.recipient, 170, 367, 280, 470);
  field("联系人：", data.contact, 800, 367, 895, 235);
  field("日期：", data.date, 1215, 367, 1285, 300);
  field("收货地址：", data.shippingAddress, 170, 406, 280, 470);
  field("电话：", data.phone, 800, 406, 872, 260);
  field("单号：", data.number, 1215, 406, 1285, 300);
  const x = [165, 505, 630, 725, 830, 950, 1080, 1225, 1595], top = 435, header = 39, bottom = 705;
  rule(x[0], top, x.at(-1), top, 2); rule(x[0], top + header, x.at(-1), top + header);
  rule(x[0], bottom, x.at(-1), bottom, 2);
  rule(x[0], top, x[0], bottom, 2); rule(x.at(-1), top, x.at(-1), bottom, 2);
  for (const xx of x.slice(1, -1)) rule(xx, top, xx, top + header);
  ["型号", "品牌", "单位", "数量", "单价", "金额", "批号", "备注"].forEach((v, i) => text(v, (x[i] + x[i + 1]) / 2, top + 20, 21, false, "center"));
  for (let i = 0; i < 6; i++) {
    const item = data.items[i] || blankItem(), y = 497 + i * 34;
    const values = [item.model, item.brand, item.model ? item.unit : "", item.qty, item.price === "" ? "" : Number(item.price).toFixed(2), lineAmount(item) === null ? "" : Number(lineAmount(item)).toFixed(2), item.batch, item.remark];
    values.forEach((v, j) => j === 0 || j === 7 ? wrapped(v, x[j] + 13, y, x[j + 1] - x[j] - 25, 1, 20) : text(v, (x[j] + x[j + 1]) / 2, y, 20, false, "center", x[j + 1] - x[j] - 12));
  }
  ["①白联：存根", "②红联：收款", "③黄联：客户"].forEach((value, j) => {
    Array.from(value).forEach((char, i) => text(char, 1624, 353 + j * 154 + i * 24, 16));
  });
  text("合计人民币（大写）：", 170, 733, 22);
  text(upperAmount(totalOf(data)), 412, 733, 22, false, "left", 560);
  text("合计：", 1012, 733, 22);
  text(`${totalOf(data).toFixed(2)}元`, 1110, 733, 22);
  rule(165, 756, 1595, 756, 2);
  text(data.terms, 170, 784, 18, false, "left", 1380);
  text("销售单位及经手人：", 170, 831, 21);
  text("收货单位及经手人：", 885, 831, 21);
  text("Issued By（签章）：", 170, 866, 20);
  text(data.issuedBy, 420, 866, 21, false, "left", 360);
  text("Received By（签章）：", 885, 866, 20);
  text(data.receivedBy, 1165, 866, 21, false, "left", 350);
  for (let i = 0; i < 4; i++) text(data.slogan, 170 + i * 360, 931, 22, true, "left", 320);
  text("第 1 页，共 1 页", 1595, 974, 16, false, "right");
}
function renderPreview() {
  if (!qr.alipay.complete || !qr.wechat.complete || !qr.alipay.naturalWidth || !qr.wechat.naturalWidth) return;
  const data = collect(); drawReceipt(preview, data);
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function filename(data, extension) { return `${data.formTitle.replace(/[^\w\u4e00-\u9fff-]/g, "_")}_${data.number.replace(/[^\w\u4e00-\u9fff-]/g, "_")}_${data.date}.${extension}`; }
async function makePdf(data) {
  const canvas = document.createElement("canvas"); canvas.width = 3520; canvas.height = 2000; drawReceipt(canvas, data);
  const png = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
  if (!png) throw new Error("PDF 页面生成失败");
  const pdf = await PDFLib.PDFDocument.create();
  const page = pdf.addPage([1008, 572.73]);
  const image = await pdf.embedPng(await png.arrayBuffer());
  page.drawImage(image, { x: 0, y: 0, width: 1008, height: 572.73 });
  return new Blob([await pdf.save()], { type: "application/pdf" });
}

const XML_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
function setCell(doc, address, value, type = "text", formula = false) {
  const cell = [...doc.getElementsByTagNameNS(XML_NS, "c")].find(node => node.getAttribute("r") === address);
  if (!cell) throw new Error(`Excel 模板缺少单元格 ${address}`);
  for (const child of [...cell.children]) if (["v", "is"].includes(child.localName)) cell.removeChild(child);
  if (type === "blank") { cell.removeAttribute("t"); return; }
  if (type === "number") {
    cell.removeAttribute("t");
    const v = doc.createElementNS(XML_NS, "x:v"); v.textContent = String(value); cell.append(v);
  } else {
    cell.setAttribute("t", "inlineStr");
    const is = doc.createElementNS(XML_NS, "x:is"), t = doc.createElementNS(XML_NS, "x:t");
    t.textContent = clean(value); is.append(t); cell.append(is);
  }
}
async function colorXlsxPaper(zip, sheet, rgb) {
  const styles = new DOMParser().parseFromString(await zip.file("xl/styles.xml").async("string"), "application/xml");
  if (styles.querySelector("parsererror")) throw new Error("Excel 样式无法读取");
  const fills = styles.getElementsByTagNameNS(XML_NS, "fills")[0];
  const xfs = styles.getElementsByTagNameNS(XML_NS, "cellXfs")[0];
  const fill = styles.createElementNS(XML_NS, "fill");
  const pattern = styles.createElementNS(XML_NS, "patternFill");
  const color = styles.createElementNS(XML_NS, "fgColor");
  color.setAttribute("rgb", rgb);
  pattern.setAttribute("patternType", "solid"); pattern.append(color); fill.append(pattern);
  const fillId = fills.children.length; fills.append(fill); fills.setAttribute("count", fills.children.length);
  const styleMap = new Map();
  for (const cell of sheet.getElementsByTagNameNS(XML_NS, "c")) {
    const oldId = Number(cell.getAttribute("s") || 0);
    if (!styleMap.has(oldId)) {
      const original = xfs.children[oldId];
      if (!original) throw new Error("Excel 单元格样式缺失");
      const clone = original.cloneNode(true);
      clone.setAttribute("fillId", fillId); clone.setAttribute("applyFill", "1");
      styleMap.set(oldId, xfs.children.length); xfs.append(clone);
    }
    cell.setAttribute("s", styleMap.get(oldId));
  }
  xfs.setAttribute("count", xfs.children.length);
  zip.file("xl/styles.xml", new XMLSerializer().serializeToString(styles));
}
async function makeXlsx(data) {
  const response = await fetch("./assets/template.xlsx"); if (!response.ok) throw new Error("Excel 模板加载失败");
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const xml = await zip.file("xl/worksheets/sheet1.xml").async("string");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Excel 模板无法读取");
  const mapping = { C2: data.company, C3: data.companyAddress, C4: data.landline, F4: data.mobile, C5: data.qq, B7: data.formTitle, C8: data.recipient, C9: data.shippingAddress, F8: data.contact, F9: data.phone, H9: data.number, E17: upperAmount(totalOf(data)), C18: data.terms, C21: data.issuedBy, G21: data.receivedBy, B23: data.slogan };
  for (const [cell, value] of Object.entries(mapping)) setCell(doc, cell, value);
  const [year, month, day] = data.date.split("-").map(Number);
  setCell(doc, "H8", Math.round((Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86400000), "number");
  for (let i = 0; i < 6; i++) {
    const item = data.items[i] || blankItem(), row = i + 11;
    for (const [col, key] of [["B", "model"], ["C", "brand"], ["D", "unit"], ["H", "batch"], ["I", "remark"]]) setCell(doc, `${col}${row}`, key === "unit" && !item.model ? "" : item[key]);
    for (const [col, key] of [["E", "qty"], ["F", "price"]]) setCell(doc, `${col}${row}`, item[key] === "" ? "" : Number(item[key]), item[key] === "" ? "blank" : "number");
    const amount = lineAmount(item);
    setCell(doc, `G${row}`, amount === null ? "" : amount, amount === null ? "blank" : "number", true);
  }
  setCell(doc, "H17", totalOf(data), "number", true);
  const paperFill = paperColors[data.paperTone]?.xlsx;
  if (paperFill) await colorXlsxPaper(zip, doc, paperFill);
  zip.file("xl/worksheets/sheet1.xml", new XMLSerializer().serializeToString(doc));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function xml(value) { return clean(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;"); }
function wordRun(value, bold = false) { return `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Microsoft YaHei"/>${bold ? "<w:b/>" : ""}<w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${xml(value)}</w:t></w:r>`; }
function wordPara(value = "", { bold = false, center = false, size = 20 } = {}) { return `<w:p><w:pPr>${center ? '<w:jc w:val="center"/>' : ""}<w:spacing w:after="80"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Microsoft YaHei"/>${bold ? "<w:b/>" : ""}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xml(value)}</w:t></w:r></w:p>`; }
function wordCell(content, width, fill = "") { return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${fill ? `<w:shd w:fill="${fill}"/>` : ""}</w:tcPr>${content}</w:tc>`; }
function wordTable(rows, widths, borders = false) {
  const border = borders ? '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="9CB7CD"/><w:left w:val="single" w:sz="4" w:color="9CB7CD"/><w:bottom w:val="single" w:sz="4" w:color="9CB7CD"/><w:right w:val="single" w:sz="4" w:color="9CB7CD"/><w:insideH w:val="single" w:sz="4" w:color="9CB7CD"/><w:insideV w:val="single" w:sz="4" w:color="9CB7CD"/></w:tblBorders>' : "";
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${border}</w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${rows.map(row => `<w:tr>${row.map((cell, i) => wordCell(cell, widths[i], borders && rows.indexOf(row) === 0 ? "E8F0F6" : "")).join("")}</w:tr>`).join("")}</w:tbl>`;
}
function wordImage(id, rid, name) {
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="820000" cy="820000"/><wp:docPr id="${id}" name="${name}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="820000" cy="820000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}
async function makeDocx(data) {
  const zip = new JSZip();
  const canvas = document.createElement("canvas"); canvas.width = 3520; canvas.height = 2000; drawReceipt(canvas, data);
  const png = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
  if (!png) throw new Error("Word 页面生成失败");
  const width = 17399000, height = 9885795;
  const picture = `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${width}" cy="${height}"/><wp:docPr id="1" name="销售送货单" descr="包含已填写内容和收款二维码的销售送货单"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="销售送货单"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${picture}<w:sectPr><w:pgSz w:w="20160" w:h="11520" w:orient="landscape"/><w:pgMar w:top="144" w:right="144" w:bottom="144" w:left="144" w:header="0" w:footer="0"/></w:sectPr></w:body></w:document>`;
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", doc);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/slip.png"/></Relationships>`);
  zip.file("word/media/slip.png", await png.arrayBuffer());
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

recordUse("view");
form.addEventListener("input", () => { markDirty(); updateAmounts(); renderPreview(); queueDraft(); });
form.addEventListener("submit", event => {
  event.preventDefault(); const data = collect(); if (!validate(data)) return;
  clearTimeout(draftTimer);
  savedData = structuredClone(data);
  try { localStorage.setItem("delivery-slip-draft-v2", JSON.stringify(data)); statusEl.textContent = "已保存到当前浏览器"; }
  catch { statusEl.textContent = "已准备好下载；当前浏览器未保存草稿"; }
  drawReceipt(savedPreview, savedData);
  document.getElementById("savedTitle").textContent = data.formTitle;
  workspace.hidden = true; savedView.hidden = false; savedStatus.textContent = "";
  recordUse("save", data);
  window.scrollTo({ top: 0, behavior: "instant" });
});
addButton.addEventListener("click", () => { addItem(); markDirty(); renderPreview(); queueDraft(); });
document.getElementById("newReceipt").addEventListener("click", () => {
  clearTimeout(draftTimer); recordUse("reset");
  applyData({ formTitle: "销售送货单", date: today(), items: [blankItem()] }); markDirty(); statusEl.textContent = "已新建空白单";
});
document.getElementById("backToEdit").addEventListener("click", () => {
  savedView.hidden = true; workspace.hidden = false; window.scrollTo({ top: 0, behavior: "instant" });
  form.elements.namedItem("company").focus();
});
downloadBar.addEventListener("click", async event => {
  const button = event.target.closest("button[data-format]"); if (!button || !savedData) return;
  button.disabled = true; savedStatus.textContent = "正在生成文件…";
  try {
    const format = button.dataset.format;
    const blob = format === "pdf" ? await makePdf(savedData) : format === "docx" ? await makeDocx(savedData) : await makeXlsx(savedData);
    download(blob, filename(savedData, format)); savedStatus.textContent = `${format.toUpperCase()} 已开始下载`;
    recordUse("download", savedData, format);
  } catch (error) { savedStatus.textContent = `生成失败：${error.message || "请重试"}`; }
  finally { button.disabled = false; }
});
Promise.all([qr.alipay.decode(), qr.wechat.decode()]).then(() => {
  let draft = null; try { draft = JSON.parse(localStorage.getItem("delivery-slip-draft-v2") || "null"); } catch {}
  applyData(draft && Array.isArray(draft.items) ? draft : { formTitle: "销售送货单", date: today(), terms: "收货请当面核对型号和数量，芯片保上机90天，感谢您的支持与配合！", items: [blankItem()] });
  if (draft && Array.isArray(draft.items)) recordUse("draft", collect());
  statusEl.textContent = draft ? "已恢复本机草稿，保存后可下载" : "尚未保存";
  if (document.modelContext?.registerTool) {
    const schema = { type: "object", properties: {
      company: { type: "string" }, companyAddress: { type: "string" }, landline: { type: "string" }, mobile: { type: "string" }, qq: { type: "string" },
      formTitle: { type: "string" }, recipient: { type: "string" }, shippingAddress: { type: "string" }, contact: { type: "string" }, phone: { type: "string" },
      date: { type: "string" }, number: { type: "string" }, terms: { type: "string" }, issuedBy: { type: "string" }, receivedBy: { type: "string" }, slogan: { type: "string" },
      paperTone: { type: "string", enum: ["white", "blue", "red", "yellow"] },
      items: { type: "array", minItems: 1, maxItems: 6, items: { type: "object", properties: Object.fromEntries(itemFields.map(key => [key, { type: "string" }])), required: ["model", "qty", "price"], additionalProperties: false } }
    }, required: ["formTitle", "recipient", "date", "number", "items"], additionalProperties: false };
    Promise.resolve(document.modelContext.registerTool({ name: "fill_save_delivery_slip", title: "填写并保存销售送货单", description: "将指定信息填入当前销售送货单并保存，显示最终预览和下载按钮。", inputSchema: schema, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) {
      if (!input || typeof input !== "object" || !Array.isArray(input.items) || input.items.length < 1 || input.items.length > 6) throw new Error("商品明细需为 1 至 6 行");
      if (!input.formTitle || !input.recipient || !input.date || !input.number) throw new Error("标题、收货单位、日期和单号不能为空");
      applyData(input); form.requestSubmit();
      if (!savedData) throw new Error(statusEl.textContent || "单据未保存");
      return { saved: true, title: savedData.formTitle, total: totalOf(savedData) };
    } })).catch(() => {});
  }
}).catch(() => { statusEl.textContent = "二维码加载失败，请刷新页面"; });

// Basic money logic check catches regressions without a test framework.
console.assert(upperAmount(400) === "肆佰元整" && upperAmount(10001.05) === "壹万零壹元零伍分");

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const JSZip = require("../vendor/jszip.min.js");
const jsQR = require("../vendor/jsQR.js");

const root = path.join(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const context = vm.createContext({ URL, JSZip });
vm.runInContext(source("batch.js"), context);
const batch = vm.runInContext("QRBatch", context);
const parse = (input) => JSON.parse(JSON.stringify(batch.parseLinks(input)));

test("extract links from mixed lists, remove duplicates and normalize www", () => {
  const input = "Danh sach:\nhttps://a.example/1,https://b.example/2;www.example.org\n"
    + "https://a.example/1 <https://c.example/3> ('https://d.example/4')";
  assert.deepEqual(parse(input), {
    links: ["https://a.example/1", "https://b.example/2", "https://www.example.org", "https://c.example/3", "https://d.example/4"],
    duplicates: 1, invalid: 0,
  });
});

test("preserve query parameters, nested URLs, punctuation and balanced parentheses", () => {
  const links = [
    "https://example.com/a?items=1,2&mode=a;b&next=https://other.example/path#section",
    "https://example.com/wiki/Example_(test)",
    "https://example.com/?value=a%20b&other=%26%3B",
    "https://example.com/?value=one,two,",
    "https://example.com/?value=one;",
  ];
  assert.deepEqual(parse(links.join("\n")).links, links);
  assert.deepEqual(parse(`(${links[1]}),`).links, [links[1]]);
  assert.deepEqual(parse("https://example.com/?a=1, https://example.org/?b=2; https://example.net/").links,
    ["https://example.com/?a=1", "https://example.org/?b=2", "https://example.net/"]);
  assert.deepEqual(parse("plain text ftp://example.com javascript:alert(1) https://[bad]").links, []);
});

test("real QR encoder and decoder round-trip every extracted URL", () => {
  const encoder = vm.createContext({
    document: { documentElement: { tagName: "html" } },
    navigator: { userAgent: "node" }, TextEncoder,
  });
  vm.runInContext(source("vendor/qrcode.min.js"), encoder);
  const links = parse("https://example.com/?a=1&b=2\nhttps://example.org/tiếng-việt😀\nwww.example.net").links;
  for (const link of links) {
    const element = { style: {}, childNodes: [{ offsetWidth: 256, offsetHeight: 256, style: {} }] };
    const qr = new encoder.QRCode(element, { text: link, width: 256, height: 256 });
    const model = qr._oQRCode;
    const count = model.getModuleCount();
    const width = (count + 8) * 6;
    const pixels = new Uint8ClampedArray(width * width * 4);
    for (let y = 0; y < width; y++) {
      for (let x = 0; x < width; x++) {
        const row = Math.floor(y / 6) - 4;
        const col = Math.floor(x / 6) - 4;
        const dark = row >= 0 && row < count && col >= 0 && col < count && model.isDark(row, col);
        const color = dark ? 0 : 255;
        pixels.set([color, color, color, 255], (y * width + x) * 4);
      }
    }
    assert.equal(jsQR(pixels, width, width).data, link);
  }
});

test("ZIP contains the exact image bytes and matching links with distinct filenames", async () => {
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+afoUAAAAASUVORK5CYII=";
  const entries = ["https://example.com/a", "https://example.com/b"].map((link, index) => ({
    link, filename: batch.filename(link, index), dataUrl: `data:image/png;base64,${png}`,
  }));
  assert.notEqual(entries[0].filename, entries[1].filename);
  const data = await batch.createArchive(entries, "nodebuffer");
  const zip = await JSZip.loadAsync(data, { checkCRC32: true });
  assert.equal(Object.keys(zip.files).length, 3);
  for (const entry of entries) {
    assert.deepEqual(await zip.file(entry.filename).async("nodebuffer"), Buffer.from(png, "base64"));
    assert.ok((await zip.file("links.txt").async("string")).includes(`${entry.filename}\n${entry.link}`));
  }
});

function appHarness() {
  const nodes = new Map();
  function element(tag = "div") {
    return {
      tag, attrs: {}, children: [], handlers: {}, value: "", hidden: false,
      classList: { add() {}, remove() {}, toggle() {} },
      append(...children) { this.children.push(...children); },
      replaceChildren() { this.children = []; },
      addEventListener(name, handler) { this.handlers[name] = handler; },
      getAttribute(name) { return this.attrs[name]; },
      setAttribute(name, value) { this.attrs[name] = value; },
      focus() {},
    };
  }
  for (const match of source("index.html").matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    const node = element();
    node.attrs = Object.fromEntries([...match[0].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    node.hidden = /\shidden(?:\s|>)/.test(match[0]);
    nodes.set(match[1], node);
  }
  const get = (id) => { assert.ok(nodes.has(id), `Missing HTML element: ${id}`); return nodes.get(id); };
  const app = vm.createContext({
    document: { getElementById: get, createElement: element, addEventListener() {} },
    URL, JSZip, QRCode: function () {}, setTimeout,
  });
  vm.runInContext(source("batch.js"), app);
  vm.runInContext(source("app.js"), app);
  // Canvas is browser-owned; simulate just the image rendering boundary here.
  vm.runInContext('batchPng = (link) => { if (link.includes("too-long")) throw Error("overflow"); return "data:image/png;base64,aGVsbG8="; };', app);
  return { get };
}

test("three tabs switch correctly and preserve the batch input", () => {
  const { get } = appHarness();
  get("batchText").value = "https://example.com";
  for (const name of ["batch", "scan", "create"]) {
    get(`${name}Tab`).handlers.click();
    for (const panel of ["create", "batch", "scan"]) assert.equal(get(`${panel}Panel`).hidden, panel !== name);
  }
  get("createTab").handlers.keydown({ key: "ArrowLeft", preventDefault() {} });
  assert.equal(get("scanPanel").hidden, false);
  assert.equal(get("batchText").value, "https://example.com");
});

test("partial errors retain successful codes; input edits clear stale downloads", async () => {
  const { get } = appHarness();
  get("batchText").value = "https://example.com/a https://example.com/too-long https://example.com/b";
  const pending = get("batchForm").handlers.submit({ preventDefault() {} });
  assert.equal(get("batchText").readOnly, true);
  assert.equal(get("batchCreateButton").disabled, true);
  await pending;
  assert.equal(get("batchResults").children.length, 3);
  assert.equal(get("batchDownloadButton").disabled, false);
  assert.equal(get("batchCreateButton").disabled, false);
  assert.equal(get("batchText").readOnly, false);
  assert.match(get("batchStatus").textContent, /2\/3/);
  get("batchText").value = "https://example.com/new";
  get("batchText").handlers.input();
  assert.equal(get("batchResults").children.length, 0);
  assert.equal(get("batchDownloadButton").disabled, true);
});

test("reject oversized batches without silently truncating or creating QR codes", async () => {
  const { get } = appHarness();
  get("batchText").value = Array.from({ length: 101 }, (_, i) => `https://example.com/${i}`).join("\n");
  await get("batchForm").handlers.submit({ preventDefault() {} });
  assert.equal(get("batchResults").children.length, 0);
  assert.match(get("batchStatus").textContent, /101/);
  assert.match(get("batchStatus").textContent, /100/);
});

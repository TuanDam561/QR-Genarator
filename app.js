"use strict";

const $ = (id) => document.getElementById(id);
let scanVersion = 0;
let previewUrl;

const tabs = [$("createTab"), $("batchTab"), $("scanTab")];

function selectTab(selectedTab, focus = false) {
  for (const tab of tabs) {
    const selected = tab === selectedTab;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $(tab.getAttribute("aria-controls")).hidden = !selected;
  }
  if (focus) selectedTab.focus();
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (event) => {
    let nextIndex;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index + tabs.length - 1) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    selectTab(tabs[nextIndex], true);
  });
});

function setStatus(id, message, error = false) {
  $(id).textContent = message;
  $(id).classList.toggle("error", error);
}

$("createForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = $("qrText").value.trim();
  $("qrcode").replaceChildren();
  $("downloadButton").disabled = true;
  if (!text) {
    setStatus("createStatus", "Vui lòng nhập link hoặc nội dung.", true);
    return;
  }
  if (typeof QRCode !== "function") {
    setStatus("createStatus", "Không tải được thư viện tạo QR. Vui lòng tải lại trang.", true);
    return;
  }
  try {
    new QRCode($("qrcode"), {
      text, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.H,
    });
    $("downloadButton").disabled = false;
    setStatus("createStatus", "Đã tạo QR. Bạn có thể tải ảnh PNG xuống.");
  } catch {
    $("qrcode").replaceChildren();
    setStatus("createStatus", "Không tạo được QR. Hãy thử rút ngắn nội dung.", true);
  }
});

$("downloadButton").addEventListener("click", () => {
  const source = $("qrcode").querySelector("canvas");
  if (!source) return;
  // Use the canvas so download works even before the QR image finishes loading.
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 260;
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, 260, 260);
  context.drawImage(source, 20, 20, 220, 220);
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = "qrcode.png";
  link.click();
});

function resetScan() {
  const version = ++scanVersion;
  $("scanResult").hidden = true;
  $("resultText").value = "";
  $("openLink").hidden = true;
  $("openLink").removeAttribute("href");
  $("scanPreview").hidden = true;
  $("scanPreview").removeAttribute("src");
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined;
  $("scanPanel").setAttribute("aria-busy", "false");
  return version;
}

function showResult(text) {
  $("resultText").value = text;
  $("scanResult").hidden = false;
  // QR contents stay plain text. Only HTTP(S) URLs get a clickable link.
  try {
    const url = new URL(text.trim());
    if (url.protocol === "https:" || url.protocol === "http:") {
      $("openLink").href = url.href;
      $("openLink").hidden = false;
    }
  } catch { /* QR codes can contain plain text. */ }
  setStatus("scanStatus", $("openLink").hidden
    ? "Đã đọc QR. Mã này chứa nội dung văn bản, không phải link HTTP/HTTPS."
    : "Đã tìm thấy link trong QR.");
}

async function scanFile(file) {
  // Pasting an image also reveals the scanner when the create tab is active.
  selectTab($("scanTab"));
  const version = resetScan();
  if (!file || !file.type.startsWith("image/")) {
    setStatus("scanStatus", "Vui lòng chọn một tệp ảnh có mã QR (PNG, JPG, WebP…).", true);
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    setStatus("scanStatus", "Ảnh vượt quá 20 MB. Hãy chọn ảnh nhỏ hơn hoặc cắt vùng QR.", true);
    return;
  }
  if (typeof jsQR !== "function") {
    setStatus("scanStatus", "Không tải được thư viện quét QR. Vui lòng tải lại trang.", true);
    return;
  }
  setStatus("scanStatus", "Đang đọc mã QR…");
  $("scanPanel").setAttribute("aria-busy", "true");
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = objectUrl;
    await img.decode();
    if (version !== scanVersion) return;
    if (img.naturalWidth * img.naturalHeight > 40000000) {
      throw new Error("Ảnh có kích thước quá lớn. Hãy cắt vùng chứa QR rồi thử lại.");
    }
    previewUrl = URL.createObjectURL(file);
    $("scanPreview").src = previewUrl;
    $("scanPreview").hidden = false;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const maxSide = Math.max(img.naturalWidth, img.naturalHeight);
    // A second, larger pass helps when QR codes occupy a small part of a screenshot.
    const sizes = [...new Set([Math.min(maxSide, 1200), Math.min(maxSide, 2400)])];
    for (const size of sizes) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (version !== scanVersion) return;
      const scale = size / maxSide;
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" });
      if (result) {
        showResult(result.data);
        return;
      }
    }
    setStatus("scanStatus", "Không tìm thấy mã QR. Hãy dùng ảnh rõ hơn hoặc cắt sát vùng chứa QR, giữ viền trắng quanh mã.", true);
  } catch (error) {
    if (version === scanVersion) {
      setStatus("scanStatus", error.message.startsWith("Ảnh có") ? error.message
        : "Không đọc được ảnh này. Hãy thử ảnh PNG, JPG hoặc WebP khác.", true);
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
    if (version === scanVersion) $("scanPanel").setAttribute("aria-busy", "false");
  }
}

$("qrFile").addEventListener("change", (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (file) scanFile(file);
});

document.addEventListener("paste", (event) => {
  const item = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith("image/"));
  if (item) {
    event.preventDefault();
    scanFile(item.getAsFile());
  }
});

$("pasteButton").addEventListener("click", async () => {
  const version = resetScan();
  if (!navigator.clipboard?.read) {
    setStatus("scanStatus", "Trình duyệt chưa hỗ trợ nút dán ảnh. Hãy nhấn Ctrl + V / ⌘ + V hoặc chọn ảnh từ máy.", true);
    return;
  }
  setStatus("scanStatus", "Đang đọc ảnh từ bộ nhớ tạm…");
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((type) => type.startsWith("image/"));
      if (type) {
        const file = await item.getType(type);
        if (version === scanVersion) await scanFile(file);
        return;
      }
    }
    if (version === scanVersion) setStatus("scanStatus", "Bộ nhớ tạm chưa có ảnh. Hãy sao chép ảnh QR hoặc chụp màn hình rồi dán lại.", true);
  } catch {
    if (version === scanVersion) setStatus("scanStatus", "Chưa đọc được bộ nhớ tạm. Hãy nhấn Ctrl + V / ⌘ + V hoặc chọn ảnh từ máy.", true);
  }
});

for (const eventName of ["dragover", "drop"]) {
  document.addEventListener(eventName, (event) => {
    if (Array.from(event.dataTransfer?.types || []).includes("Files")) event.preventDefault();
  });
}
$("dropZone").addEventListener("dragover", (event) => {
  event.preventDefault();
  $("dropZone").classList.add("dragging");
});
$("dropZone").addEventListener("dragleave", () => $("dropZone").classList.remove("dragging"));
$("dropZone").addEventListener("drop", (event) => {
  event.preventDefault();
  $("dropZone").classList.remove("dragging");
  const files = Array.from(event.dataTransfer.files);
  const file = files.find((file) => file.type.startsWith("image/")) || files[0];
  if (file) scanFile(file);
});

$("copyButton").addEventListener("click", async () => {
  const version = scanVersion;
  try {
    await navigator.clipboard.writeText($("resultText").value);
    if (version === scanVersion) setStatus("scanStatus", "Đã sao chép nội dung QR.");
  } catch {
    if (version !== scanVersion) return;
    $("resultText").focus();
    $("resultText").select();
    setStatus("scanStatus", "Hãy nhấn Ctrl + C / ⌘ + C hoặc giữ vào nội dung để sao chép.");
  }
});

let batchEntries = [];
let batchBusy = false;

function batchSummary(parsed) {
  const details = [`${parsed.links.length} link hợp lệ`];
  if (parsed.duplicates) details.push(`bỏ ${parsed.duplicates} link trùng`);
  if (parsed.invalid) details.push(`bỏ ${parsed.invalid} link không hợp lệ`);
  return details.join(" · ");
}

$("batchText").addEventListener("input", () => {
  const parsed = QRBatch.parseLinks($("batchText").value);
  $("batchCount").textContent = batchSummary(parsed);
  batchEntries = [];
  $("batchResults").replaceChildren();
  $("batchResultHeader").hidden = true;
  $("batchDownloadButton").disabled = true;
  setStatus("batchStatus", "");
});

function setBatchBusy(busy) {
  batchBusy = busy;
  $("batchText").readOnly = busy;
  $("batchCreateButton").disabled = busy;
  $("batchDownloadButton").disabled = busy || !batchEntries.length;
  $("batchForm").setAttribute("aria-busy", String(busy));
}

function batchPng(link) {
  const holder = document.createElement("div");
  new QRCode(holder, { text: link, width: 256, height: 256, correctLevel: QRCode.CorrectLevel.H });
  const source = holder.querySelector("canvas");
  if (!source) throw new Error("No QR canvas");
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 304;
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, 304, 304);
  context.drawImage(source, 24, 24);
  return canvas.toDataURL("image/png");
}

$("batchForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (batchBusy) return;
  const parsed = QRBatch.parseLinks($("batchText").value);
  $("batchCount").textContent = batchSummary(parsed);
  if (!parsed.links.length) {
    setStatus("batchStatus", "Chưa tìm thấy link. Hãy dán link bắt đầu bằng https://, http:// hoặc www.", true);
    return;
  }
  if (parsed.links.length > QRBatch.maxLinks) {
    setStatus("batchStatus", `Có ${parsed.links.length} link. Hãy chia thành các nhóm tối đa ${QRBatch.maxLinks} link rồi tạo lại.`, true);
    return;
  }
  if (typeof QRCode !== "function") {
    setStatus("batchStatus", "Không tải được thư viện tạo QR. Vui lòng tải lại trang.", true);
    return;
  }
  batchEntries = [];
  $("batchResults").replaceChildren();
  $("batchResultHeader").hidden = true;
  setBatchBusy(true);
  let failed = 0;
  try {
    for (const [index, link] of parsed.links.entries()) {
      setStatus("batchStatus", `Đang tạo QR ${index + 1}/${parsed.links.length}…`);
      // Yield between codes so the page stays interactive during a large batch.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const card = document.createElement("article");
      card.className = "batch-card";
      const heading = document.createElement("h4");
      heading.textContent = `QR ${String(index + 1).padStart(2, "0")}`;
      const urlText = document.createElement("p");
      urlText.className = "batch-url";
      urlText.textContent = link;
      urlText.title = link;
      card.append(heading);
      try {
        const dataUrl = batchPng(link);
        const filename = QRBatch.filename(link, index);
        const img = document.createElement("img");
        img.src = dataUrl;
        img.alt = `Mã QR ${index + 1} cho ${link}`;
        const download = document.createElement("a");
        download.className = "button secondary";
        download.href = dataUrl;
        download.download = filename;
        download.textContent = "Tải PNG";
        card.append(img, urlText, download);
        batchEntries.push({ link, filename, dataUrl });
      } catch {
        failed++;
        card.classList.add("failed");
        const error = document.createElement("p");
        error.className = "status error";
        error.textContent = "Không tạo được QR cho link này. Hãy thử rút ngắn link.";
        card.append(urlText, error);
      }
      $("batchResults").append(card);
    }
    $("batchResultHeader").hidden = false;
    $("batchResultTitle").textContent = `${batchEntries.length} mã QR đã tạo`;
    setStatus("batchStatus", `Đã tạo ${batchEntries.length}/${parsed.links.length} mã QR.`
      + (failed ? ` Có ${failed} link bị lỗi, được đánh dấu bên dưới.` : " Bạn có thể tải từng ảnh hoặc tải tất cả."), failed > 0);
  } catch {
    setStatus("batchStatus", "Quá trình tạo bị gián đoạn. Bạn vẫn có thể tải các mã đã tạo hoặc thử lại.", true);
    $("batchResultHeader").hidden = !batchEntries.length;
    $("batchResultTitle").textContent = `${batchEntries.length} mã QR đã tạo`;
  } finally {
    setBatchBusy(false);
  }
});

$("batchDownloadButton").addEventListener("click", async () => {
  if (batchBusy || !batchEntries.length) return;
  if (typeof JSZip !== "function") {
    setStatus("batchStatus", "Chưa tải được thư viện ZIP. Bạn vẫn có thể tải từng PNG hoặc tải lại trang.", true);
    return;
  }
  setBatchBusy(true);
  setStatus("batchStatus", "Đang đóng gói các ảnh QR…");
  try {
    const blob = await QRBatch.createArchive(batchEntries);
    const objectUrl = URL.createObjectURL(blob);
    const download = document.createElement("a");
    download.href = objectUrl;
    download.download = "qr-codes.zip";
    document.body.append(download);
    download.click();
    download.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    setStatus("batchStatus", `Đã chuẩn bị file ZIP gồm ${batchEntries.length} ảnh QR và danh sách link.`);
  } catch {
    setStatus("batchStatus", "Không tạo được file ZIP. Hãy thử lại hoặc tải từng ảnh PNG.", true);
  } finally {
    setBatchBusy(false);
  }
});

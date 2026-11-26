"use strict";

const QRBatch = {
  maxLinks: 100,

  parseLinks(input) {
    // Split list separators only when another URL follows. Keep commas and
    // semicolons inside paths/query strings, including nested redirect URLs.
    const separated = input.replace(/[,;|]+(?=[ \t]*(?:https?:\/\/|www\.))/gi, "\n");
    const candidates = separated.match(/\b(?:https?:\/\/|www\.)[^\s<>"`]+/gi) || [];
    const links = [];
    const seen = new Set();
    let duplicates = 0;
    let invalid = 0;
    for (let candidate of candidates) {
      // A trailing comma/semicolon can be part of a query value or fragment.
      if (!/[?#]/.test(candidate)) candidate = candidate.replace(/[,;.]+$/, "");
      // Remove a closing bracket from prose, but preserve balanced URL brackets.
      for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
        while (candidate.endsWith(close)
          && candidate.split(close).length > candidate.split(open).length) {
          candidate = candidate.slice(0, -1);
        }
      }
      if (candidate.endsWith("'")) candidate = candidate.slice(0, -1);
      const link = /^www\./i.test(candidate) ? `https://${candidate}` : candidate;
      try {
        const url = new URL(link);
        if (!["http:", "https:"].includes(url.protocol) || !url.hostname) throw new Error("Invalid URL");
        if (seen.has(link)) {
          duplicates++;
        } else {
          seen.add(link);
          links.push(link);
        }
      } catch {
        invalid++;
      }
    }
    return { links, duplicates, invalid };
  },

  filename(link, index) {
    const host = new URL(link).hostname.replace(/[^a-z0-9.-]/gi, "-").slice(0, 70);
    return `qr-${String(index + 1).padStart(3, "0")}-${host}.png`;
  },

  async createArchive(entries, type = "blob") {
    const zip = new JSZip();
    for (const entry of entries) {
      zip.file(entry.filename, entry.dataUrl.split(",")[1], { base64: true });
    }
    zip.file("links.txt", entries.map((entry) => `${entry.filename}\n${entry.link}`).join("\n\n"));
    return zip.generateAsync({ type });
  },
};

export function formatMoney(value) {
  const number = Number(value || 0);
  return number.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatDateTime(value) {
  const s = String(value || "").trim();
  if (!s) return "-";
  const dt = new Date(s.includes("T") ? s : `${s}Z`);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toLocaleString("en-IN", { hour12: true });
  }
  return s;
}

export function formatDateDDMMYYYY(value) {
  const s = String(value || "").trim();
  if (!s) return "-";
  // yyyy-mm-dd -> dd-mm-yyyy
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}-${m}-${y}`;
  }
  // ddmmyyyy -> dd-mm-yyyy
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 8)}`;
  }
  // already dd-mm-yyyy
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    return s;
  }
  return s;
}

export function getTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(iso, days) {
  const base = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return iso;
  base.setUTCDate(base.getUTCDate() + Number(days || 0));
  return base.toISOString().slice(0, 10);
}

export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let size = value;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(size >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function value(id) {
  return (document.getElementById(id)?.value || "").trim();
}

export function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

export function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value || "";
}

export function clearInputs(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

export async function readFileAsBytes(file) {
  if (!file) return null;
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

export function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function downloadCsv(headers, rows, filename) {
  const csvLines = [headers.join(",")].concat(
    rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, "\"\"")}"`).join(","))
  );
  const blob = new Blob([csvLines.join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function renderSimpleList(id, items, emptyText) {
  const list = document.getElementById(id);
  if (!list) return;
  list.innerHTML = "";
  if (!items.length) {
    list.innerHTML = `<li class="student-item"><strong>${emptyText}</strong></li>`;
    return;
  }
  items.forEach((text) => {
    const li = document.createElement("li");
    li.className = "student-item";
    li.textContent = text;
    list.appendChild(li);
  });
}

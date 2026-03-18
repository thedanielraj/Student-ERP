import { formatDateDDMMYYYY, getTodayIso, formatMoney } from "./utils.js";

export function triggerPdfDownload(bytes, filename) {
  if (!bytes || !bytes.length) return;
  const blob = new Blob([bytes], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename || "document.pdf";
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function generateAdmissionPdfAttachment(payload) {
  if (!window.PDFLib) return null;
  const MAX_PDF_BYTES = 1024 * 1024;
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const accent = rgb(0.06, 0.27, 0.5);
  const text = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.35, 0.4, 0.5);
  let logoImage = null;
  let logoWidth = 0;
  let logoHeight = 0;
  let photoImage = null;
  let photoWidth = 0;
  let photoHeight = 0;

  const wrapText = (value, maxWidth, useFont, size) => {
    const words = String(value || "-").split(/\s+/).filter(Boolean);
    if (!words.length) return ["-"];
    const lines = [];
    let line = "";
    words.forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      const width = useFont.widthOfTextAtSize(test, size);
      if (width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines;
  };

  const drawSectionTitle = (page, title, y) => {
    page.drawText(title, { x: 42, y, size: 12, font: bold, color: accent });
    page.drawLine({ start: { x: 42, y: y - 4 }, end: { x: 553, y: y - 4 }, thickness: 0.8, color: accent });
    return y - 18;
  };

  const drawRow = (page, label, value, y) => {
    const labelX = 42;
    const valueX = 170;
    const valueWidth = 553 - valueX;
    const lines = wrapText(value, valueWidth, font, 10);
    page.drawText(`${label}:`, { x: labelX, y, size: 10, font: bold, color: muted });
    lines.forEach((line, index) => {
      page.drawText(line, { x: valueX, y: y - (index * 14), size: 10, font, color: text });
    });
    return y - (Math.max(lines.length, 1) * 14) - 6;
  };

  try {
    const logoRes = await fetch("/assets/logo.png");
    const logoBytes = await logoRes.arrayBuffer();
    logoImage = await doc.embedPng(logoBytes);
    const maxW = 90;
    const scale = maxW / logoImage.width;
    logoWidth = logoImage.width * scale;
    logoHeight = logoImage.height * scale;
  } catch (_) {
    logoImage = null;
    logoWidth = 0;
    logoHeight = 0;
  }

  if (payload?.admission_photo_bytes && payload.admission_photo_bytes.length) {
    try {
      const type = String(payload.admission_photo_type || "").toLowerCase();
      if (type.includes("png")) {
        photoImage = await doc.embedPng(payload.admission_photo_bytes);
      } else {
        photoImage = await doc.embedJpg(payload.admission_photo_bytes);
      }
      photoWidth = photoImage.width;
      photoHeight = photoImage.height;
    } catch (_) {
      photoImage = null;
      photoWidth = 0;
      photoHeight = 0;
    }
  }

  const drawAdmissionFormPage = (copyLabel) => {
    const page = doc.addPage([595, 842]);
    page.drawRectangle({
      x: 30, y: 30, width: 535, height: 782, borderColor: accent, borderWidth: 1.2,
    });
    const headerTop = 792;
    const logoY = headerTop - logoHeight - 20;
    if (logoImage) {
      page.drawImage(logoImage, { x: 42, y: logoY, width: logoWidth, height: logoHeight });
    }
    const headerX = 42 + (logoWidth ? logoWidth + 16 : 0);
    page.drawText("Arunand's Aviation Institute", { x: headerX, y: headerTop, size: 16, font: bold, color: accent });
    page.drawText("Admission Form", { x: headerX, y: headerTop - 18, size: 14, font, color: muted });
    page.drawText(copyLabel, { x: headerX, y: headerTop - 34, size: 11, font, color: muted });
    const issuedOn = formatDateDDMMYYYY(getTodayIso());
    page.drawText(`Application Date: ${issuedOn}`, { x: 42, y: 702, size: 10, font, color: muted });
    const photoX = 438;
    const photoY = 698;
    const photoW = 102;
    const photoH = 110;
    page.drawRectangle({ x: photoX, y: photoY, width: photoW, height: photoH, borderColor: muted, borderWidth: 0.8 });
    page.drawText("Photo", { x: photoX + 30, y: photoY + photoH - 16, size: 9, font, color: muted });
    if (photoImage && photoWidth && photoHeight) {
      const pad = 6;
      const maxW = photoW - pad * 2;
      const maxH = photoH - pad * 2;
      const scale = Math.min(maxW / photoWidth, maxH / photoHeight);
      const drawW = photoWidth * scale;
      const drawH = photoHeight * scale;
      const drawX = photoX + (photoW - drawW) / 2;
      const drawY = photoY + (photoH - drawH) / 2;
      page.drawImage(photoImage, { x: drawX, y: drawY, width: drawW, height: drawH });
    }

    let y = 660;
    y = drawSectionTitle(page, "Applicant Details", y);
    y = drawRow(page, "Full Name", `${payload.first_name || ""} ${payload.middle_name || ""} ${payload.last_name || ""}`.trim(), y);
    y = drawRow(page, "Course Applied", payload.course || "-", y);
    y = drawRow(page, "Phone", payload.phone || "-", y);
    y = drawRow(page, "Email", payload.email || "-", y);
    y = drawRow(page, "Date of Birth", payload.dob ? formatDateDDMMYYYY(payload.dob) : "-", y);
    y = drawRow(page, "Age", payload.age || "-", y);
    y = drawRow(page, "Blood Group", payload.blood_group || "-", y);
    y = drawRow(page, "Aadhaar", payload.aadhaar_number || "-", y);
    y = drawRow(page, "Nationality", payload.nationality || "-", y);

    y -= 6;
    y = drawSectionTitle(page, "Parent / Guardian Details", y);
    y = drawRow(page, "Father", `${payload.father_name || "-"} | ${payload.father_phone || "-"} | ${payload.father_occupation || "-"}`, y);
    y = drawRow(page, "Father Email", payload.father_email || "-", y);
    y = drawRow(page, "Mother", `${payload.mother_name || "-"} | ${payload.mother_phone || "-"} | ${payload.mother_occupation || "-"}`, y);
    y = drawRow(page, "Mother Email", payload.mother_email || "-", y);

    y -= 6;
    y = drawSectionTitle(page, "Address Details", y);
    y = drawRow(page, "Correspondence", payload.correspondence_address || "-", y);
    y = drawRow(page, "Permanent", payload.permanent_address || "-", y);

    y -= 6;
    y = drawSectionTitle(page, "Academic Details", y);
    const tableX = 42;
    const tableW = 511;
    const colWidths = [150, 70, 210, 70];
    const headerY = y;
    page.drawRectangle({ x: tableX, y: headerY - 18, width: tableW, height: 18, borderColor: accent, borderWidth: 0.8 });
    page.drawText("Qualification", { x: tableX + 6, y: headerY - 14, size: 9, font: bold, color: accent });
    page.drawText("Year", { x: tableX + colWidths[0] + 6, y: headerY - 14, size: 9, font: bold, color: accent });
    page.drawText("Institution", { x: tableX + colWidths[0] + colWidths[1] + 6, y: headerY - 14, size: 9, font: bold, color: accent });
    page.drawText("%", { x: tableX + colWidths[0] + colWidths[1] + colWidths[2] + 6, y: headerY - 14, size: 9, font: bold, color: accent });

    let rowY = headerY - 18;
    const rows = Array.isArray(payload.academic_details) ? payload.academic_details : [];
    const maxRows = Math.min(rows.length, 5);
    for (let i = 0; i < maxRows; i += 1) {
      const item = rows[i] || {};
      rowY -= 20;
      page.drawRectangle({ x: tableX, y: rowY, width: tableW, height: 20, borderColor: rgb(0.82, 0.85, 0.9), borderWidth: 0.6 });
      page.drawText(String(item.qualification || "-"), { x: tableX + 6, y: rowY + 6, size: 9, font, color: text });
      page.drawText(String(item.year_of_passing || "-"), { x: tableX + colWidths[0] + 6, y: rowY + 6, size: 9, font, color: text });
      page.drawText(String(item.institution || "-"), { x: tableX + colWidths[0] + colWidths[1] + 6, y: rowY + 6, size: 9, font, color: text });
      page.drawText(String(item.percentage || "-"), { x: tableX + colWidths[0] + colWidths[1] + colWidths[2] + 6, y: rowY + 6, size: 9, font, color: text });
    }
    if (!maxRows) {
      rowY -= 20;
      page.drawRectangle({ x: tableX, y: rowY, width: tableW, height: 20, borderColor: rgb(0.82, 0.85, 0.9), borderWidth: 0.6 });
      page.drawText("No academic details provided.", { x: tableX + 6, y: rowY + 6, size: 9, font, color: muted });
    }

    y = rowY - 26;
    page.drawText("Declaration: I hereby confirm that the above information is true and correct to the best of my knowledge.", {
      x: 42, y, size: 9, font, color: muted,
    });
    y -= 26;
    page.drawText("Applicant Signature", { x: 42, y, size: 9, font: bold, color: muted });
    page.drawLine({ start: { x: 42, y: y - 4 }, end: { x: 220, y: y - 4 }, thickness: 0.6, color: muted });
    page.drawText("Parent/Guardian Signature", { x: 300, y, size: 9, font: bold, color: muted });
    page.drawLine({ start: { x: 300, y: y - 4 }, end: { x: 553, y: y - 4 }, thickness: 0.6, color: muted });
  };

  drawAdmissionFormPage("Student Copy");
  drawAdmissionFormPage("Office Copy");

  const bytes = await doc.save();
  if (bytes.length > MAX_PDF_BYTES) {
    throw new Error("Admission PDF must be less than 1 MB. Please reduce academic rows and retry.");
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const base64 = btoa(binary);
  const filename = `admission_${payload.first_name}_${payload.last_name}_${Date.now()}.pdf`.replace(/\s+/g, "_");
  return { base64, filename, bytes };
}

export async function generateIdCardPdf(admission) {
  if (!window.PDFLib || !admission) return;
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([260, 165]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const accent = rgb(0.06, 0.27, 0.5);

  page.drawRectangle({ x: 6, y: 6, width: 248, height: 153, borderColor: accent, borderWidth: 1 });
  try {
    const logoRes = await fetch("/assets/logo.png");
    const logoBytes = await logoRes.arrayBuffer();
    const logo = await pdfDoc.embedPng(logoBytes);
    const scale = 40 / logo.width;
    page.drawImage(logo, { x: 12, y: 118, width: logo.width * scale, height: logo.height * scale });
  } catch (_) {}

  page.drawText("Arunand's Aviation Institute", { x: 60, y: 135, size: 10, font: bold, color: accent });
  page.drawText("Student ID Card", { x: 60, y: 122, size: 9, font, color: accent });

  const photoBox = { x: 14, y: 40, w: 60, h: 70 };
  page.drawRectangle({ x: photoBox.x, y: photoBox.y, width: photoBox.w, height: photoBox.h, borderColor: accent, borderWidth: 0.8 });

  if (window.authFetch) {
    const res = await window.authFetch(`${window.location.origin}/api/admissions/${admission.admission_id}/photo`);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const photoBytes = new Uint8Array(buf);
      const photoType = res.headers.get("content-type") || "image/jpeg";
      try {
        const img = photoType.includes("png") ? await pdfDoc.embedPng(photoBytes) : await pdfDoc.embedJpg(photoBytes);
        const scale = Math.min(photoBox.w / img.width, photoBox.h / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        page.drawImage(img, {
          x: photoBox.x + (photoBox.w - drawW) / 2,
          y: photoBox.y + (photoBox.h - drawH) / 2,
          width: drawW,
          height: drawH,
        });
      } catch (_) {}
    }
  }

  const x = 82;
  let y = 100;
  const line = (label, value) => {
    page.drawText(`${label}:`, { x, y, size: 8, font: bold, color: accent });
    page.drawText(String(value || "-"), { x: x + 48, y, size: 8, font, color: rgb(0.1, 0.1, 0.1) });
    y -= 12;
  };
  line("Name", admission.full_name || "-");
  line("Course", admission.course || "-");
  line("Phone", admission.phone || "-");
  line("ID", admission.admission_id || "-");

  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `id_card_${admission.admission_id || "student"}.pdf`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function generateCertificatePdf(admission) {
  if (!window.PDFLib || !admission) return;
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const accent = rgb(0.06, 0.27, 0.5);

  page.drawRectangle({ x: 30, y: 30, width: 535, height: 782, borderColor: accent, borderWidth: 1.2 });
  try {
    const logoRes = await fetch("/assets/logo.png");
    const logoBytes = await logoRes.arrayBuffer();
    const logo = await pdfDoc.embedPng(logoBytes);
    const scale = 120 / logo.width;
    page.drawImage(logo, { x: 42, y: 740, width: logo.width * scale, height: logo.height * scale });
  } catch (_) {}
  page.drawText("Certificate of Completion", { x: 160, y: 700, size: 24, font: bold, color: accent });
  page.drawText("This is to certify that", { x: 210, y: 640, size: 14, font, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(String(admission.full_name || "-"), { x: 160, y: 610, size: 22, font: bold, color: accent });
  page.drawText(`has successfully completed the ${admission.course || "course"}.`, { x: 150, y: 570, size: 14, font, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(`Date: ${formatDateDDMMYYYY(getTodayIso())}`, { x: 42, y: 120, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
  page.drawText("Authorized Signature", { x: 400, y: 120, size: 12, font: bold, color: accent });
  page.drawLine({ start: { x: 400, y: 110 }, end: { x: 540, y: 110 }, thickness: 1, color: accent });

  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `certificate_${admission.admission_id || "student"}.pdf`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function downloadInvoicePdf(invoice) {
  if (!window.PDFLib) return;
  const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const accent = rgb(0.06, 0.27, 0.5);
  const muted = rgb(0.15, 0.2, 0.3);
  const dim = rgb(0.3, 0.35, 0.45);
  const text = rgb(0.08, 0.08, 0.08);
  const border = rgb(0.12, 0.12, 0.12);
  let logoImage = null;
  let logoWidth = 0;
  let logoHeight = 0;

  const wrapText = (value, maxWidth, useFont, size) => {
    const words = String(value || "-").split(/\s+/).filter(Boolean);
    if (!words.length) return ["-"];
    const lines = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      const width = useFont.widthOfTextAtSize(candidate, size);
      if (width <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : ["-"];
  };

  const measureText = (value, useFont, size) => useFont.widthOfTextAtSize(String(value || ""), size);

  const drawCenteredText = (page, value, y, size, useFont, color, left, width) => {
    const textWidth = measureText(value, useFont, size);
    const x = left + Math.max((width - textWidth) / 2, 0);
    page.drawText(String(value), { x, y, size, font: useFont, color });
  };

  const drawAlignedText = (page, value, x, y, width, align, size, useFont, color) => {
    const textWidth = measureText(value, useFont, size);
    let drawX = x;
    if (align === "center") drawX = x + Math.max((width - textWidth) / 2, 0);
    if (align === "right") drawX = x + Math.max(width - textWidth, 0);
    page.drawText(String(value), { x: drawX, y, size, font: useFont, color });
  };

  const numberToWords = (num) => {
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
      "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    const toTwoDigits = (n) => {
      if (n < 20) return ones[n];
      const t = Math.floor(n / 10);
      const o = n % 10;
      return `${tens[t]}${o ? ` ${ones[o]}` : ""}`.trim();
    };

    const toThreeDigits = (n) => {
      const h = Math.floor(n / 100);
      const r = n % 100;
      if (!h) return toTwoDigits(r);
      if (!r) return `${ones[h]} Hundred`;
      return `${ones[h]} Hundred ${toTwoDigits(r)}`.trim();
    };

    if (num === 0) return "Zero";
    let n = Math.floor(num);
    const parts = [];
    const crore = Math.floor(n / 10000000);
    n %= 10000000;
    const lakh = Math.floor(n / 100000);
    n %= 100000;
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    const hundred = n;

    if (crore) parts.push(`${toTwoDigits(crore)} Crore`);
    if (lakh) parts.push(`${toTwoDigits(lakh)} Lakh`);
    if (thousand) parts.push(`${toTwoDigits(thousand)} Thousand`);
    if (hundred) parts.push(toThreeDigits(hundred));
    return parts.join(" ").trim();
  };

  const amountToWords = (amount) => {
    const total = Number(amount || 0);
    const rupees = Math.floor(total);
    const paise = Math.round((total - rupees) * 100);
    const rupeeWords = `${numberToWords(rupees)} Rupees`;
    if (paise > 0) {
      return `${rupeeWords} And ${numberToWords(paise)} Paise Only`;
    }
    return `${rupeeWords} Only`;
  };

  const getAcademicYearLabel = (dateValue) => {
    const date = new Date(dateValue || Date.now());
    if (Number.isNaN(date.getTime())) return "----";
    const year = date.getFullYear();
    const month = date.getMonth();
    if (month >= 5) {
      return `${year}-${String(year + 1).slice(-2)}`;
    }
    return `${year - 1}-${String(year).slice(-2)}`;
  };

  try {
    const logoRes = await fetch("/assets/logo.png");
    const logoBytes = await logoRes.arrayBuffer();
    logoImage = await pdfDoc.embedPng(logoBytes);
    const maxW = 90;
    const scale = maxW / logoImage.width;
    logoWidth = logoImage.width * scale;
    logoHeight = logoImage.height * scale;
  } catch (_) {}

  const drawReceiptPage = (copyLabel) => {
    const page = pdfDoc.addPage([595, 842]);
    const pageWidth = 595;
    const contentLeft = 42;
    const contentRight = 553;
    const contentWidth = contentRight - contentLeft;
    page.drawRectangle({
      x: 30, y: 30, width: 535, height: 782, borderColor: border, borderWidth: 1.2,
    });

    const headerTop = 795;
    if (logoImage) {
      page.drawImage(logoImage, {
        x: contentLeft, y: headerTop - logoHeight + 6, width: logoWidth, height: logoHeight,
      });
    }

    drawCenteredText(page, "ARUNAND'S AVIATION INSTITUTE", headerTop, 16, fontBold, accent, contentLeft, contentWidth);
    drawCenteredText(page, "Bangalore, India", headerTop - 18, 9, font, muted, contentLeft, contentWidth);
    drawCenteredText(page, "Contact No.: +91 903 696 0521   Website: arunandsaviation.com", headerTop - 32, 9, font, muted, contentLeft, contentWidth);

    const titleText = `Fee Receipt (${getAcademicYearLabel(invoice.date)}) - ${copyLabel}`;
    const titleY = headerTop - 64;
    const titleWidth = Math.min(measureText(titleText, fontBold, 11) + 20, contentWidth);
    const titleX = contentLeft + (contentWidth - titleWidth) / 2;
    page.drawRectangle({ x: titleX, y: titleY - 6, width: titleWidth, height: 20, borderColor: border, borderWidth: 1 });
    drawCenteredText(page, titleText, titleY, 11, fontBold, text, titleX, titleWidth);

    const infoY = titleY - 34;
    page.drawText(`Receipt No: ${invoice.invoice_no || "-"}`, { x: contentLeft, y: infoY, size: 10.5, font: fontBold, color: text });
    drawCenteredText(page, `Admission No: ${invoice.student_id || "-"}`, infoY, 10.5, fontBold, text, contentLeft, contentWidth);
    drawAlignedText(page, `Date: ${formatDateDDMMYYYY(invoice.date || "")}`, contentLeft, infoY, contentWidth, "right", 10.5, fontBold, text);

    const infoY2 = infoY - 18;
    page.drawText(`Name: ${invoice.student_name || "-"}`, { x: contentLeft, y: infoY2, size: 10.5, font: fontBold, color: text });
    drawAlignedText(page, `ClassName: ${invoice.course || "-"}`, contentLeft, infoY2, contentWidth, "right", 10.5, fontBold, text);

    const tableTop = infoY2 - 26;
    const colWidths = [35, 190, 75, 70, 95, 46];
    const headers = ["No", "Description", "Total Due", "Concession", "Amount Paid (Rs.)", "Balance"];
    const rowHeight = 26;
    const totalTableHeight = rowHeight * 3;

    page.drawRectangle({ x: contentLeft, y: tableTop - totalTableHeight, width: contentWidth, height: totalTableHeight, borderColor: border, borderWidth: 1 });
    page.drawLine({ start: { x: contentLeft, y: tableTop - rowHeight }, end: { x: contentRight, y: tableTop - rowHeight }, thickness: 0.8, color: border });
    page.drawLine({ start: { x: contentLeft, y: tableTop - rowHeight * 2 }, end: { x: contentRight, y: tableTop - rowHeight * 2 }, thickness: 0.8, color: border });

    let colX = contentLeft;
    for (let i = 0; i < colWidths.length; i += 1) {
      if (i > 0) page.drawLine({ start: { x: colX, y: tableTop }, end: { x: colX, y: tableTop - totalTableHeight }, thickness: 0.8, color: border });
      const headerLines = wrapText(headers[i], colWidths[i] - 6, fontBold, 8.5);
      const headerStartY = tableTop - 12 - (headerLines.length - 1) * 8;
      headerLines.slice(0, 2).forEach((line, idx) => {
        drawAlignedText(page, line, colX + 3, headerStartY - idx * 8, colWidths[i] - 6, "center", 8.5, fontBold, text);
      });
      colX += colWidths[i];
    }

    const concessionAmount = Number(invoice.concession_amount || 0);
    const amountTotal = Number(invoice.amount_total || 0);
    const amountPaid = Number(invoice.amount_paid || 0);
    const rowBalance = Math.max(amountTotal - amountPaid - concessionAmount, 0);
    const description = invoice.fee_description || `${invoice.course || "Course"} Fees`;

    const rowY = tableTop - rowHeight - 18;
    colX = contentLeft;
    const rowValues = ["1", description, formatMoney(amountTotal), formatMoney(concessionAmount), formatMoney(amountPaid), formatMoney(rowBalance)];
    for (let i = 0; i < colWidths.length; i += 1) {
      const align = i === 1 ? "left" : "center";
      const textX = colX + (align === "left" ? 4 : 0);
      const maxWidth = colWidths[i] - (align === "left" ? 8 : 4);
      const lines = i === 1 ? wrapText(rowValues[i], maxWidth, font, 9) : [rowValues[i]];
      lines.forEach((line, idx) => drawAlignedText(page, line, textX, rowY - idx * 10, maxWidth, align, 9, font, text));
      colX += colWidths[i];
    }

    const totalRowY = tableTop - rowHeight * 2 - 18;
    colX = contentLeft;
    const totalValues = ["", "Total", formatMoney(amountTotal), formatMoney(concessionAmount), formatMoney(amountPaid), formatMoney(rowBalance)];
    for (let i = 0; i < colWidths.length; i += 1) {
      if (totalValues[i]) drawAlignedText(page, totalValues[i], colX, totalRowY, colWidths[i], "center", 9, fontBold, text);
      colX += colWidths[i];
    }

    const balanceBoxY = tableTop - totalTableHeight - 24;
    page.drawRectangle({ x: contentLeft, y: balanceBoxY, width: contentWidth, height: 22, borderColor: border, borderWidth: 1 });
    drawAlignedText(page, "Total Fee Balance:", contentLeft + 6, balanceBoxY + 7, contentWidth - 80, "right", 9.5, fontBold, text);
    drawAlignedText(page, formatMoney(Number(invoice.balance_due || 0)), contentRight - 70, balanceBoxY + 7, 64, "right", 9.5, fontBold, text);

    const modeY = balanceBoxY - 26;
    const modeCols = [140, 170, 90, contentWidth - 400];
    page.drawRectangle({ x: contentLeft, y: modeY, width: contentWidth, height: 22, borderColor: border, borderWidth: 1 });
    let modeX = contentLeft;
    page.drawLine({ start: { x: modeX + modeCols[0], y: modeY }, end: { x: modeX + modeCols[0], y: modeY + 22 }, thickness: 0.8, color: border });
    page.drawLine({ start: { x: modeX + modeCols[0] + modeCols[1], y: modeY }, end: { x: modeX + modeCols[0] + modeCols[1], y: modeY + 22 }, thickness: 0.8, color: border });
    page.drawLine({ start: { x: modeX + modeCols[0] + modeCols[1] + modeCols[2], y: modeY }, end: { x: modeX + modeCols[0] + modeCols[1] + modeCols[2], y: modeY + 22 }, thickness: 0.8, color: border });
    const isOnline = Boolean(invoice.payment_id || invoice.order_id);
    const paymentMode = String(invoice.payment_mode || (isOnline ? "ONLINE" : "OFFLINE")).toUpperCase();
    const bankNameValue = invoice.bank_name || (paymentMode === "CASH" ? "Cash" : (isOnline ? "Razorpay" : "NA"));
    const txnUtrValue = invoice.txn_utr_no || invoice.payment_id || "NA";
    const bankRefValue = invoice.bank_ref_no || invoice.order_id || "NA";
    const txnTypeValue = invoice.transaction_type || (paymentMode || (isOnline ? "ONLINE" : "OFFLINE"));
    drawAlignedText(page, "Payment Mode:", modeX + 6, modeY + 7, modeCols[0] - 12, "left", 9, fontBold, text);
    drawAlignedText(page, paymentMode, modeX + modeCols[0], modeY + 7, modeCols[1], "center", 9, fontBold, text);
    drawAlignedText(page, "Discount:", modeX + modeCols[0] + modeCols[1] + 6, modeY + 7, modeCols[2] - 12, "left", 9, fontBold, text);
    drawAlignedText(page, formatMoney(concessionAmount), modeX + modeCols[0] + modeCols[1] + modeCols[2], modeY + 7, modeCols[3], "center", 9, fontBold, text);

    const detailsTop = modeY - 76;
    page.drawRectangle({ x: contentLeft, y: detailsTop, width: contentWidth, height: 66, borderColor: border, borderWidth: 1 });
    drawCenteredText(page, "Payment Details", detailsTop + 50, 10, fontBold, text, contentLeft, contentWidth);
    page.drawLine({ start: { x: contentLeft, y: detailsTop + 44 }, end: { x: contentRight, y: detailsTop + 44 }, thickness: 0.8, color: border });
    page.drawLine({ start: { x: contentLeft, y: detailsTop + 22 }, end: { x: contentRight, y: detailsTop + 22 }, thickness: 0.8, color: border });

    drawAlignedText(page, "Bank Name:", contentLeft + 6, detailsTop + 30, 114, "left", 9, fontBold, text);
    drawAlignedText(page, bankNameValue || "NA", contentLeft + 120, detailsTop + 30, 150, "center", 9, font, text);
    drawAlignedText(page, "Txn / UTR No:", contentLeft + 276, detailsTop + 30, 104, "left", 9, fontBold, text);
    drawAlignedText(page, txnUtrValue || "NA", contentLeft + 380, detailsTop + 30, 131, "center", 9, font, text);

    drawAlignedText(page, "Bank Ref No:", contentLeft + 6, detailsTop + 8, 114, "left", 9, fontBold, text);
    drawAlignedText(page, bankRefValue || "NA", contentLeft + 120, detailsTop + 8, 150, "center", 9, font, text);
    drawAlignedText(page, "Transaction Type:", contentLeft + 276, detailsTop + 8, 104, "left", 9, fontBold, text);
    drawAlignedText(page, txnTypeValue || "NA", contentLeft + 380, detailsTop + 8, 131, "center", 9, font, text);

    const wordsY = detailsTop - 26;
    page.drawRectangle({ x: contentLeft, y: wordsY, width: contentWidth, height: 22, borderColor: border, borderWidth: 1 });
    drawAlignedText(page, "In Words (Rs):", contentLeft + 6, wordsY + 7, 110, "left", 9, fontBold, text);
    const wordsLine = wrapText(amountToWords(amountPaid), contentWidth - 130, font, 9)[0];
    drawAlignedText(page, wordsLine, contentLeft + 120, wordsY + 7, contentWidth - 130, "left", 9, font, text);

    const remarksY = wordsY - 26;
    page.drawRectangle({ x: contentLeft, y: remarksY, width: contentWidth, height: 22, borderColor: border, borderWidth: 1 });
    drawAlignedText(page, "Remarks:", contentLeft + 6, remarksY + 7, 90, "left", 9, fontBold, text);
    const remarksLine = wrapText(invoice.remarks || "-", contentWidth - 110, font, 9)[0];
    drawAlignedText(page, remarksLine, contentLeft + 100, remarksY + 7, contentWidth - 110, "left", 9, font, text);

    page.drawText("Note: All payments are non-refundable. Cheque payments are subject to realisation.", { x: contentLeft, y: remarksY - 28, size: 9, font, color: dim });
    page.drawText("This is a computer generated receipt. Hence no signature is required.", { x: contentLeft, y: remarksY - 40, size: 9, font, color: dim });
    drawAlignedText(page, "Cashier", contentLeft, 60, contentWidth, "right", 9.5, fontBold, text);
  };

  drawReceiptPage("Student Copy");
  drawReceiptPage("Office Copy");

  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${invoice.invoice_no || "invoice"}.pdf`;
  link.click();
  URL.revokeObjectURL(link.href);
}

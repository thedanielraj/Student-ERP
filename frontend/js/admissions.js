import { API } from "./config.js";
import { state } from "./state.js";
import { authFetch } from "./api-client.js";
import { handleApiError } from "./errors.js";
import {
  getTodayIso,
  formatDateDDMMYYYY,
  formatDateTime,
  readFileAsBytes,
  bytesToBase64,
  value
} from "./utils.js";

export function addAcademicRow() {
  const container = document.getElementById("academicRows");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "academic-row";
  row.innerHTML = `
    <input class="academic-qualification" placeholder="Qualification" />
    <input class="academic-year" placeholder="Year Of Passing" />
    <input class="academic-institution" placeholder="University / Institution" />
    <input class="academic-percentage" placeholder="Percentage" />
    <button type="button" class="btn" onclick="this.parentElement.remove()">Remove</button>
  `;
  container.appendChild(row);
}

function validateAdmissionForm(values) {
  const requiredFields = [
    ["First name", values.firstName],
    ["Last name", values.lastName],
    ["Mobile number", values.phone],
    ["Email", values.email],
    ["Blood group", values.bloodGroup],
    ["Age", values.age],
    ["Date of birth", values.dob],
    ["Aadhaar number", values.aadhaarNumber],
    ["Nationality", values.nationality],
    ["Course", values.course],
    ["Father name", values.fatherName],
    ["Father mobile", values.fatherPhone],
    ["Father occupation", values.fatherOccupation],
    ["Mother name", values.motherName],
    ["Mother mobile", values.motherPhone],
    ["Mother occupation", values.motherOccupation],
    ["Correspondence address", values.correspondenceAddress],
    ["Permanent address", values.permanentAddress],
  ];
  const missing = requiredFields.filter(([, val]) => !val);
  if (missing.length) {
    alert(`Please fill: ${missing.map(([label]) => label).join(", ")}.`);
    return false;
  }
  if (!/^\d{10}$/.test(values.phone)) {
    alert("Enter a valid 10 digit mobile number.");
    return false;
  }
  if (!/^\d{10}$/.test(values.fatherPhone) || !/^\d{10}$/.test(values.motherPhone)) {
    alert("Enter valid 10 digit parent mobile numbers.");
    return false;
  }
  if (!/^\d{12}$/.test(values.aadhaarNumber)) {
    alert("Enter a valid 12 digit Aadhaar number.");
    return false;
  }
  return true;
}

export async function submitAdmissionForm() {
  const firstName = value("admissionFirstName");
  const middleName = value("admissionMiddleName");
  const lastName = value("admissionLastName");
  const phone = value("admissionPhone");
  const email = value("admissionEmail");
  const bloodGroup = value("admissionBloodGroup");
  const age = Number(value("admissionAge") || 0);
  const dob = value("admissionDob");
  const aadhaarNumber = value("admissionAadhaar");
  const nationality = value("admissionNationality");
  const course = value("admissionCourse");
  const fatherName = value("fatherName");
  const fatherPhone = value("fatherPhone");
  const fatherOccupation = value("fatherOccupation");
  const fatherEmail = value("fatherEmail");
  const motherName = value("motherName");
  const motherPhone = value("motherPhone");
  const motherOccupation = value("motherOccupation");
  const motherEmail = value("motherEmail");
  const correspondenceAddress = value("correspondenceAddress");
  const permanentAddress = value("permanentAddress");
  const academicDetails = Array.from(document.querySelectorAll(".academic-row"))
    .map((row) => ({
      qualification: (row.querySelector(".academic-qualification")?.value || "").trim(),
      year_of_passing: (row.querySelector(".academic-year")?.value || "").trim(),
      institution: (row.querySelector(".academic-institution")?.value || "").trim(),
      percentage: (row.querySelector(".academic-percentage")?.value || "").trim(),
    }))
    .filter((r) => r.qualification || r.year_of_passing || r.institution || r.percentage);

  if (!validateAdmissionForm({
    firstName,
    lastName,
    phone,
    email,
    bloodGroup,
    age,
    dob,
    aadhaarNumber,
    nationality,
    course,
    fatherName,
    fatherPhone,
    fatherOccupation,
    motherName,
    motherPhone,
    motherOccupation,
    correspondenceAddress,
    permanentAddress,
  })) {
    return;
  }

  const payload = {
    first_name: firstName,
    middle_name: middleName,
    last_name: lastName,
    phone,
    email,
    blood_group: bloodGroup,
    age,
    dob,
    aadhaar_number: aadhaarNumber,
    nationality,
    father_name: fatherName,
    father_phone: fatherPhone,
    father_occupation: fatherOccupation,
    father_email: fatherEmail,
    mother_name: motherName,
    mother_phone: motherPhone,
    mother_occupation: motherOccupation,
    mother_email: motherEmail,
    correspondence_address: correspondenceAddress,
    permanent_address: permanentAddress,
    course,
    academic_details: academicDetails,
  };

  try {
    const photoFile = document.getElementById("admissionPhoto")?.files?.[0] || null;
    let photoBytes = null;
    if (photoFile) {
      photoBytes = await readFileAsBytes(photoFile);
      if (photoBytes && photoBytes.length > 1024 * 1024) {
        throw new Error("Admission photo must be less than 1 MB.");
      }
      payload.admission_photo_base64 = photoBytes ? bytesToBase64(photoBytes) : "";
      payload.admission_photo_filename = photoFile.name || "photo.jpg";
      payload.admission_photo_type = photoFile.type || "image/jpeg";
    }

    if (window.generateAdmissionPdfAttachment) {
      const pdfAttachment = await window.generateAdmissionPdfAttachment({
        ...payload,
        admission_photo_bytes: photoBytes,
      });
      if (pdfAttachment) {
        payload.admission_pdf_base64 = pdfAttachment.base64;
        payload.admission_pdf_filename = pdfAttachment.filename;
        if (window.triggerPdfDownload) window.triggerPdfDownload(pdfAttachment.bytes, pdfAttachment.filename);
      }
    }

    const res = await fetch(`${API}/admissions/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to submit admission form.");
    }

    // Reset form
    ["admissionFirstName", "admissionMiddleName", "admissionLastName", "admissionPhone", "admissionEmail",
     "admissionBloodGroup", "admissionAge", "admissionDob", "admissionAadhaar", "admissionNationality",
     "admissionCourse", "admissionPhoto", "fatherName", "fatherPhone", "fatherOccupation", "fatherEmail",
     "motherName", "motherPhone", "motherOccupation", "motherEmail", "correspondenceAddress", "permanentAddress"]
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const academicRows = document.getElementById("academicRows");
    if (academicRows) academicRows.innerHTML = "";
    addAcademicRow();
    alert("Admission form submitted successfully.");
  } catch (e) {
    alert(e.message || "Failed to submit admission form.");
  }
}

export async function loadAdmissions() {
  const body = document.getElementById("admissionsBody");
  if (!body) return;
  const res = await authFetch(`${API}/admissions`);
  if (!res.ok) {
    body.innerHTML = `<tr><td colspan="8" class="empty">Failed to load admissions</td></tr>`;
    return;
  }
  const rows = await res.json();
  state.admissionsCache = Array.isArray(rows) ? rows : [];
  body.innerHTML = "";
  if (!state.admissionsCache.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty">No admissions found</td></tr>`;
    return;
  }
  state.admissionsCache.forEach((r) => {
    const tr = document.createElement("tr");
    const hasPdf = Boolean(r.pdf_available);
    tr.innerHTML = `
      <td>${r.admission_id || "-"}</td>
      <td>${r.full_name || "-"}</td>
      <td>${r.course || "-"}</td>
      <td>${r.phone || "-"}</td>
      <td>${r.email || "-"}</td>
      <td>${formatDateTime(r.created_at || "")}</td>
      <td>${hasPdf ? `<button class="btn" data-id="${r.admission_id}">View PDF</button>` : "-"}</td>
      <td>
        <button class="btn" data-delete-id="${r.admission_id}">Delete</button>
        <button class="btn" data-id-card="${r.admission_id}">ID Card</button>
        <button class="btn" data-cert="${r.admission_id}">Certificate</button>
      </td>
    `;
    tr.querySelector("button[data-id]")?.addEventListener("click", async () => {
      await openAdmissionPdf(Number(r.admission_id));
    });
    tr.querySelector("button[data-delete-id]")?.addEventListener("click", async () => {
      await deleteAdmission(Number(r.admission_id), r.full_name || "");
    });
    tr.querySelector("button[data-id-card]")?.addEventListener("click", async () => {
      if (window.generateIdCardPdf) await window.generateIdCardPdf(r);
    });
    tr.querySelector("button[data-cert]")?.addEventListener("click", async () => {
      if (window.generateCertificatePdf) await window.generateCertificatePdf(r);
    });
    body.appendChild(tr);
  });
}

export async function openAdmissionPdf(admissionId) {
  if (!admissionId) return;
  const res = await authFetch(`${API}/admissions/${admissionId}/pdf`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Unable to open admission PDF.");
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

export async function deleteAdmission(admissionId, fullName) {
  if (!admissionId) return;
  if (!confirm(`Delete admission #${admissionId}${fullName ? ` (${fullName})` : ""}?`)) return;
  const res = await authFetch(`${API}/admissions/${admissionId}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Unable to delete admission.");
    return;
  }
  await Promise.all([loadAdmissions(), window.loadActivityLogs ? window.loadActivityLogs() : null]);
}

export async function regenerateAdmissionPdfs() {
  if (!state.admissionsCache.length) {
    alert("No admissions loaded yet. Click Refresh first.");
    return;
  }
  if (!confirm(`Regenerate PDFs for ${state.admissionsCache.length} admission(s)? This will overwrite stored PDFs.`)) {
    return;
  }
  for (const r of state.admissionsCache) {
    const admissionId = Number(r.admission_id || 0);
    if (!admissionId) continue;

    // Parse academic details
    let academic = [];
    if (r.academic_details_json) {
      try { academic = JSON.parse(r.academic_details_json); } catch(_) {}
    }

    const payload = {
      first_name: r.first_name || "",
      middle_name: r.middle_name || "",
      last_name: r.last_name || "",
      phone: r.phone || "",
      email: r.email || "",
      blood_group: r.blood_group || "",
      age: Number(r.age || 0),
      dob: r.dob || "",
      aadhaar_number: r.aadhaar_number || "",
      nationality: r.nationality || "",
      course: r.course || "",
      father_name: r.father_name || "",
      father_phone: r.father_phone || "",
      father_occupation: r.father_occupation || "",
      father_email: r.father_email || "",
      mother_name: r.mother_name || "",
      mother_phone: r.mother_phone || "",
      mother_occupation: r.mother_occupation || "",
      mother_email: r.mother_email || "",
      correspondence_address: r.correspondence_address || "",
      permanent_address: r.permanent_address || "",
      academic_details: academic,
    };

    let photoBytes = null;
    if (r.photo_available) {
      const photoRes = await authFetch(`${API}/admissions/${admissionId}/photo`);
      if (photoRes.ok) {
        const buf = await photoRes.arrayBuffer();
        photoBytes = new Uint8Array(buf);
        payload.admission_photo_type = photoRes.headers.get("content-type") || "image/jpeg";
      }
    }

    if (window.generateAdmissionPdfAttachment) {
      const pdfAttachment = await window.generateAdmissionPdfAttachment({
        ...payload,
        admission_photo_bytes: photoBytes,
      });
      if (pdfAttachment) {
        await authFetch(`${API}/admissions/${admissionId}/pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            admission_pdf_base64: pdfAttachment.base64,
            admission_pdf_filename: pdfAttachment.filename,
          }),
        });
      }
    }
  }
  await loadAdmissions();
  alert("Admission PDFs regenerated.");
}

export function showAdmissionForm() {
  if (window.setSidebarOpen) window.setSidebarOpen("home", false);
  const admission = document.getElementById("homeAdmission");
  const welcome = document.getElementById("homeWelcome");
  admission?.classList.remove("hidden");
  if (admission && welcome && welcome.parentElement === admission.parentElement && welcome.nextElementSibling !== admission) {
    welcome.insertAdjacentElement("afterend", admission);
  }
  admission?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (!document.querySelectorAll(".academic-row").length) {
    addAcademicRow();
  }
}

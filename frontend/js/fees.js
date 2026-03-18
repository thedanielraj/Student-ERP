import { API } from "./config.js";
import { state } from "./state.js";
import { authFetch } from "./api-client.js";
import {
  formatMoney,
  formatDateDDMMYYYY,
  getTodayIso,
  downloadCsv,
  setText
} from "./utils.js";

export async function loadRecentFees() {
  const body = document.getElementById("recentFeesBody");
  if (!body) return;
  const res = await authFetch(`${API}/fees/recent`);
  const rows = await res.json();
  body.innerHTML = "";

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty">No fee entries</td></tr>`;
    return;
  }

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>#${r.fee_id}</td>
      <td>${r.student_id}</td>
      <td>${formatMoney(r.amount_total)}</td>
      <td>${formatMoney(r.amount_paid)}</td>
      <td>${r.due_date || "-"}</td>
      <td>${r.remarks || ""}</td>
    `;
    body.appendChild(tr);
  });
}

export async function loadFees(studentId) {
  const res = await authFetch(`${API}/students/${encodeURIComponent(studentId)}/fees`);
  const rows = await res.json();
  const body = document.getElementById("feesBody");
  if (!body) return;
  body.innerHTML = "";

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty">No fee entries</td></tr>`;
    return;
  }

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>#${r.fee_id}</td>
      <td>${formatMoney(r.amount_total)}</td>
      <td>${formatMoney(r.amount_paid)}</td>
      <td>${r.due_date || "-"}</td>
      <td>${r.remarks || ""}</td>
      <td><button class="btn" onclick="openFeeInvoicePdf(${Number(r.fee_id)})">Invoice PDF</button></td>
    `;
    body.appendChild(tr);
  });
}

export function renderFeesEntryList() {
  if (state.authInfo && state.authInfo.role === "student") return;
  const body = document.getElementById("feeEntryBody");
  if (!body) return;
  body.innerHTML = "";

  if (!state.allStudents.length) {
    body.innerHTML = `<tr><td colspan="14" class="empty">No students found</td></tr>`;
    return;
  }

  state.allStudents.forEach(s => {
    const policy = state.feePoliciesByStudent[String(s.student_id)] || {};
    const totalAmount = 150000;
    const totalDisplay = "INR 1.5L";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.student_name} (ID: ${s.student_id})</td>
      <td>${s.batch}</td>
      <td>
        <span class="fee-total-label">${totalDisplay}</span>
        <input class="fee-input" id="fee-total-${s.student_id}" type="number" min="0" step="0.01" value="${totalAmount}" hidden />
      </td>
      <td><input class="fee-input" id="fee-paid-${s.student_id}" type="number" min="0" step="0.01" placeholder="Paid" /></td>
      <td><input id="fee-receipt-${s.student_id}" type="file" /></td>
      <td><input class="fee-input" id="fee-remarks-${s.student_id}" placeholder="Remarks" /></td>
      <td>
        <select class="fee-input" id="fee-paymode-${s.student_id}">
          <option value="OFFLINE">OFFLINE</option>
          <option value="CASH">CASH</option>
          <option value="ONLINE">ONLINE</option>
        </select>
      </td>
      <td><input class="fee-input" id="fee-bank-${s.student_id}" placeholder="Bank / Cash" /></td>
      <td><input class="fee-input" id="fee-utr-${s.student_id}" placeholder="Txn / UTR" /></td>
      <td><input class="fee-input" id="fee-bankref-${s.student_id}" placeholder="Bank Ref" /></td>
      <td><input class="fee-input" id="fee-txtype-${s.student_id}" placeholder="Txn Type" /></td>
      <td><input class="fee-input" id="fee-concession-${s.student_id}" type="number" min="0" step="0.01" placeholder="Concession" value="${Number(policy.concession_amount || 0)}" /></td>
      <td><input id="fee-deadline-${s.student_id}" type="date" value="${policy.due_date || ""}" /></td>
      <td>
        <button class="btn" data-action="record" data-id="${s.student_id}">Record</button>
        <button class="btn" data-action="record-invoice" data-id="${s.student_id}">Record + Invoice</button>
        <button class="btn" data-action="save" data-id="${s.student_id}">Save Policy</button>
      </td>
    `;
    tr.querySelector('[data-action="record"]')?.addEventListener("click", () => recordFee(s.student_id, false));
    tr.querySelector('[data-action="record-invoice"]')?.addEventListener("click", () => recordFee(s.student_id, true));
    tr.querySelector('[data-action="save"]')?.addEventListener("click", () => saveFeePolicy(s.student_id));
    body.appendChild(tr);
  });
}

export async function recordFee(studentId, generateInvoice = false) {
  const totalEl = document.getElementById(`fee-total-${studentId}`);
  const paidEl = document.getElementById(`fee-paid-${studentId}`);
  const remarksEl = document.getElementById(`fee-remarks-${studentId}`);
  const receiptEl = document.getElementById(`fee-receipt-${studentId}`);
  const payModeEl = document.getElementById(`fee-paymode-${studentId}`);
  const bankEl = document.getElementById(`fee-bank-${studentId}`);
  const utrEl = document.getElementById(`fee-utr-${studentId}`);
  const bankRefEl = document.getElementById(`fee-bankref-${studentId}`);
  const txnTypeEl = document.getElementById(`fee-txtype-${studentId}`);

  const amountPaid = Number(paidEl?.value || 0);
  if (!amountPaid || amountPaid <= 0) {
    alert("Enter amount paid.");
    return;
  }
  const amountTotal = totalEl?.value ? Number(totalEl.value) : amountPaid;

  const form = new FormData();
  form.append("student_id", String(studentId));
  form.append("amount_paid", String(amountPaid));
  form.append("amount_total", String(amountTotal));
  form.append("remarks", remarksEl?.value || "");
  form.append("payment_mode", String(payModeEl?.value || ""));
  form.append("bank_name", String(bankEl?.value || ""));
  form.append("txn_utr_no", String(utrEl?.value || ""));
  form.append("bank_ref_no", String(bankRefEl?.value || ""));
  form.append("transaction_type", String(txnTypeEl?.value || ""));
  if (receiptEl?.files?.[0]) {
    form.append("receipt", receiptEl.files[0]);
  }

  const res = await authFetch(`${API}/fees/record`, {
    method: "POST",
    body: form
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Failed to record fee.");
    return;
  }
  const data = await res.json().catch(() => ({}));

  if (totalEl) totalEl.value = "";
  if (paidEl) paidEl.value = "";
  if (remarksEl) remarksEl.value = "";
  if (receiptEl) receiptEl.value = "";
  if (payModeEl) payModeEl.value = "OFFLINE";
  if (bankEl) bankEl.value = "";
  if (utrEl) utrEl.value = "";
  if (bankRefEl) bankRefEl.value = "";
  if (txnTypeEl) txnTypeEl.value = "";
  if (generateInvoice) {
    const feeId = Number(data.fee_id || 0);
    if (feeId) {
      await openFeeInvoicePdf(feeId);
    } else {
      alert("Fee recorded, but invoice could not be generated (missing fee ID).");
    }
  } else {
    alert("Fee recorded.");
  }
}

export async function saveFeePolicy(studentId) {
  const concessionEl = document.getElementById(`fee-concession-${studentId}`);
  const deadlineEl = document.getElementById(`fee-deadline-${studentId}`);
  const concession = Math.max(Number(concessionEl?.value || 0), 0);
  const dueDate = String(deadlineEl?.value || "").trim();

  const res = await authFetch(`${API}/fees/admin/policy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      student_id: String(studentId),
      concession_amount: concession,
      due_date: dueDate || null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Failed to update fee policy.");
    return;
  }
  const data = await res.json().catch(() => ({}));
  state.feePoliciesByStudent[String(studentId)] = {
    concession_amount: Number(data.concession_amount || concession),
    due_date: data.due_date || dueDate || "",
  };
  await Promise.all([loadFeeSummary(), window.loadStudentFeeSummary ? window.loadStudentFeeSummary() : null]);
  alert("Fee concession/deadline updated.");
}

export async function resetFeesToUnpaid() {
  if (!confirm("This will reset all students to 100% unpaid and clear paid history. Continue?")) return;
  const res = await authFetch(`${API}/fees/admin/reset-unpaid`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Failed to reset fees.");
    return;
  }
  const data = await res.json().catch(() => ({}));
  await Promise.all([
    loadRecentFees(),
    loadFeeSummary(),
    window.loadStudents ? window.loadStudents() : null,
    loadFeePolicies()
  ]);
  renderFeesEntryList();
  alert(data.message || "Fees reset to unpaid.");
}

export async function loadFeePolicies() {
  if (!state.authInfo || state.authInfo.role === "student") return;
  const res = await authFetch(`${API}/fees/admin/policies`);
  if (!res.ok) return;
  const rows = await res.json().catch(() => []);
  const map = {};
  (rows || []).forEach((r) => {
    const sid = String(r.student_id || "");
    if (!sid) return;
    map[sid] = {
      concession_amount: Number(r.concession_amount || 0),
      due_date: r.due_date || "",
    };
  });
  state.feePoliciesByStudent = map;
  renderFeesEntryList();
}

export async function loadFeeSummary() {
  const res = await authFetch(`${API}/fees/summary`);
  if (!res.ok) return;
  const data = await res.json();
  const total = document.getElementById("feeSummaryTotal");
  const due = document.getElementById("feeSummaryDue");
  const txns = document.getElementById("feeSummaryTransactions");
  if (total) total.textContent = formatMoney(data.total);
  if (due) due.textContent = formatMoney(data.due);
  if (txns) txns.textContent = String(data.transactions ?? 0);

  const gatewayRes = await authFetch(`${API}/payments/gateway-status`);
  if (gatewayRes.ok) {
    const gateway = await gatewayRes.json();
    const gatewayEl = document.getElementById("paymentGatewayInfo");
    if (gatewayEl) gatewayEl.textContent = `Payment gateway: ${gateway.message}`;
    state.razorpayKeyId = gateway.key_id || null;
  }
}

export async function openFeeInvoicePdf(feeId) {
  const id = Number(feeId || 0);
  if (!id) {
    alert("Invalid fee entry.");
    return;
  }
  const res = await authFetch(`${API}/fees/${id}/invoice`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Unable to load invoice.");
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (!data.invoice) {
    alert("Invoice data not found.");
    return;
  }
  if (window.downloadInvoicePdf) await window.downloadInvoicePdf(data.invoice);
}

export async function loadStudentFeeSummary() {
  if (!state.authInfo || state.authInfo.role !== "student") return;
  const res = await authFetch(`${API}/students/${encodeURIComponent(state.authInfo.user)}/balance`);
  if (!res.ok) return;
  const data = await res.json();
  state.studentFeeSummary = data;
  const remaining = Number(data.balance || 0);
  const el = document.getElementById("studentFeeRemaining");
  if (el) {
    el.textContent = formatMoney(remaining);
  }
  setText("studentFeeCourse", data.course || "-");
  setText("studentFeeTotal", formatMoney(data.total));
  setText("studentFeePaid", formatMoney(data.paid));
  setText("studentFeeConcession", formatMoney(data.concession_amount || 0));
  setText("studentFeeDeadline", data.due_date ? formatDateDDMMYYYY(data.due_date) : "-");
  const installmentEl = document.getElementById("studentInstallmentAmount");
  if (installmentEl && !installmentEl.value) {
    installmentEl.value = remaining > 0 ? String(Number(remaining.toFixed(2))) : "";
  }

  const gatewayRes = await authFetch(`${API}/payments/gateway-status`);
  if (gatewayRes.ok) {
    const gateway = await gatewayRes.json();
    state.razorpayKeyId = gateway.key_id || null;
    const statusEl = document.getElementById("studentGatewayStatus");
    const payBtn = document.getElementById("payNowBtn");
    if (statusEl) {
      statusEl.textContent = gateway.enabled
        ? "Secure payments powered by Razorpay."
        : "Payment gateway is currently unavailable.";
    }
    if (payBtn) {
      payBtn.classList.toggle("hidden", !(gateway.enabled && remaining > 0));
    }
  }
}

export async function payNowRazorpay() {
  if (!state.authInfo || state.authInfo.role !== "student") return;
  const dueAmount = Number(state.studentFeeSummary?.balance || 0);
  if (!state.studentFeeSummary || dueAmount <= 0) {
    alert("No due amount to pay.");
    return;
  }
  if (!state.razorpayKeyId || typeof Razorpay === "undefined") {
    alert("Razorpay is not available right now.");
    return;
  }
  const installmentEl = document.getElementById("studentInstallmentAmount");
  const requestedInstallment = Number(installmentEl?.value || 0);
  const amountToPay = requestedInstallment > 0 ? requestedInstallment : dueAmount;
  if (amountToPay <= 0) {
    alert("Enter installment amount.");
    return;
  }
  if (amountToPay > dueAmount) {
    alert("Installment amount cannot be more than remaining balance.");
    return;
  }

  const orderRes = await authFetch(`${API}/payments/razorpay/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student_id: state.authInfo.user, amount_inr: amountToPay })
  });
  if (!orderRes.ok) {
    const err = await orderRes.json().catch(() => ({}));
    alert(err.detail || "Failed to create payment order.");
    return;
  }
  const orderData = await orderRes.json();
  const order = orderData.order || {};

  const options = {
    key: orderData.key_id,
    amount: order.amount,
    currency: order.currency || "INR",
    name: "Arunand's Aviation Institute",
    description: "Fee Payment",
    order_id: order.id,
    prefill: {
      name: state.authInfo.student_name || state.authInfo.first_name || "Student",
    },
    notes: order.notes || {},
    handler: async function (response) {
      const verifyRes = await authFetch(`${API}/payments/razorpay/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: state.authInfo.user,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_signature: response.razorpay_signature,
          amount_paid_inr: (order.amount || 0) / 100
        })
      });
      if (!verifyRes.ok) {
        const err = await verifyRes.json().catch(() => ({}));
        alert(err.detail || "Payment verification failed.");
        return;
      }
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (verifyData.invoice && window.downloadInvoicePdf) {
        await window.downloadInvoicePdf(verifyData.invoice);
      }
      alert("Payment successful and recorded.");
      const installmentInput = document.getElementById("studentInstallmentAmount");
      if (installmentInput) installmentInput.value = "";
      await loadStudentFeeSummary();
      await loadFeeSummary();
      await loadRecentFees();
    },
    theme: { color: "#0f5ea9" }
  };

  const rzp = new Razorpay(options);
  rzp.open();
}

export async function sendFeeReminders() {
  if (!confirm("Send fee reminders to students with upcoming due dates?")) return;
  const res = await authFetch(`${API}/fees/reminders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ days: 7 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Failed to send reminders.");
    return;
  }
  const data = await res.json().catch(() => ({}));
  alert(`Reminders sent: ${data.sent || 0}`);
}

export function exportFeesCsv() {
  const body = document.getElementById("feeEntryBody");
  if (!body) return;
  const rows = Array.from(body.querySelectorAll("tr"));
  if (!rows.length || rows[0].querySelector(".empty")) {
    alert("No fee data to export.");
    return;
  }
  const headers = ["Student", "Batch", "Total Fee", "Paid", "Remarks", "Concession", "Deadline"];
  const data = rows.map((row) => {
    const cells = Array.from(row.children);
    const student = String(cells[0]?.textContent || "").trim();
    const batch = String(cells[1]?.textContent || "").trim();
    const total = "150000";
    const paid = String(cells[3]?.querySelector("input")?.value || "").trim();
    const remarks = String(cells[5]?.querySelector("input")?.value || "").trim();
    const concession = String(cells[6]?.querySelector("input")?.value || "").trim();
    const deadline = String(cells[7]?.querySelector("input")?.value || "").trim();
    return [student, batch, total, paid, remarks, concession, deadline];
  });
  downloadCsv(headers, data, `fees_${getTodayIso()}.csv`);
}

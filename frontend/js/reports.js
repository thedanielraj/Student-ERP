import { API } from "./config.js";
import { authFetch } from "./api-client.js";
import { formatMoney, getTodayIso, downloadCsv } from "./utils.js";

export async function loadReports() {
  const res = await authFetch(`${API}/reports/summary`);
  const data = await res.json();

  const students = document.getElementById("reportStudents");
  const feesTotal = document.getElementById("reportFeesTotal");
  const feesPaid = document.getElementById("reportFeesPaid");
  const feesBalance = document.getElementById("reportBalance");
  const present = document.getElementById("reportPresent");
  const absent = document.getElementById("reportAbsent");

  if (students) students.textContent = data.students ?? "-";
  if (feesTotal) feesTotal.textContent = formatMoney(data.fees_total);
  if (feesPaid) feesPaid.textContent = formatMoney(data.fees_paid);
  if (feesBalance) feesBalance.textContent = formatMoney(data.fees_balance);
  if (present) present.textContent = data.attendance_present ?? "-";
  if (absent) absent.textContent = data.attendance_absent ?? "-";
}

export function exportReportsCsv() {
  const rows = [
    ["Students", document.getElementById("reportStudents")?.textContent || ""],
    ["Fees Total", document.getElementById("reportFeesTotal")?.textContent || ""],
    ["Fees Paid", document.getElementById("reportFeesPaid")?.textContent || ""],
    ["Balance Due", document.getElementById("reportBalance")?.textContent || ""],
    ["Present", document.getElementById("reportPresent")?.textContent || ""],
    ["Absent", document.getElementById("reportAbsent")?.textContent || ""],
  ];
  downloadCsv(["Metric", "Value"], rows, `reports_${getTodayIso()}.csv`);
}

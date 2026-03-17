import { state } from "./state.js";
import { API, TOKEN_KEY } from "./config.js";
import { authFetch } from "./api-client.js";
import * as auth from "./auth.js";
import * as students from "./students.js";
import * as attendance from "./attendance.js";
import * as fees from "./fees.js";
import * as tests from "./tests.js";
import * as chatbot from "./chatbot.js";
import * as pdf from "./pdf.js";
import * as admissions from "./admissions.js";
import * as content from "./content.js";
import * as leads from "./leads.js";
import * as reports from "./reports.js";
import * as activity from "./activity.js";
import * as parent from "./parent.js";
import * as ui from "./ui.js";

const allModules = {
  ...auth,
  ...students,
  ...attendance,
  ...fees,
  ...tests,
  ...chatbot,
  ...pdf,
  ...admissions,
  ...content,
  ...leads,
  ...reports,
  ...activity,
  ...parent,
  ...ui,
  state,
  API,
  TOKEN_KEY,
  authFetch
};

Object.assign(window, allModules);

// Explicitly expose functions to window if they are not already (some might be nested in the spread)
// This is a safety measure to ensure compatibility with inline HTML event handlers.
for (const [key, value] of Object.entries(allModules)) {
  if (typeof value === "function" || typeof value === "object") {
    window[key] = value;
  }
}

// Bootstrap
document.getElementById("search")?.addEventListener("input", students.renderStudentList);
if (window.populateBatchInputs) window.populateBatchInputs();
if (window.setupTabs) window.setupTabs();
if (window.setupSidebarNav) window.setupSidebarNav();
if (window.setupGlobalSearch) window.setupGlobalSearch();
if (window.registerServiceWorker) window.registerServiceWorker();
if (window.initOfflineAttendanceSync) window.initOfflineAttendanceSync();
if (window.initInstallPrompt) window.initInstallPrompt();
if (window.initSidebarUX) window.initSidebarUX();
if (window.initParentPortal) window.initParentPortal();

students.loadProudAlumni();
auth.initAuth();

window.__APP_READY__ = true;

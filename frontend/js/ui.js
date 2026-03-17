import { state } from "./state.js";
import { NATO_BATCHES } from "./config.js";

export function toggleSidebar(scope) {
  const key = scope === "home" ? "homeSidebarOpen" : "appSidebarOpen";
  const hamburger = document.querySelector(scope === "home" ? ".home-hamburger" : ".app-hamburger");
  const sidebar = document.querySelector(scope === "home" ? ".home-sidebar" : ".sidebar");
  const isOpen = sidebar?.classList.toggle("open");
  hamburger?.classList.toggle("open", Boolean(isOpen));
  hamburger?.setAttribute("aria-expanded", isOpen ? "true" : "false");
  localStorage.setItem(key, isOpen ? "1" : "0");
}

export function setSidebarOpen(scope, open) {
  const sidebar = document.querySelector(scope === "home" ? ".home-sidebar" : ".sidebar");
  const hamburger = document.querySelector(scope === "home" ? ".home-hamburger" : ".app-hamburger");
  if (!sidebar || !hamburger) return;
  sidebar.classList.toggle("open", open);
  hamburger.classList.toggle("open", open);
  hamburger.setAttribute("aria-expanded", open ? "true" : "false");
  const key = scope === "home" ? "homeSidebarOpen" : "appSidebarOpen";
  localStorage.setItem(key, open ? "1" : "0");
}

export function setupTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.tab;
      document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
      document.getElementById(`tab-${target}`)?.classList.remove("hidden");
    });
  });
}

export function setupSidebarNav() {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const section = btn.dataset.section;
      if (section) window.switchSection(section);
    });
  });
}

export function switchSection(target) {
  if (state.authInfo && state.authInfo.role === "student") {
    const blocked = new Set(["students", "reports", "activity", "admissions", "leads"]);
    if (blocked.has(target)) {
      target = "attendance";
    }
  }
  if (state.authInfo && state.authInfo.role !== "student" && target === "profile") {
    target = "feed";
  }
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  const activeBtn = document.querySelector(`.nav-item[data-section="${target}"]`);
  if (activeBtn) {
    activeBtn.classList.add("active");
  }
  document.querySelectorAll(".section").forEach(sec => sec.classList.add("hidden"));
  const sectionEl = document.getElementById(`section-${target}`);
  if (sectionEl) {
    sectionEl.classList.remove("hidden");
  }
  if (target === "profile") {
    if (window.loadStudentProfile) window.loadStudentProfile();
  }
  localStorage.setItem("activeSection", target);

  // Call relevant loaders based on section
  const loaders = {
    attendance: () => {
      if (window.ensureAttendanceDateConstraints) window.ensureAttendanceDateConstraints();
      if (window.renderTodayAttendance) window.renderTodayAttendance();
      if (window.renderBackAttendance) window.renderBackAttendance();
      if (window.loadAttendanceCalendar) window.loadAttendanceCalendar();
    },
    fees: () => {
      if (window.loadFeePolicies) window.loadFeePolicies();
      if (window.renderFeesEntryList) window.renderFeesEntryList();
      if (window.loadFeeSummary) window.loadFeeSummary();
    },
    tests: () => { if (window.loadTests) window.loadTests(); },
    feed: () => { if (window.loadFeed) window.loadFeed(); },
    timetable: () => { if (window.loadTimetable) window.loadTimetable(); },
    interviews: () => { if (window.loadInterviews) window.loadInterviews(); },
    announcements: () => { if (window.loadAnnouncements) window.loadAnnouncements(); },
    notifications: () => { if (window.loadNotifications) window.loadNotifications(); },
    admissions: () => { if (window.loadAdmissions) window.loadAdmissions(); },
    leads: () => { if (window.loadLeads) window.loadLeads(); },
    alumni: () => { if (window.loadProudAlumni) window.loadProudAlumni(); },
    activity: () => { if (window.loadActivityLogs) window.loadActivityLogs(); },
    search: () => { if (window.runGlobalSearch) window.runGlobalSearch(document.getElementById("globalSearch")?.value || ""); }
  };

  if (loaders[target]) loaders[target]();

  if (window.matchMedia && window.matchMedia("(max-width: 1100px)").matches) {
    setSidebarOpen("app", false);
  }
}

export function initSidebarUX() {
  setSidebarOpen("home", localStorage.getItem("homeSidebarOpen") === "1");
  setSidebarOpen("app", localStorage.getItem("appSidebarOpen") === "1");

  document.addEventListener("click", (e) => {
    const target = e.target;
    const homeSidebar = document.querySelector(".home-sidebar");
    const homeHamburger = document.querySelector(".home-hamburger");
    if (homeSidebar && homeHamburger && homeSidebar.classList.contains("open")) {
      if (!homeSidebar.contains(target) && !homeHamburger.contains(target)) {
        setSidebarOpen("home", false);
      }
    }
    const appSidebar = document.querySelector(".sidebar");
    const appHamburger = document.querySelector(".app-hamburger");
    if (appSidebar && appHamburger && appSidebar.classList.contains("open")) {
      if (!appSidebar.contains(target) && !appHamburger.contains(target)) {
        setSidebarOpen("app", false);
      }
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      setSidebarOpen("home", false);
      setSidebarOpen("app", false);
      return;
    }
    const activeTag = document.activeElement?.tagName?.toLowerCase();
    const typing = activeTag === "input" || activeTag === "textarea" || document.activeElement?.isContentEditable;
    if (e.key === "/" && !typing) {
      const searchEl = document.getElementById("search");
      if (searchEl) {
        e.preventDefault();
        searchEl.focus();
      }
    }
  });
}

export function populateBatchInputs() {
  const options = [];
  NATO_BATCHES.forEach((name) => options.push(name));
  for (let cycle = 2; cycle <= 5; cycle += 1) {
    NATO_BATCHES.forEach((name) => options.push(`${name}-${cycle}`));
  }

  const datalist = document.getElementById("natoBatchList");
  if (datalist) {
    datalist.innerHTML = "";
    options.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      datalist.appendChild(option);
    });
  }
  const bulkSelect = document.getElementById("bulkBatchSelect");
  if (bulkSelect) {
    bulkSelect.innerHTML = `<option value="">Move selected to batch...</option>`;
    options.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      bulkSelect.appendChild(option);
    });
  }
}

export function showToast(message, variant = "") {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("hidden", "success");
  if (variant) toast.classList.add(variant);
  if (state.toastTimer) clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
    toast.classList.remove("success");
  }, 2600);
}

export function afterLoginInit() {
  if (window.loadStudents) window.loadStudents();
  if (window.loadRecentAttendance) window.loadRecentAttendance();
  if (window.loadFeed) window.loadFeed();
  if (window.loadTimetable) window.loadTimetable();
  if (window.loadInterviews) window.loadInterviews();
  if (window.loadAnnouncements) window.loadAnnouncements();
  if (window.loadNotifications) window.loadNotifications();
  if (window.loadTests) window.loadTests();
  if (window.loadFeeSummary) window.loadFeeSummary();
  if (state.authInfo && state.authInfo.role === "superuser") {
    if (window.loadFeePolicies) window.loadFeePolicies();
    if (window.loadRecentFees) window.loadRecentFees();
    if (window.loadReports) window.loadReports();
  } else {
    if (window.loadStudentFeeSummary) window.loadStudentFeeSummary();
  }
  if (window.initAnnouncementNotifier) window.initAnnouncementNotifier();
  const savedSection = localStorage.getItem("activeSection")
    || (state.authInfo && state.authInfo.role === "student" ? "attendance" : "feed");
  window.switchSection(savedSection);
  if (!document.querySelector("#testQuestionRows .test-question-row")) {
    if (window.addTestQuestionRow) window.addTestQuestionRow();
  }
}

export function applyRoleUI() {
  if (!state.authInfo) return;
  const isStudent = state.authInfo.role === "student";

  document.querySelectorAll(".nav-item").forEach(btn => {
    const section = btn.dataset.section;
    const studentHidden = new Set(["students", "reports", "activity", "admissions", "leads"]);
    const staffHidden = new Set(["profile"]);
    if (isStudent && studentHidden.has(section)) {
      btn.remove();
      return;
    }
    if (!isStudent && staffHidden.has(section)) {
      btn.classList.add("hidden");
      return;
    }
    btn.classList.remove("hidden");
  });

  const welcomePanel = document.getElementById("studentWelcomePanel");
  const welcomeTitle = document.getElementById("studentWelcomeTitle");
  const staffWelcomePanel = document.getElementById("staffWelcomePanel");
  const staffWelcomeTitle = document.getElementById("staffWelcomeTitle");
  if (welcomePanel && welcomeTitle) {
    if (isStudent) {
      const name = state.authInfo.first_name || state.authInfo.user || "Student";
      welcomeTitle.textContent = `Hello ${name}`;
      welcomePanel.classList.remove("hidden");
    } else {
      welcomePanel.classList.add("hidden");
    }
  }
  if (staffWelcomePanel && staffWelcomeTitle) {
    const username = String(state.authInfo?.user || "").toLowerCase();
    if (!isStudent && username === "praharsh") {
      staffWelcomeTitle.textContent = "Welcome Praharsh Sir!";
      staffWelcomePanel.classList.remove("hidden");
    } else if (!isStudent && username === "nanda") {
      staffWelcomeTitle.textContent = "Welcome Nanda Sir!";
      staffWelcomePanel.classList.remove("hidden");
    } else {
      staffWelcomePanel.classList.add("hidden");
    }
  }

  // Toggle visibility of various panels based on role
  const rolesMap = {
    takeAttendancePanel: !isStudent,
    backdateAttendancePanel: !isStudent,
    adminFeesPanel: !isStudent,
    studentFeePanel: isStudent,
    addStudentPanel: !isStudent,
    studentBulkPanel: !isStudent,
    adminTimetablePanel: !isStudent,
    adminInterviewPanel: !isStudent,
    adminAnnouncementPanel: !isStudent,
    adminNotificationPanel: !isStudent,
    adminTestsPanel: !isStudent,
    adminTestsListPanel: !isStudent,
    testReviewPanel: !isStudent,
    studentTestsPanel: isStudent,
    adminPasswordPanel: !isStudent,
  };

  Object.entries(rolesMap).forEach(([id, show]) => {
    document.getElementById(id)?.classList.toggle("hidden", !show);
  });

  const feesTitle = document.getElementById("feesTitle");
  const feesSubtitle = document.getElementById("feesSubtitle");
  const feesRefresh = document.getElementById("feesRefreshBtn");
  const attendanceTitle = document.getElementById("attendanceTitle");
  const attendanceSubtitle = document.getElementById("attendanceSubtitle");
  if (isStudent) {
    if (feesTitle) feesTitle.textContent = "My Fees";
    if (feesSubtitle) feesSubtitle.textContent = "View your remaining balance";
    if (feesRefresh) feesRefresh.classList.add("hidden");
    document.querySelectorAll("#section-fees .top-actions .btn").forEach(btn => {
      if (btn.id !== "feesRefreshBtn") btn.classList.add("hidden");
    });
    if (attendanceTitle) attendanceTitle.textContent = "My Attendance";
    if (attendanceSubtitle) attendanceSubtitle.textContent = "Your recent attendance records";
  } else {
    if (feesTitle) feesTitle.textContent = "Fees Overview";
    if (feesSubtitle) feesSubtitle.textContent = "Record fees paid for each student";
    if (feesRefresh) feesRefresh.classList.remove("hidden");
    if (attendanceTitle) attendanceTitle.textContent = "Attendance Overview";
    if (attendanceSubtitle) attendanceSubtitle.textContent = "Date-wise attendance across all students";
  }
}

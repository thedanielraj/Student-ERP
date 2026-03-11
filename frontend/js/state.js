const LOCAL_FASTAPI_HOSTS = ["127.0.0.1:8000", "localhost:8000"];
export const API = LOCAL_FASTAPI_HOSTS.includes(window.location.host)
  ? window.location.origin
  : `${window.location.origin}/api`;
export const TOKEN_KEY = "authToken";
export const ATTENDANCE_QUEUE_KEY = "offlineAttendanceQueue";
export const INSTALL_DISMISS_KEY = "installBannerDismissedUntil";
export const NATO_BATCHES = [
  "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliett",
  "Kilo", "Lima", "Mike", "November", "Oscar", "Papa", "Quebec", "Romeo", "Sierra", "Tango",
  "Uniform", "Victor", "Whiskey", "X-ray", "Yankee", "Zulu",
];

export const state = {
  allStudents: [],
  selectedId: null,
  authInfo: null,
  studentFeeSummary: null,
  razorpayKeyId: null,
  feePoliciesByStudent: {},
  portalMode: "student",
  alumniSelectedIds: new Set(),
  selectedStudentIds: new Set(),
  announcementPollTimer: null,
  latestAnnouncementIdSeen: Number(localStorage.getItem("latestAnnouncementIdSeen") || 0),
  announcementsNotifierBootstrapped: false,
  admissionsCache: [],
  attendanceQueueFlushing: false,
  deferredInstallPrompt: null,
  toastTimer: null,
  leadsState: { cache: [], statusFilter: "all", upcomingOnly: false },
  parentMode: false,
  chatbotState: {
    initialized: false,
    step: "greeting",
    intent: "",
    profile: { name: "", age: "", qualification: "", location: "", phone: "", preferred_time: "" },
  },
  currentAttempt: null,
  currentAttemptQuestions: [],
  currentAttemptTimer: null,
  malpracticeAutoSubmitted: false,
};

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

export const PROFILE_FILE_FIELDS = [
  {
    key: "student_photo",
    inputId: "profileStudentPhoto",
    statusId: "profileStudentPhotoStatus",
    label: "Student photo",
    base64Key: "student_photo_base64",
    filenameKey: "student_photo_filename",
    typeKey: "student_photo_type",
  },
  {
    key: "parent_photo",
    inputId: "profileParentPhoto",
    statusId: "profileParentPhotoStatus",
    label: "Parent photo",
    base64Key: "parent_photo_base64",
    filenameKey: "parent_photo_filename",
    typeKey: "parent_photo_type",
  },
  {
    key: "guardian_photo",
    inputId: "profileGuardianPhoto",
    statusId: "profileGuardianPhotoStatus",
    label: "Guardian photo",
    base64Key: "guardian_photo_base64",
    filenameKey: "guardian_photo_filename",
    typeKey: "guardian_photo_type",
  },
  {
    key: "admission_form",
    inputId: "profileAdmissionForm",
    statusId: "profileAdmissionFormStatus",
    label: "Admission form",
    base64Key: "admission_form_base64",
    filenameKey: "admission_form_filename",
    typeKey: "admission_form_type",
  },
  {
    key: "pan_card",
    inputId: "profilePanCardFile",
    statusId: "profilePanCardStatus",
    label: "PAN card",
    base64Key: "pan_card_base64",
    filenameKey: "pan_card_filename",
    typeKey: "pan_card_type",
  },
  {
    key: "aadhaar_card",
    inputId: "profileAadhaarCardFile",
    statusId: "profileAadhaarCardStatus",
    label: "Aadhaar card",
    base64Key: "aadhaar_card_base64",
    filenameKey: "aadhaar_card_filename",
    typeKey: "aadhaar_card_type",
  },
];

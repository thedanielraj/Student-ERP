import { API } from "./config.js";
import { state } from "./state.js";

export function initChatbot() {
  const messages = document.getElementById("chatbotMessages");
  if (!messages || state.chatbotState.initialized) return;
  state.chatbotState.initialized = true;
  addChatbotMessage("bot", "Hello! Welcome to Arunand's Aviation Academy - Bangalore.");
  addChatbotMessage("bot", "I can help with courses, fees, eligibility, admissions, and counselor connect.");
  addChatbotMessage("bot", "To personalize this, what's your name?");
  state.chatbotState.step = "ask_name";
  const input = document.getElementById("chatbotInput");
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendChatbotMessage();
    }
  });
}

export function toggleChatbot() {
  const panel = document.getElementById("chatbotPanel");
  if (!panel) return;
  panel.classList.toggle("hidden");
  if (!panel.classList.contains("hidden")) {
    initChatbot();
    document.getElementById("chatbotInput")?.focus();
  }
}

export function addChatbotMessage(role, text) {
  const messages = document.getElementById("chatbotMessages");
  if (!messages) return;
  const bubble = document.createElement("div");
  bubble.className = `chatbot-bubble ${role === "user" ? "user" : "bot"}`;
  bubble.textContent = text;
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
}

function setTypingIndicator(show) {
  const typing = document.getElementById("chatbotTyping");
  if (!typing) return;
  typing.classList.toggle("hidden", !show);
  const messages = document.getElementById("chatbotMessages");
  if (show && messages) {
    messages.scrollTop = messages.scrollHeight;
  }
}

function extractPhoneNumber(text) {
  const digits = String(text || "").replace(/\D/g, "");
  return /^\d{10}$/.test(digits) ? digits : "";
}

async function requestAiReply(message) {
  if (!state.chatbotState.aiAvailable) return null;
  try {
    const res = await fetch(`${API}/chatbot/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        profile: state.chatbotState.profile,
        intent: state.chatbotState.intent,
      }),
    });
    if (!res.ok) {
      if ([402, 429, 502, 503].includes(res.status)) {
        state.chatbotState.aiAvailable = false;
      }
      return null;
    }
    const data = await res.json().catch(() => ({}));
    const reply = String(data.reply || "").trim();
    return reply || null;
  } catch (_) {
    return null;
  }
}

async function submitChatbotLead() {
  const payload = {
    name: state.chatbotState.profile.name,
    age: state.chatbotState.profile.age,
    qualification: state.chatbotState.profile.qualification,
    location: state.chatbotState.profile.location,
    phone: state.chatbotState.profile.phone,
    preferred_time: state.chatbotState.profile.preferred_time,
    intent: state.chatbotState.intent,
  };
  const res = await fetch(`${API}/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    addChatbotMessage("bot", err.detail || "Sorry, I could not save your details. Please try again.");
    return false;
  }
  addChatbotMessage("bot", "Thanks! Our team will contact you soon.");
  return true;
}

export async function sendChatbotMessage() {
  const input = document.getElementById("chatbotInput");
  const text = String(input?.value || "").trim();
  if (!text) return;
  addChatbotMessage("user", text);
  if (input) input.value = "";

  const lower = text.toLowerCase();

  if (!["ask_phone", "ask_time"].includes(state.chatbotState.step)) {
    setTypingIndicator(true);
    try {
      const aiReply = await requestAiReply(text);
      if (aiReply) {
        addChatbotMessage("bot", aiReply);
        return;
      }
    } finally {
      setTypingIndicator(false);
    }
  }

  if (state.chatbotState.step === "ask_name") {
    state.chatbotState.profile.name = text.split(" ")[0] || text;
    state.chatbotState.step = "ask_age";
    addChatbotMessage("bot", `Nice to meet you, ${state.chatbotState.profile.name}. What's your age?`);
    return;
  }

  if (state.chatbotState.step === "ask_age") {
    const ageMatch = text.match(/\d{2}/);
    state.chatbotState.profile.age = ageMatch ? ageMatch[0] : text;
    state.chatbotState.step = "ask_qualification";
    addChatbotMessage("bot", "Thanks. What's your highest qualification?");
    return;
  }

  if (state.chatbotState.step === "ask_qualification") {
    state.chatbotState.profile.qualification = text;
    state.chatbotState.step = "ask_location";
    addChatbotMessage("bot", "Got it. Which city or location are you from?");
    return;
  }

  if (state.chatbotState.step === "ask_location") {
    state.chatbotState.profile.location = text;
    state.chatbotState.step = "menu";
    addChatbotMessage(
      "bot",
      `Thanks ${state.chatbotState.profile.name}. How can I help you next?\n1. Register your details\n2. Course Details\n3. Fees\n4. Eligibility\n5. Talk to Counsellor\n6. Christmas & New Year Offers`
    );
    return;
  }

  if (state.chatbotState.step === "ask_phone") {
    const phone = extractPhoneNumber(text);
    if (!phone) {
      addChatbotMessage("bot", "Please share a valid 10 digit phone number.");
      return;
    }
    state.chatbotState.profile.phone = phone;
    state.chatbotState.step = "ask_time";
    addChatbotMessage("bot", "Thanks. What is your preferred time to receive a call?");
    return;
  }

  if (state.chatbotState.step === "ask_time") {
    state.chatbotState.profile.preferred_time = text;
    const ok = await submitChatbotLead();
    if (ok) {
      state.chatbotState.step = "menu";
      addChatbotMessage("bot", "Anything else I can help you with? You can type 1-6 or say 'fees', 'courses', etc.");
    }
    return;
  }

  if (state.chatbotState.step === "menu") {
    const choice = text.replace(/[^\d]/g, "");
    const phoneInline = extractPhoneNumber(text);
    if (choice === "1" || /register|details/.test(lower)) {
      state.chatbotState.intent = "register";
      state.chatbotState.step = "ask_phone";
      if (phoneInline) {
        state.chatbotState.profile.phone = phoneInline;
        state.chatbotState.step = "ask_time";
        addChatbotMessage("bot", "Thanks. What is your preferred time to receive a call?");
        return;
      }
      addChatbotMessage("bot", "Please share your 10 digit phone number.");
      return;
    }
    if (choice === "2" || /course|courses/.test(lower)) {
      addChatbotMessage("bot", "We offer Ground Operations, Cabin Crew, and CPL Ground Classes.\nWould you like details for a specific course?");
      return;
    }
    if (choice === "3" || /fee|fees|cost|price/.test(lower)) {
      addChatbotMessage("bot", "Fees are INR 1.5L. We also offer installment options.\nWould you like the fee breakup?");
      return;
    }
    if (choice === "4" || /eligibility|eligible|criteria/.test(lower)) {
      addChatbotMessage("bot", "Eligibility typically requires 10+2 pass and good communication skills.\nWant the detailed criteria for Ground Operations, Cabin Crew, or CPL Ground Classes?");
      return;
    }
    if (choice === "5" || /counsellor|counselor|call|talk/.test(lower)) {
      state.chatbotState.intent = "counsellor";
      state.chatbotState.step = "ask_phone";
      if (phoneInline) {
        state.chatbotState.profile.phone = phoneInline;
        state.chatbotState.step = "ask_time";
        addChatbotMessage("bot", "Thanks. What is your preferred time to receive a call?");
        return;
      }
      addChatbotMessage("bot", "Sure. Please share your 10 digit phone number.");
      return;
    }
    if (choice === "6" || /offer|offers|discount|new year|christmas/.test(lower)) {
      state.chatbotState.intent = "offers";
      state.chatbotState.step = "ask_phone";
      if (phoneInline) {
        state.chatbotState.profile.phone = phoneInline;
        state.chatbotState.step = "ask_time";
        addChatbotMessage("bot", "Thanks. What is your preferred time to receive a call?");
        return;
      }
      addChatbotMessage("bot", "We have seasonal offers. Please share your 10 digit phone number.");
      return;
    }
    addChatbotMessage("bot", "You can type a number (1-6) or say things like 'fees', 'courses', or 'talk to counsellor'.");
  }
}

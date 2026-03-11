import { API, chatbotState } from "./app-core.js";

function addChatbotMessage(role, text) {
  const messages = document.getElementById("chatbotMessages");
  if (!messages) return;
  const div = document.createElement("div");
  div.className = `chatbot-bubble ${role}`;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function toggleChatbot() {
  const panel = document.getElementById("chatbotPanel");
  if (!panel) return;
  panel.classList.toggle("hidden");
  if (!panel.classList.contains("hidden")) {
    document.getElementById("chatbotInput")?.focus();
  }
}

async function submitChatbotLead() {
  const payload = {
    name: chatbotState.profile.name,
    age: chatbotState.profile.age,
    qualification: chatbotState.profile.qualification,
    location: chatbotState.profile.location,
    phone: chatbotState.profile.phone,
    preferred_time: chatbotState.profile.preferred_time,
    intent: chatbotState.intent,
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

function isValidPhone(value) {
  return /^\d{10}$/.test(String(value || "").trim());
}

async function sendChatbotMessage() {
  const input = document.getElementById("chatbotInput");
  const text = String(input?.value || "").trim();
  if (!text) return;
  addChatbotMessage("user", text);
  if (input) input.value = "";

  const lower = text.toLowerCase();

  if (chatbotState.step === "ask_name") {
    chatbotState.profile.name = text.split(" ")[0] || text;
    chatbotState.step = "ask_age";
    addChatbotMessage("bot", `Nice to meet you, ${chatbotState.profile.name}. What's your age?`);
    return;
  }

  if (chatbotState.step === "ask_age") {
    const ageMatch = text.match(/\d{2}/);
    chatbotState.profile.age = ageMatch ? ageMatch[0] : text;
    chatbotState.step = "ask_qualification";
    addChatbotMessage("bot", "Thanks. What's your highest qualification?");
    return;
  }

  if (chatbotState.step === "ask_qualification") {
    chatbotState.profile.qualification = text;
    chatbotState.step = "ask_location";
    addChatbotMessage("bot", "Got it. Which city or location are you from?");
    return;
  }

  if (chatbotState.step === "ask_location") {
    chatbotState.profile.location = text;
    chatbotState.step = "menu";
    addChatbotMessage(
      "bot",
      `Thanks ${chatbotState.profile.name}. How can I help you next?\n1. Register your details\n2. Course Details\n3. Fees\n4. Eligibility\n5. Talk to Counsellor\n6. Christmas & New Year Offers`
    );
    return;
  }

  if (chatbotState.step === "ask_phone") {
    if (!isValidPhone(text)) {
      addChatbotMessage("bot", "Please enter a valid 10 digit phone number.");
      return;
    }
    chatbotState.profile.phone = text;
    chatbotState.step = "ask_time";
    addChatbotMessage("bot", "Thanks. What is your preferred time to receive a call?");
    return;
  }

  if (chatbotState.step === "ask_time") {
    chatbotState.profile.preferred_time = text;
    chatbotState.step = "menu";
    await submitChatbotLead();
    addChatbotMessage("bot", "Anything else I can help with?\n1. Register your details\n2. Course Details\n3. Fees\n4. Eligibility\n5. Talk to Counsellor\n6. Christmas & New Year Offers");
    return;
  }

  if (chatbotState.step === "menu") {
    const phoneInline = lower.match(/\b\d{10}\b/)?.[0] || "";
    if (lower.includes("register") || lower.includes("admission") || lower === "1") {
      chatbotState.intent = "register";
      chatbotState.step = "ask_phone";
      if (phoneInline) {
        chatbotState.profile.phone = phoneInline;
        chatbotState.step = "ask_time";
        addChatbotMessage("bot", "Thanks. What is your preferred time to receive a call?");
        return;
      }
      addChatbotMessage("bot", "Please share your 10 digit phone number.");
      return;
    }
    if (lower.includes("course") || lower === "2") {
      addChatbotMessage("bot", "We offer Ground Operations and Cabin Crew.\nWould you like details for a specific course?");
      return;
    }
    if (lower.includes("fee") || lower === "3") {
      addChatbotMessage("bot", "Fees are INR 1.5L. We also offer installment options.\nWould you like the fee breakup?");
      return;
    }
    if (lower.includes("elig") || lower === "4") {
      addChatbotMessage("bot", "Eligibility typically requires 10+2 pass and good communication skills.\nWant the detailed criteria for Ground Operations or Cabin Crew?");
      return;
    }
    if (lower.includes("counsellor") || lower.includes("counselor") || lower === "5") {
      chatbotState.intent = "counsellor";
      chatbotState.step = "ask_phone";
      if (phoneInline) {
        chatbotState.profile.phone = phoneInline;
        chatbotState.step = "ask_time";
        addChatbotMessage("bot", "Thanks. What is your preferred time to receive a call?");
        return;
      }
      addChatbotMessage("bot", "Sure. Please share your 10 digit phone number.");
      return;
    }
    if (lower.includes("offer") || lower.includes("christmas") || lower.includes("new year") || lower === "6") {
      chatbotState.intent = "offers";
      chatbotState.step = "ask_phone";
      if (phoneInline) {
        chatbotState.profile.phone = phoneInline;
        chatbotState.step = "ask_time";
        addChatbotMessage("bot", "Thanks. What is your preferred time to receive a call?");
        return;
      }
      addChatbotMessage("bot", "We have seasonal offers. Please share your 10 digit phone number.");
      return;
    }
    addChatbotMessage("bot", "You can type a number (1-6) or say things like 'fees', 'courses', or 'talk to counsellor'.");
  }
}

function initChatbot() {
  const messages = document.getElementById("chatbotMessages");
  if (!messages || chatbotState.initialized) return;
  chatbotState.initialized = true;
  addChatbotMessage("bot", "Hello! Welcome to Arunand's Aviation Academy - Bangalore.");
  addChatbotMessage("bot", "I can help with courses, fees, eligibility, admissions, and counselor connect.");
  addChatbotMessage("bot", "To personalize this, what's your name?");
  chatbotState.step = "ask_name";
  const input = document.getElementById("chatbotInput");
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendChatbotMessage();
    }
  });
}

export { initChatbot, toggleChatbot, sendChatbotMessage };

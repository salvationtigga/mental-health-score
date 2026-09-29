"use strict";

const API_URL = "https://mental-health-score-ydhz.onrender.com";
const REQUEST_TIMEOUT_MS = 15000;
const MAX_SCORE = 10; // Ring gauge scale. Change if your model's target uses a different range.

const form = document.getElementById("form");
const submitBtn = document.getElementById("submit");
const resetBtn = document.getElementById("reset");

const states = {
  idle: document.getElementById("state-idle"),
  loading: document.getElementById("state-loading"),
  error: document.getElementById("state-error"),
  success: document.getElementById("state-success"),
};

// Field definitions mirror the StudentData Pydantic model.
const FIELDS = {
  age:                     { type: "int",   min: 10, max: 100, label: "Age" },
  gender:                  { type: "text",  label: "Gender" },
  country:                 { type: "text",  label: "Country" },
  academic_level:          { type: "text",  label: "Academic level" },
  most_used_platform:      { type: "text",  label: "Most used platform" },
  purpose_of_use:          { type: "text",  label: "Purpose of use" },
  avg_daily_usage_hours:   { type: "float", min: 0, max: 24, label: "Daily usage" },
  daily_unlocks:           { type: "int",   min: 0, label: "Daily unlocks" },
  study_hours:             { type: "float", min: 0, max: 24, label: "Study hours" },
  physical_activity_hours: { type: "float", min: 0, max: 24, label: "Physical activity" },
  sleep_hours_per_night:   { type: "float", min: 0, max: 24, label: "Sleep hours" },
  stress_level:            { type: "text",  label: "Stress level" },
};

/* ---------- UI helpers ---------- */

function showState(name) {
  Object.entries(states).forEach(([key, el]) => { el.hidden = key !== name; });
}

function setFieldError(name, message) {
  const holder = form.querySelector(`.err[data-for="${name}"]`);
  if (!holder) return;
  holder.textContent = message || "";
  holder.closest(".field").classList.toggle("invalid", Boolean(message));
}

function clearFieldErrors() {
  Object.keys(FIELDS).forEach((name) => setFieldError(name, ""));
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.textContent = isLoading ? "Analysing…" : "Get my score";
}

function showError(title, message, details = []) {
  document.getElementById("error-title").textContent = title;
  document.getElementById("error-msg").textContent = message;
  const list = document.getElementById("error-list");
  list.innerHTML = "";
  details.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    list.appendChild(li);
  });
  showState("error");
}

/* ---------- Form data + client-side validation ---------- */

function collectAndValidate() {
  const payload = {};
  let firstInvalid = null;

  for (const [name, rule] of Object.entries(FIELDS)) {
    const el = form.elements[name];
    // RadioNodeList (stress_level) and normal controls both expose .value
    const raw = (el.value ?? "").toString().trim();
    let error = "";

    if (raw === "") {
      error = "This field is required.";
    } else if (rule.type === "text") {
      payload[name] = raw;
    } else {
      const num = Number(raw);
      if (Number.isNaN(num)) error = "Enter a valid number.";
      else if (rule.type === "int" && !Number.isInteger(num)) error = "Enter a whole number.";
      else if (rule.min !== undefined && num < rule.min) error = `Must be at least ${rule.min}.`;
      else if (rule.max !== undefined && num > rule.max) error = `Must be at most ${rule.max}.`;
      else payload[name] = num;
    }

    setFieldError(name, error);
    if (error && !firstInvalid) firstInvalid = el.length ? el[0] : el;
  }

  if (firstInvalid) {
    firstInvalid.focus();
    return null;
  }
  return payload;
}

/* ---------- API call ---------- */

async function requestPrediction(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    let body = null;
    try { body = await response.json(); } catch { /* non-JSON body */ }

    if (!response.ok) {
      const err = new Error("API error");
      err.status = response.status;
      err.body = body;
      throw err;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Error handling ---------- */

function handleError(err) {
  // Timeout
  if (err.name === "AbortError") {
    showError("The request timed out", "The server took too long to respond. Please try again.");
    return;
  }

  // Network failure / server down / CORS
  if (!err.status) {
    showError(
      "Can't reach the server",
      "Make sure the FastAPI backend is running at http://127.0.0.1:8000, then try again."
    );
    return;
  }

  // FastAPI validation error (422): { detail: [{ loc: [...], msg }] }
  if (err.status === 422 && Array.isArray(err.body?.detail)) {
    const messages = err.body.detail.map((item) => {
      const field = item.loc?.[item.loc.length - 1];
      const label = FIELDS[field]?.label || field || "Input";
      if (FIELDS[field]) setFieldError(field, item.msg);
      return `${label}: ${item.msg}`;
    });
    showError("Some inputs need fixing", "The server rejected these values:", messages);
    return;
  }

  // Other API errors (500 etc.)
  const detail = typeof err.body?.detail === "string" ? err.body.detail : "";
  showError(
    `Server error (${err.status})`,
    detail || "The prediction could not be completed. Check the backend logs and try again."
  );
}

/* ---------- Result rendering ---------- */

function describeScore(score) {
  if (score >= 8) return { band: "Doing well", text: "Your habits point to a strong mental health score.", color: "#1b9a6b" };
  if (score >= 6) return { band: "Fairly balanced", text: "Your score is moderate. Small changes to sleep or screen time could help.", color: "#1b7a80" };
  if (score >= 4) return { band: "Room to improve", text: "Your routine may be affecting your well-being. Consider more sleep, movement and offline time.", color: "#d08a1f" };
  return { band: "Needs attention", text: "Your score is low. Consider talking to someone you trust or a professional.", color: "#c2412d" };
}

function animateNumber(el, target, duration = 1100) {
  const start = performance.now();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { el.textContent = target.toFixed(2); return; }
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = (target * eased).toFixed(2);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function showResult(score) {
  const info = describeScore(score);
  const bar = document.getElementById("ring-bar");
  const circumference = 2 * Math.PI * 52;
  const fraction = Math.max(0, Math.min(score / MAX_SCORE, 1));

  document.getElementById("score-band").textContent = info.band;
  document.getElementById("score-text").textContent = info.text;
  bar.style.stroke = info.color;

  // Reset the ring, reveal the card, then animate on the next frame.
  bar.style.transition = "none";
  bar.style.strokeDashoffset = circumference;
  showState("success");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bar.style.transition = "";
    bar.style.strokeDashoffset = circumference * (1 - fraction);
  }));

  animateNumber(document.getElementById("score-value"), score);
}

/* ---------- Events ---------- */

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFieldErrors();

  const payload = collectAndValidate();
  if (!payload) return;

  setLoading(true);
  showState("loading");
  states.loading.scrollIntoView({ behavior: "smooth", block: "nearest" });

  try {
    const data = await requestPrediction(payload);
    const score = Number(data?.predicted_mental_health_score);
    if (Number.isNaN(score)) throw Object.assign(new Error("Bad response"), { status: 200 });
    showResult(score);
  } catch (err) {
    if (err.status === 200) {
      showError("Unexpected response", "The server replied, but the score was missing from the response.");
    } else {
      handleError(err);
    }
  } finally {
    setLoading(false);
  }
});

resetBtn.addEventListener("click", () => {
  form.reset();
  clearFieldErrors();
  showState("idle");
});

// Clear a field's error as soon as the person edits it
form.addEventListener("input", (event) => {
  const name = event.target.name;
  if (name && FIELDS[name]) setFieldError(name, "");
});
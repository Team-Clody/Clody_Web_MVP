import { db } from "../firebase-config.js";
import {
  collection,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { OPENAI_API_KEY, CHRISTIAN_PROMPT } from "../secret.js";
import { getUserIP } from "../ip-service.js";
import { checkAndIncrementIPLimit } from "../ip-limit-service.js";

const diaryInput = document.getElementById("diary-input");
const charCount = document.getElementById("char-count");
const form = document.getElementById("diary-form");
const resultDiv = document.getElementById("result");
const retryBtn = document.getElementById("retry-btn");

const DEFAULT_RESULT_COLOR = "#333";
const ERROR_RESULT_COLOR = "#e74c3c";

diaryInput.addEventListener("input", () => {
  charCount.textContent = `${diaryInput.value.length}/200`;
});

retryBtn.addEventListener("click", () => {
  diaryInput.value = "";
  charCount.textContent = "0/200";
  resultDiv.style.color = DEFAULT_RESULT_COLOR;
  resultDiv.innerHTML =
    '<span class="result-placeholder">Lody will reply here in a moment!</span>';
  diaryInput.focus();
});

function showSpinner() {
  resultDiv.style.color = DEFAULT_RESULT_COLOR;
  resultDiv.innerHTML = '<div class="spinner"></div>';
}
function hideSpinner() {
  resultDiv.innerHTML =
    '<span class="result-placeholder">Lody will reply here in a moment!</span>';
}
function showError(message) {
  hideSpinner();
  resultDiv.style.color = ERROR_RESULT_COLOR;
  resultDiv.innerHTML = `<span style="color: ${ERROR_RESULT_COLOR};">${message}</span>`;
}

async function getChatGPTReply(diaryText) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4",
      messages: [
        { role: "system", content: CHRISTIAN_PROMPT },
        { role: "user", content: diaryText },
      ],
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Lody couldn't write a reply due to an error. Please try again.`
    );
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = diaryInput.value.trim();
  if (text.length === 0) {
    alert("Please write something you're grateful for!");
    return;
  }

  showSpinner();

  try {
    const userIP = await getUserIP();
    const limitCheck = await checkAndIncrementIPLimit(userIP);

    if (!limitCheck.allowed) {
      showError(limitCheck.message || "You've reached today's diary limit.");
      return;
    }

    const reply = await getChatGPTReply(text);

    await addDoc(collection(db, "prayer"), {
      diary: text,
      reply,
      userIP: userIP,
      createdAt: serverTimestamp(),
    });

    hideSpinner();
    resultDiv.style.color = DEFAULT_RESULT_COLOR;
    resultDiv.innerHTML = reply;
  } catch (err) {
    showError(err.message);
  }
});

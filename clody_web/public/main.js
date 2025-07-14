import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { OPENAI_API_KEY, PROMPT } from "./secret.js";

const diaryInput = document.getElementById("diary-input");
const charCount = document.getElementById("char-count");
const form = document.getElementById("diary-form");
const resultDiv = document.getElementById("result");

const DEFAULT_RESULT_COLOR = "#333";
const ERROR_RESULT_COLOR = "#e74c3c";

diaryInput.addEventListener("input", () => {
  charCount.textContent = `${diaryInput.value.length}/200`;
});

function showSpinner() {
  resultDiv.style.color = DEFAULT_RESULT_COLOR;
  resultDiv.innerHTML = '<div class="spinner"></div>';
}
function hideSpinner() {
  resultDiv.innerHTML = "";
}

async function getChatGPTReply(diaryText) {
  console.log("[GPT] 서버에 요청 시작");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: PROMPT,
        },
        { role: "user", content: diaryText },
      ],
      max_tokens: 200,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.log("[GPT] 서버 응답 실패:", errorText);
    throw new Error(`OpenAI API 호출 실패: ${errorText}`);
  }
  const data = await response.json();
  console.log("[GPT] 서버 응답 성공:", data);
  return data.choices[0].message.content.trim();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = diaryInput.value.trim();
  if (text.length === 0) {
    alert("일기를 입력해주세요!");
    return;
  }

  showSpinner();

  try {
    const reply = await getChatGPTReply(text);
    hideSpinner();
    resultDiv.style.color = DEFAULT_RESULT_COLOR;
    await addDoc(collection(db, "diaries"), {
      diary: text,
      reply,
      createdAt: serverTimestamp(),
    });
    resultDiv.textContent = reply;
    diaryInput.value = "";
    charCount.textContent = "0/200";
  } catch (err) {
    hideSpinner();
    resultDiv.style.color = ERROR_RESULT_COLOR;
    resultDiv.textContent = `오류가 발생했습니다: ${err.message}`;
    console.error(err);
  }
});

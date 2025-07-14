import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { OPENAI_API_KEY, PROMPT } from "./secret.js";
import { getUserIP } from "./ip-service.js";
import { checkAndIncrementIPLimit } from "./ip-limit-service.js";

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
  resultDiv.innerHTML = '<span class="result-placeholder" style="margin-bottom: 0;">Lody will reply here in a moment!</span>';
}

function showError(message) {
  hideSpinner();
  resultDiv.style.color = ERROR_RESULT_COLOR;
  resultDiv.innerHTML = `<span style="color: ${ERROR_RESULT_COLOR};">${message}</span>`;
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
      model: "gpt-4",
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
          throw new Error(`Lody couldn't write a reply due to an error! Please try again.`);
  }
  const data = await response.json();
  console.log("[GPT] 서버 응답 성공:", data);
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
    // 1. 사용자 IP 가져오기
    console.log("[IP] IP 주소 조회 시작");
    const userIP = await getUserIP();
    console.log("[IP] 사용자 IP:", userIP);

    // 2. IP 제한 확인
    console.log("[IP] IP 제한 확인 시작");
    const limitCheck = await checkAndIncrementIPLimit(userIP);
    console.log("[IP] 제한 확인 결과:", limitCheck);

    if (!limitCheck.allowed) {
      // 제한 초과 시 에러 표시
                      showError(limitCheck.message || "You've reached today's diary limit. Come back tomorrow!");
      return;
    }

    // 3. ChatGPT 응답 받기
    console.log("[GPT] ChatGPT 응답 요청 시작");
    const reply = await getChatGPTReply(text);
    console.log("[GPT] ChatGPT 응답 완료");

    // 4. Firestore에 일기 저장 (IP 정보 포함)
    console.log("[DB] Firestore에 일기 저장 시작");
    await addDoc(collection(db, "diaries"), {
      diary: text,
      reply,
      userIP: userIP, // IP 정보 추가
      createdAt: serverTimestamp(),
    });
    console.log("[DB] Firestore 저장 완료");

    // 5. 결과 표시
    hideSpinner();
    resultDiv.style.color = DEFAULT_RESULT_COLOR;
    resultDiv.innerHTML = reply;
    
    // 6. 입력창 초기화
    diaryInput.value = "";
    charCount.textContent = "0/200";

    // 7. IP 제한 정보 표시 (선택적)
    if (limitCheck.count && limitCheck.limit) {
      console.log(`[IP] 오늘 사용량: ${limitCheck.count}/${limitCheck.limit}`);
    }

  } catch (err) {
    console.error("[ERROR] 전체 프로세스 오류:", err);
    showError(`${err.message}`);
  }
});

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

// 모바일 키보드 포커스 문제 해결
diaryInput.addEventListener("blur", (e) => {
  // blur 이벤트가 발생해도 포커스를 유지할 수 있도록 짧은 지연 후 다시 포커스
  setTimeout(() => {
    if (document.activeElement !== diaryInput && diaryInput.value.length > 0) {
      // 사용자가 다른 곳을 클릭한 게 아니라면 포커스 유지
      const selection = window.getSelection();
      if (selection.rangeCount === 0) {
        diaryInput.focus();
      }
    }
  }, 100);
});

// 텍스트 영역 클릭 시 확실한 포커스 보장
diaryInput.addEventListener("touchstart", (e) => {
  e.preventDefault();
  diaryInput.focus();
  
  // 커서를 텍스트 끝으로 이동
  setTimeout(() => {
    const length = diaryInput.value.length;
    diaryInput.setSelectionRange(length, length);
  }, 10);
});

// iOS Safari에서 키보드가 사라지는 문제 해결
diaryInput.addEventListener("focus", () => {
  // 스크롤을 텍스트 영역으로 이동
  setTimeout(() => {
    diaryInput.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 300);
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
    
          throw new Error(`Lody couldn't write a reply due to an error! Please try again.`);
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
    // 1. 사용자 IP 가져오기
    const userIP = await getUserIP();

    // 2. IP 제한 확인
    const limitCheck = await checkAndIncrementIPLimit(userIP);

    if (!limitCheck.allowed) {
      // 제한 초과 시 에러 표시
                      showError(limitCheck.message || "You've reached today's diary limit. Come back tomorrow!");
      return;
    }

    // 3. ChatGPT 응답 받기
    const reply = await getChatGPTReply(text);

    // 4. Firestore에 일기 저장 (IP 정보 포함)
    await addDoc(collection(db, "diaries"), {
      diary: text,
      reply,
      userIP: userIP, // IP 정보 추가
      createdAt: serverTimestamp(),
    });


    // 5. 결과 표시
    hideSpinner();
    resultDiv.style.color = DEFAULT_RESULT_COLOR;
    resultDiv.innerHTML = reply;
    
    // 6. 입력창 초기화
    diaryInput.value = "";
    charCount.textContent = "0/200";

    // 7. IP 제한 정보 표시 (선택적)

  } catch (err) {

    showError(`${err.message}`);
  }
});

// 개발자 도구 감지 및 보안 강화
(function() {
  let devtools = {open: false, orientation: null};
  const threshold = 160;
  
  setInterval(function() {
    if (window.outerHeight - window.innerHeight > threshold || 
        window.outerWidth - window.innerWidth > threshold) {
      if (!devtools.open) {
        devtools.open = true;
        // 개발자 도구가 열리면 페이지 새로고침
        window.location.reload();
      }
    } else {
      devtools.open = false;
    }
  }, 500);
  
  // 우클릭 방지
  document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    return false;
  });
  
  // 키보드 단축키 방지
  document.addEventListener('keydown', function(e) {
    if (e.key === 'F12' || 
        (e.ctrlKey && e.shiftKey && e.key === 'I') ||
        (e.ctrlKey && e.shiftKey && e.key === 'C') ||
        (e.ctrlKey && e.key === 'U')) {
      e.preventDefault();
      return false;
    }
  });
})();

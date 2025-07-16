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
const retryBtn = document.getElementById("retry-btn");

const DEFAULT_RESULT_COLOR = "#333";
const ERROR_RESULT_COLOR = "#e74c3c";

diaryInput.addEventListener("input", () => {
  charCount.textContent = `${diaryInput.value.length}/200`;
});

// 재시도 버튼 클릭 이벤트
retryBtn.addEventListener("click", () => {
  // 입력창 초기화
  diaryInput.value = "";
  charCount.textContent = "0/200";
  
  // 결과창 초기화
  resultDiv.style.color = DEFAULT_RESULT_COLOR;
  resultDiv.innerHTML = '<span class="result-placeholder" style="margin-bottom: 0;">Lody will reply here in a moment!</span>';
  
  // 입력창에 포커스
  diaryInput.focus();
});

// iOS Safari 키보드 문제 해결 - 더 안전한 방법
let isUserInteracting = false;
let touchStartTime = 0;

diaryInput.addEventListener("touchstart", (e) => {
  isUserInteracting = true;
  touchStartTime = Date.now();
});

diaryInput.addEventListener("touchend", (e) => {
  const touchDuration = Date.now() - touchStartTime;
  
  // 짧은 터치 (탭)인 경우 커서 이동 허용
  if (touchDuration < 500) {
    setTimeout(() => {
      isUserInteracting = false;
    }, 100);
  } else {
    // 긴 터치 (텍스트 선택)인 경우 더 오래 대기
    setTimeout(() => {
      isUserInteracting = false;
    }, 300);
  }
});

// iOS Safari에서는 브라우저가 커서 위치를 올바르게 처리하므로 별도 처리 불필요

// 포커스 시 스크롤 조정 (iOS Safari 전용)
diaryInput.addEventListener("focus", () => {
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
    setTimeout(() => {
      window.scrollTo(0, diaryInput.offsetTop - 100);
    }, 300);
  }
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
    
    // 6. 입력창은 초기화하지 않음 (일기 내용 유지)

    // 7. IP 제한 정보 표시 (선택적)

  } catch (err) {

    showError(`${err.message}`);
  }
});

// 개발자 도구 감지 및 보안 강화
(function() {
  let devtools = {open: false, orientation: null};
  let isInitialized = false;
  let initialOuterHeight = 0;
  let initialOuterWidth = 0;
  
  // 초기 크기 설정 (페이지 로드 후 1초 대기)
  setTimeout(() => {
    initialOuterHeight = window.outerHeight;
    initialOuterWidth = window.outerWidth;
    isInitialized = true;
  }, 1000);
  
  setInterval(function() {
    if (!isInitialized) return;
    
    // 모바일 환경에서는 개발자 도구 감지 비활성화
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      return;
    }
    
    const heightDiff = window.outerHeight - window.innerHeight;
    const widthDiff = window.outerWidth - window.innerWidth;
    
    // 더 엄격한 조건으로 감지 (데스크톱에서만)
    if ((heightDiff > 200 && heightDiff > initialOuterHeight * 0.3) || 
        (widthDiff > 200 && widthDiff > initialOuterWidth * 0.3)) {
      if (!devtools.open) {
        devtools.open = true;
        // 개발자 도구가 열리면 페이지 새로고침
        window.location.reload();
      }
    } else {
      devtools.open = false;
    }
  }, 1000);
  
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

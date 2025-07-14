import { getUserIP, isValidIP } from "./ip-service.js";
import { checkAndIncrementIPLimit } from "./ip-limit-service.js";

const form = document.getElementById("diary-form");
const diaryInput = document.getElementById("diary-input");
const resultDiv = document.getElementById("result");
const charCountSpan = document.getElementById("char-count");

let userIP = null;

// 글자 수 표시
diaryInput.addEventListener("input", () => {
  charCountSpan.textContent = `${diaryInput.value.length}/200`;
});

// 페이지 로드 시 사용자 IP 가져오기
(async () => {
  userIP = await getUserIP();

  if (!isValidIP(userIP)) {
    displayError("Invalid IP address.");
    form.querySelector("button").disabled = true;
  }
})();

// 폼 제출 이벤트 핸들러
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const diary = diaryInput.value.trim();
  if (!diary) return;

  displayLoading("Analyzing your diary...");

  try {
    const limitStatus = await checkAndIncrementIPLimit(userIP);

    if (!limitStatus.allowed) {
      displayError(limitStatus.message || "Daily limit exceeded.");
      return;
    }

    const response = await fetch("/submitDiary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diary }),
    });

    if (!response.ok) {
      throw new Error("Failed to submit diary");
    }

    const data = await response.json();
    displayResult(data.reply);
    diaryInput.value = "";
    charCountSpan.textContent = "0/200";

  } catch (error) {
    displayError("Oops! Something went wrong. Try again later.");
  }
});

// 결과 표시
function displayResult(text) {
  resultDiv.innerHTML = `<p class="result-text">${text}</p>`;
  resultDiv.classList.remove("result-flex-start");
}

// 에러 표시
function displayError(message) {
  resultDiv.innerHTML = `<p class="result-error">${message}</p>`;
  resultDiv.classList.remove("result-flex-start");
}

// 로딩 표시
function displayLoading(message) {
  resultDiv.innerHTML = `<p class="result-loading">${message}</p>`;
  resultDiv.classList.remove("result-flex-start");
}

document.addEventListener("keydown", function (e) {
  if (
    e.key === "F12" ||
    (e.ctrlKey && e.shiftKey && e.key === "I") ||
    (e.ctrlKey && e.key === "u")
  ) {
    e.preventDefault();
    alert("Access to developer tools is restricted.");
  }
});

document.addEventListener("contextmenu", function (e) {
  e.preventDefault();
});
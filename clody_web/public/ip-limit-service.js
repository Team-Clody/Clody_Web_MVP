import { db } from "./firebase-config.js";
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  orderBy
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// 일일 최대 호출 횟수
const DAILY_LIMIT = 5;

// 오늘 날짜를 YYYY-MM-DD 형식으로 반환
function getTodayString() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

// IP의 오늘 호출 횟수 확인 및 증가
export async function checkAndIncrementIPLimit(userIP) {
  try {
    const today = getTodayString();
    const ipDocRef = doc(db, "ip_limits", userIP);
    const ipDoc = await getDoc(ipDocRef);
    
    if (!ipDoc.exists()) {
      // 첫 호출: 새 문서 생성
      await setDoc(ipDocRef, {
        ip: userIP,
        count: 1,
        date: today,
        whitelist: false,
        createdAt: serverTimestamp(),
        lastCalled: serverTimestamp()
      });
      return { allowed: true, count: 1, limit: DAILY_LIMIT };
    }
    
    const data = ipDoc.data();
    
    // 화이트리스트 확인
    if (data.whitelist === true) {
      // 화이트리스트면 호출 횟수만 업데이트하고 허용
      await updateDoc(ipDocRef, {
        count: (data.count || 0) + 1,
        lastCalled: serverTimestamp()
      });
              return { allowed: true, count: (data.count || 0) + 1, limit: "Unlimited (Whitelisted)" };
    }
    
    // 날짜 확인 (오늘이 아니면 카운트 리셋)
    if (data.date !== today) {
      await updateDoc(ipDocRef, {
        count: 1,
        date: today,
        lastCalled: serverTimestamp()
      });
      return { allowed: true, count: 1, limit: DAILY_LIMIT };
    }
    
    // 오늘 호출 횟수 확인
    const currentCount = data.count || 0;
    
    if (currentCount >= DAILY_LIMIT) {
      // 제한 초과
      return { 
        allowed: false, 
        count: currentCount, 
        limit: DAILY_LIMIT,
                    message: `You've reached today's limit of ${DAILY_LIMIT} diary entries. Come back tomorrow for more!`
      };
    }
    
    // 호출 횟수 증가
    await updateDoc(ipDocRef, {
      count: currentCount + 1,
      lastCalled: serverTimestamp()
    });
    
    return { 
      allowed: true, 
      count: currentCount + 1, 
      limit: DAILY_LIMIT 
    };
    
  } catch (error) {
    console.error('IP 제한 확인 오류:', error);
    // 오류 시 허용 (서비스 장애 시 사용자 차단 방지)
    return { allowed: true, count: 0, limit: DAILY_LIMIT, error: true };
  }
}

// 특정 IP의 제한 해제 (화이트리스트 추가)
export async function whitelistIP(userIP) {
  try {
    const ipDocRef = doc(db, "ip_limits", userIP);
    await updateDoc(ipDocRef, {
      whitelist: true,
      whitelistedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error('IP 화이트리스트 오류:', error);
    return { success: false, error: error.message };
  }
}

// 특정 IP의 화이트리스트 해제
export async function removeWhitelistIP(userIP) {
  try {
    const ipDocRef = doc(db, "ip_limits", userIP);
    await updateDoc(ipDocRef, {
      whitelist: false,
      whitelistRemovedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error('IP 화이트리스트 해제 오류:', error);
    return { success: false, error: error.message };
  }
}

// 오늘 제한에 걸린 IP 목록 가져오기
export async function getTodayLimitedIPs() {
  try {
    const today = getTodayString();
    const q = query(
      collection(db, "ip_limits"),
      where("date", "==", today),
      where("count", ">=", DAILY_LIMIT),
      orderBy("count", "desc")
    );
    
    const querySnapshot = await getDocs(q);
    const limitedIPs = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      limitedIPs.push({
        ip: doc.id,
        count: data.count,
        whitelist: data.whitelist || false,
        lastCalled: data.lastCalled?.toDate() || null
      });
    });
    
    return limitedIPs;
  } catch (error) {
    console.error('제한된 IP 목록 조회 오류:', error);
    return [];
  }
}

// 특정 IP로 작성된 일기 목록 가져오기
export async function getDiariesByIP(userIP) {
  try {
    const q = query(
      collection(db, "diaries"),
      where("userIP", "==", userIP),
      orderBy("createdAt", "desc")
    );
    
    const querySnapshot = await getDocs(q);
    const diaries = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      diaries.push({
        id: doc.id,
        diary: data.diary,
        reply: data.reply,
        createdAt: data.createdAt?.toDate() || null,
        userIP: data.userIP
      });
    });
    
    return diaries;
  } catch (error) {
    console.error('IP별 일기 조회 오류:', error);
    return [];
  }
} 
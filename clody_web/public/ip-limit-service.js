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

    return { success: false, error: error.message };
  }
}

// 오늘 제한에 걸린 IP 목록 가져오기
export async function getTodayLimitedIPs() {
  try {
    const today = getTodayString();
    const q = query(
      collection(db, "ip_limits"),
      where("date", "==", today)
    );
    
    const querySnapshot = await getDocs(q);
    const limitedIPs = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // 제한에 걸린 IP만 필터링
      if (data.count >= DAILY_LIMIT) {
        limitedIPs.push({
          ip: doc.id,
          count: data.count,
          whitelist: data.whitelist || false,
          lastCalled: data.lastCalled?.toDate() || null
        });
      }
    });
    
    // 클라이언트에서 정렬
    limitedIPs.sort((a, b) => b.count - a.count);
    
    return limitedIPs;
  } catch (error) {

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

    return [];
  }
}

// 활발한 사용자 분석 (IP별 총 일기 수 및 활동 패턴)
export async function getActiveUserAnalytics() {
  try {
    // 모든 일기 데이터 가져오기 (간단한 쿼리로 변경)
    const q = query(
      collection(db, "diaries"),
      orderBy("createdAt", "desc")
    );
    
    const querySnapshot = await getDocs(q);
    const userStats = {};
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const userIP = data.userIP;
      
      // userIP가 없는 경우 건너뛰기
      if (!userIP) return;
      
      if (!userStats[userIP]) {
        userStats[userIP] = {
          ip: userIP,
          totalDiaries: 0,
          firstDiary: null,
          lastDiary: null,
          diaries: []
        };
      }
      
      userStats[userIP].totalDiaries++;
      userStats[userIP].diaries.push({
        id: doc.id,
        diary: data.diary,
        reply: data.reply,
        createdAt: data.createdAt?.toDate() || null
      });
      
      // 첫 번째와 마지막 일기 날짜 추적
      const createdAt = data.createdAt?.toDate();
      if (createdAt) {
        if (!userStats[userIP].firstDiary || createdAt < userStats[userIP].firstDiary) {
          userStats[userIP].firstDiary = createdAt;
        }
        if (!userStats[userIP].lastDiary || createdAt > userStats[userIP].lastDiary) {
          userStats[userIP].lastDiary = createdAt;
        }
      }
    });
    
    // 배열로 변환하고 총 일기 수로 정렬
    const activeUsers = Object.values(userStats)
      .filter(user => user.totalDiaries >= 2) // 2개 이상 작성한 사용자만
      .sort((a, b) => b.totalDiaries - a.totalDiaries);
    
    // 디버깅을 위한 로그 (개발 중에만 사용)
    console.log("총 사용자 수:", Object.keys(userStats).length);
    console.log("활발한 사용자 수:", activeUsers.length);
    console.log("활발한 사용자 목록:", activeUsers);
    
    return activeUsers;
  } catch (error) {
    return [];
  }
}

// 특정 기간 내 활발한 사용자 분석
export async function getActiveUsersByPeriod(days = 7) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const q = query(
      collection(db, "diaries"),
      where("userIP", "!=", null),
      where("createdAt", ">=", cutoffDate),
      orderBy("userIP"),
      orderBy("createdAt", "desc")
    );
    
    const querySnapshot = await getDocs(q);
    const userStats = {};
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const userIP = data.userIP;
      
      if (!userStats[userIP]) {
        userStats[userIP] = {
          ip: userIP,
          recentDiaries: 0,
          lastActive: null,
          consecutiveDays: 0
        };
      }
      
      userStats[userIP].recentDiaries++;
      const createdAt = data.createdAt?.toDate();
      if (createdAt && (!userStats[userIP].lastActive || createdAt > userStats[userIP].lastActive)) {
        userStats[userIP].lastActive = createdAt;
      }
    });
    
    // 배열로 변환하고 최근 활동량으로 정렬
    const recentActiveUsers = Object.values(userStats)
      .filter(user => user.recentDiaries > 1)
      .sort((a, b) => b.recentDiaries - a.recentDiaries);
    
    return recentActiveUsers;
  } catch (error) {
    return [];
  }
} 
// IP 주소 가져오기 서비스
export async function getUserIP() {
  try {
    // ipify API 사용 (무료, 안정적)
    const response = await fetch('https://api.ipify.org?format=json');
    if (!response.ok) {
              throw new Error('IP lookup failed');
    }
    const data = await response.json();
    return data.ip;
  } catch (error) {
    console.error('IP 조회 오류:', error);
    
    // 백업 API 시도
    try {
      const backupResponse = await fetch('https://httpbin.org/ip');
      if (!backupResponse.ok) {
        throw new Error('Backup IP lookup failed');
      }
      const backupData = await backupResponse.json();
      return backupData.origin.split(',')[0].trim(); // 첫 번째 IP만 사용
    } catch (backupError) {
      console.error('백업 IP 조회 오류:', backupError);
      
      // 최후의 수단: 로컬 개발용 기본값
      return '127.0.0.1';
    }
  }
}

// IP 주소 유효성 검사
export function isValidIP(ip) {
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
} 
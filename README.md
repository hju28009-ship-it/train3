# 코레일 화물열차 알람 백엔드 v3.0

## 🆕 v3.0 업데이트
- ✅ **Puppeteer 추가** - JavaScript 렌더링 사이트 크롤링
- ✅ **다중 소스 지원** - 코레일 모바일, nxlogis.kr
- ✅ **자동 폴백** - 한 소스 실패 시 자동으로 다른 소스 시도
- ✅ **한글 인코딩 지원** - 완벽한 한글 처리

## 지원하는 크롤링 소스
1. **https://mlogis.korail.com** (Puppeteer)
2. **https://nxlogis.kr** (API)
3. **https://logis.korail.go.kr** (예비용)

## 배포 방법

### 1. GitHub 저장소 생성 및 업로드
```bash
cd train-alarm-backend-v3

git init
git add .
git commit -m "v3.0: Puppeteer로 JavaScript 사이트 크롤링"
git remote add origin https://github.com/YOUR_USERNAME/train-alarm-backend.git
git push -u origin main
```

### 2. Render.com 배포

⚠️ **중요**: Render.com에서 Puppeteer를 사용하려면 **Docker 배포**가 권장됩니다.

#### 옵션 1: Dockerfile 사용 (권장)
Render.com에서 자동으로 Docker를 감지하여 배포합니다.

#### 옵션 2: 일반 Node 배포
render.yaml 설정으로 Chromium을 설치하지만, 메모리 제한으로 불안정할 수 있습니다.

**배포 설정:**
```
Name: train-alarm-backend
Environment: Docker (또는 Node)
Build Command: npm install
Start Command: npm start
Instance Type: Starter (Free tier는 메모리 부족 가능)
```

### 3. 대안: Puppeteer 없이 배포

JavaScript 사이트 크롤링이 불안정하면, API 방식만 사용:
- nxlogis.kr API 호출
- 간단한 axios 요청

## API 엔드포인트

### 실시간 열차 정보 (크롤링)
```
GET /api/train-info?trainDate=20260208&trainNo=3001

Response:
{
  "trainNo": "3001",
  "trainDate": "20260208",
  "status": "running",
  "currentStation": "대전",
  "stations": [
    {
      "name": "오봉",
      "arrival": "03:02",
      "departure": "03:02",
      "status": "출발"
    }
  ],
  "lastUpdate": "2026-02-08T..."
}
```

### 기타 API
- `GET /api/trains` - 열차 목록
- `GET /api/trains/search?query=3001` - 열차 검색
- `GET /api/stations?query=대전` - 역 검색
- `GET /health` - 헬스체크

## 크롤링 작동 방식

```javascript
1차 시도: Puppeteer로 코레일 모바일 크롤링
   ↓ (실패 시)
2차 시도: nxlogis.kr API 호출
   ↓ (실패 시)
오류 반환
```

## 로컬 테스트

```bash
npm install
npm start
```

브라우저에서:
```
http://localhost:3000/api/train-info?trainDate=20260208&trainNo=3001
```

## 주의사항

### Puppeteer 메모리 사용량
- Puppeteer는 Chrome을 실행하므로 메모리 많이 사용
- Render.com Free tier (512MB)에서는 불안정할 수 있음
- Starter tier 이상 권장

### 크롤링 속도
- Puppeteer는 페이지 로딩 시간 필요 (5-10초)
- 빈번한 요청은 피하고 1분 간격 권장

### 대안
JavaScript 렌더링이 필요 없다면 v2.0 사용:
- 가볍고 빠름
- CSV 데이터만 사용
- API 호출만 수행

## 환경 변수

Render.com에서 설정:
```
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
NODE_ENV=production
```

## 트러블슈팅

### 문제: Puppeteer 실행 안 됨
**해결**: Docker 배포 사용 또는 메모리 업그레이드

### 문제: 크롤링 타임아웃
**해결**: 타임아웃 시간 증가 (현재 30초)

### 문제: 한글 깨짐
**해결**: fonts-noto-cjk 설치 (render.yaml에 포함됨)

## 버전 히스토리

- **v3.0** (2026-02-08)
  - Puppeteer 추가
  - JavaScript 사이트 크롤링
  - 다중 소스 지원
  
- **v2.0** (2026-02-08)
  - CSV 데이터 활용
  - 열차번호 검색
  
- **v1.0** (2026-02-08)
  - 초기 버전
  - 기본 크롤링

## 라이선스
개인 사용 목적

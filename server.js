const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const iconv = require('iconv-lite');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 화물열차 시간표 데이터 저장소
let trainSchedules = [];
let freightStations = [];

// CSV 파일 로드 함수
function loadTrainSchedules() {
  return new Promise((resolve, reject) => {
    const results = [];
    const csvPath = path.join(__dirname, 'data', '한국철도공사_화물열차운행_시간표_20200110.csv');
    
    fs.createReadStream(csvPath)
      .pipe(iconv.decodeStream('euc-kr'))
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        trainSchedules = results;
        console.log(`✅ 화물열차 시간표 로드 완료: ${trainSchedules.length}개 열차`);
        resolve(results);
      })
      .on('error', reject);
  });
}

function loadFreightStations() {
  return new Promise((resolve, reject) => {
    const results = [];
    const csvPath = path.join(__dirname, 'data', '한국철도공사_화물역_현황_20191226.csv');
    
    fs.createReadStream(csvPath)
      .pipe(iconv.decodeStream('euc-kr'))
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        freightStations = results;
        console.log(`✅ 화물역 현황 로드 완료: ${freightStations.length}개 역`);
        resolve(results);
      })
      .on('error', reject);
  });
}

// 서버 시작 시 CSV 로드
async function initializeData() {
  try {
    await Promise.all([loadTrainSchedules(), loadFreightStations()]);
    console.log('📊 모든 데이터 로드 완료');
  } catch (error) {
    console.error('❌ 데이터 로드 실패:', error);
  }
}

// Puppeteer로 코레일 모바일 사이트 크롤링
async function getTrainInfoWithPuppeteer(trainDate, trainNo) {
  let browser;
  try {
    console.log(`🚀 Puppeteer로 열차정보 조회 시작: ${trainNo} (${trainDate})`);
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    
    // 타임아웃 설정
    page.setDefaultTimeout(30000);
    
    // 모바일 사이트 접속
    const url = 'https://mlogis.korail.com/searchmobiletraininfoform.do';
    
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    // 폼 입력
    await page.type('input[name="trainDate"]', trainDate);
    await page.type('input[name="trainNo"]', trainNo);
    
    // 폼 제출 및 결과 대기
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);
    
    // 결과 페이지에서 데이터 추출
    const trainInfo = await page.evaluate(() => {
      const stations = [];
      const rows = document.querySelectorAll('table tr');
      
      rows.forEach((row, index) => {
        if (index === 0) return; // 헤더 스킵
        
        const cells = row.querySelectorAll('td');
        if (cells.length >= 4) {
          stations.push({
            name: cells[0].textContent.trim(),
            arrival: cells[1].textContent.trim(),
            departure: cells[2].textContent.trim(),
            status: cells[3].textContent.trim()
          });
        }
      });
      
      return { stations };
    });
    
    await browser.close();
    
    // 열차 상태 판단
    const result = {
      trainNo: trainNo,
      trainDate: trainDate,
      stations: trainInfo.stations,
      status: 'unknown',
      lastUpdate: new Date().toISOString()
    };
    
    if (result.stations.length > 0) {
      const passedStations = result.stations.filter(s => 
        s.status.includes('통과') || s.status.includes('출발')
      );
      
      if (passedStations.length === result.stations.length) {
        result.status = 'completed';
      } else if (passedStations.length > 0) {
        result.status = 'running';
        result.currentStation = passedStations[passedStations.length - 1].name;
      } else {
        result.status = 'scheduled';
      }
    }
    
    console.log(`✅ 크롤링 완료: ${result.stations.length}개 역 정보`);
    return result;
    
  } catch (error) {
    console.error('❌ Puppeteer 크롤링 오류:', error.message);
    if (browser) await browser.close();
    throw error;
  }
}

// Axios로 nxlogis.kr API 호출 (대체 방법)
async function getTrainInfoFromNxLogis(trainDate, trainNo) {
  try {
    console.log(`🔄 nxlogis.kr API 호출: ${trainNo} (${trainDate})`);
    
    const response = await axios.get('https://nxlogis.kr/api/train', {
      params: {
        date: trainDate,
        no: trainNo
      },
      timeout: 10000
    });
    
    return response.data;
  } catch (error) {
    console.error('❌ nxlogis.kr API 오류:', error.message);
    throw error;
  }
}

// 코레일 화물열차 정보 조회 (다중 소스)
async function getTrainInfo(trainDate, trainNo) {
  try {
    // 1차 시도: Puppeteer로 코레일 모바일 크롤링
    return await getTrainInfoWithPuppeteer(trainDate, trainNo);
  } catch (error1) {
    console.log('⚠️ Puppeteer 실패, nxlogis.kr 시도...');
    
    try {
      // 2차 시도: nxlogis.kr API
      return await getTrainInfoFromNxLogis(trainDate, trainNo);
    } catch (error2) {
      console.error('❌ 모든 소스에서 실패');
      throw new Error('열차 정보를 가져올 수 없습니다');
    }
  }
}

// API 엔드포인트: 열차 정보 조회
app.get('/api/train-info', async (req, res) => {
  try {
    const { trainDate, trainNo } = req.query;
    
    if (!trainDate || !trainNo) {
      return res.status(400).json({ 
        error: '운행일(trainDate)과 열차번호(trainNo)가 필요합니다' 
      });
    }

    const trainInfo = await getTrainInfo(trainDate, trainNo);
    res.json(trainInfo);

  } catch (error) {
    console.error('API 오류:', error);
    res.status(500).json({ 
      error: '열차 정보를 가져오는데 실패했습니다',
      message: error.message 
    });
  }
});

// API 엔드포인트: 열차 번호 검색
app.get('/api/trains/search', (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.json(trainSchedules.slice(0, 20));
    }

    const results = trainSchedules.filter(train => 
      train['열차번호'].includes(query)
    );

    res.json(results);
  } catch (error) {
    console.error('검색 오류:', error);
    res.status(500).json({ error: '검색 중 오류가 발생했습니다' });
  }
});

// API 엔드포인트: 특정 열차번호 상세 정보
app.get('/api/trains/:trainNo', (req, res) => {
  try {
    const { trainNo } = req.params;
    
    const train = trainSchedules.find(t => t['열차번호'] === trainNo);
    
    if (!train) {
      return res.status(404).json({ error: '해당 열차를 찾을 수 없습니다' });
    }

    res.json(train);
  } catch (error) {
    console.error('조회 오류:', error);
    res.status(500).json({ error: '조회 중 오류가 발생했습니다' });
  }
});

// API 엔드포인트: 화물역 목록
app.get('/api/stations', (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.json(freightStations.slice(0, 50));
    }

    const results = freightStations.filter(station => 
      station['역명'] && station['역명'].includes(query)
    );

    res.json(results);
  } catch (error) {
    console.error('역 검색 오류:', error);
    res.status(500).json({ error: '역 검색 중 오류가 발생했습니다' });
  }
});

// API 엔드포인트: 모든 열차번호 목록 (자동완성용)
app.get('/api/trains', (req, res) => {
  try {
    const trainNumbers = trainSchedules.map(t => ({
      trainNo: t['열차번호'],
      route: `${t['시발역']} → ${t['종착역']}`,
      line: t['주운행선']
    }));

    res.json(trainNumbers);
  } catch (error) {
    console.error('목록 조회 오류:', error);
    res.status(500).json({ error: '목록 조회 중 오류가 발생했습니다' });
  }
});

// 헬스체크 엔드포인트
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    dataLoaded: {
      trains: trainSchedules.length,
      stations: freightStations.length
    }
  });
});

// 서버 시작
app.listen(PORT, async () => {
  console.log(`🚂 서버가 포트 ${PORT}에서 실행 중입니다`);
  await initializeData();
});

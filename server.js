import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import GameCipher from './cipher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const RENDER_LINK = process.env.RENDER_URL || 'https://ansovang.onrender.com';

// Quản lý trạng thái đa phòng độc lập (phạm vi theo từng phòng 6 số)
const rooms = {};

function createDefaultGameState(roomId = '123456') {
  const rid = String(roomId || '123456').trim() || '123456';
  return {
    roomId: rid,
    currentView: 'blank', // 'blank' | 'vong1' | 'vong2' | 'vong3' | 'vong4'
    roomAuth: {
      roomId: rid,
      passwords: {
        1: '1111',
        2: '2222',
        3: '3333',
        4: '4444'
      }
    },
    players: [
      { id: 1, name: 'Người chơi 1', score: 0 },
      { id: 2, name: 'Người chơi 2', score: 0 },
      { id: 3, name: 'Người chơi 3', score: 0 },
      { id: 4, name: 'Người chơi 4', score: 0 }
    ],
    questions: null,
    vong1State: {
      currentTurn: 1,
      qIndex1: 0,
      qIndex2: 0,
      activeQuestion: null,
      timerRunning: false,
      timerTurn: null,
      timerSeconds: 5,
      showAnswer: false,
      scored: false,
      answers: { 1: null, 2: null, 3: null, 4: null }
    },
    vong2State: {
      scene: 'topics_board',
      selectedTopicIndex: null,
      selectedTopicName: '',
      chosenTopics: [],
      questionType: 4,
      usedQuestionMap: {},
      activeQuestion: null,
      timerRunning: false,
      timerSeconds: 60,
      bets: { 1: 0, 2: 0, 3: 0, 4: 0 },
      showAnswer: false,
      activePlayerTurn: 1,
      scored: false,
      awardedScore: 0,
      showOnViewer: true
    },
    vong3State: {
      allowedBellPlayers: [1, 2, 3, 4],
      qIndex: 0,
      activeQuestion: null,
      isBoxesVisible: false,
      revealedStage: 0,
      isRunning: false,
      stepTimerSeconds: 7,
      bellRungBy: null,
      bellRungTime: null,
      rungPlayers: [],
      isBellLocked: true,
      usedQuestionIndices: [],
      showAnswer: false
    },
    vong4State: {
      totalMoney: 8000000,
      timerSeconds: 120,
      timerRunning: false,
      showGiftClue: false,
      selectedBoxId: null,
      boxes: [
        { id: 1, name: 'Đỏ', color: '#ff0000', text: 'Ô SỐ 1', money: 0, revealedMoney: false, revealedClue: false, moneyDeducted: false },
        { id: 2, name: 'Vàng', color: '#ffff00', text: 'Ô SỐ 2', darkText: true, money: 200000, revealedMoney: false, revealedClue: false, moneyDeducted: false },
        { id: 3, name: 'Xanh dương', color: '#0000ff', text: 'Ô SỐ 3', money: 300000, revealedMoney: false, revealedClue: false, moneyDeducted: false },
        { id: 4, name: 'Tím', color: '#800080', text: 'Ô SỐ 4', money: 500000, revealedMoney: false, revealedClue: false, moneyDeducted: false },
        { id: 5, name: 'Xám', color: '#808080', text: 'Ô SỐ 5', darkText: true, money: 0, revealedMoney: false, revealedClue: false, moneyDeducted: false },
        { id: 6, name: 'Cam', color: '#ff7700', text: 'Ô SỐ 6', darkText: true, money: 1000000, revealedMoney: false, revealedClue: false, moneyDeducted: false }
      ],
      showAnswer: false,
      resultStatus: null
    },
    chpState: {
      locked: true,
      buzzerWinner: null,
      allowedPlayerIds: [1, 2, 3, 4],
      allowedPlayerId: 'all'
    },
    audioState: {
      soundboard: {
        track: null,
        playing: false,
        loop: false,
        timestamp: 0
      },
      effects: {
        track: null,
        playing: false,
        loop: false,
        timestamp: 0
      }
    },
    lastUpdated: Date.now()
  };
}

function getRoomState(roomId = '123456') {
  const rid = String(roomId || '123456').trim() || '123456';
  if (!rooms[rid]) {
    rooms[rid] = createDefaultGameState(rid);
  }
  return rooms[rid];
}

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const distDir = path.join(__dirname, 'dist');
const staticDir = fs.existsSync(distDir) ? distDir : __dirname;

// Favicon endpoint để ngăn lỗi 404 trong Console trình duyệt
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Xử lý các request từ extension trình duyệt (/site_integration) trả về 200 để không sinh lỗi 403 trong console
app.use(['/site_integration', '/site_integration/*'], (req, res) => {
  res.status(200).json({ code: 200, status: 'ok', handled: true });
});

// Caching tối ưu cho tài nguyên tĩnh (Audio, fonts, styles) và ngăn cache HTML/JS
app.use((req, res, next) => {
  if (req.url && (req.url.includes('sync-client.js') || req.url.match(/\.html(\?|$)/i))) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else if (req.url && req.url.match(/\.(mp3|wav|ogg|png|jpg|jpeg|gif|svg|woff2?)$/i)) {
    // Cache âm thanh và tài nguyên tĩnh 7 ngày để chạy mượt mà kể cả khi mạng yếu
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  }
  next();
});

const staticOptions = {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
};

app.use(express.static(staticDir, staticOptions));
if (staticDir !== __dirname) {
  app.use(express.static(__dirname, staticOptions));
}

let sseClients = [];
function broadcastSSE(roomId = '123456') {
  const rid = String(roomId || '123456').trim() || '123456';
  const targetState = getRoomState(rid);
  const now = Date.now();
  const encPayload = GameCipher.encrypt({
    ...targetState,
    serverTime: now
  });
  const sseData = `data: ${JSON.stringify({ payload: encPayload, serverTime: now })}\n\n`;

  sseClients = sseClients.filter(client => {
    if (client.roomId && client.roomId !== rid) return true;
    try {
      client.res.write(sseData);
      if (typeof client.res.flush === 'function') client.res.flush();
      return true;
    } catch (e) {
      return false;
    }
  });
}

// Gửi tín hiệu Heartbeat ping định kỳ 2.5s để giữ kết nối SSE luôn thông suốt, không bao giờ bị nghẽn hay trễ mạng
setInterval(() => {
  sseClients = sseClients.filter(client => {
    try {
      client.res.write(':ping\n\n');
      if (typeof client.res.flush === 'function') client.res.flush();
      return true;
    } catch (e) {
      return false;
    }
  });
}, 2500);

// API Lấy mốc thời gian chuẩn của Server (NTP Time Sync) để đồng bộ đồng hồ tuyệt đối giữa mọi máy
app.get('/api/game/time', (req, res) => {
  res.json({ serverTime: Date.now(), clientTime: req.query._t ? Number(req.query._t) : undefined });
});

// API Server-Sent Events (SSE) theo từng phòng độc lập (0ms delay, triệt tiêu hoàn toàn proxy buffering trên OnRender / Local)
app.get('/api/game/events', (req, res) => {
  const roomId = String(req.query.roomid || '123456').trim() || '123456';

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform, no-store, must-revalidate',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Vô hiệu hóa bộ đệm NGINX / Render reverse proxy
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*'
  });

  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  if (req.socket) {
    req.socket.setNoDelay(true); // Tắt Nagle algorithm, gửi gói tin ngay lập tức (0ms)
    req.socket.setKeepAlive(true, 1000);
  }

  // Gửi 2KB padding comment để ngay lập tức vượt qua ngưỡng đệm 1KB-2KB của các proxy trung gian
  res.write(':' + ' '.repeat(2048) + '\n\n');

  const targetState = getRoomState(roomId);
  const now = Date.now();
  const encPayload = GameCipher.encrypt({
    ...targetState,
    serverTime: now
  });
  res.write(`data: ${JSON.stringify({ payload: encPayload, serverTime: now })}\n\n`);
  if (typeof res.flush === 'function') res.flush();

  const clientObj = { res, roomId };
  sseClients.push(clientObj);
  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== clientObj);
  });
});

// API Lấy trạng thái game của phòng hiện tại
app.get('/api/game/state', (req, res) => {
  const roomId = String(req.query.roomid || '123456').trim() || '123456';
  const targetState = getRoomState(roomId);
  const now = Date.now();
  const encPayload = GameCipher.encrypt({
    ...targetState,
    serverTime: now
  });
  res.json({ payload: encPayload, serverTime: now });
});

// API Cập nhật trạng thái phòng (Nhận và trả dữ liệu mã hóa)
app.post('/api/game/state', (req, res) => {
  let data = req.body;
  if (data && data.payload && typeof data.payload === 'string') {
    const decrypted = GameCipher.decrypt(data.payload);
    if (decrypted) {
      data = decrypted;
    }
  }

  const roomId = String(req.query.roomid || data.roomId || data.roomAuth?.roomId || '123456').trim() || '123456';
  const gameState = getRoomState(roomId);

  if (data.currentView) gameState.currentView = data.currentView;
  if (data.players) gameState.players = data.players;
  if (data.questions) gameState.questions = data.questions;

  if (data.roomAuth) {
    gameState.roomAuth = {
      ...(gameState.roomAuth || {}),
      ...data.roomAuth,
      passwords: {
        ...(gameState.roomAuth?.passwords || {}),
        ...(data.roomAuth.passwords || {})
      }
    };
    if (data.roomAuth.roomId && data.roomAuth.roomId !== roomId) {
      rooms[data.roomAuth.roomId] = gameState;
    }
  }

  if (data.vong1State) {
    const prevV1 = gameState.vong1State || {};
    const nextV1 = { ...data.vong1State };

    // SERVER-AUTHORITATIVE TIMER VÒNG 1
    const serverNow = Date.now();
    const isStart = nextV1.isStartTimer === true;
    const isReset = nextV1.isResetTimer === true;
    const isStop = nextV1.isStopTimer === true;

    delete nextV1.isStartTimer;
    delete nextV1.isResetTimer;
    delete nextV1.isStopTimer;

    const isExplicitReset = (isReset && nextV1.timerRunning !== true);
    const isExplicitStart = (
      isStart ||
      (isReset && nextV1.timerRunning === true) ||
      (nextV1.timerRunning === true && !prevV1.timerRunning)
    );
    const isExplicitStop = (
      isStop ||
      (nextV1.timerRunning === false && prevV1.timerRunning === true)
    );

    if (isExplicitReset) {
      const dur = Number(nextV1.timerDuration || nextV1.timerSeconds || 5);
      nextV1.timerDuration = dur;
      nextV1.timerSeconds = dur;
      nextV1.timerStartTime = 0;
      nextV1.timerEndTime = 0;
      nextV1.timerRunning = false;
    } else if (isExplicitStart) {
      const dur = Number(nextV1.timerDuration || nextV1.timerSeconds || 5);
      nextV1.timerDuration = dur;
      nextV1.timerStartTime = serverNow;
      nextV1.timerEndTime = serverNow + dur * 1000;
      nextV1.timerSeconds = dur;
      nextV1.timerRunning = true;
    } else if (isExplicitStop) {
      let stoppedSec = nextV1.timerSeconds;
      if (typeof stoppedSec !== 'number') {
        const prevEnd = Number(prevV1.timerEndTime) || 0;
        stoppedSec = prevEnd > serverNow ? Math.max(0, Math.ceil((prevEnd - serverNow) / 1000)) : 0;
      }
      nextV1.timerSeconds = Math.max(0, stoppedSec);
      nextV1.timerStartTime = 0;
      nextV1.timerEndTime = 0;
      nextV1.timerRunning = false;
    } else {
      if (prevV1.timerRunning && prevV1.timerEndTime > 0 && prevV1.timerEndTime <= serverNow) {
        nextV1.timerRunning = false;
        nextV1.timerEndTime = 0;
        nextV1.timerSeconds = 0;
      } else {
        nextV1.timerRunning = prevV1.timerRunning || false;
        nextV1.timerStartTime = prevV1.timerStartTime || 0;
        nextV1.timerEndTime = prevV1.timerEndTime || 0;
        nextV1.timerDuration = prevV1.timerDuration || 5;
        nextV1.timerSeconds = (typeof prevV1.timerSeconds === 'number') ? prevV1.timerSeconds : 5;
      }
    }

    // Bảo toàn đáp án các thí sinh (không để một cập nhật từ Controller hay Player khác xóa mất đáp án)
    let mergedAnswers = {
      ...(prevV1.answers || {})
    };
    if (nextV1.answers && typeof nextV1.answers === 'object') {
      mergedAnswers = {
        ...mergedAnswers,
        ...nextV1.answers
      };
    }
    // Nếu là câu hỏi mới thì khởi tạo lại đáp án
    const isNewQ = nextV1.isNewQuestion || (
      nextV1.activeQuestion && prevV1.activeQuestion &&
      (nextV1.activeQuestion.index !== prevV1.activeQuestion.index || nextV1.activeQuestion.turn !== prevV1.activeQuestion.turn)
    );
    if (isNewQ) {
      mergedAnswers = nextV1.answers || {};
    }

    gameState.vong1State = {
      ...prevV1,
      ...nextV1,
      answers: mergedAnswers
    };
  }

  if (data.vong2State) {
    const prevV2 = gameState.vong2State || {};
    const nextV2 = { ...data.vong2State };

    // SERVER-AUTHORITATIVE TIMER 60s VÒNG 2
    const serverNow = Date.now();
    const isStart = nextV2.isStartTimer === true;
    const isReset = nextV2.isResetTimer === true;
    const isStop = nextV2.isStopTimer === true;

    delete nextV2.isStartTimer;
    delete nextV2.isResetTimer;
    delete nextV2.isStopTimer;

    const isExplicitReset = (isReset && nextV2.timerRunning !== true);
    const isExplicitStart = (
      isStart ||
      (isReset && nextV2.timerRunning === true) ||
      (nextV2.timerRunning === true && !prevV2.timerRunning)
    );
    const isExplicitStop = (
      isStop ||
      (nextV2.timerRunning === false && prevV2.timerRunning === true)
    );

    if (isExplicitReset) {
      const dur = Number(nextV2.timerDuration || nextV2.timerSeconds || 60);
      nextV2.timerDuration = dur;
      nextV2.timerSeconds = dur;
      nextV2.timerStartTime = 0;
      nextV2.timerEndTime = 0;
      nextV2.timerRunning = false;
    } else if (isExplicitStart) {
      const dur = Number(nextV2.timerDuration || nextV2.timerSeconds || 60);
      nextV2.timerDuration = dur;
      nextV2.timerStartTime = serverNow;
      nextV2.timerEndTime = serverNow + dur * 1000;
      nextV2.timerSeconds = dur;
      nextV2.timerRunning = true;
    } else if (isExplicitStop) {
      let stoppedSec = nextV2.timerSeconds;
      if (typeof stoppedSec !== 'number') {
        const prevEnd = Number(prevV2.timerEndTime) || 0;
        stoppedSec = prevEnd > serverNow ? Math.max(0, Math.ceil((prevEnd - serverNow) / 1000)) : 0;
      }
      nextV2.timerSeconds = Math.max(0, stoppedSec);
      nextV2.timerStartTime = 0;
      nextV2.timerEndTime = 0;
      nextV2.timerRunning = false;
    } else {
      if (prevV2.timerRunning && prevV2.timerEndTime > 0 && prevV2.timerEndTime <= serverNow) {
        nextV2.timerRunning = false;
        nextV2.timerEndTime = 0;
        nextV2.timerSeconds = 0;
      } else {
        nextV2.timerRunning = prevV2.timerRunning || false;
        nextV2.timerStartTime = prevV2.timerStartTime || 0;
        nextV2.timerEndTime = prevV2.timerEndTime || 0;
        nextV2.timerDuration = prevV2.timerDuration || 60;
        nextV2.timerSeconds = (typeof prevV2.timerSeconds === 'number') ? prevV2.timerSeconds : 60;
      }
    }

    const mergedChosen = Array.isArray(nextV2.chosenTopics)
      ? nextV2.chosenTopics
      : (prevV2.chosenTopics || []);

    const mergedBets = (nextV2.isResetBets || (nextV2.bets && Object.keys(nextV2.bets).length === 4 && nextV2.bets[1] === 0 && nextV2.bets[2] === 0 && nextV2.bets[3] === 0 && nextV2.bets[4] === 0))
      ? (nextV2.bets || { 1: 0, 2: 0, 3: 0, 4: 0 })
      : { ...(prevV2.bets || {}), ...(nextV2.bets || {}) };

    const mergedUsedMap = {
      ...(prevV2.usedQuestionMap || {}),
      ...(nextV2.usedQuestionMap || {})
    };

    gameState.vong2State = {
      ...prevV2,
      ...nextV2,
      chosenTopics: mergedChosen,
      bets: mergedBets,
      usedQuestionMap: mergedUsedMap
    };
  }

  if (data.vong3State) {
    const prevV3 = gameState.vong3State || {};
    const nextV3 = { ...data.vong3State };

    // SERVER-AUTHORITATIVE STEP TIMER 7s VÒNG 3
    const serverNow = Date.now();
    const isNowRunning = nextV3.isRunning === true || nextV3.stepTimerRunning === true;
    const wasRunning = prevV3.isRunning === true || prevV3.stepTimerRunning === true;

    const isExplicitStart = (nextV3.isStartTimer === true || nextV3.isResetTimer === true);
    const isExplicitStop = (nextV3.isStopTimer === true || ((nextV3.isRunning === false || nextV3.stepTimerRunning === false) && wasRunning));

    delete nextV3.isStartTimer;
    delete nextV3.isResetTimer;
    delete nextV3.isStopTimer;

    if (isExplicitStart) {
      const dur = Number(nextV3.stepTimerDuration || nextV3.stepTimerSeconds || 7);
      nextV3.stepTimerDuration = dur;
      nextV3.stepTimerStartTime = serverNow;
      nextV3.stepTimerEndTime = (nextV3.isResetTimer && !isNowRunning) ? 0 : (serverNow + dur * 1000);
      nextV3.stepTimerSeconds = dur;
      nextV3.stepTimerRunning = (nextV3.isResetTimer && !isNowRunning) ? false : true;
      nextV3.isRunning = nextV3.stepTimerRunning;
    } else if (isExplicitStop) {
      let stoppedSec = nextV3.stepTimerSeconds;
      if (typeof stoppedSec !== 'number') {
        const prevEnd = Number(prevV3.stepTimerEndTime) || 0;
        stoppedSec = prevEnd > serverNow ? Math.max(0, Math.ceil((prevEnd - serverNow) / 1000)) : 0;
      }
      nextV3.stepTimerSeconds = Math.max(0, stoppedSec);
      nextV3.stepTimerEndTime = 0;
      nextV3.stepTimerRunning = false;
      nextV3.isRunning = false;
    } else {
      nextV3.isRunning = prevV3.isRunning || false;
      nextV3.stepTimerRunning = prevV3.stepTimerRunning || false;
      nextV3.stepTimerStartTime = prevV3.stepTimerStartTime || 0;
      nextV3.stepTimerEndTime = prevV3.stepTimerEndTime || 0;
      nextV3.stepTimerDuration = prevV3.stepTimerDuration || 7;
      nextV3.stepTimerSeconds = (typeof prevV3.stepTimerSeconds === 'number') ? prevV3.stepTimerSeconds : 7;
    }

    let newRevealedStage = nextV3.revealedStage;
    if (!nextV3.isNewQuestion && typeof prevV3.revealedStage === 'number' && typeof nextV3.revealedStage === 'number') {
      newRevealedStage = Math.max(prevV3.revealedStage, nextV3.revealedStage);
    }

    let newBellRungBy = nextV3.bellRungBy;
    let newIsBellLocked = nextV3.isBellLocked;
    let newRungPlayers = nextV3.rungPlayers || prevV3.rungPlayers || [];

    if (prevV3.bellRungBy && nextV3.bellRungBy === null && !nextV3.isResetBuzzer && !nextV3.isNewQuestion) {
      newBellRungBy = prevV3.bellRungBy;
      newIsBellLocked = true;
      if (!newRungPlayers.includes(prevV3.bellRungBy)) {
        newRungPlayers = [...newRungPlayers, prevV3.bellRungBy];
      }
    }

    gameState.vong3State = {
      ...prevV3,
      ...nextV3,
      revealedStage: newRevealedStage ?? prevV3.revealedStage,
      bellRungBy: newBellRungBy,
      isBellLocked: newIsBellLocked,
      rungPlayers: newRungPlayers
    };
  }

  if (data.vong4State) {
    const prevV4 = gameState.vong4State || {};
    const nextV4 = { ...data.vong4State };

    // SERVER-AUTHORITATIVE TIMER 120s VÒNG 4
    const serverNow = Date.now();
    const isStart = nextV4.isStartTimer === true;
    const isReset = nextV4.isResetTimer === true;
    const isStop = nextV4.isStopTimer === true;

    delete nextV4.isStartTimer;
    delete nextV4.isResetTimer;
    delete nextV4.isStopTimer;

    const isExplicitReset = (isReset && nextV4.timerRunning !== true);
    const isExplicitStart = (
      isStart ||
      (isReset && nextV4.timerRunning === true) ||
      (nextV4.timerRunning === true && !prevV4.timerRunning)
    );
    const isExplicitStop = (
      isStop ||
      (nextV4.timerRunning === false && prevV4.timerRunning === true)
    );

    if (isExplicitReset) {
      const dur = Number(nextV4.timerDuration || nextV4.timerSeconds || 120);
      nextV4.timerDuration = dur;
      nextV4.timerSeconds = dur;
      nextV4.timerStartTime = 0;
      nextV4.timerEndTime = 0;
      nextV4.timerRunning = false;
    } else if (isExplicitStart) {
      const dur = Number(nextV4.timerDuration || nextV4.timerSeconds || 120);
      nextV4.timerDuration = dur;
      nextV4.timerStartTime = serverNow;
      nextV4.timerEndTime = serverNow + dur * 1000;
      nextV4.timerSeconds = dur;
      nextV4.timerRunning = true;
    } else if (isExplicitStop) {
      let stoppedSec = nextV4.timerSeconds;
      if (typeof stoppedSec !== 'number') {
        const prevEnd = Number(prevV4.timerEndTime) || 0;
        stoppedSec = prevEnd > serverNow ? Math.max(0, Math.ceil((prevEnd - serverNow) / 1000)) : 0;
      }
      nextV4.timerSeconds = Math.max(0, stoppedSec);
      nextV4.timerStartTime = 0;
      nextV4.timerEndTime = 0;
      nextV4.timerRunning = false;
    } else {
      if (prevV4.timerRunning && prevV4.timerEndTime > 0 && prevV4.timerEndTime <= serverNow) {
        nextV4.timerRunning = false;
        nextV4.timerEndTime = 0;
        nextV4.timerSeconds = 0;
      } else {
        nextV4.timerRunning = prevV4.timerRunning || false;
        nextV4.timerStartTime = prevV4.timerStartTime || 0;
        nextV4.timerEndTime = prevV4.timerEndTime || 0;
        nextV4.timerDuration = prevV4.timerDuration || 120;
        nextV4.timerSeconds = (typeof prevV4.timerSeconds === 'number') ? prevV4.timerSeconds : 120;
      }
    }

    let mergedBoxes = nextV4.boxes || prevV4.boxes;
    if (nextV4.isResetVong4) {
      mergedBoxes = nextV4.boxes;
      delete nextV4.isResetVong4;
    } else if (prevV4.boxes && nextV4.boxes) {
      mergedBoxes = nextV4.boxes.map((b, idx) => {
        const prevBox = prevV4.boxes.find(p => p.id === b.id) || prevV4.boxes[idx] || {};
        return {
          ...b,
          revealedMoney: b.revealedMoney !== undefined ? b.revealedMoney : (prevBox.revealedMoney || false),
          revealedClue: b.revealedClue !== undefined ? b.revealedClue : (prevBox.revealedClue || false)
        };
      });
    }

    gameState.vong4State = {
      ...prevV4,
      ...nextV4,
      boxes: mergedBoxes
    };
  }

  if (data.chpState) {
    gameState.chpState = {
      ...(gameState.chpState || {}),
      ...data.chpState
    };
  }

  if (data.audioState) {
    gameState.audioState = {
      ...(gameState.audioState || {}),
      soundboard: {
        ...(gameState.audioState?.soundboard || {}),
        ...(data.audioState.soundboard || {})
      },
      effects: {
        ...(gameState.audioState?.effects || {}),
        ...(data.audioState.effects || {})
      }
    };
  }

  gameState.lastUpdated = Date.now();
  broadcastSSE(roomId);
  const encPayload = GameCipher.encrypt(gameState);
  res.json({ payload: encPayload });
});

// API Gửi đáp án thí sinh siêu tốc (Ultra-lightweight 0ms endpoint - ghi nhận tức thì 100% trên mọi mạng yếu/lag)
app.post('/api/game/answer', (req, res) => {
  let data = req.body || {};
  if (data && data.payload && typeof data.payload === 'string') {
    const decrypted = GameCipher.decrypt(data.payload);
    if (decrypted) data = decrypted;
  }
  const roomId = String(req.query.roomid || data.roomId || '123456').trim() || '123456';
  const playerId = Number(data.playerId);
  const answer = String(data.answer || '').trim();

  if (playerId >= 1 && playerId <= 4 && answer) {
    const gameState = getRoomState(roomId);
    if (!gameState.vong1State) gameState.vong1State = {};
    if (!gameState.vong1State.answers) gameState.vong1State.answers = {};

    // Ghi nhận ngay lập tức đáp án của người chơi
    gameState.vong1State.answers[playerId] = answer;
    gameState.lastUpdated = Date.now();

    // Phát tín hiệu SSE siêu tốc đến Controller & Host & Viewer
    broadcastSSE(roomId);
    const encPayload = GameCipher.encrypt({ success: true, playerId, answer, recorded: true });
    return res.json({ payload: encPayload });
  }

  res.status(400).json({ error: 'Dữ liệu đáp án không hợp lệ' });
});

// API Cập nhật Audio siêu tốc (<5ms)
app.post('/api/game/audio', (req, res) => {
  let data = req.body;
  if (data && data.payload && typeof data.payload === 'string') {
    const decrypted = GameCipher.decrypt(data.payload);
    if (decrypted) data = decrypted;
  }
  const roomId = String(req.query.roomid || data.roomId || '123456').trim() || '123456';
  const gameState = getRoomState(roomId);
  const subType = data.subType || 'soundboard';
  const now = Date.now();

  if (!gameState.audioState) gameState.audioState = {};

  if (subType === 'effects') {
    gameState.audioState.effects = {
      track: data.track || null,
      playing: !!data.playing,
      loop: !!data.loop,
      timestamp: data.timestamp || now
    };
  } else {
    gameState.audioState.soundboard = {
      track: data.track || null,
      playing: !!data.playing,
      loop: !!data.loop,
      timestamp: data.timestamp || now
    };
  }
  gameState.lastUpdated = now;
  broadcastSSE(roomId);
  const encPayload = GameCipher.encrypt({ success: true, audioState: gameState.audioState, lastUpdated: gameState.lastUpdated });
  res.json({ payload: encPayload });
});

// API Chuyển View
app.post('/api/game/view', (req, res) => {
  let data = req.body;
  if (data && data.payload && typeof data.payload === 'string') {
    const decrypted = GameCipher.decrypt(data.payload);
    if (decrypted) data = decrypted;
  }
  const roomId = String(req.query.roomid || data.roomId || '123456').trim() || '123456';
  const gameState = getRoomState(roomId);
  const { view } = data;
  if (!view) return res.status(400).json({ error: 'Thiếu view' });
  gameState.currentView = view;
  gameState.lastUpdated = Date.now();
  console.log(`[GameState] [Room ${roomId}] View đã chuyển sang: ${view}`);
  broadcastSSE(roomId);
  const encPayload = GameCipher.encrypt({ success: true, currentView: gameState.currentView, lastUpdated: gameState.lastUpdated });
  res.json({ payload: encPayload });
});

// API Cập nhật tên 4 người chơi
app.post('/api/game/players', (req, res) => {
  let data = req.body;
  if (data && data.payload && typeof data.payload === 'string') {
    const decrypted = GameCipher.decrypt(data.payload);
    if (decrypted) data = decrypted;
  }
  const roomId = String(req.query.roomid || data.roomId || '123456').trim() || '123456';
  const gameState = getRoomState(roomId);
  const { players } = data;
  if (!Array.isArray(players) || players.length !== 4) {
    return res.status(400).json({ error: 'Cần danh sách 4 người chơi' });
  }
  gameState.players = players.map((p, idx) => ({
    id: idx + 1,
    name: p.name || `Người chơi ${idx + 1}`,
    score: typeof p.score === 'number' ? p.score : (gameState.players[idx]?.score || 0)
  }));
  gameState.lastUpdated = Date.now();
  console.log(`[GameState] [Room ${roomId}] Đã cập nhật người chơi:`, gameState.players.map(p => p.name));
  broadcastSSE(roomId);
  const encPayload = GameCipher.encrypt({ success: true, players: gameState.players, lastUpdated: gameState.lastUpdated });
  res.json({ payload: encPayload });
});

// API Nhập / Cập nhật đề câu hỏi từ Excel
app.post('/api/game/questions', (req, res) => {
  let data = req.body;
  if (data && data.payload && typeof data.payload === 'string') {
    const decrypted = GameCipher.decrypt(data.payload);
    if (decrypted) data = decrypted;
  }
  const roomId = String(req.query.roomid || data.roomId || '123456').trim() || '123456';
  const gameState = getRoomState(roomId);
  const { questions } = data;
  if (!questions) return res.status(400).json({ error: 'Thiếu dữ liệu câu hỏi' });
  gameState.questions = questions;
  gameState.lastUpdated = Date.now();
  console.log(`[GameState] [Room ${roomId}] Đã nạp đề câu hỏi từ file Excel vào hệ thống`);
  broadcastSSE(roomId);
  const encPayload = GameCipher.encrypt({ success: true, lastUpdated: gameState.lastUpdated });
  res.json({ payload: encPayload });
});

// Endpoint trả về trực tiếp file Excel gốc nếu client yêu cầu đọc
app.get('/api/game/excel-file', (req, res) => {
  const excelPaths = [
    path.join(__dirname, 'Ẩn số vàng.xlsx'),
    path.join(staticDir, 'Ẩn số vàng.xlsx'),
  ];
  for (const p of excelPaths) {
    if (fs.existsSync(p)) {
      return res.sendFile(p);
    }
  }
  res.status(404).json({ error: 'Chưa có file Excel trên máy chủ' });
});

// Danh sách các file HTML theo vai trò
const rolePages = [
  { name: 'Controller', file: 'Controller.html', routes: ['/controller', '/Controller', '/Controller.html'] },
  { name: 'Host', file: 'Host.html', routes: ['/host', '/Host', '/Host.html'] },
  { name: 'Player 1', file: 'Player1.html', routes: ['/player1', '/Player1', '/Player1.html'] },
  { name: 'Player 2', file: 'Player2.html', routes: ['/player2', '/Player2', '/Player2.html'] },
  { name: 'Player 3', file: 'Player3.html', routes: ['/player3', '/Player3', '/Player3.html'] },
  { name: 'Player 4', file: 'Player4.html', routes: ['/player4', '/Player4', '/Player4.html'] },
  { name: 'Viewer', file: 'Viewer.html', routes: ['/viewer', '/Viewer', '/Viewer.html'] },
];

rolePages.forEach((page) => {
  const handler = (req, res) => {
    let filePath = path.join(staticDir, page.file);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(__dirname, page.file);
    }
    if (fs.existsSync(filePath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return res.sendFile(filePath);
    }
    res.status(404).send(`Không tìm thấy file ${page.file}`);
  };

  page.routes.forEach((route) => {
    app.get(route, handler);
  });
});

app.get('/', (req, res) => {
  const indexPath = path.join(staticDir, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);

  const fallbackIndex = path.join(__dirname, 'index.html');
  if (fs.existsSync(fallbackIndex)) return res.sendFile(fallbackIndex);

  const controllerPath = path.join(__dirname, 'Controller.html');
  if (fs.existsSync(controllerPath)) return res.sendFile(controllerPath);

  res.status(404).send('Không tìm thấy trang chủ.');
});

// Trạng thái hệ thống & OnRender
app.get('/api/status', (req, res) => {
  const roomId = String(req.query.roomid || '123456').trim() || '123456';
  const defaultState = getRoomState(roomId);
  res.json({
    appName: 'Ẩn Số Vàng Hub',
    status: 'running',
    port: PORT,
    renderConnection: {
      targetUrl: RENDER_LINK,
      status: 'configured',
      latencyMs: 1,
    },
    gameState: {
      roomId: roomId,
      currentView: defaultState.currentView,
      playersCount: defaultState.players.length,
      hasQuestions: !defaultState.questions,
      lastUpdated: defaultState.lastUpdated
    },
    pages: rolePages.map((p) => ({
      name: p.name,
      file: p.file,
      url: p.routes[0],
    })),
  });
});

// Proxy chuyển tiếp tới OnRender
app.all('/api/render/*', async (req, res) => {
  try {
    const targetPath = req.params[0] || '';
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const targetUrl = `${RENDER_LINK.replace(/\/$/, '')}/${targetPath}${query}`;

    const headers = { ...req.headers };
    delete headers.host;

    const fetchOptions = {
      method: req.method,
      headers,
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
      fetchOptions.headers['content-type'] = 'application/json';
    }

    const response = await fetch(targetUrl, fetchOptions);
    const contentType = response.headers.get('content-type') || '';

    res.status(response.status);
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return res.json(data);
    } else {
      const text = await response.text();
      return res.send(text);
    }
  } catch (error) {
    res.status(502).json({
      error: 'Lỗi kết nối tới máy chủ OnRender',
      renderUrl: RENDER_LINK,
      message: error.message,
    });
  }
});

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

app.listen(PORT, '0.0.0.0', () => {
  const localIps = getLocalIpAddresses();
  console.log(`\n================================================================`);
  console.log(`🚀 ẨN SỐ VÀNG - HỆ THỐNG MÁY CHỦ SẴN SÀNG CHẠY CẢ LOCAL & ONRENDER`);
  console.log(`================================================================`);
  console.log(`📡 Chạy Local máy này: http://localhost:${PORT}`);
  if (localIps.length > 0) {
    localIps.forEach(ip => {
      console.log(`🌐 Trong mạng LAN / Wi-Fi: http://${ip}:${PORT}`);
    });
  }
  console.log(`----------------------------------------------------------------`);
  console.log(`💻 Controller:  http://localhost:${PORT}/Controller.html`);
  console.log(`🎤 Host:        http://localhost:${PORT}/Host.html`);
  console.log(`📺 Viewer:      http://localhost:${PORT}/Viewer.html`);
  console.log(`👤 Players:     http://localhost:${PORT}/Player1.html ... Player4.html`);
  console.log(`☁️ OnRender:    ${RENDER_LINK}`);
  console.log(`================================================================\n`);
});

export default app;

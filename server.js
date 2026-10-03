import express from 'express';
import path from 'path';
import fs from 'fs';
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
        { id: 5, name: 'Xám', color: '#808080', text: 'Ô SỐ 5', money: 0, revealedMoney: false, revealedClue: false, moneyDeducted: false },
        { id: 6, name: 'Cam', color: '#ffa500', text: 'Ô SỐ 6', money: 1000000, revealedMoney: false, revealedClue: false, moneyDeducted: false }
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

// Ngăn trình duyệt cache file sync-client.js
app.use((req, res, next) => {
  if (req.url && req.url.includes('sync-client.js')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

app.use(express.static(staticDir));
if (staticDir !== __dirname) {
  app.use(express.static(__dirname));
}

let sseClients = [];
function broadcastSSE(roomId = '123456') {
  const rid = String(roomId || '123456').trim() || '123456';
  const targetState = getRoomState(rid);
  const encPayload = GameCipher.encrypt(targetState);
  const sseData = `data: ${JSON.stringify({ payload: encPayload })}\n\n`;

  sseClients = sseClients.filter(client => {
    if (client.roomId && client.roomId !== rid) return true;
    try {
      client.res.write(sseData);
      return true;
    } catch (e) {
      return false;
    }
  });
}

// API Server-Sent Events (SSE) theo từng phòng độc lập
app.get('/api/game/events', (req, res) => {
  const roomId = String(req.query.roomid || '123456').trim() || '123456';
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  const targetState = getRoomState(roomId);
  const encPayload = GameCipher.encrypt(targetState);
  res.write(`data: ${JSON.stringify({ payload: encPayload })}\n\n`);
  sseClients.push({ res, roomId });
  req.on('close', () => {
    sseClients = sseClients.filter(c => c.res !== res);
  });
});

// API Lấy trạng thái game của phòng hiện tại
app.get('/api/game/state', (req, res) => {
  const roomId = String(req.query.roomid || '123456').trim() || '123456';
  const targetState = getRoomState(roomId);
  const encPayload = GameCipher.encrypt(targetState);
  res.json({ payload: encPayload });
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
    gameState.vong1State = {
      ...(gameState.vong1State || {}),
      ...data.vong1State
    };
  }

  if (data.vong2State) {
    const prevV2 = gameState.vong2State || {};
    const nextV2 = data.vong2State;
    const mergedChosen = (nextV2.isResetVong2 || nextV2.chosenTopics === null)
      ? (nextV2.chosenTopics || [])
      : Array.from(new Set([...(prevV2.chosenTopics || []), ...(nextV2.chosenTopics || [])]));

    gameState.vong2State = {
      ...prevV2,
      ...nextV2,
      chosenTopics: mergedChosen
    };
  }

  if (data.vong3State) {
    const prevV3 = gameState.vong3State || {};
    const nextV3 = data.vong3State;

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
    const nextV4 = data.vong4State;

    let mergedBoxes = nextV4.boxes || prevV4.boxes;
    if (prevV4.boxes && nextV4.boxes && !nextV4.isResetVong4) {
      mergedBoxes = nextV4.boxes.map((b, idx) => {
        const prevBox = prevV4.boxes.find(p => p.id === b.id) || prevV4.boxes[idx] || {};
        return {
          ...b,
          revealedMoney: b.revealedMoney || prevBox.revealedMoney || false,
          revealedClue: b.revealedClue || prevBox.revealedClue || false
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
      ...data.audioState,
      soundboard: {
        ...(gameState.audioState?.soundboard || {}),
        ...(data.audioState.soundboard || {})
      },
      effects: {
        ...(gameState.audioState?.effects || {})
      }
    };
  }

  gameState.lastUpdated = Date.now();
  broadcastSSE(roomId);
  const encPayload = GameCipher.encrypt(gameState);
  res.json({ payload: encPayload });
});

// API Cập nhật Audio
app.post('/api/game/audio', (req, res) => {
  let data = req.body;
  if (data && data.payload && typeof data.payload === 'string') {
    const decrypted = GameCipher.decrypt(data.payload);
    if (decrypted) data = decrypted;
  }
  gameState.audioState = {
    ...gameState.audioState,
    soundboard: {
      track: data.track || null,
      playing: !!data.playing,
      loop: !!data.loop,
      timestamp: Date.now()
    }
  };
  gameState.lastUpdated = Date.now();
  broadcastSSE();
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
  const { view } = data;
  if (!view) return res.status(400).json({ error: 'Thiếu view' });
  gameState.currentView = view;
  gameState.lastUpdated = Date.now();
  console.log(`[GameState] View đã chuyển sang: ${view}`);
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
  console.log('[GameState] Đã cập nhật người chơi:', gameState.players.map(p => p.name));
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
  const { questions } = data;
  if (!questions) return res.status(400).json({ error: 'Thiếu dữ liệu câu hỏi' });
  gameState.questions = questions;
  gameState.lastUpdated = Date.now();
  console.log('[GameState] Đã nạp đề câu hỏi từ file Excel vào hệ thống');
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
  res.json({
    appName: 'An Số Vàng Hub',
    status: 'running',
    port: PORT,
    renderConnection: {
      targetUrl: RENDER_LINK,
      status: 'configured',
      latencyMs: 1,
    },
    gameState: {
      currentView: gameState.currentView,
      playersCount: gameState.players.length,
      hasQuestions: !!gameState.questions,
      lastUpdated: gameState.lastUpdated
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] An Số Vàng server đang lắng nghe tại: http://0.0.0.0:${PORT}`);
  console.log(`[Server] Link kết nối OnRender: ${RENDER_LINK}`);
});

export default app;

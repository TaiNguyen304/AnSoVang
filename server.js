import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const RENDER_LINK = process.env.RENDER_URL || 'https://ansovang.onrender.com';

// Trạng thái dùng chung giữa các màn hình (Controller, Host, Player 1-4, Viewer)
// KHÔNG CHÈN BẤT KỲ CÂU HỎI NÀO TRONG CODE. Dữ liệu câu hỏi chỉ được nạp từ file Excel.
const gameState = {
  currentView: 'blank', // 'blank' | 'vong1' | 'vong2' | 'vong3' | 'vong4'
  players: [
    { id: 1, name: 'Người chơi 1', score: 0 },
    { id: 2, name: 'Người chơi 2', score: 0 },
    { id: 3, name: 'Người chơi 3', score: 0 },
    { id: 4, name: 'Người chơi 4', score: 0 }
  ],
  questions: null, // Khởi tạo null, chờ nạp từ file Excel
  lastUpdated: Date.now()
};

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
app.use(express.static(staticDir));

// API Lấy trạng thái game hiện tại
app.get('/api/game/state', (req, res) => {
  res.json(gameState);
});

// API Chuyển View
app.post('/api/game/view', (req, res) => {
  const { view } = req.body;
  if (!view) return res.status(400).json({ error: 'Thiếu view' });
  gameState.currentView = view;
  gameState.lastUpdated = Date.now();
  console.log(`[GameState] View đã chuyển sang: ${view}`);
  res.json({ success: true, currentView: gameState.currentView, lastUpdated: gameState.lastUpdated });
});

// API Cập nhật tên 4 người chơi
app.post('/api/game/players', (req, res) => {
  const { players } = req.body;
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
  res.json({ success: true, players: gameState.players, lastUpdated: gameState.lastUpdated });
});

// API Nhập / Cập nhật đề câu hỏi từ Excel
app.post('/api/game/questions', (req, res) => {
  const { questions } = req.body;
  if (!questions) return res.status(400).json({ error: 'Thiếu dữ liệu câu hỏi' });
  gameState.questions = questions;
  gameState.lastUpdated = Date.now();
  console.log('[GameState] Đã nạp đề câu hỏi từ file Excel vào hệ thống');
  res.json({ success: true, lastUpdated: gameState.lastUpdated });
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
app.get('/api/status', async (req, res) => {
  let renderStatus = 'unknown';
  let latencyMs = 0;

  try {
    const startTime = Date.now();
    const response = await fetch(RENDER_LINK, {
      method: 'HEAD',
      signal: AbortSignal.timeout(6000),
    }).catch(() => null);

    latencyMs = Date.now() - startTime;
    renderStatus = response ? `online (${response.status})` : 'offline / unreachable';
  } catch (err) {
    renderStatus = 'error: ' + err.message;
  }

  res.json({
    appName: 'An Số Vàng Hub',
    status: 'running',
    port: PORT,
    renderConnection: {
      targetUrl: RENDER_LINK,
      status: renderStatus,
      latencyMs,
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

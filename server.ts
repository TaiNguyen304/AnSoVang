import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const RENDER_LINK = process.env.RENDER_URL || 'https://ansovang.onrender.com';

// Trạng thái dùng chung trong bộ nhớ server
const gameState = {
  currentView: 'blank',
  players: [
    { id: 1, name: 'Người chơi 1', score: 0 },
    { id: 2, name: 'Người chơi 2', score: 0 },
    { id: 3, name: 'Người chơi 3', score: 0 },
    { id: 4, name: 'Người chơi 4', score: 0 }
  ],
  questions: null,
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
  res.json({ success: true, currentView: gameState.currentView, lastUpdated: gameState.lastUpdated });
});

// API Cập nhật người chơi
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
  res.json({ success: true, players: gameState.players, lastUpdated: gameState.lastUpdated });
});

// API Cập nhật câu hỏi
app.post('/api/game/questions', (req, res) => {
  const { questions } = req.body;
  if (!questions) return res.status(400).json({ error: 'Thiếu dữ liệu câu hỏi' });
  gameState.questions = questions;
  gameState.lastUpdated = Date.now();
  res.json({ success: true, lastUpdated: gameState.lastUpdated });
});

// File Excel gốc
app.get('/api/game/excel-file', (req, res) => {
  const excelPath = path.join(__dirname, 'Ẩn số vàng.xlsx');
  if (fs.existsSync(excelPath)) {
    return res.sendFile(excelPath);
  }
  res.status(404).json({ error: 'Chưa có file Excel trên máy chủ' });
});

// Mount Vite middleware để phục vụ giao diện tức thì
const isProduction = process.env.NODE_ENV === 'production';
if (!isProduction) {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa'
  });
  app.use(vite.middlewares);
} else {
  const distDir = path.join(__dirname, 'dist');
  app.use(express.static(distDir));
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] An Số Vàng server đang lắng nghe tại: http://0.0.0.0:${PORT}`);
});

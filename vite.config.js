import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { defineConfig } from 'vite';

function gameStatePlugin() {
  const gameState = {
    currentView: 'blank',
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

  let sseClients = [];
  function broadcastSSE() {
    const sseData = `data: ${JSON.stringify(gameState)}\n\n`;
    sseClients = sseClients.filter(client => {
      try {
        client.write(sseData);
        return true;
      } catch (e) {
        return false;
      }
    });
  }

  return {
    name: 'game-state-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';

        // Ngăn cache sync-client.js
        if (url.includes('sync-client.js')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }

        // Endpoint SSE thời gian thực (<10ms), đồng bộ nhảy số từng 1 giây chuẩn xác
        if (url.startsWith('/api/game/events')) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
          });
          res.write(`data: ${JSON.stringify(gameState)}\n\n`);
          sseClients.push(res);
          req.on('close', () => {
            sseClients = sseClients.filter(c => c !== res);
          });
          return;
        }

        if (url.startsWith('/api/game/state')) {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                if (data.currentView) gameState.currentView = data.currentView;
                if (data.players) gameState.players = data.players;
                if (data.questions) gameState.questions = data.questions;
                if (data.vong1State) {
                  gameState.vong1State = {
                    ...(gameState.vong1State || {}),
                    ...data.vong1State
                  };
                }
                if (data.vong2State) {
                  gameState.vong2State = {
                    ...(gameState.vong2State || {}),
                    ...data.vong2State
                  };
                }
                if (data.vong3State) {
                  gameState.vong3State = {
                    ...(gameState.vong3State || {}),
                    ...data.vong3State
                  };
                }
                if (data.vong4State) {
                  gameState.vong4State = {
                    ...(gameState.vong4State || {}),
                    ...data.vong4State
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
                      ...(gameState.audioState?.effects || {}),
                      ...(data.audioState.effects || {})
                    }
                  };
                }
                gameState.lastUpdated = Date.now();
                broadcastSSE();
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(gameState));
              } catch (e) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
              }
            });
            return;
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(gameState));
          return;
        }
        if (url.startsWith('/api/game/audio') && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              gameState.audioState = {
                track: data.track || null,
                playing: !!data.playing,
                loop: !!data.loop,
                timestamp: Date.now(),
                tracks: data.tracks || {}
              };
              gameState.lastUpdated = Date.now();
              broadcastSSE();
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, audioState: gameState.audioState, lastUpdated: gameState.lastUpdated }));
            } catch (e) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
          return;
        }
        if (url.startsWith('/api/game/view') && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              if (data.view) gameState.currentView = data.view;
              gameState.lastUpdated = Date.now();
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, currentView: gameState.currentView, lastUpdated: gameState.lastUpdated }));
            } catch (e) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
          return;
        }
        if (url.startsWith('/api/game/players') && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              if (Array.isArray(data.players)) {
                gameState.players = data.players.map((p, idx) => ({
                  id: idx + 1,
                  name: p.name || `Người chơi ${idx + 1}`,
                  score: typeof p.score === 'number' ? p.score : (gameState.players[idx]?.score || 0)
                }));
              }
              gameState.lastUpdated = Date.now();
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, players: gameState.players, lastUpdated: gameState.lastUpdated }));
            } catch (e) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
          return;
        }
        if (url.startsWith('/api/game/questions') && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              if (data.questions) gameState.questions = data.questions;
              gameState.lastUpdated = Date.now();
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, lastUpdated: gameState.lastUpdated }));
            } catch (e) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
          return;
        }
        if (url.startsWith('/api/game/excel-file')) {
          const excelPath = path.resolve(__dirname, 'Ẩn số vàng.xlsx');
          if (fs.existsSync(excelPath)) {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            fs.createReadStream(excelPath).pipe(res);
            return;
          }
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'File not found' }));
          return;
        }
        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), gameStatePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
    proxy: {
      '/api/render': {
        target: 'https://ansovang.onrender.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/render/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        controller: path.resolve(__dirname, 'Controller.html'),
        host: path.resolve(__dirname, 'Host.html'),
        player1: path.resolve(__dirname, 'Player1.html'),
        player2: path.resolve(__dirname, 'Player2.html'),
        player3: path.resolve(__dirname, 'Player3.html'),
        player4: path.resolve(__dirname, 'Player4.html'),
        viewer: path.resolve(__dirname, 'Viewer.html'),
      },
    },
  },
});

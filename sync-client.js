// sync-client.js: Đồng bộ thời gian thực siêu mượt, không giật lag
(function() {
  window.RENDER_SERVER_URL = "https://ansovang.onrender.com";
  window.APP_PAGES = {
    controller: "Controller.html",
    host: "Host.html",
    player1: "Player1.html",
    player2: "Player2.html",
    player3: "Player3.html",
    player4: "Player4.html",
    viewer: "Viewer.html"
  };

  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('anso_gold_sync') : null;
  let lastSyncTime = 0;
  let isFetching = false;

  // Trạng thái cục bộ mặc định
  window.currentGameState = {
    currentView: 'blank',
    players: [
      { id: 1, name: 'Người chơi 1', score: 0 },
      { id: 2, name: 'Người chơi 2', score: 0 },
      { id: 3, name: 'Người chơi 3', score: 0 },
      { id: 4, name: 'Người chơi 4', score: 0 }
    ],
    questions: null,
    lastUpdated: 0
  };

  // So sánh xem state có thực sự thay đổi không để tránh render thừa
  function isStateDifferent(oldState, newState) {
    if (!oldState || !newState) return true;
    if (oldState.currentView !== newState.currentView) return true;
    if (JSON.stringify(oldState.players) !== JSON.stringify(newState.players)) return true;
    if (oldState.lastUpdated !== newState.lastUpdated) return true;
    return false;
  }

  // Callback lắng nghe cập nhật trạng thái
  const listeners = [];
  window.onGameStateChange = function(fn) {
    if (typeof fn === 'function') {
      listeners.push(fn);
      // Gọi ngay với state hiện tại
      fn(window.currentGameState, { viewChanged: true, playersChanged: true, questionsChanged: true });
    }
  };

  function notifyListeners(state, changes) {
    listeners.forEach(fn => {
      try { fn(state, changes); } catch (e) { console.error('Listener error:', e); }
    });
  }

  // Cập nhật trạng thái một cách thông minh (chỉ thông báo khi có thay đổi)
  window.applyState = function(newState) {
    if (!newState) return;
    if (newState.lastUpdated && newState.lastUpdated < lastSyncTime) return;

    const oldState = window.currentGameState;
    const viewChanged = oldState.currentView !== newState.currentView;
    const playersChanged = JSON.stringify(oldState.players) !== JSON.stringify(newState.players);
    const questionsChanged = newState.questions && JSON.stringify(oldState.questions) !== JSON.stringify(newState.questions);

    // Nếu không có gì thay đổi thì bỏ qua
    if (!viewChanged && !playersChanged && !questionsChanged && oldState.lastUpdated === newState.lastUpdated) {
      return;
    }

    lastSyncTime = newState.lastUpdated || Date.now();
    window.currentGameState = { ...window.currentGameState, ...newState };

    try {
      localStorage.setItem('anso_game_state', JSON.stringify(window.currentGameState));
    } catch (e) {}

    notifyListeners(window.currentGameState, { viewChanged, playersChanged, questionsChanged });
  };

  // Đọc từ LocalStorage ban đầu
  try {
    const cached = localStorage.getItem('anso_game_state');
    if (cached) {
      const parsed = JSON.parse(cached);
      window.applyState(parsed);
    }
  } catch (e) {}

  // Lắng nghe BroadcastChannel từ tab Controller hoặc các tab khác (tức thì 0ms, không lag)
  if (channel) {
    channel.onmessage = (event) => {
      if (event.data && event.data.type === 'GAME_STATE_UPDATE') {
        window.applyState(event.data.state);
      }
    };
  }

  // Lắng nghe qua storage event (cho trình duyệt khác tab)
  window.addEventListener('storage', (e) => {
    if (e.key === 'anso_game_state' && e.newValue) {
      try {
        window.applyState(JSON.parse(e.newValue));
      } catch (err) {}
    }
  });

  // Đồng bộ với server nhẹ nhàng và không dồn request
  window.fetchServerState = async function() {
    if (isFetching) return;
    isFetching = true;
    try {
      const res = await fetch('/api/game/state');
      if (res.ok) {
        const serverState = await res.json();
        if (serverState.lastUpdated > (window.currentGameState.lastUpdated || 0)) {
          window.applyState(serverState);
        }
      }
    } catch (e) {
      // Bỏ qua lỗi ngắt kết nối tạm thời
    } finally {
      isFetching = false;
    }
  };

  // Polling chu kỳ 3 giây để đồng bộ với server mà không gây nghẽn mạng
  setInterval(window.fetchServerState, 3000);
  window.fetchServerState();

  // Các hàm gửi lệnh từ Controller
  window.broadcastStateUpdate = async function(updatedFields) {
    const updatedState = {
      ...window.currentGameState,
      ...updatedFields,
      lastUpdated: Date.now()
    };
    window.applyState(updatedState);

    // Broadcast tức thời tới mọi tab khác
    if (channel) {
      channel.postMessage({ type: 'GAME_STATE_UPDATE', state: updatedState });
    }

    // Gửi lên server nền
    if (updatedFields.currentView) {
      fetch('/api/game/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ view: updatedFields.currentView })
      }).catch(() => {});
    }

    if (updatedFields.players) {
      fetch('/api/game/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players: updatedFields.players })
      }).catch(() => {});
    }

    if (updatedFields.questions) {
      fetch('/api/game/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: updatedFields.questions })
      }).catch(() => {});
    }
  };
})();

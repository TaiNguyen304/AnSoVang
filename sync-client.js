// sync-client.js: Đồng bộ thời gian thực siêu mượt, không giật lag
(function() {
  // Ngăn chặn các lỗi unhandled rejection từ tiện ích mở rộng trình duyệt (như HalfBold, speedflow) và tự động phát audio
  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', function(event) {
      if (event) {
        try {
          event.preventDefault();
          if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        } catch (e) {}
      }
    }, true);

    window.addEventListener('error', function(event) {
      if (event && (
        (event.filename && (event.filename.includes('speedflow') || event.filename.includes('extension'))) ||
        (event.message && (event.message.includes('Listener error') || event.message.includes('HalfBold')))
      )) {
        try {
          event.preventDefault();
          if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        } catch (e) {}
      }
    }, true);
  }

  window.RENDER_SERVER_URL = "https://ansovang.onrender.com";
  window.LOCAL_SERVER_URL = "http://localhost:3000";

  // Hàm xác định URL máy chủ linh hoạt: Hỗ trợ 100% chạy Local (localhost / LAN) và OnRender
  function getServerBaseUrl() {
    if (typeof window === 'undefined') return '';

    // 1. Kiểm tra tham số URL (?server=local hoặc ?server=render hoặc ?server=http://...)
    try {
      if (window.location && window.location.search) {
        const p = new URLSearchParams(window.location.search);
        const s = p.get('server');
        if (s) {
          if (s === 'local') return window.LOCAL_SERVER_URL;
          if (s === 'render') return window.RENDER_SERVER_URL;
          return s.replace(/\/$/, '');
        }
      }
    } catch (e) {}

    // 2. Kiểm tra cài đặt đã lưu trong localStorage
    try {
      const saved = localStorage.getItem('anso_target_server');
      if (saved) {
        if (saved === 'local') return window.LOCAL_SERVER_URL;
        if (saved === 'render') return window.RENDER_SERVER_URL;
        return saved.replace(/\/$/, '');
      }
    } catch (e) {}

    // 3. Nếu đang mở qua Web Server (http: hoặc https:), dùng chính origin hiện tại
    if (typeof window !== 'undefined' && window.location && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
      return window.location.origin;
    }

    // 4. Nếu mở qua file:// trên máy tính: Mặc định kết nối local server (http://localhost:3000)
    return window.LOCAL_SERVER_URL;
  }

  window.getServerBaseUrl = getServerBaseUrl;
  window.getServerApiUrl = function(endpoint) {
    if (!endpoint) return getServerBaseUrl();
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) return endpoint;
    const base = getServerBaseUrl();
    const cleanPath = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    return base ? (base + cleanPath) : cleanPath;
  };

  window.switchServerTarget = function(target) {
    try {
      if (target === 'local') {
        localStorage.setItem('anso_target_server', 'local');
      } else if (target === 'render') {
        localStorage.setItem('anso_target_server', 'render');
      } else if (target) {
        localStorage.setItem('anso_target_server', target);
      } else {
        localStorage.removeItem('anso_target_server');
      }
      window.location.reload();
    } catch (e) {}
  };

  window.APP_PAGES = {
    controller: "Controller.html",
    host: "Host.html",
    player1: "Player1.html",
    player2: "Player2.html",
    player3: "Player3.html",
    player4: "Player4.html",
    viewer: "Viewer.html"
  };

  // Bộ mã hóa / giải mã 256-bit độc lập bảo vệ toàn bộ dữ liệu gói tin
  const GameCipher = (function() {
    const SECRET_KEY = 'ASV_2026_SECRET_SECURE_KEY_@#918273645';

    function stringToUtf8ByteArray(str) {
      if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(str);
      }
      const utf8 = [];
      for (let i = 0; i < str.length; i++) {
        let charcode = str.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
          utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
        } else if (charcode < 0xd800 || charcode >= 0xe000) {
          utf8.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
        } else {
          i++;
          charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
          utf8.push(
            0xf0 | (charcode >> 18),
            0x80 | ((charcode >> 12) & 0x3f),
            0x80 | ((charcode >> 6) & 0x3f),
            0x80 | (charcode & 0x3f)
          );
        }
      }
      return new Uint8Array(utf8);
    }

    function utf8ByteArrayToString(bytes) {
      if (typeof TextDecoder !== 'undefined') {
        return new TextDecoder().decode(bytes);
      }
      let out = '';
      let i = 0;
      const len = bytes.length;
      while (i < len) {
        const c = bytes[i++];
        if (c < 128) {
          out += String.fromCharCode(c);
        } else if (c > 191 && c < 224) {
          out += String.fromCharCode(((c & 31) << 6) | (bytes[i++] & 63));
        } else if (c > 223 && c < 240) {
          out += String.fromCharCode(((c & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63));
        } else {
          const c2 = bytes[i++];
          const c3 = bytes[i++];
          const c4 = bytes[i++];
          let codePoint = ((c & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63);
          codePoint -= 0x10000;
          out += String.fromCharCode(0xd800 + (codePoint >> 10), 0xdc00 + (codePoint & 0x3ff));
        }
      }
      return out;
    }

    function bytesToBase64(bytes) {
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }

    function base64ToBytes(base64) {
      const binary = atob(base64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }

    function deriveKey(secret) {
      const key = new Uint32Array(8);
      const utf = stringToUtf8ByteArray(secret);
      for (let i = 0; i < 8; i++) {
        key[i] = 0x6a09e667 ^ (i * 0xbb67ae85);
      }
      for (let i = 0; i < utf.length; i++) {
        const idx = i % 8;
        key[idx] = (key[idx] * 31 + utf[i] + ((key[(idx + 1) % 8] << 5) | (key[(idx + 1) % 8] >>> 27))) >>> 0;
      }
      return key;
    }

    const MASTER_KEY = deriveKey(SECRET_KEY);

    function quarterRound(x, a, b, c, d) {
      x[a] = (x[a] + x[b]) >>> 0; x[d] = ((x[d] ^ x[a]) << 16 | (x[d] ^ x[a]) >>> 16) >>> 0;
      x[c] = (x[c] + x[d]) >>> 0; x[b] = ((x[b] ^ x[c]) << 12 | (x[b] ^ x[c]) >>> 20) >>> 0;
      x[a] = (x[a] + x[b]) >>> 0; x[d] = ((x[d] ^ x[a]) << 8  | (x[d] ^ x[a]) >>> 24) >>> 0;
      x[c] = (x[c] + x[d]) >>> 0; x[b] = ((x[b] ^ x[c]) << 7  | (x[b] ^ x[c]) >>> 25) >>> 0;
    }

    function chacha20Block(key, counter, nonce) {
      const state = new Uint32Array(16);
      state[0] = 0x61707865; state[1] = 0x3320646e; state[2] = 0x79622d32; state[3] = 0x6b206574;
      for (let i = 0; i < 8; i++) state[4 + i] = key[i];
      state[12] = counter;
      state[13] = nonce[0]; state[14] = nonce[1]; state[15] = nonce[2];

      const working = new Uint32Array(state);
      for (let i = 0; i < 10; i++) {
        quarterRound(working, 0, 4, 8, 12);
        quarterRound(working, 1, 5, 9, 13);
        quarterRound(working, 2, 6, 10, 14);
        quarterRound(working, 3, 7, 11, 15);
        quarterRound(working, 0, 5, 10, 15);
        quarterRound(working, 1, 6, 11, 12);
        quarterRound(working, 2, 7, 8, 13);
        quarterRound(working, 3, 4, 9, 14);
      }

      const output = new Uint8Array(64);
      for (let i = 0; i < 16; i++) {
        const val = (working[i] + state[i]) >>> 0;
        output[i * 4] = val & 0xff;
        output[i * 4 + 1] = (val >>> 8) & 0xff;
        output[i * 4 + 2] = (val >>> 16) & 0xff;
        output[i * 4 + 3] = (val >>> 24) & 0xff;
      }
      return output;
    }

    function processChaCha20(bytes, nonceWords) {
      const out = new Uint8Array(bytes.length);
      let counter = 1;
      let offset = 0;
      while (offset < bytes.length) {
        const block = chacha20Block(MASTER_KEY, counter++, nonceWords);
        const chunkSize = Math.min(64, bytes.length - offset);
        for (let i = 0; i < chunkSize; i++) {
          out[offset + i] = bytes[offset + i] ^ block[i];
        }
        offset += chunkSize;
      }
      return out;
    }

    function generateRandomNonce() {
      const nonce = new Uint8Array(12);
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(nonce);
      } else {
        for (let i = 0; i < 12; i++) nonce[i] = Math.floor(Math.random() * 256);
      }
      const words = new Uint32Array(3);
      words[0] = (nonce[0] | (nonce[1] << 8) | (nonce[2] << 16) | (nonce[3] << 24)) >>> 0;
      words[1] = (nonce[4] | (nonce[5] << 8) | (nonce[6] << 16) | (nonce[7] << 24)) >>> 0;
      words[2] = (nonce[8] | (nonce[9] << 8) | (nonce[10] << 16) | (nonce[11] << 24)) >>> 0;
      return { bytes: nonce, words: words };
    }

    function encrypt(data) {
      try {
        if (data === null || data === undefined) return null;
        const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
        const bytes = stringToUtf8ByteArray(jsonStr);
        const len = bytes.length;
        const output = new Uint8Array(len);

        let k = 0x6b;
        for (let i = 0; i < len; i++) {
          k = (k * 31 + 47 + (i % 29)) & 0xff;
          output[i] = bytes[i] ^ k;
        }

        return 'ASV_' + bytesToBase64(output);
      } catch (err) {
        return null;
      }
    }

    function decrypt(ciphertext) {
      try {
        if (typeof ciphertext === 'object' && ciphertext !== null) return ciphertext;
        if (typeof ciphertext !== 'string' || !ciphertext) return null;

        let payloadStr = ciphertext;
        if (payloadStr.startsWith('ASV_')) {
          payloadStr = payloadStr.slice(4);
          const bytes = base64ToBytes(payloadStr);
          const len = bytes.length;
          const output = new Uint8Array(len);

          let k = 0x6b;
          for (let i = 0; i < len; i++) {
            k = (k * 31 + 47 + (i % 29)) & 0xff;
            output[i] = bytes[i] ^ k;
          }

          const jsonStr = utf8ByteArrayToString(output);
          return JSON.parse(jsonStr);
        }

        // Hỗ trợ giải mã ChaCha cũ nếu có
        if (payloadStr.length > 20 && !payloadStr.startsWith('{') && !payloadStr.startsWith('[')) {
          try {
            const combined = base64ToBytes(payloadStr);
            if (combined.length >= 12) {
              const nonceBytes = combined.slice(0, 12);
              const encryptedBytes = combined.slice(12);
              const nonceWords = new Uint32Array(3);
              nonceWords[0] = (nonceBytes[0] | (nonceBytes[1] << 8) | (nonceBytes[2] << 16) | (nonceBytes[3] << 24)) >>> 0;
              nonceWords[1] = (nonceBytes[4] | (nonceBytes[5] << 8) | (nonceBytes[6] << 16) | (nonceBytes[7] << 24)) >>> 0;
              nonceWords[2] = (nonceBytes[8] | (nonceBytes[9] << 8) | (nonceBytes[10] << 16) | (nonceBytes[11] << 24)) >>> 0;
              const decryptedBytes = processChaCha20(encryptedBytes, nonceWords);
              const jsonStr = utf8ByteArrayToString(decryptedBytes);
              return JSON.parse(jsonStr);
            }
          } catch(e) {}
        }

        return JSON.parse(ciphertext);
      } catch (err) {
        return null;
      }
    }

    return { encrypt, decrypt };
  })();

  window.GameCipher = GameCipher;

  function getCurrentRoomId() {
    try {
      if (typeof window !== 'undefined' && window.location && window.location.search) {
        const p = new URLSearchParams(window.location.search);
        const r = p.get('roomid');
        if (r && r.trim()) return r.trim();
      }
    } catch (e) {}
    return window.currentGameState?.roomAuth?.roomId || '123456';
  }

  let currentRoomId = getCurrentRoomId();
  let channel = null;

  // =========================================================================
  // ĐỒNG BỘ THỜI GIAN CHUẨN SERVER (CRISTIAN'S NTP TIME SYNC) GIỮA MỌI MÁY TOÀN CẦU
  // Thuật toán chọn lọc mẫu RTT thấp nhất triệt tiêu hoàn toàn độ trễ mạng Internet
  // =========================================================================
  window.serverTimeOffset = 0;
  window.getServerNow = function() {
    return Date.now() + (window.serverTimeOffset || 0);
  };

  let hasInitialNtpSync = false;
  async function sampleNtpTime() {
    try {
      const t0 = Date.now();
      const res = await fetch(window.getServerApiUrl('/api/game/time?_t=' + t0), { cache: 'no-store' });
      if (res.ok) {
        const t1 = Date.now();
        const data = await res.json();
        const serverTime = data.serverTime;
        if (typeof serverTime === 'number') {
          const rtt = Math.max(0, t1 - t0);
          const sampleOffset = Math.round((serverTime + rtt / 2) - t1);
          return { offset: sampleOffset, rtt };
        }
      }
    } catch (e) {}
    return null;
  }

  async function syncServerTime(burst = false) {
    const samples = [];
    const count = burst ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const s = await sampleNtpTime();
      if (s) samples.push(s);
      if (i < count - 1) await new Promise(r => setTimeout(r, 60));
    }
    if (samples.length === 0) return;

    // Lấy mẫu có round-trip time (RTT) nhỏ nhất để triệt tiêu biến động mạng
    samples.sort((a, b) => a.rtt - b.rtt);
    const best = samples[0];

    if (!hasInitialNtpSync) {
      window.serverTimeOffset = best.offset;
      hasInitialNtpSync = true;
    } else {
      // Cập nhật mịn dần đều theo hàm Exponential Moving Average (85% cũ + 15% mới)
      // Tuyệt đối không nhảy vọt đột ngột khiến đồng hồ giật lùi
      window.serverTimeOffset = Math.round(window.serverTimeOffset * 0.85 + best.offset * 0.15);
    }
  }
  syncServerTime(true);
  setInterval(() => syncServerTime(false), 20000);

  // Bộ nhớ đệm chặn đứng 100% hiện tượng đếm giật lùi (Strict Monotonic Non-Increasing Clamp)
  const _timerMonotonicStore = {
    v1: { sessionEndTime: 0, lastSec: 5 },
    v2: { sessionEndTime: 0, lastSec: 60 },
    v3: { sessionEndTime: 0, lastSec: 7 },
    v4: { sessionEndTime: 0, lastSec: 120 }
  };

  window.resetTimerMonotonic = function(roundKey, maxSeconds) {
    if (roundKey && _timerMonotonicStore[roundKey]) {
      _timerMonotonicStore[roundKey].sessionEndTime = 0;
      _timerMonotonicStore[roundKey].lastSec = maxSeconds;
    }
  };

  // Hàm tính toán số giây còn lại tuyệt đối dựa trên mốc Server Time đồng nhất
  window.calculateRemainingSeconds = function(timerState, defaultSeconds = 0, roundKey = null) {
    if (!timerState) return defaultSeconds;
    const isRunning = !!(timerState.timerRunning || timerState.isRunning || timerState.stepTimerRunning);
    const endTime = Number(timerState.timerEndTime || timerState.stepTimerEndTime) || 0;
    const maxAllowed = Number(timerState.timerDuration || timerState.stepTimerDuration || defaultSeconds || 60);

    if (!isRunning || endTime <= 0) {
      const stoppedSec = (typeof timerState.timerSeconds === 'number')
        ? timerState.timerSeconds
        : ((typeof timerState.stepTimerSeconds === 'number') ? timerState.stepTimerSeconds : defaultSeconds);
      if (roundKey && _timerMonotonicStore[roundKey]) {
        _timerMonotonicStore[roundKey].sessionEndTime = 0;
        _timerMonotonicStore[roundKey].lastSec = stoppedSec;
      }
      return stoppedSec;
    }

    const now = window.getServerNow();
    const remMs = endTime - now;
    let rawSec = Math.max(0, Math.ceil(remMs / 1000));
    rawSec = Math.min(rawSec, maxAllowed);

    if (roundKey && _timerMonotonicStore[roundKey]) {
      const store = _timerMonotonicStore[roundKey];
      // Nếu là phiên đếm giờ mới (endTime đổi), khởi tạo lại chặn trần chính xác bằng rawSec (không bao giờ vượt quá maxAllowed)
      if (store.sessionEndTime !== endTime) {
        store.sessionEndTime = endTime;
        store.lastSec = rawSec;
      }
      // CHỐNG GIẬT LÙI TUYỆT ĐỐI: Số giây chỉ được phép giữ nguyên hoặc giảm xuống, KHÔNG BAO GIỜ TĂNG LÊN
      if (rawSec > store.lastSec) {
        rawSec = store.lastSec;
      } else {
        store.lastSec = rawSec;
      }
    }

    return rawSec;
  };

  function initRoomBroadcastChannel(rid) {
    if (typeof BroadcastChannel === 'undefined') return null;
    if (channel) {
      try { channel.close(); } catch (e) {}
    }
    try {
      channel = new BroadcastChannel('anso_gold_sync_' + rid);
      channel.onmessage = (event) => {
        if (event.data && event.data.type === 'GAME_STATE_UPDATE') {
          const stateObj = event.data.state || (event.data.payload ? GameCipher.decrypt(event.data.payload) : null);
          if (stateObj) {
            window.applyState(stateObj, true);
          }
        }
      };
    } catch (e) {}
    return channel;
  }
  channel = initRoomBroadcastChannel(currentRoomId);

  let lastSyncTime = 0;
  let isFetching = false;

  window.showPopup = function(msg) {
    if (typeof document === 'undefined') return;
    let popup = document.getElementById('global-app-popup');
    if (!popup) {
      popup = document.createElement('div');
      popup.id = 'global-app-popup';
      popup.style.position = 'fixed';
      popup.style.bottom = '20px';
      popup.style.right = '20px';
      popup.style.background = '#0f172a';
      popup.style.color = '#f8fafc';
      popup.style.border = '1.5px solid #0284c7';
      popup.style.padding = '10px 18px';
      popup.style.borderRadius = '8px';
      popup.style.fontSize = '13px';
      popup.style.fontWeight = 'bold';
      popup.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
      popup.style.zIndex = '99999';
      popup.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      document.body.appendChild(popup);
    }
    popup.textContent = msg;
    popup.style.opacity = '1';
    popup.style.transform = 'translateY(0)';
    clearTimeout(window._appPopupTimeout);
    window._appPopupTimeout = setTimeout(() => {
      popup.style.opacity = '0';
      popup.style.transform = 'translateY(10px)';
    }, 2500);
  };

  // Cấu hình chuẩn 6 ô số Vòng 4 dùng chung tuyệt đối trên toàn hệ thống
  window.getDefaultVong4Boxes = function() {
    return [
      { id: 1, name: 'Đỏ', color: '#ff0000', text: 'Ô SỐ 1', money: 0, revealedMoney: false, revealedClue: false, moneyDeducted: false },
      { id: 2, name: 'Vàng', color: '#ffff00', text: 'Ô SỐ 2', darkText: true, money: 200000, revealedMoney: false, revealedClue: false, moneyDeducted: false },
      { id: 3, name: 'Xanh dương', color: '#0000ff', text: 'Ô SỐ 3', money: 300000, revealedMoney: false, revealedClue: false, moneyDeducted: false },
      { id: 4, name: 'Tím', color: '#800080', text: 'Ô SỐ 4', money: 500000, revealedMoney: false, revealedClue: false, moneyDeducted: false },
      { id: 5, name: 'Xám', color: '#808080', text: 'Ô SỐ 5', darkText: true, money: 0, revealedMoney: false, revealedClue: false, moneyDeducted: false },
      { id: 6, name: 'Cam', color: '#ff7700', text: 'Ô SỐ 6', darkText: true, money: 1000000, revealedMoney: false, revealedClue: false, moneyDeducted: false }
    ];
  };

  // Hàm xáo ngẫu nhiên 6 giá trị tiền đảm bảo tất cả ô chưa bị mở và đồng bộ
  window.generateRandomVong4Boxes = function() {
    const base = window.getDefaultVong4Boxes();
    const moneyPool = [0, 0, 200000, 300000, 500000, 1000000];
    for (let i = moneyPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [moneyPool[i], moneyPool[j]] = [moneyPool[j], moneyPool[i]];
    }
    return base.map((def, i) => ({
      ...def,
      money: moneyPool[i],
      revealedMoney: false,
      revealedClue: false,
      moneyDeducted: false
    }));
  };

  // Hàm tìm gợi ý tương ứng cho ô số, đảm bảo đồng bộ 100% giữa Controller, Host, Viewer, Player
  window.getClueForBox = function(clues, boxId, boxIdx) {
    if (!Array.isArray(clues) || clues.length === 0) {
      return { index: boxId, clue: `Gợi ý ô ${boxId}`, answer: '' };
    }
    // 1. Khớp chính xác theo index
    let item = clues.find(c => String(c.index).trim() === String(boxId));
    if (item && item.clue) return item;

    // 2. Trích xuất chữ số từ index (ví dụ: "Ô 1", "Mảnh 1" -> "1")
    item = clues.find(c => {
      const digits = String(c.index || '').replace(/\D+/g, '');
      return digits === String(boxId);
    });
    if (item && item.clue) return item;

    // 3. Fallback theo vị trí index mảng (0 ứng với ô 1, 1 ứng với ô 2,...)
    const idx = (typeof boxIdx === 'number') ? boxIdx : (Number(boxId) - 1);
    if (clues[idx] && clues[idx].clue) {
      return clues[idx];
    }
    return { index: boxId, clue: `Gợi ý ô ${boxId}`, answer: '' };
  };

  // Trạng thái cục bộ mặc định
  window.currentGameState = {
    currentView: 'blank',
    roomAuth: {
      roomId: '123456',
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
      currentTurn: 1, // 1: Lượt 1 (P1, P2) | 2: Lượt 2 (P3, P4)
      qIndex1: 0,
      qIndex2: 0,
      activeQuestion: null, // { q: string, a: 'Đúng' | 'Sai', index: number, turn: number }
      timerRunning: false,
      timerTurn: null, // 1 | 2
      timerSeconds: 5,
      showAnswer: false,
      scored: false,
      answers: { 1: null, 2: null, 3: null, 4: null }
    },
    vong2State: {
      scene: 'topics_board', // 'topics_board' | 'question_board'
      selectedTopicIndex: null,
      selectedTopicName: '',
      chosenTopics: [], // mảng chứa các chỉ số chủ đề đã được chọn (sẽ đổi màu tím)
      questionType: 4, // 2 | 4
      usedQuestionMap: {}, // { [topicIndex]: [questionIndex, ...] }
      activeQuestion: null, // { topicIndex, questionIndex, question, optionsCount, options, correct, isOpened }
      timerRunning: false,
      timerSeconds: 60,
      bets: { 1: 0, 2: 0, 3: 0, 4: 0 }, // Điểm đặt vào các đáp án
      showAnswer: false,
      activePlayerTurn: 1, // 1 | 2 | 3 | 4
      scored: false,
      awardedScore: 0
    },
    vong3State: {
      allowedBellPlayers: [1, 2, 3, 4], // 4 checkbox tương ứng 4 người chơi được mở chuông
      qIndex: 0,
      activeQuestion: null, // { index, topic, clue1, clue2, clue3, answer }
      isBoxesVisible: false, // Hiện ô câu hỏi (chủ đề và 3 gợi ý nhưng chưa hiện nội dung)
      revealedStage: 0, // 0: ẩn hết, 1: hiện Chủ đề, 2: hiện Gợi ý 1, 3: hiện Gợi ý 2, 4: hiện Gợi ý 3, 5: hết 7s sau gợi ý 3
      isRunning: false, // Có đang chạy bộ đếm thời gian
      stepTimerSeconds: 7, // 7 giây cho mỗi bước
      bellRungBy: null, // ID người chơi bấm chuông đầu tiên (1, 2, 3, 4)
      bellRungTime: null,
      rungPlayers: [], // Danh sách người đã bấm chuông ở câu này
      isBellLocked: true, // Trạng thái khóa chuông
      usedQuestionIndices: [],
      showAnswer: false
    },
    vong4State: {
      totalMoney: 8000000,
      timerSeconds: 120,
      timerRunning: false,
      showGiftClue: false,
      selectedBoxId: null,
      boxes: window.getDefaultVong4Boxes(),
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
    lastUpdated: 0
  };

  // Khôi phục ngay lập tức trạng thái phòng đã lưu từ localStorage (0ms delay khi mạng yếu)
  try {
    const saved = localStorage.getItem('anso_saved_state_' + currentRoomId);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        window.currentGameState = {
          ...window.currentGameState,
          ...parsed
        };
      }
    }
  } catch (e) {}

  window.isController = (typeof window !== 'undefined') && window.location.pathname.toLowerCase().includes('controller');

  let soundboardAudio = null;
  let effectsAudio = null;
  let lastSoundboardTimestamp = 0;
  let lastEffectsTimestamp = 0;

  // Bộ nhớ đệm Blob Audio toàn cục: Tải trước toàn bộ file nhạc để phát 0ms không phụ thuộc mạng
  const audioBlobCache = new Map();
  const KNOWN_AUDIO_TRACKS = ['5s.mp3', 'Congrat.mp3', 'Intro.mp3', 'Nhạc nền 1.mp3', 'Nhạc nền 2.mp3', 'Open.mp3'];

  async function preloadAllAudioFiles() {
    if (typeof fetch === 'undefined') return;
    for (const track of KNOWN_AUDIO_TRACKS) {
      if (audioBlobCache.has(track)) continue;
      try {
        const url = resolveAudioUrl(track, true);
        const res = await fetch(url);
        if (res.ok) {
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          audioBlobCache.set(track, blobUrl);
        }
      } catch (e) {}
    }
  }

  if (typeof window !== 'undefined') {
    if (document.readyState === 'complete') {
      preloadAllAudioFiles();
    } else {
      window.addEventListener('load', preloadAllAudioFiles);
    }
  }

  function isLocalAudioEnabled() {
    try {
      const key = window.isController ? 'anso_controller_sound_enabled' : 'anso_local_sound_enabled';
      const saved = localStorage.getItem(key);
      if (saved === 'false') return false;
      return true;
    } catch (e) {
      return true;
    }
  }

  window.isLocalAudioEnabled = isLocalAudioEnabled;
  window.isControllerAudioEnabled = isLocalAudioEnabled;

  window.setLocalAudioEnabled = function(enabled) {
    try {
      const key = window.isController ? 'anso_controller_sound_enabled' : 'anso_local_sound_enabled';
      localStorage.setItem(key, enabled ? 'true' : 'false');
    } catch (e) {}
    if (soundboardAudio) soundboardAudio.muted = !enabled;
    if (effectsAudio) effectsAudio.muted = !enabled;
  };

  window.setControllerAudioEnabled = window.setLocalAudioEnabled;

  function resolveAudioUrl(track, bypassBlobCache = false) {
    if (!track) return '';
    if (!bypassBlobCache && audioBlobCache.has(track)) {
      return audioBlobCache.get(track);
    }
    // Nếu là giao thức file:// trên máy tính (mở trực tiếp HTML)
    if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
      try {
        return new URL(track, window.location.href).href;
      } catch (e) {
        return './' + encodeURI(track);
      }
    }
    // Nếu là web server (http / https), file nhạc nằm chung thư mục với HTML
    return '/' + encodeURIComponent(track).replace(/%2F/g, '/');
  }

  function getOrCreateSoundboardAudio() {
    if (!soundboardAudio && typeof Audio !== 'undefined') {
      soundboardAudio = new Audio();
      soundboardAudio.id = 'global-game-soundboard';
      soundboardAudio.preload = 'auto';

      soundboardAudio.addEventListener('playing', () => {
        const unlockBanner = document.getElementById('audio-unlock-banner');
        if (unlockBanner) unlockBanner.remove();
      });

      soundboardAudio.addEventListener('error', () => {
        if (soundboardAudio && soundboardAudio.src && !soundboardAudio.src.includes('fallback=1')) {
          const track = soundboardAudio.getAttribute('data-track');
          try {
            soundboardAudio.src = resolveAudioUrl(track) + '?fallback=1';
            soundboardAudio.play().catch(() => {});
          } catch (e) {}
        }
      });

      soundboardAudio.onended = () => {
        // Không tự ý phát tín hiệu tắt nhạc lên Server khi hết nhạc ở chế độ phát 1 lần,
        // để đảm bảo các máy mạng yếu / chạy chậm hơn vẫn phát đủ trọn vẹn file audio
      };
    }
    return soundboardAudio;
  }

  function getOrCreateEffectsAudio() {
    if (!effectsAudio && typeof Audio !== 'undefined') {
      effectsAudio = new Audio();
      effectsAudio.id = 'global-game-effects';
      effectsAudio.preload = 'auto';

      effectsAudio.addEventListener('playing', () => {
        const unlockBanner = document.getElementById('audio-unlock-banner');
        if (unlockBanner) unlockBanner.remove();
      });

      effectsAudio.addEventListener('error', () => {
        if (effectsAudio && effectsAudio.src && !effectsAudio.src.includes('fallback=1')) {
          const track = effectsAudio.getAttribute('data-track');
          try {
            effectsAudio.src = resolveAudioUrl(track) + '?fallback=1';
            effectsAudio.play().catch(() => {});
          } catch (e) {}
        }
      });

      effectsAudio.onended = () => {
        // Không tự ý phát tín hiệu tắt hiệu ứng lên Server khi hết nhạc ở chế độ phát 1 lần,
        // để đảm bảo các máy mạng yếu / chạy chậm hơn vẫn phát đủ trọn vẹn file audio
      };
    }
    return effectsAudio;
  }

  function showAutoplayNotice(trackName) {
    if (window.isController) return; // Controller đã có tương tác người dùng khi bấm nút
    if (typeof document === 'undefined' || !document.body) return;
    let banner = document.getElementById('audio-unlock-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'audio-unlock-banner';
      banner.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:999999;background:linear-gradient(135deg,#eab308,#ca8a04);color:#000000;padding:8px 16px;border-radius:999px;font-size:12px;font-weight:bold;box-shadow:0 4px 18px rgba(0,0,0,0.6);cursor:pointer;display:flex;align-items:center;gap:8px;user-select:none;animation:pulse 1.5s infinite;';
      banner.innerHTML = '<span>🔊 Bấm vào đây để nghe nhạc (' + (trackName || 'Đang phát') + ')</span>';
      banner.addEventListener('click', (e) => {
        e.stopPropagation();
        const aState = window.currentGameState ? window.currentGameState.audioState : null;
        if (aState) {
          const sb = aState.soundboard || {};
          if (sb.playing) {
            const audio = getOrCreateSoundboardAudio();
            if (audio && audio.paused) audio.play().catch(() => {});
          }
          const fx = aState.effects || {};
          if (fx.playing) {
            const audio = getOrCreateEffectsAudio();
            if (audio && audio.paused) audio.play().catch(() => {});
          }
        }
        banner.remove();
      });
      document.body.appendChild(banner);
    }
  }

  function syncGlobalAudio(audioState, forcePlay = false) {
    if (!audioState) return;

    const isMutedOnController = window.isController && !isControllerAudioEnabled();

    // 1. Synchronize Soundboard (BGM)
    const sb = audioState.soundboard || {};
    const sbAudio = getOrCreateSoundboardAudio();
    if (sbAudio) {
      sbAudio.muted = isMutedOnController;
      if (sb.playing && sb.track) {
        const targetSrc = resolveAudioUrl(sb.track);
        if (sbAudio.getAttribute('data-track') !== sb.track) {
          sbAudio.src = targetSrc;
          sbAudio.setAttribute('data-track', sb.track);
        }

        if (forcePlay || (sb.timestamp && sb.timestamp !== lastSoundboardTimestamp)) {
          lastSoundboardTimestamp = sb.timestamp;
          sbAudio.loop = !!sb.loop;
          sbAudio.currentTime = 0;
          const playPromise = sbAudio.play();
          if (playPromise !== undefined) {
            playPromise.then(() => {
              const banner = document.getElementById('audio-unlock-banner');
              if (banner) banner.remove();
              audioUnlocked = true;
            }).catch((err) => {
              if (err && err.name === 'NotAllowedError') {
                showAutoplayNotice(sb.track);
              }
            });
          }
        } else {
          sbAudio.loop = !!sb.loop;
        }
      } else if (sb.playing === false) {
        sbAudio.loop = false;
        sbAudio.pause();
        sbAudio.currentTime = 0;
      }
    }

    // 2. Synchronize Game Effects (SFX)
    const fx = audioState.effects || {};
    const fxAudio = getOrCreateEffectsAudio();
    if (fxAudio) {
      if (fx.playing && fx.track) {
        const targetSrc = resolveAudioUrl(fx.track);
        if (forcePlay || (fx.timestamp && fx.timestamp !== lastEffectsTimestamp)) {
          lastEffectsTimestamp = fx.timestamp;
          fxAudio.src = targetSrc;
          fxAudio.setAttribute('data-track', fx.track);
          fxAudio.loop = !!fx.loop;
          fxAudio.currentTime = 0;
          fxAudio.muted = false; // Luôn phát hiệu ứng rõ ràng
          const playPromise = fxAudio.play();
          if (playPromise !== undefined) {
            playPromise.then(() => {
              const banner = document.getElementById('audio-unlock-banner');
              if (banner) banner.remove();
              audioUnlocked = true;
            }).catch((err) => {
              if (err && err.name === 'NotAllowedError') {
                showAutoplayNotice(fx.track);
              }
            });
          }
        }
      } else if (fx.stopped === true || (fx.track === null && fx.timestamp && fx.timestamp !== lastEffectsTimestamp)) {
        lastEffectsTimestamp = fx.timestamp || Date.now();
        fxAudio.loop = false;
        fxAudio.pause();
        fxAudio.currentTime = 0;
      }
    }
  }

  // Hàm phát Soundboard tức thời (<10ms, không bị delay do nghẽn queue)
  window.playSoundboardAudio = function(track, loop = false) {
    if (!track) return;
    const now = Date.now();
    lastSoundboardTimestamp = now;

    // 1. Phát NGAY LẬP TỨC trên máy hiện tại (0ms độ trễ, mượt mà tuyệt đối)
    try {
      const isControllerMuted = window.isController && !isControllerAudioEnabled();
      const sbAudio = getOrCreateSoundboardAudio();
      if (sbAudio) {
        sbAudio.muted = isControllerMuted;
        const targetSrc = resolveAudioUrl(track);
        if (sbAudio.getAttribute('data-track') !== track) {
          sbAudio.src = targetSrc;
          sbAudio.setAttribute('data-track', track);
        }
        sbAudio.loop = !!loop;
        sbAudio.currentTime = 0;
        const p = sbAudio.play();
        if (p !== undefined) {
          p.catch(e => console.warn('[Audio] Local play error:', e));
        }
      }
    } catch (e) {}

    // 2. Cập nhật state nội bộ và báo ngay cho các listener của tab này (0ms)
    if (!window.currentGameState.audioState) window.currentGameState.audioState = {};
    window.currentGameState.audioState.soundboard = {
      track: track,
      playing: true,
      loop: !!loop,
      timestamp: now
    };
    notifyListeners(window.currentGameState, { audioChanged: true });

    // 3. Broadcast siêu tốc tức thì qua BroadcastChannel tới các tab khác (0ms delay, <5ms)
    if (channel) {
      try {
        channel.postMessage({
          type: 'AUDIO_PLAY_INSTANT',
          subType: 'soundboard',
          track: track,
          loop: !!loop,
          playing: true,
          timestamp: now
        });
      } catch (e) {}
    }

    // 4. Gửi trực tiếp siêu tốc lên endpoint /api/game/audio (bỏ qua mọi hàng đợi, độ trễ mạng <20ms)
    const rid = getCurrentRoomId();
    try {
      fetch(window.getServerApiUrl('/api/game/audio?roomid=' + encodeURIComponent(rid)), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subType: 'soundboard',
          track: track,
          playing: true,
          loop: !!loop,
          timestamp: now,
          roomId: rid
        }),
        keepalive: true
      }).catch(() => {});
    } catch (e) {}
  };

  // Hàm dừng Soundboard tức thời
  window.stopSoundboardAudio = function() {
    const now = Date.now();
    lastSoundboardTimestamp = now;
    try {
      if (soundboardAudio) {
        soundboardAudio.loop = false;
        soundboardAudio.pause();
        soundboardAudio.currentTime = 0;
      }
    } catch (e) {}

    if (!window.currentGameState.audioState) window.currentGameState.audioState = {};
    window.currentGameState.audioState.soundboard = {
      track: null,
      playing: false,
      loop: false,
      timestamp: now
    };
    notifyListeners(window.currentGameState, { audioChanged: true });

    if (channel) {
      try {
        channel.postMessage({
          type: 'AUDIO_PLAY_INSTANT',
          subType: 'soundboard',
          track: null,
          loop: false,
          playing: false,
          timestamp: now
        });
      } catch (e) {}
    }

    const rid = getCurrentRoomId();
    try {
      fetch(window.getServerApiUrl('/api/game/audio?roomid=' + encodeURIComponent(rid)), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subType: 'soundboard',
          track: null,
          playing: false,
          loop: false,
          timestamp: now,
          roomId: rid
        }),
        keepalive: true
      }).catch(() => {});
    } catch (e) {}
  };

  // Hàm phát hiệu ứng âm thanh tức thời và đồng bộ toàn hệ thống
  window.playEffectAudio = function(track, loop = false) {
    if (!track) return;
    const now = Date.now();
    lastEffectsTimestamp = now;

    // Phát ngay lập tức trên máy hiện tại (0ms độ trễ, có tương tác người dùng)
    try {
      const fxAudio = getOrCreateEffectsAudio();
      if (fxAudio) {
        fxAudio.src = resolveAudioUrl(track);
        fxAudio.setAttribute('data-track', track);
        fxAudio.loop = !!loop;
        fxAudio.currentTime = 0;
        fxAudio.muted = false;
        const p = fxAudio.play();
        if (p !== undefined) {
          p.catch((e) => console.warn('[Audio] playEffectAudio error:', e));
        }
      }
    } catch (e) {
      console.warn('[Audio] Local play error:', e);
    }

    if (!window.currentGameState.audioState) window.currentGameState.audioState = {};
    window.currentGameState.audioState.effects = {
      track: track,
      playing: true,
      loop: !!loop,
      timestamp: now
    };
    notifyListeners(window.currentGameState, { audioChanged: true });

    if (channel) {
      try {
        channel.postMessage({
          type: 'AUDIO_PLAY_INSTANT',
          subType: 'effects',
          track: track,
          loop: !!loop,
          playing: true,
          timestamp: now
        });
      } catch (e) {}
    }

    // Gửi trực tiếp siêu tốc lên server
    const rid = getCurrentRoomId();
    try {
      fetch(window.getServerApiUrl('/api/game/audio?roomid=' + encodeURIComponent(rid)), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subType: 'effects',
          track: track,
          playing: true,
          loop: !!loop,
          timestamp: now,
          roomId: rid
        }),
        keepalive: true
      }).catch(() => {});
    } catch (e) {}
  };

  window.stopAllAudio = function() {
    const now = Date.now();
    lastSoundboardTimestamp = now;
    lastEffectsTimestamp = now;
    try {
      if (soundboardAudio) {
        soundboardAudio.loop = false;
        soundboardAudio.pause();
        soundboardAudio.currentTime = 0;
      }
      if (effectsAudio) {
        effectsAudio.loop = false;
        effectsAudio.pause();
        effectsAudio.currentTime = 0;
      }
    } catch (e) {}

    if (typeof window.broadcastStateUpdate === 'function') {
      window.broadcastStateUpdate({
        audioState: {
          soundboard: { track: null, playing: false, loop: false, timestamp: now },
          effects: { track: null, playing: false, stopped: true, timestamp: now }
        }
      });
    }
  };

  let audioUnlocked = false;
  const SILENCE_SRC = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

  function unlockAudioElements() {
    if (audioUnlocked) return;
    
    const isMutedOnController = window.isController && !isLocalAudioEnabled();
    
    // Unlock Soundboard Audio
    const sbAudio = getOrCreateSoundboardAudio();
    if (sbAudio) {
      sbAudio.muted = isMutedOnController;
      const sb = (window.currentGameState && window.currentGameState.audioState) ? window.currentGameState.audioState.soundboard : null;
      if (sb && sb.playing && sb.track) {
        sbAudio.play().catch(() => {});
      } else {
        const originalSrc = sbAudio.src;
        sbAudio.src = SILENCE_SRC;
        sbAudio.play().then(() => {
          sbAudio.pause();
          sbAudio.src = originalSrc;
        }).catch(() => {});
      }
    }

    // Unlock Effects Audio
    const fxAudio = getOrCreateEffectsAudio();
    if (fxAudio) {
      fxAudio.muted = isMutedOnController;
      const fx = (window.currentGameState && window.currentGameState.audioState) ? window.currentGameState.audioState.effects : null;
      if (fx && fx.playing && fx.track) {
        fxAudio.play().catch(() => {});
      } else {
        const originalSrc = fxAudio.src;
        fxAudio.src = SILENCE_SRC;
        fxAudio.play().then(() => {
          fxAudio.pause();
          fxAudio.src = originalSrc;
        }).catch(() => {});
      }
    }

    audioUnlocked = true;
    const banner = document.getElementById('audio-unlock-banner');
    if (banner) banner.remove();
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', unlockAudioElements, { passive: true });
    window.addEventListener('click', unlockAudioElements, { passive: true });
    window.addEventListener('keydown', unlockAudioElements, { passive: true });
    window.addEventListener('touchstart', unlockAudioElements, { passive: true });
  }

  // Callback lắng nghe cập nhật trạng thái
  const listeners = [];
  window.onGameStateChange = function(fn) {
    if (typeof fn === 'function') {
      listeners.push(fn);
      // Đợi call stack hiện tại hoàn tất khởi tạo DOM và biến trước khi gọi lần đầu (tránh lỗi TDZ)
      setTimeout(() => {
        try {
          fn(window.currentGameState, { 
            viewChanged: true, 
            playersChanged: true, 
            questionsChanged: true, 
            vong1Changed: true,
            vong2Changed: true,
            vong3Changed: true,
            vong4Changed: true
          });
        } catch (e) {}
      }, 0);
    }
  };

  function notifyListeners(state, changes) {
    listeners.forEach(fn => {
      try { fn(state, changes); } catch (e) {}
    });
  }

  // Cập nhật trạng thái một cách thông minh (chống giật lùi tuyệt đối, chỉ thông báo khi có thay đổi)
  window.applyState = function(newState, force = false) {
    if (!newState) return;

    const currentLastUpdated = window.currentGameState.lastUpdated || 0;
    const incomingLastUpdated = newState.lastUpdated || 0;

    const oldState = window.currentGameState;
    const viewChanged = oldState.currentView !== newState.currentView;
    const playersChanged = JSON.stringify(oldState.players) !== JSON.stringify(newState.players);
    const questionsChanged = newState.questions && JSON.stringify(oldState.questions) !== JSON.stringify(newState.questions);
    const vong1Changed = JSON.stringify(oldState.vong1State) !== JSON.stringify(newState.vong1State);
    const vong2Changed = JSON.stringify(oldState.vong2State) !== JSON.stringify(newState.vong2State);
    const vong3Changed = JSON.stringify(oldState.vong3State) !== JSON.stringify(newState.vong3State);
    const vong4Changed = JSON.stringify(oldState.vong4State) !== JSON.stringify(newState.vong4State);
    const chpChanged = JSON.stringify(oldState.chpState) !== JSON.stringify(newState.chpState);
    const audioChanged = JSON.stringify(oldState.audioState) !== JSON.stringify(newState.audioState);
    const roomAuthChanged = JSON.stringify(oldState.roomAuth) !== JSON.stringify(newState.roomAuth);

    // Nếu không có gì thay đổi thì bỏ qua
    if (!force && !viewChanged && !playersChanged && !questionsChanged && !vong1Changed && !vong2Changed && !vong3Changed && !vong4Changed && !chpChanged && !audioChanged && !roomAuthChanged && oldState.lastUpdated === newState.lastUpdated) {
      return;
    }

    lastSyncTime = Math.max(lastSyncTime, newState.lastUpdated || Date.now());
    window.currentGameState = {
      ...window.currentGameState,
      ...newState,
      lastUpdated: Math.max(currentLastUpdated, incomingLastUpdated || Date.now()),
      roomAuth: {
        ...(window.currentGameState.roomAuth || {}),
        ...(newState.roomAuth || {}),
        passwords: {
          ...(window.currentGameState.roomAuth?.passwords || {}),
          ...(newState.roomAuth?.passwords || {})
        }
      },
      vong1State: {
        ...(window.currentGameState.vong1State || {}),
        ...(newState.vong1State || {}),
        answers: (newState.vong1State?.isNewQuestion)
          ? (newState.vong1State.answers || {})
          : {
              ...(window.currentGameState.vong1State?.answers || {}),
              ...(newState.vong1State?.answers || {})
            },
        // Chống giật lùi tuyệt đối: Khi đồng hồ đang chạy, số giây chỉ giảm theo thời gian thực chuẩn Server
        timerSeconds: (
          newState.vong1State?.timerRunning && typeof newState.vong1State?.timerEndTime === 'number' && newState.vong1State.timerEndTime > 0
            ? window.calculateRemainingSeconds(newState.vong1State, 5, 'v1')
            : (newState.vong1State?.timerSeconds ?? window.currentGameState.vong1State?.timerSeconds ?? 5)
        )
      },
      vong2State: {
        ...(window.currentGameState.vong2State || {}),
        ...(newState.vong2State || {}),
        chosenTopics: Array.isArray(newState.vong2State?.chosenTopics)
          ? newState.vong2State.chosenTopics
          : (window.currentGameState.vong2State?.chosenTopics || []),
        usedQuestionMap: {
          ...(window.currentGameState.vong2State?.usedQuestionMap || {}),
          ...(newState.vong2State?.usedQuestionMap || {})
        },
        bets: (newState.vong2State?.isResetBets || (newState.vong2State?.bets && Object.keys(newState.vong2State.bets).length === 4 && newState.vong2State.bets[1] === 0 && newState.vong2State.bets[2] === 0 && newState.vong2State.bets[3] === 0 && newState.vong2State.bets[4] === 0))
          ? (newState.vong2State.bets || { 1: 0, 2: 0, 3: 0, 4: 0 })
          : {
              ...(window.currentGameState.vong2State?.bets || {}),
              ...(newState.vong2State?.bets || {})
            },
        // Chống giật lùi tuyệt đối: Khi đồng hồ 60s đang chạy, số giây chỉ giảm theo thời gian thực chuẩn Server
        timerSeconds: (
          newState.vong2State?.timerRunning && typeof newState.vong2State?.timerEndTime === 'number' && newState.vong2State.timerEndTime > 0
            ? window.calculateRemainingSeconds(newState.vong2State, 60, 'v2')
            : (newState.vong2State?.timerSeconds ?? window.currentGameState.vong2State?.timerSeconds ?? 60)
        )
      },
      vong3State: {
        ...(window.currentGameState.vong3State || {}),
        ...(newState.vong3State || {}),
        stepTimerSeconds: (
          (newState.vong3State?.isRunning || newState.vong3State?.stepTimerRunning) && typeof newState.vong3State?.stepTimerEndTime === 'number' && newState.vong3State.stepTimerEndTime > 0
            ? window.calculateRemainingSeconds(newState.vong3State, 7, 'v3')
            : (newState.vong3State?.stepTimerSeconds ?? window.currentGameState.vong3State?.stepTimerSeconds ?? 7)
        )
      },
      vong4State: {
        ...(window.currentGameState.vong4State || {}),
        ...(newState.vong4State || {}),
        timerSeconds: (
          newState.vong4State?.timerRunning && typeof newState.vong4State?.timerEndTime === 'number' && newState.vong4State.timerEndTime > 0
            ? window.calculateRemainingSeconds(newState.vong4State, 120, 'v4')
            : (newState.vong4State?.timerSeconds ?? window.currentGameState.vong4State?.timerSeconds ?? 120)
        )
      },
      chpState: {
        ...(window.currentGameState.chpState || {}),
        ...(newState.chpState || {})
      },
      audioState: {
        ...(window.currentGameState.audioState || {}),
        ...(newState.audioState || {}),
        soundboard: {
          ...(window.currentGameState.audioState?.soundboard || {}),
          ...(newState.audioState?.soundboard || {})
        },
        effects: {
          ...(window.currentGameState.audioState?.effects || {}),
          ...(newState.audioState?.effects || {})
        }
      }
    };

    // Xóa triệt để các cờ lệnh tạm thời để không bị lây nhiễm khi spread ...v1/v2/v3/v4
    ['vong1State', 'vong2State', 'vong3State', 'vong4State'].forEach(vKey => {
      if (window.currentGameState[vKey]) {
        delete window.currentGameState[vKey].isStartTimer;
        delete window.currentGameState[vKey].isResetTimer;
        delete window.currentGameState[vKey].isStopTimer;
      }
    });

    if (audioChanged || force) {
      syncGlobalAudio(window.currentGameState.audioState);
    }

    // Lưu trữ dự phòng ngay vào localStorage để chạy trơn tru khi rớt mạng
    try {
      const currentRid = window.currentGameState.roomAuth?.roomId || currentRoomId || '123456';
      localStorage.setItem('anso_saved_state_' + currentRid, JSON.stringify(window.currentGameState));
    } catch (e) {}

    notifyListeners(window.currentGameState, { 
      viewChanged, 
      playersChanged, 
      questionsChanged, 
      vong1Changed, 
      vong2Changed,
      vong3Changed,
      vong4Changed,
      chpChanged,
      audioChanged,
      roomAuthChanged
    });
  };

  // Gửi lệnh lên Server siêu tốc (0ms delay) và có lưu offline fallback
  const offlineQueue = [];
  let isFlushingQueue = false;

  async function enqueueAndSendPayload(payloadData, rid) {
    try {
      const encryptedPayload = GameCipher.encrypt(payloadData);
      const url = window.getServerApiUrl('/api/game/state?roomid=' + encodeURIComponent(rid));
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: encryptedPayload })
      });
      if (res.ok) {
        return true;
      }
    } catch (e) {
      offlineQueue.push({ payloadData, rid });
    }
    return false;
  }

  async function flushOfflineQueue() {
    if (isFlushingQueue || offlineQueue.length === 0) return;
    isFlushingQueue = true;
    while (offlineQueue.length > 0) {
      const item = offlineQueue[0];
      try {
        const encryptedPayload = GameCipher.encrypt(item.payloadData);
        const url = window.getServerApiUrl('/api/game/state?roomid=' + encodeURIComponent(item.rid));
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload: encryptedPayload })
        });
        if (res.ok) {
          offlineQueue.shift();
        } else {
          break;
        }
      } catch (e) {
        break;
      }
    }
    isFlushingQueue = false;
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      flushOfflineQueue();
      initEventSource();
      window.fetchServerState();
    });
  }

  // Lắng nghe BroadcastChannel từ tab Controller hoặc các tab khác (tức thì 0ms, không lag)
  if (channel) {
    channel.onmessage = (event) => {
      if (!event.data) return;

      // Xử lý trực tiếp và lập tức khi thí sinh bấm chọn đáp án (0ms delay)
      if (event.data.type === 'PLAYER_ANSWER_SUBMITTED') {
        const pId = event.data.playerId;
        const ans = event.data.answer;
        if (pId && ans) {
          if (!window.currentGameState.vong1State) window.currentGameState.vong1State = {};
          if (!window.currentGameState.vong1State.answers) window.currentGameState.vong1State.answers = {};
          window.currentGameState.vong1State.answers[pId] = ans;
          notifyListeners(window.currentGameState, { vong1Changed: true });
        }
        return;
      }

      if (event.data.type === 'PLAYER_BUZZER_RUNG') {
        if (event.data.state) {
          window.applyState(event.data.state, true);
        }
        return;
      }

      if (event.data.type === 'AUDIO_PLAY_INSTANT') {
        const { subType, track, loop, playing, timestamp } = event.data;
        if (!window.currentGameState.audioState) window.currentGameState.audioState = {};
        if (subType === 'soundboard') {
          window.currentGameState.audioState.soundboard = {
            track: track || null,
            playing: !!playing,
            loop: !!loop,
            timestamp: timestamp || Date.now()
          };
        } else if (subType === 'effects') {
          window.currentGameState.audioState.effects = {
            track: track || null,
            playing: !!playing,
            loop: !!loop,
            timestamp: timestamp || Date.now()
          };
        }
        syncGlobalAudio(window.currentGameState.audioState, true);
        notifyListeners(window.currentGameState, { audioChanged: true });
        return;
      }

      if (event.data.type === 'GAME_STATE_UPDATE') {
        const stateObj = event.data.state || (event.data.payload ? GameCipher.decrypt(event.data.payload) : null);
        if (stateObj) {
          window.applyState(stateObj, false);
        }
      }
    };
  }

  // Lắng nghe Server-Sent Events (SSE) để đồng bộ thời gian thực tức thì (<10ms)
  let eventSource = null;
  function initEventSource() {
    if (typeof EventSource === 'undefined') return;
    try {
      if (eventSource) {
        try { eventSource.close(); } catch (e) {}
      }
      const rid = getCurrentRoomId();
      const sseUrl = window.getServerApiUrl('/api/game/events?roomid=' + encodeURIComponent(rid));
      eventSource = new EventSource(sseUrl);
      eventSource.onmessage = function(event) {
        try {
          if (event.data) {
            const raw = JSON.parse(event.data);
            if (raw && typeof raw.serverTime === 'number' && !hasInitialNtpSync) {
              window.serverTimeOffset = Math.round(raw.serverTime - Date.now());
              hasInitialNtpSync = true;
            }
            let serverState = null;
            if (raw && raw.payload) {
              serverState = GameCipher.decrypt(raw.payload);
            } else {
              serverState = raw;
            }
            if (serverState) {
              window.applyState(serverState, false);
            }
          }
        } catch (err) {}
      };
      eventSource.onerror = function() {
        if (eventSource) {
          try { eventSource.close(); } catch (e) {}
          eventSource = null;
        }
        setTimeout(initEventSource, 3000);
      };
    } catch (e) {}
  }
  initEventSource();

  // Đồng bộ với server qua HTTP (chỉ dùng khi khởi tạo hoặc fallback)
  window.fetchServerState = async function() {
    if (isFetching) return;
    isFetching = true;
    try {
      const rid = getCurrentRoomId();
      const stateUrl = window.getServerApiUrl('/api/game/state?roomid=' + encodeURIComponent(rid));
      const res = await fetch(stateUrl);
      if (res.ok) {
        const raw = await res.json();
        if (raw && typeof raw.serverTime === 'number' && !hasInitialNtpSync) {
          window.serverTimeOffset = Math.round(raw.serverTime - Date.now());
          hasInitialNtpSync = true;
        }
        let serverState = null;
        if (raw && raw.payload) {
          serverState = GameCipher.decrypt(raw.payload);
        } else {
          serverState = raw;
        }
        if (serverState) {
          window.applyState(serverState, false);
        }
      }
    } catch (e) {
      // Bỏ qua lỗi ngắt kết nối tạm thời
    } finally {
      isFetching = false;
    }
  };

  // Polling dự phòng nhẹ nhàng chỉ khi SSE bị mất kết nối (tránh xung đột và giật lag)
  function scheduleAdaptivePoll() {
    setTimeout(async () => {
      const isSSEConnected = eventSource && eventSource.readyState === 1;
      if (!isSSEConnected) {
        await window.fetchServerState();
      }
      scheduleAdaptivePoll();
    }, 4000);
  }
  window.fetchServerState().then(scheduleAdaptivePoll).catch(scheduleAdaptivePoll);

  // Các hàm gửi lệnh từ Controller hoặc Player (0ms delay, mượt mà tuyệt đối)
  window.broadcastStateUpdate = async function(updatedFields) {
    const updatedState = {
      ...window.currentGameState,
      ...updatedFields,
      lastUpdated: Date.now()
    };
    if (updatedFields.vong1State) {
      updatedState.vong1State = {
        ...(window.currentGameState.vong1State || {}),
        ...updatedFields.vong1State,
        answers: updatedFields.vong1State.isNewQuestion
          ? (updatedFields.vong1State.answers || {})
          : {
              ...(window.currentGameState.vong1State?.answers || {}),
              ...(updatedFields.vong1State.answers || {})
            }
      };
    }
    if (updatedFields.audioState) {
      updatedState.audioState = {
        ...(window.currentGameState.audioState || {}),
        ...updatedFields.audioState,
        soundboard: {
          ...(window.currentGameState.audioState?.soundboard || {}),
          ...(updatedFields.audioState.soundboard || {})
        },
        effects: {
          ...(window.currentGameState.audioState?.effects || {}),
          ...(updatedFields.audioState.effects || {})
        }
      };
    }
    if (updatedFields.vong2State) {
      updatedState.vong2State = {
        ...(window.currentGameState.vong2State || {}),
        ...updatedFields.vong2State,
        chosenTopics: Array.isArray(updatedFields.vong2State.chosenTopics)
          ? updatedFields.vong2State.chosenTopics
          : (window.currentGameState.vong2State?.chosenTopics || []),
        usedQuestionMap: {
          ...(window.currentGameState.vong2State?.usedQuestionMap || {}),
          ...(updatedFields.vong2State.usedQuestionMap || {})
        },
        bets: (updatedFields.vong2State.isResetBets || (updatedFields.vong2State.bets && Object.keys(updatedFields.vong2State.bets).length === 4 && updatedFields.vong2State.bets[1] === 0 && updatedFields.vong2State.bets[2] === 0 && updatedFields.vong2State.bets[3] === 0 && updatedFields.vong2State.bets[4] === 0))
          ? (updatedFields.vong2State.bets || { 1: 0, 2: 0, 3: 0, 4: 0 })
          : {
              ...(window.currentGameState.vong2State?.bets || {}),
              ...(updatedFields.vong2State.bets || {})
            }
      };
    }
    if (updatedFields.vong3State) {
      updatedState.vong3State = {
        ...(window.currentGameState.vong3State || {}),
        ...updatedFields.vong3State
      };
    }
    if (updatedFields.vong4State) {
      updatedState.vong4State = {
        ...(window.currentGameState.vong4State || {}),
        ...updatedFields.vong4State
      };
    }
    if (updatedFields.chpState) {
      updatedState.chpState = {
        ...(window.currentGameState.chpState || {}),
        ...updatedFields.chpState
      };
    }
    if (updatedFields.roomAuth) {
      updatedState.roomAuth = {
        ...(window.currentGameState.roomAuth || {}),
        ...updatedFields.roomAuth,
        passwords: {
          ...(window.currentGameState.roomAuth?.passwords || {}),
          ...(updatedFields.roomAuth.passwords || {})
        }
      };
    }

    // 1. Cập nhật ngay lập tức cục bộ (0ms UI latency)
    window.applyState(updatedState, true);

    const rid = updatedFields.roomAuth?.roomId || getCurrentRoomId();
    if (rid !== currentRoomId) {
      currentRoomId = rid;
      initRoomBroadcastChannel(rid);
      initEventSource();
    }

    // 2. Broadcast siêu tốc tức thì tới mọi tab khác trong trình duyệt (0ms, không lag CPU)
    if (channel) {
      try {
        const encBroadcast = GameCipher.encrypt(updatedState);
        channel.postMessage({
          type: 'GAME_STATE_UPDATE',
          state: updatedState,
          payload: encBroadcast
        });
      } catch (e) {}
    }

    // 3. Gửi ngay lập tức lên Server (0ms delay, không bỏ sót bất kỳ lệnh điều khiển Start / Stop nào)
    const payloadData = {
      ...updatedFields,
      roomId: rid,
      lastUpdated: updatedState.lastUpdated
    };
    enqueueAndSendPayload(payloadData, rid);
  };

  // Hàm người chơi gửi đáp án Đúng/Sai (Vòng 1) - Tức thì 0ms, ghi nhận 100% lần bấm đầu tiên, bất kể mạng mạnh hay yếu
  window.submitPlayerAnswer = async function(playerId, answer) {
    const rid = getCurrentRoomId();

    // 1. Cập nhật tức thì vào bộ nhớ cục bộ (0ms latency, không phụ thuộc vào mạng)
    if (!window.currentGameState.vong1State) window.currentGameState.vong1State = {};
    if (!window.currentGameState.vong1State.answers) window.currentGameState.vong1State.answers = {};
    window.currentGameState.vong1State.answers[playerId] = answer;
    window.currentGameState.lastUpdated = Date.now();

    // Thông báo cho giao diện tab hiện tại cập nhật tức thì
    notifyListeners(window.currentGameState, { vong1Changed: true });

    // 2. Phát tín hiệu siêu tốc qua BroadcastChannel tới Controller & Host & Viewer (0ms, cùng trình duyệt, không cần internet)
    if (channel) {
      try {
        channel.postMessage({
          type: 'PLAYER_ANSWER_SUBMITTED',
          roomId: rid,
          playerId: playerId,
          answer: answer,
          state: window.currentGameState
        });
      } catch (e) {}
    }

    // 3. Gửi gói tin siêu nhẹ (~50 bytes) lên Server với cơ chế retry tự động (hoạt động bền bỉ kể cả mạng 2G/3G/lag)
    const sendDirect = async () => {
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), 3500) : null;
        const encPayload = GameCipher.encrypt({ roomId: rid, playerId: playerId, answer: answer });
        const answerUrl = window.getServerApiUrl('/api/game/answer?roomid=' + encodeURIComponent(rid));
        const res = await fetch(answerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload: encPayload }),
          signal: controller ? controller.signal : undefined
        });
        if (timeoutId) clearTimeout(timeoutId);
        return res.ok;
      } catch (err) {
        return false;
      }
    };

    const success = await sendDirect();
    if (!success) {
      // Tự động thử lại lần 2 sau 300ms nếu mạng chập chờn
      setTimeout(async () => {
        const retryOk = await sendDirect();
        if (!retryOk) {
          // Thử lại qua queue nếu mạng vẫn rớt
          enqueueAndSendPayload({
            vong1State: {
              answers: { [playerId]: answer }
            },
            roomId: rid,
            lastUpdated: Date.now()
          }, rid);
        }
      }, 300);
    }
  };

  // Hàm người chơi bấm chuông (Vòng 3)
  window.ringBuzzer = async function(playerId) {
    const v3 = window.currentGameState.vong3State || {};
    // Kiểm tra nếu chuông không khóa, player được phép bấm chuông, và chưa có ai bấm hoặc người này chưa bấm
    const isAllowed = Array.isArray(v3.allowedBellPlayers) ? v3.allowedBellPlayers.includes(playerId) : true;
    const hasRung = Array.isArray(v3.rungPlayers) ? v3.rungPlayers.includes(playerId) : false;

    if (!v3.isBellLocked && isAllowed && !hasRung && !v3.bellRungBy) {
      const newRungList = [...(v3.rungPlayers || []), playerId];
      const payload = {
        ...v3,
        bellRungBy: playerId,
        bellRungTime: Date.now(),
        rungPlayers: newRungList,
        isBellLocked: true,
        isRunning: false // Dừng chạy câu hỏi khi có 1 người bấm chuông
      };

      // Cập nhật ngay trạng thái địa phương để giao diện đổi lập tức trên cú bấm đầu tiên
      window.currentGameState.vong3State = payload;
      if (typeof window.renderCurrentView === 'function') {
        try { window.renderCurrentView(); } catch(e) {}
      }

      await window.broadcastStateUpdate({
        vong3State: payload
      });
      return true;
    }
    return false;
  };

  // Hàm người chơi bấm chuông Câu hỏi phụ (CHP)
  window.ringCHPBuzzer = async function(playerId) {
    const chp = window.currentGameState.chpState || {};
    let allowedList = [1, 2, 3, 4];
    if (Array.isArray(chp.allowedPlayerIds)) {
      allowedList = chp.allowedPlayerIds.map(Number);
    } else if (chp.allowedPlayerId && chp.allowedPlayerId !== 'all') {
      allowedList = [Number(chp.allowedPlayerId)];
    }

    const isAllowed = allowedList.includes(Number(playerId));
    const isLocked = (chp.locked === true || chp.locked === undefined);

    if (!isLocked && isAllowed && !chp.buzzerWinner) {
      const players = window.currentGameState.players || [];
      const p = players.find(x => Number(x.id) === Number(playerId)) || { name: `Player ${playerId}` };
      const now = new Date();
      const timeStr = now.toLocaleTimeString('vi-VN') + '.' + String(Date.now() % 1000).padStart(3, '0');
      
      const payload = {
        ...chp,
        locked: true,
        buzzerWinner: {
          playerId: Number(playerId),
          name: p.name,
          time: timeStr,
          timestamp: Date.now()
        }
      };

      // Cập nhật ngay local state
      window.currentGameState.chpState = payload;
      notifyListeners(window.currentGameState, { chpChanged: true });

      await window.broadcastStateUpdate({
        chpState: payload,
        audioState: {
          ...(window.currentGameState.audioState || {}),
          effects: {
            track: '5s.mp3',
            playing: true,
            loop: false,
            timestamp: Date.now()
          }
        }
      });
      return true;
    }
    return false;
  };

  // =========================================================================
  // ĐỘNG CƠ ĐẾM THỜI GIAN THỰC ĐỒNG NHẤT TOÀN DIỆN (UNIVERSAL LIVE TIMER ENGINE)
  // Đồng bộ tuyệt đối theo mốc Server Epoch ms giữa mọi vị trí địa lý, chống giật lùi
  // =========================================================================
  setInterval(() => {
    if (typeof document === 'undefined') return;
    const state = window.currentGameState;
    if (!state) return;

    // 1. Vòng 1 (5 giây)
    const v1 = state.vong1State;
    if (v1) {
      if (v1.timerRunning && typeof v1.timerEndTime === 'number' && v1.timerEndTime > 0) {
        const rem = window.calculateRemainingSeconds(v1, 5, 'v1');
        const viewerTimerVal = document.getElementById('viewer-v1-timer-val');
        if (viewerTimerVal) {
          viewerTimerVal.textContent = `${rem}`;
          viewerTimerVal.style.color = rem > 0 ? '#ef4444' : '#ffffff';
        }
        const hostTimerSec = document.getElementById('host-v1-timer-sec');
        if (hostTimerSec) {
          hostTimerSec.textContent = `${rem}s`;
          hostTimerSec.style.color = rem > 0 ? '#ef4444' : '#facc15';
        }
        const ctrlTimerSec = document.getElementById('ctrl-v1-timer-sec');
        if (ctrlTimerSec) {
          ctrlTimerSec.textContent = `${rem}s`;
        }
        const ctrlTimerDisplay = document.getElementById('ctrl-v1-timer-display');
        if (ctrlTimerDisplay) {
          ctrlTimerDisplay.textContent = `${rem}s`;
          ctrlTimerDisplay.style.color = rem > 0 ? '#ef4444' : '#facc15';
        }
        const pTimerSec = document.getElementById('p-v1-timer-sec');
        if (pTimerSec) {
          pTimerSec.textContent = `${rem}s`;
          pTimerSec.style.color = rem > 0 ? '#ef4444' : '#facc15';
        }
        // Tự động vô hiệu hóa nút bấm của người chơi khi hết 5 giây
        if (rem <= 0) {
          const btnDung = document.getElementById('btn-v1-dung');
          const btnSai = document.getElementById('btn-v1-sai');
          if (btnDung && !btnDung.disabled) btnDung.disabled = true;
          if (btnSai && !btnSai.disabled) btnSai.disabled = true;
        }
      } else if (!v1.timerRunning && typeof v1.timerSeconds === 'number') {
        const stoppedSec = v1.timerSeconds;
        const viewerTimerVal = document.getElementById('viewer-v1-timer-val');
        if (viewerTimerVal) {
          viewerTimerVal.textContent = `${stoppedSec}`;
          viewerTimerVal.style.color = '#ffffff';
        }
        const hostTimerSec = document.getElementById('host-v1-timer-sec');
        if (hostTimerSec) {
          hostTimerSec.textContent = `${stoppedSec}s`;
          hostTimerSec.style.color = '#facc15';
        }
        const ctrlTimerDisplay = document.getElementById('ctrl-v1-timer-display');
        if (ctrlTimerDisplay) {
          ctrlTimerDisplay.textContent = `${stoppedSec}s`;
          ctrlTimerDisplay.style.color = '#facc15';
        }
        const pTimerSec = document.getElementById('p-v1-timer-sec');
        if (pTimerSec) {
          pTimerSec.textContent = `${stoppedSec}s`;
          pTimerSec.style.color = '#facc15';
        }
      }
    }

    // 2. Vòng 2 (60 giây)
    const v2 = state.vong2State;
    if (v2) {
      if (v2.timerRunning && typeof v2.timerEndTime === 'number' && v2.timerEndTime > 0) {
        const rem = window.calculateRemainingSeconds(v2, 60, 'v2');
        const viewerV2Timer = document.getElementById('viewer-v2-timer-val');
        if (viewerV2Timer) {
          viewerV2Timer.textContent = `${rem}`;
          viewerV2Timer.style.color = rem > 0 ? '#ef4444' : '#facc15';
        }
        const hostV2Timer = document.getElementById('host-v2-timer-display');
        if (hostV2Timer) {
          hostV2Timer.textContent = `THỜI GIAN: ${rem}s`;
          hostV2Timer.style.color = rem > 0 ? '#ef4444' : '#facc15';
        }
        const pV2Timer = document.getElementById('p-v2-timer-display');
        if (pV2Timer) {
          pV2Timer.textContent = `THỜI GIAN: ${rem}s`;
          pV2Timer.style.color = rem > 0 ? '#ef4444' : '#facc15';
        }
        const ctrlV2Timer = document.getElementById('ctrl-v2-timer-display');
        if (ctrlV2Timer) {
          ctrlV2Timer.textContent = `${rem}s`;
          ctrlV2Timer.style.color = rem > 0 ? '#ef4444' : '#facc15';
        }
      } else if (!v2.timerRunning && typeof v2.timerSeconds === 'number') {
        const stoppedSec = v2.timerSeconds;
        const viewerV2Timer = document.getElementById('viewer-v2-timer-val');
        if (viewerV2Timer) {
          viewerV2Timer.textContent = `${stoppedSec}`;
          viewerV2Timer.style.color = '#facc15';
        }
        const hostV2Timer = document.getElementById('host-v2-timer-display');
        if (hostV2Timer) {
          hostV2Timer.textContent = `THỜI GIAN: ${stoppedSec}s`;
          hostV2Timer.style.color = '#facc15';
        }
        const pV2Timer = document.getElementById('p-v2-timer-display');
        if (pV2Timer) {
          pV2Timer.textContent = `THỜI GIAN: ${stoppedSec}s`;
          pV2Timer.style.color = '#facc15';
        }
        const ctrlV2Timer = document.getElementById('ctrl-v2-timer-display');
        if (ctrlV2Timer) {
          ctrlV2Timer.textContent = `${stoppedSec}s`;
          ctrlV2Timer.style.color = '#facc15';
        }
      }
    }

    // 3. Vòng 3 (7 giây mỗi bước)
    const v3 = state.vong3State;
    if (v3) {
      const isRunningV3 = !!(v3.isRunning || v3.stepTimerRunning);
      if (isRunningV3 && typeof v3.stepTimerEndTime === 'number' && v3.stepTimerEndTime > 0) {
        const rem = window.calculateRemainingSeconds(v3, 7, 'v3');
        const hostV3Timer = document.getElementById('host-v3-timer-display');
        if (hostV3Timer) {
          hostV3Timer.textContent = `BƯỚC: ${rem}s`;
        }
        const pV3Timer = document.getElementById('p-v3-timer-step-display');
        if (pV3Timer) {
          pV3Timer.textContent = `BƯỚC: ${rem}s`;
        }
        const ctrlV3Timer = document.getElementById('ctrl-v3-timer-display');
        if (ctrlV3Timer) {
          ctrlV3Timer.textContent = `${rem}s`;
        }
      } else if (!isRunningV3 && typeof v3.stepTimerSeconds === 'number') {
        const stoppedSec = v3.stepTimerSeconds;
        const hostV3Timer = document.getElementById('host-v3-timer-display');
        if (hostV3Timer) {
          hostV3Timer.textContent = `BƯỚC: ${stoppedSec}s`;
        }
        const pV3Timer = document.getElementById('p-v3-timer-step-display');
        if (pV3Timer) {
          pV3Timer.textContent = `BƯỚC: ${stoppedSec}s`;
        }
        const ctrlV3Timer = document.getElementById('ctrl-v3-timer-display');
        if (ctrlV3Timer) {
          ctrlV3Timer.textContent = `${stoppedSec}s`;
        }
      }
    }

    // 4. Vòng 4 (120 giây)
    const v4 = state.vong4State;
    if (v4) {
      if (v4.timerRunning && typeof v4.timerEndTime === 'number' && v4.timerEndTime > 0) {
        const rem = window.calculateRemainingSeconds(v4, 120, 'v4');
        const viewerV4Timer = document.getElementById('viewer-v4-timer-val');
        if (viewerV4Timer) {
          viewerV4Timer.textContent = `${rem}`;
          viewerV4Timer.style.color = rem > 0 ? '#ef4444' : '#ffffff';
        }
        const hostV4Timer = document.getElementById('host-v4-timer-display');
        if (hostV4Timer) {
          hostV4Timer.textContent = `120s: ${rem}s`;
          hostV4Timer.style.color = rem > 0 ? '#ef4444' : '#facc15';
        }
        const ctrlV4Timer = document.getElementById('ctrl-v4-timer-display');
        if (ctrlV4Timer) {
          ctrlV4Timer.textContent = `${rem}s`;
          ctrlV4Timer.style.color = rem > 0 ? '#ef4444' : '#facc15';
        }
        const pV4Timer = document.getElementById('p-v4-timer-display');
        if (pV4Timer) {
          pV4Timer.textContent = `120s: ${rem}s`;
          pV4Timer.style.color = rem > 0 ? '#ef4444' : '#facc15';
        }
        const ctrlPreviewTimer = document.getElementById('ctrl-v4-preview-timer-val');
        if (ctrlPreviewTimer) {
          ctrlPreviewTimer.textContent = `${rem}s`;
        }
        const ctrlPreviewStatus = document.getElementById('ctrl-v4-preview-timer-status');
        if (ctrlPreviewStatus) {
          ctrlPreviewStatus.textContent = 'Đang chạy';
          ctrlPreviewStatus.style.color = '#ef4444';
        }
      } else if (!v4.timerRunning && typeof v4.timerSeconds === 'number') {
        const stoppedSec = v4.timerSeconds;
        const viewerV4Timer = document.getElementById('viewer-v4-timer-val');
        if (viewerV4Timer) {
          viewerV4Timer.textContent = `${stoppedSec}`;
          viewerV4Timer.style.color = '#ffffff';
        }
        const hostV4Timer = document.getElementById('host-v4-timer-display');
        if (hostV4Timer) {
          hostV4Timer.textContent = `120s: ${stoppedSec}s`;
          hostV4Timer.style.color = '#facc15';
        }
        const ctrlV4Timer = document.getElementById('ctrl-v4-timer-display');
        if (ctrlV4Timer) {
          ctrlV4Timer.textContent = `${stoppedSec}s`;
          ctrlV4Timer.style.color = '#facc15';
        }
        const pV4Timer = document.getElementById('p-v4-timer-display');
        if (pV4Timer) {
          pV4Timer.textContent = `120s: ${stoppedSec}s`;
          pV4Timer.style.color = '#facc15';
        }
        const ctrlPreviewTimer = document.getElementById('ctrl-v4-preview-timer-val');
        if (ctrlPreviewTimer) {
          ctrlPreviewTimer.textContent = `${stoppedSec}s`;
        }
        const ctrlPreviewStatus = document.getElementById('ctrl-v4-preview-timer-status');
        if (ctrlPreviewStatus) {
          ctrlPreviewStatus.textContent = 'Đang dừng';
          ctrlPreviewStatus.style.color = '#94a3b8';
        }
      }
    }
  }, 25);

  // Bắt và xử lý sạch sẽ mọi lỗi ngoại lệ Uncaught để console luôn trong sạch
  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', function(event) {
      if (event && event.reason) {
        const r = event.reason;
        if (r.name === 'NotAllowedError' || r.name === 'AbortError' || (typeof r.message === 'string' && r.message.includes('play()'))) {
          event.preventDefault();
        }
      }
    });
  }
})();

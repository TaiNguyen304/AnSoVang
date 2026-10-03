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
        const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
        const plainBytes = stringToUtf8ByteArray(plaintext);
        const nonceObj = generateRandomNonce();
        const encryptedBytes = processChaCha20(plainBytes, nonceObj.words);
        const combined = new Uint8Array(12 + encryptedBytes.length);
        combined.set(nonceObj.bytes, 0);
        combined.set(encryptedBytes, 12);
        return bytesToBase64(combined);
      } catch (err) {
        return null;
      }
    }

    function decrypt(ciphertext) {
      try {
        if (!ciphertext || typeof ciphertext !== 'string') return null;
        const combined = base64ToBytes(ciphertext);
        if (combined.length < 12) return null;
        const nonceBytes = combined.slice(0, 12);
        const encryptedBytes = combined.slice(12);
        const nonceWords = new Uint32Array(3);
        nonceWords[0] = (nonceBytes[0] | (nonceBytes[1] << 8) | (nonceBytes[2] << 16) | (nonceBytes[3] << 24)) >>> 0;
        nonceWords[1] = (nonceBytes[4] | (nonceBytes[5] << 8) | (nonceBytes[6] << 16) | (nonceBytes[7] << 24)) >>> 0;
        nonceWords[2] = (nonceBytes[8] | (nonceBytes[9] << 8) | (nonceBytes[10] << 16) | (nonceBytes[11] << 24)) >>> 0;
        const decryptedBytes = processChaCha20(encryptedBytes, nonceWords);
        const jsonStr = utf8ByteArrayToString(decryptedBytes);
        return JSON.parse(jsonStr);
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

  function initRoomBroadcastChannel(rid) {
    if (typeof BroadcastChannel === 'undefined') return null;
    if (channel) {
      try { channel.close(); } catch (e) {}
    }
    try {
      channel = new BroadcastChannel('anso_gold_sync_' + rid);
      channel.onmessage = (event) => {
        if (event.data && event.data.type === 'GAME_STATE_UPDATE') {
          let stateObj = event.data.state;
          if (event.data.payload) {
            stateObj = GameCipher.decrypt(event.data.payload);
          }
          if (stateObj) {
            window.applyState(stateObj);
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
    lastUpdated: 0
  };

  window.isController = (typeof window !== 'undefined') && window.location.pathname.toLowerCase().includes('controller');

  let soundboardAudio = null;
  let effectsAudio = null;
  let lastSoundboardTimestamp = 0;
  let lastEffectsTimestamp = 0;

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

  function resolveAudioUrl(track) {
    if (!track) return '';
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
        console.log('[Audio] Soundboard đang phát thành công:', soundboardAudio.src);
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
        if (soundboardAudio && !soundboardAudio.loop) {
          if (window.isController && typeof window.broadcastStateUpdate === 'function') {
            window.broadcastStateUpdate({
              audioState: {
                soundboard: {
                  track: null,
                  playing: false,
                  loop: false,
                  timestamp: Date.now()
                }
              }
            });
          }
        }
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
        console.log('[Audio] Effects đang phát thành công:', effectsAudio.src);
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
        if (window.isController && typeof window.broadcastStateUpdate === 'function') {
          window.broadcastStateUpdate({
            audioState: {
              effects: {
                track: null,
                playing: false,
                loop: false,
                timestamp: Date.now()
              }
            }
          });
        }
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
      } else {
        sbAudio.loop = false;
        sbAudio.pause();
        sbAudio.currentTime = 0;
      }
    }

    // 2. Synchronize Game Effects (SFX)
    const fx = audioState.effects || {};
    const fxAudio = getOrCreateEffectsAudio();
    if (fxAudio) {
      fxAudio.muted = isMutedOnController;
      if (fx.playing && fx.track) {
        const targetSrc = resolveAudioUrl(fx.track);
        if (fxAudio.getAttribute('data-track') !== fx.track) {
          fxAudio.src = targetSrc;
          fxAudio.setAttribute('data-track', fx.track);
        }

        if (forcePlay || (fx.timestamp && fx.timestamp !== lastEffectsTimestamp)) {
          lastEffectsTimestamp = fx.timestamp;
          fxAudio.loop = false;
          fxAudio.currentTime = 0;
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
      } else {
        fxAudio.loop = false;
        fxAudio.pause();
        fxAudio.currentTime = 0;
      }
    }
  }

  let audioUnlocked = false;
  const SILENCE_SRC = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

  function unlockAudioElements() {
    if (audioUnlocked) return;
    
    const isMutedOnController = window.isController && !isLocalAudioEnabled();
    
    // Unlock Soundboard Audio using guaranteed valid silent source
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

    // Unlock Effects Audio using guaranteed valid silent source
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
    window.addEventListener('click', unlockAudioElements);
    window.addEventListener('keydown', unlockAudioElements);
    window.addEventListener('touchstart', unlockAudioElements);
  }

  // Callback lắng nghe cập nhật trạng thái
  const listeners = [];
  window.onGameStateChange = function(fn) {
    if (typeof fn === 'function') {
      listeners.push(fn);
      // Gọi ngay với state hiện tại
      fn(window.currentGameState, { 
        viewChanged: true, 
        playersChanged: true, 
        questionsChanged: true, 
        vong1Changed: true,
        vong2Changed: true,
        vong3Changed: true,
        vong4Changed: true
      });
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
    const vong1Changed = JSON.stringify(oldState.vong1State) !== JSON.stringify(newState.vong1State);
    const vong2Changed = JSON.stringify(oldState.vong2State) !== JSON.stringify(newState.vong2State);
    const vong3Changed = JSON.stringify(oldState.vong3State) !== JSON.stringify(newState.vong3State);
    const vong4Changed = JSON.stringify(oldState.vong4State) !== JSON.stringify(newState.vong4State);
    const chpChanged = JSON.stringify(oldState.chpState) !== JSON.stringify(newState.chpState);
    const audioChanged = JSON.stringify(oldState.audioState) !== JSON.stringify(newState.audioState);
    const roomAuthChanged = JSON.stringify(oldState.roomAuth) !== JSON.stringify(newState.roomAuth);

    // Nếu không có gì thay đổi thì bỏ qua
    if (!viewChanged && !playersChanged && !questionsChanged && !vong1Changed && !vong2Changed && !vong3Changed && !vong4Changed && !chpChanged && !audioChanged && !roomAuthChanged && oldState.lastUpdated === newState.lastUpdated) {
      return;
    }

    lastSyncTime = newState.lastUpdated || Date.now();
    window.currentGameState = {
      ...window.currentGameState,
      ...newState,
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
        ...(newState.vong1State || {})
      },
      vong2State: {
        ...(window.currentGameState.vong2State || {}),
        ...(newState.vong2State || {})
      },
      vong3State: {
        ...(window.currentGameState.vong3State || {}),
        ...(newState.vong3State || {})
      },
      vong4State: {
        ...(window.currentGameState.vong4State || {}),
        ...(newState.vong4State || {})
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

    syncGlobalAudio(window.currentGameState.audioState);

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

  // Lắng nghe BroadcastChannel từ tab Controller hoặc các tab khác (tức thì 0ms, không lag)
  if (channel) {
    channel.onmessage = (event) => {
      if (event.data && event.data.type === 'GAME_STATE_UPDATE') {
        let stateObj = event.data.state;
        if (event.data.payload) {
          stateObj = GameCipher.decrypt(event.data.payload);
        }
        if (stateObj) {
          window.applyState(stateObj);
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
      eventSource = new EventSource('/api/game/events?roomid=' + encodeURIComponent(rid));
      eventSource.onmessage = function(event) {
        try {
          if (event.data) {
            const raw = JSON.parse(event.data);
            let serverState = null;
            if (raw && raw.payload) {
              serverState = GameCipher.decrypt(raw.payload);
            } else {
              serverState = raw;
            }
            if (serverState && (serverState.lastUpdated || 0) > (window.currentGameState.lastUpdated || 0)) {
              window.applyState(serverState);
            }
          }
        } catch (err) {}
      };
      eventSource.onerror = function() {
        if (eventSource) {
          try { eventSource.close(); } catch (e) {}
          eventSource = null;
        }
        setTimeout(initEventSource, 2000);
      };
    } catch (e) {}
  }
  initEventSource();

  // Đồng bộ với server qua HTTP
  window.fetchServerState = async function() {
    if (isFetching) return;
    isFetching = true;
    try {
      const rid = getCurrentRoomId();
      const res = await fetch('/api/game/state?roomid=' + encodeURIComponent(rid));
      if (res.ok) {
        const raw = await res.json();
        let serverState = null;
        if (raw && raw.payload) {
          serverState = GameCipher.decrypt(raw.payload);
        } else {
          serverState = raw;
        }
        if (serverState && serverState.lastUpdated > (window.currentGameState.lastUpdated || 0)) {
          window.applyState(serverState);
        }
      }
    } catch (e) {
      // Bỏ qua lỗi ngắt kết nối tạm thời
    } finally {
      isFetching = false;
    }
  };

  // Polling dự phòng nhẹ nhàng, tránh xung đột khi SSE đang hoạt động
  function scheduleAdaptivePoll() {
    const isSSEConnected = eventSource && eventSource.readyState === 1;
    let delay = 3000;
    if (!isSSEConnected) {
      const s = window.currentGameState || {};
      const isTimerActive = Boolean(
        (s.vong1State && s.vong1State.timerRunning) ||
        (s.vong2State && s.vong2State.timerRunning) ||
        (s.vong3State && s.vong3State.isRunning) ||
        (s.vong4State && s.vong4State.timerRunning)
      );
      delay = isTimerActive ? 800 : 2000;
    }
    setTimeout(async () => {
      await window.fetchServerState();
      scheduleAdaptivePoll();
    }, delay);
  }
  window.fetchServerState().then(scheduleAdaptivePoll).catch(scheduleAdaptivePoll);

  // Các hàm gửi lệnh từ Controller hoặc Player
  window.broadcastStateUpdate = async function(updatedFields) {
    const updatedState = {
      ...window.currentGameState,
      ...updatedFields,
      lastUpdated: Date.now()
    };
    if (updatedFields.vong1State) {
      updatedState.vong1State = {
        ...(window.currentGameState.vong1State || {}),
        ...updatedFields.vong1State
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
        ...updatedFields.vong2State
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
    window.applyState(updatedState);

    const rid = updatedFields.roomAuth?.roomId || getCurrentRoomId();
    if (rid !== currentRoomId) {
      currentRoomId = rid;
      initRoomBroadcastChannel(rid);
      initEventSource();
    }

    // Broadcast tức thời tới mọi tab khác trong cùng phòng qua BroadcastChannel với payload đã mã hóa
    if (channel) {
      const encBroadcast = GameCipher.encrypt(updatedState);
      channel.postMessage({ type: 'GAME_STATE_UPDATE', payload: encBroadcast });
    }

    // Gửi lên server nền theo đúng phòng
    const payloadData = {
      ...updatedFields,
      roomId: rid,
      lastUpdated: updatedState.lastUpdated
    };
    const encryptedPayload = GameCipher.encrypt(payloadData);
    fetch('/api/game/state?roomid=' + encodeURIComponent(rid), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: encryptedPayload })
    }).catch(() => {});
  };

  // Hàm người chơi gửi đáp án Đúng/Sai (Vòng 1)
  window.submitPlayerAnswer = async function(playerId, answer) {
    const currentVong1 = window.currentGameState.vong1State || {};
    const newAnswers = {
      ...(currentVong1.answers || {}),
      [playerId]: answer
    };
    await window.broadcastStateUpdate({
      vong1State: {
        ...currentVong1,
        answers: newAnswers
      }
    });
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
})();

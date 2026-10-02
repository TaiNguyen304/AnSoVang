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
        if (sbAudio.getAttribute('data-track') !== sb.track || sbAudio.src !== targetSrc) {
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
            }).catch(() => {
              showAutoplayNotice(sb.track);
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
        if (fxAudio.getAttribute('data-track') !== fx.track || fxAudio.src !== targetSrc) {
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
            }).catch(() => {
              showAutoplayNotice(fx.track);
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
  function unlockAudioElements() {
    if (audioUnlocked) return;
    
    const isMutedOnController = window.isController && !isLocalAudioEnabled();
    
    // Unlock Soundboard Audio
    const sbAudio = getOrCreateSoundboardAudio();
    if (sbAudio) {
      sbAudio.muted = isMutedOnController;
      sbAudio.play().then(() => {
        const sb = (window.currentGameState && window.currentGameState.audioState) ? window.currentGameState.audioState.soundboard : null;
        if (!sb || !sb.playing || !sb.track) {
          sbAudio.pause();
        } else {
          console.log('[Audio] Soundboard unlocked & playing successfully.');
        }
      }).catch(() => {});
    }

    // Unlock Effects Audio
    const fxAudio = getOrCreateEffectsAudio();
    if (fxAudio) {
      fxAudio.muted = isMutedOnController;
      fxAudio.play().then(() => {
        const fx = (window.currentGameState && window.currentGameState.audioState) ? window.currentGameState.audioState.effects : null;
        if (!fx || !fx.playing || !fx.track) {
          fxAudio.pause();
        } else {
          console.log('[Audio] Effects unlocked & playing successfully.');
        }
      }).catch(() => {});
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
    const audioChanged = JSON.stringify(oldState.audioState) !== JSON.stringify(newState.audioState);

    // Nếu không có gì thay đổi thì bỏ qua
    if (!viewChanged && !playersChanged && !questionsChanged && !vong1Changed && !vong2Changed && !vong3Changed && !vong4Changed && !audioChanged && oldState.lastUpdated === newState.lastUpdated) {
      return;
    }

    lastSyncTime = newState.lastUpdated || Date.now();
    window.currentGameState = {
      ...window.currentGameState,
      ...newState,
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
      audioChanged
    });
  };

  // Lắng nghe BroadcastChannel từ tab Controller hoặc các tab khác (tức thì 0ms, không lag)
  if (channel) {
    channel.onmessage = (event) => {
      if (event.data && event.data.type === 'GAME_STATE_UPDATE') {
        window.applyState(event.data.state);
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
      eventSource = new EventSource('/api/game/events');
      eventSource.onmessage = function(event) {
        try {
          if (event.data) {
            const serverState = JSON.parse(event.data);
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
    window.applyState(updatedState);

    // Broadcast tức thời tới mọi tab khác qua BroadcastChannel (0ms)
    if (channel) {
      channel.postMessage({ type: 'GAME_STATE_UPDATE', state: updatedState });
    }

    // Gửi lên server nền
    const payload = {
      ...updatedFields,
      lastUpdated: updatedState.lastUpdated
    };
    fetch('/api/game/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
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
      await window.broadcastStateUpdate({
        vong3State: {
          ...v3,
          bellRungBy: playerId,
          bellRungTime: Date.now(),
          rungPlayers: newRungList,
          isBellLocked: true,
          isRunning: false // Dừng chạy câu hỏi khi có 1 người bấm chuông
        }
      });
      return true;
    }
    return false;
  };
})();

'use strict';

(function () {
  const video = document.getElementById('screen');
  const loader = document.getElementById('loader');
  const loaderStatus = document.getElementById('loader-status');
  const statusOverlay = document.getElementById('status-overlay');
  const statusText = document.getElementById('status-text');
  const errorOverlay = document.getElementById('error-overlay');
  const errorMsg = document.getElementById('error-msg');
  const retryBtn = document.getElementById('retry-btn');
  const app = document.getElementById('app');

  let ws = null;
  let pc = null;
  let clientId = null;
  let reconnectTimer = null;
  let reconnectDelay = 1000;

  const WS_URL = 'ws://' + window.location.host;

  function setLoaderText(text) {
    if (loaderStatus) loaderStatus.textContent = text;
  }

  function showError(msg) {
    if (errorOverlay) {
      errorOverlay.classList.add('visible');
      if (errorMsg) errorMsg.textContent = msg;
    }
  }

  function hideError() {
    if (errorOverlay) errorOverlay.classList.remove('visible');
  }

  function showStatus(text, fade) {
    if (!statusOverlay || !statusText) return;
    statusText.textContent = text;
    statusOverlay.classList.remove('fade');
    statusOverlay.classList.add('visible');
    if (fade) {
      // force reflow before adding fade class
      void statusOverlay.offsetWidth;
      statusOverlay.classList.add('fade');
    }
  }

  function spawnRipple(clientX, clientY) {
    const el = document.createElement('div');
    el.className = 'ripple';
    el.style.left = clientX + 'px';
    el.style.top = clientY + 'px';
    app.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  function normCoords(clientX, clientY) {
    const rect = video.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    };
  }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  // ── Input event handlers ────────────────────────────────────────────────────

  let lastTouchX = 0;
  let lastTouchY = 0;

  video.addEventListener('touchstart', function (e) {
    e.preventDefault();
    const t = e.touches[0];
    const { x, y } = normCoords(t.clientX, t.clientY);
    lastTouchX = t.clientX;
    lastTouchY = t.clientY;
    spawnRipple(t.clientX, t.clientY);
    send({ type: 'input', event: 'mousedown', button: 0, x, y });
  }, { passive: false });

  video.addEventListener('touchmove', function (e) {
    e.preventDefault();
    const t = e.touches[0];
    const { x, y } = normCoords(t.clientX, t.clientY);
    lastTouchX = t.clientX;
    lastTouchY = t.clientY;
    send({ type: 'input', event: 'mousemove', x, y });
  }, { passive: false });

  video.addEventListener('touchend', function (e) {
    e.preventDefault();
    const { x, y } = normCoords(lastTouchX, lastTouchY);
    send({ type: 'input', event: 'mouseup', button: 0, x, y });
  }, { passive: false });

  // two-finger scroll
  video.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2) {
      e.preventDefault();
    }
  }, { passive: false });

  let lastPinchDist = 0;
  video.addEventListener('touchmove', function (e) {
    if (e.touches.length !== 2) return;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    const delta = lastPinchDist ? dist - lastPinchDist : 0;
    lastPinchDist = dist;
    if (Math.abs(delta) > 2) {
      send({ type: 'input', event: 'scroll', deltaX: 0, deltaY: -delta * 5 });
    }
  }, { passive: false });

  video.addEventListener('touchend', function () {
    lastPinchDist = 0;
  });

  // Mouse fallback for non-touch devices
  video.addEventListener('mousemove', function (e) {
    const { x, y } = normCoords(e.clientX, e.clientY);
    send({ type: 'input', event: 'mousemove', x, y });
  });

  video.addEventListener('mousedown', function (e) {
    const { x, y } = normCoords(e.clientX, e.clientY);
    send({ type: 'input', event: 'mousedown', button: e.button, x, y });
  });

  video.addEventListener('mouseup', function (e) {
    const { x, y } = normCoords(e.clientX, e.clientY);
    send({ type: 'input', event: 'mouseup', button: e.button, x, y });
  });

  video.addEventListener('wheel', function (e) {
    e.preventDefault();
    send({ type: 'input', event: 'scroll', deltaX: e.deltaX, deltaY: e.deltaY });
  }, { passive: false });

  video.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });

  // ── WebRTC ──────────────────────────────────────────────────────────────────

  function closePeer() {
    if (pc) {
      pc.close();
      pc = null;
    }
  }

  async function startPeer(screenWidth, screenHeight) {
    closePeer();

    pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pc.onicecandidate = function (e) {
      if (e.candidate) {
        send({ type: 'ice-candidate', candidate: e.candidate.toJSON() });
      }
    };

    pc.ontrack = function (e) {
      if (e.streams && e.streams[0]) {
        video.srcObject = e.streams[0];
        video.play().catch(function () {});
      }
    };

    pc.onconnectionstatechange = function () {
      const state = pc ? pc.connectionState : 'closed';
      if (state === 'connected') {
        setLoaderText('Streaming…');
        showStatus('Connected · ' + screenWidth + '×' + screenHeight, true);
      } else if (state === 'failed' || state === 'disconnected') {
        setLoaderText('Connection lost. Reconnecting…');
        video.classList.remove('visible');
        if (loader) loader.classList.remove('hidden');
        scheduleReconnect();
      }
    };

    // Add a receive-only transceiver for video
    pc.addTransceiver('video', { direction: 'recvonly' });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({ type: 'offer', sdp: pc.localDescription });
  }

  video.addEventListener('playing', function () {
    if (loader) loader.classList.add('hidden');
    video.classList.add('visible');
  });

  // ── WebSocket ───────────────────────────────────────────────────────────────

  function connect() {
    hideError();
    setLoaderText('Connecting to CarDisplay…');
    if (loader) loader.classList.remove('hidden');

    ws = new WebSocket(WS_URL);

    ws.onopen = function () {
      reconnectDelay = 1000;
      setLoaderText('Waiting for stream…');
    };

    ws.onmessage = async function (evt) {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }

      if (msg.type === 'config') {
        clientId = msg.clientId;
        await startPeer(msg.screenWidth, msg.screenHeight).catch(function (err) {
          showError('WebRTC error: ' + err.message);
        });

      } else if (msg.type === 'answer') {
        if (!pc) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        } catch (err) {
          console.error('setRemoteDescription error:', err);
        }

      } else if (msg.type === 'ice-candidate') {
        if (!pc || !msg.candidate) return;
        try {
          await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } catch (err) {
          console.warn('addIceCandidate error:', err);
        }
      }
    };

    ws.onerror = function () {
      setLoaderText('Connection error');
    };

    ws.onclose = function () {
      closePeer();
      video.classList.remove('visible');
      if (loader) loader.classList.remove('hidden');
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    setLoaderText('Reconnecting in ' + Math.round(reconnectDelay / 1000) + 's…');
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      reconnectDelay = Math.min(reconnectDelay * 2, 16000);
      connect();
    }, reconnectDelay);
  }

  if (retryBtn) {
    retryBtn.addEventListener('click', function () {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      reconnectDelay = 1000;
      connect();
    });
  }

  // Start
  connect();
})();

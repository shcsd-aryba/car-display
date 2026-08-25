'use strict';

(function () {
  const screen = document.getElementById('screen');
  const loader = document.getElementById('loader');
  const loaderStatus = document.getElementById('loader-status');
  const statusOverlay = document.getElementById('status-overlay');
  const statusText = document.getElementById('status-text');
  const errorOverlay = document.getElementById('error-overlay');
  const errorMsg = document.getElementById('error-msg');
  const retryBtn = document.getElementById('retry-btn');
  const app = document.getElementById('app');

  let ws = null;
  let reconnectTimer = null;
  let reconnectDelay = 1000;
  let streaming = false;

  const WS_URL = 'ws://' + window.location.host;

  function setLoaderText(text) {
    if (loaderStatus) loaderStatus.textContent = text;
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
    el.addEventListener('animationend', function () { el.remove(); });
  }

  function normCoords(clientX, clientY) {
    const rect = screen.getBoundingClientRect();
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

  var lastTouchX = 0;
  var lastTouchY = 0;

  screen.addEventListener('touchstart', function (e) {
    e.preventDefault();
    var t = e.touches[0];
    var coords = normCoords(t.clientX, t.clientY);
    lastTouchX = t.clientX;
    lastTouchY = t.clientY;
    spawnRipple(t.clientX, t.clientY);
    send({ type: 'input', event: 'mousedown', button: 0, x: coords.x, y: coords.y });
  }, { passive: false });

  screen.addEventListener('touchmove', function (e) {
    e.preventDefault();
    var t = e.touches[0];
    var coords = normCoords(t.clientX, t.clientY);
    lastTouchX = t.clientX;
    lastTouchY = t.clientY;
    send({ type: 'input', event: 'mousemove', x: coords.x, y: coords.y });
  }, { passive: false });

  screen.addEventListener('touchend', function (e) {
    e.preventDefault();
    var coords = normCoords(lastTouchX, lastTouchY);
    send({ type: 'input', event: 'mouseup', button: 0, x: coords.x, y: coords.y });
  }, { passive: false });

  var lastPinchDist = 0;
  screen.addEventListener('touchmove', function (e) {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    var dx = e.touches[0].clientX - e.touches[1].clientX;
    var dy = e.touches[0].clientY - e.touches[1].clientY;
    var dist = Math.hypot(dx, dy);
    var delta = lastPinchDist ? dist - lastPinchDist : 0;
    lastPinchDist = dist;
    if (Math.abs(delta) > 2) {
      send({ type: 'input', event: 'scroll', deltaX: 0, deltaY: -delta * 5 });
    }
  }, { passive: false });

  screen.addEventListener('touchend', function () {
    lastPinchDist = 0;
  });

  screen.addEventListener('mousemove', function (e) {
    var coords = normCoords(e.clientX, e.clientY);
    send({ type: 'input', event: 'mousemove', x: coords.x, y: coords.y });
  });

  screen.addEventListener('mousedown', function (e) {
    var coords = normCoords(e.clientX, e.clientY);
    send({ type: 'input', event: 'mousedown', button: e.button, x: coords.x, y: coords.y });
  });

  screen.addEventListener('mouseup', function (e) {
    var coords = normCoords(e.clientX, e.clientY);
    send({ type: 'input', event: 'mouseup', button: e.button, x: coords.x, y: coords.y });
  });

  screen.addEventListener('wheel', function (e) {
    e.preventDefault();
    send({ type: 'input', event: 'scroll', deltaX: e.deltaX, deltaY: e.deltaY });
  }, { passive: false });

  screen.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });

  // ── WebSocket + MJPEG ───────────────────────────────────────────────────────

  function connect() {
    hideError();
    setLoaderText('Connecting to CarDisplay…');
    if (loader) loader.classList.remove('hidden');
    streaming = false;

    ws = new WebSocket(WS_URL);

    ws.onopen = function () {
      reconnectDelay = 1000;
      setLoaderText('Waiting for stream…');
    };

    ws.onmessage = function (evt) {
      var msg;
      try {
        msg = JSON.parse(evt.data);
      } catch (e) {
        return;
      }

      if (msg.type === 'frame') {
        if (!streaming) {
          streaming = true;
          if (loader) loader.classList.add('hidden');
          screen.classList.add('visible');
          showStatus('Streaming', true);
        }
        screen.src = 'data:image/jpeg;base64,' + msg.data;
      }
    };

    ws.onerror = function () {
      setLoaderText('Connection error');
    };

    ws.onclose = function () {
      streaming = false;
      screen.classList.remove('visible');
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

  connect();
})();

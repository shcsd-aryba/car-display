'use strict';

(function () {
  var screenEl = document.getElementById('screen');
  var loader = document.getElementById('loader');
  var loaderStatus = document.getElementById('loader-status');
  var statusOverlay = document.getElementById('status-overlay');
  var statusText = document.getElementById('status-text');
  var errorOverlay = document.getElementById('error-overlay');
  var errorMsg = document.getElementById('error-msg');
  var retryBtn = document.getElementById('retry-btn');
  var fsPrompt = document.getElementById('fs-prompt');
  var fsBtn = document.getElementById('fs-btn');
  var app = document.getElementById('app');

  var ws = null;
  var reconnectTimer = null;
  var reconnectDelay = 1000;
  var streaming = false;

  // Stream dimensions received from host — used to calculate actual
  // content rect inside the letterboxed/pillarboxed <img> element.
  var streamW = 0;
  var streamH = 0;

  var WS_URL = 'ws://' + window.location.host;

  // ── Helpers ─────────────────────────────────────────────────────────────────

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
    var el = document.createElement('div');
    el.className = 'ripple';
    el.style.left = clientX + 'px';
    el.style.top = clientY + 'px';
    app.appendChild(el);
    el.addEventListener('animationend', function () { el.remove(); });
  }

  // ── Content-rect calculation ─────────────────────────────────────────────────
  // The <img> fills the viewport but the actual stream is letterboxed/pillarboxed
  // inside it via object-fit:contain. We need the rect of the content itself so
  // that touches in the black-bar areas are ignored and coordinates are correct.

  function getContentRect() {
    var elRect = screenEl.getBoundingClientRect();
    if (!streamW || !streamH) return elRect; // fallback before config arrives

    var elAspect = elRect.width / elRect.height;
    var streamAspect = streamW / streamH;
    var cw, ch, cx, cy;

    if (elAspect > streamAspect) {
      // Pillarbox: black bars on left and right
      ch = elRect.height;
      cw = ch * streamAspect;
      cx = elRect.left + (elRect.width - cw) / 2;
      cy = elRect.top;
    } else {
      // Letterbox: black bars on top and bottom
      cw = elRect.width;
      ch = cw / streamAspect;
      cx = elRect.left;
      cy = elRect.top + (elRect.height - ch) / 2;
    }

    return { left: cx, top: cy, width: cw, height: ch };
  }

  function insideContent(clientX, clientY) {
    var r = getContentRect();
    return clientX >= r.left && clientX <= r.left + r.width &&
           clientY >= r.top  && clientY <= r.top  + r.height;
  }

  function normCoords(clientX, clientY) {
    var r = getContentRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (clientY - r.top)  / r.height))
    };
  }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  // ── Fullscreen ───────────────────────────────────────────────────────────────

  function requestFs() {
    var el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(function () {});
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen(); // Safari desktop
    }
    // iOS Safari does not support the Fullscreen API at all; the prompt
    // disappears on tap which is the best we can do there.
    if (fsPrompt) fsPrompt.classList.remove('visible');
  }

  if (fsBtn) {
    fsBtn.addEventListener('click', requestFs);
    fsBtn.addEventListener('touchend', function (e) {
      e.preventDefault();
      requestFs();
    }, { passive: false });
  }

  // ── Input event handlers ─────────────────────────────────────────────────────

  var lastTouchX = 0;
  var lastTouchY = 0;

  screenEl.addEventListener('touchstart', function (e) {
    e.preventDefault();
    // Use the first touch to trigger fullscreen if not already in it
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      requestFs();
    }
    var t = e.touches[0];
    if (!insideContent(t.clientX, t.clientY)) return;
    lastTouchX = t.clientX;
    lastTouchY = t.clientY;
    var c = normCoords(t.clientX, t.clientY);
    spawnRipple(t.clientX, t.clientY);
    send({ type: 'input', event: 'mousedown', button: 0, x: c.x, y: c.y });
  }, { passive: false });

  screenEl.addEventListener('touchmove', function (e) {
    e.preventDefault();
    var t = e.touches[0];
    if (!insideContent(t.clientX, t.clientY)) return;
    lastTouchX = t.clientX;
    lastTouchY = t.clientY;
    var c = normCoords(t.clientX, t.clientY);
    send({ type: 'input', event: 'mousemove', x: c.x, y: c.y });
  }, { passive: false });

  screenEl.addEventListener('touchend', function (e) {
    e.preventDefault();
    var c = normCoords(lastTouchX, lastTouchY);
    send({ type: 'input', event: 'mouseup', button: 0, x: c.x, y: c.y });
  }, { passive: false });

  var lastPinchDist = 0;
  screenEl.addEventListener('touchmove', function (e) {
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

  screenEl.addEventListener('touchend', function () {
    lastPinchDist = 0;
  });

  screenEl.addEventListener('mousemove', function (e) {
    if (!insideContent(e.clientX, e.clientY)) return;
    var c = normCoords(e.clientX, e.clientY);
    send({ type: 'input', event: 'mousemove', x: c.x, y: c.y });
  });

  screenEl.addEventListener('mousedown', function (e) {
    if (!insideContent(e.clientX, e.clientY)) return;
    var c = normCoords(e.clientX, e.clientY);
    send({ type: 'input', event: 'mousedown', button: e.button, x: c.x, y: c.y });
  });

  screenEl.addEventListener('mouseup', function (e) {
    if (!insideContent(e.clientX, e.clientY)) return;
    var c = normCoords(e.clientX, e.clientY);
    send({ type: 'input', event: 'mouseup', button: e.button, x: c.x, y: c.y });
  });

  screenEl.addEventListener('wheel', function (e) {
    e.preventDefault();
    send({ type: 'input', event: 'scroll', deltaX: e.deltaX, deltaY: e.deltaY });
  }, { passive: false });

  screenEl.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });

  // ── WebSocket + MJPEG ────────────────────────────────────────────────────────

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

      if (msg.type === 'config') {
        // Store stream dimensions so getContentRect() can compute the real image area
        streamW = msg.screenWidth || 0;
        streamH = msg.screenHeight || 0;
      } else if (msg.type === 'frame') {
        if (!streaming) {
          streaming = true;
          if (loader) loader.classList.add('hidden');
          screenEl.classList.add('visible');
          showStatus('Streaming', true);
          // Offer fullscreen (requires a prior user gesture on iOS, so we show the button)
          if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            if (fsPrompt) fsPrompt.classList.add('visible');
          }
        }
        screenEl.src = 'data:image/jpeg;base64,' + msg.data;
      }
    };

    ws.onerror = function () {
      setLoaderText('Connection error');
    };

    ws.onclose = function () {
      streaming = false;
      streamW = 0;
      streamH = 0;
      screenEl.classList.remove('visible');
      if (fsPrompt) fsPrompt.classList.remove('visible');
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

// On-screen controls for touch screens (added for thegrandpricks.com/games/duke3d/; not part
// of eduke32-wasm). Modeled on gltron-web's: shown automatically on touch screens, hidden as
// soon as a real key is pressed, ?touch=1 / ?touch=0 in the URL forces them on or off.
//
// Buttons press keys: they send the same keyboard events a keyboard would (SDL takes them
// from the document), using EDuke32's default bindings. The right half of the screen is a
// look-pad: finger movement goes to Module._Web_Look (patches/0003), which feeds the engine's
// mouse accumulator, so it turns and aims like a mouse. In menus there is a d-pad with OK and
// Back instead, and taps on the game pass through to it.
(function () {
  'use strict';

  var el = document.getElementById('touch');
  var loader = document.getElementById('loader');
  if (!el) return;

  // key code -> what a keyboard sends (keyCode is what Emscripten's SDL maps from)
  var KEYS = {
    KeyW: ['w', 87], KeyA: ['a', 65], KeyS: ['s', 83], KeyD: ['d', 68], KeyE: ['e', 69], KeyQ: ['q', 81],
    Space: [' ', 32], Enter: ['Enter', 13], Escape: ['Escape', 27], Tab: ['Tab', 9], Quote: ["'", 222],
    ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39],
    ShiftLeft: ['Shift', 16, 1], ControlLeft: ['Control', 17, 1], ControlRight: ['Control', 17, 2],
  };
  var LOOK_X = 4.5, LOOK_Y = 3;   // engine mouse units per CSS pixel of finger movement (~10 units = 1 degree)
  var MIN_HOLD = 80;              // ms; the engine samples keys once a frame and misses shorter taps
  var STICK = 56;                 // px from the stick's center to its edge

  var down = {};                  // code -> number of controls holding it
  var downAt = {};                // code -> time of its keydown
  function key(code, press) {
    var k = KEYS[code];
    if (!k) return;
    var n = (down[code] || 0) + (press ? 1 : -1);
    down[code] = Math.max(0, n);
    if (press ? n !== 1 : n !== 0) return;   // already held by another control / still held
    var fire = function () {
      if (!press && down[code]) return;        // pressed again while the release waited
      var e = new KeyboardEvent(press ? 'keydown' : 'keyup',
        { code: code, key: k[0], location: k[2] || 0, bubbles: true, cancelable: true });
      Object.defineProperty(e, 'keyCode', { get: function () { return k[1]; } });
      Object.defineProperty(e, 'which', { get: function () { return k[1]; } });
      document.dispatchEvent(e);
    };
    if (press) { downAt[code] = Date.now(); fire(); }
    else setTimeout(fire, Math.max(0, MIN_HOLD - (Date.now() - (downAt[code] || 0))));
  }

  var look = { x: 0, y: 0 };
  function lookBy(dx, dy) {
    if (!window.Module || !Module._Web_Look) return;
    look.x += dx * LOOK_X;
    look.y += dy * LOOK_Y;
    var ix = look.x | 0, iy = look.y | 0;   // keep the fractions for the next move
    look.x -= ix; look.y -= iy;
    if (ix || iy) Module._Web_Look(ix, iy);
  }

  // ---- showing and hiding ----
  var param = new URLSearchParams(location.search).get('touch');
  var mode = param === '1' ? true : param === '0' ? false : 'auto';
  var wanted = mode === true || (mode === 'auto' && window.matchMedia && matchMedia('(pointer: coarse)').matches);
  if (mode === 'auto') {
    // follow what the player actually uses, e.g. on a 2-in-1 laptop
    window.addEventListener('pointerdown', function (e) { if (e.pointerType === 'touch') { wanted = true; update(); } }, true);
    window.addEventListener('keydown', function (e) { if (e.isTrusted) { wanted = false; update(); } }, true);
  }
  document.body.classList.toggle('touch', wanted);

  // game: playing (MODE_GAME without the menu, the end-of-level screen or typing); menu: the rest
  var view = '';
  function currentView() {
    var m = window.__e32menu;
    return m && (m.gm & 4) && !(m.gm & (1 | 8 | 16)) && !m.open ? 'game' : 'menu';
  }
  function engineUp() {
    // after Quit the loader comes back (with a Play again button): no controls then
    return !!window.started && loader && (loader.style.display === 'none' || loader.classList.contains('hidden'))
      && !document.getElementById('again');
  }
  // No pointer lock while touch controls are up: SDL asks for it when play starts and
  // Emscripten carries the request out during the next tap; where a phone grants it, the
  // browser then freezes touch pointer positions, and the stick and look-pad stop working.
  // The engine still counts the mouse as grabbed (SDL took the request as done), which is
  // what lets the look-pad's Module._Web_Look through.
  var canvas = document.getElementById('canvas');
  var lockBlocked = false;
  function blockLock(block) {
    if (block === lockBlocked || !canvas) return;
    lockBlocked = block;
    if (block) {
      canvas.requestPointerLock = function () { return Promise.resolve(); };
      if (document.pointerLockElement) document.exitPointerLock();
    } else {
      delete canvas.requestPointerLock;   // back to the real one
    }
  }

  function update() {
    var on = wanted && engineUp();
    document.body.classList.toggle('touch', wanted);
    blockLock(wanted);
    if (el.hidden === on) el.hidden = !on;
    var s = currentView();
    if (s === view) return;
    view = s;
    releaseAll();
    el.dataset.screen = s;
    el.querySelectorAll('[data-on]').forEach(function (node) {
      node.hidden = node.dataset.on.split(' ').indexOf(s) < 0;
    });
  }
  setInterval(update, 100);

  // ---- pointers ----
  var held = {};   // pointerId -> { node, kind, codes, x, y, timer }
  var stickEl = el.querySelector('.stick'), knobEl = el.querySelector('.knob');

  function setStick(h, x, y) {
    var dx = x - h.ox, dy = y - h.oy, len = Math.sqrt(dx * dx + dy * dy);
    var r = Math.min(len, STICK), ux = len ? dx / len : 0, uy = len ? dy / len : 0;
    knobEl.style.transform = 'translate(' + (ux * r) + 'px,' + (uy * r) + 'px)';
    var f = len / STICK, want = {};
    if (f > 0.3) {
      if (uy < -0.38) want.KeyW = 1;
      if (uy > 0.38) want.KeyS = 1;
      if (ux < -0.38) want.KeyA = 1;
      if (ux > 0.38) want.KeyD = 1;
      if (f > 0.95) want.ShiftLeft = 1;      // pushed to the edge: run
    }
    ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft'].forEach(function (c) {
      if (!!want[c] !== !!h.codes[c]) { key(c, !!want[c]); if (want[c]) h.codes[c] = 1; else delete h.codes[c]; }
    });
  }

  function release(id) {
    var h = held[id];
    if (!h) return;
    delete held[id];
    clearTimeout(h.timer);
    if (h.node) h.node.classList.remove('held');
    Object.keys(h.codes).forEach(function (c) { key(c, false); });
    if (h.kind === 'move') {   // back to the idle spot
      stickEl.classList.remove('active');
      stickEl.style.left = stickEl.style.top = knobEl.style.transform = '';
    }
  }
  function releaseAll() { Object.keys(held).forEach(release); }

  // held d-pad arrows repeat, like a held key in a menu
  function repeat(id, code, delay) {
    var h = held[id];
    if (!h) return;
    h.timer = setTimeout(function () {
      if (!held[id]) return;
      key(code, false);
      setTimeout(function () { if (held[id]) { key(code, true); repeat(id, code, 120); } }, MIN_HOLD + 20);
    }, delay);
  }

  el.addEventListener('pointerdown', function (e) {
    var node = e.target.closest('[data-key], .pad');
    if (!node) return;
    e.preventDefault();
    release(e.pointerId);
    try { node.setPointerCapture(e.pointerId); } catch (err) { /* not a live pointer */ }
    var h = held[e.pointerId] = { node: node, kind: 'key', codes: {}, x: e.clientX, y: e.clientY, timer: 0 };
    if (node.classList.contains('move')) {
      h.kind = 'move';
      h.ox = e.clientX; h.oy = e.clientY;
      stickEl.style.left = e.clientX + 'px';
      stickEl.style.top = e.clientY + 'px';
      stickEl.classList.add('active');
      return;
    }
    if (node.classList.contains('look')) { h.kind = 'look'; return; }
    node.classList.add('held');
    var code = node.dataset.key;
    h.codes[code] = 1;
    key(code, true);
    if (node.hasAttribute('data-repeat')) repeat(e.pointerId, code, 400);
    if (node.hasAttribute('data-aim')) h.kind = 'aim';   // FIRE: dragging on it aims too
  });
  el.addEventListener('pointermove', function (e) {
    var h = held[e.pointerId];
    if (!h) return;
    if (h.kind === 'move') setStick(h, e.clientX, e.clientY);
    else if (h.kind === 'look' || h.kind === 'aim') lookBy(e.clientX - h.x, e.clientY - h.y);
    h.x = e.clientX; h.y = e.clientY;
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (type) {
    el.addEventListener(type, function (e) { release(e.pointerId); });
  });
  el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('visibilitychange', releaseAll);

  // sideways is the better view; Android allows locking it only in fullscreen
  document.addEventListener('fullscreenchange', function () {
    var o = window.screen.orientation;
    if (document.fullscreenElement && wanted && o && o.lock) o.lock('landscape').catch(function () {});
  });

  update();
})();

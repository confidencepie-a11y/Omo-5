'use strict';
const $ = (id) => document.getElementById(id);
const splash = $('splash'), auth = $('auth'), wallet = $('wallet'), pinScr = $('pin');
const KEY = 'penny_user', PKEY = 'penny_pin';
const root = document.documentElement;
const themeMeta = document.querySelector('meta[name="theme-color"]');

/* ---------- Telegram Mini App integration ---------- */
const tg = (window.Telegram && window.Telegram.WebApp) || null;
// Keeps the page, overscroll area and Telegram's own header/bottom bar the same colour (no grey strip)
const setTheme = (c) => {
  if (themeMeta) themeMeta.setAttribute('content', c);
  root.style.background = c; document.body.style.background = c;
  if (tg) {
    try { tg.setBackgroundColor(c); } catch (e) {}
    try { tg.setHeaderColor(c); } catch (e) {}
    try { tg.setBottomBarColor(c); } catch (e) {}
  }
};
// Push the app's content below Telegram's Close / menu buttons (fullscreen) and above the home bar
function applyInsets() {
  if (!tg) return;
  const s = tg.safeAreaInset || {}, c = tg.contentSafeAreaInset || {};
  const top = (s.top || 0) + (c.top || 0), bot = s.bottom || 0;
  if (top > 0) root.style.setProperty('--top-inset', top + 'px'); else root.style.removeProperty('--top-inset');
  if (bot > 0) root.style.setProperty('--bot-inset', bot + 'px'); else root.style.removeProperty('--bot-inset');
}
if (tg) {
  try { tg.ready(); } catch (e) {}
  try { tg.expand(); } catch (e) {}
  try { tg.disableVerticalSwipes(); } catch (e) {}              // no pull-down-to-close / elastic ash background
  applyInsets();
  ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'viewportChanged'].forEach((ev) => {
    try { tg.onEvent(ev, applyInsets); } catch (e) {}
  });
}
setTheme('#BFFF00');

const store = {
  get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
  set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} },
  del() { try { localStorage.removeItem(KEY); } catch (e) {} }
};

/* ---------- Motion preference ---------- */
const reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const reduced = () => !!reduceMQ.matches;
function onReduceChange(fn) {
  if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', fn);
  else if (reduceMQ.addListener) reduceMQ.addListener(fn);
}

/* =====================================================================
   Wallet balance count-up
   - Reads the balance already in the markup, so formatting/currency stay as is.
   - Counts 0 -> balance the first time the wallet becomes visible.
   - Never replays on tab switches. Replays only after a logout/login.
   - If the balance text is changed by other code, it eases to the new value.
   ===================================================================== */
const balance = (() => {
  const el = $('balance');
  if (!el) return { reveal() {}, reset() {}, set() {} };

  let finalText = el.textContent.trim();
  let played = false, raf = 0, timer = 0, shown = 0, lastWritten = el.textContent, fmt = null;

  // Work out prefix / suffix / separators / decimals from the existing text.
  function parse(text) {
    const m = text.match(/^(\D*?)(\d[\d.,\s\u00a0\u202f]*)(\D*)$/);
    if (!m) return null;
    const num = m[2].replace(/[\s\u00a0\u202f]+$/, '');
    const lastDot = num.lastIndexOf('.'), lastCom = num.lastIndexOf(',');
    let dec = '', grp = '';
    if (lastDot > -1 && lastCom > -1) { dec = lastDot > lastCom ? '.' : ','; grp = dec === '.' ? ',' : '.'; }
    else if (lastDot > -1) { if ((num.match(/\./g) || []).length > 1) grp = '.'; else dec = '.'; }
    else if (lastCom > -1) {
      const after = num.length - lastCom - 1;
      if ((num.match(/,/g) || []).length > 1 || after === 3) grp = ','; else dec = ',';
    }
    if (/[\s\u00a0\u202f]/.test(num)) grp = grp || ' ';
    let decimals = 0, value;
    if (dec) {
      decimals = num.length - num.lastIndexOf(dec) - 1;
      const i = num.lastIndexOf(dec);
      value = parseFloat(num.slice(0, i).replace(/\D/g, '') + '.' + num.slice(i + 1).replace(/\D/g, ''));
    } else value = parseFloat(num.replace(/\D/g, ''));
    if (!isFinite(value) || value > 1e15) return null;
    return { prefix: m[1], suffix: m[3], dec, grp, decimals, value };
  }

  function format(v) {
    let [i, f] = Math.max(0, v).toFixed(fmt.decimals).split('.');
    if (fmt.grp) i = i.replace(/\B(?=(\d{3})+(?!\d))/g, fmt.grp);
    return fmt.prefix + i + (fmt.decimals ? fmt.dec + f : '') + fmt.suffix;
  }

  function write(text) {
    if (text === lastWritten) return;
    lastWritten = text;
    el.textContent = text;
  }

  function run(from, to, duration) {
    cancelAnimationFrame(raf);
    if (reduced() || document.hidden || from === to) { shown = to; write(finalText); return; }
    const t0 = performance.now();
    const ease = (p) => 1 - Math.pow(1 - p, 3);              // gentle ease-out, no slot-machine spin
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      shown = from + (to - from) * ease(p);
      if (p < 1) { write(format(shown)); raf = requestAnimationFrame(step); }
      else { shown = to; write(finalText); }                  // always land on the exact original text
    };
    raf = requestAnimationFrame(step);
  }

  const durationFor = (v) => Math.min(1900, 1250 + 160 * Math.max(0, Math.log10(Math.max(v, 1))));

  // Balance changed by other code -> ease from what is on screen to the new value.
  new MutationObserver(() => {
    const now = el.textContent;
    if (now === lastWritten) return;
    lastWritten = now;
    finalText = now.trim();
    const next = parse(finalText);
    if (!next) { cancelAnimationFrame(raf); return; }
    fmt = next;
    if (!played) return;
    run(shown, next.value, 700);
  }).observe(el, { childList: true, characterData: true, subtree: true });

  el.setAttribute('aria-label', finalText);

  return {
    reveal(delay) {
      if (played) return;                                      // do not restart on tab switches
      played = true;
      fmt = parse(finalText);
      if (!fmt || reduced()) { shown = fmt ? fmt.value : 0; return; }
      shown = 0;
      write(format(0));
      clearTimeout(timer);
      timer = setTimeout(() => run(0, fmt.value, durationFor(fmt.value)), delay || 0);
    },
    reset() {                                                  // called on log out
      played = false; clearTimeout(timer); cancelAnimationFrame(raf);
      write(finalText);
    },
    // window.PennyBalance.set(1234.5) or .set('1,234.50') changes the balance with a short count
    set(v) {
      if (typeof v === 'number' && fmt) { fmt.value = v; v = format(v); }
      el.textContent = String(v);
    }
  };
})();
window.PennyBalance = balance;

/* =====================================================================
   Globe + paper airplane
   Layers (bottom to top): back orbit/plane (SVG) -> globe (drifting
   texture inside a circular clip) -> note + lock -> front orbit/plane (SVG).
   The plane is moved along an ellipse with requestAnimationFrame; it passes
   behind the globe on the far half of the orbit and in front on the near half.
   ===================================================================== */
const Orb = (() => {
  const orb = $('orb');
  if (!orb) return { start() {}, stop() {}, activate() {}, deactivate() {} };

  const E = { cx: 444.54, cy: 260.09, a: 307.40, b: 100.60, th: -28.51 * Math.PI / 180 };
  const cosT = Math.cos(E.th), sinT = Math.sin(E.th);
  const TAU = Math.PI * 2, PERIOD = 11000, U0 = 0.28, PLANE_A0 = 145;
  const N = 34, LEN = 240, HW = 3.4;

  const q = (id) => $(id);
  const ringB = q('ringB'), ringF = q('ringF'), trailB = q('trailB'), trailF = q('trailF'),
        planeB = q('planeB'), planeF = q('planeF'), tgB = q('tgB'), tgF = q('tgF');

  function pt(u) {
    const c = Math.cos(u), s = Math.sin(u);
    const lx = -E.a * c, ly = E.b * s, dx = E.a * s, dy = E.b * c;
    return { x: E.cx + lx * cosT - ly * sinT, y: E.cy + lx * sinT + ly * cosT,
             tx: dx * cosT - dy * sinT, ty: dx * sinT + dy * cosT };
  }
  function ringPath(u0, u1, n) {
    let d = '';
    for (let i = 0; i <= n; i++) {
      const p = pt(u0 + (u1 - u0) * i / n);
      d += (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
    }
    return d;
  }
  // Static thin orbit line: far half dimmer, near half a little brighter
  ringF.setAttribute('d', ringPath(0, Math.PI, 64));
  ringB.setAttribute('d', ringPath(Math.PI, TAU, 64));
  ringF.setAttribute('stroke-width', '1.6'); ringF.setAttribute('stroke-opacity', '.5');
  ringB.setAttribute('stroke-width', '1.3'); ringB.setAttribute('stroke-opacity', '.32');

  function buildTrail(u, sc) {
    let uu = u, dist = 0;
    const start = 84 * sc;                                     // begin at the plane's tail
    while (dist < start) { const p = pt(uu); uu -= 6 / Math.hypot(p.tx, p.ty); dist += 6; }
    const ds = LEN / (N - 1), P = [];
    for (let i = 0; i < N; i++) {
      const p = pt(uu), sp = Math.hypot(p.tx, p.ty), s = Math.sin(uu);
      const w = HW * Math.pow(1 - i / (N - 1), 1.2) * (0.85 + 0.25 * s) * sc;
      const nx = -p.ty / sp, ny = p.tx / sp;
      P.push({ x: p.x, y: p.y, lx: p.x + nx * w, ly: p.y + ny * w, rx: p.x - nx * w, ry: p.y - ny * w, front: s > 0 });
      uu -= ds / sp;
    }
    return P;
  }
  function polyD(P, front) {
    let d = '', run = [];
    const f1 = (n) => n.toFixed(1);
    const flush = () => {
      if (run.length > 1) {
        let s = 'M' + f1(run[0].lx) + ' ' + f1(run[0].ly);
        for (let k = 1; k < run.length; k++) s += 'L' + f1(run[k].lx) + ' ' + f1(run[k].ly);
        for (let k = run.length - 1; k >= 0; k--) s += 'L' + f1(run[k].rx) + ' ' + f1(run[k].ry);
        d += s + 'Z';
      }
      run = [];
    };
    for (const p of P) { if (p.front === front) run.push(p); else flush(); }
    flush();
    return d;
  }

  let live = false, running = false, raf = 0, T0 = 0, wasFront = null;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!T0) T0 = now;
    const t = now - T0;
    const u = (U0 + t / PERIOD * TAU) % TAU;
    const p = pt(u), s = Math.sin(u), front = s > 0;
    const sc = 0.92 + 0.15 * s;                                // nearer = a touch larger
    const ry = 1 - 0.08 * Math.sin(2 * u);                     // slight banking
    const heading = Math.atan2(p.ty, p.tx) * 180 / Math.PI;
    const tf = 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ') rotate(' + (heading - PLANE_A0).toFixed(1) +
               ') scale(' + sc.toFixed(3) + ' ' + (sc * ry).toFixed(3) + ')';
    const op = Math.min(1, t / 700);
    const act = front ? planeF : planeB, off = front ? planeB : planeF;
    if (wasFront !== front) { act.setAttribute('visibility', 'visible'); off.setAttribute('visibility', 'hidden'); wasFront = front; }
    act.setAttribute('transform', tf);
    act.setAttribute('opacity', (op * (front ? 1 : 0.85)).toFixed(2));

    const P = buildTrail(u, sc);
    trailF.setAttribute('d', polyD(P, true));
    trailB.setAttribute('d', polyD(P, false));
    const a = P[0], z = P[P.length - 1];
    [tgB, tgF].forEach((g) => {
      g.setAttribute('x1', a.x.toFixed(1)); g.setAttribute('y1', a.y.toFixed(1));
      g.setAttribute('x2', z.x.toFixed(1)); g.setAttribute('y2', z.y.toFixed(1));
    });
    trailF.setAttribute('opacity', op.toFixed(2)); trailB.setAttribute('opacity', op.toFixed(2));
  }

  function start() {
    if (!live || running) return;
    running = true; T0 = 0; wasFront = null;
    raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  // Preload the layers first, then swap them in for the static globe.jpg
  let loading = false;
  function activate() {
    if (reduced() || live || loading) return;
    loading = true;
    const srcs = ['globe-sphere.png', 'globe-props.png', 'penny-plane.png'];
    Promise.all(srcs.map((src) => new Promise((ok, fail) => {
      const im = new Image(); im.onload = ok; im.onerror = fail; im.src = src;
    }))).then(() => {
      loading = false;
      if (reduced()) return;
      live = true;
      orb.classList.add('live');
      if (!auth.hidden) start();
    }).catch(() => { loading = false; });                      // any asset missing: keep the original globe.jpg
  }
  function deactivate() { stop(); live = false; orb.classList.remove('live'); }

  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (!auth.hidden) start(); });
  onReduceChange(() => { if (reduced()) deactivate(); else { activate(); } });

  return { start, stop, activate, deactivate };
})();
Orb.activate();                                                // loads during the splash

/* ---------- Screens ---------- */
const tgUser = () => (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) || null;
const identity = () => { const u = tgUser(); return u ? (u.username || u.first_name || 'guest') : 'guest'; };
const nameFor = (stored) => {
  if (stored) return '@' + String(stored).replace(/^@/, '');
  const u = tgUser();
  if (u) return u.username ? '@' + u.username : (u.first_name || 'Guest');
  return 'Guest';
};
function showWallet(user, opts) {
  $('uname').textContent = nameFor(user);
  Orb.stop();
  balance.reveal((opts && opts.delay) || 0);                   // set to 0.00 before the wallet is shown
  setTheme('#000000');
  auth.hidden = true; pinScr.hidden = true; wallet.hidden = false;
  window.scrollTo(0, 0);
}
function showAuth() {
  setTheme('#000400');
  wallet.hidden = true; pinScr.hidden = true; auth.hidden = false;
  resetButtons(); Orb.start();
}

/* ---------- Passcode ----------
   Only a hash of the passcode is kept on the device. This is front-end only:
   real protection needs server-side verification (or Telegram SecureStorage). */
const pinStore = {
  get() { try { return localStorage.getItem(PKEY); } catch (e) { return null; } },
  set(v) { try { localStorage.setItem(PKEY, v); } catch (e) {} }
};
async function hashPin(p) {
  try {
    if (window.crypto && crypto.subtle) {
      const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('penny.v1:' + p));
      return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {}
  return 'x:' + btoa('penny.v1:' + p);
}
const haptic = (kind) => {
  try {
    if (tg && tg.HapticFeedback) { if (kind === 'err') tg.HapticFeedback.notificationOccurred('error'); else tg.HapticFeedback.impactOccurred('light'); }
    else if (navigator.vibrate) navigator.vibrate(kind === 'err' ? [30, 40, 30] : 8);
  } catch (e) {}
};

const pinDotsEl = $('pinDots'), pinDots = Array.from(pinDotsEl.children),
      pinTitle = $('pinTitle'), pinSub = $('pinSub'), pinMsg = $('pinMsg'), pinBack = $('pinBack'),
      pinSteps = $('pinSteps'), steps = Array.from(pinSteps.children);
const TITLES = { create: 'Create your passcode', confirm: 'Confirm your passcode', verify: 'Welcome back' };
const SUBS = { create: 'Pick 4 digits you will remember.', confirm: 'Enter the same 4 digits once more.', verify: 'Enter your passcode to open your wallet.' };
const STEP = { create: 0, confirm: 1 };
let P = { mode: 'create', buf: '', first: '', back: true, busy: false }, fails = 0, lockUntil = 0, pendingUser = '';

function pinRender() { pinDots.forEach((d, i) => d.classList.toggle('on', i < P.buf.length)); }
function setPinUI() {
  pinTitle.textContent = TITLES[P.mode];
  pinSub.textContent = SUBS[P.mode];
  pinMsg.textContent = '';
  pinSteps.style.display = P.mode === 'verify' ? 'none' : 'flex';
  steps.forEach((el, i) => el.classList.toggle('on', i <= (STEP[P.mode] || 0)));
  pinBack.style.visibility = P.back ? 'visible' : 'hidden';
  pinRender();
}
function openPin(mode, opts) {
  P = { mode: mode, buf: '', first: '', back: !(opts && opts.noBack), busy: false };
  setPinUI();
  setTheme('#000400');
  Orb.stop();
  auth.hidden = true; wallet.hidden = true; pinScr.hidden = false;
}
function pinWrong(msg, after) {
  P.busy = true;
  pinDotsEl.classList.remove('shake'); void pinDotsEl.offsetWidth; pinDotsEl.classList.add('shake');
  haptic('err');
  setTimeout(() => {
    P.buf = '';
    if (after) after(); else pinRender();
    pinMsg.textContent = msg;
    P.busy = false;
  }, 380);
}
async function pinDone() {
  const code = P.buf;
  if (P.mode === 'create') { P.first = code; P.mode = 'confirm'; P.buf = ''; P.busy = false; setPinUI(); return; }
  if (P.mode === 'confirm') {
    if (code === P.first) {
      pinStore.set(await hashPin(code));
      const id = pendingUser || identity(); store.set(id);
      showWallet(id, { delay: reduced() ? 0 : 150 });
    } else {
      pinWrong('Passcodes didn\u2019t match. Try again.', () => { P.mode = 'create'; P.first = ''; P.buf = ''; setPinUI(); });
    }
    return;
  }
  const ok = (await hashPin(code)) === pinStore.get();
  if (ok) {
    fails = 0;
    const id = pendingUser || store.get() || identity(); store.set(id);
    showWallet(id, { delay: reduced() ? 0 : 150 });
  } else {
    fails++;
    if (fails >= 5) { fails = 0; lockUntil = Date.now() + 30000; pinWrong('Too many attempts. Try again in 30 seconds.'); }
    else pinWrong('Incorrect passcode');
  }
}
function pinKey(k) {
  if (P.busy) return;
  if (Date.now() < lockUntil) { pinMsg.textContent = 'Too many attempts. Try again shortly.'; return; }
  if (k === 'del') { P.buf = P.buf.slice(0, -1); pinMsg.textContent = ''; pinRender(); return; }
  if (P.buf.length >= 4) return;
  P.buf += k; pinRender(); haptic();
  if (P.buf.length === 4) { P.busy = true; setTimeout(pinDone, 180); }
}
$('pinKeys').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) pinKey(b.dataset.k);
});
document.addEventListener('keydown', (e) => {
  if (pinScr.hidden) return;
  if (/^[0-9]$/.test(e.key)) pinKey(e.key); else if (e.key === 'Backspace') pinKey('del');
});
pinBack.addEventListener('click', () => {
  if (P.busy || !P.back) return;
  if (P.mode === 'confirm') { P.mode = 'create'; P.first = ''; P.buf = ''; setPinUI(); }
  else showAuth();
});

/* ---------- Splash ----------
   Logo pops in, then the splash dissolves while the destination is already underneath it.
   Returning users (name + passcode saved) land on the passcode lock, not straight in the wallet. */
const SPLASH_VISIBLE = reduced() ? 1100 : 3300;               // ms before the exit begins
const SPLASH_EXIT = reduced() ? 250 : 650;                     // keep in sync with the CSS transition
setTimeout(() => {
  const user = store.get();
  if (user && pinStore.get()) openPin('verify', { noBack: true });
  else if (user) openPin('create');                            // saved by an older version: set a passcode now
  else showAuth();
  splash.classList.add('out');
  setTimeout(() => { splash.hidden = true; }, SPLASH_EXIT + 60);
}, SPLASH_VISIBLE);

/* ---------- Create account / Log in: button spinner (random 1-4 s), then passcode ---------- */
const btnC = $('btnCreate'), btnL = $('btnLogin');
function resetButtons() {
  [btnC, btnL].forEach((b) => { b.disabled = false; b.classList.remove('loading', 'dim'); b.removeAttribute('aria-busy'); });
}
function startAuth(btn, mode) {
  if (btnC.disabled) return;
  [btnC, btnL].forEach((b) => { b.disabled = true; if (b !== btn) b.classList.add('dim'); });
  btn.classList.add('loading'); btn.setAttribute('aria-busy', 'true');
  const ms = Math.round(1000 + Math.random() * 3000);          // anywhere from 1s to 4s, different each time
  setTimeout(() => {
    openPin(mode === 'login' && pinStore.get() ? 'verify' : 'create');
    resetButtons();
  }, ms);
}
/* ---------- Account pop-up (Telegram username + password) ---------- */
const modal = $('modal'), form = $('authForm'), err = $('err');
let pendingBtn = null, pendingMode = 'create';
function openModal(btn, mode) {
  pendingBtn = btn; pendingMode = mode;
  const create = mode === 'create';
  $('mTitle').textContent = create ? 'Create your account' : 'Welcome back';
  $('mSub').textContent = create ? 'Enter your Telegram details to get started.' : 'Log in with your Telegram details.';
  $('tgPass').autocomplete = create ? 'new-password' : 'current-password';
  err.textContent = '';
  modal.hidden = false;
  setTimeout(() => $('tgUser').focus(), 50);
}
btnC.addEventListener('click', () => { if (!btnC.disabled) openModal(btnC, 'create'); });
btnL.addEventListener('click', () => { if (!btnC.disabled) openModal(btnL, 'login'); });
$('closeModal').addEventListener('click', () => { modal.hidden = true; });
modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const user = $('tgUser').value.trim().replace(/^@/, '');
  const pass = $('tgPass').value;
  let msg = '';
  if (!/^[A-Za-z0-9_]{5,32}$/.test(user)) msg = 'Enter a valid Telegram username (5\u201332 letters, numbers or _).';
  else if (pass.length < 6) msg = 'Password must be at least 6 characters.';
  if (msg) {
    err.textContent = msg;
    form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
    return;
  }
  pendingUser = user;               // the password is never stored
  $('tgPass').value = '';
  modal.hidden = true;
  startAuth(pendingBtn, pendingMode);   // spinner on the tapped button, then the passcode page
});

// Tap the name in the wallet to log out
function doLogout() { store.del(); $('tgUser').value = ''; pendingUser = ''; balance.reset(); showAuth(); }
document.querySelector('.name').addEventListener('click', () => {
  if (tg && tg.showConfirm && tg.isVersionAtLeast && tg.isVersionAtLeast('6.2')) {
    try { tg.showConfirm('Log out of Penny?', (ok) => { if (ok) doLogout(); }); return; } catch (e) {}
  }
  if (confirm('Log out of Penny?')) doLogout();
});

// Bottom navigation: highlight the tab that was tapped (does not touch the balance animation)
const tabs = document.querySelectorAll('.nav a');
tabs.forEach((tab) => {
  tab.addEventListener('click', (e) => {
    e.preventDefault();
    tabs.forEach((t) => t.classList.remove('on'));
    tab.classList.add('on');
  });
});

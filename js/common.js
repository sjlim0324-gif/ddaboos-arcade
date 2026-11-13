/* 따부스 오락실 — 공통 유틸 */
(function () {
  const U = {};

  U.$ = (s, el) => (el || document).querySelector(s);
  U.$$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  U.h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.appendChild(typeof kid === 'object' ? kid : document.createTextNode(String(kid)));
    }
    return el;
  };
  U.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.sleep = ms => new Promise(r => setTimeout(r, ms));
  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // 같은 seed면 모든 폰에서 같은 문제가 나오도록
  U.rng = function (seed) {
    let a = seed >>> 0;
    const f = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
    f.pick = arr => arr[Math.floor(f() * arr.length)];
    f.shuffle = arr => { const a2 = arr.slice(); for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; } return a2; };
    return f;
  };

  // 공정한 추첨용 (암호학적 난수)
  U.fairInt = function (n) {
    if (n <= 0) return 0;
    const buf = new Uint32Array(1);
    const lim = Math.floor(4294967296 / n) * n;
    let x;
    do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= lim);
    return x % n;
  };

  U.id = (len = 8) => {
    const cs = 'abcdefghijkmnpqrstuvwxyz23456789';
    let s = ''; for (let i = 0; i < len; i++) s += cs[U.fairInt(cs.length)]; return s;
  };
  U.roomCode = () => {
    const cs = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = ''; for (let i = 0; i < 5; i++) s += cs[U.fairInt(cs.length)]; return s;
  };

  U.store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { } },
  };

  U.toast = function (msg, ms = 2200) {
    const t = U.h('div', { class: 'toast' }, msg);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  };

  U.qrSvg = function (text, cell = 6) {
    const qr = qrcode(0, 'M');
    qr.addData(text); qr.make();
    return qr.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
  };

  // 효과음 (WebAudio 합성, 음원 파일 없음)
  let ac = null;
  U.audioUnlock = () => { try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) { } };
  U.beep = function (freq = 660, dur = 0.12, type = 'sine', vol = 0.18) {
    try {
      U.audioUnlock(); if (!ac) return;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + dur + 0.02);
    } catch (e) { }
  };
  U.sfx = {
    tick: () => U.beep(520, 0.09, 'square', 0.08),
    go: () => U.beep(880, 0.25, 'square', 0.12),
    ok: () => U.beep(990, 0.08, 'sine', 0.15),
    bad: () => U.beep(180, 0.18, 'sawtooth', 0.08),
    pop: () => U.beep(700 + Math.random() * 300, 0.05, 'triangle', 0.1),
    fanfare: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => U.beep(f, 0.22, 'triangle', 0.15), i * 130)); },
    drum: () => U.beep(110 + Math.random() * 40, 0.06, 'triangle', 0.2),
  };

  U.vibrate = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { } };

  // 색종이
  U.confetti = function (ms = 3500) {
    const cv = U.h('canvas', { style: { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 800 } });
    document.body.appendChild(cv);
    const ctx = cv.getContext('2d');
    const W = cv.width = innerWidth, H = cv.height = innerHeight;
    const cols = ['#F2C41E', '#6EC3AD', '#E3197D', '#F7DA8B', '#ffffff'];
    const ps = Array.from({ length: 160 }, () => ({
      x: Math.random() * W, y: -20 - Math.random() * H * 0.6, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4,
      r: 4 + Math.random() * 6, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3, c: cols[Math.floor(Math.random() * cols.length)], round: Math.random() < 0.4,
    }));
    const t0 = performance.now();
    (function loop(t) {
      ctx.clearRect(0, 0, W, H);
      for (const p of ps) {
        p.x += p.vx; p.y += p.vy; p.a += p.va; p.vy += 0.03;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c;
        if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.r * 0.6, 0, 7); ctx.fill(); } else ctx.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8);
        ctx.restore();
      }
      if (t - t0 < ms) requestAnimationFrame(loop); else cv.remove();
    })(t0);
  };

  U.fullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => { });
    else document.exitFullscreen && document.exitFullscreen();
  };

  window.U = U;
})();

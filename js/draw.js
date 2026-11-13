/* 따부스 오락실 — 경품 추첨
 * 당첨자는 먼저 암호학적 난수로 공정하게 뽑고, 연출은 그 결과에 맞춰 멈춥니다.
 */
(function () {
  const { $, h } = U;
  const KEY = 'dba-draw';
  const PAL = ['#6EC3AD', '#F2C41E', '#E3197D', '#F7DA8B', '#3E9C86', '#F5A3C7'];
  const SHOW_MAX = { wheel: 48, slot: 999, spot: 60 };

  let D = U.store.get(KEY, null) || { names: '', prizes: '커피 쿠폰 x3\n치킨 기프티콘 x2\n따부스 스터디 무료 수강권 x1', style: 'wheel', wins: [], absent: [] };
  const save = () => U.store.set(KEY, D);
  let busy = false;

  const elNames = $('#names'), elPrizes = $('#prizes'), elCount = $('#ncount');
  elNames.value = D.names; elPrizes.value = D.prizes;

  function names() {
    const seen = new Set(), out = [];
    D.names.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).forEach(n => { if (!seen.has(n)) { seen.add(n); out.push(n); } });
    return out;
  }
  function prizeQueue() {
    const q = [];
    D.prizes.split('\n').map(s => s.trim()).filter(Boolean).forEach(line => {
      const m = line.match(/^(.*?)\s*[xX×*]\s*(\d+)\s*$/);
      const name = m ? m[1].trim() : line, n = m ? Math.min(999, parseInt(m[2], 10)) : 1;
      for (let i = 0; i < n; i++) q.push({ name, k: i + 1, of: n });
    });
    return q;
  }
  function pool() {
    const won = new Set(D.wins.map(w => w.name)), ab = new Set(D.absent);
    return names().filter(n => !won.has(n) && !ab.has(n));
  }
  function currentPrize() {
    const q = prizeQueue();
    if (!q.length) return { name: '당첨', k: D.wins.length + 1, of: 0, free: true };
    return q[D.wins.length] || null;
  }

  // ---------- 입력 ----------
  elNames.addEventListener('input', () => { D.names = elNames.value; save(); refresh(); });
  elPrizes.addEventListener('input', () => { D.prizes = elPrizes.value; save(); refresh(); });
  $('#fillnum').onclick = () => {
    const n = parseInt(prompt('1번부터 몇 번까지 넣을까요? (최대 999)', '50'), 10);
    if (!n || n < 1) return;
    D.names = Array.from({ length: Math.min(999, n) }, (_, i) => String(i + 1)).join('\n');
    elNames.value = D.names; save(); refresh();
  };
  U.$$('.style-tabs button').forEach(b => b.onclick = () => { if (busy) return; D.style = b.dataset.s; save(); refresh(); });
  $('#drawbtn').onclick = draw;
  $('#redo').onclick = redo;
  $('#copy').onclick = copy;
  $('#reset').onclick = () => { if (!confirm('당첨 기록을 모두 지울까요? (명단·경품은 유지)')) return; D.wins = []; D.absent = []; save(); refresh(); };
  $('#fs').onclick = U.fullscreen;
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'PageDown') { e.preventDefault(); draw(); }
    if (e.key === 'f' || e.key === 'F') U.fullscreen();
  });

  // ---------- 화면 갱신 ----------
  const stage = $('#dstage');
  function refresh() {
    U.$$('.style-tabs button').forEach(b => b.classList.toggle('on', b.dataset.s === D.style));
    const p = pool(), cp = currentPrize();
    elCount.textContent = `${names().length}명 · 남은 후보 ${p.length}명`;
    $('#prize-now').innerHTML = cp ? `<small>이번 경품</small><b>${U.esc(cp.name)}</b>${cp.of ? `<span>${cp.k} / ${cp.of}</span>` : ''}` : '<b>🎉 모든 경품 추첨 끝!</b>';
    $('#drawbtn').disabled = busy || !cp || !p.length;
    $('#redo').disabled = busy || !D.wins.length;
    const list = $('#wins'); list.innerHTML = '';
    D.wins.forEach((w, i) => list.append(h('li', null, h('span', null, i + 1), h('em', null, w.prize), h('b', null, w.name))));
    if (!D.wins.length) list.append(h('li', { class: 'none' }, '아직 당첨자가 없어요'));
    if (!busy) idle();
  }

  function sample(p, winner, max) {
    if (p.length <= max) return p.slice();
    const others = p.filter(n => n !== winner);
    const pick = [];
    for (let i = 0; i < max - 1; i++) pick.push(others.splice(U.fairInt(others.length), 1)[0]);
    pick.splice(U.fairInt(pick.length + 1), 0, winner);
    return pick;
  }

  function idle() {
    stage.innerHTML = '';
    const p = pool();
    if (!p.length) { stage.append(h('div', { class: 'd-empty' }, h('img', { src: 'img/logo-mark.png', alt: '' }), h('p', null, names().length ? '남은 후보가 없어요' : '왼쪽에 참가자 명단을 넣어 주세요'))); return; }
    const show = p.length > SHOW_MAX[D.style] ? sample(p, p[0], SHOW_MAX[D.style]) : p;
    if (D.style === 'wheel') drawWheel(show, null);
    if (D.style === 'slot') buildSlot(p);
    if (D.style === 'spot') buildSpot(show);
  }

  // ---------- 추첨 ----------
  async function draw() {
    if (busy) return;
    const p = pool(), cp = currentPrize();
    if (!cp || !p.length) return;
    U.audioUnlock();
    busy = true; refresh();
    const winner = p[U.fairInt(p.length)];
    const show = sample(p, winner, SHOW_MAX[D.style]);
    if (p.length > SHOW_MAX[D.style]) { await banner(`후보 ${p.length}명 중 본선 진출 ${show.length}명!`, 1400); }
    if (D.style === 'wheel') await spinWheel(show, winner);
    if (D.style === 'slot') await spinSlot(p, winner);
    if (D.style === 'spot') await runSpot(show, winner);
    D.wins.push({ prize: cp.name, name: winner }); save();
    U.sfx.fanfare(); U.confetti(3500);
    await winnerCard(cp.name, winner);
    busy = false; refresh();
  }

  function redo() {
    if (busy || !D.wins.length) return;
    const w = D.wins[D.wins.length - 1];
    if (!confirm(`'${w.name}' 님이 자리에 없나요?\n이 당첨을 취소하고 같은 경품을 다시 뽑을 수 있게 해요. (${w.name} 님은 이후 추첨에서 제외)`)) return;
    D.wins.pop(); D.absent.push(w.name); save(); refresh();
  }

  function copy() {
    const txt = '순번\t경품\t당첨자\n' + D.wins.map((w, i) => `${i + 1}\t${w.prize}\t${w.name}`).join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(
      () => U.toast('복사했어요! 엑셀에 붙여넣기 하세요'),
      () => { const t = h('textarea'); t.value = txt; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); U.toast('복사했어요!'); });
  }

  function banner(text, ms) {
    const b = h('div', { class: 'd-banner' }, text);
    stage.append(b);
    return U.sleep(ms).then(() => b.remove());
  }
  function winnerCard(prize, name) {
    return new Promise(res => {
      const c = h('div', { class: 'd-winner' },
        h('div', { class: 'card' }, h('small', null, prize), h('b', null, name), h('span', null, '축하합니다! 🎉'),
          h('button', { class: 'btn pink', onclick: () => { c.remove(); res(); } }, '확인')));
      stage.append(c);
      const k = e => { if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); document.removeEventListener('keydown', k, true); c.remove(); res(); } };
      setTimeout(() => document.addEventListener('keydown', k, true), 600);
    });
  }

  // ---------- 1) 돌림판 ----------
  let wheelAngle = 0;
  function drawWheel(list, cv) {
    if (!cv) {
      stage.innerHTML = '';
      cv = h('canvas', { class: 'wheel' });
      stage.append(h('div', { class: 'wheel-wrap' }, cv, h('div', { class: 'pointer' }), h('img', { class: 'hub', src: 'img/logo-mark.png', alt: '' })));
    }
    const S = Math.min(stage.clientWidth, stage.clientHeight) - 30;
    const dpr = devicePixelRatio || 1;
    cv.width = cv.height = S * dpr; cv.style.width = cv.style.height = S + 'px';
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const R = S / 2, n = list.length, seg = Math.PI * 2 / n;
    ctx.clearRect(0, 0, S, S);
    ctx.save(); ctx.translate(R, R); ctx.rotate(wheelAngle);
    for (let i = 0; i < n; i++) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R - 4, i * seg, (i + 1) * seg); ctx.closePath();
      ctx.fillStyle = PAL[n % PAL.length === 1 && i === n - 1 ? 1 : i % PAL.length]; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = n > 30 ? 1 : 3; ctx.stroke();
      ctx.save(); ctx.rotate((i + 0.5) * seg); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const fs = Math.max(10, Math.min(30, seg * R * 0.55, R / 7));
      ctx.font = `800 ${fs}px Pretendard Variable, Pretendard, sans-serif`;
      ctx.fillStyle = (i % PAL.length === 2 || i % PAL.length === 4) ? '#fff' : '#3F3F3F';
      let t = list[i]; if (t.length > 8) t = t.slice(0, 7) + '…';
      ctx.fillText(t, R - 18, 0); ctx.restore();
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(R, R, R - 3, 0, 7); ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.stroke();
    return cv;
  }
  function spinWheel(list, winner) {
    return new Promise(res => {
      const cv = drawWheel(list, null);
      const n = list.length, seg = Math.PI * 2 / n, idx = list.indexOf(winner);
      // 포인터는 위쪽(-90°). 당첨 칸 안쪽 무작위 위치에 멈춤
      const inner = (0.2 + Math.random() * 0.6) * seg;
      const target0 = -Math.PI / 2 - (idx * seg + inner);
      const start = wheelAngle;
      let target = target0; while (target < start) target += Math.PI * 2;
      target += Math.PI * 2 * (6 + Math.floor(Math.random() * 2));
      const dur = 6000, t0 = performance.now();
      let lastSeg = null;
      (function step(t) {
        const f = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - f, 4);
        wheelAngle = start + (target - start) * e;
        drawWheel(list, cv);
        const sIdx = Math.floor((((-Math.PI / 2 - wheelAngle) % (Math.PI * 2)) + Math.PI * 4) % (Math.PI * 2) / seg);
        if (sIdx !== lastSeg) { lastSeg = sIdx; U.sfx.tick(); }
        if (f < 1) requestAnimationFrame(step); else { wheelAngle %= Math.PI * 2; setTimeout(res, 500); }
      })(t0);
    });
  }

  // ---------- 2) 슬롯머신 ----------
  function buildSlot(p) {
    stage.innerHTML = '';
    const reel = h('div', { class: 'reel' }, h('div', { class: 'cell' }, p[0] || ''));
    stage.append(h('div', { class: 'slot' }, h('div', { class: 'slot-top' }, h('span', { class: 'dots' }, h('i'), h('i'), h('i')), 'JACKPOT'), h('div', { class: 'slot-win' }, reel), h('div', { class: 'slot-lever' })));
    return reel;
  }
  function spinSlot(p, winner) {
    return new Promise(res => {
      const reel = buildSlot(p);
      const seq = [];
      for (let i = 0; i < 46; i++) seq.push(p[U.fairInt(p.length)]);
      seq.push(winner);
      reel.innerHTML = '';
      seq.forEach(n => reel.append(h('div', { class: 'cell' }, n)));
      const ch = reel.firstChild.offsetHeight;
      const total = (seq.length - 1) * ch;
      const dur = 5000, t0 = performance.now();
      let last = -1;
      (function step(t) {
        const f = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - f, 3.2);
        const y = total * e;
        reel.style.transform = `translateY(${-y}px)`;
        const k = Math.floor(y / ch); if (k !== last) { last = k; U.sfx.tick(); }
        if (f < 1) requestAnimationFrame(step);
        else { reel.lastChild.classList.add('win'); setTimeout(res, 700); }
      })(t0);
    });
  }

  // ---------- 3) 스포트라이트 ----------
  function buildSpot(list) {
    stage.innerHTML = '';
    const grid = h('div', { class: 'spot-grid' + (list.length > 30 ? ' dense' : '') });
    list.forEach((n, i) => grid.append(h('div', { class: 'spot c' + (i % 3) }, n)));
    stage.append(grid);
    return grid;
  }
  function runSpot(list, winner) {
    return new Promise(async res => {
      const grid = buildSpot(list);
      const cells = Array.from(grid.children);
      grid.classList.add('dark');
      const wi = list.indexOf(winner);
      let cur = -1, delay = 60;
      const steps = 34 + U.fairInt(8);
      for (let s = 0; s < steps; s++) {
        let nx;
        if (s === steps - 1) nx = wi;
        else { do { nx = U.fairInt(cells.length); } while (cells.length > 1 && (nx === cur || (s === steps - 2 && nx === wi))); }
        if (cur >= 0) cells[cur].classList.remove('lit');
        cells[nx].classList.add('lit'); cur = nx; U.sfx.tick();
        await U.sleep(delay);
        delay = Math.min(650, delay * 1.09);
      }
      cells[wi].classList.add('win');
      setTimeout(res, 800);
    });
  }

  addEventListener('resize', () => { if (!busy) idle(); });
  refresh();
})();

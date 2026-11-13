/* 따부스 오락실 — 미니게임 8종
 * 각 게임: play(el, ctx) → { stop() }
 *   ctx.rng      같은 판이면 모든 폰에서 같은 난수
 *   ctx.report(v) 진행 상황(큰 화면 중계용)
 *   ctx.done(score, text) 최종 기록 (score는 클수록 잘한 것)
 */
(function () {
  const { h } = U;

  // 상단 타이머 바
  function topBar(el, title, sec) {
    const fill = h('i');
    const label = h('span', { class: 'g-time' }, sec ? sec.toFixed(1) : '');
    const bar = h('div', { class: 'g-top' }, h('b', null, title), label, h('div', { class: 'g-bar' }, fill));
    el.appendChild(bar);
    return {
      set(left) {
        label.textContent = Math.max(0, left).toFixed(1) + '초';
        fill.style.width = (U.clamp(left / sec, 0, 1) * 100) + '%';
        if (left < 3) fill.style.background = 'var(--pink)';
      },
      text(t) { label.textContent = t; },
    };
  }

  // 정해진 시간 동안 도는 게임 공통 틀
  function timed(el, ctx, title, sec, onEnd) {
    const top = topBar(el, title, sec);
    const t0 = performance.now();
    let ended = false, raf;
    const loop = () => {
      const left = sec - (performance.now() - t0) / 1000;
      top.set(left);
      if (left <= 0) return finish();
      raf = requestAnimationFrame(loop);
    };
    function finish() {
      if (ended) return; ended = true;
      cancelAnimationFrame(raf);
      onEnd();
    }
    raf = requestAnimationFrame(loop);
    return { finish, get ended() { return ended; } };
  }

  // 큰 화면으로 보내는 진행 상황은 너무 자주 보내지 않음
  function throttled(fn, ms = 250) {
    let last = 0, tm = null, val;
    return v => {
      val = v;
      const now = Date.now();
      if (now - last >= ms) { last = now; fn(val); }
      else { clearTimeout(tm); tm = setTimeout(() => { last = Date.now(); fn(val); }, ms); }
    };
  }

  const GAMES = [];

  /* 1. 연타왕 */
  GAMES.push({
    id: 'tap', name: '연타왕', emoji: '👆', color: 'var(--pink)', sec: 10, live: 'count', unit: '회',
    rules: ['10초 동안 버튼을 최대한 많이 누르세요', '두 손가락 번갈아 누르기 허용!'],
    play(el, ctx) {
      let n = 0;
      const rep = throttled(ctx.report);
      const cnt = h('div', { class: 'tap-count' }, '0');
      const btn = h('button', { class: 'tap-btn' }, h('img', { src: 'img/logo-mark.png', alt: '' }), h('span', null, 'TAP!'));
      btn.addEventListener('pointerdown', e => {
        e.preventDefault(); if (g.ended) return;
        n++; cnt.textContent = n; rep(n);
        btn.classList.remove('hit'); void btn.offsetWidth; btn.classList.add('hit');
        if (n % 5 === 0) U.sfx.pop();
      });
      const g = timed(el, ctx, '연타왕', this.sec, () => ctx.done(n, n + '회'));
      el.appendChild(h('div', { class: 'g-body center' }, cnt, btn));
      return { stop: g.finish };
    },
  });

  /* 2. 10초를 멈춰라 */
  GAMES.push({
    id: 'stop10', name: '10초를 멈춰라', emoji: '⏱️', color: 'var(--mint)', sec: 20, live: 'hidden',
    rules: ['시계가 3초 뒤에 사라져요', '마음속으로 세다가 딱 10초에 STOP!', '10.00초에 가까울수록 1등'],
    play(el, ctx) {
      const top = topBar(el, '10초를 멈춰라', 0);
      top.text('');
      const clock = h('div', { class: 'stop-clock' }, '0.00');
      const btn = h('button', { class: 'big-round pink' }, 'STOP');
      const msg = h('div', { class: 'g-hint' }, '3초 뒤에 시계가 사라져요');
      el.appendChild(h('div', { class: 'g-body center' }, clock, msg, btn));
      const t0 = performance.now();
      let done = false, raf;
      const loop = () => {
        const t = (performance.now() - t0) / 1000;
        if (t < 3) clock.textContent = t.toFixed(2);
        else { clock.textContent = '?.??'; clock.classList.add('blur'); msg.textContent = '지금이다 싶을 때 STOP!'; }
        if (t >= 20) return finish();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      function finish() {
        if (done) return; done = true; cancelAnimationFrame(raf);
        const t = (performance.now() - t0) / 1000;
        clock.classList.remove('blur'); clock.textContent = t.toFixed(2);
        btn.disabled = true;
        const diff = Math.abs(t - 10);
        msg.textContent = diff < 0.1 ? '대박! 거의 정확해요 🎯' : (t < 10 ? `${diff.toFixed(2)}초 빨랐어요` : `${diff.toFixed(2)}초 늦었어요`);
        U.sfx.ok(); ctx.report(1);
        ctx.done(-Math.round(diff * 1000), t.toFixed(2) + '초');
      }
      btn.addEventListener('pointerdown', e => { e.preventDefault(); finish(); });
      return { stop: finish };
    },
  });

  /* 3. 순간포착 (반응속도) */
  GAMES.push({
    id: 'reaction', name: '순간포착', emoji: '⚡', color: 'var(--yellow)', sec: 40, live: 'steps', steps: 5,
    rules: ['화면이 핑크색으로 바뀌는 순간 터치!', '5번의 평균 반응속도로 겨뤄요', '미리 누르면 1초 벌칙'],
    play(el, ctx) {
      const R = 5;
      const delays = Array.from({ length: R }, () => 1200 + ctx.rng() * 2600);
      const top = topBar(el, '순간포착', 0);
      const pad = h('div', { class: 'react-pad wait' }, h('b', null, '기다리세요…'), h('small', null, '1 / ' + R));
      el.appendChild(h('div', { class: 'g-body' }, pad));
      const times = [];
      let round = 0, state = 'wait', tGo = 0, tm, finished = false;
      function next() {
        if (round >= R) return finish();
        state = 'wait';
        pad.className = 'react-pad wait';
        pad.innerHTML = `<b>기다리세요…</b><small>${round + 1} / ${R}</small>`;
        tm = setTimeout(() => {
          state = 'go'; tGo = performance.now();
          pad.className = 'react-pad go';
          pad.innerHTML = '<b>지금 터치!</b>';
          U.vibrate(30);
        }, delays[round]);
      }
      function record(ms, early) {
        times.push(ms); round++; ctx.report(round);
        state = 'show';
        pad.className = 'react-pad show' + (early ? ' early' : '');
        pad.innerHTML = early ? '<b>앗, 너무 빨라요!</b><small>+1000ms 벌칙</small>' : `<b>${Math.round(ms)}ms</b><small>${round} / ${R}</small>`;
        early ? U.sfx.bad() : U.sfx.ok();
        tm = setTimeout(next, 900);
      }
      pad.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (finished) return;
        if (state === 'wait') { clearTimeout(tm); record(1000, true); }
        else if (state === 'go') record(performance.now() - tGo, false);
      });
      function finish() {
        if (finished) return; finished = true; clearTimeout(tm);
        while (times.length < R) times.push(1500);
        const avg = Math.round(times.reduce((a, b) => a + b, 0) / R);
        pad.className = 'react-pad show';
        pad.innerHTML = `<b>평균 ${avg}ms</b><small>수고했어요!</small>`;
        top.text('완료');
        ctx.done(-avg, avg + 'ms');
      }
      next();
      return { stop: finish };
    },
  });

  /* 4. 암산 레이스 */
  GAMES.push({
    id: 'math', name: '암산 레이스', emoji: '🧮', color: 'var(--mint)', sec: 20, live: 'count', unit: '문제',
    rules: ['20초 동안 계산 문제를 최대한 많이 맞히세요', '틀리면 잠깐 멈춰요'],
    play(el, ctx) {
      const r = ctx.rng;
      let n = 0, lock = false;
      const q = h('div', { class: 'math-q' });
      const grid = h('div', { class: 'opt-grid' });
      const score = h('div', { class: 'g-hint' }, '맞힌 문제 0');
      const g = timed(el, ctx, '암산 레이스', this.sec, () => ctx.done(n, n + '문제'));
      el.appendChild(h('div', { class: 'g-body center' }, score, q, grid));
      function make() {
        const k = r.int(0, 3);
        let a, b, ans, s;
        if (k === 0) { a = r.int(12, 89); b = r.int(11, 79); ans = a + b; s = `${a} + ${b}`; }
        else if (k === 1) { a = r.int(40, 99); b = r.int(11, a - 5); ans = a - b; s = `${a} − ${b}`; }
        else if (k === 2) { a = r.int(3, 9); b = r.int(6, 19); ans = a * b; s = `${a} × ${b}`; }
        else { b = r.int(3, 9); ans = r.int(4, 15); a = b * ans; s = `${a} ÷ ${b}`; }
        const opts = new Set([ans]);
        while (opts.size < 4) { const d = r.pick([-10, -2, -1, 1, 2, 10, -3, 3]); const v = ans + d; if (v >= 0) opts.add(v); }
        q.textContent = s + ' = ?';
        grid.innerHTML = '';
        r.shuffle([...opts]).forEach(v => {
          const b2 = h('button', { class: 'opt' }, v);
          b2.addEventListener('pointerdown', e => {
            e.preventDefault(); if (lock || g.ended) return;
            if (v === ans) { n++; score.textContent = '맞힌 문제 ' + n; ctx.report(n); U.sfx.ok(); make(); }
            else { U.sfx.bad(); U.vibrate(80); b2.classList.add('wrong'); lock = true; setTimeout(() => { lock = false; make(); }, 700); }
          });
          grid.appendChild(b2);
        });
      }
      make();
      return { stop: g.finish };
    },
  });

  /* 5. 색깔 함정 */
  const COLORS = [
    { n: '빨강', c: '#E53935' }, { n: '파랑', c: '#1E88E5' },
    { n: '초록', c: '#2E9E5B' }, { n: '노랑', c: '#F2B705' }, { n: '보라', c: '#8E44AD' },
  ];
  GAMES.push({
    id: 'stroop', name: '색깔 함정', emoji: '🎨', color: 'var(--pink)', sec: 20, live: 'count', unit: '개',
    rules: ['글자의 뜻 말고 "글자 색깔"을 고르세요', '"파랑"이 빨간색으로 쓰여 있으면 → 빨강', '틀리면 잠깐 멈춰요'],
    play(el, ctx) {
      const r = ctx.rng;
      let n = 0, lock = false;
      const word = h('div', { class: 'stroop-word' });
      const grid = h('div', { class: 'opt-grid c2' });
      const score = h('div', { class: 'g-hint' }, '글자 "색깔"을 고르세요 · 0개');
      const g = timed(el, ctx, '색깔 함정', this.sec, () => ctx.done(n, n + '개'));
      el.appendChild(h('div', { class: 'g-body center' }, score, word, grid));
      function make() {
        const ink = r.pick(COLORS);
        let txt = r.pick(COLORS); if (r() < 0.75) while (txt === ink) txt = r.pick(COLORS);
        word.textContent = txt.n; word.style.color = ink.c;
        const opts = r.shuffle(COLORS.filter(c => c !== ink)).slice(0, 3).concat([ink]);
        grid.innerHTML = '';
        r.shuffle(opts).forEach(c => {
          const b = h('button', { class: 'opt color' }, h('i', { style: { background: c.c } }), c.n);
          b.addEventListener('pointerdown', e => {
            e.preventDefault(); if (lock || g.ended) return;
            if (c === ink) { n++; score.textContent = '글자 "색깔"을 고르세요 · ' + n + '개'; ctx.report(n); U.sfx.ok(); make(); }
            else { U.sfx.bad(); U.vibrate(80); b.classList.add('wrong'); lock = true; setTimeout(() => { lock = false; make(); }, 700); }
          });
          grid.appendChild(b);
        });
      }
      make();
      return { stop: g.finish };
    },
  });

  /* 6. 따부스 두더지 */
  GAMES.push({
    id: 'mole', name: '따부스 두더지', emoji: '🔨', color: 'var(--yellow)', sec: 20, live: 'count', unit: '점',
    rules: ['튀어나오는 따부스를 잡으세요 (+1)', '💣 폭탄을 누르면 −2', '모두 같은 순서로 나와요'],
    play(el, ctx) {
      const r = ctx.rng;
      const sec = this.sec;
      // 같은 판이면 같은 출현 순서
      const plan = []; let t = 600;
      while (t < sec * 1000 - 500) {
        plan.push({ t, cell: r.int(0, 8), life: 700 + r() * 500, bomb: r() < 0.15 });
        t += 380 + r() * 420;
      }
      let n = 0;
      const sc = h('div', { class: 'g-hint' }, '0점');
      const holes = Array.from({ length: 9 }, () => h('div', { class: 'hole' }));
      const board = h('div', { class: 'mole-board' }, holes);
      const g = timed(el, ctx, '따부스 두더지', sec, () => { timers.forEach(clearTimeout); ctx.done(n, n + '점'); });
      el.appendChild(h('div', { class: 'g-body center' }, sc, board));
      const timers = [];
      plan.forEach(p => {
        timers.push(setTimeout(() => {
          if (g.ended) return;
          const hole = holes[p.cell];
          if (hole.firstChild) return;
          const m = h('button', { class: 'mole' + (p.bomb ? ' bomb' : '') }, p.bomb ? '💣' : h('img', { src: 'img/logo-mark.png', alt: '' }));
          let hit = false;
          m.addEventListener('pointerdown', e => {
            e.preventDefault(); if (hit || g.ended) return; hit = true;
            n += p.bomb ? -2 : 1;
            sc.textContent = n + '점'; ctx.report(Math.max(0, n));
            p.bomb ? (U.sfx.bad(), U.vibrate(120)) : U.sfx.pop();
            m.classList.add('hit'); setTimeout(() => m.remove(), 180);
          });
          hole.appendChild(m);
          timers.push(setTimeout(() => m.remove(), p.life));
        }, p.t));
      });
      return { stop: g.finish };
    },
  });

  /* 7. 숫자 사냥 */
  GAMES.push({
    id: 'numbers', name: '숫자 사냥', emoji: '🔢', color: 'var(--mint)', sec: 40, live: 'steps', steps: 16,
    rules: ['1부터 16까지 순서대로 빠르게 누르세요', '가장 빨리 끝낸 팀이 1등'],
    play(el, ctx) {
      const nums = ctx.rng.shuffle(Array.from({ length: 16 }, (_, i) => i + 1));
      let next = 1; const t0 = performance.now();
      const hint = h('div', { class: 'g-hint big' }, '찾을 숫자: 1');
      const grid = h('div', { class: 'num-grid' });
      const g = timed(el, ctx, '숫자 사냥', this.sec, () => {
        if (next > 16) return;
        ctx.done((next - 1) * 100000 - 99999, (next - 1) + '개');
      });
      nums.forEach(v => {
        const b = h('button', { class: 'num' }, v);
        b.addEventListener('pointerdown', e => {
          e.preventDefault(); if (g.ended) return;
          if (v === next) {
            b.classList.add('got'); U.sfx.ok(); ctx.report(next); next++;
            if (next > 16) {
              const ms = performance.now() - t0;
              hint.textContent = `완료! ${(ms / 1000).toFixed(2)}초`;
              ctx.done(1600000 - Math.round(ms), (ms / 1000).toFixed(2) + '초');
              g.finish();
            } else hint.textContent = '찾을 숫자: ' + next;
          } else { U.sfx.bad(); b.classList.add('wrong'); setTimeout(() => b.classList.remove('wrong'), 250); }
        });
        grid.appendChild(b);
      });
      el.appendChild(h('div', { class: 'g-body center' }, hint, grid));
      return { stop: g.finish };
    },
  });

  /* 8. 부동산 OX 퀴즈 */
  const OX = [
    ['LTV는 집값 대비 대출받을 수 있는 금액의 비율이다.', true, '맞아요. Loan To Value, 담보가치 대비 대출 비율이에요.'],
    ['DSR은 연소득 대비 모든 대출의 1년 원리금 상환액 비율이다.', true, '맞아요. 주담대뿐 아니라 신용대출 등 모든 대출을 합쳐요.'],
    ['취득세는 집을 팔 때 내는 세금이다.', false, '집을 살 때 내요. 팔 때는 양도소득세!'],
    ['양도소득세는 집을 살 때 내는 세금이다.', false, '집을 팔아 차익이 생겼을 때 내는 세금이에요.'],
    ['등기부등본 "갑구"에는 소유권에 관한 사항이 적혀 있다.', true, '맞아요. 을구에는 저당권·전세권 같은 소유권 외 권리가 적혀요.'],
    ['근저당권은 등기부등본 "갑구"에 적힌다.', false, '근저당권은 을구에 적혀요.'],
    ['전세가율이 높을수록 갭투자에 필요한 내 돈은 줄어든다.', true, '매매가와 전세가 차이(갭)가 작아지니까요.'],
    ['아파트 전용면적에는 발코니 면적이 포함된다.', false, '발코니는 서비스 면적이라 전용면적에 들어가지 않아요.'],
    ['전입신고와 입주를 마치면 다음 날 0시부터 대항력이 생긴다.', true, '맞아요. 주택임대차보호법상 대항력은 다음 날 0시부터!'],
    ['청약통장은 한 사람이 여러 개 가입할 수 있다.', false, '주택청약종합저축은 1인 1계좌만 가능해요.'],
    ['공시가격은 재산세·종부세 같은 보유세를 매기는 기준이 된다.', true, '맞아요. 공시가격에 공정시장가액비율을 곱해 과세표준을 정해요.'],
    ['재산세는 매년 6월 1일에 집을 가진 사람에게 부과된다.', true, '맞아요. 6월 1일 소유자 기준이라 잔금일이 중요해요.'],
    ['아파트 실거래가는 국토교통부 실거래가 공개시스템에서 누구나 볼 수 있다.', true, '맞아요. 누구나 무료로 조회할 수 있어요.'],
    ['중개보수는 법정 상한 요율 안에서 협의할 수 있다.', true, '맞아요. 상한 요율 이내에서 협의해 정해요.'],
  ];
  GAMES.push({
    id: 'ox', name: '부동산 OX 퀴즈', emoji: '🏠', color: 'var(--pink)', sec: 60, live: 'steps', steps: 6,
    rules: ['부동산 상식 6문제, 문제당 6초', 'O 또는 X를 고르세요', '맞힌 개수 → 빨리 고른 순서로 순위'],
    play(el, ctx) {
      const Q = ctx.rng.shuffle(OX).slice(0, 6);
      const per = 6;
      let i = 0, correct = 0, bonus = 0, answered = false, tStart = 0, tm, raf, finished = false;
      const top = topBar(el, '부동산 OX 퀴즈', per);
      const num = h('div', { class: 'g-hint' });
      const qt = h('div', { class: 'ox-q' });
      const fb = h('div', { class: 'ox-fb' });
      const bO = h('button', { class: 'ox-btn o' }, 'O');
      const bX = h('button', { class: 'ox-btn x' }, 'X');
      el.appendChild(h('div', { class: 'g-body center' }, num, qt, h('div', { class: 'ox-row' }, bO, bX), fb));
      function show() {
        if (i >= Q.length) return finish();
        answered = false; fb.textContent = ''; fb.className = 'ox-fb';
        bO.disabled = bX.disabled = false; bO.className = 'ox-btn o'; bX.className = 'ox-btn x';
        num.textContent = `${i + 1} / ${Q.length} · 맞힌 개수 ${correct}`;
        qt.textContent = Q[i][0];
        tStart = performance.now();
        const loop = () => {
          const left = per - (performance.now() - tStart) / 1000;
          top.set(left);
          if (left <= 0) return answer(null);
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      }
      function answer(v) {
        if (answered || finished) return; answered = true; cancelAnimationFrame(raf);
        const q = Q[i]; const ok = v === q[1];
        if (ok) { correct++; bonus += Math.max(0, per * 1000 - (performance.now() - tStart)); U.sfx.ok(); }
        else U.sfx.bad();
        (q[1] ? bO : bX).classList.add('right');
        if (v != null && !ok) (v ? bO : bX).classList.add('wrong');
        bO.disabled = bX.disabled = true;
        fb.className = 'ox-fb ' + (ok ? 'ok' : 'no');
        fb.textContent = (v == null ? '시간 초과! ' : ok ? '정답! ' : '땡! ') + q[2];
        i++; ctx.report(i);
        tm = setTimeout(show, 2200);
      }
      bO.addEventListener('pointerdown', e => { e.preventDefault(); answer(true); });
      bX.addEventListener('pointerdown', e => { e.preventDefault(); answer(false); });
      function finish() {
        if (finished) return; finished = true; clearTimeout(tm); cancelAnimationFrame(raf);
        top.text('완료');
        qt.textContent = `${Q.length}문제 중 ${correct}개 정답!`;
        ctx.done(correct * 100000 + Math.round(bonus / 10), `${correct}/${Q.length}`);
      }
      show();
      return { stop: finish };
    },
  });

  window.GAMES = GAMES;
  window.GAME = id => GAMES.find(g => g.id === id);
})();

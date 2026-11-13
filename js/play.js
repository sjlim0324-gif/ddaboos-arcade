/* 따부스 오락실 — 참가자(폰) 화면 */
(function () {
  const { $, h } = U;
  const params = new URLSearchParams(location.search);
  let room = (params.get('r') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const app = $('#app');
  const netBadge = $('#net');

  if (!room) return askCode();

  const cid = params.get('cid') || U.store.get('dba-cid') || (() => { const c = U.id(10); U.store.set('dba-cid', c); return c; })();
  const playedKey = 'dba-played-' + room + '-' + cid;
  let S = null;           // 최근 방 상태
  let screen = '';        // 현재 화면 이름
  let running = null;     // 진행 중인 게임 {playId, stop, done, result}
  let pendingDone = null; // 진행 화면이 받을 때까지 다시 보낼 결과

  $('#room').textContent = room;
  const net = Net.player(room, onState, st => {
    netBadge.className = 'net ' + (st.up > 0 ? 'on' : 'off');
    netBadge.textContent = st.up > 0 ? '연결됨' : '연결 중…';
  });
  net.cid = cid;
  render('connecting');
  setInterval(() => net.send({ t: 'hb' }), 5000);
  setInterval(() => { if (pendingDone && S && S.phase === 'play') net.send(pendingDone); }, 2000);
  document.addEventListener('pointerdown', U.audioUnlock, { once: true });

  function myTeam() { return S && S.who && S.teams.find(t => t.id === S.who[cid]); }

  function onState(st) {
    S = st;
    const team = myTeam();
    // 결과 수신 확인
    if (pendingDone && (st.phase !== 'play' || (st.got && st.got.includes(cid)))) pendingDone = null;
    if (st.notice && st.notice[cid]) U.toast(st.notice[cid]);

    if (!team) {
      if (running) stopGame();
      return render('join');
    }
    if (st.phase === 'play' && st.game) {
      const played = U.store.get(playedKey, 0);
      if (!running && played !== st.game.playId) return startGame(st.game);
      if (running) return;
      return render('submitted');
    }
    if (running) stopGame();
    if (st.phase === 'result' || st.phase === 'final') return render('result');
    render('wait');
  }

  function render(name) {
    screen = name;
    app.className = 'p-app ' + name;
    app.innerHTML = '';
    const team = myTeam();
    if (name === 'connecting') {
      app.append(h('div', { class: 'p-center' }, h('div', { class: 'spinner' }), h('p', null, '진행 화면에 연결하는 중이에요'), h('small', null, `방 코드 ${room}`),
        h('a', { class: 'p-guide', href: 'guide.html#trouble', target: '_blank' }, '계속 연결 중이면? 해결 방법 보기')));
      return;
    }
    if (name === 'join') return renderJoin();

    const head = h('div', { class: 'p-team' },
      h('span', { class: 'chip' }, '우리 팀'), h('b', null, team.name),
      h('button', { class: 'linkbtn', onclick: () => { if (confirm('팀을 바꿀까요?')) net.send({ t: 'leave' }); } }, '팀 바꾸기'));
    app.append(head);

    if (name === 'wait') {
      const g = S.game && GAME(S.game.id);
      if (S.phase === 'intro' && g) {
        app.append(h('div', { class: 'p-card intro' },
          h('div', { class: 'em' }, g.emoji), h('h2', null, g.name),
          h('ul', null, g.rules.map(r => h('li', null, r))),
          h('p', { class: 'p-soft' }, '진행자가 시작하면 3·2·1 후 바로 시작해요!')));
      } else {
        app.append(h('div', { class: 'p-card' },
          h('img', { class: 'p-logo', src: 'img/logo-mark.png', alt: '' }),
          h('h2', null, S.phase === 'lobby' ? '참가 완료!' : '다음 게임을 기다리는 중'),
          h('p', { class: 'p-soft' }, S.phase === 'lobby' ? '큰 화면을 봐 주세요. 곧 시작해요.' : '진행자가 게임을 고르고 있어요.'),
          h('p', { class: 'p-soft' }, `팀원 ${team.n}명 · 누적 ${team.pts || 0}점`)));
      }
      return;
    }
    if (name === 'submitted') {
      const r = running && running.result || U.store.get('dba-last-' + room);
      app.append(h('div', { class: 'p-card' },
        h('div', { class: 'em' }, '✅'), h('h2', null, '기록 제출 완료'),
        r ? h('div', { class: 'p-big' }, r) : null,
        h('p', { class: 'p-soft' }, '다른 팀이 끝날 때까지 큰 화면을 봐 주세요')));
      return;
    }
    if (name === 'result') {
      const lr = S.lastResult;
      const mine = lr && lr.rows.find(x => x.teamId === team.id);
      const total = S.teams.slice().sort((a, b) => (b.pts || 0) - (a.pts || 0));
      const tr = total.findIndex(t => t.id === team.id) + 1;
      if (S.phase === 'final') {
        app.append(h('div', { class: 'p-card' }, h('div', { class: 'em' }, '🏆'), h('h2', null, '최종 순위 발표 중!'), h('p', { class: 'p-soft' }, '큰 화면을 봐 주세요')));
        return;
      }
      app.append(h('div', { class: 'p-card' },
        h('div', { class: 'em' }, mine ? (mine.rank === 1 ? '🥇' : mine.rank === 2 ? '🥈' : mine.rank === 3 ? '🥉' : '🎉') : '🙂'),
        h('h2', null, mine ? (mine.rank ? `이번 게임 ${mine.rank}등` : '이번 게임 불참') : '결과 발표'),
        mine ? h('div', { class: 'p-big' }, mine.disp || '-') : null,
        mine ? h('p', { class: 'p-soft' }, `+${mine.pts}점 · 누적 ${team.pts || 0}점 (현재 ${tr}위)`) : null));
    }
  }

  function renderJoin() {
    const teams = (S && S.teams) || [];
    const box = h('div', { class: 'p-join' },
      h('img', { class: 'p-logo', src: 'img/logo-full.png', alt: '따뜻한 부동산 스터디' }),
      h('h2', null, '팀을 골라 참가하세요'));
    if (teams.length) {
      const list = h('div', { class: 'team-list' });
      teams.forEach((t, i) => list.append(h('button', {
        class: 'team-btn c' + (i % 3), onclick: () => { U.audioUnlock(); net.send({ t: 'join', teamId: t.id }); box.classList.add('busy'); },
      }, h('b', null, t.name), h('small', null, `${t.n}명`))));
      box.append(list);
    } else box.append(h('p', { class: 'p-soft' }, '아직 팀이 없어요. 첫 팀을 만들어 주세요!'));

    if (!S || S.allowNew !== false) {
      const inp = h('input', { class: 'field', maxlength: 12, placeholder: '새 팀 이름 (최대 12자)' });
      const go = () => {
        const v = inp.value.trim(); if (!v) return inp.focus();
        U.audioUnlock(); net.send({ t: 'join', name: v }); box.classList.add('busy');
      };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      box.append(h('div', { class: 'p-new' }, inp, h('button', { class: 'btn pink', onclick: go }, '만들기')));
    } else box.append(h('p', { class: 'p-soft' }, '새 팀 만들기는 닫혀 있어요. 위에서 팀을 골라 주세요.'));
    if (!S) box.append(h('p', { class: 'p-soft' }, '진행 화면 연결을 기다리는 중…'));
    box.append(h('a', { class: 'p-guide', href: 'guide.html#player', target: '_blank' }, '참가 방법이 궁금하면? 이용 가이드 보기'));
    app.append(box);
  }

  async function startGame(game) {
    const g = GAME(game.id);
    if (!g) return;
    U.store.set(playedKey, game.playId);
    running = { playId: game.playId, stop: null, result: null, dead: false };
    const my = running;
    screen = 'game';
    app.className = 'p-app game';
    app.innerHTML = '';
    const cd = h('div', { class: 'p-count' }, h('small', null, g.emoji + ' ' + g.name), h('b', null, '3'));
    app.append(cd);
    for (const n of ['3', '2', '1']) {
      if (my.dead) return;
      cd.querySelector('b').textContent = n; U.sfx.tick(); U.vibrate(30);
      await U.sleep(800);
    }
    if (my.dead) return;
    U.sfx.go();
    app.innerHTML = '';
    const stage = h('div', { class: 'g-stage' });
    app.append(stage);
    let finished = false;
    const ctx = {
      rng: U.rng(game.seed),
      report: v => { if (!finished) net.send({ t: 'prog', playId: game.playId, v }); },
      done: (score, text) => {
        if (finished) return; finished = true;
        my.result = text;
        U.store.set('dba-last-' + room, text);
        pendingDone = { t: 'done', playId: game.playId, score, disp: text };
        net.send(pendingDone);
        setTimeout(() => {
          if (running !== my) return;
          const r = U.h('div', { class: 'g-done' }, h('b', null, '기록 제출!'), h('span', null, text));
          stage.append(r);
          setTimeout(() => { if (running === my) { running = null; if (S) onState(S); } }, 1600);
        }, 600);
      },
    };
    my.stop = g.play(stage, ctx).stop;
    // 제한 시간 안전장치
    my.guard = setTimeout(() => { if (!finished && my.stop) my.stop(); }, g.sec * 1000 + 500);
  }

  function stopGame() {
    const r = running; running = null;
    if (!r) return;
    r.dead = true;
    clearTimeout(r.guard);
    try { r.stop && r.stop(); } catch (e) { }
  }

  function askCode() {
    $('#room').textContent = '-';
    app.className = 'p-app join';
    const inp = h('input', { class: 'field code', maxlength: 5, placeholder: '방 코드 5자리', autocapitalize: 'characters' });
    const go = () => {
      const v = inp.value.trim().toUpperCase(); if (v.length !== 5) return U.toast('방 코드 5자리를 입력해 주세요');
      const q = new URLSearchParams(location.search); q.set('r', v); location.search = q.toString();
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    app.append(h('div', { class: 'p-join' },
      h('img', { class: 'p-logo', src: 'img/logo-full.png', alt: '' }),
      h('h2', null, '방 코드를 입력하세요'), h('p', { class: 'p-soft' }, '큰 화면에 보이는 5자리 코드예요'),
      inp, h('button', { class: 'btn pink block', onclick: go }, '참가하기')));
  }
})();

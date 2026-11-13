/* 따부스 오락실 — 진행(큰 화면) */
(function () {
  const { $, h } = U;
  const MAX_TEAMS = 16;
  const KEY = 'dba-host';

  // ---------- 저장되는 상태 ----------
  let D = U.store.get(KEY, null);
  if (!D || !D.room) D = newData();
  function newData() {
    return { room: U.roomCode(), teams: [], who: {}, allowNew: true, history: [], playN: 0, sel: 0 };
  }
  const save = () => U.store.set(KEY, D);

  // ---------- 실행 중 상태 ----------
  let phase = 'lobby';
  let game = null;      // {id, seed, playId}
  let results = {};     // cid -> {score, disp}
  let prog = {};        // cid -> v
  let vt = {};          // 가상 팀 진행 {teamId: {v, done, score, disp}}
  let hb = {};          // cid -> last seen
  let notice = {};
  let playT0 = 0, playTimer = null, simTimer = null, endSoon = null;
  let finalStep = 0;
  let lastResult = null;

  const qs = new URLSearchParams(location.search);
  const passNet = qs.get('net') ? '&net=' + qs.get('net') : '';
  const passMqtt = qs.get('mqtt') ? '&mqtt=' + encodeURIComponent(qs.get('mqtt')) : '';
  const base = location.href.replace(/[^/]*(\?.*)?(#.*)?$/, '');
  const joinUrl = () => `${base}play.html?r=${D.room}${passNet}${passMqtt}`;

  let netInfo = { up: 0, total: 0, label: '' };
  let net = makeNet();
  function makeNet() {
    return Net.host(D.room, onMsg, st => { netInfo = st; drawStatus(); });
  }

  // ---------- 계산 ----------
  const teamById = id => D.teams.find(t => t.id === id);
  const now = () => Date.now();
  const online = cid => hb[cid] && now() - hb[cid] < 15000;
  const members = tid => Object.keys(D.who).filter(c => D.who[c] === tid);
  const onlineCount = () => Object.keys(hb).filter(online).length;

  function publish() {
    const st = {
      phase,
      allowNew: D.allowNew,
      teams: D.teams.map(t => ({ id: t.id, name: t.name, n: members(t.id).length, pts: t.pts })),
      who: D.who,
    };
    if ((phase === 'intro' || phase === 'play') && game) st.game = game;
    if (phase === 'play') st.got = Object.keys(results);
    if (lastResult && (phase === 'result' || phase === 'select' || phase === 'final')) st.lastResult = lastResult;
    if (Object.keys(notice).length) st.notice = notice;
    net.setState(st);
  }
  setInterval(() => net.resend(), 4000);

  function say(cid, msg) {
    notice[cid] = msg; publish();
    setTimeout(() => { delete notice[cid]; }, 3000);
  }

  // ---------- 폰 메시지 ----------
  function onMsg(m) {
    const cid = m.cid; if (!cid) return;
    const was = online(cid);
    hb[cid] = now();
    if (m.t === 'hello' || m.t === 'hb') { if (!was) drawStatus(); return; }
    if (m.t === 'join') {
      let t = null;
      if (m.teamId) t = teamById(m.teamId);
      else if (m.name) {
        const name = String(m.name).trim().slice(0, 12);
        if (!name) return;
        t = D.teams.find(x => x.name.toLowerCase() === name.toLowerCase());
        if (!t) {
          if (!D.allowNew) return say(cid, '새 팀 만들기가 닫혀 있어요');
          if (D.teams.length >= MAX_TEAMS) return say(cid, `팀은 최대 ${MAX_TEAMS}개까지예요`);
          t = { id: U.id(6), name, pts: 0 };
          D.teams.push(t);
          U.sfx.pop();
        }
      }
      if (!t) return say(cid, '팀을 찾지 못했어요');
      D.who[cid] = t.id; save(); publish(); redraw();
      return;
    }
    if (m.t === 'leave') { delete D.who[cid]; save(); publish(); redraw(); return; }
    if (!game || m.playId !== game.playId || phase !== 'play' || !D.who[cid]) return;
    if (m.t === 'prog') { prog[cid] = m.v; drawLive(); }
    if (m.t === 'done') {
      if (!results[cid]) results[cid] = { score: +m.score || 0, disp: String(m.disp || '').slice(0, 20) };
      prog[cid] = prog[cid] == null ? 0 : prog[cid];
      publish(); drawLive(); checkEnd();
    }
  }

  // ---------- 화면 ----------
  const stage = $('#stage');
  const foot = $('#foot');

  function go(p) {
    phase = p; publish(); redraw();
  }

  function redraw() {
    $('#code').textContent = D.room;
    drawStatus();
    stage.className = 'stage ph-' + phase;
    stage.innerHTML = '';
    foot.innerHTML = '';
    ({ lobby: drawLobby, select: drawSelect, intro: drawIntro, play: drawPlay, result: drawResult, final: drawFinal })[phase]();
  }

  function drawStatus() {
    const n = onlineCount();
    const s = $('#status');
    const ok = netInfo.up > 0;
    s.className = 'status ' + (ok ? 'on' : 'off');
    s.textContent = `● 접속 ${n}대 · ${netInfo.label || '연결'} ${ok ? netInfo.up + '/' + netInfo.total : '연결 중…'}`;
    if (phase === 'lobby') U.$$('.team-tile .n').forEach(el => { const t = teamById(el.dataset.id); if (t) el.textContent = members(t.id).length + '명'; });
  }
  setInterval(drawStatus, 3000);

  function btn(label, cls, fn, key) {
    return h('button', { class: 'btn ' + cls, onclick: fn }, label, key ? h('kbd', null, key) : null);
  }

  function teamTile(t, i) {
    return h('div', { class: 'team-tile c' + (i % 3) }, h('b', null, t.name), h('span', { class: 'n', 'data-id': t.id }, members(t.id).length + '명'), t.virtual ? h('em', null, '가상') : null);
  }

  // 참가 접수
  function drawLobby() {
    const qr = h('div', { class: 'qr', html: U.qrSvg(joinUrl(), 8) });
    stage.append(h('div', { class: 'lobby' },
      h('div', { class: 'join-card card' },
        h('div', { class: 'jc-title' }, h('span', { class: 'dots' }, h('i'), h('i'), h('i')), '폰 카메라로 QR을 찍어 참가하세요'),
        qr,
        h('div', { class: 'jc-code' }, h('small', null, '방 코드'), h('b', null, D.room)),
        h('div', { class: 'jc-url' }, joinUrl().replace(/^https?:\/\//, '').replace(/[?&]net=local/, ''))),
      h('div', { class: 'lobby-teams' },
        h('h2', null, `참가 팀 `, h('span', { class: 'chip pink' }, D.teams.length + '팀')),
        D.teams.length ? h('div', { class: 'team-grid' }, D.teams.map(teamTile)) : h('p', { class: 'empty' }, '첫 번째 팀을 기다리고 있어요 🙌'),
        h('p', { class: 'tip' }, '팀 대표가 팀 이름을 만들고, 팀원은 같은 팀을 고르면 돼요. 팀 점수는 팀원 기록의 평균이에요.'))));
    foot.append(btn('설정', 'ghost', openSettings, 'S'), btn('게임 고르러 가기', 'pink', next, 'Space'));
  }

  // 게임 선택
  function drawSelect() {
    const grid = h('div', { class: 'game-grid' });
    GAMES.forEach((g, i) => {
      const played = D.history.filter(x => x.gameId === g.id).length;
      grid.append(h('button', {
        class: 'game-card' + (i === D.sel ? ' sel' : ''), style: { '--gc': g.color },
        onclick: () => { if (D.sel === i) next(); else { D.sel = i; save(); redraw(); } },
      }, h('span', { class: 'em' }, g.emoji), h('b', null, g.name), played ? h('small', null, `${played}회 진행`) : null));
    });
    stage.append(h('div', { class: 'select' },
      h('div', { class: 'sel-left' }, h('h2', null, '어떤 게임을 할까요?'), grid),
      scoreboard()));
    foot.append(btn('설정', 'ghost', openSettings, 'S'), btn('참가 QR', 'ghost', openQR, 'Q'),
      btn('최종 순위 발표', 'yellow', startFinal), btn('게임 소개', 'pink', next, 'Space'));
  }

  function scoreboard() {
    const sorted = D.teams.slice().sort((a, b) => b.pts - a.pts);
    const max = Math.max(1, ...sorted.map(t => t.pts));
    return h('div', { class: 'scoreboard card' },
      h('h3', null, '누적 점수', h('small', null, ` · ${D.history.length}게임 진행`)),
      sorted.length ? sorted.map((t, i) => h('div', { class: 'sb-row' },
        h('span', { class: 'rk' }, rankOf(sorted, i, x => x.pts)), h('span', { class: 'nm' }, t.name),
        h('span', { class: 'bar' }, h('i', { style: { width: (t.pts / max * 100) + '%' } })),
        h('b', null, t.pts))) : h('p', { class: 'empty' }, '아직 팀이 없어요'));
  }
  function rankOf(sorted, i, f) {
    let r = i; while (r > 0 && f(sorted[r - 1]) === f(sorted[i])) r--; return r + 1;
  }

  // 게임 소개
  function drawIntro() {
    const g = GAME(game.id);
    stage.append(h('div', { class: 'intro', style: { '--gc': g.color } },
      h('div', { class: 'em' }, g.emoji),
      h('h1', null, g.name),
      h('ol', null, g.rules.map(r => h('li', null, r))),
      h('p', { class: 'ready' }, `폰 ${onlineCount()}대 준비 · 진행자가 시작하면 3·2·1!`)));
    foot.append(btn('뒤로', 'ghost', back, 'Esc'), btn('시작!', 'pink', next, 'Space'));
  }

  // 진행 중
  function drawPlay() {
    const g = GAME(game.id);
    stage.append(h('div', { class: 'play' },
      h('div', { class: 'play-head' }, h('span', { class: 'em' }, g.emoji), h('b', null, g.name), h('span', { id: 'ptime', class: 'ptime' }, '')),
      h('div', { id: 'live', class: 'live' })));
    foot.append(btn('지금 종료', 'ghost', next, 'Space'));
    drawLive();
  }

  function teamLive(t) {
    const g = GAME(game.id);
    if (t.virtual) { const s = vt[t.id] || {}; return { v: s.v || 0, done: !!s.done, total: 1, n: s.done ? 1 : 0 }; }
    const ms = members(t.id);
    const act = ms.filter(c => online(c) || results[c]);
    const vs = act.map(c => prog[c] || 0);
    const avg = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0;
    const nDone = act.filter(c => results[c]).length;
    return { v: avg, done: act.length > 0 && nDone === act.length, total: act.length, n: nDone, steps: g.steps };
  }

  function drawLive() {
    const box = $('#live'); if (!box || !game) return;
    const g = GAME(game.id);
    const rows = D.teams.map(t => ({ t, L: teamLive(t) })).filter(r => r.L.total > 0 || r.t.virtual);
    if (!rows.length) { box.innerHTML = '<p class="empty">참가한 폰이 없어요</p>'; return; }
    if (g.live !== 'hidden') rows.sort((a, b) => b.L.v - a.L.v);
    const max = g.live === 'steps' ? g.steps : Math.max(10, ...rows.map(r => r.L.v));
    box.className = 'live' + (g.live === 'hidden' ? ' hidden-mode' : '') + (rows.length > 8 ? ' dense' : '');
    box.innerHTML = '';
    if (g.live === 'hidden') box.append(h('p', { class: 'live-note' }, '🤫 결과는 끝나고 공개!'));
    rows.forEach((r, i) => {
      const pct = g.live === 'hidden' ? (r.L.done ? 100 : 0) : U.clamp(r.L.v / max * 100, 0, 100);
      const val = g.live === 'hidden' ? (r.L.done ? '제출 ✓' : '진행 중…') :
        g.live === 'steps' ? `${Math.round(r.L.v * 10) / 10} / ${g.steps}` : `${Math.round(r.L.v * 10) / 10}${g.unit || ''}`;
      box.append(h('div', { class: 'lv-row c' + (D.teams.indexOf(r.t) % 3) + (r.L.done ? ' done' : '') },
        h('span', { class: 'nm' }, r.t.name),
        h('span', { class: 'track' }, h('i', { style: { width: Math.max(2, pct) + '%' } })),
        h('span', { class: 'val' }, val, r.L.total > 1 ? h('small', null, ` (${r.L.n}/${r.L.total})`) : null)));
    });
  }

  // 결과
  function drawResult() {
    const r = lastResult; const g = GAME(r.gameId);
    const rows = r.rows;
    // 동점이면 같은 자리에 함께 표시
    const podium = [2, 1, 3].map(k => {
      const xs = rows.filter(x => x.rank === k);
      return xs.length ? { name: xs.map(x => x.name).join(', '), disp: xs.map(x => x.disp).filter((v, i, a) => a.indexOf(v) === i).join(' / '), pts: xs[0].pts } : null;
    });
    stage.append(h('div', { class: 'result' },
      h('h2', null, g.emoji + ' ' + g.name + ' 결과'),
      h('div', { class: 'podium' }, podium.map((x, i) => h('div', { class: 'pd p' + [2, 1, 3][i] + (x ? '' : ' empty') },
        h('div', { class: 'pd-name' }, x ? x.name : ''), h('div', { class: 'pd-disp' }, x ? x.disp : ''),
        h('div', { class: 'pd-block' }, h('b', null, [2, 1, 3][i]), x ? h('small', null, '+' + x.pts + '점') : null)))),
      h('div', { class: 'res-list' }, rows.filter(x => x.rank > 3 || !x.rank).map(x => h('div', { class: 'rl' },
        h('span', null, x.rank ? x.rank + '등' : '불참'), h('b', null, x.name), h('span', null, x.disp || '-'), h('em', null, '+' + x.pts))))));
    foot.append(btn('결과 취소', 'ghost', undoLast), btn('다음 게임', 'pink', next, 'Space'));
    if (rows.some(x => x.rank === 1)) { setTimeout(() => U.confetti(2500), 300); U.sfx.fanfare(); }
  }

  // 최종 발표
  function startFinal() {
    if (!D.teams.length) return U.toast('팀이 없어요');
    finalStep = 0; go('final');
  }
  function drawFinal() {
    const sorted = D.teams.slice().sort((a, b) => b.pts - a.pts);
    const N = sorted.length;
    const list = h('div', { class: 'final-list' + (N > 8 ? ' dense' : '') });
    sorted.forEach((t, i) => {
      const shown = i >= N - finalStep;
      const rk = rankOf(sorted, i, x => x.pts);
      list.append(h('div', { class: 'fl' + (shown ? ' shown' : '') + (rk === 1 && shown ? ' win' : '') },
        h('span', { class: 'rk' }, rk === 1 ? '👑' : rk + '위'), h('b', null, shown ? t.name : '? ? ?'), h('em', null, shown ? t.pts + '점' : '')));
    });
    const doneAll = finalStep >= N;
    stage.append(h('div', { class: 'final' }, h('h1', null, doneAll ? '🏆 우승 ' + sorted.filter((t, i) => rankOf(sorted, i, x => x.pts) === 1).map(t => t.name).join(', ') + '!' : '최종 순위 발표'), list));
    foot.append(btn('게임 화면으로', 'ghost', back, 'Esc'), btn(doneAll ? '끝!' : (finalStep === 0 ? '꼴찌부터 공개' : '다음 공개'), 'pink', next, 'Space'));
    if (doneAll && finalStep === N) { U.confetti(5000); U.sfx.fanfare(); finalStep++; }
    else if (finalStep > 0 && !doneAll) U.sfx.drum();
  }

  // ---------- 진행 흐름 ----------
  function next() {
    U.audioUnlock();
    if (phase === 'lobby') return go('select');
    if (phase === 'select') {
      const g = GAMES[D.sel];
      game = { id: g.id, seed: (Math.random() * 2 ** 31) | 0, playId: ++D.playN };
      save();
      return go('intro');
    }
    if (phase === 'intro') return startPlay();
    if (phase === 'play') return endPlay();
    if (phase === 'result') { game = null; return go('select'); }
    if (phase === 'final') {
      const N = D.teams.length;
      if (finalStep < N) { finalStep++; return redraw(); }
      return;
    }
  }
  function back() {
    if (phase === 'intro') { game = null; return go('select'); }
    if (phase === 'final') return go('select');
    if (phase === 'select') return go('lobby');
  }

  function startPlay() {
    results = {}; prog = {}; vt = {};
    playT0 = now();
    go('play');
    const g = GAME(game.id);
    // 3·2·1 (폰과 같은 박자)
    const ov = h('div', { class: 'count-ov' }, h('b', null, '3'));
    document.body.append(ov);
    ['3', '2', '1'].forEach((n, i) => setTimeout(() => { ov.firstChild.textContent = n; U.sfx.tick(); }, i * 800));
    setTimeout(() => { ov.firstChild.textContent = 'GO!'; U.sfx.go(); }, 2400);
    setTimeout(() => ov.remove(), 3000);
    const limit = g.sec * 1000 + 2400 + 6000;
    clearInterval(playTimer);
    playTimer = setInterval(() => {
      const left = Math.max(0, Math.ceil((limit - (now() - playT0)) / 1000));
      const el = $('#ptime'); if (el) el.textContent = left + '초';
      if (now() - playT0 > limit) endPlay();
    }, 250);
    startSim(g);
  }

  function checkEnd() {
    if (phase !== 'play') return;
    const rows = D.teams.map(teamLive).filter(L => L.total > 0);
    if (endSoon || !rows.length || !rows.every(L => L.done)) return;
    const pid = game.playId;
    endSoon = setTimeout(() => { endSoon = null; if (phase === 'play' && game && game.playId === pid) endPlay(); }, 1200);
  }

  function endPlay() {
    if (phase !== 'play') return;
    clearTimeout(endSoon); endSoon = null;
    clearInterval(playTimer); clearInterval(simTimer);
    const g = GAME(game.id);
    const N = D.teams.length;
    const rows = D.teams.map(t => {
      let scores, disps;
      if (t.virtual) { const s = vt[t.id]; scores = s && s.done ? [s.score] : []; disps = s && s.done ? [s.disp] : []; }
      else { const ms = members(t.id).filter(c => results[c]); scores = ms.map(c => results[c].score); disps = ms.map(c => results[c].disp); }
      if (!scores.length) return { teamId: t.id, name: t.name, score: null, disp: '', rank: 0, pts: 0 };
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      return { teamId: t.id, name: t.name, score: avg, disp: scores.length === 1 ? disps[0] : fmtAvg(g, avg, scores.length) };
    });
    const ok = rows.filter(r => r.score != null).sort((a, b) => b.score - a.score);
    ok.forEach((r, i) => {
      r.rank = (i > 0 && Math.abs(ok[i - 1].score - r.score) < 1e-9) ? ok[i - 1].rank : i + 1;
      r.pts = N - r.rank + 1;
    });
    const all = ok.concat(rows.filter(r => r.score == null));
    all.forEach(r => { const t = teamById(r.teamId); if (t) t.pts += r.pts; });
    lastResult = { gameId: g.id, rows: all.map(({ score, ...rest }) => rest) };
    D.history.push(lastResult);
    save();
    go('result');
  }

  function fmtAvg(g, s, n) {
    const r1 = v => Math.round(v * 10) / 10;
    const tag = ` (${n}명 평균)`;
    switch (g.id) {
      case 'stop10': return `오차 ${(-s / 1000).toFixed(2)}초` + tag;
      case 'reaction': return `${Math.round(-s)}ms` + tag;
      case 'numbers': return s >= 1500000 ? `${((1600000 - s) / 1000).toFixed(2)}초` + tag : `${r1((s + 99999) / 100000)}개` + tag;
      case 'ox': return `${r1(Math.floor(s / 100000))}/6` + tag;
      default: return r1(s) + (g.unit || '') + tag;
    }
  }

  function undoLast() {
    const r = D.history.pop();
    if (!r) return;
    r.rows.forEach(x => { const t = teamById(x.teamId); if (t) t.pts -= x.pts; });
    lastResult = D.history[D.history.length - 1] || null;
    save(); U.toast('직전 게임 결과를 취소했어요'); game = null; go('select');
  }

  // 리허설용 가상 팀
  function startSim(g) {
    const vts = D.teams.filter(t => t.virtual);
    if (!vts.length) return;
    const dur = { tap: 10, stop10: 10, reaction: 18, math: 20, stroop: 20, mole: 20, numbers: 20, ox: 45 }[g.id] * 1000;
    vts.forEach(t => {
      const sp = 0.7 + Math.random() * 0.6;
      vt[t.id] = { v: 0, done: false, end: 2400 + dur * (g.id === 'numbers' || g.id === 'stop10' ? sp : 1), sp };
    });
    clearInterval(simTimer);
    simTimer = setInterval(() => {
      const el = now() - playT0 - 2400;
      vts.forEach(t => {
        const s = vt[t.id]; if (s.done) return;
        const f = U.clamp(el / (s.end - 2400), 0, 1);
        if (g.live === 'steps') s.v = Math.floor(f * g.steps * (g.id === 'numbers' ? 1 : 1));
        else if (g.live === 'count') s.v = Math.floor(f * ({ tap: 70, math: 12, stroop: 15, mole: 16 }[g.id]) * s.sp);
        if (el >= s.end - 2400) {
          s.done = true;
          const R = Math.random;
          const fin = {
            tap: () => [s.v, s.v + '회'], math: () => [s.v, s.v + '문제'], stroop: () => [s.v, s.v + '개'], mole: () => [s.v, s.v + '점'],
            stop10: () => { const t2 = 10 + (R() - 0.5) * 2.4; return [-Math.round(Math.abs(t2 - 10) * 1000), t2.toFixed(2) + '초']; },
            reaction: () => { const a = Math.round(230 + R() * 200); return [-a, a + 'ms']; },
            numbers: () => { const ms = Math.round(s.end - 2400); return [1600000 - ms, (ms / 1000).toFixed(2) + '초']; },
            ox: () => { const c = 2 + Math.floor(R() * 5); return [c * 100000 + Math.round(R() * 3000), c + '/6']; },
          }[g.id]();
          s.score = fin[0]; s.disp = fin[1];
        }
      });
      drawLive(); checkEnd();
    }, 300);
  }

  // ---------- 설정 ----------
  function modal(title, body, onClose) {
    const bg = h('div', { class: 'modal-bg', onclick: e => { if (e.target === bg) close(); } });
    const close = () => { bg.remove(); onClose && onClose(); };
    bg.append(h('div', { class: 'modal' }, h('div', { class: 'modal-head' }, h('h3', null, title), h('button', { class: 'x', onclick: close }, '✕')), body));
    document.body.append(bg);
    return close;
  }

  function openQR() {
    modal('참가 QR', h('div', { class: 'qr-big' }, h('div', { html: U.qrSvg(joinUrl(), 10) }), h('b', null, D.room), h('small', null, joinUrl())));
  }

  function openSettings() {
    const body = h('div', { class: 'settings' });
    const draw = () => {
      body.innerHTML = '';
      body.append(
        h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: D.allowNew, onchange: e => { D.allowNew = e.target.checked; save(); publish(); } }), ' 폰에서 새 팀 만들기 허용'),
        h('h4', null, `팀 관리 (${D.teams.length}/${MAX_TEAMS})`),
        h('div', { class: 'tm-list' }, D.teams.map(t => h('div', { class: 'tm' },
          h('input', { class: 'field sm', value: t.name, maxlength: 12, onchange: e => { const v = e.target.value.trim(); if (v) { t.name = v; save(); publish(); } } }),
          h('span', { class: 'mem' }, t.virtual ? '가상' : members(t.id).length + '명'),
          h('button', { class: 'btn sm ghost', onclick: () => { t.pts -= 1; save(); publish(); draw(); } }, '−1'),
          h('b', { class: 'pts' }, t.pts),
          h('button', { class: 'btn sm ghost', onclick: () => { t.pts += 1; save(); publish(); draw(); } }, '+1'),
          h('button', { class: 'btn sm ghost', onclick: () => { const v = prompt(`${t.name} 팀 점수 보정 (예: 5 또는 -3)`, '5'); const n = parseInt(v, 10); if (!isNaN(n)) { t.pts += n; save(); publish(); draw(); } } }, '±'),
          h('button', { class: 'btn sm ghost del', onclick: () => { if (!confirm(`'${t.name}' 팀을 삭제할까요?`)) return; D.teams = D.teams.filter(x => x !== t); Object.keys(D.who).forEach(c => { if (D.who[c] === t.id) delete D.who[c]; }); save(); publish(); draw(); } }, '삭제')))),
        h('div', { class: 'row gap' },
          h('button', { class: 'btn sm mint', onclick: () => { const n = prompt('새 팀 이름'); if (n && n.trim() && D.teams.length < MAX_TEAMS) { D.teams.push({ id: U.id(6), name: n.trim().slice(0, 12), pts: 0 }); save(); publish(); draw(); } } }, '+ 팀 미리 만들기'),
          h('button', { class: 'btn sm yellow', onclick: () => { if (D.teams.length >= MAX_TEAMS) return; const k = D.teams.filter(t => t.virtual).length + 1; D.teams.push({ id: U.id(6), name: '가상팀' + k, pts: 0, virtual: true }); save(); publish(); draw(); } }, '+ 가상 팀 (리허설)')),
        h('h4', null, '진행 보조'),
        h('div', { class: 'row gap' },
          h('button', { class: 'btn sm ghost', onclick: () => { if (!D.history.length) return U.toast('취소할 결과가 없어요'); if (confirm('직전 게임 결과를 취소할까요?')) { undoLast(); draw(); } } }, '직전 결과 취소'),
          h('button', { class: 'btn sm ghost', onclick: () => { if (!confirm('점수만 모두 0으로 돌릴까요? (팀은 유지)')) return; D.teams.forEach(t => t.pts = 0); D.history = []; lastResult = null; save(); publish(); draw(); } }, '점수 초기화'),
          h('button', { class: 'btn sm ghost del', onclick: () => { if (!confirm('새 방을 만들까요? 팀·점수가 모두 지워지고 방 코드가 바뀌어요.')) return; D = newData(); save(); location.reload(); } }, '새 방 만들기')),
        h('p', { class: 'tip' }, '단축키 · Space/Enter/PageDown 다음 · ←→ 게임 고르기 · Q 참가 QR · F 전체 화면 · S 설정 · Esc 뒤로'));
    };
    draw();
    modal('설정', body, redraw);
  }

  // ---------- 키보드 ----------
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (document.querySelector('.modal-bg')) { if (e.key === 'Escape') document.querySelector('.modal-bg').click(); return; }
    const k = e.key;
    if (k === ' ' || k === 'Enter' || k === 'PageDown') { e.preventDefault(); next(); }
    else if (k === 'Escape' || k === 'PageUp') back();
    else if (k === 'q' || k === 'Q') openQR();
    else if (k === 'f' || k === 'F') U.fullscreen();
    else if (k === 's' || k === 'S') openSettings();
    else if (phase === 'select' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) {
      e.preventDefault();
      const cols = 4, n = GAMES.length;
      const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[k];
      D.sel = (D.sel + d + n) % n; save(); redraw();
    }
  });

  $('#fs').onclick = U.fullscreen;
  $('#qrbtn').onclick = openQR;
  lastResult = D.history[D.history.length - 1] || null;
  phase = D.teams.length ? 'select' : 'lobby';
  publish(); redraw();
})();

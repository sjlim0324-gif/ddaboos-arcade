/* 따부스 오락실 — 통신
 * 서버 없이 동작하도록 공개 MQTT 브로커(WebSocket)를 두 곳 동시에 사용합니다.
 * - 진행 화면 → 폰: 방 상태(state)를 retained 메시지로 발행 (늦게 들어온 폰도 바로 받음)
 * - 폰 → 진행 화면: 참가/진행/결과 메시지
 * 같은 메시지가 두 브로커로 오가므로 id로 중복을 걸러냅니다.
 * ?net=local 이면 같은 브라우저의 탭끼리(BroadcastChannel) 테스트할 수 있습니다.
 */
(function () {
  const params = new URLSearchParams(location.search);
  const MODE = params.get('net') === 'local' ? 'local' : 'mqtt';
  const BROKERS = params.get('mqtt')
    ? [params.get('mqtt')]
    : ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
  const NS = 'ddaboos-arcade/v1/';

  function makeSeen() {
    const set = new Set(), q = [];
    return id => {
      if (set.has(id)) return true;
      set.add(id); q.push(id);
      if (q.length > 600) set.delete(q.shift());
      return false;
    };
  }

  // 공통 링크: publish(topic, obj, retain), subscribe(topic, handler), onStatus
  function makeLink(room, onStatus) {
    if (MODE === 'local') {
      const bc = new BroadcastChannel('ddaboos-arcade-' + room);
      const subs = {};
      bc.onmessage = e => { const { t, d } = e.data || {}; (subs[t] || []).forEach(f => f(d)); };
      setTimeout(() => onStatus({ up: 1, total: 1, label: '로컬' }), 0);
      return {
        pub(topic, obj) { bc.postMessage({ t: topic, d: obj }); },
        sub(topic, f) { (subs[topic] = subs[topic] || []).push(f); },
      };
    }
    const subs = {};
    const clients = [];
    const up = new Set();
    const report = () => onStatus({ up: up.size, total: BROKERS.length, label: '중계' });
    BROKERS.forEach((url, i) => {
      let c;
      try {
        c = mqtt.connect(url, {
          clientId: 'dba_' + U.id(10), clean: true, keepalive: 30,
          reconnectPeriod: 2000, connectTimeout: 8000,
        });
      } catch (e) { return; }
      clients.push(c);
      c.on('connect', () => {
        up.add(i); report();
        Object.keys(subs).forEach(t => c.subscribe(NS + room + '/' + t, { qos: 0 }));
      });
      c.on('close', () => { up.delete(i); report(); });
      c.on('offline', () => { up.delete(i); report(); });
      c.on('error', () => { });
      c.on('message', (topic, payload) => {
        const t = topic.slice((NS + room + '/').length);
        let d; try { d = JSON.parse(payload.toString()); } catch (e) { return; }
        (subs[t] || []).forEach(f => f(d));
      });
    });
    report();
    return {
      pub(topic, obj, retain) {
        const s = JSON.stringify(obj);
        clients.forEach(c => { if (c.connected) c.publish(NS + room + '/' + topic, s, { qos: 0, retain: !!retain }); });
      },
      sub(topic, f) {
        (subs[topic] = subs[topic] || []).push(f);
        clients.forEach(c => { if (c.connected) c.subscribe(NS + room + '/' + topic, { qos: 0 }); });
      },
    };
  }

  const Net = { MODE };

  // 진행 화면
  Net.host = function (room, onMsg, onStatus) {
    const link = makeLink(room, onStatus || (() => { }));
    const seen = makeSeen();
    const hid = U.id(6);
    let seq = 0, last = null, timer = null, pending = false;
    link.sub('p', m => {
      if (!m || !m.mid || seen(m.mid)) return;
      if (m.t === 'hello' && last) flush();
      onMsg(m);
    });
    function flush() {
      pending = false;
      if (!last) return;
      link.pub('s', Object.assign({ hid, seq: ++seq }, last), true);
    }
    return {
      setState(st) {
        last = st;
        if (pending) return;
        pending = true;
        clearTimeout(timer);
        timer = setTimeout(flush, 120);
      },
      // 상태가 그대로여도 주기적으로 다시 보냄(놓친 폰 대비)
      resend() { if (last && !pending) flush(); },
    };
  };

  // 참가자 폰
  Net.player = function (room, onState, onStatus) {
    const link = makeLink(room, st => {
      (onStatus || (() => { }))(st);
      if (st.up > 0) setTimeout(() => api.send({ t: 'hello' }), 300);
    });
    let lastHid = null, lastSeq = -1;
    link.sub('s', st => {
      if (!st) return;
      if (st.hid === lastHid && st.seq <= lastSeq) return;
      lastHid = st.hid; lastSeq = st.seq;
      onState(st);
    });
    const api = {
      cid: null,
      send(m) { m.mid = U.id(10); m.cid = api.cid; link.pub('p', m); },
    };
    return api;
  };

  window.Net = Net;
})();

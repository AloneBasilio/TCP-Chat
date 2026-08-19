(() => {
  'use strict';

  // ---------- DOM refs ----------
  const el = (id) => document.getElementById(id);

  const connectScreen = el('connect-screen');
  const appScreen = el('app-screen');
  const connectStatus = el('connect-status');
  const btnConnect = el('btn-connect');
  const tabLogin = el('tab-login');
  const tabRegister = el('tab-register');

  const connHost = el('conn-host');
  const connPort = el('conn-port');
  const connTls = el('conn-tls');
  const authUsername = el('auth-username');
  const authPassword = el('auth-password');

  const userAvatar = el('user-avatar');
  const userName = el('user-name');
  const userEndpoint = el('user-endpoint');
  const connDot = el('conn-dot');
  const connLabel = el('conn-label');

  const joinedRoomList = el('joined-room-list');
  const allRoomList = el('all-room-list');
  const joinRoomInput = el('join-room-input');
  const btnJoinRoom = el('btn-join-room');
  const btnDisconnect = el('btn-disconnect');

  const chatRoomTitle = el('chat-room-title');
  const chatMemberCount = el('chat-member-count');
  const chatLog = el('chat-log');
  const chatEmptyState = el('chat-empty-state');
  const composerInput = el('composer-input');
  const btnSend = el('btn-send');
  const toastStack = el('toast-stack');

  // ---------- state ----------
  let ws = null;
  let authMode = 'login'; // 'login' | 'register'
  let username = null;
  let activeRoom = null;
  const joinedRooms = new Map(); // room -> { members }
  const roomLogs = new Map();    // room -> array of rendered log entries (dom-ready objects)
  let allKnownRooms = [];
  let lastTrafficAt = Date.now();
  let livenessTimer = null;

  // Fixed hex palette (mirrors the --srv-N custom properties in style.css) so
  // we can also derive a translucent background without relying on the
  // browser supporting CSS color-mix().
  const SERVER_PALETTE = ['#c9834a', '#4fa98c', '#6f9bd1', '#b47fd1', '#d1a24f', '#d1704f'];
  const serverColorAssignment = new Map();

  function hexForServer(serverId) {
    if (!serverId) return '#868d89';
    if (!serverColorAssignment.has(serverId)) {
      const idx = serverColorAssignment.size % SERVER_PALETTE.length;
      serverColorAssignment.set(serverId, SERVER_PALETTE[idx]);
    }
    return serverColorAssignment.get(serverId);
  }

  function colorForServer(serverId) {
    return hexForServer(serverId);
  }

  function softBgForServer(serverId) {
    const hex = hexForServer(serverId).replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, 0.16)`;
  }

  // ---------- toast ----------
  function toast(message, kind = 'info') {
    const node = document.createElement('div');
    node.className = `toast${kind === 'error' ? ' error' : kind === 'ok' ? ' ok' : ''}`;
    node.textContent = message;
    toastStack.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  // ---------- connect screen ----------
  tabLogin.addEventListener('click', () => setAuthMode('login'));
  tabRegister.addEventListener('click', () => setAuthMode('register'));

  function setAuthMode(mode) {
    authMode = mode;
    tabLogin.classList.toggle('active', mode === 'login');
    tabRegister.classList.toggle('active', mode === 'register');
    btnConnect.textContent = mode === 'login' ? 'Ligar e entrar' : 'Ligar e registar';
  }

  function setConnectStatus(message, kind) {
    connectStatus.textContent = message || '';
    connectStatus.className = 'connect-status' + (kind ? ` ${kind}` : '');
  }

  btnConnect.addEventListener('click', attemptConnect);
  [connHost, connPort, authUsername, authPassword].forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') attemptConnect();
    });
  });

  function attemptConnect() {
    const host = connHost.value.trim() || 'localhost';
    const port = connPort.value.trim() || '8080';
    const user = authUsername.value.trim();
    const pass = authPassword.value;

    if (!user || !pass) {
      setConnectStatus('preencha utilizador e palavra-passe', 'error');
      return;
    }

    const scheme = connTls.checked ? 'wss' : 'ws';
    const url = `${scheme}://${host}:${port}`;

    btnConnect.disabled = true;
    setConnectStatus(`a ligar a ${url} …`);

    try {
      ws = new WebSocket(url);
    } catch (err) {
      setConnectStatus(`URL inválido: ${err.message}`, 'error');
      btnConnect.disabled = false;
      return;
    }

    ws.addEventListener('open', () => {
      setConnectStatus('ligado — a autenticar…', 'ok');
      send({ type: authMode, username: user, password: pass });
    });

    ws.addEventListener('message', (event) => onServerMessage(event.data, { host, port }));

    ws.addEventListener('close', () => {
      if (username) {
        // We were fully in the app — bounce back to the connect screen.
        toast('ligação ao servidor perdida', 'error');
        goToConnectScreen();
      } else {
        setConnectStatus('ligação fechada pelo servidor', 'error');
      }
      btnConnect.disabled = false;
      stopLivenessTimer();
    });

    ws.addEventListener('error', () => {
      setConnectStatus('não foi possível ligar (verifique host/porta)', 'error');
      btnConnect.disabled = false;
    });
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  // ---------- server message handling ----------
  function onServerMessage(raw, endpoint) {
    lastTrafficAt = Date.now();
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'ping':
        send({ type: 'pong' });
        return;

      case 'auth_result':
        if (msg.success) {
          username = msg.username;
          enterApp(endpoint);
        } else {
          setConnectStatus(msg.error || 'autenticação falhou', 'error');
          btnConnect.disabled = false;
        }
        return;

      case 'system':
        if (activeRoom) appendLog(activeRoom, { kind: 'system', text: msg.message });
        else toast(msg.message);
        return;

      case 'error':
        toast(msg.message, 'error');
        return;

      case 'joined':
        joinedRooms.set(msg.room, { members: msg.members });
        if (!roomLogs.has(msg.room)) roomLogs.set(msg.room, []);
        renderJoinedRooms();
        setActiveRoom(msg.room);
        return;

      case 'left':
        joinedRooms.delete(msg.room);
        roomLogs.delete(msg.room);
        renderJoinedRooms();
        if (activeRoom === msg.room) {
          const next = joinedRooms.keys().next();
          setActiveRoom(next.done ? null : next.value);
        }
        return;

      case 'rooms':
        allKnownRooms = msg.rooms || [];
        renderAllRooms();
        return;

      case 'history':
        roomLogs.set(msg.room, []);
        for (const m of msg.messages || []) {
          appendLog(msg.room, {
            kind: 'message',
            from: m.username,
            text: m.content,
            ts: m.created_at,
            serverId: m.server_id,
          }, { silent: true, historical: true });
        }
        if (msg.messages && msg.messages.length) {
          appendLog(msg.room, { kind: 'divider', text: 'novas mensagens' }, { silent: true });
        }
        if (msg.room === activeRoom) renderActiveLog();
        return;

      case 'message':
        appendLog(msg.room, {
          kind: 'message',
          from: msg.from,
          text: msg.content,
          ts: msg.timestamp,
          serverId: msg.serverId,
          self: msg.from === username,
        });
        return;

      default:
        return;
    }
  }

  // ---------- app screen ----------
  function enterApp(endpoint) {
    connectScreen.style.display = 'none';
    appScreen.classList.add('active');

    userName.textContent = username;
    userAvatar.textContent = username.slice(0, 1).toUpperCase();
    userEndpoint.textContent = `${connTls.checked ? 'wss' : 'ws'}://${endpoint.host}:${endpoint.port}`;

    toast(`sessão iniciada como ${username}`, 'ok');
    send({ type: 'list_rooms' });
    startLivenessTimer();
  }

  function goToConnectScreen() {
    appScreen.classList.remove('active');
    connectScreen.style.display = 'flex';
    username = null;
    activeRoom = null;
    joinedRooms.clear();
    roomLogs.clear();
    allKnownRooms = [];
    joinedRoomList.innerHTML = '';
    allRoomList.innerHTML = '';
    setConnectStatus('');
  }

  btnDisconnect.addEventListener('click', () => {
    if (ws) ws.close();
    goToConnectScreen();
  });

  // ---------- liveness indicator ----------
  function startLivenessTimer() {
    stopLivenessTimer();
    livenessTimer = setInterval(() => {
      const staleForMs = Date.now() - lastTrafficAt;
      const stale = staleForMs > 45000;
      connDot.classList.toggle('stale', stale);
      connLabel.textContent = stale ? 'sem resposta do servidor' : 'ligado';
    }, 2000);
  }

  function stopLivenessTimer() {
    if (livenessTimer) clearInterval(livenessTimer);
    livenessTimer = null;
  }

  // ---------- rooms sidebar ----------
  function renderJoinedRooms() {
    joinedRoomList.innerHTML = '';
    for (const [room, info] of joinedRooms) {
      const li = document.createElement('li');
      li.className = 'room-item' + (room === activeRoom ? ' active' : '');
      li.innerHTML = `<span><span class="hash">#</span>${escapeHtml(room)}</span>`;

      const leave = document.createElement('span');
      leave.className = 'leave-x';
      leave.textContent = '✕';
      leave.title = 'sair da sala';
      leave.addEventListener('click', (e) => {
        e.stopPropagation();
        send({ type: 'leave', room });
      });

      li.appendChild(leave);
      li.addEventListener('click', () => setActiveRoom(room));
      joinedRoomList.appendChild(li);
    }
  }

  function renderAllRooms() {
    allRoomList.innerHTML = '';
    for (const room of allKnownRooms) {
      const li = document.createElement('li');
      li.className = 'room-item' + (joinedRooms.has(room) ? ' active' : '');
      li.innerHTML = `<span><span class="hash">#</span>${escapeHtml(room)}</span>`;
      if (!joinedRooms.has(room)) {
        li.addEventListener('click', () => send({ type: 'join', room }));
      } else {
        li.addEventListener('click', () => setActiveRoom(room));
      }
      allRoomList.appendChild(li);
    }
  }

  btnJoinRoom.addEventListener('click', joinFromInput);
  joinRoomInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinFromInput();
  });

  function joinFromInput() {
    const room = joinRoomInput.value.trim();
    if (!room) return;
    send({ type: 'join', room });
    joinRoomInput.value = '';
  }

  function setActiveRoom(room) {
    activeRoom = room;
    renderJoinedRooms();
    renderAllRooms();

    if (!room) {
      chatRoomTitle.innerHTML = `<span class="hash">#</span>—`;
      chatMemberCount.textContent = '';
      composerInput.disabled = true;
      btnSend.disabled = true;
      composerInput.placeholder = 'Entre numa sala para escrever…';
      chatLog.innerHTML = '';
      chatLog.appendChild(chatEmptyState);
      return;
    }

    const info = joinedRooms.get(room);
    chatRoomTitle.innerHTML = `<span class="hash">#</span>${escapeHtml(room)}`;
    chatMemberCount.textContent = info ? `${info.members} membro(s) nesta instância` : '';
    composerInput.disabled = false;
    btnSend.disabled = false;
    composerInput.placeholder = `Escrever em #${room}…`;
    renderActiveLog();
    composerInput.focus();
  }

  // ---------- chat log ----------
  function appendLog(room, entry, opts = {}) {
    if (!roomLogs.has(room)) roomLogs.set(room, []);
    roomLogs.get(room).push(entry);
    if (room === activeRoom && !opts.silent) {
      renderLogLine(entry);
      chatLog.scrollTop = chatLog.scrollHeight;
    }
  }

  function renderActiveLog() {
    chatLog.innerHTML = '';
    const entries = roomLogs.get(activeRoom) || [];
    if (!entries.length) {
      chatLog.appendChild(chatEmptyState);
      return;
    }
    for (const entry of entries) renderLogLine(entry);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function renderLogLine(entry) {
    if (entry.kind === 'divider') {
      const div = document.createElement('div');
      div.className = 'history-divider';
      div.textContent = entry.text;
      chatLog.appendChild(div);
      return;
    }

    const line = document.createElement('div');
    line.className = 'log-line' + (entry.kind === 'system' ? ' system' : entry.kind === 'error' ? ' error' : '') + (entry.self ? ' self' : '');

    const ts = document.createElement('span');
    ts.className = 'ts';
    ts.textContent = entry.ts ? formatTime(entry.ts) : '';
    line.appendChild(ts);

    if (entry.serverId) {
      const tag = document.createElement('span');
      tag.className = 'srv-tag';
      tag.textContent = entry.serverId;
      tag.style.background = softBgForServer(entry.serverId);
      tag.style.color = colorForServer(entry.serverId);
      line.appendChild(tag);
    }

    if (entry.kind === 'message') {
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = entry.from;
      line.appendChild(who);
    }

    const body = document.createElement('span');
    body.className = 'body';
    body.textContent = entry.text;
    line.appendChild(body);

    chatLog.appendChild(line);
  }

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- composer ----------
  btnSend.addEventListener('click', sendComposer);
  composerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendComposer();
  });

  function sendComposer() {
    const text = composerInput.value.trim();
    if (!text || !activeRoom) return;
    send({ type: 'message', room: activeRoom, content: text });
    composerInput.value = '';
  }

  setAuthMode('login');
})();
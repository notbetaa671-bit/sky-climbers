import './styles.css';

const lobbyScreen = document.querySelector('#lobby-screen');
const gameScreen = document.querySelector('#game-screen');
const canvas = document.querySelector('#game-canvas');
const ctx = canvas.getContext('2d');
const nameInput = document.querySelector('#player-name');
const joinForm = document.querySelector('#join-form');
const serverList = document.querySelector('#server-list');
const launchButton = document.querySelector('#launch-button');
const refreshButton = document.querySelector('#refresh-servers');
const connectionStatus = document.querySelector('#connection-status');
const lobbyMessage = document.querySelector('#lobby-message');
const leaderboardPanel = document.querySelector('#leaderboard');
const leaderboardRows = document.querySelector('#leaderboard-rows');
const leaderboardButton = document.querySelector('#leaderboard-button');
const eventBanner = document.querySelector('#event-banner');
const connectionPill = document.querySelector('#connection-pill');
const hudRouteName = document.querySelector('#hud-route-name');
const hudPlayerCount = document.querySelector('#hud-player-count');
const hudCheckpoint = document.querySelector('#hud-checkpoint');
const hudPlayerName = document.querySelector('#hud-player-name');
const touchControls = document.querySelector('#touch-controls');

const configuredServer = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SERVER_URL
  ? import.meta.env.VITE_SERVER_URL
  : '';
const localDevServer = location.port === '5173' ? 'http://localhost:3001' : location.origin;
const serverBase = (window.SKY_SERVER_URL || configuredServer || localDevServer).replace(/\/$/, '');
const socketUrl = `${serverBase.replace(/^http/, 'ws')}/ws`;

const state = {
  socket: null,
  connected: false,
  joined: false,
  playerId: null,
  roomId: null,
  world: null,
  players: new Map(),
  leaderboard: [],
  servers: [],
  selectedServer: null,
  input: { left: false, right: false, up: false, down: false, jump: false },
  lastInputSent: 0,
  inputSeq: 0,
  camera: { x: 0, y: 0, initialized: false },
  lastFrame: performance.now(),
  lastSnapshotAt: performance.now(),
  bannerTimer: null,
  showLeaderboard: false,
  stars: Array.from({ length: 50 }, (_, index) => ({
    x: (index * 173) % 3600,
    y: (index * 97) % 2050,
    size: index % 7 === 0 ? 3 : 1,
    alpha: 0.24 + (index % 5) * 0.1,
  })),
};

const colors = ['#74f5db', '#ffb36c', '#a992ff', '#ff7293', '#79c8ff', '#d5ef77', '#f6e78b'];

function setLobbyMessage(message = '') {
  lobbyMessage.textContent = message;
}

function setConnectionStatus(online, label = online ? 'ONLINE' : 'OFFLINE') {
  connectionStatus.textContent = label;
  connectionStatus.classList.toggle('online', online);
}

function send(message) {
  if (state.socket?.readyState === WebSocket.OPEN) state.socket.send(JSON.stringify(message));
}

function connect() {
  if (state.socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(state.socket.readyState)) return;
  setConnectionStatus(false, 'CONNECTING…');
  state.socket = new WebSocket(socketUrl);
  state.socket.addEventListener('open', () => {
    state.connected = true;
    setConnectionStatus(true);
    connectionPill.innerHTML = '<span></span> CONNECTED';
    connectionPill.classList.remove('offline');
    send({ type: 'list-servers' });
  });
  state.socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    handleMessage(message);
  });
  state.socket.addEventListener('close', () => {
    state.connected = false;
    setConnectionStatus(false, 'RECONNECTING…');
    connectionPill.innerHTML = '<span></span> CONNECTION LOST';
    connectionPill.classList.add('offline');
    if (state.joined) showBanner('Connection lost — trying again', true);
    window.setTimeout(connect, 1800);
  });
  state.socket.addEventListener('error', () => {
    setConnectionStatus(false, 'SERVER UNAVAILABLE');
    if (!state.joined) setLobbyMessage('The cloudline is quiet. Start the server, then refresh this route.');
  });
}

function handleMessage(message) {
  switch (message.type) {
    case 'server-list':
      state.servers = message.servers || [];
      renderServers();
      break;
    case 'welcome':
      state.playerId = message.playerId;
      state.roomId = message.roomId;
      state.world = message.world;
      state.joined = true;
      state.players.clear();
      lobbyScreen.classList.add('hidden');
      gameScreen.classList.remove('hidden');
      resizeCanvas();
      hudRouteName.textContent = message.serverName || 'OPEN ROUTE';
      hudPlayerName.textContent = message.playerName;
      break;
    case 'snapshot':
      applySnapshot(message);
      break;
    case 'event':
      if (message.playerId === state.playerId || message.broadcast) showBanner(message.text, message.kind === 'hazard');
      break;
    case 'error':
      if (state.joined) showBanner(message.message, true);
      else setLobbyMessage(message.message);
      break;
    case 'pong':
      break;
    default:
      break;
  }
}

function applySnapshot(snapshot) {
  state.lastSnapshotAt = performance.now();
  const seen = new Set();
  for (const incoming of snapshot.players || []) {
    seen.add(incoming.id);
    const existing = state.players.get(incoming.id);
    if (existing) {
      existing.target = incoming;
      existing.last = existing.rendered || incoming;
    } else {
      state.players.set(incoming.id, { target: incoming, rendered: incoming, last: incoming });
    }
  }
  for (const id of state.players.keys()) if (!seen.has(id)) state.players.delete(id);
  state.leaderboard = snapshot.leaderboard || [];
  hudPlayerCount.textContent = `${snapshot.players?.length || 0}/50`;
  const me = state.players.get(state.playerId)?.target;
  if (me) hudCheckpoint.textContent = me.checkpointName || 'BASE CAMP';
  renderLeaderboard();
}

function renderServers() {
  if (!state.servers.length) {
    serverList.innerHTML = '<div class="empty-state">No routes available. Try refreshing.</div>';
    launchButton.disabled = true;
    return;
  }
  if (!state.selectedServer || !state.servers.some((server) => server.id === state.selectedServer)) {
    state.selectedServer = state.servers.find((server) => server.status !== 'FULL')?.id || state.servers[0].id;
  }
  serverList.innerHTML = state.servers.map((server) => {
    const full = server.count >= server.capacity;
    const selected = server.id === state.selectedServer;
    return `<button class="server-option ${selected ? 'selected' : ''}" type="button" data-server-id="${escapeHtml(server.id)}" ${full ? 'disabled' : ''}>
      <span><span class="route-name">${escapeHtml(server.name)}</span><span class="route-meta">${escapeHtml(server.mood)} · ${server.count}/${server.capacity} CLIMBERS</span></span>
      <span class="route-status ${full ? 'busy' : ''}">${full ? 'FULL' : selected ? 'SELECTED' : 'OPEN'}</span>
    </button>`;
  }).join('');
  serverList.querySelectorAll('[data-server-id]').forEach((button) => button.addEventListener('click', () => {
    state.selectedServer = button.dataset.serverId;
    renderServers();
  }));
  launchButton.disabled = !state.connected || !state.selectedServer;
}

function renderLeaderboard() {
  leaderboardRows.innerHTML = state.leaderboard.slice(0, 10).map((player, index) => `
    <div class="leader-row">
      <span class="leader-rank">${String(index + 1).padStart(2, '0')}</span>
      <span class="leader-name ${player.id === state.playerId ? 'me' : ''}">${escapeHtml(player.name)}${player.finished ? ' ✦' : ''}</span>
      <span class="leader-progress">${player.finished ? 'SUMMIT' : `${player.progress}%`}</span>
    </div>`).join('') || '<div class="leader-row"><span class="leader-name">Waiting for climbers…</span></div>';
  document.querySelector('#leaderboard-count').textContent = `${state.leaderboard.length} CLIMBERS`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function showBanner(message, danger = false) {
  eventBanner.textContent = message;
  eventBanner.style.color = danger ? 'var(--danger)' : 'var(--cyan)';
  eventBanner.style.borderColor = danger ? 'rgba(255,114,147,.5)' : 'rgba(116,245,219,.5)';
  eventBanner.classList.remove('hidden');
  window.clearTimeout(state.bannerTimer);
  state.bannerTimer = window.setTimeout(() => eventBanner.classList.add('hidden'), 2400);
}

function joinGame(event) {
  event.preventDefault();
  const playerName = nameInput.value.trim();
  if (playerName.length < 2) {
    setLobbyMessage('Use at least 2 characters for your callsign.');
    nameInput.focus();
    return;
  }
  if (!state.connected || !state.selectedServer) {
    setLobbyMessage('Choose an open route first.');
    return;
  }
  launchButton.disabled = true;
  launchButton.querySelector('span').textContent = 'JOINING ROUTE…';
  send({ type: 'join', roomId: state.selectedServer, name: playerName });
}

function sendInput() {
  if (!state.joined) return;
  send({ type: 'input', seq: ++state.inputSeq, ...state.input });
}

function setInput(key, value) {
  if (state.input[key] === value) return;
  state.input[key] = value;
  sendInput();
}

function keyForCode(code) {
  if (code === 'ArrowLeft' || code === 'KeyA') return 'left';
  if (code === 'ArrowRight' || code === 'KeyD') return 'right';
  if (code === 'ArrowUp' || code === 'KeyW') return 'up';
  if (code === 'ArrowDown' || code === 'KeyS') return 'down';
  if (code === 'Space') return 'jump';
  return null;
}

function onKeyDown(event) {
  if (event.code === 'Tab') {
    event.preventDefault();
    state.showLeaderboard = true;
    leaderboardPanel.classList.remove('hidden');
    return;
  }
  if (event.code === 'Escape' && state.joined) {
    leaveGame();
    return;
  }
  const key = keyForCode(event.code);
  if (key) {
    event.preventDefault();
    setInput(key, true);
  }
}

function onKeyUp(event) {
  if (event.code === 'Tab') return;
  const key = keyForCode(event.code);
  if (key) {
    event.preventDefault();
    setInput(key, false);
  }
}

function leaveGame() {
  state.joined = false;
  state.players.clear();
  state.leaderboard = [];
  state.camera.initialized = false;
  send({ type: 'leave' });
  gameScreen.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');
  launchButton.disabled = false;
  launchButton.querySelector('span').textContent = 'LAUNCH ASCENT';
  send({ type: 'list-servers' });
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(canvas.clientWidth * ratio);
  canvas.height = Math.floor(canvas.clientHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function viewport() {
  return { width: canvas.clientWidth || window.innerWidth, height: canvas.clientHeight || window.innerHeight };
}

function updateCamera(me) {
  const { width, height } = viewport();
  const targetX = me.x + me.w / 2 - width * 0.5;
  const targetY = me.y + me.h / 2 - height * 0.58;
  const maxX = Math.max(0, (state.world?.width || 3600) - width);
  const maxY = Math.max(0, (state.world?.height || 2200) - height);
  const nextX = Math.max(0, Math.min(maxX, targetX));
  const nextY = Math.max(0, Math.min(maxY, targetY));
  if (!state.camera.initialized) {
    state.camera.x = nextX;
    state.camera.y = nextY;
    state.camera.initialized = true;
    return;
  }
  state.camera.x += (nextX - state.camera.x) * 0.1;
  state.camera.y += (nextY - state.camera.y) * 0.1;
}

function draw() {
  const { width, height } = viewport();
  const scale = width / 960;
  ctx.save();
  const deviceRatio = window.devicePixelRatio || 1;
  ctx.setTransform(deviceRatio * scale, 0, 0, deviceRatio * scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const viewWidth = 960;
  const viewHeight = height / scale;
  drawSky(viewWidth, viewHeight);
  if (state.world) {
    const me = state.players.get(state.playerId)?.rendered || state.players.get(state.playerId)?.target;
    if (me) updateCamera(me);
    ctx.save();
    ctx.translate(-state.camera.x * scale, -state.camera.y * scale);
    drawWorld(state.world);
    ctx.restore();
  }
  ctx.restore();
}

function drawSky(width, height) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#111a43');
  gradient.addColorStop(.5, '#304f82');
  gradient.addColorStop(1, '#9ab6c8');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const parallax = state.camera.x * 0.07;
  for (const star of state.stars) {
    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = '#e8f4ff';
    ctx.fillRect((star.x - parallax) % (width + 240), (star.y - state.camera.y * .03) % (height + 180), star.size, star.size);
  }
  ctx.globalAlpha = 1;
  drawCloud(-120 - state.camera.x * .16, 170 - state.camera.y * .05, 240, .18);
  drawCloud(420 - state.camera.x * .1, 270 - state.camera.y * .04, 330, .13);
  drawCloud(790 - state.camera.x * .18, 110 - state.camera.y * .06, 220, .17);
  ctx.fillStyle = 'rgba(18, 32, 64, .44)';
  ctx.beginPath();
  ctx.moveTo(0, height * .68);
  for (let x = 0; x <= width + 100; x += 100) ctx.lineTo(x, height * .64 - ((x * 17) % 73));
  ctx.lineTo(width, height); ctx.lineTo(0, height); ctx.fill();
}

function drawCloud(x, y, size, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#e9f5ff';
  ctx.fillRect(x, y + size * .22, size, size * .2);
  ctx.fillRect(x + size * .16, y + size * .05, size * .34, size * .38);
  ctx.fillRect(x + size * .46, y - size * .02, size * .27, size * .45);
  ctx.fillRect(x + size * .67, y + size * .12, size * .24, size * .33);
  ctx.globalAlpha = 1;
}

function drawWorld(world) {
  const scaleX = 960 / 960;
  ctx.save();
  ctx.scale(scaleX, scaleX);
  for (const platform of world.platforms || []) drawPlatform(platform);
  for (const hazard of world.hazards || []) drawHazard(hazard);
  for (const checkpoint of world.checkpoints || []) drawCheckpoint(checkpoint);
  drawGoal(world.goal);
  const renderables = [...state.players.values()].sort((a, b) => (a.rendered?.y || 0) - (b.rendered?.y || 0));
  for (const player of renderables) {
    player.rendered = interpolatePlayer(player);
    drawPlayer(player.rendered, player.target.id === state.playerId);
  }
  ctx.restore();
}

function interpolatePlayer(entry) {
  const target = entry.target;
  const previous = entry.rendered || entry.last || target;
  const amount = target.id === state.playerId ? .26 : .18;
  return { ...target, x: previous.x + (target.x - previous.x) * amount, y: previous.y + (target.y - previous.y) * amount };
}

function drawPlatform(platform) {
  const palette = platform.type === 'base' ? ['#293b69', '#93c7dc'] : platform.type === 'ice' ? ['#456f9e', '#b1e5ee'] : ['#344d75', '#9dd0db'];
  ctx.fillStyle = palette[0];
  ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
  ctx.fillStyle = palette[1];
  ctx.fillRect(platform.x, platform.y, platform.w, 6);
  ctx.fillStyle = 'rgba(13, 23, 53, .35)';
  for (let x = platform.x + 12; x < platform.x + platform.w; x += 24) ctx.fillRect(x, platform.y + 12, 3, Math.max(3, platform.h - 16));
}

function drawHazard(hazard) {
  ctx.fillStyle = '#ff668a';
  const step = Math.max(12, hazard.h * .9);
  for (let x = hazard.x; x < hazard.x + hazard.w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, hazard.y + hazard.h);
    ctx.lineTo(x + step / 2, hazard.y);
    ctx.lineTo(x + step, hazard.y + hazard.h);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255, 102, 138, .24)';
  ctx.fillRect(hazard.x, hazard.y + hazard.h, hazard.w, 4);
}

function drawCheckpoint(checkpoint) {
  const active = state.players.get(state.playerId)?.target?.checkpointId === checkpoint.id;
  ctx.fillStyle = active ? '#74f5db' : '#7f8db2';
  ctx.fillRect(checkpoint.x, checkpoint.y, 4, 58);
  ctx.fillStyle = active ? '#74f5db' : '#8492b6';
  ctx.beginPath();
  ctx.moveTo(checkpoint.x + 4, checkpoint.y + 4);
  ctx.lineTo(checkpoint.x + 33, checkpoint.y + 13);
  ctx.lineTo(checkpoint.x + 4, checkpoint.y + 23);
  ctx.fill();
  if (active) { ctx.globalAlpha = .25; ctx.fillRect(checkpoint.x - 13, checkpoint.y - 13, 58, 85); ctx.globalAlpha = 1; }
}

function drawGoal(goal) {
  if (!goal) return;
  ctx.fillStyle = '#ffcb78';
  ctx.fillRect(goal.x, goal.y, 4, 82);
  ctx.fillStyle = '#ffcb78';
  ctx.beginPath(); ctx.moveTo(goal.x + 4, goal.y + 5); ctx.lineTo(goal.x + 48, goal.y + 18); ctx.lineTo(goal.x + 4, goal.y + 31); ctx.fill();
  ctx.fillStyle = 'rgba(255, 203, 120, .2)'; ctx.fillRect(goal.x - 20, goal.y - 24, 90, 135);
}

function drawPlayer(player, local) {
  const color = player.color || '#74f5db';
  ctx.save();
  ctx.translate(Math.round(player.x), Math.round(player.y));
  if (local) { ctx.fillStyle = 'rgba(116, 245, 219, .22)'; ctx.fillRect(-10, -10, player.w + 20, player.h + 20); }
  ctx.fillStyle = '#101a39'; ctx.fillRect(5, 0, player.w - 8, 8);
  ctx.fillStyle = color; ctx.fillRect(4, 7, player.w - 8, player.h - 10);
  ctx.fillStyle = '#fff4d7'; ctx.fillRect(8, 12, player.w - 16, 9);
  ctx.fillStyle = '#1a2449'; ctx.fillRect(10, 15, 3, 3); ctx.fillRect(player.w - 13, 15, 3, 3);
  ctx.fillStyle = '#101a39'; ctx.fillRect(2, player.h - 5, 9, 5); ctx.fillRect(player.w - 12, player.h - 5, 9, 5);
  ctx.font = '700 10px Space Mono, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = local ? '#e8fff9' : '#f6f1e5'; ctx.fillText(player.name, player.w / 2, -9);
  ctx.restore();
}

function gameLoop(now) {
  const delta = Math.min(60, now - state.lastFrame);
  state.lastFrame = now;
  if (state.joined && now - state.lastInputSent > 70) { state.lastInputSent = now; sendInput(); }
  draw(delta);
  requestAnimationFrame(gameLoop);
}

joinForm.addEventListener('submit', joinGame);
refreshButton.addEventListener('click', () => { send({ type: 'list-servers' }); setLobbyMessage('Refreshing routes…'); });
leaderboardButton.addEventListener('click', () => {
  state.showLeaderboard = !state.showLeaderboard;
  leaderboardPanel.classList.toggle('hidden', !state.showLeaderboard);
});
window.addEventListener('keydown', onKeyDown, { passive: false });
window.addEventListener('keyup', onKeyUp, { passive: false });
window.addEventListener('keyup', (event) => { if (event.code === 'Tab') { state.showLeaderboard = false; leaderboardPanel.classList.add('hidden'); } });
window.addEventListener('resize', resizeCanvas);
document.addEventListener('visibilitychange', () => { if (document.hidden) { state.input.left = false; state.input.right = false; state.input.jump = false; sendInput(); } });
touchControls.querySelectorAll('button').forEach((button) => {
  const key = button.dataset.control;
  const set = (value) => { button.classList.toggle('pressed', value); setInput(key, value); };
  button.addEventListener('pointerdown', (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); set(true); });
  button.addEventListener('pointerup', () => set(false));
  button.addEventListener('pointercancel', () => set(false));
  button.addEventListener('pointerleave', () => set(false));
});

nameInput.value = localStorage.getItem('sky-climbers-name') || '';
nameInput.addEventListener('input', () => localStorage.setItem('sky-climbers-name', nameInput.value));
resizeCanvas();
connect();
requestAnimationFrame(gameLoop);


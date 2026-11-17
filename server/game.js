import { MAX_PLAYERS_PER_ROOM, ROOM_TEMPLATES, WORLD, getPublicWorld } from './world.js';

export const PHYSICS_HZ = 30;
export const SNAPSHOT_HZ = 10;
const PLAYER_W = 28;
const PLAYER_H = 42;
const GRAVITY = 1850;
const MOVE_ACCEL = 2100;
const AIR_ACCEL = 1300;
const MAX_SPEED = 250;
const JUMP_SPEED = 710;
const MAX_DT = 1 / 20;

const rooms = new Map();
let nextPlayerId = 1;

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function safeName(name) {
  return String(name || 'CLIMBER').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 16) || 'CLIMBER';
}
function colorForPlayer(id) { return ['#74f5db', '#ffb36c', '#a992ff', '#ff7293', '#79c8ff', '#d5ef77', '#f6e78b'][id % 7]; }

function createRoom(template) {
  const room = { ...template, players: new Map(), createdAt: Date.now(), tick: 0 };
  rooms.set(template.id, room);
  return room;
}

function ensureRoom(roomId) {
  const template = ROOM_TEMPLATES.find((entry) => entry.id === roomId) || ROOM_TEMPLATES[0];
  return rooms.get(template.id) || createRoom(template);
}

export function getServerList() {
  return ROOM_TEMPLATES.map((template) => {
    const room = rooms.get(template.id);
    const count = room?.players.size || 0;
    return {
      id: template.id,
      name: template.name,
      mood: template.mood,
      count,
      capacity: MAX_PLAYERS_PER_ROOM,
      status: count >= MAX_PLAYERS_PER_ROOM ? 'FULL' : 'OPEN',
    };
  });
}

function createPlayer(name, socket, room) {
  const id = `p${nextPlayerId++}`;
  return {
    id,
    name: safeName(name),
    socket,
    room,
    color: colorForPlayer(nextPlayerId),
    x: WORLD.spawn.x,
    y: WORLD.spawn.y,
    vx: 0,
    vy: 0,
    w: PLAYER_W,
    h: PLAYER_H,
    grounded: false,
    input: { left: false, right: false, up: false, down: false, jump: false },
    jumpHeld: false,
    lastInputSeq: 0,
    checkpointId: null,
    checkpointName: 'BASE CAMP',
    respawn: { ...WORLD.spawn },
    deaths: 0,
    finished: false,
    finishedAt: null,
    joinedAt: Date.now(),
    lastSeenAt: Date.now(),
  };
}

function send(socket, payload) {
  if (socket.readyState === 1) socket.send(JSON.stringify(payload));
}

function broadcast(room, payload, except = null) {
  for (const player of room.players.values()) if (player.socket !== except) send(player.socket, payload);
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    x: Math.round(player.x * 10) / 10,
    y: Math.round(player.y * 10) / 10,
    vx: Math.round(player.vx),
    vy: Math.round(player.vy),
    w: PLAYER_W,
    h: PLAYER_H,
    grounded: player.grounded,
    checkpointId: player.checkpointId,
    checkpointName: player.checkpointName,
    deaths: player.deaths,
    finished: player.finished,
  };
}

function progressFor(player) {
  if (player.finished) return 100;
  const lowest = WORLD.height;
  const highest = -100;
  return clamp(Math.round(((lowest - (player.y + player.h)) / (lowest - highest)) * 100), 0, 99);
}

function leaderboard(room) {
  return [...room.players.values()]
    .sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished && b.finished) return a.finishedAt - b.finishedAt;
      if (a.checkpointId !== b.checkpointId) return progressFor(b) - progressFor(a);
      return b.y - a.y;
    })
    .map((player) => ({ id: player.id, name: player.name, progress: progressFor(player), finished: player.finished }));
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function resolveHorizontal(player, dt) {
  const direction = (player.input.right ? 1 : 0) - (player.input.left ? 1 : 0);
  if (direction) {
    player.vx += direction * (player.grounded ? MOVE_ACCEL : AIR_ACCEL) * dt;
  } else {
    player.vx *= player.grounded ? Math.max(0, 1 - 12 * dt) : Math.max(0, 1 - 2.3 * dt);
  }
  player.vx = clamp(player.vx, -MAX_SPEED, MAX_SPEED);
  player.x += player.vx * dt;
  player.x = clamp(player.x, 0, WORLD.width - player.w);
}

function resolveVertical(player, dt) {
  const oldBottom = player.y + player.h;
  player.vy += GRAVITY * dt;
  player.vy = clamp(player.vy, -1000, 1150);
  player.y += player.vy * dt;
  player.grounded = false;
  if (player.vy >= 0) {
    for (const platform of WORLD.platforms) {
      const horizontalOverlap = player.x + player.w > platform.x && player.x < platform.x + platform.w;
      const landed = oldBottom <= platform.y + 3 && player.y + player.h >= platform.y;
      if (horizontalOverlap && landed) {
        player.y = platform.y - player.h;
        player.vy = 0;
        player.grounded = true;
        break;
      }
    }
  } else {
    for (const platform of WORLD.platforms) {
      const horizontalOverlap = player.x + player.w > platform.x && player.x < platform.x + platform.w;
      const hitCeiling = player.y <= platform.y + platform.h && oldBottom > platform.y + platform.h && horizontalOverlap;
      if (hitCeiling) {
        player.y = platform.y + platform.h;
        player.vy = 0;
        break;
      }
    }
  }
}

function respawn(player, reason = 'hazard') {
  player.x = player.respawn.x;
  player.y = player.respawn.y;
  player.vx = 0;
  player.vy = 0;
  player.grounded = false;
  player.deaths += 1;
  send(player.socket, { type: 'event', kind: reason, playerId: player.id, text: reason === 'hazard' ? 'Watch the spikes — try again' : 'The clouds caught you — try again' });
}

function checkProgress(player) {
  const body = { x: player.x, y: player.y, w: player.w, h: player.h };
  for (const checkpoint of WORLD.checkpoints) {
    const trigger = { x: checkpoint.x - 12, y: checkpoint.y - 10, w: 58, h: 78 };
    if (rectsOverlap(body, trigger) && player.checkpointId !== checkpoint.id) {
      player.checkpointId = checkpoint.id;
      player.checkpointName = checkpoint.name;
      player.respawn = { x: checkpoint.spawnX, y: checkpoint.spawnY };
      send(player.socket, { type: 'event', kind: 'checkpoint', playerId: player.id, text: `${checkpoint.name} reached` });
    }
  }
  if (!player.finished && rectsOverlap(body, WORLD.goal)) {
    player.finished = true;
    player.finishedAt = Date.now();
    player.vx = 0;
    player.vy = 0;
    send(player.socket, { type: 'event', kind: 'summit', playerId: player.id, text: 'SUMMIT REACHED — you made the sky yours' });
    broadcast(player.room, { type: 'event', kind: 'summit', broadcast: true, playerId: player.id, text: `${player.name} reached the summit` }, player.socket);
  }
}

function stepPlayer(player, dt) {
  if (player.finished) return;
  resolveHorizontal(player, dt);
  if (player.input.jump && !player.jumpHeld && player.grounded) {
    player.vy = -JUMP_SPEED;
    player.grounded = false;
  }
  player.jumpHeld = player.input.jump;
  resolveVertical(player, dt);
  const body = { x: player.x + 3, y: player.y + 4, w: player.w - 6, h: player.h - 4 };
  if (WORLD.hazards.some((hazard) => rectsOverlap(body, hazard))) respawn(player, 'hazard');
  else if (player.y > WORLD.height + 120) respawn(player, 'fall');
  else checkProgress(player);
}

export function joinRoom({ socket, roomId, name }) {
  const room = ensureRoom(roomId);
  if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
    send(socket, { type: 'error', message: 'That route is full. Choose another cloudline.' });
    return null;
  }
  const player = createPlayer(name, socket, room);
  room.players.set(player.id, player);
  send(socket, { type: 'welcome', playerId: player.id, playerName: player.name, roomId: room.id, serverName: room.name, world: getPublicWorld() });
  broadcast(room, { type: 'event', kind: 'join', broadcast: true, playerId: player.id, text: `${player.name} joined the ascent` }, socket);
  return player;
}

export function leaveRoom(player) {
  if (!player?.room) return;
  const room = player.room;
  room.players.delete(player.id);
  broadcast(room, { type: 'event', kind: 'leave', broadcast: true, playerId: player.id, text: `${player.name} left the cloudline` });
  player.room = null;
}

export function updateInput(player, message) {
  if (!player || !player.room || !Number.isFinite(message.seq) || message.seq < player.lastInputSeq) return;
  player.lastInputSeq = message.seq;
  player.lastSeenAt = Date.now();
  for (const key of ['left', 'right', 'up', 'down', 'jump']) player.input[key] = Boolean(message[key]);
}

export function tickRooms() {
  for (const room of rooms.values()) {
    room.tick += 1;
    for (const player of room.players.values()) stepPlayer(player, MAX_DT);
    if (room.tick % 3 === 0) {
      const snapshot = { type: 'snapshot', tick: room.tick, players: [...room.players.values()].map(publicPlayer), leaderboard: leaderboard(room) };
      broadcast(room, snapshot);
    }
  }
}

export function getRoomStats() {
  const activeRooms = [...rooms.values()].filter((room) => room.players.size > 0);
  return { rooms: activeRooms.length, players: activeRooms.reduce((total, room) => total + room.players.size, 0), maxPlayersPerRoom: MAX_PLAYERS_PER_ROOM };
}


import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { getServerList, getRoomStats, joinRoom, leaveRoom, tickRooms, updateInput } from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const port = Number.parseInt(process.env.PORT || '3001', 10);

const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function staticRoot() {
  const dist = path.join(rootDir, 'dist');
  return fs.existsSync(path.join(dist, 'index.html')) ? dist : rootDir;
}

function serveFile(response, pathname) {
  const root = staticRoot();
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(root, `.${requested}`);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, { 'content-type': mimeTypes[path.extname(filePath)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (url.pathname === '/api/servers') {
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ servers: getServerList() }));
    return;
  }
  if (url.pathname === '/api/health') {
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ ok: true, game: 'sky-climbers', ...getRoomStats() }));
    return;
  }
  serveFile(response, url.pathname);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', (socket) => {
  let player = null;
  socket.on('message', (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (message.type === 'list-servers') {
      socket.send(JSON.stringify({ type: 'server-list', servers: getServerList() }));
    } else if (message.type === 'join' && !player) {
      player = joinRoom({ socket, roomId: message.roomId, name: message.name });
    } else if (message.type === 'input') {
      updateInput(player, message);
    } else if (message.type === 'leave') {
      leaveRoom(player);
      player = null;
      socket.send(JSON.stringify({ type: 'server-list', servers: getServerList() }));
    } else if (message.type === 'ping') {
      socket.send(JSON.stringify({ type: 'pong', t: message.t }));
    }
  });
  socket.on('close', () => leaveRoom(player));
  socket.on('error', () => leaveRoom(player));
});

const tickMs = 1000 / 30;
setInterval(tickRooms, tickMs);
server.listen(port, '0.0.0.0', () => console.log(`SKY CLIMBERS listening on http://localhost:${port}`));


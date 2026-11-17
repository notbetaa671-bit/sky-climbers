import WebSocket from 'ws';

const port = Number.parseInt(process.env.PORT || '3001', 10);
const count = Number.parseInt(process.env.LOAD_TEST_PLAYERS || '50', 10);
const roomId = process.env.LOAD_TEST_ROOM || 'aurora';
const url = `ws://127.0.0.1:${port}/ws`;
const sockets = [];
let welcomed = 0;
let snapshots = 0;
let failures = 0;

await Promise.all(Array.from({ length: count }, (_, index) => new Promise((resolve) => {
  const socket = new WebSocket(url);
  sockets.push(socket);
  const timeout = setTimeout(() => { failures += 1; socket.terminate(); resolve(); }, 5000);
  let welcomedByThisSocket = false;
  socket.on('open', () => socket.send(JSON.stringify({ type: 'join', roomId, name: `load-${index + 1}` })));
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type === 'welcome' && !welcomedByThisSocket) {
      welcomedByThisSocket = true;
      welcomed += 1;
      clearTimeout(timeout);
      resolve();
    }
    if (message.type === 'snapshot') snapshots += 1;
    if (message.type === 'error') failures += 1;
  });
  socket.on('error', () => { failures += 1; clearTimeout(timeout); resolve(); });
  socket.on('close', () => clearTimeout(timeout));
})));

await new Promise((resolve) => setTimeout(resolve, 1200));
for (const socket of sockets) socket.close();

console.log(JSON.stringify({ requested: count, welcomed, snapshots, failures, pass: welcomed === count && failures === 0 }, null, 2));
if (welcomed !== count || failures > 0) process.exitCode = 1;


import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { GameRoom } from './room.js';
import { encode, parseClientMessage } from './protocol.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, '..');

export function createGameServer({
  port = Number(process.env.PORT) || 3000,
  startRoom = true,
  devMode = process.env.DEV_MODE === '1'
} = {}) {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  const room = new GameRoom({ devMode });

  app.disable('x-powered-by');
  app.get('/healthz', (_req, res) => res.json({ ok: true, players: room.players.size }));
  app.use('/vendor', express.static(path.join(root, 'node_modules/three/build')));
  app.use(express.static(path.join(root, 'public')));

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  });

  wss.on('connection', (ws) => {
    const player = room.addClient(ws);
    ws.on('message', (raw) => {
      const message = parseClientMessage(raw);
      if (!message) {
        if (ws.readyState === 1) ws.send(encode('reject', { reason: 'invalid_message' }));
        return;
      }
      room.handleMessage(player.id, message);
    });
    ws.on('close', () => room.removeClient(player.id));
    ws.on('error', () => {});
  });

  return {
    app,
    server,
    room,
    wss,
    async listen() {
      await new Promise((resolve) => server.listen(port, resolve));
      if (startRoom) room.start();
      return server.address();
    },
    async close() {
      room.stop();
      for (const client of wss.clients) client.terminate();
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const portFlagIndex = process.argv.indexOf('--port');
  const forwardedPort = portFlagIndex >= 0 ? Number(process.argv[portFlagIndex + 1]) : 0;
  const game = createGameServer({ port: forwardedPort || Number(process.env.PORT) || 3000 });
  game.listen().then((address) => {
    const port = typeof address === 'object' ? address.port : process.env.PORT;
    console.log(`Faction War Arena listening on http://localhost:${port}`);
  });
}

const WebSocket = require('ws');
const { getAllPrices } = require('../config/market');

let wss;

function createWebSocketServer(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    console.log(`[WS] Client connected. Total: ${wss.clients.size}`);
    ws.isAlive = true;

    // Send initial prices on connect
    safeSend(ws, { type: 'prices', data: getAllPrices(), ts: Date.now() });

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'subscribe') {
          ws.subscriptions = msg.symbols || [];
        }
        if (msg.type === 'ping') safeSend(ws, { type: 'pong' });
      } catch {}
    });

    ws.on('close', () => {
      console.log(`[WS] Client disconnected. Total: ${wss.clients.size}`);
    });
  });

  // Broadcast prices every 3s
  setInterval(() => {
    if (!wss.clients.size) return;
    const prices = getAllPrices();
    const payload = JSON.stringify({ type: 'prices', data: prices, ts: Date.now() });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }, 3000);

  // Heartbeat to clean dead connections
  setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);

  console.log('[WS] WebSocket server ready at ws://localhost/ws');
}

function safeSend(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function broadcastToAll(data) {
  if (!wss) return;
  const payload = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

module.exports = { createWebSocketServer, broadcastToAll };

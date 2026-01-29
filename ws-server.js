/* =========================================================
   WEBSOCKET SERVER – LIVE CRASH GAME
   ========================================================= */

import './api.js';
import './game-engine.js';

import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';

const db = window.db;
const CONFIG = window.CONFIG;

/* ================= SERVER ================= */

const PORT = 8080;
const server = http.createServer();
const wss = new WebSocketServer({ server });

/* ================= CLIENTS ================= */

const CLIENTS = new Map(); // socket -> userId

function broadcast(type, payload) {
    const msg = JSON.stringify({ type, payload });
    for (const ws of CLIENTS.keys()) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(msg);
        }
    }
}

/* ================= GAME STATE PUSH ================= */

async function sendGameState(ws) {
    const game = await db.getGameState();
    ws.send(JSON.stringify({
        type: 'game_state',
        payload: game
    }));
}

/* ================= MESSAGE HANDLER ================= */

async function handleMessage(ws, msg) {
    let data;
    try {
        data = JSON.parse(msg);
    } catch {
        return;
    }

    const { type, payload } = data;
    const userId = CLIENTS.get(ws);

    try {
        switch (type) {

            case 'auth': {
                // payload: { userId }
                CLIENTS.set(ws, payload.userId);
                await sendGameState(ws);
                break;
            }

            case 'place_bet': {
                // payload: { amount, autoCashout }
                const res = await db.placeBet(
                    userId,
                    payload.amount,
                    payload.autoCashout
                );

                broadcast('bet_placed', {
                    userId,
                    bet: res.bet
                });
                break;
            }

            case 'cashout': {
                const game = await db.getGameState();
                const result = await db.cashout(
                    userId,
                    game.multiplier
                );

                broadcast('cashout', {
                    userId,
                    result
                });
                break;
            }

            case 'ping': {
                ws.send(JSON.stringify({ type: 'pong' }));
                break;
            }
        }
    } catch (e) {
        ws.send(JSON.stringify({
            type: 'error',
            payload: String(e)
        }));
    }
}

/* ================= CONNECTION ================= */

wss.on('connection', async (ws) => {
    ws.on('message', (msg) => handleMessage(ws, msg));
    ws.on('close', () => CLIENTS.delete(ws));

    ws.send(JSON.stringify({
        type: 'connected',
        payload: 'Welcome'
    }));
});

/* ================= LIVE MULTIPLIER STREAM ================= */

setInterval(async () => {
    const game = await db.getGameState();
    if (!game) return;

    broadcast('tick', {
        status: game.status,
        multiplier: game.multiplier,
        crashPoint: game.status === 'crashed' ? game.crashPoint : null,
        bets: game.bets
    });
}, 100);

/* ================= START ================= */

server.listen(PORT, () => {
    console.log(`WebSocket server running on :${PORT}`);
});

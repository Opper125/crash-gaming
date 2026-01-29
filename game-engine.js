/* =========================================================
   CRASH GAME – GLOBAL GAME ENGINE
   Always running, server authoritative
   ========================================================= */

import './api.js'; // ensures window.db & CONFIG are loaded

const db = window.db;
const CONFIG = window.CONFIG;

/* ================= ENGINE STATE ================= */
const ENGINE = {
    loop: null,
    tickRate: 100,          // ms
    multiplier: 1.0,
    speed: 0.01,
    lastTick: Date.now(),
    state: 'idle'           // betting | running | crashed
};

/* ================= UTILS ================= */
const now = () => Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ================= CRASH MATH ================= */
function nextMultiplier(dt) {
    // Smooth acceleration
    ENGINE.speed += 0.0005;
    ENGINE.multiplier += ENGINE.speed * (dt / 100);
}

function generateCrashPoint() {
    const r = Math.random();
    const edge = CONFIG.HOUSE_EDGE || 0.03;

    if (r < edge) return 1.0;

    const x = Math.floor((0.99 / (1 - r)) * 100) / 100;
    return Math.max(1, Math.min(1000, x));
}

/* ================= GAME FLOW ================= */

async function startNewGame() {
    ENGINE.state = 'betting';
    ENGINE.multiplier = 1.0;
    ENGINE.speed = 0.01;
    ENGINE.lastTick = now();

    const crashPoint = generateCrashPoint();

    await db.updateGame({
        id: 'G_' + now(),
        status: 'betting',
        bets: [],
        crashPoint,
        multiplier: 1,
        startedAt: null,
        bettingEndsAt: now() + CONFIG.BETTING_TIME * 1000
    });

    console.log('[ENGINE] New game created', crashPoint);
}

async function startRunning(game) {
    ENGINE.state = 'running';
    ENGINE.lastTick = now();

    await db.updateGame({
        status: 'running',
        startedAt: now()
    });

    console.log('[ENGINE] Game running');
}

async function crashGame(game) {
    ENGINE.state = 'crashed';

    await db.endGame(game.crashPoint);

    console.log('[ENGINE] Game crashed at', game.crashPoint);

    await sleep(CONFIG.CRASH_DELAY * 1000);
    await startNewGame();
}

/* ================= MAIN LOOP ================= */

async function tick() {
    const game = await db.getGameState();
    const t = now();
    const dt = t - ENGINE.lastTick;
    ENGINE.lastTick = t;

    // Betting phase
    if (game.status === 'betting') {
        ENGINE.state = 'betting';
        ENGINE.multiplier = 1.0;
        ENGINE.speed = 0.01;

        if (t >= game.bettingEndsAt) {
            await startRunning(game);
        }
        return;
    }

    // Running phase
    if (game.status === 'running') {
        ENGINE.state = 'running';

        nextMultiplier(dt);

        await db.updateGame({
            multiplier: Number(ENGINE.multiplier.toFixed(2))
        });

        // Auto cashout
        for (const bet of game.bets || []) {
            if (
                !bet.cashedOut &&
                bet.autoCashout &&
                ENGINE.multiplier >= bet.autoCashout
            ) {
                try {
                    await db.cashout(bet.oderId, bet.autoCashout);
                } catch {}
            }
        }

        if (ENGINE.multiplier >= game.crashPoint) {
            await crashGame(game);
        }
        return;
    }
}

/* ================= ENGINE START ================= */

async function boot() {
    console.log('[ENGINE] Booting...');

    let game = await db.getGameState();
    if (!game || !game.id) {
        await startNewGame();
    }

    ENGINE.loop = setInterval(async () => {
        try {
            await tick();
        } catch (e) {
            console.error('[ENGINE ERROR]', e);
        }
    }, ENGINE.tickRate);
}

boot();

/* ================= EXPORT ================= */
window.GAME_ENGINE = ENGINE;

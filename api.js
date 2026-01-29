/* =========================================================
   CRASH GAME – MASTER GAME ENGINE (api.js)
   Website + Telegram Bot + WebSocket Ready
   ========================================================= */

/* ================= CONFIG ================= */
const CONFIG = {
    JSONBIN_API_KEY: '$2a$10$kY8eIjkqtndEmBQXGPOdi.40EhjkTsexeMxLVHiHD5xDj0u6fISi6',
    JSONBIN_BIN_ID: '6977e4b7d0ea881f40882e29',

    BOT_TOKEN: '8515201517:AAFZLevC3fupA8pCbhF_8F3vlxsm31UnnXI',
    BOT_USERNAME: 'crash_gambaimbot',
    ADMIN_ID: '1538232799',

    HOUSE_EDGE: 0.03,
    BETTING_TIME: 10_000,        // 10s betting
    TICK_RATE: 100,              // ms
    BASE_SPEED: 0.02,            // start slow
    SPEED_INCREMENT: 0.0008,     // acceleration
    MAX_X: 1000
};

/* ================= GLOBAL GAME CLOCK ================= */
const GAME_CLOCK = {
    interval: null,
    lastTick: Date.now()
};

/* ================= UTIL ================= */
const now = () => Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ================= DATABASE ================= */
class Database {
    constructor() {
        this.baseUrl = 'https://api.jsonbin.io/v3/b';
        this.cache = null;
        this.cacheTime = 0;
    }

    headers() {
        return {
            'Content-Type': 'application/json',
            'X-Master-Key': CONFIG.JSONBIN_API_KEY,
            'X-Bin-Meta': 'false'
        };
    }

    async fetch(force = false) {
        if (!force && this.cache && now() - this.cacheTime < 1000) {
            return this.cache;
        }
        const res = await fetch(`${this.baseUrl}/${CONFIG.JSONBIN_BIN_ID}/latest`, {
            headers: this.headers()
        });
        const data = await res.json();
        this.cache = data;
        this.cacheTime = now();
        return data;
    }

    async save(data) {
        await fetch(`${this.baseUrl}/${CONFIG.JSONBIN_BIN_ID}`, {
            method: 'PUT',
            headers: this.headers(),
            body: JSON.stringify(data)
        });
        this.cache = data;
        this.cacheTime = now();
    }
}

const db = new Database();

/* ================= GAME ENGINE ================= */
class CrashEngine {
    constructor() {
        this.running = false;
    }

    async init() {
        const data = await db.fetch(true);
        if (!data.game) {
            data.game = this.newGame();
            await db.save(data);
        }
        this.loop();
    }

    newGame() {
        const r = Math.random();
        const crash =
            r < CONFIG.HOUSE_EDGE
                ? 1.0
                : Math.min(
                      CONFIG.MAX_X,
                      Math.floor((0.99 / (1 - r)) * 100) / 100
                  );

        return {
            id: 'G_' + now(),
            status: 'betting',
            startAt: now() + CONFIG.BETTING_TIME,
            crashPoint: crash,
            multiplier: 1.0,
            speed: CONFIG.BASE_SPEED,
            bets: [],
            history: []
        };
    }

    async placeBet(userId, bet) {
        const data = await db.fetch(true);
        const game = data.game;

        if (game.status !== 'betting') throw 'BETTING_CLOSED';
        if (game.bets.find(b => b.userId === userId)) throw 'ALREADY_BET';

        game.bets.push({
            userId,
            amount: bet.amount,
            asset: bet.asset || 'TON', // TON | GIFT
            giftId: bet.giftId || null,
            autoCashout: bet.autoCashout || null,
            cashedOut: false
        });

        await db.save(data);
        return true;
    }

    async cashout(userId) {
        const data = await db.fetch(true);
        const game = data.game;
        if (game.status !== 'running') throw 'NOT_RUNNING';

        const bet = game.bets.find(
            b => b.userId === userId && !b.cashedOut
        );
        if (!bet) throw 'NO_BET';

        bet.cashedOut = true;
        bet.cashoutAt = game.multiplier;
        bet.win = bet.amount * game.multiplier;

        await db.save(data);
        return bet;
    }

    async tick() {
        const data = await db.fetch(true);
        const game = data.game;

        if (game.status === 'betting') {
            if (now() >= game.startAt) {
                game.status = 'running';
                game.startedAt = now();
            }
        }

        if (game.status === 'running') {
            game.speed += CONFIG.SPEED_INCREMENT;
            game.multiplier += game.speed;

            // auto cashout
            for (const bet of game.bets) {
                if (
                    !bet.cashedOut &&
                    bet.autoCashout &&
                    game.multiplier >= bet.autoCashout
                ) {
                    bet.cashedOut = true;
                    bet.cashoutAt = bet.autoCashout;
                    bet.win = bet.amount * bet.autoCashout;
                }
            }

            if (game.multiplier >= game.crashPoint) {
                game.status = 'crashed';
                game.crashedAt = game.crashPoint;

                for (const bet of game.bets) {
                    if (!bet.cashedOut) {
                        bet.win = 0;
                        bet.lost = true;
                        // Gift loss → owner transfer hook here
                    }
                }
            }
        }

        if (game.status === 'crashed') {
            data.history = data.history || [];
            data.history.unshift(game);
            data.game = this.newGame();
        }

        await db.save(data);
    }

    loop() {
        if (this.running) return;
        this.running = true;

        GAME_CLOCK.interval = setInterval(async () => {
            try {
                await this.tick();
            } catch (e) {
                console.error('ENGINE ERROR', e);
            }
        }, CONFIG.TICK_RATE);
    }
}

/* ================= START ================= */
const ENGINE = new CrashEngine();
ENGINE.init();

/* ================= EXPORT ================= */
window.CRASH_ENGINE = ENGINE;
window.CRASH_DB = db;
window.CONFIG = CONFIG;

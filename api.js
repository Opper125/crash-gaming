// ===== CONFIGURATION - BIN_ID ထည့်ပါ! =====
const CONFIG = {
    // JSONBin.io
    JSONBIN_API_KEY: '$2a$10$kY8eIjkqtndEmBQXGPOdi.40EhjkTsexeMxLVHiHD5xDj0u6fISi6',
    JSONBIN_BIN_ID: '6977e4b7d0ea881f40882e29', // ← ဒီမှာ BIN_ID ထည့်ပါ!
    
    // Telegram
    BOT_TOKEN: '8515201517:AAFZLevC3fupA8pCbhF_8F3vlxsm31UnnXI',
    BOT_USERNAME: 'crash_gambaimbot',
    ADMIN_ID: '1538232799',
    CHANNEL_ID: '-1003446073632',
    
    // TON
    TON_WALLET: 'UQCVA9Y95Rh59Nz_kSjbxCCNogCsL5oog2dhQKrGvoKxHfdn',

    // TON Center / TonAPI (optional, used for auto-verification)
    // If you have a key, set it here for higher rate limits.
    TONCENTER_API_KEY: 'AF7WI32MFLZONNIAAAAKMYFEWR4TQ6T3YNECXQTJE53QABLMIAHOKK6OOQT4DKL5DVWKM3Y',

    // Gift (Telegram Collectible / TON NFT) deposit settings
    // Owner receives NFT to this TON wallet (same wallet can be used)
    GIFT_OWNER_WALLET: 'UQCVA9Y95Rh59Nz_kSjbxCCNogCsL5oog2dhQKrGvoKxHfdn',
    // Default credit if price cannot be detected (TON)
    GIFT_FALLBACK_CREDIT: 1,
    
    // Game
    MIN_BET: 0.1,
    MAX_BET: 100,
    MIN_WITHDRAW: 1,
    HOUSE_EDGE: 0.03,
    BETTING_TIME: 10,
    CRASH_DELAY: 3
};

// Config check
function isConfigured() {
    return CONFIG.JSONBIN_BIN_ID && CONFIG.JSONBIN_BIN_ID.length > 10;
}

// ===== Database Class =====
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
        if (!isConfigured()) {
            console.error('BIN_ID not configured!');
            return this.defaultDB();
        }

        if (!force && this.cache && (Date.now() - this.cacheTime) < 3000) {
            return this.cache;
        }

        try {
            const res = await fetch(`${this.baseUrl}/${CONFIG.JSONBIN_BIN_ID}/latest`, {
                headers: this.headers()
            });
            if (!res.ok) throw new Error('Fetch failed');
            const data = await res.json();
            this.cache = data;
            this.cacheTime = Date.now();
            return data;
        } catch (e) {
            console.error('DB Error:', e);
            return this.cache || this.defaultDB();
        }
    }

    async save(data) {
        if (!isConfigured()) return false;
        try {
            await fetch(`${this.baseUrl}/${CONFIG.JSONBIN_BIN_ID}`, {
                method: 'PUT',
                headers: this.headers(),
                body: JSON.stringify(data)
            });
            this.cache = data;
            this.cacheTime = Date.now();
            return true;
        } catch (e) {
            console.error('Save Error:', e);
            return false;
        }
    }

    defaultDB() {
        return {
            users: {},
            gameState: { id: null, status: 'waiting', bets: [], crashPoint: null, multiplier: 1 },
            gameHistory: [],
            withdrawals: [],

            // Gift/NFT deposits
            giftDeposits: [],
            giftPriceTable: {
                // You can fine-tune later in Admin (or directly in JSONBin)
                // key can be collection address or a known NFT item address
                // Example:
                // "EQC...collection": 5,
                // "EQC...nftItem": 2
            },
            processedNftTransfers: {},

            settings: CONFIG,
            stats: { totalGames: 0, totalBets: 0, totalWagered: 0 }
        };
    }

    // User methods
    async getUser(oderId) {
        const db = await this.fetch();
        return db.users?.[oderId] || null;
    }

    async createUser(oderId, data) {
        const db = await this.fetch(true);
        if (!db.users) db.users = {};
        
        if (!db.users[oderId]) {
            db.users[oderId] = {
                oderId,
                odername: data.firstName || 'Player',
                odername: data.firstName || 'Player',
                username: data.username || '',
                balance: 0,
                totalWagered: 0,
                biggestWin: 0,
                gamesPlayed: 0,
                wins: 0,
                losses: 0,
                betHistory: [],
                transactions: [],
                createdAt: Date.now(),
                lastActive: Date.now()
            };
            await this.save(db);
        } else {
            db.users[oderId].lastActive = Date.now();
            await this.save(db);
        }
        return db.users[oderId];
    }

    async updateBalance(oderId, amount, op = 'add') {
        const db = await this.fetch(true);
        const user = db.users?.[oderId];
        if (!user) throw new Error('User not found');
        
        if (op === 'add') user.balance = (user.balance || 0) + amount;
        else if (op === 'subtract') {
            if ((user.balance || 0) < amount) throw new Error('Insufficient balance');
            user.balance -= amount;
        } else if (op === 'set') user.balance = amount;
        
        await this.save(db);
        return user.balance;
    }

    // Game methods
    async getGameState() {
        const db = await this.fetch();
        return db.gameState || { status: 'waiting', bets: [] };
    }

    async updateGame(data) {
        const db = await this.fetch(true);
        db.gameState = { ...db.gameState, ...data };
        await this.save(db);
        return db.gameState;
    }

    async placeBet(oderId, amount, autoCashout) {
        const db = await this.fetch(true);
        const user = db.users?.[oderId];
        
        if (!user) throw new Error('User not found');
        if ((user.balance || 0) < amount) throw new Error('Insufficient balance');
        if (db.gameState?.status !== 'betting') throw new Error('Betting closed');
        if (db.gameState.bets?.find(b => b.oderId === oderId)) throw new Error('Already bet');
        
        user.balance -= amount;
        user.totalWagered = (user.totalWagered || 0) + amount;
        
        const bet = {
            oderId,
            username: user.odername || 'Player',
            amount,
            autoCashout,
            autoCashout,
            cashedOut: false,
            multiplier: null,
            profit: 0,
            time: Date.now()
        };
        
        if (!db.gameState.bets) db.gameState.bets = [];
        db.gameState.bets.push(bet);
        
        db.stats = db.stats || {};
        db.stats.totalBets = (db.stats.totalBets || 0) + 1;
        db.stats.totalWagered = (db.stats.totalWagered || 0) + amount;
        
        await this.save(db);
        return { success: true, balance: user.balance, bet };
    }

    async cashout(oderId, multiplier) {
        const db = await this.fetch(true);
        const bet = db.gameState?.bets?.find(b => b.oderId === oderId && !b.cashedOut);
        
        if (!bet) throw new Error('No active bet');
        if (db.gameState?.status !== 'running') throw new Error('Game not running');
        
        const profit = (bet.amount * multiplier) - bet.amount;
        const total = bet.amount + profit;
        
        bet.cashedOut = true;
        bet.multiplier = multiplier;
        bet.profit = profit;
        
        const user = db.users[oderId];
        if (user) {
            user.balance = (user.balance || 0) + total;
            user.wins = (user.wins || 0) + 1;
            if (profit > (user.biggestWin || 0)) user.biggestWin = profit;
            
            if (!user.betHistory) user.betHistory = [];
            user.betHistory.unshift({
                gameId: db.gameState.id,
                amount: bet.amount,
                multiplier,
                profit,
                result: 'win',
                time: Date.now()
            });
            if (user.betHistory.length > 50) user.betHistory = user.betHistory.slice(0, 50);
        }
        
        await this.save(db);
        return { success: true, profit, total, balance: user?.balance || 0 };
    }

    async endGame(crashPoint) {
        const db = await this.fetch(true);
        
        for (const bet of (db.gameState?.bets || [])) {
            if (!bet.cashedOut) {
                bet.multiplier = crashPoint;
                bet.profit = -bet.amount;
                
                const user = db.users[bet.oderId];
                if (user) {
                    user.losses = (user.losses || 0) + 1;
                    if (!user.betHistory) user.betHistory = [];
                    user.betHistory.unshift({
                        gameId: db.gameState.id,
                        amount: bet.amount,
                        multiplier: crashPoint,
                        profit: -bet.amount,
                        result: 'loss',
                        time: Date.now()
                    });
                    if (user.betHistory.length > 50) user.betHistory = user.betHistory.slice(0, 50);
                }
            }
            
            const user = db.users[bet.oderId];
            if (user) user.gamesPlayed = (user.gamesPlayed || 0) + 1;
        }
        
        if (!db.gameHistory) db.gameHistory = [];
        db.gameHistory.unshift({
            id: db.gameState.id,
            crashPoint,
            bets: db.gameState.bets?.length || 0,
            time: Date.now()
        });
        if (db.gameHistory.length > 50) db.gameHistory = db.gameHistory.slice(0, 50);
        
        db.stats = db.stats || {};
        db.stats.totalGames = (db.stats.totalGames || 0) + 1;
        
        await this.save(db);
        return crashPoint;
    }

    async newGame() {
        const db = await this.fetch(true);
        
        const houseEdge = CONFIG.HOUSE_EDGE;
        const r = Math.random();
        let crash = r < houseEdge ? 1.00 : Math.max(1, Math.min(1000, Math.floor((0.99 / (1 - r)) * 100) / 100));
        
        db.gameState = {
            id: 'G_' + Date.now(),
            status: 'betting',
            bets: [],
            crashPoint: crash,
            multiplier: 1
        };
        
        await this.save(db);
        return db.gameState;
    }

    async getHistory(limit = 20) {
        const db = await this.fetch();
        return (db.gameHistory || []).slice(0, limit);
    }

    // Withdrawal
    async withdraw(oderId, amount, address) {
        const db = await this.fetch(true);
        const user = db.users?.[oderId];
        
        if (!user) throw new Error('User not found');
        if (amount < CONFIG.MIN_WITHDRAW) throw new Error('Min: ' + CONFIG.MIN_WITHDRAW + ' TON');
        if ((user.balance || 0) < amount) throw new Error('Insufficient balance');
        
        user.balance -= amount;
        
        const req = {
            id: 'W_' + Date.now(),
            oderId,
            username: user.odername,
            amount,
            address,
            status: 'pending',
            createdAt: Date.now()
        };
        
        if (!db.withdrawals) db.withdrawals = [];
        db.withdrawals.push(req);
        
        if (!user.transactions) user.transactions = [];
        user.transactions.unshift({ type: 'withdraw', amount: -amount, status: 'pending', id: req.id, time: Date.now() });
        
        await this.save(db);
        return req;
    }

    async processWithdraw(id, approved) {
        const db = await this.fetch(true);
        const req = db.withdrawals?.find(w => w.id === id);
        if (!req) throw new Error('Not found');
        
        req.status = approved ? 'approved' : 'rejected';
        req.processedAt = Date.now();
        
        if (!approved && db.users[req.oderId]) {
            db.users[req.oderId].balance += req.amount;
        }
        
        await this.save(db);
        return req;
    }

    async getPendingWithdrawals() {
        const db = await this.fetch();
        return (db.withdrawals || []).filter(w => w.status === 'pending');
    }

    async getAllUsers() {
        const db = await this.fetch();
        return db.users || {};
    }

    async setBalance(oderId, amount) {
        const db = await this.fetch(true);
        if (db.users?.[oderId]) {
            db.users[oderId].balance = amount;
            await this.save(db);
        }
        return db.users?.[oderId];
    }

    async getStats() {
        const db = await this.fetch();
        return db.stats || {};
    }

    // ===== Gift / NFT Deposit =====
    _giftDepositId(oderId) {
        return `GF_${oderId}_${Date.now()}`;
    }

    async createGiftDepositRequest(oderId) {
        const db = await this.fetch(true);
        if (!db.giftDeposits) db.giftDeposits = [];

        const req = {
            id: this._giftDepositId(oderId),
            oderId,
            status: 'pending',
            createdAt: Date.now(),
            creditTon: 0,
            nft: null
        };
        db.giftDeposits.unshift(req);
        if (db.giftDeposits.length > 200) db.giftDeposits = db.giftDeposits.slice(0, 200);
        await this.save(db);
        return req;
    }

    async getGiftDeposits(oderId) {
        const db = await this.fetch();
        const list = db.giftDeposits || [];
        return oderId ? list.filter(x => x.oderId === oderId) : list;
    }

    async _toncenterListNftTransfers(limit = 30) {
        // Toncenter v3 endpoint (public). If key is empty, it still works but might be rate-limited.
        // Docs: https://docs.ton.org/ecosystem/api/toncenter/v3/nfts/list-nft-transfers
        const base = 'https://toncenter.com/api/v3/nfts/transfers';
        const params = new URLSearchParams({
            limit: String(limit),
            // We only care about transfers where new owner = our owner wallet
            new_owner: CONFIG.GIFT_OWNER_WALLET
        });
        if (CONFIG.TONCENTER_API_KEY) params.set('api_key', CONFIG.TONCENTER_API_KEY);

        const url = `${base}?${params.toString()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('TONCenter API error');
        return await res.json();
    }

    _extractGiftDepositIdFromTransfer(t) {
        // We try to parse text comment from decoded_forward_payload
        // Some wallets put it in decoded_forward_payload.comment
        const c = t?.decoded_forward_payload?.comment || '';
        if (!c) return null;
        const m = c.match(/GF_[^\s]+/);
        return m ? m[0] : null;
    }

    _creditFromTransfer(db, t) {
        // Determine credit amount from price table
        const table = db.giftPriceTable || {};
        const nftItem = t.nft_address;
        const coll = t.nft_collection;
        if (nftItem && table[nftItem]) return Number(table[nftItem]);
        if (coll && table[coll]) return Number(table[coll]);
        return Number(CONFIG.GIFT_FALLBACK_CREDIT || 1);
    }

    async verifyGiftDeposit(oderId) {
        const db = await this.fetch(true);
        if (!db.giftDeposits) db.giftDeposits = [];
        if (!db.processedNftTransfers) db.processedNftTransfers = {};

        // Find latest pending request of this user
        const req = db.giftDeposits.find(x => x.oderId === oderId && x.status === 'pending');
        if (!req) throw new Error('No pending gift request');

        // Pull latest transfers
        const data = await this._toncenterListNftTransfers(50);
        const list = data.nft_transfers || [];

        // Match by GF_... id embedded in comment
        const match = list.find(t => {
            const id = this._extractGiftDepositIdFromTransfer(t);
            if (!id || id !== req.id) return false;
            // Prevent double credit by tx hash/lt
            const k = `${t.transaction_hash}_${t.transaction_lt}`;
            if (db.processedNftTransfers[k]) return false;
            return true;
        });

        if (!match) {
            return { ok: false, message: 'Not found yet. Try again in 10-30 seconds.' };
        }

        const credit = this._creditFromTransfer(db, match);

        // Credit user
        const user = db.users?.[oderId];
        if (!user) throw new Error('User not found');
        user.balance = (user.balance || 0) + credit;

        // Log transaction
        if (!user.transactions) user.transactions = [];
        user.transactions.unshift({
            type: 'gift',
            amount: credit,
            status: 'confirmed',
            id: req.id,
            time: Date.now(),
            meta: {
                nft_address: match.nft_address,
                nft_collection: match.nft_collection,
                old_owner: match.old_owner,
                new_owner: match.new_owner,
                tx_hash: match.transaction_hash,
                tx_lt: match.transaction_lt
            }
        });

        // Mark request
        req.status = 'confirmed';
        req.confirmedAt = Date.now();
        req.creditTon = credit;
        req.nft = {
            nft_address: match.nft_address,
            nft_collection: match.nft_collection,
            tx_hash: match.transaction_hash,
            tx_lt: match.transaction_lt
        };

        // Mark transfer processed
        const k = `${match.transaction_hash}_${match.transaction_lt}`;
        db.processedNftTransfers[k] = true;

        await this.save(db);
        return { ok: true, credit };
    }
}

const db = new Database();
window.db = db;
window.CONFIG = CONFIG;
window.isConfigured = isConfigured;

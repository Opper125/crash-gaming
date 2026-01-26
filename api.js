// ===== Configuration =====
const CONFIG = {
    // JSONBin.io - Setup.html မှာ ရယူပြီး ဒီမှာထည့်ပါ
    JSONBIN_API_KEY: '', // ← setup.html ကနေ ရယူပါ
    JSONBIN_BIN_ID: '',  // ← setup.html ကနေ ရယူပါ
    
    // Your Telegram & Wallet Info
    ADMIN_TELEGRAM_ID: '1538232799',
    BOT_USERNAME: 'crash_gambaimbot', // သင့် bot username ထည့်ပါ
    TON_WALLET: 'UQCVA9Y95Rh59Nz_kSjbxCCNogCsL5oog2dhQKrGvoKxHfdn',
    CHANNEL_ID: '-1003446073632',
    
    // Game Settings
    MIN_BET: 0.1,
    MAX_BET: 100,
    MIN_WITHDRAW: 1,
    HOUSE_EDGE: 0.03,
    BETTING_TIME: 10,
    CRASH_DELAY: 3,
    
    // TON Price (for USD display)
    TON_PRICE_USD: 5.50
};

// Check if configured
function isConfigured() {
    return CONFIG.JSONBIN_API_KEY && CONFIG.JSONBIN_BIN_ID;
}

// ===== Database Class =====
class Database {
    constructor() {
        this.baseUrl = 'https://api.jsonbin.io/v3/b';
        this.cache = null;
        this.cacheTime = 0;
        this.cacheExpiry = 3000; // 3 seconds
        this.syncInterval = null;
    }

    // Headers for API
    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'X-Master-Key': CONFIG.JSONBIN_API_KEY,
            'X-Bin-Meta': 'false'
        };
    }

    // Fetch database
    async fetch(force = false) {
        if (!isConfigured()) {
            console.warn('Database not configured');
            return this.getDefaultDB();
        }

        // Use cache if valid
        if (!force && this.cache && (Date.now() - this.cacheTime) < this.cacheExpiry) {
            return this.cache;
        }

        try {
            const response = await fetch(`${this.baseUrl}/${CONFIG.JSONBIN_BIN_ID}/latest`, {
                method: 'GET',
                headers: this.getHeaders()
            });

            if (!response.ok) throw new Error('Fetch failed');

            const data = await response.json();
            this.cache = data;
            this.cacheTime = Date.now();
            return data;
        } catch (error) {
            console.error('DB Fetch Error:', error);
            return this.cache || this.getDefaultDB();
        }
    }

    // Update database
    async update(data) {
        if (!isConfigured()) {
            console.warn('Database not configured');
            return false;
        }

        try {
            const response = await fetch(`${this.baseUrl}/${CONFIG.JSONBIN_BIN_ID}`, {
                method: 'PUT',
                headers: this.getHeaders(),
                body: JSON.stringify(data)
            });

            if (!response.ok) throw new Error('Update failed');

            this.cache = data;
            this.cacheTime = Date.now();
            return true;
        } catch (error) {
            console.error('DB Update Error:', error);
            return false;
        }
    }

    // Default database structure
    getDefaultDB() {
        return {
            users: {},
            gameState: {
                id: null,
                status: 'waiting',
                bets: [],
                crashPoint: null,
                startTime: null,
                multiplier: 1.00
            },
            gameHistory: [],
            withdrawals: [],
            settings: {
                minBet: CONFIG.MIN_BET,
                maxBet: CONFIG.MAX_BET,
                minWithdraw: CONFIG.MIN_WITHDRAW,
                houseEdge: CONFIG.HOUSE_EDGE,
                bettingTime: CONFIG.BETTING_TIME,
                adminId: CONFIG.ADMIN_TELEGRAM_ID,
                tonWallet: CONFIG.TON_WALLET,
                binId: CONFIG.JSONBIN_BIN_ID
            },
            stats: {
                totalGames: 0,
                totalBets: 0,
                totalWagered: 0,
                totalPayout: 0
            }
        };
    }

    // ===== User Methods =====
    
    async getUser(oderId) {
        const db = await this.fetch();
        return db.users?.[oderId] || null;
    }

    async createUser(oderId, userData) {
        const db = await this.fetch(true);
        
        if (!db.users) db.users = {};
        
        if (!db.users[oderId]) {
            db.users[oderId] = {
                oderId: oderId,
                odername: userData.username || 'Player',
                firstName: userData.firstName || '',
                lastName: userData.lastName || '',
                username: userData.telegramUsername || '',
                photoUrl: userData.photoUrl || '',
                balance: 0,
                totalWagered: 0,
                totalProfit: 0,
                biggestWin: 0,
                gamesPlayed: 0,
                wins: 0,
                losses: 0,
                betHistory: [],
                transactions: [],
                createdAt: Date.now(),
                lastActive: Date.now()
            };
            await this.update(db);
        } else {
            // Update last active
            db.users[oderId].lastActive = Date.now();
            if (userData.photoUrl) db.users[oderId].photoUrl = userData.photoUrl;
            await this.update(db);
        }
        
        return db.users[oderId];
    }

    async updateUserBalance(oderId, amount, operation = 'add') {
        const db = await this.fetch(true);
        const user = db.users?.[oderId];
        
        if (!user) throw new Error('User not found');
        
        const oldBalance = user.balance || 0;
        
        if (operation === 'add') {
            user.balance = oldBalance + amount;
        } else if (operation === 'subtract') {
            if (oldBalance < amount) throw new Error('Insufficient balance');
            user.balance = oldBalance - amount;
        } else if (operation === 'set') {
            user.balance = amount;
        }
        
        await this.update(db);
        return user.balance;
    }

    // ===== Game Methods =====
    
    async getGameState() {
        const db = await this.fetch();
        return db.gameState || { status: 'waiting', bets: [] };
    }

    async updateGameState(gameData) {
        const db = await this.fetch(true);
        db.gameState = { ...db.gameState, ...gameData };
        await this.update(db);
        return db.gameState;
    }

    async placeBet(oderId, amount, autoCashout) {
        const db = await this.fetch(true);
        const user = db.users?.[oderId];
        
        if (!user) throw new Error('User not found');
        if ((user.balance || 0) < amount) throw new Error('Insufficient balance');
        if (db.gameState?.status !== 'betting') throw new Error('Betting is closed');
        
        // Check if already bet
        const existingBet = db.gameState.bets?.find(b => b visually === oderId);
        if (existingBet) throw new Error('Already placed a bet');
        
        // Deduct balance
        user.balance -= amount;
        user.totalWagered = (user.totalWagered || 0) + amount;
        
        // Add bet
        if (!db.gameState.bets) db.gameState.bets = [];
        
        const bet = {
            oderId: oderId,
            username: user.odername || user.firstName || 'Player',
            photoUrl: user.photoUrl || '',
            amount: amount,
            autoCashout: autoCashout,
            cashedOut: false,
            cashoutMultiplier: null,
            profit: 0,
            timestamp: Date.now()
        };
        
        db.gameState.bets.push(bet);
        
        // Update stats
        db.stats = db.stats || {};
        db.stats.totalBets = (db.stats.totalBets || 0) + 1;
        db.stats.totalWagered = (db.stats.totalWagered || 0) + amount;
        
        await this.update(db);
        
        return { success: true, balance: user.balance, bet };
    }

    async cashoutBet(oderId, multiplier) {
        const db = await this.fetch(true);
        const bet = db.gameState?.bets?.find(b => b.oderId === oderId && !b.cashedOut);
        
        if (!bet) throw new Error('No active bet found');
        if (db.gameState?.status !== 'running') throw new Error('Game not running');
        
        const profit = (bet.amount * multiplier) - bet.amount;
        const totalReturn = bet.amount + profit;
        
        bet.cashedOut = true;
        bet.cashoutMultiplier = multiplier;
        bet.profit = profit;
        
        // Add winnings to user
        const user = db.users[oderId];
        if (user) {
            user.balance = (user.balance || 0) + totalReturn;
            user.wins = (user.wins || 0) + 1;
            user.totalProfit = (user.totalProfit || 0) + profit;
            
            if (profit > (user.biggestWin || 0)) {
                user.biggestWin = profit;
            }
            
            // Add to bet history
            if (!user.betHistory) user.betHistory = [];
            user.betHistory.unshift({
                gameId: db.gameState.id,
                amount: bet.amount,
                multiplier: multiplier,
                profit: profit,
                result: 'win',
                timestamp: Date.now()
            });
            
            // Keep last 100
            if (user.betHistory.length > 100) {
                user.betHistory = user.betHistory.slice(0, 100);
            }
        }
        
        // Update stats
        db.stats = db.stats || {};
        db.stats.totalPayout = (db.stats.totalPayout || 0) + totalReturn;
        
        await this.update(db);
        
        return { success: true, profit, totalReturn, balance: user?.balance || 0 };
    }

    async endGame(crashPoint) {
        const db = await this.fetch(true);
        
        // Process all uncashed bets as losses
        for (const bet of (db.gameState?.bets || [])) {
            if (!bet.cashedOut) {
                bet.cashoutMultiplier = crashPoint;
                bet.profit = -bet.amount;
                
                const user = db.users[bet.oderId];
                if (user) {
                    user.losses = (user.losses || 0) + 1;
                    user.totalProfit = (user.totalProfit || 0) - bet.amount;
                    
                    if (!user.betHistory) user.betHistory = [];
                    user.betHistory.unshift({
                        gameId: db.gameState.id,
                        amount: bet.amount,
                        multiplier: crashPoint,
                        profit: -bet.amount,
                        result: 'loss',
                        timestamp: Date.now()
                    });
                    
                    if (user.betHistory.length > 100) {
                        user.betHistory = user.betHistory.slice(0, 100);
                    }
                }
            }
            
            // Update games played
            const user = db.users[bet.oderId];
            if (user) {
                user.gamesPlayed = (user.gamesPlayed || 0) + 1;
            }
        }
        
        // Save to history
        if (!db.gameHistory) db.gameHistory = [];
        db.gameHistory.unshift({
            id: db.gameState.id,
            crashPoint: crashPoint,
            betsCount: db.gameState.bets?.length || 0,
            totalWagered: db.gameState.bets?.reduce((sum, b) => sum + b.amount, 0) || 0,
            timestamp: Date.now()
        });
        
        // Keep last 100 games
        if (db.gameHistory.length > 100) {
            db.gameHistory = db.gameHistory.slice(0, 100);
        }
        
        // Update stats
        db.stats = db.stats || {};
        db.stats.totalGames = (db.stats.totalGames || 0) + 1;
        
        await this.update(db);
        
        return crashPoint;
    }

    async startNewGame() {
        const db = await this.fetch(true);
        
        const crashPoint = this.generateCrashPoint();
        
        db.gameState = {
            id: `GAME_${Date.now()}`,
            status: 'betting',
            bets: [],
            crashPoint: crashPoint,
            startTime: null,
            multiplier: 1.00
        };
        
        await this.update(db);
        
        return db.gameState;
    }

    generateCrashPoint() {
        const houseEdge = CONFIG.HOUSE_EDGE;
        const random = Math.random();
        
        // House edge - sometimes instant crash
        if (random < houseEdge) {
            return 1.00;
        }
        
        // Exponential distribution
        const crash = 0.99 / (1 - random);
        return Math.max(1.00, Math.min(1000, Math.floor(crash * 100) / 100));
    }

    async getGameHistory(limit = 20) {
        const db = await this.fetch();
        return (db.gameHistory || []).slice(0, limit);
    }

    // ===== Withdrawal Methods =====
    
    async requestWithdrawal(oderId, amount, walletAddress) {
        const db = await this.fetch(true);
        const user = db.users?.[oderId];
        
        if (!user) throw new Error('User not found');
        if (amount < CONFIG.MIN_WITHDRAW) throw new Error(`Minimum withdrawal is ${CONFIG.MIN_WITHDRAW} TON`);
        if ((user.balance || 0) < amount) throw new Error('Insufficient balance');
        
        // Deduct balance
        user.balance -= amount;
        
        // Create request
        const request = {
            id: `WD_${Date.now()}`,
            oderId: oderId,
            username: user.odername || user.firstName,
            amount: amount,
            walletAddress: walletAddress,
            status: 'pending',
            createdAt: Date.now(),
            processedAt: null
        };
        
        if (!db.withdrawals) db.withdrawals = [];
        db.withdrawals.push(request);
        
        // Add to transactions
        if (!user.transactions) user.transactions = [];
        user.transactions.unshift({
            type: 'withdrawal',
            amount: -amount,
            status: 'pending',
            id: request.id,
            timestamp: Date.now()
        });
        
        await this.update(db);
        
        return request;
    }

    async processWithdrawal(id, approved) {
        const db = await this.fetch(true);
        const request = db.withdrawals?.find(w => w.id === id);
        
        if (!request) throw new Error('Withdrawal not found');
        
        request.status = approved ? 'approved' : 'rejected';
        request.processedAt = Date.now();
        
        // If rejected, refund
        if (!approved) {
            const user = db.users[request.oderId];
            if (user) {
                user.balance = (user.balance || 0) + request.amount;
            }
        }
        
        // Update transaction status
        const user = db.users[request.oderId];
        if (user?.transactions) {
            const tx = user.transactions.find(t => t.id === id);
            if (tx) tx.status = request.status;
        }
        
        await this.update(db);
        
        return request;
    }

    async getPendingWithdrawals() {
        const db = await this.fetch();
        return (db.withdrawals || []).filter(w => w.status === 'pending');
    }

    // ===== Deposit Methods =====
    
    async addDeposit(oderId, amount, source = 'manual') {
        const db = await this.fetch(true);
        const user = db.users?.[oderId];
        
        if (!user) throw new Error('User not found');
        
        user.balance = (user.balance || 0) + amount;
        
        if (!user.transactions) user.transactions = [];
        user.transactions.unshift({
            type: 'deposit',
            amount: amount,
            source: source,
            status: 'completed',
            timestamp: Date.now()
        });
        
        await this.update(db);
        
        return user.balance;
    }

    // ===== Gift Methods =====
    
    async processGiftSale(oderId, giftType, giftValue) {
        const db = await this.fetch(true);
        const user = db.users?.[oderId];
        
        if (!user) throw new Error('User not found');
        
        user.balance = (user.balance || 0) + giftValue;
        
        if (!user.transactions) user.transactions = [];
        user.transactions.unshift({
            type: 'gift_sale',
            giftType: giftType,
            amount: giftValue,
            status: 'completed',
            timestamp: Date.now()
        });
        
        await this.update(db);
        
        return user.balance;
    }

    // ===== Admin Methods =====
    
    async getAllUsers() {
        const db = await this.fetch();
        return db.users || {};
    }

    async getStats() {
        const db = await this.fetch();
        return db.stats || {};
    }

    async getSettings() {
        const db = await this.fetch();
        return db.settings || {};
    }

    async updateSettings(settings) {
        const db = await this.fetch(true);
        db.settings = { ...db.settings, ...settings };
        await this.update(db);
        return db.settings;
    }

    async setUserBalance(oderId, newBalance) {
        const db = await this.fetch(true);
        const user = db.users?.[oderId];
        
        if (!user) throw new Error('User not found');
        
        user.balance = newBalance;
        await this.update(db);
        
        return user;
    }
}

// Create global instance
const db = new Database();

// Export config check
window.isConfigured = isConfigured;
window.CONFIG = CONFIG;
window.db = db;

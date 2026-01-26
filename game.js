// ===== Crash Game Engine =====
class CrashGame {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        
        // Game State
        this.state = 'waiting'; // waiting, betting, running, crashed
        this.multiplier = 1.00;
        this.crashPoint = null;
        this.gameId = null;
        this.startTime = null;
        this.countdown = CONFIG.BETTING_TIME;
        
        // Bets
        this.bets = [];
        this.myBet = null;
        this.history = [];
        
        // Graphics
        this.path = [];
        this.stars = [];
        this.particles = [];
        
        // Timers
        this.animationId = null;
        this.gameLoopId = null;
        this.countdownId = null;
        this.syncId = null;
        
        // Sync
        this.lastSyncTime = 0;
        this.syncInterval = 2000;
    }

    // ===== Initialization =====
    
    async init() {
        this.canvas = document.getElementById('gameCanvas');
        if (!this.canvas) {
            console.error('Canvas not found');
            return;
        }
        
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        this.createStars();
        
        window.addEventListener('resize', () => this.resize());
        
        // Start render loop
        this.render();
        
        // Load initial state
        await this.syncWithServer();
        
        // Start sync loop
        this.startSyncLoop();
        
        // Load history
        await this.loadHistory();
        
        console.log('🎮 Game Engine initialized');
    }

    resize() {
        const wrapper = this.canvas.parentElement;
        const rect = wrapper.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.createStars();
    }

    createStars() {
        this.stars = [];
        const count = Math.floor((this.canvas.width * this.canvas.height) / 5000);
        
        for (let i = 0; i < count; i++) {
            this.stars.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: Math.random() * 1.5 + 0.5,
                speed: Math.random() * 0.3 + 0.1,
                alpha: Math.random() * 0.5 + 0.3
            });
        }
    }

    // ===== Sync with Server =====
    
    startSyncLoop() {
        this.syncId = setInterval(() => {
            if (this.state === 'waiting' || this.state === 'betting') {
                this.syncWithServer();
            }
        }, this.syncInterval);
    }

    async syncWithServer() {
        try {
            const gameState = await db.getGameState();
            
            if (gameState.status !== this.state) {
                this.handleStateChange(gameState);
            }
            
            // Update bets
            if (gameState.bets) {
                this.bets = gameState.bets;
                this.updateBetsList();
                
                // Find my bet
                if (window.currentUser) {
                    this.myBet = this.bets.find(b => b.oderId === window.currentUser.oderId) || null;
                }
            }
            
            this.lastSyncTime = Date.now();
        } catch (error) {
            console.error('Sync error:', error);
        }
    }

    handleStateChange(gameState) {
        const newState = gameState.status;
        
        switch (newState) {
            case 'betting':
                if (this.state !== 'betting') {
                    this.startBettingPhase(gameState);
                }
                break;
            case 'running':
                if (this.state !== 'running') {
                    this.startRunningPhase(gameState);
                }
                break;
            case 'crashed':
                if (this.state !== 'crashed') {
                    this.handleCrash(gameState.crashPoint || gameState.multiplier);
                }
                break;
        }
    }

    // ===== Game Phases =====
    
    async startBettingPhase(gameState = null) {
        // Clear previous
        clearInterval(this.gameLoopId);
        clearInterval(this.countdownId);
        
        this.state = 'betting';
        this.multiplier = 1.00;
        this.path = [];
        this.myBet = null;
        this.particles = [];
        
        if (gameState) {
            this.gameId = gameState.id;
            this.crashPoint = gameState.crashPoint;
            this.bets = gameState.bets || [];
        } else {
            // Start new game on server
            const newGame = await db.startNewGame();
            this.gameId = newGame.id;
            this.crashPoint = newGame.crashPoint;
            this.bets = [];
        }
        
        this.countdown = CONFIG.BETTING_TIME;
        
        console.log(`📢 Betting phase started. Game: ${this.gameId}`);
        
        this.updateUI();
        this.showCountdownOverlay();
        
        // Start countdown
        this.countdownId = setInterval(() => {
            this.countdown--;
            this.updateCountdownDisplay();
            
            if (this.countdown <= 0) {
                clearInterval(this.countdownId);
                this.startRunningPhase();
            }
        }, 1000);
    }

    async startRunningPhase(gameState = null) {
        clearInterval(this.countdownId);
        
        this.state = 'running';
        this.startTime = Date.now();
        this.path = [{ x: 40, y: this.canvas.height - 40 }];
        
        if (gameState) {
            this.crashPoint = gameState.crashPoint;
        }
        
        // Update server
        await db.updateGameState({ status: 'running', startTime: this.startTime });
        
        console.log(`🚀 Game running. Crash at: ${this.crashPoint}x`);
        
        this.hideCountdownOverlay();
        this.updateUI();
        
        // Start game loop
        this.gameLoopId = setInterval(() => this.gameLoop(), 50);
    }

    gameLoop() {
        if (this.state !== 'running') return;
        
        const elapsed = (Date.now() - this.startTime) / 1000;
        
        // Dynamic speed based on multiplier
        let speed = 1;
        if (this.multiplier >= 2) speed = 1.2;
        if (this.multiplier >= 5) speed = 1.5;
        if (this.multiplier >= 10) speed = 2;
        if (this.multiplier >= 25) speed = 2.5;
        if (this.multiplier >= 50) speed = 3;
        if (this.multiplier >= 100) speed = 4;
        
        // Calculate multiplier
        this.multiplier = Math.pow(Math.E, 0.012 * speed * elapsed * 10);
        this.multiplier = Math.floor(this.multiplier * 100) / 100;
        
        // Update path
        this.updatePath();
        
        // Check auto cashout
        this.checkAutoCashout();
        
        // Update display
        this.updateMultiplierDisplay();
        
        // Check crash
        if (this.multiplier >= this.crashPoint) {
            this.triggerCrash();
        }
    }

    updatePath() {
        const maxX = this.canvas.width - 40;
        const maxY = 40;
        
        const progress = Math.min(0.95, (this.multiplier - 1) / 20);
        
        // Exponential curve
        const x = 40 + progress * (maxX - 40);
        const y = this.canvas.height - 40 - Math.pow(progress, 0.7) * (this.canvas.height - 80);
        
        this.path.push({ x, y });
        
        // Limit path length
        if (this.path.length > 400) {
            this.path = this.path.slice(-400);
        }
    }

    checkAutoCashout() {
        if (this.myBet && !this.myBet.cashedOut && this.myBet.autoCashout) {
            if (this.multiplier >= this.myBet.autoCashout) {
                this.cashout();
            }
        }
    }

    async triggerCrash() {
        clearInterval(this.gameLoopId);
        
        this.state = 'crashed';
        this.multiplier = this.crashPoint;
        
        // Create explosion particles
        this.createExplosion();
        
        // Save to server
        await db.endGame(this.crashPoint);
        
        // Add to local history
        this.history.unshift({
            id: this.gameId,
            crashPoint: this.crashPoint,
            timestamp: Date.now()
        });
        
        if (this.history.length > 20) {
            this.history = this.history.slice(0, 20);
        }
        
        console.log(`💥 Crashed at ${this.crashPoint}x`);
        
        // Update UI
        this.updateUI();
        this.updateHistoryTicker();
        this.showCrashOverlay();
        
        // Notify loss
        if (this.myBet && !this.myBet.cashedOut) {
            showToast(`Crashed at ${this.crashPoint}x! Lost ${this.myBet.amount.toFixed(2)} TON`, 'error');
            
            // Refresh balance
            await refreshUserData();
        }
        
        // Haptic
        hapticFeedback('error');
        
        // Wait and start new round
        setTimeout(() => {
            this.hideCrashOverlay();
            this.startBettingPhase();
        }, CONFIG.CRASH_DELAY * 1000);
    }

    handleCrash(crashPoint) {
        this.crashPoint = crashPoint;
        this.triggerCrash();
    }

    createExplosion() {
        const last = this.path[this.path.length - 1] || { x: this.canvas.width / 2, y: this.canvas.height / 2 };
        
        for (let i = 0; i < 30; i++) {
            const angle = (Math.PI * 2 * i) / 30;
            const speed = 2 + Math.random() * 4;
            
            this.particles.push({
                x: last.x,
                y: last.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                size: 2 + Math.random() * 4,
                color: Math.random() > 0.5 ? '#ff6b6b' : '#ffd93d'
            });
        }
    }

    // ===== Betting =====
    
    async placeBet(amount, autoCashout = null) {
        if (this.state !== 'betting') {
            throw new Error('Betting is closed');
        }
        
        if (this.myBet) {
            throw new Error('Already placed a bet');
        }
        
        if (!window.currentUser) {
            throw new Error('Please login first');
        }
        
        if (amount < CONFIG.MIN_BET) {
            throw new Error(`Minimum bet is ${CONFIG.MIN_BET} TON`);
        }
        
        if (amount > CONFIG.MAX_BET) {
            throw new Error(`Maximum bet is ${CONFIG.MAX_BET} TON`);
        }
        
        if (amount > (window.currentUser.balance || 0)) {
            throw new Error('Insufficient balance');
        }
        
        // Place bet on server
        const result = await db.placeBet(window.currentUser.oderId, amount, autoCashout);
        
        // Update local state
        window.currentUser.balance = result.balance;
        this.myBet = result.bet;
        this.bets.push(result.bet);
        
        // Update UI
        updateBalanceDisplay();
        this.updateBetsList();
        this.updateUI();
        
        hapticFeedback('success');
        
        return result;
    }

    async cashout() {
        if (this.state !== 'running') {
            throw new Error('Game is not running');
        }
        
        if (!this.myBet || this.myBet.cashedOut) {
            throw new Error('No active bet');
        }
        
        // Cashout on server
        const result = await db.cashoutBet(window.currentUser.oderId, this.multiplier);
        
        // Update local state
        this.myBet.cashedOut = true;
        this.myBet.cashoutMultiplier = this.multiplier;
        this.myBet.profit = result.profit;
        
        window.currentUser.balance = result.balance;
        
        // Update UI
        updateBalanceDisplay();
        this.updateBetsList();
        this.updateUI();
        
        // Show win overlay
        this.showWinOverlay(result.profit);
        
        showToast(`Cashed out at ${this.multiplier.toFixed(2)}x! +${result.profit.toFixed(2)} TON`, 'success');
        
        hapticFeedback('success');
        
        return result;
    }

    // ===== Rendering =====
    
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.drawBackground();
        this.drawStars();
        this.drawGrid();
        
        if (this.state === 'running' || this.state === 'crashed') {
            this.drawPath();
            this.drawRocket();
        }
        
        this.drawParticles();
        
        this.animationId = requestAnimationFrame(() => this.render());
    }

    drawBackground() {
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        gradient.addColorStop(0, '#0d0d15');
        gradient.addColorStop(1, '#1a1a2e');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawStars() {
        for (const star of this.stars) {
            this.ctx.beginPath();
            this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
            this.ctx.fill();
            
            // Move stars when running
            if (this.state === 'running') {
                star.y += star.speed;
                if (star.y > this.canvas.height) {
                    star.y = 0;
                    star.x = Math.random() * this.canvas.width;
                }
            }
        }
    }

    drawGrid() {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        this.ctx.lineWidth = 1;
        
        const gridSize = 50;
        
        for (let x = 0; x <= this.canvas.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        
        for (let y = 0; y <= this.canvas.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }

    drawPath() {
        if (this.path.length < 2) return;
        
        // Glow
        this.ctx.shadowBlur = 20;
        this.ctx.shadowColor = this.state === 'crashed' ? '#ff6b6b' : '#00d68f';
        
        // Path line
        this.ctx.beginPath();
        this.ctx.moveTo(this.path[0].x, this.path[0].y);
        
        for (let i = 1; i < this.path.length; i++) {
            this.ctx.lineTo(this.path[i].x, this.path[i].y);
        }
        
        this.ctx.strokeStyle = this.state === 'crashed' ? '#ff6b6b' : '#00d68f';
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.stroke();
        
        // Fill under curve
        const last = this.path[this.path.length - 1];
        this.ctx.lineTo(last.x, this.canvas.height);
        this.ctx.lineTo(this.path[0].x, this.canvas.height);
        this.ctx.closePath();
        
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        const baseColor = this.state === 'crashed' ? '255, 107, 107' : '0, 214, 143';
        gradient.addColorStop(0, `rgba(${baseColor}, 0.4)`);
        gradient.addColorStop(1, `rgba(${baseColor}, 0)`);
        this.ctx.fillStyle = gradient;
        this.ctx.fill();
        
        this.ctx.shadowBlur = 0;
    }

    drawRocket() {
        if (this.path.length < 1) return;
        
        const pos = this.path[this.path.length - 1];
        
        this.ctx.save();
        this.ctx.translate(pos.x, pos.y);
        
        // Calculate angle
        if (this.path.length > 1) {
            const prev = this.path[this.path.length - 2];
            const angle = Math.atan2(prev.y - pos.y, pos.x - prev.x);
            this.ctx.rotate(angle - Math.PI / 4);
        } else {
            this.ctx.rotate(-Math.PI / 4);
        }
        
        // Draw rocket emoji
        this.ctx.font = '32px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(this.state === 'crashed' ? '💥' : '🚀', 0, 0);
        
        this.ctx.restore();
    }

    drawParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.1; // gravity
            p.life -= 0.02;
            
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }
            
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            this.ctx.fillStyle = p.color;
            this.ctx.globalAlpha = p.life;
            this.ctx.fill();
            this.ctx.globalAlpha = 1;
        }
    }

    // ===== UI Updates =====
    
    updateUI() {
        const multiplierEl = document.getElementById('multiplierDisplay');
        const statusEl = document.getElementById('gameStatusText');
        const betBtn = document.getElementById('mainBetButton');
        const betText = document.getElementById('betButtonText');
        
        // Multiplier
        if (multiplierEl) {
            multiplierEl.innerHTML = `${this.multiplier.toFixed(2)}<span class="multiplier-x">x</span>`;
            multiplierEl.className = 'multiplier-value';
            
            if (this.state === 'running') {
                multiplierEl.classList.add('running');
            } else if (this.state === 'crashed') {
                multiplierEl.classList.add('crashed');
            }
        }
        
        // Status
        if (statusEl) {
            switch (this.state) {
                case 'waiting':
                    statusEl.textContent = 'Waiting for players...';
                    break;
                case 'betting':
                    statusEl.textContent = `Place bets! Starting in ${this.countdown}s`;
                    break;
                case 'running':
                    statusEl.textContent = 'Flying... Cash out now!';
                    break;
                case 'crashed':
                    statusEl.textContent = `Crashed at ${this.crashPoint}x`;
                    break;
            }
        }
        
        // Bet button
        if (betBtn && betText) {
            betBtn.className = 'main-bet-button';
            
            if (this.state === 'betting') {
                if (this.myBet) {
                    betBtn.classList.add('waiting');
                    betText.textContent = 'BET PLACED ✓';
                } else {
                    betText.textContent = 'PLACE BET';
                }
            } else if (this.state === 'running') {
                if (this.myBet && !this.myBet.cashedOut) {
                    betBtn.classList.add('cashout');
                    const potential = (this.myBet.amount * this.multiplier).toFixed(2);
                    betText.textContent = `CASH OUT ${potential} TON`;
                } else {
                    betBtn.classList.add('waiting');
                    betText.textContent = this.myBet?.cashedOut ? 'CASHED OUT ✓' : 'NEXT ROUND...';
                }
            } else {
                betBtn.classList.add('waiting');
                betText.textContent = 'WAIT...';
            }
        }
        
        this.updateBetsList();
    }

    updateMultiplierDisplay() {
        const multiplierEl = document.getElementById('multiplierDisplay');
        if (multiplierEl) {
            multiplierEl.innerHTML = `${this.multiplier.toFixed(2)}<span class="multiplier-x">x</span>`;
        }
        
        // Update cashout button
        if (this.myBet && !this.myBet.cashedOut) {
            const betText = document.getElementById('betButtonText');
            if (betText) {
                const potential = (this.myBet.amount * this.multiplier).toFixed(2);
                betText.textContent = `CASH OUT ${potential} TON`;
            }
        }
    }

    updateCountdownDisplay() {
        const countdownEl = document.getElementById('countdownValue');
        if (countdownEl) {
            countdownEl.textContent = this.countdown;
        }
        
        const statusEl = document.getElementById('gameStatusText');
        if (statusEl) {
            statusEl.textContent = `Place bets! Starting in ${this.countdown}s`;
        }
    }

    updateBetsList() {
        const liveList = document.getElementById('liveBetsList');
        const countEl = document.getElementById('liveBetsCount');
        
        if (countEl) {
            countEl.textContent = this.bets.length;
        }
        
        if (!liveList) return;
        
        if (this.bets.length === 0) {
            liveList.innerHTML = `
                <div class="empty-bets">
                    <span class="empty-icon">🎲</span>
                    <span>No bets yet this round</span>
                </div>
            `;
            return;
        }
        
        liveList.innerHTML = this.bets.map(bet => {
            let statusClass = 'pending';
            let statusText = 'Playing...';
            
            if (bet.cashedOut) {
                statusClass = 'win';
                statusText = `${bet.cashoutMultiplier?.toFixed(2)}x (+${bet.profit?.toFixed(2)})`;
            } else if (this.state === 'crashed') {
                statusClass = 'loss';
                statusText = 'Lost';
            }
            
            const initial = (bet.username || 'P')[0].toUpperCase();
            const isMe = window.currentUser && bet.oderId === window.currentUser.oderId;
            
            return `
                <div class="bet-item ${isMe ? 'my-bet' : ''}">
                    <div class="bet-player">
                        <div class="bet-avatar">${initial}</div>
                        <div class="bet-name">${isMe ? 'You' : (bet.username || 'Player')}</div>
                    </div>
                    <div class="bet-result">
                        <div class="bet-amount">${bet.amount.toFixed(2)} TON</div>
                        <div class="bet-status ${statusClass}">${statusText}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateHistoryTicker() {
        const ticker = document.getElementById('historyTicker');
        if (!ticker) return;
        
        ticker.innerHTML = this.history.slice(0, 15).map(game => {
            let colorClass = 'low';
            if (game.crashPoint >= 2) colorClass = 'medium';
            if (game.crashPoint >= 5) colorClass = 'high';
            if (game.crashPoint >= 10) colorClass = 'mega';
            
            return `<span class="ticker-item ${colorClass}">${game.crashPoint.toFixed(2)}x</span>`;
        }).join('');
    }

    async loadHistory() {
        try {
            const history = await db.getGameHistory(20);
            this.history = history;
            this.updateHistoryTicker();
        } catch (e) {
            console.error('Failed to load history:', e);
        }
    }

    // ===== Overlays =====
    
    showCountdownOverlay() {
        document.getElementById('countdownOverlay')?.classList.remove('hidden');
        document.getElementById('crashOverlay')?.classList.add('hidden');
        document.getElementById('winOverlay')?.classList.add('hidden');
    }

    hideCountdownOverlay() {
        document.getElementById('countdownOverlay')?.classList.add('hidden');
    }

    showCrashOverlay() {
        const overlay = document.getElementById('crashOverlay');
        const valueEl = document.getElementById('crashValue');
        
        if (valueEl) valueEl.textContent = `@ ${this.crashPoint.toFixed(2)}x`;
        overlay?.classList.remove('hidden');
    }

    hideCrashOverlay() {
        document.getElementById('crashOverlay')?.classList.add('hidden');
    }

    showWinOverlay(profit) {
        const overlay = document.getElementById('winOverlay');
        const amountEl = document.getElementById('winAmount');
        
        if (amountEl) amountEl.textContent = `+${profit.toFixed(2)} TON`;
        overlay?.classList.remove('hidden');
        
        setTimeout(() => {
            overlay?.classList.add('hidden');
        }, 2000);
    }

    // ===== State Getters =====
    
    getState() {
        return {
            state: this.state,
            multiplier: this.multiplier,
            crashPoint: this.crashPoint,
            countdown: this.countdown,
            myBet: this.myBet,
            bets: this.bets,
            history: this.history
        };
    }

    destroy() {
        cancelAnimationFrame(this.animationId);
        clearInterval(this.gameLoopId);
        clearInterval(this.countdownId);
        clearInterval(this.syncId);
    }
}

// Create global instance
const game = new CrashGame();
window.game = game;

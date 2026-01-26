class CrashGame {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.state = 'waiting';
        this.multiplier = 1.00;
        this.crashPoint = null;
        this.gameId = null;
        this.startTime = null;
        this.countdown = CONFIG.BETTING_TIME;
        this.bets = [];
        this.myBet = null;
        this.history = [];
        this.path = [];
        this.stars = [];
        this.animId = null;
        this.loopId = null;
        this.countId = null;
    }

    async init() {
        this.canvas = document.getElementById('gameCanvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        this.makeStars();
        window.addEventListener('resize', () => this.resize());
        this.render();
        await this.loadHistory();
        this.startSync();
        console.log('🎮 Game ready');
    }

    resize() {
        const w = this.canvas.parentElement;
        this.canvas.width = w.clientWidth;
        this.canvas.height = w.clientHeight;
        this.makeStars();
    }

    makeStars() {
        this.stars = [];
        for (let i = 0; i < 30; i++) {
            this.stars.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                s: Math.random() * 1.5 + 0.5,
                sp: Math.random() * 0.3 + 0.1
            });
        }
    }

    startSync() {
        setInterval(() => {
            if (this.state === 'waiting' || this.state === 'betting') {
                this.sync();
            }
        }, 2000);
    }

    async sync() {
        try {
            const gs = await db.getGameState();
            if (gs.status !== this.state) this.handleState(gs);
            if (gs.bets) {
                this.bets = gs.bets;
                this.updateBets();
                if (window.currentUser) {
                    this.myBet = this.bets.find(b => b.oderId === window.currentUser.oderId) || null;
                }
            }
        } catch (e) { console.error('Sync:', e); }
    }

    handleState(gs) {
        if (gs.status === 'betting' && this.state !== 'betting') this.startBetting(gs);
        else if (gs.status === 'running' && this.state !== 'running') this.startRunning(gs);
        else if (gs.status === 'crashed' && this.state !== 'crashed') this.doCrash(gs.crashPoint);
    }

    async startBetting(gs = null) {
        clearInterval(this.loopId);
        clearInterval(this.countId);
        this.state = 'betting';
        this.multiplier = 1.00;
        this.path = [];
        this.myBet = null;
        
        if (gs) {
            this.gameId = gs.id;
            this.crashPoint = gs.crashPoint;
            this.bets = gs.bets || [];
        } else {
            const ng = await db.newGame();
            this.gameId = ng.id;
            this.crashPoint = ng.crashPoint;
            this.bets = [];
        }
        
        this.countdown = CONFIG.BETTING_TIME;
        this.updateUI();
        this.showCountdown();
        
        this.countId = setInterval(() => {
            this.countdown--;
            document.getElementById('countdownValue').textContent = this.countdown;
            if (this.countdown <= 0) {
                clearInterval(this.countId);
                this.startRunning();
            }
        }, 1000);
    }

    async startRunning(gs = null) {
        clearInterval(this.countId);
        this.state = 'running';
        this.startTime = Date.now();
        this.path = [{ x: 40, y: this.canvas.height - 40 }];
        if (gs) this.crashPoint = gs.crashPoint;
        await db.updateGame({ status: 'running', startTime: this.startTime });
        this.hideCountdown();
        this.updateUI();
        this.loopId = setInterval(() => this.loop(), 50);
    }

    loop() {
        if (this.state !== 'running') return;
        const t = (Date.now() - this.startTime) / 1000;
        let sp = 1;
        if (this.multiplier >= 2) sp = 1.2;
        if (this.multiplier >= 5) sp = 1.5;
        if (this.multiplier >= 10) sp = 2;
        if (this.multiplier >= 50) sp = 3;
        
        this.multiplier = Math.pow(Math.E, 0.012 * sp * t * 10);
        this.multiplier = Math.floor(this.multiplier * 100) / 100;
        
        const p = Math.min(0.95, (this.multiplier - 1) / 20);
        const x = 40 + p * (this.canvas.width - 80);
        const y = this.canvas.height - 40 - Math.pow(p, 0.7) * (this.canvas.height - 80);
        this.path.push({ x, y });
        if (this.path.length > 300) this.path = this.path.slice(-300);
        
        this.checkAuto();
        this.updateMult();
        
        if (this.multiplier >= this.crashPoint) this.doCrash(this.crashPoint);
    }

    checkAuto() {
        if (this.myBet && !this.myBet.cashedOut && this.myBet.autoCashout) {
            if (this.multiplier >= this.myBet.autoCashout) this.cashout();
        }
    }

    async doCrash(cp) {
        clearInterval(this.loopId);
        this.state = 'crashed';
        this.multiplier = cp;
        await db.endGame(cp);
        
        this.history.unshift({ id: this.gameId, crashPoint: cp, time: Date.now() });
        if (this.history.length > 20) this.history = this.history.slice(0, 20);
        
        this.updateUI();
        this.updateTicker();
        this.showCrash();
        
        if (this.myBet && !this.myBet.cashedOut) {
            showToast(`Crashed at ${cp}x! Lost ${this.myBet.amount} TON`, 'error');
            await refreshUser();
        }
        
        haptic('error');
        
        setTimeout(() => {
            this.hideCrash();
            this.startBetting();
        }, CONFIG.CRASH_DELAY * 1000);
    }

    async placeBet(amount, auto) {
        if (this.state !== 'betting') throw new Error('Betting closed');
        if (this.myBet) throw new Error('Already bet');
        if (!window.currentUser) throw new Error('Login first');
        if (amount < CONFIG.MIN_BET) throw new Error('Min: ' + CONFIG.MIN_BET);
        if (amount > CONFIG.MAX_BET) throw new Error('Max: ' + CONFIG.MAX_BET);
        if (amount > (window.currentUser.balance || 0)) throw new Error('Insufficient balance');
        
        const r = await db.placeBet(window.currentUser.oderId, amount, auto);
        window.currentUser.balance = r.balance;
        this.myBet = r.bet;
        this.bets.push(r.bet);
        updateBalance();
        this.updateBets();
        this.updateUI();
        haptic('success');
        return r;
    }

    async cashout() {
        if (this.state !== 'running') throw new Error('Not running');
        if (!this.myBet || this.myBet.cashedOut) throw new Error('No bet');
        
        const r = await db.cashout(window.currentUser.oderId, this.multiplier);
        this.myBet.cashedOut = true;
        this.myBet.multiplier = this.multiplier;
        this.myBet.profit = r.profit;
        window.currentUser.balance = r.balance;
        
        updateBalance();
        this.updateBets();
        this.updateUI();
        this.showWin(r.profit);
        showToast(`Won ${r.profit.toFixed(2)} TON at ${this.multiplier}x!`, 'success');
        haptic('success');
        return r;
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawBg();
        this.drawStars();
        this.drawGrid();
        if (this.state === 'running' || this.state === 'crashed') {
            this.drawPath();
            this.drawRocket();
        }
        this.animId = requestAnimationFrame(() => this.render());
    }

    drawBg() {
        const g = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        g.addColorStop(0, '#0d0d15');
        g.addColorStop(1, '#1a1a2e');
        this.ctx.fillStyle = g;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawStars() {
        for (const s of this.stars) {
            this.ctx.beginPath();
            this.ctx.arc(s.x, s.y, s.s, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.3})`;
            this.ctx.fill();
            if (this.state === 'running') {
                s.y += s.sp;
                if (s.y > this.canvas.height) { s.y = 0; s.x = Math.random() * this.canvas.width; }
            }
        }
    }

    drawGrid() {
        this.ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        this.ctx.lineWidth = 1;
        for (let x = 0; x <= this.canvas.width; x += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        for (let y = 0; y <= this.canvas.height; y += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }

    drawPath() {
        if (this.path.length < 2) return;
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = this.state === 'crashed' ? '#ff6b6b' : '#00d68f';
        this.ctx.beginPath();
        this.ctx.moveTo(this.path[0].x, this.path[0].y);
        for (let i = 1; i < this.path.length; i++) this.ctx.lineTo(this.path[i].x, this.path[i].y);
        this.ctx.strokeStyle = this.state === 'crashed' ? '#ff6b6b' : '#00d68f';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
        
        const last = this.path[this.path.length - 1];
        this.ctx.lineTo(last.x, this.canvas.height);
        this.ctx.lineTo(this.path[0].x, this.canvas.height);
        this.ctx.closePath();
        const g = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        const c = this.state === 'crashed' ? '255,107,107' : '0,214,143';
        g.addColorStop(0, `rgba(${c},0.4)`);
        g.addColorStop(1, `rgba(${c},0)`);
        this.ctx.fillStyle = g;
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
    }

    drawRocket() {
        if (!this.path.length) return;
        const p = this.path[this.path.length - 1];
        this.ctx.save();
        this.ctx.translate(p.x, p.y);
        if (this.path.length > 1) {
            const prev = this.path[this.path.length - 2];
            const a = Math.atan2(prev.y - p.y, p.x - prev.x);
            this.ctx.rotate(a - Math.PI / 4);
        } else this.ctx.rotate(-Math.PI / 4);
        this.ctx.font = '28px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(this.state === 'crashed' ? '💥' : '🚀', 0, 0);
        this.ctx.restore();
    }

    updateUI() {
        const m = document.getElementById('multiplierDisplay');
        const s = document.getElementById('gameStatusText');
        const b = document.getElementById('mainBetButton');
        const t = document.getElementById('betButtonText');
        
        if (m) {
            m.innerHTML = `${this.multiplier.toFixed(2)}<span class="x">x</span>`;
            m.className = 'multiplier-value' + (this.state === 'running' ? ' running' : this.state === 'crashed' ? ' crashed' : '');
        }
        
        if (s) {
            if (this.state === 'waiting') s.textContent = 'Waiting...';
            else if (this.state === 'betting') s.textContent = `Bet now! ${this.countdown}s`;
            else if (this.state === 'running') s.textContent = 'Cash out!';
            else s.textContent = `Crashed ${this.crashPoint}x`;
        }
        
        if (b && t) {
            b.className = 'main-bet-button';
            if (this.state === 'betting') {
                if (this.myBet) { b.classList.add('waiting'); t.textContent = 'BET PLACED ✓'; }
                else t.textContent = 'PLACE BET';
            } else if (this.state === 'running') {
                if (this.myBet && !this.myBet.cashedOut) {
                    b.classList.add('cashout');
                    t.textContent = `CASH OUT ${(this.myBet.amount * this.multiplier).toFixed(2)} TON`;
                } else { b.classList.add('waiting'); t.textContent = this.myBet?.cashedOut ? 'CASHED ✓' : 'NEXT ROUND'; }
            } else { b.classList.add('waiting'); t.textContent = 'WAIT...'; }
        }
        
        this.updateBets();
    }

    updateMult() {
        const m = document.getElementById('multiplierDisplay');
        if (m) m.innerHTML = `${this.multiplier.toFixed(2)}<span class="x">x</span>`;
        if (this.myBet && !this.myBet.cashedOut) {
            const t = document.getElementById('betButtonText');
            if (t) t.textContent = `CASH OUT ${(this.myBet.amount * this.multiplier).toFixed(2)} TON`;
        }
    }

    updateBets() {
        const l = document.getElementById('liveBetsList');
        const c = document.getElementById('liveBetsCount');
        if (c) c.textContent = this.bets.length;
        if (!l) return;
        
        if (!this.bets.length) { l.innerHTML = '<div class="empty-bets">🎲 No bets yet</div>'; return; }
        
        l.innerHTML = this.bets.map(b => {
            let sc = 'pending', st = 'Playing...';
            if (b.cashedOut) { sc = 'win'; st = `${b.multiplier?.toFixed(2)}x (+${b.profit?.toFixed(2)})`; }
            else if (this.state === 'crashed') { sc = 'loss'; st = 'Lost'; }
            const me = window.currentUser && b.oderId === window.currentUser.oderId;
            return `<div class="bet-item"><div class="bet-player"><div class="bet-avatar">${(b.username || 'P')[0]}</div><div class="bet-name">${me ? 'You' : b.username || 'Player'}</div></div><div class="bet-result"><div class="bet-amount">${b.amount.toFixed(2)} TON</div><div class="bet-status ${sc}">${st}</div></div></div>`;
        }).join('');
    }

    updateTicker() {
        const t = document.getElementById('historyTicker');
        if (!t) return;
        t.innerHTML = this.history.slice(0, 15).map(g => {
            let c = 'low';
            if (g.crashPoint >= 2) c = 'medium';
            if (g.crashPoint >= 5) c = 'high';
            if (g.crashPoint >= 10) c = 'mega';
            return `<span class="ticker-item ${c}">${g.crashPoint.toFixed(2)}x</span>`;
        }).join('');
    }

    async loadHistory() {
        try {
            this.history = await db.getHistory(20);
            this.updateTicker();
        } catch (e) { console.error('History:', e); }
    }

    showCountdown() {
        document.getElementById('countdownOverlay')?.classList.remove('hidden');
        document.getElementById('countdownValue').textContent = this.countdown;
    }
    hideCountdown() { document.getElementById('countdownOverlay')?.classList.add('hidden'); }
    showCrash() {
        document.getElementById('crashValue').textContent = `@ ${this.crashPoint.toFixed(2)}x`;
        document.getElementById('crashOverlay')?.classList.remove('hidden');
    }
    hideCrash() { document.getElementById('crashOverlay')?.classList.add('hidden'); }
    showWin(p) {
        document.getElementById('winAmount').textContent = `+${p.toFixed(2)} TON`;
        const o = document.getElementById('winOverlay');
        o?.classList.remove('hidden');
        setTimeout(() => o?.classList.add('hidden'), 2000);
    }

    getState() {
        return { state: this.state, multiplier: this.multiplier, countdown: this.countdown, myBet: this.myBet, bets: this.bets };
    }
}

const game = new CrashGame();
window.game = game;

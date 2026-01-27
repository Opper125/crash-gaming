window.currentUser = null;
window.tg = window.Telegram?.WebApp;

document.addEventListener('DOMContentLoaded', async () => {
    updateSplash('Initializing...');
    
    // Check config
    if (!isConfigured()) {
        updateSplash('⚠️ BIN_ID not set! Check api.js');
        console.error('Please set JSONBIN_BIN_ID in api.js');
        return;
    }
    
    // Init Telegram
    if (window.tg) {
        window.tg.ready();
        window.tg.expand();
        window.tg.setHeaderColor('#0f0f1a');
        window.tg.setBackgroundColor('#0f0f1a');
    }
    
    updateSplash('Loading user...');
    
    try {
        await loadUser();
        updateSplash('Starting game...');
        await game.init();
        showApp();
        game.startBetting();
    } catch (e) {
        console.error('Init error:', e);
        updateSplash('Error: ' + e.message);
    }
});

function updateSplash(t) { document.getElementById('splashText').textContent = t; }

async function loadUser() {
    let userData = {};
    
    if (window.tg?.initDataUnsafe?.user) {
        const u = window.tg.initDataUnsafe.user;
        userData = {
            oderId: u.id.toString(),
            firstName: u.first_name || 'Player',
            username: u.username || ''
        };
    } else {
        // Test mode
        userData = {
            oderId: 'test_' + Date.now(),
            firstName: 'TestPlayer',
            username: 'test'
        };
        console.warn('Running in test mode');
    }
    
    const user = await db.createUser(userData.oderId, userData);
    window.currentUser = user;
    updateUserUI();
    updateBalance();
    checkAdmin();
}

async function refreshUser() {
    if (!window.currentUser) return;
    const u = await db.getUser(window.currentUser.oderId);
    if (u) { window.currentUser = u; updateBalance(); }
}

function updateUserUI() {
    const u = window.currentUser;
    if (!u) return;
    document.getElementById('userAvatar').textContent = (u.odername || 'P')[0].toUpperCase();
    document.getElementById('userName').textContent = u.odername || 'Player';
    document.getElementById('userGames').textContent = (u.gamesPlayed || 0) + ' games';
    document.getElementById('profileAvatar').textContent = (u.odername || 'P')[0].toUpperCase();
    document.getElementById('profileName').textContent = u.odername || 'Player';
    document.getElementById('profileId').textContent = u.oderId;
}

function updateBalance() {
    const b = window.currentUser?.balance || 0;
    document.getElementById('balanceDisplay').textContent = b.toFixed(2) + ' TON';
    document.getElementById('walletBalanceValue').textContent = b.toFixed(2) + ' TON';
}

function checkAdmin() {
    if (window.currentUser?.oderId === CONFIG.ADMIN_ID) {
        document.getElementById('adminFab')?.classList.remove('hidden');
    }
}

function showApp() {
    document.getElementById('splashScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
}

// Bet controls
function adjustBet(a) {
    const i = document.getElementById('betAmountInput');
    let v = parseFloat(i.value) || 0;
    v = Math.max(CONFIG.MIN_BET, Math.round((v + a) * 100) / 100);
    v = Math.min(v, window.currentUser?.balance || 0);
    i.value = v.toFixed(2);
    haptic('light');
}

function setBetAmount(a) {
    const i = document.getElementById('betAmountInput');
    i.value = Math.min(a, window.currentUser?.balance || 0).toFixed(2);
    haptic('light');
}

function setBetMax() {
    const b = Math.min(window.currentUser?.balance || 0, CONFIG.MAX_BET);
    document.getElementById('betAmountInput').value = b.toFixed(2);
    haptic('light');
}

async function handleMainButton() {
    const s = game.getState();
    if (s.state === 'betting' && !s.myBet) {
        const a = parseFloat(document.getElementById('betAmountInput').value);
        if (isNaN(a) || a <= 0) { showToast('Enter valid amount', 'error'); return; }
        
        let auto = null;
        if (document.getElementById('autoCashoutToggle')?.checked) {
            auto = parseFloat(document.getElementById('autoCashoutValue').value);
            if (isNaN(auto) || auto < 1.01) { showToast('Invalid auto cashout', 'error'); return; }
        }
        
        try {
            await game.placeBet(a, auto);
            showToast('Bet placed!', 'success');
        } catch (e) { showToast(e.message, 'error'); }
    } else if (s.state === 'running' && s.myBet && !s.myBet.cashedOut) {
        try { await game.cashout(); } catch (e) { showToast(e.message, 'error'); }
    }
}

// Tabs
function switchBetTab(t) {
    document.querySelectorAll('.section-tab').forEach(e => e.classList.remove('active'));
    event.currentTarget.classList.add('active');
    document.getElementById('liveBetsList').classList.toggle('hidden', t !== 'live');
    document.getElementById('myBetsList').classList.toggle('hidden', t !== 'my');
    if (t === 'my') loadMyBets();
    haptic('light');
}

async function loadMyBets() {
    const l = document.getElementById('myBetsList');
    const h = window.currentUser?.betHistory || [];
    if (!h.length) { l.innerHTML = '<div class="empty-bets">📋 Your bets will appear here</div>'; return; }
    l.innerHTML = h.slice(0, 20).map(b => `<div class="bet-item"><div class="bet-player"><span>${b.amount.toFixed(2)} TON</span></div><div class="bet-result"><div class="bet-status ${b.result}">${b.multiplier?.toFixed(2)}x</div><div class="bet-amount ${b.result === 'win' ? 'positive' : 'negative'}">${b.profit >= 0 ? '+' : ''}${b.profit.toFixed(2)}</div></div></div>`).join('');
}

// Navigation
function switchPage(p) {
    document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
    event.currentTarget.classList.add('active');
    if (p === 'wallet') openWallet();
    else if (p === 'stats') openStats();
    else if (p === 'profile') openProfile();
    else closeModals();
    haptic('light');
}

// Modals
function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }
function closeModals() { document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); }

// Wallet
function openWallet() {
    updateBalance();
    if (window.currentUser) document.getElementById('depositMemo').textContent = 'D_' + window.currentUser.oderId;
    loadTx();
    showSection('deposit');
    openModal('walletModal');
}

async function loadGiftPanel() {
    if (!window.currentUser) return;

    // Update owner info
    const ownerBot = document.getElementById('giftOwnerBot');
    if (ownerBot) ownerBot.textContent = '@' + CONFIG.BOT_USERNAME;

    // Create or reuse pending request
    const statusEl = document.getElementById('giftStatusText');
    const idEl = document.getElementById('giftDepositId');
    const listEl = document.getElementById('giftHistoryList');

    try {
        const my = await db.getGiftDeposits(window.currentUser.oderId);
        let pending = my.find(x => x.status === 'pending');
        if (!pending) {
            pending = await db.createGiftDepositRequest(window.currentUser.oderId);
        }
        if (idEl) idEl.textContent = pending.id;
        if (statusEl) statusEl.textContent = 'Waiting for your transfer...';

        // Render history
        if (listEl) {
            const sorted = (my || []).slice(0, 10);
            if (!sorted.length) {
                listEl.innerHTML = '<div class="empty-tx">No gift deposits yet</div>';
            } else {
                listEl.innerHTML = sorted.map(x => {
                    const ok = x.status === 'confirmed';
                    const cls = ok ? 'positive' : 'pending';
                    const amt = ok ? `+${(x.creditTon || 0).toFixed(2)} TON` : 'PENDING';
                    return `<div class="tx-item"><div class="tx-info"><div class="tx-icon">🎁</div><div><div class="tx-type">Gift Deposit</div><div class="tx-date">${new Date(x.createdAt).toLocaleString()}</div><div class="tx-date" style="opacity:.9">ID: ${x.id}</div></div></div><div class="tx-amount ${cls}">${amt}</div></div>`;
                }).join('');
            }
        }
    } catch (e) {
        if (statusEl) statusEl.textContent = 'Error: ' + e.message;
    }
}

function copyGiftId() {
    const id = document.getElementById('giftDepositId')?.textContent?.trim();
    if (!id) return;
    navigator.clipboard.writeText(id);
    showToast('Gift Deposit ID copied!', 'success');
    haptic('light');
}

async function checkGiftDeposit() {
    if (!window.currentUser) return;
    const btn = document.getElementById('giftCheckBtn');
    const statusEl = document.getElementById('giftStatusText');

    try {
        if (btn) { btn.disabled = true; btn.classList.add('loading'); }
        if (statusEl) statusEl.textContent = 'Checking blockchain...';

        const r = await db.verifyGiftDeposit(window.currentUser.oderId);
        if (!r.ok) {
            if (statusEl) statusEl.textContent = r.message;
            showToast(r.message, 'info');
        } else {
            await refreshUser();
            updateBalance();
            if (statusEl) statusEl.textContent = `✅ Credited +${r.credit.toFixed(2)} TON`;
            showToast(`Gift credited +${r.credit.toFixed(2)} TON`, 'success');
            haptic('success');
            await loadGiftPanel();
            await loadTx();
        }
    } catch (e) {
        if (statusEl) statusEl.textContent = 'Error: ' + e.message;
        showToast(e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    }
}

window.copyGiftId = copyGiftId;
window.checkGiftDeposit = checkGiftDeposit;

async function showSection(s) {
    ['deposit', 'withdraw', 'gift'].forEach(x => {
        document.getElementById(x + 'Section')?.classList.toggle('hidden', x !== s);
    });
    if (s === 'gift') {
        await loadGiftPanel();
    }
}

function copyAddress() {
    navigator.clipboard.writeText(CONFIG.TON_WALLET);
    showToast('Address copied!', 'success');
    haptic('light');
}

function copyMemo() {
    const m = document.getElementById('depositMemo').textContent;
    navigator.clipboard.writeText(m);
    showToast('Memo copied!', 'success');
    haptic('light');
}

async function submitWithdraw() {
    const a = parseFloat(document.getElementById('withdrawAmount').value);
    const addr = document.getElementById('withdrawAddress').value.trim();
    
    if (isNaN(a) || a < CONFIG.MIN_WITHDRAW) { showToast('Min: ' + CONFIG.MIN_WITHDRAW + ' TON', 'error'); return; }
    if (a > (window.currentUser?.balance || 0)) { showToast('Insufficient balance', 'error'); return; }
    if (!addr || (!addr.startsWith('EQ') && !addr.startsWith('UQ'))) { showToast('Invalid address', 'error'); return; }
    
    try {
        await db.withdraw(window.currentUser.oderId, a, addr);
        window.currentUser.balance -= a;
        updateBalance();
        document.getElementById('withdrawAmount').value = '';
        document.getElementById('withdrawAddress').value = '';
        showToast('Withdrawal submitted!', 'success');
        closeModal('walletModal');
    } catch (e) { showToast(e.message, 'error'); }
}

async function loadTx() {
    const l = document.getElementById('transactionsList');
    const tx = window.currentUser?.transactions || [];
    if (!tx.length) { l.innerHTML = '<div class="empty-tx">No transactions</div>'; return; }
    l.innerHTML = tx.slice(0, 20).map(t => {
        const ic = t.type === 'deposit' ? '📥' : t.type === 'withdraw' ? '📤' : '🎁';
        const cl = t.amount >= 0 ? 'positive' : 'negative';
        return `<div class="tx-item"><div class="tx-info"><div class="tx-icon">${ic}</div><div><div class="tx-type">${t.type}</div><div class="tx-date">${new Date(t.time).toLocaleString()}</div></div></div><div class="tx-amount ${cl}">${t.amount >= 0 ? '+' : ''}${t.amount.toFixed(2)} TON</div></div>`;
    }).join('');
}

// Stats
async function openStats() {
    await refreshUser();
    const u = window.currentUser;
    if (!u) return;
    const g = u.gamesPlayed || 0;
    const w = u.wins || 0;
    const l = u.losses || 0;
    const wr = g > 0 ? ((w / g) * 100).toFixed(1) : '0';
    const p = (u.biggestWin || 0) - (u.totalWagered || 0) + (u.balance || 0);
    
    document.getElementById('statGames').textContent = g;
    document.getElementById('statWins').textContent = w;
    document.getElementById('statLosses').textContent = l;
    document.getElementById('statWinRate').textContent = wr + '%';
    
    const pe = document.getElementById('statProfit');
    pe.textContent = (p >= 0 ? '+' : '') + p.toFixed(2) + ' TON';
    pe.className = 'profit-value ' + (p >= 0 ? 'positive' : 'negative');
    
    loadBetHistory();
    openModal('statsModal');
}

function loadBetHistory() {
    const l = document.getElementById('betHistoryList');
    const h = window.currentUser?.betHistory || [];
    if (!h.length) { l.innerHTML = '<div class="empty-tx">No history</div>'; return; }
    l.innerHTML = h.slice(0, 30).map(b => `<div class="history-item"><div class="history-info"><div class="history-mult">${b.multiplier?.toFixed(2)}x</div><div class="history-time">${new Date(b.time).toLocaleString()}</div></div><div class="history-result"><div class="result-amount">${b.amount.toFixed(2)} TON</div><div class="result-profit ${b.result}">${b.profit >= 0 ? '+' : ''}${b.profit.toFixed(2)}</div></div></div>`).join('');
}

// Profile
function openProfile() {
    const u = window.currentUser;
    if (!u) return;
    document.getElementById('profileJoined').textContent = new Date(u.createdAt).toLocaleDateString();
    document.getElementById('profileGames').textContent = u.gamesPlayed || 0;
    document.getElementById('profileWagered').textContent = (u.totalWagered || 0).toFixed(2) + ' TON';
    document.getElementById('profileBestWin').textContent = (u.biggestWin || 0).toFixed(2) + ' TON';
    openModal('profileModal');
}

// Admin
function openAdmin() { window.location.href = 'admin.html'; }

// Utils
function haptic(t) {
    if (window.tg?.HapticFeedback) {
        if (t === 'light') window.tg.HapticFeedback.impactOccurred('light');
        else if (t === 'success') window.tg.HapticFeedback.notificationOccurred('success');
        else if (t === 'error') window.tg.HapticFeedback.notificationOccurred('error');
    }
}

function showToast(m, t = 'info') {
    const c = document.getElementById('toastContainer');
    const e = document.createElement('div');
    e.className = 'toast ' + t;
    e.textContent = m;
    c.appendChild(e);
    setTimeout(() => e.remove(), 3000);
}

// Exports
window.adjustBet = adjustBet;
window.setBetAmount = setBetAmount;
window.setBetMax = setBetMax;
window.handleMainButton = handleMainButton;
window.switchBetTab = switchBetTab;
window.switchPage = switchPage;
window.openModal = openModal;
window.closeModal = closeModal;
window.openWallet = openWallet;
window.showSection = showSection;
window.copyAddress = copyAddress;
window.copyMemo = copyMemo;
window.submitWithdraw = submitWithdraw;
window.openAdmin = openAdmin;
window.showToast = showToast;
window.updateBalance = updateBalance;
window.refreshUser = refreshUser;

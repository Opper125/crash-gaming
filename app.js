// ===== Main Application =====

// Global state
window.currentUser = null;
window.tg = window.Telegram?.WebApp;

// ===== Initialization =====

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 App starting...');
    
    // Check configuration
    if (!isConfigured()) {
        showError('App not configured. Please complete setup first.');
        // Redirect to setup after delay
        setTimeout(() => {
            window.location.href = 'setup.html';
        }, 2000);
        return;
    }
    
    // Initialize Telegram WebApp
    initTelegram();
    
    // Check Telegram context
    if (!window.tg?.initDataUnsafe?.user) {
        // Not in Telegram, show error
        showError('Please open this app from Telegram');
        return;
    }
    
    try {
        // Load user
        await loadUser();
        
        // Initialize game
        await game.init();
        
        // Setup event listeners
        setupEventListeners();
        
        // Check admin
        checkAdmin();
        
        // Show main app
        showMainApp();
        
        console.log('✅ App initialized successfully');
        
    } catch (error) {
        console.error('Initialization error:', error);
        showError('Failed to initialize. Please try again.');
    }
});

// ===== Telegram Integration =====

function initTelegram() {
    if (!window.tg) {
        console.warn('Telegram WebApp not available');
        return;
    }
    
    // Initialize
    window.tg.ready();
    window.tg.expand();
    
    // Set theme
    window.tg.setHeaderColor('#0f0f1a');
    window.tg.setBackgroundColor('#0f0f1a');
    
    // Enable closing confirmation
    window.tg.enableClosingConfirmation();
    
    console.log('📱 Telegram WebApp initialized');
}

// ===== User Management =====

async function loadUser() {
    const tgUser = window.tg?.initDataUnsafe?.user;
    
    if (!tgUser) {
        throw new Error('No Telegram user data');
    }
    
    const userData = {
        oderId: tgUser.id.toString(),
        username: tgUser.first_name || 'Player',
        firstName: tgUser.first_name || '',
        lastName: tgUser.last_name || '',
        telegramUsername: tgUser.username || '',
        photoUrl: tgUser.photo_url || ''
    };
    
    // Create or get user from database
    const user = await db.createUser(userData.oderId, userData);
    
    window.currentUser = user;
    
    // Update UI
    updateUserDisplay();
    updateBalanceDisplay();
    
    console.log('👤 User loaded:', user.odername);
}

async function refreshUserData() {
    if (!window.currentUser) return;
    
    try {
        const user = await db.getUser(window.currentUser.oderId);
        if (user) {
            window.currentUser = user;
            updateBalanceDisplay();
        }
    } catch (e) {
        console.error('Failed to refresh user:', e);
    }
}

// ===== UI Updates =====

function updateUserDisplay() {
    const user = window.currentUser;
    if (!user) return;
    
    // Avatar
    const avatarImg = document.getElementById('userAvatarImg');
    const avatarText = document.getElementById('userAvatarText');
    
    if (user.photoUrl) {
        avatarImg.src = user.photoUrl;
        avatarImg.style.display = 'block';
        avatarText.style.display = 'none';
    } else {
        avatarImg.style.display = 'none';
        avatarText.style.display = 'flex';
        avatarText.textContent = (user.odername || user.firstName || 'P')[0].toUpperCase();
    }
    
    // Name
    document.getElementById('userName').textContent = user.odername || user.firstName || 'Player';
    document.getElementById('userGames').textContent = `${user.gamesPlayed || 0} games`;
    
    // Profile modal
    updateProfileDisplay();
}

function updateBalanceDisplay() {
    const balance = window.currentUser?.balance || 0;
    const balanceText = `${balance.toFixed(2)} TON`;
    
    document.getElementById('balanceDisplay').textContent = balanceText;
    document.getElementById('walletBalanceValue').textContent = balanceText;
    document.getElementById('walletBalanceUsd').textContent = `≈ $${(balance * CONFIG.TON_PRICE_USD).toFixed(2)} USD`;
}

function updateProfileDisplay() {
    const user = window.currentUser;
    if (!user) return;
    
    // Avatar
    const avatarImg = document.getElementById('profileAvatarImg');
    const avatarText = document.getElementById('profileAvatarText');
    
    if (user.photoUrl) {
        avatarImg.src = user.photoUrl;
        avatarImg.style.display = 'block';
        avatarText.style.display = 'none';
    } else {
        avatarImg.style.display = 'none';
        avatarText.style.display = 'flex';
        avatarText.textContent = (user.odername || 'P')[0].toUpperCase();
    }
    
    document.getElementById('profileName').textContent = user.odername || user.firstName || 'Player';
    document.getElementById('profileUsername').textContent = user.username ? `@${user.username}` : '';
    document.getElementById('profileTelegramId').textContent = user.oderId;
    document.getElementById('profileJoinDate').textContent = new Date(user.createdAt).toLocaleDateString();
    document.getElementById('profileTotalGames').textContent = user.gamesPlayed || 0;
    document.getElementById('profileTotalWagered').textContent = `${(user.totalWagered || 0).toFixed(2)} TON`;
    document.getElementById('profileBiggestWin').textContent = `${(user.biggestWin || 0).toFixed(2)} TON`;
    
    const winRate = user.gamesPlayed > 0 
        ? ((user.wins / user.gamesPlayed) * 100).toFixed(1) 
        : '0';
    document.getElementById('profileWinRate').textContent = `${winRate}%`;
}

function checkAdmin() {
    const isAdmin = window.currentUser?.oderId === CONFIG.ADMIN_TELEGRAM_ID;
    const adminFab = document.getElementById('adminFab');
    
    if (isAdmin && adminFab) {
        adminFab.classList.remove('hidden');
    }
}

// ===== Screen Management =====

function showMainApp() {
    document.getElementById('splashScreen').classList.add('hidden');
    document.getElementById('errorScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
}

function showError(message) {
    document.getElementById('splashScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('errorMessage').textContent = message;
    document.getElementById('errorScreen').classList.remove('hidden');
}

// ===== Event Listeners =====

function setupEventListeners() {
    // Bet amount adjustments handled inline
    
    // Input validation
    document.getElementById('betAmountInput')?.addEventListener('input', (e) => {
        let value = parseFloat(e.target.value);
        if (isNaN(value)) value = CONFIG.MIN_BET;
        if (value < 0) value = 0;
        e.target.value = value;
    });
}

// ===== Bet Controls =====

function adjustBet(amount) {
    const input = document.getElementById('betAmountInput');
    let value = parseFloat(input.value) || 0;
    value = Math.max(CONFIG.MIN_BET, Math.round((value + amount) * 100) / 100);
    value = Math.min(value, window.currentUser?.balance || 0);
    input.value = value.toFixed(2);
    hapticFeedback('light');
}

function setBetAmount(amount) {
    const input = document.getElementById('betAmountInput');
    const maxBet = Math.min(amount, window.currentUser?.balance || 0);
    input.value = maxBet.toFixed(2);
    hapticFeedback('light');
}

function setBetMax() {
    const balance = window.currentUser?.balance || 0;
    const maxBet = Math.min(balance, CONFIG.MAX_BET);
    document.getElementById('betAmountInput').value = maxBet.toFixed(2);
    hapticFeedback('light');
}

async function handleMainButton() {
    const state = game.getState();
    
    if (state.state === 'betting' && !state.myBet) {
        await placeBet();
    } else if (state.state === 'running' && state.myBet && !state.myBet.cashedOut) {
        await cashOut();
    }
}

async function placeBet() {
    const amountInput = document.getElementById('betAmountInput');
    const amount = parseFloat(amountInput.value);
    
    if (isNaN(amount) || amount <= 0) {
        showToast('Enter a valid bet amount', 'error');
        return;
    }
    
    // Get auto cashout
    let autoCashout = null;
    if (document.getElementById('autoCashoutToggle')?.checked) {
        autoCashout = parseFloat(document.getElementById('autoCashoutValue').value);
        if (isNaN(autoCashout) || autoCashout < 1.01) {
            showToast('Invalid auto cashout value', 'error');
            return;
        }
    }
    
    try {
        await game.placeBet(amount, autoCashout);
        showToast(`Bet placed: ${amount.toFixed(2)} TON`, 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function cashOut() {
    try {
        await game.cashout();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ===== Tab Switching =====

function switchBetTab(tab) {
    document.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
    event.currentTarget.classList.add('active');
    
    document.getElementById('liveBetsList').classList.toggle('hidden', tab !== 'live');
    document.getElementById('myBetsList').classList.toggle('hidden', tab !== 'my');
    
    if (tab === 'my') {
        loadMyBetsHistory();
    }
    
    hapticFeedback('light');
}

async function loadMyBetsHistory() {
    const list = document.getElementById('myBetsList');
    if (!window.currentUser) return;
    
    const history = window.currentUser.betHistory || [];
    
    if (history.length === 0) {
        list.innerHTML = `
            <div class="empty-bets">
                <span class="empty-icon">📋</span>
                <span>Your bet history will appear here</span>
            </div>
        `;
        return;
    }
    
    list.innerHTML = history.slice(0, 20).map(bet => `
        <div class="bet-item">
            <div class="bet-player">
                <div class="bet-amount">${bet.amount.toFixed(2)} TON</div>
                <div class="bet-status ${bet.result}">${bet.multiplier?.toFixed(2)}x</div>
            </div>
            <div class="bet-result">
                <div class="bet-amount ${bet.result === 'win' ? 'positive' : 'negative'}">
                    ${bet.profit >= 0 ? '+' : ''}${bet.profit.toFixed(2)} TON
                </div>
            </div>
        </div>
    `).join('');
}

// ===== Navigation =====

function switchPage(page) {
    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    event.currentTarget.classList.add('active');
    
    switch (page) {
        case 'wallet':
            openWallet();
            break;
        case 'stats':
            openStats();
            break;
        case 'profile':
            openProfile();
            break;
        default:
            closeAllModals();
    }
    
    hapticFeedback('light');
}

// ===== Modals =====

function openModal(id) {
    document.getElementById(id)?.classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id)?.classList.add('hidden');
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

// ===== Wallet =====

function openWallet() {
    updateBalanceDisplay();
    loadTransactions();
    
    // Show deposit by default
    showDepositSection();
    
    // Set deposit memo
    if (window.currentUser) {
        document.getElementById('depositMemo').textContent = `D_${window.currentUser.oderId}`;
    }
    
    openModal('walletModal');
}

function showDepositSection() {
    document.getElementById('depositSection').classList.remove('hidden');
    document.getElementById('withdrawSection').classList.add('hidden');
    document.getElementById('giftSection').classList.add('hidden');
}

function showWithdrawSection() {
    document.getElementById('withdrawSection').classList.remove('hidden');
    document.getElementById('depositSection').classList.add('hidden');
    document.getElementById('giftSection').classList.add('hidden');
}

function showGiftSection() {
    document.getElementById('giftSection').classList.remove('hidden');
    document.getElementById('depositSection').classList.add('hidden');
    document.getElementById('withdrawSection').classList.add('hidden');
}

function copyDepositAddress() {
    const address = document.getElementById('depositAddressText').textContent;
    copyToClipboard(address, 'Address copied!');
}

function copyMemo() {
    const memo = document.getElementById('depositMemo').textContent;
    copyToClipboard(memo, 'Memo copied!');
}

function setWithdrawMax() {
    const balance = window.currentUser?.balance || 0;
    document.getElementById('withdrawAmountInput').value = balance.toFixed(2);
}

async function submitWithdraw() {
    const amount = parseFloat(document.getElementById('withdrawAmountInput').value);
    const address = document.getElementById('withdrawAddressInput').value.trim();
    
    if (isNaN(amount) || amount < CONFIG.MIN_WITHDRAW) {
        showToast(`Minimum withdrawal is ${CONFIG.MIN_WITHDRAW} TON`, 'error');
        return;
    }
    
    if (amount > (window.currentUser?.balance || 0)) {
        showToast('Insufficient balance', 'error');
        return;
    }
    
    if (!address || (!address.startsWith('EQ') && !address.startsWith('UQ'))) {
        showToast('Enter a valid TON address', 'error');
        return;
    }
    
    try {
        await db.requestWithdrawal(window.currentUser.oderId, amount, address);
        
        window.currentUser.balance -= amount;
        updateBalanceDisplay();
        
        document.getElementById('withdrawAmountInput').value = '';
        document.getElementById('withdrawAddressInput').value = '';
        
        showToast('Withdrawal request submitted!', 'success');
        closeModal('walletModal');
        
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function loadTransactions() {
    const list = document.getElementById('transactionsList');
    const transactions = window.currentUser?.transactions || [];
    
    if (transactions.length === 0) {
        list.innerHTML = '<div class="empty-transactions">No transactions yet</div>';
        return;
    }
    
    list.innerHTML = transactions.slice(0, 20).map(tx => {
        let icon = '💰';
        let type = 'Transaction';
        
        if (tx.type === 'deposit') {
            icon = '📥';
            type = 'Deposit';
        } else if (tx.type === 'withdrawal') {
            icon = '📤';
            type = 'Withdrawal';
        } else if (tx.type === 'gift_sale') {
            icon = '🎁';
            type = 'Gift Sale';
        }
        
        const amountClass = tx.amount >= 0 ? 'positive' : 'negative';
        const statusClass = tx.status === 'pending' ? 'pending' : amountClass;
        
        return `
            <div class="transaction-item">
                <div class="tx-info">
                    <div class="tx-icon">${icon}</div>
                    <div class="tx-details">
                        <div class="tx-type">${type}</div>
                        <div class="tx-date">${new Date(tx.timestamp).toLocaleString()}</div>
                    </div>
                </div>
                <div class="tx-amount ${statusClass}">
                    ${tx.amount >= 0 ? '+' : ''}${tx.amount.toFixed(2)} TON
                </div>
            </div>
        `;
    }).join('');
}

// ===== Stats =====

async function openStats() {
    await refreshUserData();
    
    const user = window.currentUser;
    if (!user) return;
    
    const games = user.gamesPlayed || 0;
    const wins = user.wins || 0;
    const losses = user.losses || 0;
    const winRate = games > 0 ? ((wins / games) * 100).toFixed(1) : '0';
    const profit = user.totalProfit || 0;
    
    document.getElementById('statTotalGames').textContent = games;
    document.getElementById('statWins').textContent = wins;
    document.getElementById('statLosses').textContent = losses;
    document.getElementById('statWinRate').textContent = `${winRate}%`;
    document.getElementById('statTotalWagered').textContent = (user.totalWagered || 0).toFixed(2);
    document.getElementById('statBiggestWin').textContent = (user.biggestWin || 0).toFixed(2);
    
    const profitEl = document.getElementById('statNetProfit');
    profitEl.textContent = `${profit >= 0 ? '+' : ''}${profit.toFixed(2)} TON`;
    profitEl.className = `profit-value ${profit >= 0 ? 'positive' : 'negative'}`;
    
    loadBetHistory();
    openModal('statsModal');
}

async function loadBetHistory() {
    const list = document.getElementById('betHistoryList');
    const history = window.currentUser?.betHistory || [];
    
    if (history.length === 0) {
        list.innerHTML = '<div class="empty-history">No bet history</div>';
        return;
    }
    
    list.innerHTML = history.slice(0, 30).map(bet => `
        <div class="history-bet-item">
            <div class="history-bet-info">
                <div class="history-multiplier">${bet.multiplier?.toFixed(2)}x</div>
                <div class="history-time">${new Date(bet.timestamp).toLocaleString()}</div>
            </div>
            <div class="history-bet-result">
                <div class="result-amount">${bet.amount.toFixed(2)} TON</div>
                <div class="result-profit ${bet.result}">
                    ${bet.profit >= 0 ? '+' : ''}${bet.profit.toFixed(2)} TON
                </div>
            </div>
        </div>
    `).join('');
}

// ===== Profile =====

function openProfile() {
    updateProfileDisplay();
    openModal('profileModal');
}

function shareProfile() {
    const user = window.currentUser;
    if (!user) return;
    
    const text = `🚀 I'm playing Crash Game!\n\n` +
        `🎮 Games: ${user.gamesPlayed || 0}\n` +
        `🏆 Biggest Win: ${(user.biggestWin || 0).toFixed(2)} TON\n\n` +
        `Join me: t.me/${CONFIG.BOT_USERNAME}`;
    
    if (window.tg) {
        window.tg.shareUrl?.(`https://t.me/${CONFIG.BOT_USERNAME}`, text);
    } else {
        copyToClipboard(text, 'Profile copied!');
    }
}

// ===== Admin =====

function openAdminPanel() {
    window.location.href = 'admin.html';
}

// ===== Utilities =====

function copyToClipboard(text, successMessage = 'Copied!') {
    navigator.clipboard.writeText(text).then(() => {
        showToast(successMessage, 'success');
        hapticFeedback('light');
    }).catch(() => {
        showToast('Failed to copy', 'error');
    });
}

function hapticFeedback(type = 'light') {
    if (window.tg?.HapticFeedback) {
        switch (type) {
            case 'light':
                window.tg.HapticFeedback.impactOccurred('light');
                break;
            case 'medium':
                window.tg.HapticFeedback.impactOccurred('medium');
                break;
            case 'heavy':
                window.tg.HapticFeedback.impactOccurred('heavy');
                break;
            case 'success':
                window.tg.HapticFeedback.notificationOccurred('success');
                break;
            case 'error':
                window.tg.HapticFeedback.notificationOccurred('error');
                break;
        }
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'toastSlide 0.3s ease-out reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ===== Global Exports =====
window.adjustBet = adjustBet;
window.setBetAmount = setBetAmount;
window.setBetMax = setBetMax;
window.handleMainButton = handleMainButton;
window.switchBetTab = switchBetTab;
window.switchPage = switchPage;
window.openModal = openModal;
window.closeModal = closeModal;
window.openWallet = openWallet;
window.showDepositSection = showDepositSection;
window.showWithdrawSection = showWithdrawSection;
window.showGiftSection = showGiftSection;
window.copyDepositAddress = copyDepositAddress;
window.copyMemo = copyMemo;
window.setWithdrawMax = setWithdrawMax;
window.submitWithdraw = submitWithdraw;
window.openAdminPanel = openAdminPanel;
window.shareProfile = shareProfile;
window.showToast = showToast;
window.updateBalanceDisplay = updateBalanceDisplay;
window.refreshUserData = refreshUserData;

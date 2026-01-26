// ===== Admin Panel Logic =====

const tg = window.Telegram?.WebApp;
let isAdmin = false;
let allUsers = {};
let selectedUser = null;

// ===== Initialization =====

document.addEventListener('DOMContentLoaded', async () => {
    // Init Telegram
    if (tg) {
        tg.ready();
        tg.expand();
    }
    
    await checkAdminAccess();
});

async function checkAdminAccess() {
    // Check config
    if (!isConfigured()) {
        showError();
        return;
    }
    
    // Get Telegram user
    const userId = tg?.initDataUnsafe?.user?.id?.toString();
    
    if (!userId) {
        // Test mode - allow access for testing
        console.warn('No Telegram user, running in test mode');
        isAdmin = true;
        showAdminPanel();
        return;
    }
    
    // Check if admin
    if (userId === CONFIG.ADMIN_TELEGRAM_ID) {
        isAdmin = true;
        showAdminPanel();
    } else {
        showError();
    }
}

function showAdminPanel() {
    document.getElementById('loadingScreen').classList.add('hidden');
    document.getElementById('errorScreen').classList.add('hidden');
    document.getElementById('adminPanel').classList.remove('hidden');
    document.getElementById('refreshFab').classList.remove('hidden');
    
    loadDashboard();
}

function showError() {
    document.getElementById('loadingScreen').classList.add('hidden');
    document.getElementById('adminPanel').classList.add('hidden');
    document.getElementById('errorScreen').classList.remove('hidden');
}

// ===== Load Dashboard =====

async function loadDashboard() {
    try {
        await Promise.all([
            loadStats(),
            loadConfig(),
            loadWithdrawals(),
            loadUsers(),
            loadSettings()
        ]);
    } catch (error) {
        console.error('Dashboard load error:', error);
        showToast('Failed to load data', 'error');
    }
}

async function loadStats() {
    try {
        const dbData = await db.fetch(true);
        const users = dbData.users || {};
        const stats = dbData.stats || {};
        
        const userCount = Object.keys(users).length;
        const totalBalance = Object.values(users).reduce((sum, u) => sum + (u.balance || 0), 0);
        
        document.getElementById('statUsers').textContent = userCount;
        document.getElementById('statGames').textContent = stats.totalGames || 0;
        document.getElementById('statWagered').textContent = (stats.totalWagered || 0).toFixed(1);
        document.getElementById('statBalance').textContent = totalBalance.toFixed(2);
    } catch (e) {
        console.error('Stats error:', e);
    }
}

async function loadConfig() {
    try {
        const settings = await db.getSettings();
        
        document.getElementById('configBinId').textContent = CONFIG.JSONBIN_BIN_ID || '-';
        document.getElementById('configAdminId').textContent = settings.adminId || CONFIG.ADMIN_TELEGRAM_ID;
        document.getElementById('configWallet').textContent = (settings.tonWallet || CONFIG.TON_WALLET).slice(0, 20) + '...';
    } catch (e) {
        console.error('Config error:', e);
    }
}

async function loadWithdrawals() {
    try {
        const withdrawals = await db.getPendingWithdrawals();
        const container = document.getElementById('withdrawalsList');
        const badge = document.getElementById('wdBadge');
        
        badge.textContent = withdrawals.length;
        badge.style.display = withdrawals.length > 0 ? 'inline' : 'none';
        
        if (withdrawals.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">✅</div>
                    <p>No pending withdrawals</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = withdrawals.map(w => `
            <div class="withdrawal-item">
                <div class="wd-header">
                    <span class="wd-user">${w.username || 'User'}</span>
                    <span class="wd-amount">${w.amount} TON</span>
                </div>
                <div class="wd-info">
                    ID: ${w.oderId} | ${new Date(w.createdAt).toLocaleString()}
                </div>
                <div class="wd-address">${w.walletAddress}</div>
                <div class="wd-actions">
                    <button class="btn btn-success btn-flex btn-sm" onclick="processWd('${w.id}', true)">
                        ✓ Approve
                    </button>
                    <button class="btn btn-danger btn-flex btn-sm" onclick="processWd('${w.id}', false)">
                        ✗ Reject
                    </button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('Withdrawals error:', e);
    }
}

async function loadUsers() {
    try {
        allUsers = await db.getAllUsers();
        const container = document.getElementById('usersList');
        
        const userList = Object.entries(allUsers);
        
        if (userList.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">👥</div>
                    <p>No users yet</p>
                </div>
            `;
            return;
        }
        
        // Sort by balance
        userList.sort((a, b) => (b[1].balance || 0) - (a[1].balance || 0));
        
        container.innerHTML = userList.slice(0, 50).map(([id, user]) => `
            <div class="user-item" onclick="selectUser('${id}')">
                <div class="user-info">
                    <span class="user-name">${user.odername || user.firstName || 'Unknown'}</span>
                    <span class="user-id">ID: ${id}</span>
                </div>
                <span class="user-balance">${(user.balance || 0).toFixed(2)} TON</span>
            </div>
        `).join('');
    } catch (e) {
        console.error('Users error:', e);
    }
}

async function loadSettings() {
    try {
        const settings = await db.getSettings();
        
        document.getElementById('settingMinBet').value = settings.minBet || 0.1;
        document.getElementById('settingMaxBet').value = settings.maxBet || 100;
        document.getElementById('settingMinWithdraw').value = settings.minWithdraw || 1;
        document.getElementById('settingHouseEdge').value = ((settings.houseEdge || 0.03) * 100).toFixed(1);
    } catch (e) {
        console.error('Settings error:', e);
    }
}

// ===== User Management =====

async function searchUser() {
    const searchId = document.getElementById('userSearchInput').value.trim();
    const container = document.getElementById('userSearchResult');
    
    if (!searchId) {
        container.innerHTML = '';
        return;
    }
    
    try {
        const user = await db.getUser(searchId);
        
        if (!user) {
            container.innerHTML = `
                <div class="empty-state" style="padding: 16px;">
                    <p>User not found</p>
                </div>
            `;
            return;
        }
        
        showUserDetail(searchId, user, container);
    } catch (e) {
        console.error('Search error:', e);
        container.innerHTML = '<p style="color: var(--danger); padding: 16px;">Error searching user</p>';
    }
}

function selectUser(userId) {
    const user = allUsers[userId];
    if (!user) return;
    
    document.getElementById('userSearchInput').value = userId;
    showUserDetail(userId, user, document.getElementById('userSearchResult'));
}

function showUserDetail(userId, user, container) {
    selectedUser = { id: userId, ...user };
    
    const winRate = user.gamesPlayed > 0 
        ? ((user.wins / user.gamesPlayed) * 100).toFixed(1) 
        : 0;
    
    container.innerHTML = `
        <div class="user-detail">
            <div class="user-detail-header">
                <div>
                    <div class="user-name" style="font-size: 16px;">${user.odername || user.firstName || 'Unknown'}</div>
                    <div class="user-id">ID: ${userId}</div>
                </div>
                <div class="user-balance" style="font-size: 18px;">${(user.balance || 0).toFixed(2)} TON</div>
            </div>
            
            <div class="user-stats">
                <div class="user-stat">
                    <div class="user-stat-value">${user.gamesPlayed || 0}</div>
                    <div class="user-stat-label">Games</div>
                </div>
                <div class="user-stat">
                    <div class="user-stat-value">${user.wins || 0}</div>
                    <div class="user-stat-label">Wins</div>
                </div>
                <div class="user-stat">
                    <div class="user-stat-value">${winRate}%</div>
                    <div class="user-stat-label">Win Rate</div>
                </div>
            </div>
            
            <div class="balance-editor">
                <input type="number" id="newBalanceInput" value="${user.balance || 0}" step="0.01" placeholder="New balance">
                <button class="btn btn-success btn-sm" onclick="updateUserBalance('${userId}')">Set</button>
            </div>
            
            <div style="margin-top: 12px; font-size: 12px; color: var(--text-muted);">
                Wagered: ${(user.totalWagered || 0).toFixed(2)} TON | 
                Biggest Win: ${(user.biggestWin || 0).toFixed(2)} TON |
                Joined: ${new Date(user.createdAt).toLocaleDateString()}
            </div>
        </div>
    `;
}

async function updateUserBalance(userId) {
    const newBalance = parseFloat(document.getElementById('newBalanceInput').value);
    
    if (isNaN(newBalance) || newBalance < 0) {
        showToast('Invalid balance', 'error');
        return;
    }
    
    try {
        await db.setUserBalance(userId, newBalance);
        showToast('Balance updated!', 'success');
        
        // Refresh
        await loadUsers();
        await loadStats();
        
        // Re-search to show updated
        searchUser();
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
}

// ===== Withdrawal Processing =====

async function processWd(id, approved) {
    const action = approved ? 'approve' : 'reject';
    
    if (!confirm(`Are you sure you want to ${action} this withdrawal?`)) {
        return;
    }
    
    try {
        const result = await db.processWithdrawal(id, approved);
        
        showToast(`Withdrawal ${approved ? 'approved' : 'rejected'}!`, approved ? 'success' : 'info');
        
        if (approved) {
            showToast(`Send ${result.amount} TON to: ${result.walletAddress}`, 'info');
        }
        
        await loadWithdrawals();
        await loadStats();
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
}

// ===== Game Controls =====

async function forceNewGame() {
    if (!confirm('Start a new game round?')) return;
    
    try {
        await db.startNewGame();
        showToast('New game started!', 'success');
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
}

async function forceCrash() {
    const point = prompt('Enter crash point (e.g., 1.5):');
    if (!point) return;
    
    const crashPoint = parseFloat(point);
    if (isNaN(crashPoint) || crashPoint < 1) {
        showToast('Invalid crash point', 'error');
        return;
    }
    
    try {
        await db.endGame(crashPoint);
        showToast(`Game crashed at ${crashPoint}x!`, 'success');
        await loadStats();
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
}

async function setNextCrash() {
    const point = parseFloat(document.getElementById('nextCrashInput').value);
    
    if (isNaN(point) || point < 1) {
        showToast('Invalid crash point (min 1.00)', 'error');
        return;
    }
    
    try {
        const dbData = await db.fetch(true);
        dbData.gameState = dbData.gameState || {};
        dbData.gameState.crashPoint = point;
        await db.update(dbData);
        
        showToast(`Next crash set to ${point}x`, 'success');
        document.getElementById('nextCrashInput').value = '';
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
}

// ===== Settings =====

async function saveSettings() {
    try {
        const settings = {
            minBet: parseFloat(document.getElementById('settingMinBet').value) || 0.1,
            maxBet: parseFloat(document.getElementById('settingMaxBet').value) || 100,
            minWithdraw: parseFloat(document.getElementById('settingMinWithdraw').value) || 1,
            houseEdge: (parseFloat(document.getElementById('settingHouseEdge').value) || 3) / 100
        };
        
        await db.updateSettings(settings);
        showToast('Settings saved!', 'success');
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
}

// ===== UI Helpers =====

function toggleSection(section) {
    const content = document.getElementById(section + 'Content');
    const arrow = document.getElementById(section + 'Arrow');
    
    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        arrow.textContent = '▲';
    } else {
        content.classList.add('collapsed');
        arrow.textContent = '▼';
    }
}

async function refreshAll() {
    showToast('Refreshing...', 'info');
    await loadDashboard();
    showToast('Data refreshed!', 'success');
}

function goBack() {
    if (tg) {
        tg.close();
    } else {
        window.location.href = 'index.html';
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}

// Auto refresh
setInterval(() => {
    if (isAdmin) {
        loadWithdrawals();
        loadStats();
    }
}, 30000);

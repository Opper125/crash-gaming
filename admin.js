const tg = window.Telegram?.WebApp;
let isAdmin = false;
let allUsers = {};

document.addEventListener('DOMContentLoaded', async () => {
    if (tg) { tg.ready(); tg.expand(); }
    await checkAccess();
});

async function checkAccess() {
    if (!isConfigured()) {
        document.getElementById('loading').textContent = '⚠️ BIN_ID not set!';
        return;
    }
    
    const uid = tg?.initDataUnsafe?.user?.id?.toString();
    
    if (!uid) {
        // Test mode
        isAdmin = true;
        showAdmin();
        return;
    }
    
    if (uid === CONFIG.ADMIN_ID) {
        isAdmin = true;
        showAdmin();
    } else {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('denied').classList.remove('hidden');
    }
}

function showAdmin() {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('admin').classList.remove('hidden');
    loadAll();
}

async function loadAll() {
    await Promise.all([loadStats(), loadConfig(), loadWd(), loadUsers(), loadSettings()]);
}

async function loadStats() {
    try {
        const data = await db.fetch(true);
        const users = data.users || {};
        const stats = data.stats || {};
        const total = Object.values(users).reduce((s, u) => s + (u.balance || 0), 0);
        
        document.getElementById('sUsers').textContent = Object.keys(users).length;
        document.getElementById('sGames').textContent = stats.totalGames || 0;
        document.getElementById('sWagered').textContent = (stats.totalWagered || 0).toFixed(1);
        document.getElementById('sBalance').textContent = total.toFixed(2);
    } catch (e) { console.error(e); }
}

async function loadConfig() {
    document.getElementById('cfgBin').textContent = CONFIG.JSONBIN_BIN_ID || 'NOT SET!';
    document.getElementById('cfgAdmin').textContent = CONFIG.ADMIN_ID;
    document.getElementById('cfgWallet').textContent = CONFIG.TON_WALLET.slice(0, 15) + '...';
}

async function loadWd() {
    try {
        const list = await db.getPendingWithdrawals();
        const el = document.getElementById('wdList');
        document.getElementById('wdBadge').textContent = list.length;
        
        if (!list.length) { el.innerHTML = '<div class="empty">No pending</div>'; return; }
        
        el.innerHTML = list.map(w => `
            <div class="wd-item">
                <div class="wd-head">
                    <span class="wd-user">${w.username || 'User'}</span>
                    <span class="wd-amount">${w.amount} TON</span>
                </div>
                <div class="wd-info">ID: ${w.oderId} | ${new Date(w.createdAt).toLocaleString()}</div>
                <div class="wd-addr">${w.address}</div>
                <div class="wd-actions">
                    <button class="btn btn-success" onclick="processWd('${w.id}',true)">✓</button>
                    <button class="btn btn-danger" onclick="processWd('${w.id}',false)">✗</button>
                </div>
            </div>
        `).join('');
    } catch (e) { console.error(e); }
}

async function processWd(id, ok) {
    if (!confirm(ok ? 'Approve?' : 'Reject?')) return;
    try {
        const r = await db.processWithdraw(id, ok);
        toast(ok ? 'Approved!' : 'Rejected!', ok ? 'success' : 'info');
        if (ok) toast('Send ' + r.amount + ' TON to: ' + r.address, 'info');
        loadWd();
        loadStats();
    } catch (e) { toast(e.message, 'error'); }
}

async function loadUsers() {
    try {
        allUsers = await db.getAllUsers();
        const el = document.getElementById('usersList');
        const list = Object.entries(allUsers);
        
        if (!list.length) { el.innerHTML = '<div class="empty">No users</div>'; return; }
        
        list.sort((a, b) => (b[1].balance || 0) - (a[1].balance || 0));
        
        el.innerHTML = list.slice(0, 50).map(([id, u]) => `
            <div class="user-item" onclick="selectUser('${id}')">
                <div><div class="user-name">${u.odername || 'Unknown'}</div><div class="user-id">ID: ${id}</div></div>
                <div class="user-bal">${(u.balance || 0).toFixed(2)} TON</div>
            </div>
        `).join('');
    } catch (e) { console.error(e); }
}

async function searchUser() {
    const id = document.getElementById('searchInput').value.trim();
    const el = document.getElementById('searchResult');
    if (!id) { el.innerHTML = ''; return; }
    
    try {
        const u = await db.getUser(id);
        if (!u) { el.innerHTML = '<div class="empty">Not found</div>'; return; }
        showUserDetail(id, u, el);
    } catch (e) { el.innerHTML = '<div class="empty">Error</div>'; }
}

function selectUser(id) {
    const u = allUsers[id];
    if (!u) return;
    document.getElementById('searchInput').value = id;
    showUserDetail(id, u, document.getElementById('searchResult'));
}

function showUserDetail(id, u, el) {
    el.innerHTML = `
        <div style="background:var(--bg);padding:14px;border-radius:10px;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                <div><div class="user-name">${u.odername || 'Unknown'}</div><div class="user-id">ID: ${id}</div></div>
                <div class="user-bal">${(u.balance || 0).toFixed(2)} TON</div>
            </div>
            <div style="font-size:12px;color:var(--text2);margin-bottom:10px;">
                Games: ${u.gamesPlayed || 0} | Wins: ${u.wins || 0} | Wagered: ${(u.totalWagered || 0).toFixed(2)}
            </div>
            <div class="balance-edit">
                <input type="number" id="newBal" value="${u.balance || 0}" step="0.01">
                <button onclick="setBal('${id}')">Set</button>
            </div>
        </div>
    `;
}

async function setBal(id) {
    const v = parseFloat(document.getElementById('newBal').value);
    if (isNaN(v) || v < 0) { toast('Invalid', 'error'); return; }
    try {
        await db.setBalance(id, v);
        toast('Updated!', 'success');
        loadUsers();
        loadStats();
        searchUser();
    } catch (e) { toast(e.message, 'error'); }
}

async function loadSettings() {
    document.getElementById('setMinBet').value = CONFIG.MIN_BET;
    document.getElementById('setMaxBet').value = CONFIG.MAX_BET;
    document.getElementById('setMinWd').value = CONFIG.MIN_WITHDRAW;
    document.getElementById('setEdge').value = CONFIG.HOUSE_EDGE * 100;
}

async function saveSettings() {
    toast('Settings are hardcoded in api.js', 'info');
}

async function newGame() {
    if (!confirm('Start new game?')) return;
    try {
        await db.newGame();
        toast('Started!', 'success');
    } catch (e) { toast(e.message, 'error'); }
}

async function forceCrash() {
    const p = prompt('Crash point:');
    if (!p) return;
    const v = parseFloat(p);
    if (isNaN(v) || v < 1) { toast('Invalid', 'error'); return; }
    try {
        await db.endGame(v);
        toast('Crashed at ' + v + 'x!', 'success');
        loadStats();
    } catch (e) { toast(e.message, 'error'); }
}

async function setCrash() {
    const v = parseFloat(document.getElementById('crashInput').value);
    if (isNaN(v) || v < 1) { toast('Invalid', 'error'); return; }
    try {
        const data = await db.fetch(true);
        data.gameState = data.gameState || {};
        data.gameState.crashPoint = v;
        await db.save(data);
        toast('Next crash: ' + v + 'x', 'success');
        document.getElementById('crashInput').value = '';
    } catch (e) { toast(e.message, 'error'); }
}

function toggle(s) {
    const b = document.getElementById(s + 'B');
    const a = document.getElementById(s + 'A');
    b.classList.toggle('collapsed');
    a.textContent = b.classList.contains('collapsed') ? '▼' : '▲';
}

function goBack() {
    if (tg) tg.close();
    else window.location.href = 'index.html';
}

function toast(m, t = 'info') {
    const c = document.getElementById('toasts');
    const e = document.createElement('div');
    e.className = 'toast ' + t;
    e.textContent = m;
    c.appendChild(e);
    setTimeout(() => e.remove(), 3000);
}

setInterval(() => { if (isAdmin) { loadWd(); loadStats(); } }, 30000);

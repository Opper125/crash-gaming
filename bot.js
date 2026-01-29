/* =========================================================
   TELEGRAM BOT – CRASH GAME
   ========================================================= */

import './api.js';

import TelegramBot from 'node-telegram-bot-api';

const db = window.db;
const CONFIG = window.CONFIG;

/* ================= BOT INIT ================= */

const bot = new TelegramBot(CONFIG.BOT_TOKEN, {
    polling: true
});

console.log('[BOT] Started');

/* ================= UTILS ================= */

function webAppKeyboard(url) {
    return {
        reply_markup: {
            inline_keyboard: [[
                {
                    text: '🎮 Play Crash Game',
                    web_app: { url }
                }
            ]]
        }
    };
}

function mainMenu(chatId) {
    bot.sendMessage(
        chatId,
        '🎰 *Crash Game Menu*',
        {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    ['🎮 Play', '💰 Balance'],
                    ['🎁 Gift Deposit', '📜 History'],
                    ['📤 Withdraw']
                ],
                resize_keyboard: true
            }
        }
    );
}

/* ================= START / LOGIN ================= */

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    await db.createUser(userId, {
        firstName: msg.from.first_name,
        username: msg.from.username
    });

    bot.sendMessage(
        chatId,
        `👋 Welcome *${msg.from.first_name}*!\n\n` +
        `This is a *Live Crash Game*.\n` +
        `All players play the same round in real-time.`,
        { parse_mode: 'Markdown' }
    );

    mainMenu(chatId);
});

/* ================= PLAY ================= */

bot.onText(/🎮 Play/, async (msg) => {
    const chatId = msg.chat.id;
    const url = `https://YOUR_DOMAIN/index.html?uid=${msg.from.id}`;
    bot.sendMessage(
        chatId,
        '🚀 Launching game...',
        webAppKeyboard(url)
    );
});

/* ================= BALANCE ================= */

bot.onText(/💰 Balance/, async (msg) => {
    const user = await db.getUser(msg.from.id);
    if (!user) return;

    bot.sendMessage(
        msg.chat.id,
        `💰 *Your Balance*\n\n` +
        `TON: *${user.balance.toFixed(2)}*`,
        { parse_mode: 'Markdown' }
    );
});

/* ================= HISTORY ================= */

bot.onText(/📜 History/, async (msg) => {
    const user = await db.getUser(msg.from.id);
    if (!user || !user.betHistory?.length) {
        bot.sendMessage(msg.chat.id, 'No history yet.');
        return;
    }

    const lines = user.betHistory.slice(0, 10).map(h =>
        `• ${h.result.toUpperCase()} | ${h.amount} → ${h.multiplier}x (${h.profit})`
    ).join('\n');

    bot.sendMessage(
        msg.chat.id,
        `📜 *Last Bets*\n\n${lines}`,
        { parse_mode: 'Markdown' }
    );
});

/* ================= GIFT DEPOSIT ================= */

bot.onText(/🎁 Gift Deposit/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const req = await db.createGiftDepositRequest(userId);

    bot.sendMessage(
        chatId,
        `🎁 *Gift Deposit*\n\n` +
        `Send your Telegram Gift / TON NFT to:\n` +
        `\`${CONFIG.GIFT_OWNER_WALLET}\`\n\n` +
        `⚠️ IMPORTANT:\n` +
        `Put this ID in *comment/message*:\n` +
        `\`${req.id}\`\n\n` +
        `After sending, press *Verify*.`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '✅ Verify Gift', callback_data: 'verify_gift' }
                ]]
            }
        }
    );
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const userId = q.from.id;

    if (q.data === 'verify_gift') {
        try {
            const res = await db.verifyGiftDeposit(userId);
            if (!res.ok) {
                bot.sendMessage(chatId, res.message);
            } else {
                bot.sendMessage(
                    chatId,
                    `✅ Gift confirmed!\nCredited: *${res.credit} TON*`,
                    { parse_mode: 'Markdown' }
                );
            }
        } catch (e) {
            bot.sendMessage(chatId, '❌ Verification failed.');
        }
    }
});

/* ================= WITHDRAW ================= */

bot.onText(/📤 Withdraw/, async (msg) => {
    bot.sendMessage(
        msg.chat.id,
        `📤 *Withdraw TON*\n\n` +
        `Format:\n` +
        `/withdraw AMOUNT TON_ADDRESS`,
        { parse_mode: 'Markdown' }
    );
});

bot.onText(/\/withdraw (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const parts = match[1].split(' ');
    if (parts.length < 2) return;

    const amount = Number(parts[0]);
    const address = parts[1];

    try {
        const req = await db.withdraw(userId, amount, address);
        bot.sendMessage(
            chatId,
            `⏳ Withdrawal request created.\nID: ${req.id}`
        );

        // Notify admin
        bot.sendMessage(
            CONFIG.ADMIN_ID,
            `📤 New withdrawal\nUser: ${userId}\nAmount: ${amount}\nID: ${req.id}`
        );
    } catch (e) {
        bot.sendMessage(chatId, '❌ ' + e.message);
    }
});

/* ================= ADMIN ================= */

bot.onText(/\/admin/, async (msg) => {
    if (String(msg.from.id) !== String(CONFIG.ADMIN_ID)) return;

    const pending = await db.getPendingWithdrawals();
    if (!pending.length) {
        bot.sendMessage(msg.chat.id, 'No pending withdrawals.');
        return;
    }

    for (const w of pending) {
        bot.sendMessage(
            msg.chat.id,
            `Withdraw ID: ${w.id}\nUser: ${w.oderId}\nAmount: ${w.amount}`,
            {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ Approve', callback_data: `approve_${w.id}` },
                        { text: '❌ Reject', callback_data: `reject_${w.id}` }
                    ]]
                }
            }
        );
    }
});

bot.on('callback_query', async (q) => {
    if (String(q.from.id) !== String(CONFIG.ADMIN_ID)) return;

    if (q.data.startsWith('approve_')) {
        const id = q.data.replace('approve_', '');
        await db.processWithdraw(id, true);
        bot.sendMessage(q.message.chat.id, `✅ Approved ${id}`);
    }

    if (q.data.startsWith('reject_')) {
        const id = q.data.replace('reject_', '');
        await db.processWithdraw(id, false);
        bot.sendMessage(q.message.chat.id, `❌ Rejected ${id}`);
    }
});

/* ================= GIFT LOSS HOOK ================= */
/*
 When user bets with Gift (future step):
 - bet.asset === 'GIFT'
 - on loss:
   → call TON / Telegram API
   → transfer NFT to CONFIG.GIFT_OWNER_WALLET
 This hook is triggered from api.js endGame()
*/

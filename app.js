require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, {polling: true});

const DB_USERS = path.join(__dirname, 'database', 'users.json');
const DB_RESULTS = path.join(__dirname, 'database', 'results.json');

if (!fs.existsSync(DB_USERS)) fs.writeFileSync(DB_USERS, JSON.stringify([]));
if (!fs.existsSync(DB_RESULTS)) fs.writeFileSync(DB_RESULTS, JSON.stringify([]));

const readDB = (file) => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return []; }
};
const saveDB = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

const subjects = {
    ingliz_tili: { name: '📖 Ingliz tili', file: 'ingliz_tili.json' },
    tarix: { name: '📜 Tarix', file: 'tarix.json' },
    kimyo: { name: '⚗️ Kimyo', file: 'kimyo.json' }
};

const getQuestions = (subjectId) => {
    const filePath = path.join(__dirname, 'data', subjects[subjectId].file);
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
    catch { return []; }
};

const userState = {};

const sendMainMenu = (chatId) => {
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📚 Fanlar', callback_data: 'menu_fanlar' }, { text: '📊 Natijalarim', callback_data: 'menu_natijalar' }]
            ]
        }
    };
    bot.sendMessage(chatId, "Asosiy menyu:", opts);
};

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const users = readDB(DB_USERS);
    const userExists = users.find(u => u.chatId === chatId);

    if (userExists) {
        sendMainMenu(chatId);
    } else {
        const opts = {
            reply_markup: {
                keyboard: [[{ text: 'Telefon raqamingizni ulashing', request_contact: true }]],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        };
        bot.sendMessage(chatId, "Assalomu alaykum! Iltimos, telefon raqamingizni ulashing:", opts);
    }
});

bot.on('contact', (msg) => {
    const chatId = msg.chat.id;
    const users = readDB(DB_USERS);
    if (!users.find(u => u.chatId === chatId)) {
        users.push({
            name: msg.contact.first_name || 'Foydalanuvchi',
            phone: msg.contact.phone_number,
            chatId: chatId
        });
        saveDB(DB_USERS, users);
    }
    bot.sendMessage(chatId, "Registratsiyadan o'tdingiz!", { reply_markup: { remove_keyboard: true } });
    sendMainMenu(chatId);
});

bot.on('message', (msg) => {
    if (msg.text && msg.text !== '/start' && !msg.contact) {
        // Just a normal text message, prompt buttons
        // Unless they are answering? We use inline buttons so no text input expected.
        const users = readDB(DB_USERS);
        if (users.find(u => u.chatId === msg.chat.id)) {
            // bot.sendMessage(msg.chat.id, "Iltimos, tugmalardan foydalaning.");
        } else {
            bot.sendMessage(msg.chat.id, "Iltimos, telefon raqamingizni ulashing.");
        }
    }
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const messageId = query.message.message_id;

    if (data === 'menu_fanlar') {
        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: subjects.ingliz_tili.name, callback_data: 'sub_ingliz_tili' }],
                    [{ text: subjects.tarix.name, callback_data: 'sub_tarix' }],
                    [{ text: subjects.kimyo.name, callback_data: 'sub_kimyo' }],
                    [{ text: '🔙 Ortga', callback_data: 'menu_main' }]
                ]
            }
        };
        bot.editMessageText("Fanlardan birini tanlang:", { chat_id: chatId, message_id: messageId, ...opts });
    }
    else if (data === 'menu_main') {
        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📚 Fanlar', callback_data: 'menu_fanlar' }, { text: '📊 Natijalarim', callback_data: 'menu_natijalar' }]
                ]
            }
        };
        bot.editMessageText("Asosiy menyu:", { chat_id: chatId, message_id: messageId, ...opts });
    }
    else if (data === 'menu_natijalar') {
        const results = readDB(DB_RESULTS).filter(r => r.chatId === chatId);
        if (results.length === 0) {
            bot.editMessageText("Sizda hali natijalar yo'q.", {
                chat_id: chatId, message_id: messageId,
                reply_markup: { inline_keyboard: [[{ text: '🔙 Ortga', callback_data: 'menu_main' }]] }
            });
            return;
        }

        let text = "📊 Sizning natijalaringiz:\n\n";
        const resBySub = {};
        results.forEach(r => {
            if (!resBySub[r.fan]) resBySub[r.fan] = [];
            resBySub[r.fan].push(r);
        });

        for (const [subKey, reqs] of Object.entries(resBySub)) {
            text += `${subjects[subKey]?.name || subKey}\n`;
            reqs.forEach(r => {
                const date = new Date(r.sana).toLocaleDateString('ru-RU');
                text += `  • ${r.daraja} | ${r.togri}/${r.jami} = ${r.foiz}% | ${date}\n`;
            });
            text += "\n";
        }

        bot.editMessageText(text, {
            chat_id: chatId, message_id: messageId,
            reply_markup: { inline_keyboard: [[{ text: '🏠 Asosiy menyu', callback_data: 'menu_main' }]] }
        });
    }
    else if (data.startsWith('sub_')) {
        const sub = data.replace('sub_', '');
        userState[chatId] = { fan: sub };
        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '10 daqiqa', callback_data: 'time_10' }, { text: '20 daqiqa', callback_data: 'time_20' }, { text: '30 daqiqa', callback_data: 'time_30' }],
                    [{ text: '🔙 Ortga', callback_data: 'menu_fanlar' }]
                ]
            }
        };
        bot.editMessageText("⏱ Testni qancha vaqtda ishlaysiz?", { chat_id: chatId, message_id: messageId, ...opts });
    }
    else if (data.startsWith('time_')) {
        if (!userState[chatId]) return;
        userState[chatId].time = parseInt(data.replace('time_', ''));
        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '5 ta', callback_data: 'count_5' }, { text: '10 ta', callback_data: 'count_10' }],
                    [{ text: '20 ta', callback_data: 'count_20' }, { text: '30 ta', callback_data: 'count_30' }],
                    [{ text: '🔙 Ortga', callback_data: 'menu_fanlar' }]
                ]
            }
        };
        bot.editMessageText("📝 Nechta savol ishlaysiz?", { chat_id: chatId, message_id: messageId, ...opts });
    }
    else if (data.startsWith('count_')) {
        if (!userState[chatId]) return;
        userState[chatId].count = parseInt(data.replace('count_', ''));
        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🟢 Oson', callback_data: 'level_oson' }, { text: '🟡 O\'rta', callback_data: 'level_orta' }, { text: '🔴 Qiyin', callback_data: 'level_qiyin' }],
                    [{ text: '🔙 Ortga', callback_data: 'menu_fanlar' }]
                ]
            }
        };
        bot.editMessageText("🎯 Test darajasini tanlang:", { chat_id: chatId, message_id: messageId, ...opts });
    }
    else if (data.startsWith('level_')) {
        if (!userState[chatId]) return;
        userState[chatId].level = data.replace('level_', '');
        
        const state = userState[chatId];
        const text = `✅ Sozlamalar:\n- Fan: ${subjects[state.fan].name}\n- Vaqt: ${state.time} daqiqa\n- Savollar: ${state.count} ta\n- Daraja: ${state.level === 'oson' ? "Oson" : state.level === 'orta' ? "O'rta" : "Qiyin"}`;
        
        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '▶️ Testni boshlash', callback_data: 'start_test' }],
                    [{ text: '🔙 Ortga', callback_data: 'menu_fanlar' }]
                ]
            }
        };
        bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts });
    }
    else if (data === 'start_test') {
        const state = userState[chatId];
        if (!state) return;
        
        const allQuestions = getQuestions(state.fan).filter(q => q.daraja === state.level);
        // Randomize questions
        allQuestions.sort(() => Math.random() - 0.5);
        state.questions = allQuestions.slice(0, state.count);
        state.currentIndex = 0;
        state.correct = 0;
        state.startTime = Date.now();
        
        bot.deleteMessage(chatId, messageId).catch(e => {});
        sendQuestion(chatId);
    }
    else if (data.startsWith('ans_')) {
        const ans = data.replace('ans_', '');
        const state = userState[chatId];
        if (!state || !state.questions) return;
        
        // Time check
        const elapsed = (Date.now() - state.startTime) / 1000;
        const totalSecs = state.time * 60;
        if (elapsed > totalSecs) {
            bot.editMessageText("⏳ Vaqt tugadi!", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });
            finishTest(chatId);
            return;
        }

        const q = state.questions[state.currentIndex];
        if (ans === q.togri) {
            state.correct++;
        }
        
        state.currentIndex++;
        bot.deleteMessage(chatId, messageId).catch(e => {});
        
        if (state.currentIndex >= state.questions.length) {
            finishTest(chatId);
        } else {
            sendQuestion(chatId);
        }
    }
});

const sendQuestion = (chatId) => {
    const state = userState[chatId];
    if (!state) return;
    
    const q = state.questions[state.currentIndex];
    const elapsed = (Date.now() - state.startTime) / 1000;
    const totalSecs = state.time * 60;
    const remaining = totalSecs - elapsed;
    
    if (remaining <= 0) {
        finishTest(chatId);
        return;
    }
    
    const m = Math.floor(remaining / 60);
    const s = Math.floor(remaining % 60);
    const timeStr = `${m}:${s < 10 ? '0' : ''}${s}`;

    let text = `❓ Savol ${state.currentIndex + 1}/${state.count}\n\n`;
    text += `"${q.savol}"\n\n`;
    const letters = ['A', 'B', 'C', 'D'];
    q.variantlar.forEach((v, i) => {
        text += `${letters[i]}) ${v}\n`;
    });
    text += `\n⏳ Qolgan vaqt: ${timeStr}`;

    const opts = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: 'A', callback_data: 'ans_A' },
                    { text: 'B', callback_data: 'ans_B' },
                    { text: 'C', callback_data: 'ans_C' },
                    { text: 'D', callback_data: 'ans_D' }
                ]
            ]
        }
    };
    
    bot.sendMessage(chatId, text, opts);
};

const finishTest = (chatId) => {
    const state = userState[chatId];
    if (!state) return;

    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = Math.floor(elapsed % 60);
    const timeStr = `${m}:${s < 10 ? '0' : ''}${s}`;
    
    const percentage = Math.round((state.correct / state.count) * 100);
    let grade = "Qoniqarsiz";
    if (percentage >= 86) grade = "A'lo";
    else if (percentage >= 71) grade = "Yaxshi";
    else if (percentage >= 56) grade = "Qoniqarli";

    let text = `🏁 Test yakunlandi!\n\n`;
    text += `📚 Fan: ${subjects[state.fan].name}\n`;
    const darajaName = state.level === 'oson' ? 'Oson' : state.level === 'orta' ? "O'rta" : "Qiyin";
    text += `🎯 Daraja: ${darajaName}\n`;
    text += `⏱ Sarflangan vaqt: ${timeStr}\n`;
    text += `✅ To'g'ri javoblar: ${state.correct}/${state.count}\n`;
    text += `📊 Natija: ${percentage}%\n`;
    text += `⭐ Baho: ${grade}\n\n━━━━━━━━━━━━━━━`;

    const results = readDB(DB_RESULTS);
    results.push({
        chatId: chatId,
        fan: state.fan,
        daraja: darajaName,
        togri: state.correct,
        jami: state.count,
        foiz: percentage,
        vaqt: timeStr,
        sana: new Date().toISOString()
    });
    saveDB(DB_RESULTS, results);

    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔄 Qaytadan ishlash', callback_data: `sub_${state.fan}` }],
                [{ text: '🏠 Asosiy menyu', callback_data: 'menu_main' }]
            ]
        }
    };

    bot.sendMessage(chatId, text, opts);
    delete userState[chatId];
};

console.log("Bot is running...");

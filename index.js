const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const TelegramBot = require('node-telegram-bot-api');

// ==== Cấu hình ====
const BOT_TOKEN = process.env.BOT_TOKEN || '8328121313:AAHV9V16SLf17VuT4PZza2lfG49hquIfM6U';
const ADMIN_ID = process.env.ADMIN_ID || '7853576129'; // chỉnh theo bạn
const LOG_GROUP_ID = process.env.LOG_GROUP_ID || '-1002817772823'; // nhóm log nếu có
const PORT = process.env.PORT || 10000;
const PUBLIC_URL = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL; // Render tự cấp

if (!BOT_TOKEN) {
  console.error('❌ Thiếu BOT_TOKEN');
  process.exit(1);
}

// ==== Khởi tạo bot webhook ====
const app = express();
app.use(express.json());
const bot = new TelegramBot(BOT_TOKEN);

const WEBHOOK_PATH = `/webhook/${BOT_TOKEN.split(':')[0]}`;

app.get('/', (req, res) => {
  res.send('✅ Bot is running. Use /start in Telegram.');
});
app.post(WEBHOOK_PATH, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ==== DB đơn giản bằng JSON (demo) ====
const DATA_DIR = path.join(__dirname, 'data');
const USER_FILE = path.join(DATA_DIR, 'data_user.json'); // [{id, sodu, vip, nap, rut, dautu, hoahong, ref, lastCheckin}]
const TRANS_FILE = path.join(DATA_DIR, 'data_naprut.txt');
const REF_FILE = path.join(DATA_DIR, 'data_ref.txt');
const DAUTU_FILE = path.join(DATA_DIR, 'data_dautu.txt');
const BOT_FILE = path.join(DATA_DIR, 'data_bot.txt');

async function ensureFiles() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const defaults = [
    [USER_FILE, '[]'],
    [TRANS_FILE, ''],
    [REF_FILE, ''],
    [DAUTU_FILE, ''],
    [BOT_FILE, 'WELCOME=Chào mừng tới bot!\nCHECKIN=+3000 xu mỗi ngày']
  ];
  for (const [file, content] of defaults) {
    try { await fsp.access(file); } catch { await fsp.writeFile(file, content); }
  }
}

function nowVN() {
  const d = new Date();
  return new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().replace('T',' ').substring(0,19);
}

async function readUsers() { try { return JSON.parse(await fsp.readFile(USER_FILE,'utf8')); } catch { return []; } }
async function writeUsers(arr) { await fsp.writeFile(USER_FILE, JSON.stringify(arr, null, 2)); }

async function getUser(uid) {
  const users = await readUsers();
  let u = users.find(x => String(x.id) === String(uid));
  if (!u) {
    u = { id: String(uid), sodu: 0, vip: 0, nap: 0, rut: 0, dautu: 0, hoahong: 0, ref: null, lastCheckin: null };
    users.push(u);
    await writeUsers(users);
  }
  return u;
}

async function updateUser(uid, patch) {
  const users = await readUsers();
  const idx = users.findIndex(x => String(x.id) === String(uid));
  if (idx === -1) return;
  users[idx] = { ...users[idx], ...patch };
  await writeUsers(users);
}

async function addBalance(uid, amount) {
  const u = await getUser(uid);
  const newBal = (u.sodu || 0) + amount;
  await updateUser(uid, { sodu: newBal });
  return newBal;
}

// ==== UI Helpers ====
function mainMenu() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: '📄 TÀI KHOẢN' }, { text: '💳 NẠP RÚT' }],
        [{ text: '📈 ĐẦU TƯ' }, { text: '🆘 HỖ TRỢ' }],
        [{ text: '👥 MỜI BẠN' }]
      ],
      resize_keyboard: true
    },
    parse_mode: 'HTML'
  };
}

function napRutMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🏦 Ngân Hàng (VietQR)', callback_data: 'NR_BANK' }],
        [{ text: '📱 MoMo', callback_data: 'NR_MOMO' }, { text: '💳 Thẻ Cào', callback_data: 'NR_CARD' }],
        [{ text: '⬅️ Quay lại', callback_data: 'BACK_HOME' }]
      ]
    }, parse_mode: 'HTML'
  };
}

function dauTuMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚀 Gói Thường', callback_data: 'DT_GOI1' }, { text: '🌟 Gói VIP', callback_data: 'DT_GOI2' }],
        [{ text: '📜 Lịch sử đầu tư', callback_data: 'DT_HISTORY' }],
        [{ text: '⬅️ Quay lại', callback_data: 'BACK_HOME' }]
      ]
    }, parse_mode: 'HTML'
  };
}

function supportMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📨 Liên hệ Admin', url: `https://t.me/${ADMIN_ID}` }],
        [{ text: '📢 Nhóm thông báo', url: 'https://t.me/' }],
        [{ text: '⬅️ Quay lại', callback_data: 'BACK_HOME' }]
      ]
    }, parse_mode: 'HTML'
  };
}

function formatMoney(n) { return new Intl.NumberFormat('vi-VN').format(n); }

// ==== Bot handlers ====
ensureFiles().then(async () => {
  app.listen(PORT, async () => {
    console.log('🚀 Listening on', PORT);
    if (PUBLIC_URL) {
      try {
        await bot.setWebHook(`${PUBLIC_URL}${WEBHOOK_PATH}`);
        console.log('✅ Webhook set:', `${PUBLIC_URL}${WEBHOOK_PATH}`);
      } catch (e) { console.error('Set webhook fail', e.message); }
    } else {
      console.warn('⚠️ Chưa có PUBLIC_URL/RENDER_EXTERNAL_URL');
    }
  });
});

bot.onText(/^\/start(?:\s+(\S+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const from = msg.from;
  // Referral
  if (match && match[1]) {
    const refId = match[1];
    const me = await getUser(from.id);
    if (!me.ref && refId !== String(from.id)) {
      await updateUser(from.id, { ref: String(refId) });
      await updateUser(refId, { hoahong: (await getUser(refId)).hoahong + 1000 });
      try { await bot.sendMessage(refId, `🎉 Bạn vừa giới thiệu thành công <b>${from.first_name}</b>! +1,000 xu hoa hồng`, { parse_mode: 'HTML' }); } catch {}
    }
  }

  const u = await getUser(from.id);
  const text = `👋 <b>Chào ${from.first_name || 'bạn'}</b>\n\n`+
  `🆔 ID: <code>${from.id}</code>\n`+
  `💰 Số dư: <b>${formatMoney(u.sodu)} xu</b>\n`+
  `👑 VIP: <b>${u.vip}</b>\n`+
  `👥 Ref: <b>${u.ref ? u.ref : 'Chưa có'}</b>\n\n`+
  `Dùng menu bên dưới để thao tác.`;
  await bot.sendMessage(chatId, text, mainMenu());
});

bot.onText(/^\/menu|^\/help$/i, async (msg) => {
  bot.sendMessage(msg.chat.id, '🧭 <b>Menu chính</b>', mainMenu());
});

bot.onText(/^\/id$/i, async (msg) => {
  bot.sendMessage(msg.chat.id, `🆔 <code>${msg.from.id}</code>`, { parse_mode: 'HTML' });
});

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const text = msg.text.trim();
  const chatId = msg.chat.id;
  const from = msg.from;

  if (text === '📄 TÀI KHOẢN') {
    const u = await getUser(from.id);
    const kb = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🗓️ Điểm danh +3000', callback_data: 'ACC_CHECKIN' }],
          [{ text: '📜 Lịch sử', callback_data: 'ACC_HISTORY' }],
          [{ text: '⬅️ Quay lại', callback_data: 'BACK_HOME' }]
        ]
      }, parse_mode: 'HTML'
    };
    const body = `👤 <b>Tài khoản</b>\n`+
      `🆔 <code>${from.id}</code>\n`+
      `💰 Số dư: <b>${formatMoney((await getUser(from.id)).sodu)} xu</b>\n`+
      `👑 VIP: <b>${(await getUser(from.id)).vip}</b>`;
    return bot.sendMessage(chatId, body, kb);
  }

  if (text === '💳 NẠP RÚT') {
    return bot.sendMessage(chatId, '💳 <b>Chọn phương thức</b>', napRutMenu());
  }

  if (text === '📈 ĐẦU TƯ') {
    return bot.sendMessage(chatId, '📈 <b>Danh mục đầu tư</b>', dauTuMenu());
  }

  if (text === '🆘 HỖ TRỢ') {
    return bot.sendMessage(chatId, '🆘 <b>Hỗ trợ</b>', supportMenu());
  }

  if (text === '👥 MỜI BẠN') {
    const link = `https://t.me/${(await bot.getMe()).username}?start=${from.id}`;
    const msgTxt = `👥 <b>Giới thiệu bạn bè</b>\n`+
      `🔗 Link: ${link}\n`+
      `💸 Nhận <b>1,000 xu</b> khi bạn được mời dùng /start qua link của bạn.`;
    return bot.sendMessage(chatId, msgTxt, { parse_mode: 'HTML' });
  }
});

bot.on('callback_query', async (cq) => {
  const { id, data, message, from } = cq;
  const chatId = message.chat.id;
  try { await bot.answerCallbackQuery(id); } catch {}

  // Quay lại menu chính
  if (data === 'BACK_HOME') {
    return bot.editMessageText('🏠 <b>Menu chính</b>', { chat_id: chatId, message_id: message.message_id, ...mainMenu() });
  }

  if (data === 'ACC_CHECKIN') {
    const u = await getUser(from.id);
    const today = new Date().toISOString().substring(0,10);
    const last = u.lastCheckin ? u.lastCheckin.substring(0,10) : null;
    if (last === today) {
      return bot.answerCallbackQuery(id, { text: 'Bạn đã điểm danh hôm nay rồi!', show_alert: true });
    }
    await updateUser(from.id, { lastCheckin: nowVN() });
    const bal = await addBalance(from.id, 3000);
    await bot.editMessageText(`✅ Điểm danh thành công! +3,000 xu\n💰 Số dư hiện tại: <b>${formatMoney(bal)} xu</b>`, { chat_id: chatId, message_id: message.message_id, parse_mode: 'HTML' });
    try { await bot.sendMessage(LOG_GROUP_ID, `🗓️ CHECKIN | +3000 | ${nowVN()} | ID ${from.id}`); } catch {}
    return;
  }

  if (data === 'ACC_HISTORY') {
    const content = (await fsp.readFile(TRANS_FILE, 'utf8')).trim() || 'Chưa có lịch sử.';
    return bot.editMessageText(`📜 <b>Lịch sử nạp/rút</b>\n\n<pre>${content}</pre>`, { chat_id: chatId, message_id: message.message_id, parse_mode: 'HTML' });
  }

  // Nạp rút
  if (data === 'NR_BANK') {
    // Demo hiển thị form nạp bank (VietQR)
    const formId = uuidv4().slice(0,8).toUpperCase();
    const text = `🏦 <b>Nạp qua Ngân Hàng (VietQR)</b>\n`+
      `Mã phiên: <code>${formId}</code>\n\n`+
      `1) Gửi số tiền bạn muốn nạp (VD: 50000)\n`+
      `2) Bot sẽ tạo nội dung chuyển khoản và QR mẫu.`;
    await bot.editMessageText(text, { chat_id: chatId, message_id: message.message_id, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '⬅️ Quay lại', callback_data: 'BACK_HOME' }]] } });
    // Gắn state tạm thời
    await updateUser(from.id, { pendingAction: `NAP_BANK_${formId}` });
    return;
  }

  if (data === 'NR_MOMO') {
    return bot.editMessageText('📱 <b>Nạp qua MoMo</b>\nGửi số tiền (VD: 50000).', { chat_id: chatId, message_id: message.message_id, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '⬅️ Quay lại', callback_data: 'BACK_HOME' }]] } });
  }

  if (data === 'NR_CARD') {
    return bot.editMessageText('💳 <b>Nạp bằng thẻ cào</b>\nGửi nội dung: <code>NAP THE menhgia seri pin</code>', { chat_id: chatId, message_id: message.message_id, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '⬅️ Quay lại', callback_data: 'BACK_HOME' }]] } });
  }

  // Đầu tư
  if (data === 'DT_GOI1') {
    const cost = 10000, profit = 12000;
    return bot.editMessageText(`🚀 <b>Gói Thường</b>\nGiá: ${formatMoney(cost)} xu\nLợi nhuận sau 24h: ${formatMoney(profit)} xu\n\nNhấn MUA để tham gia.`, { chat_id: chatId, message_id: message.message_id, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🛒 MUA', callback_data: 'BUY_GOI1' }],[{ text: '⬅️ Quay lại', callback_data: 'BACK_HOME' }]] } });
  }
  if (data === 'DT_GOI2') {
    const cost = 50000, profit = 65000;
    return bot.editMessageText(`🌟 <b>Gói VIP</b>\nGiá: ${formatMoney(cost)} xu\nLợi nhuận sau 24h: ${formatMoney(profit)} xu\n\nNhấn MUA để tham gia.`, { chat_id: chatId, message_id: message.message_id, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🛒 MUA', callback_data: 'BUY_GOI2' }],[{ text: '⬅️ Quay lại', callback_data: 'BACK_HOME' }]] } });
  }
  if (data === 'DT_HISTORY') {
    const content = (await fsp.readFile(DAUTU_FILE, 'utf8')).trim() || 'Chưa có lịch sử đầu tư.';
    return bot.editMessageText(`📜 <b>Lịch sử đầu tư</b>\n\n<pre>${content}</pre>`, { chat_id: chatId, message_id: message.message_id, parse_mode: 'HTML' });
  }
  if (data === 'BUY_GOI1' || data === 'BUY_GOI2') {
    const cost = data === 'BUY_GOI1' ? 10000 : 50000;
    const profit = data === 'BUY_GOI1' ? 12000 : 65000;
    const u = await getUser(from.id);
    if ((u.sodu || 0) < cost) {
      return bot.answerCallbackQuery(id, { text: 'Số dư không đủ!', show_alert: true });
    }
    await addBalance(from.id, -cost);
    const line = `DT | -${formatMoney(cost)} | ${nowVN()} | ID ${from.id} | GOI ${data === 'BUY_GOI1' ? 'THUONG' : 'VIP'}`;
    await fsp.appendFile(DAUTU_FILE, line + '\n');
    await bot.editMessageText(`✅ Mua gói thành công! -${formatMoney(cost)} xu\n💰 Số dư còn: ${formatMoney((await getUser(from.id)).sodu)} xu\n⏳ Lợi nhuận sau 24h: +${formatMoney(profit)} xu (demo)`, { chat_id: chatId, message_id: message.message_id, parse_mode: 'HTML' });
    try { await bot.sendMessage(LOG_GROUP_ID, line); } catch {}
    return;
  }
});

// ==== State cho nạp/nhập liệu ====
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const u = await getUser(msg.from.id);
  const state = u.pendingAction || '';
  if (state.startsWith('NAP_BANK_')) {
    const amount = parseInt(msg.text.replace(/\D/g, ''), 10);
    if (!amount || amount < 10000) {
      return bot.sendMessage(msg.chat.id, '❌ Số tiền không hợp lệ. Nhập lại (>= 10000).');
    }
    const note = `NAP${msg.from.id}`;
    const qrDemo = `https://img.vietqr.io/image/MB-9704228563-qr_only.png?amount=${amount}&addInfo=${note}`; // demo QR ảnh tĩnh (thay số tk của bạn)
    const info = `📥 <b>YÊU CẦU NẠP</b>\n`+
      `Số tiền: <b>${formatMoney(amount)}đ</b>\n`+
      `Nội dung CK: <code>${note}</code>\n`+
      `⏳ Sau khi chuyển, chờ admin duyệt.`;
    await updateUser(msg.from.id, { pendingAction: null });
    await fsp.appendFile(TRANS_FILE, `NAP | +${formatMoney(amount)} | ${nowVN()} | ID ${msg.from.id} | NOTE ${note}\n`);
    try { await bot.sendPhoto(msg.chat.id, qrDemo, { caption: info, parse_mode: 'HTML' }); } catch { await bot.sendMessage(msg.chat.id, info, { parse_mode: 'HTML' }); }
    try { await bot.sendMessage(LOG_GROUP_ID, `YÊU CẦU NẠP | ID ${msg.from.id} | ${formatMoney(amount)} | NOTE ${note}`); } catch {}
    return;
  }

  // Nạp thẻ dạng: NAP THE menhgia seri pin
  if (/^NAP\s+THE\s+/i.test(msg.text)) {
    const parts = msg.text.trim().split(/\s+/);
    const menhgia = parseInt(parts[2] || '0', 10);
    if (!menhgia) return bot.sendMessage(msg.chat.id, 'Sai cú pháp. Ví dụ: <code>NAP THE 50000 123456789 112233</code>', { parse_mode: 'HTML' });
    await addBalance(msg.from.id, menhgia);
    await fsp.appendFile(TRANS_FILE, `NAP THE | +${formatMoney(menhgia)} | ${nowVN()} | ID ${msg.from.id}\n`);
    return bot.sendMessage(msg.chat.id, `✅ Nạp thẻ giả lập thành công: +${formatMoney(menhgia)} xu\n💰 Số dư: ${formatMoney((await getUser(msg.from.id)).sodu)} xu`);
  }
});

// ==== Admin lệnh nhanh ====
bot.onText(/^\/give\s+(\d+)\s+(\d+)/, async (msg, m) => {
  if (String(msg.from.id) !== String(ADMIN_ID)) return;
  const uid = m[1];
  const amount = parseInt(m[2], 10);
  const bal = await addBalance(uid, amount);
  await bot.sendMessage(msg.chat.id, `✅ Đã cộng ${formatMoney(amount)} xu cho ${uid}. Bal: ${formatMoney(bal)} xu`);
});

bot.onText(/^\/broadcast\s+([\s\S]+)/, async (msg, m) => {
  if (String(msg.from.id) !== String(ADMIN_ID)) return;
  const text = m[1];
  const users = await readUsers();
  let ok=0, fail=0;
  for (const u of users) {
    try { await bot.sendMessage(u.id, `📢 <b>Broadcast</b>\n${text}`, { parse_mode: 'HTML' }); ok++; } catch { fail++; }
  }
  await bot.sendMessage(msg.chat.id, `Xong. OK: ${ok}, Fail: ${fail}`);
});

// ==== Ghi chú ====
// - Đây là bản full menu nền tảng với ~20+ tính năng/phím, bạn có thể nhân rộng ra 100+ action
//   bằng cách thêm callback_data và handler tương tự.
// - Lưu ý Render free xoá dữ liệu khi redeploy. Nếu muốn bền, dùng DB thật (Mongo, Postgres).
// - Với VietQR thực tế, bạn nên tự cấu hình số tài khoản và sinh QR động theo ngân hàng của bạn.

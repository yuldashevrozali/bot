import { Telegraf, Markup } from 'telegraf';
import axios from 'axios';
import dotenv from 'dotenv';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN!);
const CHANNEL_ID = process.env.CHANNEL_ID;
const WEB_APP_URL = process.env.FRONTEND_URL!;
const CHANNEL_USERNAME = process.env.BOT_USERNAME?.replace('bot', '') || 'channel';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const ADMIN_ID = process.env.ADMIN_ID || '';

// Admin tekshirish
function isAdmin(userId: number): boolean {
  return String(userId) === ADMIN_ID;
}

// Broadcast kutish holati
let waitingForBroadcast = false;
let broadcastAdminId: number | null = null;

// User ro'yxatdan o'tganini tekshirish
async function isUserRegistered(telegramId: string): Promise<boolean> {
  try {
    const res = await axios.get(`${BACKEND_URL}/api/check-user/${telegramId}`);
    return res.data.registered;
  } catch {
    return false;
  }
}

// Asosiy reply keyboard (oddiy tugmalar - rasmdagi kabi)
const mainKeyboard = Markup.keyboard([
  ['📚 Milliy sertifikat testlari'],
  ['➕ Test yaratish', '✅ Javob yuborish'],
  ['👤 Mening ma\'lumotlarim', '📊 Mening testlarim'],
  ['ℹ️ Yo\'riqnoma']
]).resize().oneTime(false);

// Admin panel keyboard
const adminKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('👥 Barcha userlar', 'admin_users')],
  [Markup.button.callback('📝 Jami testlar', 'admin_tests')],
  [Markup.button.callback('📢 Reklama yuborish sahifasi', 'admin_broadcast')],
]);

// /start handler
// /start handler - to'g'rilangan qismi
bot.start(async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const member = await ctx.telegram.getChatMember(CHANNEL_ID!, userId);
    const isMember = ['creator', 'administrator', 'member'].includes(member.status);

    if (!isMember) {
      return ctx.reply(
        `👋 Assalomu alaykum!\n\nBotdan foydalanish uchun quyidagi kanalga obuna bo'ling!\n\n📢 Kanal: @${CHANNEL_USERNAME}\n\n✅ Obuna bo'lganingizdan so'ng "🔍 Obunani tekshirish" tugmasini bosing.`,
        {
          reply_markup: Markup.inlineKeyboard([
            Markup.button.url('📢 Kanalga obuna bo\'lish', `https://t.me/${CHANNEL_USERNAME}`),
            Markup.button.callback('🔍 Obunani tekshirish', 'check_sub')
          ]).reply_markup
        }
      );
    }

    const registered = await isUserRegistered(userId.toString());
    const userName = ctx.from?.first_name || 'Foydalanuvchi';

    if (registered) {
      return ctx.reply(
        `👋 Marhamat, ${userName}!\n\nQuyidagi tugmalardan foydalaning:`,
        {
          reply_markup: mainKeyboard.reply_markup
        }
      );
    } else {
      // ✅ BU YERDA XATO BOR EDI - TUZATILDI:
      return ctx.reply(
        `✅ Kanalga obuna bo'lganingiz tasdiqlandi!\n\nEndi ro'yxatdan o'ting:`,
        {
          reply_markup: Markup.inlineKeyboard([
            Markup.button.webApp('📝 Ro\'yxatdan o\'tish', WEB_APP_URL)
          ]).reply_markup
        }
      );
    }
  } catch (err) {
    ctx.reply("⚠️ Xatolik yuz berdi. Iltimos qayta urinib ko'ring.");
  }
});

// Callback: Obunani tekshirish
// check_sub callback - to'g'rilangan qismi
// Callback: Obunani tekshirish
bot.action('check_sub', async (ctx) => {
  const userId = ctx.from?.id;
  try {
    const member = await ctx.telegram.getChatMember(CHANNEL_ID!, userId!);
    const isMember = ['creator', 'administrator', 'member'].includes(member.status);
    
    if (isMember) {
      const registered = await isUserRegistered(userId!.toString());
      const userName = ctx.from?.first_name || 'Foydalanuvchi';

      if (registered) {
        // 1. Obuna tekshirish xabarini inline tugma bilan almashtiramiz (yoki shunchaki matn qoldiramiz)
        await ctx.editMessageText(
          `👋 Marhamat, ${userName}!\n\n✅ Obuna tasdiqlandi! Asosiy menyu pastda paydo bo'ldi:`,
          Markup.inlineKeyboard([
            Markup.button.callback('✅ Tasdiqlandi', 'noop') // Telegram talab qiladi
          ])
        );
        
        // 2. Oddiy keyboardni YANGI xabar sifatida yuboramiz
        await ctx.reply(
          `📌 Asosiy menyu:`,
          { reply_markup: mainKeyboard.reply_markup }
        );
      } else {
        await ctx.editMessageText(
          `✅ Kanalga obuna bo'lganingiz tasdiqlandi!\n\nEndi ro'yxatdan o'ting:`,
          Markup.inlineKeyboard([
            Markup.button.webApp('📝 Ro\'yxatdan o\'tish', WEB_APP_URL)
          ])
        );
      }
    } else {
      await ctx.answerCbQuery('⚠️ Hali a\'zo emasiz! Kanalga qo\'shiling.');
    }
  } catch {
    ctx.answerCbQuery('Bot kanalda admin emas yoki xatolik.');
  }
});

// /menu - asosiy menyu
bot.command('menu', async (ctx) => {
  await ctx.reply(
    `📌 Asosiy menyu:`,
    { reply_markup: mainKeyboard.reply_markup }
  );
});

// /adminman — Admin panel
bot.command('adminman', async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) {
    return ctx.reply('⛔ Sizda admin huquqi yo\'q!');
  }
  await ctx.reply(
    `🔐 <b>Admin Panel</b>\n\nQuyidagi amallarni bajarishingiz mumkin:`,
    {
      parse_mode: 'HTML',
      ...adminKeyboard
    }
  );
});

// Admin: Barcha userlar soni
bot.action('admin_users', async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) {
    return ctx.answerCbQuery('⛔ Ruxsat yo\'q!');
  }
  try {
    const res = await axios.get(`${BACKEND_URL}/api/admin/stats`);
    await ctx.editMessageText(
      `👥 <b>Barcha userlar soni:</b>\n\nJami: <b>${res.data.totalUsers || 0}</b> ta`,
      { parse_mode: 'HTML', ...adminKeyboard }
    );
  } catch {
    await ctx.editMessageText(
      `❌ Xatolik yuz berdi. Backend ishlamayapti.`,
      { parse_mode: 'HTML', ...adminKeyboard }
    );
  }
});

// Admin: Jami testlar soni
bot.action('admin_tests', async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) {
    return ctx.answerCbQuery('⛔ Ruxsat yo\'q!');
  }
  try {
    const res = await axios.get(`${BACKEND_URL}/api/admin/stats`);
    await ctx.editMessageText(
      `📝 <b>Jami testlar soni:</b>\n\nJami: <b>${res.data.totalTests || 0}</b> ta`,
      { parse_mode: 'HTML', ...adminKeyboard }
    );
  } catch {
    await ctx.editMessageText(
      `❌ Xatolik yuz berdi. Backend ishlamayapti.`,
      { parse_mode: 'HTML', ...adminKeyboard }
    );
  }
});

// Admin: Reklama yuborish
bot.action('admin_broadcast', async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) {
    return ctx.answerCbQuery('⛔ Ruxsat yo\'q!');
  }
  waitingForBroadcast = true;
  broadcastAdminId = userId;
  await ctx.editMessageText(
    `📢 <b>Reklama yuborish</b>\n\nReklama xabarini yozing va menga yuboring. Men barcha userlarga yuboraman.\n\n<i>Bekor qilish uchun /cancel yozing.</i>`,
    { parse_mode: 'HTML' }
  );
});

// Bekor qilish
bot.command('cancel', async (ctx) => {
  if (waitingForBroadcast && ctx.from?.id === broadcastAdminId) {
    waitingForBroadcast = false;
    broadcastAdminId = null;
    await ctx.reply('❌ Bekor qilindi.', adminKeyboard);
  }
});

// PDF yaratish funksiyasi
function createResultsPDF(testCode: number, results: any[], participantCount: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const filePath = path.join(__dirname, `test_${testCode}_results.pdf`);
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    // Sarlavha
    doc.fontSize(24).font('Helvetica-Bold').text(`Test #${testCode} Natijalari`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica').text(`Ishtirokchilar: ${participantCount} ta`, { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(10).text(`Sana: ${new Date().toLocaleDateString('uz-UZ')}`, { align: 'center' });
    doc.moveDown(1);

    // Jadval sarlavhasi
    doc.fontSize(12).font('Helvetica-Bold');
    const colWidths = [40, 180, 70, 70, 70, 80];
    let y = doc.y;

    // Header
    doc.rect(50, y, 510, 25).fill('#4F46E5');
    doc.fillColor('white');
    doc.text('O\'rin', 55, y + 7, { width: colWidths[0] });
    doc.text('Ism Familiya', 55 + colWidths[0], y + 7, { width: colWidths[1] });
    doc.text('Ball', 55 + colWidths[0] + colWidths[1], y + 7, { width: colWidths[2] });
    doc.text('Foiz', 55 + colWidths[0] + colWidths[1] + colWidths[2], y + 7, { width: colWidths[3] });
    doc.text('Daraja', 55 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], y + 7, { width: colWidths[4] });
    doc.text('Sertifikat', 55 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], y + 7, { width: colWidths[5] });

    y += 30;
    doc.fillColor('black');

    // Natijalar
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const bgColor = i % 2 === 0 ? '#F9FAFB' : '#FFFFFF';

      doc.rect(50, y, 510, 22).fill(bgColor);
      doc.fillColor('black').font('Helvetica');

      const rank = i === 0 ? '🥇 1' : i === 1 ? '🥈 2' : i === 2 ? '🥉 3' : `   ${i + 1}`;
      doc.text(rank, 55, y + 5, { width: colWidths[0] });
      doc.text(`${r.name} ${r.surname}`, 55 + colWidths[0], y + 5, { width: colWidths[1] });
      doc.text(String(r.scaledScore), 55 + colWidths[0] + colWidths[1], y + 5, { width: colWidths[2] });
      doc.text(`${r.percentage}%`, 55 + colWidths[0] + colWidths[1] + colWidths[2], y + 5, { width: colWidths[3] });
      doc.text(r.grade || 'F', 55 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], y + 5, { width: colWidths[4] });
      doc.text(r.isCertified ? '✅ Ha' : '❌ Yo\'q', 55 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], y + 5, { width: colWidths[5] });

      y += 24;

      // Yangi sahifa kerak bo'lsa
      if (y > 750) {
        doc.addPage();
        y = 50;
      }
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(10).font('Helvetica-Oblique').text('Milliy Sertifikat Test Tizimi', { align: 'center' });

    doc.end();
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

// Matn xabarlarni qabul qilish (tugmalar va broadcast uchun)
bot.on('text', async (ctx) => {
  const userId = ctx.from?.id;
  const text = ctx.text || '';

  // Reply keyboard tugmalarini handle qilish - Web App ochish
  if (text === '📚 Milliy sertifikat testlari') {
    return ctx.reply(
      '📚 Milliy sertifikat testlari uchun Web App ochilmoqda...',
      Markup.inlineKeyboard([
        Markup.button.webApp('📚 Testlarni ochish', WEB_APP_URL)
      ])
    );
  }

  if (text === '➕ Test yaratish') {
    return ctx.reply(
      '➕ Test yaratish uchun Web App ochilmoqda...',
      Markup.inlineKeyboard([
        Markup.button.webApp('➕ Test yaratish', `${WEB_APP_URL}/create-test`)
      ])
    );
  }

  if (text === '✅ Javob yuborish') {
    return ctx.reply(
      '✅ Javob yuborish uchun Web App ochilmoqda...',
      Markup.inlineKeyboard([
        Markup.button.webApp('✅ Javob yuborish', `${WEB_APP_URL}/submit-answer`)
      ])
    );
  }

  if (text === '👤 Mening ma\'lumotlarim') {
    return ctx.reply(
      '👤 Profilingiz uchun Web App ochilmoqda...',
      Markup.inlineKeyboard([
        Markup.button.webApp('👤 Profil', `${WEB_APP_URL}/profile`)
      ])
    );
  }

  if (text === '📊 Mening testlarim') {
    return ctx.reply(
      '📊 Testlaringiz uchun Web App ochilmoqda...',
      Markup.inlineKeyboard([
        Markup.button.webApp('📊 Mening testlarim', `${WEB_APP_URL}/my-tests`)
      ])
    );
  }

  if (text === 'ℹ️ Yo\'riqnoma') {
    return ctx.reply(
      'ℹ️ Yo\'riqnoma uchun Web App ochilmoqda...',
      Markup.inlineKeyboard([
        Markup.button.webApp('ℹ️ Yo\'riqnoma', `${WEB_APP_URL}/guide`)
      ])
    );
  }

  // 1. /yakunlash_(testCode) - Testni yakunlash
  const finalizeMatch = text.match(/^\/yakunlash_(\d+)$/);
  if (finalizeMatch) {
    if (!userId) return;
    const testCode = parseInt(finalizeMatch[1]);

    await ctx.reply(`⏳ Test yakunlanmoqda...`);

    try {
      const res = await axios.post(`${BACKEND_URL}/api/tests/${testCode}/finalize`, {
        adminTelegramId: String(userId)
      });

      const results = res.data.results;
      const participantCount = res.data.participantCount;

      // PDF yaratish
      await ctx.reply(`📊 Test #${testCode} yakunlandi!\n👥 Ishtirokchilar: ${participantCount} ta\n\n📄 PDF tayyorlanmoqda...`);

      const pdfPath = await createResultsPDF(testCode, results, participantCount);

      // PDF ni yuborish
      await ctx.replyWithDocument({
        source: pdfPath,
        filename: `Test_${testCode}_Natijalari.pdf`
      }, {
        caption: `📊 <b>Test #${testCode} Natijalari</b>\n\n👥 Ishtirokchilar: <b>${participantCount}</b> ta\n📅 Sana: ${new Date().toLocaleDateString('uz-UZ')}\n\n<b>🏆 Top 3:</b>\n${results.slice(0, 3).map((r: any, i: number) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
          return `${medal} ${r.name} ${r.surname} — ${r.scaledScore} ball (${r.grade})`;
        }).join('\n')}`,
        parse_mode: 'HTML'
      });

      // PDF faylni o'chirish
      fs.unlinkSync(pdfPath);

    } catch (e: any) {
      const errorMsg = e.response?.data?.error || 'Xatolik yuz berdi';
      await ctx.reply(`❌ ${errorMsg}`);
    }
    return;
  }

  // 2. Broadcast uchun xabar kutish
  if (waitingForBroadcast && userId === broadcastAdminId) {
    const message = text;
    if (message.startsWith('/')) return;

    waitingForBroadcast = false;
    broadcastAdminId = null;

    await ctx.reply(`⏳ Yuborilmoqda...`);
    try {
      const res = await axios.post(`${BACKEND_URL}/api/admin/broadcast`, {
        message,
        adminId: String(userId)
      });
      await ctx.reply(
        `✅ Reklama yuborildi!\n\nJami: <b>${res.data.sent || 0}</b> ta userga yuborildi.`,
        { parse_mode: 'HTML', ...adminKeyboard }
      );
    } catch {
      await ctx.reply(
        `❌ Xatolik yuz berdi.`,
        { parse_mode: 'HTML', ...adminKeyboard }
      );
    }
    return;
  }
});

// Web App dan kelgan ma'lumotlarni qabul qilish
bot.on('web_app_data', async (ctx) => {
  try {
    const dataText = ctx.webAppData?.data.text() || '{}';
    const data = JSON.parse(dataText);
    
    if (data.action === 'registered' && data.name) {
      await ctx.reply(
        `🎉 Xush kelibsiz, ${data.name}!\n\nSiz muvaffaqiyatli ro'yxatdan o'tdingiz!\n\nMarhamat, quyidagi tugmalardan foydalaning:`,
        { reply_markup: mainKeyboard.reply_markup }
      );
    }
    
    if (data.action === 'test_created') {
      const testCode = data.testCode;
      const authorName = ctx.from?.first_name || 'Noma\'lum';
      const testTypeLabel = data.testType === 'simple' ? '📊 Oddiy test' : '🧠 RASCH modeli';
      await ctx.reply(
        `✅ Test yaratildi!\n\n📋 Test kodi: ${testCode}\n📌 Test turi: ${testTypeLabel}\n👤 Yaratuvchi: ${authorName}\n\nBoshqalar ham shu kod orqali testni ishlashi mumkin.`,
        { reply_markup: mainKeyboard.reply_markup }
      );
    }
  } catch {
    // Ma'lumot noto'g'ri formatda
  }
});

bot.launch();
console.log('✅ Telegram Bot ishlamoqda...');
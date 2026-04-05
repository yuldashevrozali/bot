import { Telegraf, Markup } from 'telegraf';
import axios from 'axios';
import dotenv from 'dotenv';
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

// Asosiy menyu — inline keyboard
const mainMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.webApp('📝 Test Yaratish', WEB_APP_URL)],
  [Markup.button.webApp('📋 Test Ishlash', WEB_APP_URL)],
  [Markup.button.webApp('📊 Mening Natijalarim', WEB_APP_URL)],
]);

// Admin panel keyboard
const adminKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('👥 Barcha userlar', 'admin_users')],
  [Markup.button.callback('📝 Jami testlar', 'admin_tests')],
  [Markup.button.callback('📢 Reklama yuborish', 'admin_broadcast')],
]);

// /start handler
bot.start(async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const member = await ctx.telegram.getChatMember(CHANNEL_ID!, userId);
    const isMember = ['creator', 'administrator', 'member'].includes(member.status);

    if (!isMember) {
      return ctx.reply(
        `👋 Assalomu alaykum!\n\nBotdan foydalanish uchun quyidagi kanalga obuna bo'ling!\n\n📢 Kanal: @${CHANNEL_USERNAME}\n\n✅ Obuna bo'lganingizdan so'ng "🔍 Obunani tekshirish" tugmasini bosing.`,
        Markup.inlineKeyboard([
          Markup.button.url('📢 Kanalga obuna bo\'lish', `https://t.me/${CHANNEL_USERNAME}`),
          Markup.button.callback('🔍 Obunani tekshirish', 'check_sub')
        ])
      );
    }

    const registered = await isUserRegistered(userId.toString());
    const userName = ctx.from?.first_name || 'Foydalanuvchi';

    if (registered) {
      return ctx.reply(
        `👋 Marhamat, tugmalardan foydalaning, ${userName}!`,
        mainMenuKeyboard
      );
    } else {
      return ctx.reply(
        `✅ Kanalga obuna bo'lganingiz tasdiqlandi!\n\nEndi ro'yxatdan o'ting:`,
        Markup.inlineKeyboard([
          Markup.button.webApp('📝 Ro\'yxatdan o\'tish', WEB_APP_URL)
        ])
      );
    }
  } catch (err) {
    ctx.reply("⚠️ Xatolik yuz berdi. Iltimos qayta urinib ko'ring.");
  }
});

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
        await ctx.editMessageText(
          `👋 Marhamat, tugmalardan foydalaning, ${userName}!`
        );
        await ctx.reply(
          `📌 Asosiy menyu:`,
          mainMenuKeyboard
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

// Matn xabarlarni qabul qilish (broadcast va yakunlash uchun)
bot.on('text', async (ctx) => {
  const userId = ctx.from?.id;
  const text = ctx.text || '';

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

      let message = `📊 <b>Test #${testCode} Yakunlandi!</b>\n\n`;
      message += `👥 Ishtirokchilar: <b>${participantCount}</b> ta\n\n`;
      message += `<b>🏆 Natijalar:</b>\n`;
      message += `━━━━━━━━━━━━━━━━━━\n`;

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
        message += `${medal} <b>${i + 1}. ${r.name} ${r.surname}</b>\n`;
        message += `   📈 Ball: <b>${r.scaledScore}</b> | Foiz: ${r.percentage}%\n`;
        message += `   🏅 Daraja: <b>${r.grade}</b> | ${r.isCertified ? '✅ Sertifikat' : '❌ Sertifikat yo\'q'}\n`;
        message += `   🧠 Theta: ${r.theta}\n`;
        if (i < results.length - 1) message += `──────────────────\n`;
      }

      message += `\n━━━━━━━━━━━━━━━━━━`;
      message += `\n<i>Test yakunlandi.</i>`;

      if (message.length > 4000) {
        const parts: string[] = [];
        let current = `📊 <b>Test #${testCode} Yakunlandi!</b>\n\n👥 Ishtirokchilar: <b>${participantCount}</b> ta\n\n`;
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
          const entry = `${medal} <b>${i + 1}. ${r.name} ${r.surname}</b>\n   📈 Ball: <b>${r.scaledScore}</b> | Foiz: ${r.percentage}%\n   🏅 Daraja: <b>${r.grade}</b> | ${r.isCertified ? '✅' : '❌'}\n`;
          if ((current + entry).length > 4000) {
            parts.push(current);
            current = entry;
          } else {
            current += entry;
          }
        }
        parts.push(current);
        for (let i = 0; i < parts.length; i++) {
          await ctx.reply(parts[i], { parse_mode: 'HTML' });
        }
      } else {
        await ctx.reply(message, { parse_mode: 'HTML' });
      }
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
        mainMenuKeyboard
      );
    }
    
    if (data.action === 'test_created') {
      const testCode = data.testCode;
      const authorName = ctx.from?.first_name || 'Noma\'lum';
      const testTypeLabel = data.testType === 'simple' ? '📊 Oddiy test' : '🧠 RASCH modeli';
      await ctx.reply(
        `✅ Test yaratildi!\n\n📋 Test kodi: ${testCode}\n📌 Test turi: ${testTypeLabel}\n👤 Yaratuvchi: ${authorName}\n\nBoshqalar ham shu kod orqali testni ishlashi mumkin.`,
        Markup.inlineKeyboard([
          Markup.button.webApp('📱 Test ishlash', `${WEB_APP_URL}/take-test`)
        ])
      );
    }
  } catch {
    // Ma'lumot noto'g'ri formatda
  }
});

// /menu - asosiy menyu
bot.command('menu', async (ctx) => {
  await ctx.reply(
    `📌 Asosiy menyu:`,
    mainMenuKeyboard
  );
});

bot.launch();
console.log('✅ Telegram Bot ishlamoqda...');

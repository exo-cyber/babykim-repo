const config = require('./config');
const { buildMenu } = require('./menu');
const fallback = require('./fallback');
const settings = require('./settings');
const memory = require('./memory');
const { state } = require('./connection');

const fs = require('fs');
const path = require('path');

// Menu picture/video: drop assets/menu.jpg (or .png/.webp/.mp4/.gif) into the bot,
// or set MENU_MEDIA to a direct image/video URL. Falls back to plain text.
function findMenuMedia() {
  const url = process.env.MENU_MEDIA;
  if (url) return { src: url, video: /\.(mp4|gif|mov|webm)(\?|$)/i.test(url) };
  for (const ext of ['mp4', 'gif', 'mov', 'webm', 'jpg', 'jpeg', 'png', 'webp']) {
    const file = path.join(__dirname, 'assets', `menu.${ext}`);
    if (fs.existsSync(file)) return { src: file, video: ['mp4', 'gif', 'mov', 'webm'].includes(ext) };
  }
  return null;
}

async function sendMenu(ctx) {
  const text = buildMenu(ctx.commandList);
  const media = findMenuMedia();
  const log = require('./logger');
  if (!media) { log.warn('Menu: no picture found (assets/menu.jpg missing and MENU_MEDIA not set), sending text'); return ctx.reply(text); }
  const content = () => (media.src.startsWith('http') ? { url: media.src } : fs.readFileSync(media.src));
  const send = (caption) => ctx.sock.sendMessage(
    ctx.jid,
    media.video ? { video: content(), gifPlayback: true, caption } : { image: content(), caption },
    { quoted: ctx.msg },
  );
  try {
    return await send(text);
  } catch (e) {
    log.warn('Menu picture with full caption failed:', e.message);
  }
  try {
    // Long captions can be refused: send the picture with a short caption, then the list as text.
    await send('ROSE');
    return await ctx.reply(text);
  } catch (e) {
    log.warn('Menu picture failed:', e.message);
    return ctx.reply(text);
  }
}

module.exports = [
  { name: 'menu', category: 'GENERAL', menu: ['menu'], run: sendMenu },
  { name: 'help', category: 'GENERAL', menu: ['help'], run: sendMenu },

  {
    name: 'ping', category: 'GENERAL', menu: ['ping'],
    run: async (ctx) => {
      // WhatsApp timestamps have 1-second precision, so treat this as approximate.
      const sent = Number(ctx.msg.messageTimestamp) * 1000;
      const ms = Math.max(0, Date.now() - sent);
      await ctx.reply(`Online. ${ms} ms.`);
    },
  },

  {
    name: 'about', category: 'GENERAL', menu: ['about'],
    run: (ctx) => ctx.reply(
      `*Rose* v${config.version}\n` +
      `Calm, observant, a little sarcastic. Quietly looks out for ${config.owner.name}.\n\n` +
      `Prefix: ${settings.prefix()}\n` +
      `Memory: last ${config.memory.limit} messages per person\n` +
      `AI: ${fallback.status().filter((p) => p.configured).map((p) => p.name).join(' > ') || 'none configured'}\n\n` +
      `Type ${settings.prefix()}menu to see what I can do.`
    ),
  },

  {
    name: 'status', category: 'GENERAL', menu: ['status'],
    run: (ctx) => {
      const ai = fallback.status().map((p) =>
        `  ${p.name}: ${!p.configured ? 'not configured' : p.cooling ? `cooling (${p.cooldownSec}s)` : 'ready'}`).join('\n');
      return ctx.reply(
        `*Status*\n` +
        `Uptime: ${fmtUptime(Math.floor(process.uptime()))}\n` +
        `WhatsApp: ${state.status}\n` +
        `AI in this chat: ${settings.isAiOn(ctx.jid) ? 'on' : 'off'}\n` +
        `Providers:\n${ai}\n` +
        `MR NICK protection: ${settings.isProtectOn() && config.protectedContact.ids.length ? 'on' : 'off'}\n` +
        `People remembered: ${memory.stats().users}`
      );
    },
  },

  {
    name: 'owner', category: 'GENERAL', menu: ['owner'],
    run: (ctx) => {
      let t = `Owner: ${config.owner.name}`;
      if (config.owner.showNumber && config.owner.ids[0]) t += `\nhttps://wa.me/${config.owner.ids[0]}`;
      return ctx.reply(t);
    },
  },
];

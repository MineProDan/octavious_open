const { Events } = require('discord.js');
const { saveSnipe } = require('../utils/snipeStore');
const achievements = require('../utils/achievements/store');

module.exports = {
    name: Events.MessageDelete,
    async execute(message) {
        if (!message.guild || !message.author || message.author.bot) return;

        const guildMatches = !process.env.GUILDID || message.guild.id === process.env.GUILDID;
        if (!guildMatches) return;

        try {
            await saveSnipe('deleted', message.channel.id, {
                authorId: message.author.id,
                authorName: message.author.tag,
                authorAvatar: message.author.displayAvatarURL({ extension: 'png', size: 256 }),
                content: message.content || '',
                attachments: [...message.attachments.values()].map((attachment) => attachment.url),
                timestamp: message.createdAt?.toISOString() ?? new Date().toISOString(),
            });
            console.log(`Stored deleted message snipe for channel ${message.channel.id}`);
        } catch (error) {
            console.error('Error storing deleted message:', error);
        }

        try {
            await achievements.recordOwnMessageDeleted(message.author.id, { at: new Date(), sentAt: message.createdAt });
        } catch (error) {
            console.error('Error recording deleted-message achievement progress:', error);
        }
    },
};
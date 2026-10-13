const { Events } = require('discord.js');
const { saveSnipe } = require('../utils/snipeStore');
const achievements = require('../utils/achievements/store');

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        if (!newMessage.guild || !newMessage.author || newMessage.author.bot) return;

        const guildMatches = !process.env.GUILDID || newMessage.guild.id === process.env.GUILDID;
        if (!guildMatches) return;

        // Partial (uncached) messages have no old content, and embed unfurls, pins, etc.
        // also fire MessageUpdate without a real edit, so only store genuine content changes.
        if (oldMessage.partial || oldMessage.content == null || newMessage.content == null) return;
        if (oldMessage.content === newMessage.content) return;

        try {
            await saveSnipe('edited', newMessage.channel.id, {
                authorId: newMessage.author.id,
                authorName: newMessage.author.tag,
                authorAvatar: newMessage.author.displayAvatarURL({ extension: 'png', size: 256 }),
                before: oldMessage.content || '',
                after: newMessage.content || '',
                timestamp: newMessage.editedAt?.toISOString() ?? new Date().toISOString(),
            });
            console.log(`Stored edited message snipe for channel ${newMessage.channel.id}`);
        } catch (error) {
            console.error('Error storing edited message:', error);
        }

        try {
            await achievements.recordOwnMessageEdited(newMessage.author.id);
        } catch (error) {
            console.error('Error recording edited-message achievement progress:', error);
        }
    },
};
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getSnipe } = require('../../utils/snipeStore');
const achievements = require('../../utils/achievements/store');

function truncate(value, maxLength = 4096) {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 3)}...`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('snipe')
        .setDescription('Show the last deleted message in this channel'),

    async execute(interaction) {
        try {
            const message = await getSnipe('deleted', interaction.channel.id);
            if (!message) {
                await interaction.reply({ content: 'No deleted message found in this channel.', ephemeral: true });
                return;
            }

            const embed = new EmbedBuilder()
                .setColor(0xed4245)
                .setAuthor({ name: message.authorName, iconURL: message.authorAvatar })
                .setDescription(truncate(message.content || '*No message content*'))
                .setFooter({ text: 'Deleted message' })
                .setTimestamp(new Date(message.timestamp));

            if (message.attachments?.length) {
                embed.addFields({ name: 'Attachments', value: message.attachments.join('\n').slice(0, 1024) });
            }

            await interaction.reply({ embeds: [embed] });
            await achievements.recordSnipeViewed(interaction.user.id, 'deleted').catch((error) => console.error('Error recording snipe-viewed achievement progress:', error));
        } catch (error) {
            console.error('Error fetching deleted message:', error);
            await interaction.reply({ content: 'Failed to fetch the last deleted message.', ephemeral: true });
        }
    },
};
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getSnipe } = require('../../utils/snipeStore');
const achievements = require('../../utils/achievements/store');

function truncate(value, maxLength = 1024) {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 3)}...`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('editsnipe')
        .setDescription('Show the last edited message in this channel'),

    async execute(interaction) {
        try {
            const message = await getSnipe('edited', interaction.channel.id);
            if (!message) {
                await interaction.reply({ content: 'No edited message found in this channel.', ephemeral: true });
                return;
            }

            const embed = new EmbedBuilder()
                .setColor(0xfee75c)
                .setAuthor({ name: message.authorName, iconURL: message.authorAvatar })
                .addFields(
                    { name: 'Before', value: truncate(message.before || '*No message content*') },
                    { name: 'After', value: truncate(message.after || '*No message content*') },
                )
                .setFooter({ text: 'Edited message' })
                .setTimestamp(new Date(message.timestamp));

            await interaction.reply({ embeds: [embed] });
            await achievements.recordSnipeViewed(interaction.user.id, 'edited').catch((error) => console.error('Error recording snipe-viewed achievement progress:', error));
        } catch (error) {
            console.error('Error fetching edited message:', error);
            await interaction.reply({ content: 'Failed to fetch the last edited message.', ephemeral: true });
        }
    },
};
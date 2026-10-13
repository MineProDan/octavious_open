const { SlashCommandBuilder } = require('discord.js');

function formatHoursAgo(dateValue) {
    const publishedAt = new Date(dateValue).getTime();

    if (Number.isNaN(publishedAt)) return 'Unknown';

    const hoursAgo = Math.max(0, Math.floor((Date.now() - publishedAt) / (1000 * 60 * 60)));
    if (hoursAgo === 0) return 'Less than an hour ago';

    return `${hoursAgo} hour${hoursAgo === 1 ? '' : 's'} ago`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('latest')
        .setDescription('Show the latest video'),

    async execute(interaction) {
        const mongoDB = require('../../index').mongoDB;
        const doc = await mongoDB.collection('live_data').findOne(
            { _id: 'latest_video' },
        );

        if (!doc?.latestVidURL) {
            return interaction.reply({
                content: 'No latest video found.',
                ephemeral: true
            });
        }

        const views = doc.latestVidViews === undefined
            ? 'Unknown'
            : Number(doc.latestVidViews).toLocaleString();

        return interaction.reply({
            content: `[⬞](${doc.latestVidURL}) Uploaded: ${formatHoursAgo(doc.latestVidDate)}\n[⬞](${doc.latestVidURL}) Views: ${views}`,
            ephemeral: true
        });
    }
};
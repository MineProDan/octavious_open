const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { claimDailyXp } = require('../../utils/achievements/store');

module.exports = {
  // TODO: temporarily admin-only; revert to open to everyone (drop setDefaultMemberPermissions and the isAdmin check).
  data: new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim your daily XP streak reward')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString()),

  async execute(interaction) {
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
    if (!isAdmin) {
      await interaction.reply({ content: 'This command is restricted to administrators.', ephemeral: true });
      return;
    }
    try {
      const result = await claimDailyXp(interaction.user.id);
      if (!result.claimed) {
        await interaction.reply({
          content: `You have already claimed today. Your current claim streak is ${result.streak} day${result.streak === 1 ? '' : 's'}.`,
          ephemeral: true,
        });
        return;
      }

      const unlocked = result.awarded?.length
        ? `\nUnlocked: ${result.awarded.map((achievement) => achievement.name).join(', ')}`
        : '';
      await interaction.reply({
        content: `Claimed ${result.xpAwarded.toLocaleString()} XP. Claim streak: ${result.streak} day${result.streak === 1 ? '' : 's'}.${unlocked}`,
      });
    } catch (error) {
      console.error('Error processing daily XP claim:', error);
      await interaction.reply({ content: 'The daily claim could not be processed.', ephemeral: true });
    }
  },
};

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { restoreClaimStreak } = require('../../utils/achievements/store');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('claim-restore')
    .setDescription('Restore a member\'s current claim streak')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Server member whose streak should be restored')
      .setRequired(true))
    .addIntegerOption((option) => option
      .setName('streak')
      .setDescription('Positive current claim streak to restore')
      .setMinValue(1)
      .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString()),

  async execute(interaction) {
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
    if (!isAdmin) {
      await interaction.reply({ content: 'This command is restricted to administrators.', ephemeral: true });
      return;
    }

    try {
      const targetUser = interaction.options.getUser('user', true);
      const streak = interaction.options.getInteger('streak', true);
      const member = await interaction.guild?.members.fetch(targetUser.id).catch(() => null);
      if (!member) {
        await interaction.reply({ content: 'That user is not a member of this server.', ephemeral: true });
        return;
      }

      const claim = await restoreClaimStreak(targetUser.id, streak);
      await interaction.reply({
        content: `Restored ${targetUser.username}'s current claim streak to ${claim.currentStreak} day${claim.currentStreak === 1 ? '' : 's'}. Longest streak: ${claim.longestStreak} day${claim.longestStreak === 1 ? '' : 's'}.`,
        ephemeral: true,
      });
    } catch (error) {
      console.error('Error restoring daily XP claim streak:', error);
      await interaction.reply({ content: 'The claim streak could not be restored.', ephemeral: true });
    }
  },
};
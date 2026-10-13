const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { resetDailyClaimWindow } = require('../../utils/achievements/store');

async function replySafely(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch (error) {
    console.error('Error replying to claim reset interaction:', error);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('claimreset')
    .setDescription('Allow all users to claim again without changing the Pacific midnight schedule')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString()),

  async execute(interaction) {
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
    if (!isAdmin) {
      await replySafely(interaction, { content: 'This command is restricted to administrators.', ephemeral: true });
      return;
    }

    try {
      await interaction.deferReply({ ephemeral: true });
      const result = await resetDailyClaimWindow();
      await interaction.editReply({
        content: `Claim timers reset for ${result.usersUpdated} users. They can claim again now; the normal reset remains at 12:00 AM Pacific time.`,
      });
    } catch (error) {
      console.error('Error resetting daily claim window:', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: 'The claim timers could not be reset.' }).catch((replyError) => {
          console.error('Error reporting claim reset failure:', replyError);
        });
      } else {
        await replySafely(interaction, { content: 'The claim timers could not be reset.', ephemeral: true });
      }
    }
  },
};
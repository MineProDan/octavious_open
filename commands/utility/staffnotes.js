const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildStaffNotesEmbed } = require('../../utils/staffNotes');

module.exports = {
  // TODO: temporarily admin-only; revert to also allow ModerateMembers (drop setDefaultMemberPermissions, restore the permission check).
  data: new SlashCommandBuilder()
    .setName('staffnotes')
    .setDescription('Display all staff notes for a user.')
    .addUserOption((option) => option.setName('user').setDescription('The user whose staff notes you want to view').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString()),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      return;
    }

    const targetUser = interaction.options.getUser('user');
    const mongoDB = require('../../index').mongoDB;
    const notes = await mongoDB.collection('staff_notes')
      .find({
        $or: [
          { memberId: targetUser.id },
          { memberId: String(targetUser.id) },
          { username: targetUser.username },
        ],
      })
      .sort({ createdAt: -1 })
      .toArray();

    const embed = buildStaffNotesEmbed(targetUser, notes);
    await interaction.reply({ embeds: [embed], ephemeral: false });
  },
};

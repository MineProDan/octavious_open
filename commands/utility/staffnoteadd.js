const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { randomUUID } = require('node:crypto');

module.exports = {
  // TODO: temporarily admin-only; revert to also allow ModerateMembers (drop setDefaultMemberPermissions, restore the permission check).
  data: new SlashCommandBuilder()
    .setName('staffnoteadd')
    .setDescription('Add a staff note to a user.')
    .addUserOption((option) => option.setName('member').setDescription('The member to add a note to').setRequired(true))
    .addStringOption((option) => option.setName('note').setDescription('What happened?').setRequired(true).setMinLength(1).setMaxLength(1000))
    .addStringOption((option) => option.setName('context').setDescription('Optional extra context or resolution details').setRequired(false).setMaxLength(1000))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString()),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      return;
    }

    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }

    const targetUser = interaction.options.getUser('member');
    const noteText = interaction.options.getString('note')?.trim();
    const context = interaction.options.getString('context')?.trim() || '';

    if (!noteText) {
      await interaction.reply({ content: 'A note is required.', ephemeral: true });
      return;
    }

    const member = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      await interaction.reply({ content: `I could not resolve ${targetUser.tag} in this server.`, ephemeral: true });
      return;
    }

    const mongoDB = require('../../index').mongoDB;
    const note = {
      noteId: randomUUID(),
      memberId: member.id,
      username: member.user.username,
      note: noteText,
      authorId: interaction.user.id,
      authorName: interaction.user.username,
      authorDisplayName: interaction.user.displayName || interaction.user.username,
      context,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await mongoDB.collection('staff_notes').insertOne(note);

    const embed = new EmbedBuilder()
      .setColor('#57F287')
      .setTitle('Staff note added')
      .setDescription(`Added a staff note for ${member.user.tag}.`)
      .addFields(
        { name: 'Note', value: noteText.slice(0, 1000) || 'No note provided', inline: false },
        { name: 'Context', value: (context || 'No additional context provided').slice(0, 1000), inline: false },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: false });
  },
};

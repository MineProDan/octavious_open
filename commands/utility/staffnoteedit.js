const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getNoteText } = require('../../utils/staffNotes');

module.exports = {
  // TODO: temporarily admin-only; revert to also allow ModerateMembers (drop setDefaultMemberPermissions, restore the permission check).
  data: new SlashCommandBuilder()
    .setName('staffnoteedit')
    .setDescription('Update an existing staff note for a user.')
    .addUserOption((option) => option.setName('user').setDescription('The user whose note should be updated').setRequired(true))
    .addStringOption((option) => option.setName('oldnote').setDescription('The existing note text or exact note match to update').setRequired(true).setMinLength(1).setMaxLength(1000))
    .addStringOption((option) => option.setName('newnote').setDescription('The replacement note text').setRequired(true).setMinLength(1).setMaxLength(1000))
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

    const targetUser = interaction.options.getUser('user');
    const oldNoteQuery = interaction.options.getString('oldnote')?.trim();
    const newNoteText = interaction.options.getString('newnote')?.trim();

    if (!newNoteText) {
      await interaction.reply({ content: 'A new note is required.', ephemeral: true });
      return;
    }

    const member = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      await interaction.reply({ content: `I could not resolve ${targetUser.tag} in this server.`, ephemeral: true });
      return;
    }

    const mongoDB = require('../../index').mongoDB;
    const notes = await mongoDB.collection('staff_notes')
      .find({ $or: [{ memberId: member.id }, { memberId: String(member.id) }] })
      .toArray();

    const exactMatches = notes.filter((note) => {
      const value = getNoteText(note);
      return value && oldNoteQuery && value.toLowerCase() === oldNoteQuery.toLowerCase();
    });

    const matchingNotes = exactMatches.length ? exactMatches : notes.filter((note) => {
      const value = getNoteText(note);
      return value && oldNoteQuery && value.toLowerCase().includes(oldNoteQuery.toLowerCase());
    });

    if (!matchingNotes.length) {
      await interaction.reply({ content: `No staff notes for ${member.user.tag} match that note text.`, ephemeral: true });
      return;
    }

    if (matchingNotes.length > 1) {
      await interaction.reply({
        content: `I found multiple matching notes for ${member.user.tag}. Please use a more specific old note value from autocomplete.`,
        ephemeral: true,
      });
      return;
    }

    const noteId = matchingNotes[0].noteId;
    const result = await mongoDB.collection('staff_notes').updateOne(
      { noteId },
      {
        $set: {
          note: newNoteText,
          updatedAt: new Date(),
          editorId: interaction.user.id,
          editorName: interaction.user.username,
        },
      },
    );

    if (result.matchedCount === 1) {
      await interaction.reply({ content: `Updated the matching note for ${member.user.tag}.`, ephemeral: true });
    } else {
      await interaction.reply({ content: `I could not update the selected note for ${member.user.tag}.`, ephemeral: true });
    }
  },
};

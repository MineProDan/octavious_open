const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getNoteText } = require('../../utils/staffNotes');

module.exports = {
  // TODO: temporarily admin-only; revert to also allow ModerateMembers (drop setDefaultMemberPermissions, restore the permission check).
  data: new SlashCommandBuilder()
    .setName('staffnoteremove')
    .setDescription('Remove a staff note by targeting a user and note match.')
    .addUserOption((option) => option.setName('member').setDescription('User whose note should be removed').setRequired(true))
    .addStringOption((option) => option.setName('note').setDescription('A note fragment to match and remove').setRequired(true).setMinLength(1).setMaxLength(1000))
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
    const noteQuery = interaction.options.getString('note')?.trim();

    const member = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      await interaction.reply({ content: `I could not resolve ${targetUser.tag} in this server.`, ephemeral: true });
      return;
    }

    const mongoDB = require('../../index').mongoDB;
    const notes = await mongoDB.collection('staff_notes').find({ $or: [{ memberId: member.id }, { memberId: String(member.id) }] }).toArray();

    const exactMatches = notes.filter((note) => {
      const value = getNoteText(note);
      return value && noteQuery && value.toLowerCase() === noteQuery.toLowerCase();
    });

    let matchingNotes = [];
    if (noteQuery && notes.some((note) => note.noteId === noteQuery)) {
      matchingNotes = notes.filter((note) => note.noteId === noteQuery);
    } else if (exactMatches.length) {
      matchingNotes = exactMatches;
    } else {
      matchingNotes = notes.filter((note) => {
        const value = getNoteText(note);
        return value && noteQuery && value.toLowerCase().includes(noteQuery.toLowerCase());
      });
    }

    if (!matchingNotes.length) {
      await interaction.reply({ content: `No staff notes for ${member.user.tag} match that note text.`, ephemeral: true });
      return;
    }

    if (matchingNotes.length === 1) {
      const noteId = matchingNotes[0].noteId;
      const deleteResult = await mongoDB.collection('staff_notes').deleteOne({ noteId });
      if (deleteResult.deletedCount === 1) {
        await interaction.reply({ content: `Removed the matching note from ${member.user.tag}.`, ephemeral: true });
      } else {
        await interaction.reply({ content: `I could not remove the selected note from ${member.user.tag}.`, ephemeral: true });
      }
      return;
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`staffnoteremove-select:${member.id}:${interaction.user.id}`)
      .setPlaceholder('Select the note to remove')
      .addOptions(
        matchingNotes.slice(0, 25).map((choice) => ({
          label: String(getNoteText(choice)).slice(0, 100) || 'Staff note',
          value: String(choice.noteId),
          description: 'Remove this note',
        })),
      );

    await interaction.reply({
      content: `I found multiple matching notes for ${member.user.tag}. Select which one to remove:`,
      components: [new ActionRowBuilder().addComponents(selectMenu)],
      ephemeral: true,
    });
  },
};

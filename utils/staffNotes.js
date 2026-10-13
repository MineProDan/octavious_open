const { EmbedBuilder } = require('discord.js');

function getNoteText(note) {
  const text = note?.note ?? note?.content ?? '';
  return String(text ?? '').trim();
}

function getNoteAuthor(note) {
  return note?.authorName || note?.authorDisplayName || note?.authorTag || 'Unknown staff member';
}

function formatNoteSummary(note) {
  if (!note) return 'No note content available.';

  const content = getNoteText(note) || 'No note content provided.';
  const context = note?.context ? String(note.context).trim() : 'No additional context provided.';
  const author = getNoteAuthor(note);
  const createdAt = note?.createdAt ? new Date(note.createdAt) : new Date();

  return [
    `**Content:** ${content}`,
    `**Added by:** ${author}`,
    `**Date:** ${createdAt.toISOString().slice(0, 10)}`,
    `**Context:** ${context}`,
  ].join('\n');
}

function parseNoteId(note) {
  if (note?.noteId) return String(note.noteId);
  if (!note?._id) return null;
  if (typeof note._id === 'string') return note._id;
  if (note._id && typeof note._id.toHexString === 'function') return note._id.toHexString();
  return String(note._id);
}

function buildMatchingNoteChoices(notes, query = '') {
  const normalizedQuery = String(query ?? '').trim().toLowerCase();

  const matches = notes.filter((note) => {
    if (!normalizedQuery) return true;
    const searchText = `${getNoteText(note)} ${note?.context || ''}`.toLowerCase();
    return searchText.includes(normalizedQuery);
  });

  return matches.slice(0, 25).map((note) => ({
    name: getNoteText(note) || 'Untitled note',
    value: parseNoteId(note),
  })).filter((choice) => choice.value);
}

function buildUserNoteAutocomplete(notes, userId, query = '') {
  const normalizedUserId = String(userId ?? '');
  const normalizedQuery = String(query ?? '').trim().toLowerCase();

  const relevantNotes = notes.filter((note) => {
    const noteMemberId = note?.memberId != null ? String(note.memberId) : '';
    return noteMemberId === normalizedUserId;
  });

  const matches = relevantNotes.filter((note) => {
    if (!normalizedQuery) return true;
    return getNoteText(note).toLowerCase().includes(normalizedQuery);
  });

  return matches.slice(0, 25).map((note) => ({
    name: getNoteText(note) || 'Staff note',
    value: parseNoteId(note),
  })).filter((choice) => choice.value);
}

function buildStaffNotesEmbed(targetUser, notes) {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`Staff notes for ${targetUser.tag || targetUser.username || 'User'}`)
    .setDescription(notes.length ? `Showing ${notes.length} staff note${notes.length === 1 ? '' : 's'}.` : 'No staff notes found for this user.')
    .setTimestamp();

  if (notes.length === 0) {
    return embed;
  }

  embed.addFields(
    notes.slice(0, 10).map((note, index) => ({
      name: `#${index + 1}`,
      value: `${getNoteText(note) || 'No content'}\n${note?.context ? `Context: ${String(note.context).slice(0, 120)}` : 'Context: None'}\nAdded by ${getNoteAuthor(note)} on ${new Date(note?.createdAt || Date.now()).toISOString().slice(0, 10)}`,
      inline: false,
    })),
  );

  return embed;
}

module.exports = {
  getNoteText,
  getNoteAuthor,
  formatNoteSummary,
  parseNoteId,
  buildMatchingNoteChoices,
  buildUserNoteAutocomplete,
  buildStaffNotesEmbed,
};

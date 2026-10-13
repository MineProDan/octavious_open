const test = require('node:test');
const assert = require('node:assert/strict');

const {
  formatNoteSummary,
  buildMatchingNoteChoices,
} = require('../utils/staffNotes');

test('formatNoteSummary includes readable note data without category assumptions', () => {
  const note = {
    note: 'spamming in general chat',
    context: 'Repeated after temp mute',
    createdAt: new Date('2026-01-01T12:00:00Z'),
    authorDisplayName: 'mod.admin',
  };

  const summary = formatNoteSummary(note);

  assert.match(summary, /spamming in general chat/i);
  assert.match(summary, /mod\.admin/i);
  assert.doesNotMatch(summary, /category/i);
});

test('buildMatchingNoteChoices filters note text matches cleanly', () => {
  const notes = [
    {
      _id: '1',
      note: 'spamming',
      context: 'repeat after warning',
    },
    {
      _id: '2',
      note: 'ad',
      context: 'discord invite posted',
    },
    {
      _id: '3',
      note: 'needs more context',
      context: 'visit later',
    },
  ];

  const matches = buildMatchingNoteChoices(notes, 'sp');
  assert.deepEqual(matches.map((choice) => choice.value), ['1']);
  assert.match(matches[0].name, /spamming/i);

  const adMatches = buildMatchingNoteChoices(notes, 'ad');
  assert.equal(adMatches[0].value, '2');
});

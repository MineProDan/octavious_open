const test = require('node:test');
const assert = require('node:assert/strict');
const { buildUserNoteAutocomplete } = require('../utils/staffNotes');

test('buildUserNoteAutocomplete returns only notes for the selected user and displays note text', () => {
  const notes = [
    { memberId: '111', noteId: 'aaa', note: 'Alpha warning' },
    { memberId: '222', noteId: 'bbb', note: 'Beta warning' },
    { memberId: '111', noteId: 'ccc', note: 'Another alpha note' },
  ];

  assert.deepEqual(buildUserNoteAutocomplete(notes, '111', ''), [
    { name: 'Alpha warning', value: 'aaa' },
    { name: 'Another alpha note', value: 'ccc' },
  ]);
});

test('buildUserNoteAutocomplete filters by typed text for the selected user', () => {
  const notes = [
    { memberId: '111', noteId: 'aaa', note: 'Alpha warning' },
    { memberId: '111', noteId: 'ccc', note: 'Bravo warning' },
    { memberId: '222', noteId: 'bbb', note: 'Charlie warning' },
  ];

  assert.deepEqual(buildUserNoteAutocomplete(notes, '111', 'bravo'), [
    { name: 'Bravo warning', value: 'ccc' },
  ]);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const { getDocumentSelector, getChannelPath, buildSnipeChannelUpdate } = require('../utils/snipeStore');

test('getDocumentSelector stores the snipe doc by type instead of object id', () => {
  assert.deepEqual(getDocumentSelector('deleted'), { type: 'deleted' });
  assert.deepEqual(getDocumentSelector('edited'), { type: 'edited' });
});

test('buildSnipeChannelUpdate nests channel data under the correct channel key and keeps the type', () => {
  const update = buildSnipeChannelUpdate('deleted', '123456789', { authorName: 'Tester' });

  assert.equal(update.$set.type, 'deleted');
  assert.deepEqual(update.$set['channels.123456789'], { authorName: 'Tester' });
});

test('getChannelPath nests messages under the channel key', () => {
  assert.equal(getChannelPath('123456789'), 'channels.123456789');
});

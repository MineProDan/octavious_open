const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeDb } = require('./helpers/fakeMongo');
const { refreshMember } = require('../utils/webJobs/refreshMember');
const { PermanentJobError } = require('../utils/webJobs/queue');

const thresholds = new Map([[0, 0], [1, 24], [2, 62], [3, 116], [50, 65550]]);
const NOW = new Date('2026-09-22T12:00:00Z');

function fakeGuild(members) {
  return {
    members: {
      async fetch({ user }) {
        if (!members[user]) throw Object.assign(new Error('Unknown Member'), { code: 10007 });
        const data = members[user];
        return { user: { ...data, displayAvatarURL: () => `https://cdn.example/${user}/${data.avatar}.png` } };
      },
    },
  };
}

test('refreshMember updates profile fields and recomputes a stale level', async () => {
  const db = new FakeDb();
  await db.collection('userlevels').insertOne({ memberId: '111111111111111111', username: 'oldname', avatarUrl: 'old.png', totalXP: 120, level: 1, prestige: 0 });
  const guild = fakeGuild({ '111111111111111111': { username: 'newname', globalName: 'New Name', avatar: 'abc' } });

  const result = await refreshMember({ db, guild, memberId: '111111111111111111', levelThresholds: thresholds, now: NOW });

  const doc = await db.collection('userlevels').findOne({ memberId: '111111111111111111' });
  assert.equal(doc.username, 'newname');
  assert.equal(doc.globalName, 'New Name');
  assert.equal(doc.avatarUrl, 'https://cdn.example/111111111111111111/abc.png');
  assert.equal(doc.level, 3);
  assert.equal(doc.totalXP, 120);
  assert.deepEqual(result.changed, ['name', 'avatar', 'level']);
});

test('refreshMember reports nothing changed when already up to date', async () => {
  const db = new FakeDb();
  await db.collection('userlevels').insertOne({
    memberId: '222222222222222222', username: 'same', globalName: null, avatarUrl: 'https://cdn.example/222222222222222222/x.png', totalXP: 70, level: 2, prestige: 0,
  });
  const guild = fakeGuild({ '222222222222222222': { username: 'same', globalName: null, avatar: 'x' } });
  const result = await refreshMember({ db, guild, memberId: '222222222222222222', levelThresholds: thresholds, now: NOW });
  assert.deepEqual(result.changed, []);
});

test('refreshMember fails permanently for members who left or invalid IDs', async () => {
  const db = new FakeDb();
  await assert.rejects(
    refreshMember({ db, guild: fakeGuild({}), memberId: '333333', levelThresholds: thresholds }),
    PermanentJobError,
  );
  await assert.rejects(
    refreshMember({ db, guild: fakeGuild({}), memberId: 'not-an-id', levelThresholds: thresholds }),
    PermanentJobError,
  );
});

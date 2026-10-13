const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeDb } = require('./helpers/fakeMongo');
const activityStats = require('../utils/activityStats');

const at = new Date('2026-09-23T18:42:10Z');

test('recordMessage buckets into the UTC hour with per-channel and per-member counts', async () => {
  const db = new FakeDb();
  await activityStats.recordMessage({ memberId: 'a', channelId: 'c1', hasAttachment: true, at }, db);
  await activityStats.recordMessage({ memberId: 'a', channelId: 'c2', isReply: true, isThread: true, at }, db);
  await activityStats.recordMessage({ memberId: 'b', channelId: 'c1', at: new Date('2026-09-23T19:00:00Z') }, db);

  const hour = await db.collection('activity_hourly').findOne({ _id: '2026-09-23T18' });
  assert.equal(hour.messages, 2);
  assert.equal(hour.attachments, 1);
  assert.equal(hour.replies, 1);
  assert.equal(hour.threadMessages, 1);
  assert.deepEqual(hour.channels, { c1: 1, c2: 1 });
  assert.deepEqual(hour.members, { a: 2 });
  assert.equal(new Date(hour.hour).toISOString(), '2026-09-23T18:00:00.000Z');
  assert.equal((await db.collection('activity_hourly').findOne({ _id: '2026-09-23T19' })).messages, 1);
});

test('recordVoiceSession splits minutes across the hours the session spanned', async () => {
  const db = new FakeDb();
  await activityStats.recordVoiceSession({
    memberId: 'v',
    start: new Date('2026-09-23T18:30:00Z'),
    end: new Date('2026-09-23T20:15:00Z'),
  }, db);

  const minutes = async (key) => (await db.collection('activity_hourly').findOne({ _id: key }))?.voice?.v;
  assert.equal(await minutes('2026-09-23T18'), 30);
  assert.equal(await minutes('2026-09-23T19'), 60);
  assert.equal(await minutes('2026-09-23T20'), 15);
});

test('commands, reactions, joins and leaves land in their own counters', async () => {
  const db = new FakeDb();
  await activityStats.recordCommand({ memberId: 'a', commandName: 'rank', at }, db);
  await activityStats.recordReaction({ memberId: 'b', at }, db);
  await activityStats.recordJoin({ memberId: 'n', at }, db);
  await activityStats.recordLeave({ memberId: 'o', at }, db);

  const hour = await db.collection('activity_hourly').findOne({ _id: '2026-09-23T18' });
  assert.equal(hour.commands, 1);
  assert.deepEqual(hour.commandNames, { rank: 1 });
  assert.deepEqual(hour.commanders, { a: 1 });
  assert.deepEqual(hour.reactors, { b: 1 });
  assert.deepEqual(hour.joiners, { n: 1 });
  assert.deepEqual(hour.leavers, { o: 1 });
  assert.equal(hour.joins, 1);
  assert.equal(hour.leaves, 1);
});

test('markLive keeps the first startedAt', async () => {
  const db = new FakeDb();
  await activityStats.markLive(db, new Date('2026-09-23T10:00:00Z'));
  await activityStats.markLive(db, new Date('2026-09-23T11:00:00Z'));
  const live = await db.collection('activity_meta').findOne({ _id: 'live' });
  assert.equal(new Date(live.startedAt).toISOString(), '2026-09-23T10:00:00.000Z');
  assert.equal(new Date(live.lastSeenAt).toISOString(), '2026-09-23T11:00:00.000Z');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeDb } = require('./helpers/fakeMongo');
const { PermanentJobError } = require('../utils/webJobs/queue');
const { toEvent, recordExecution, markLive } = require('../utils/automod/store');
const { saveRule, deleteRule } = require('../utils/automod/rules');

const T0 = new Date('2026-09-23T12:00:00Z');

function execution(overrides = {}) {
  return {
    action: { type: 1, metadata: { customMessage: 'Watch it' } },
    ruleId: '111111111111111111',
    ruleTriggerType: 1,
    userId: '222222222222222222',
    channelId: '333333333333333333',
    messageId: null,
    alertSystemMessageId: null,
    content: 'you are a badword',
    matchedKeyword: 'badword',
    matchedContent: 'badword',
    ...overrides,
  };
}

test('toEvent maps a blocked message with its rule, member and matched text', () => {
  const event = toEvent(execution(), { ruleName: 'Bad words', memberName: 'Sam', now: T0 });
  assert.match(event.eventId, /^gw:/);
  assert.equal(event.kind, 'trigger');
  assert.equal(event.source, 'gateway');
  assert.equal(event.action, 'block_message');
  assert.equal(event.ruleName, 'Bad words');
  assert.equal(event.memberName, 'Sam');
  assert.equal(event.matchedKeyword, 'badword');
  assert.equal(event.occurredAt, T0);
  assert.equal(event.timeoutSeconds, undefined);
});

test('toEvent keeps the timeout length and alert channel', () => {
  const timeout = toEvent(execution({ action: { type: 3, metadata: { durationSeconds: 600 } } }), { now: T0 });
  assert.equal(timeout.action, 'timeout');
  assert.equal(timeout.timeoutSeconds, 600);
  const alert = toEvent(execution({ action: { type: 2, metadata: { channelId: '444444444444444444' } }, alertSystemMessageId: '555555555555555555' }), { now: T0 });
  assert.equal(alert.action, 'send_alert');
  assert.equal(alert.alertChannelId, '444444444444444444');
  assert.equal(alert.alertMessageId, '555555555555555555');
});

test('recordExecution replaces an audit-log copy of the same action but keeps unrelated ones', async () => {
  const db = new FakeDb();
  const events = db.collection('automod_events');
  const member = '222222222222222222';
  await events.insertOne({ eventId: 'audit:1', source: 'audit_log', action: 'block_message', memberId: member, occurredAt: new Date(T0.getTime() + 2000) });
  await events.insertOne({ eventId: 'audit:2', source: 'audit_log', action: 'timeout', memberId: member, occurredAt: T0 });
  await events.insertOne({ eventId: 'audit:3', source: 'audit_log', action: 'block_message', memberId: member, occurredAt: new Date(T0.getTime() - 5 * 60 * 1000) });

  await recordExecution(toEvent(execution(), { now: T0 }), db);
  const ids = (await events.find({}).toArray()).map((doc) => doc.eventId).sort();
  assert.deepEqual(ids.filter((id) => id.startsWith('audit:')), ['audit:2', 'audit:3']);
  assert.equal(ids.filter((id) => id.startsWith('gw:')).length, 1);
});

test('markLive sets startedAt once and refreshes lastSeenAt', async () => {
  const db = new FakeDb();
  await markLive(db, T0);
  const later = new Date(T0.getTime() + 60_000);
  await markLive(db, later);
  const live = await db.collection('automod_meta').findOne({ _id: 'live' });
  assert.equal(new Date(live.startedAt).getTime(), T0.getTime());
  assert.equal(new Date(live.lastSeenAt).getTime(), later.getTime());
});

function fakeRest() {
  const calls = [];
  const respond = (method) => async (route, options) => {
    calls.push({ method, route, options });
    if (fakeRest.fail) throw fakeRest.fail;
    return { id: '999999999999999999', name: options?.body?.name ?? 'rule', enabled: true };
  };
  return { calls, post: respond('post'), patch: respond('patch'), delete: respond('delete') };
}

test('saveRule creates without a ruleId and edits with one, tagging the audit reason', async () => {
  fakeRest.fail = null;
  const rest = fakeRest();
  const body = { name: 'Bad words', event_type: 1, trigger_type: 1 };
  const created = await saveRule({ rest, guildId: 'g', job: { payload: { body, actorName: 'Alex' } } });
  assert.equal(created.ruleId, '999999999999999999');
  assert.equal(rest.calls[0].method, 'post');
  assert.equal(rest.calls[0].route, '/guilds/g/auto-moderation/rules');
  assert.equal(rest.calls[0].options.reason, 'Changed on the website by Alex');

  await saveRule({ rest, guildId: 'g', job: { payload: { ruleId: '111111111111111111', body } } });
  assert.equal(rest.calls[1].method, 'patch');
  assert.equal(rest.calls[1].route, '/guilds/g/auto-moderation/rules/111111111111111111');
});

test('saveRule turns Discord validation errors into permanent failures but lets 5xx retry', async () => {
  const rest = fakeRest();
  fakeRest.fail = Object.assign(new Error('Invalid Form Body'), { status: 400, rawError: { errors: { name: 'too long' } } });
  await assert.rejects(saveRule({ rest, guildId: 'g', job: { payload: { body: {} } } }), (error) => error instanceof PermanentJobError && /too long/.test(error.message));
  fakeRest.fail = Object.assign(new Error('Service Unavailable'), { status: 503 });
  await assert.rejects(saveRule({ rest, guildId: 'g', job: { payload: { body: {} } } }), (error) => !(error instanceof PermanentJobError));
  fakeRest.fail = null;
});

test('deleteRule rejects bad IDs and treats an already-deleted rule as done', async () => {
  const rest = fakeRest();
  await assert.rejects(deleteRule({ rest, guildId: 'g', job: { payload: { ruleId: 'nope' } } }), PermanentJobError);
  fakeRest.fail = Object.assign(new Error('Unknown Auto Moderation Rule'), { status: 404 });
  const result = await deleteRule({ rest, guildId: 'g', job: { payload: { ruleId: '111111111111111111' } } });
  assert.equal(result.alreadyGone, true);
  fakeRest.fail = null;
});

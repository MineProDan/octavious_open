const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeDb } = require('./helpers/fakeMongo');
const { MAX_ATTEMPTS, PermanentJobError, claimNextJob, completeJob, failJob } = require('../utils/webJobs/queue');
const { runNextJob } = require('../utils/webJobs/worker');

const T0 = new Date('2026-09-22T12:00:00Z');
const at = (ms) => new Date(T0.getTime() + ms);

function pendingJob(overrides = {}) {
  return { jobId: 'job-1', type: 'member.refresh', payload: { memberId: '123' }, status: 'pending', attempts: 0, runAfter: T0, createdAt: T0, updatedAt: T0, ...overrides };
}

test('claimNextJob claims due pending jobs and skips ones scheduled for later', async () => {
  const db = new FakeDb();
  await db.collection('bot_jobs').insertOne(pendingJob({ jobId: 'later', runAfter: at(60_000) }));
  assert.equal(await claimNextJob(db, T0), null);

  await db.collection('bot_jobs').insertOne(pendingJob({ jobId: 'now' }));
  const claimed = await claimNextJob(db, T0);
  assert.equal(claimed.jobId, 'now');
  assert.equal(claimed.status, 'running');
  assert.equal(claimed.attempts, 1);
  assert.ok(new Date(claimed.lockedUntil) > T0);
});

test('claimNextJob reclaims a running job whose lock expired (bot restarted mid-job)', async () => {
  const db = new FakeDb();
  await db.collection('bot_jobs').insertOne(pendingJob({ status: 'running', attempts: 1, lockedUntil: at(-1) }));
  const claimed = await claimNextJob(db, T0);
  assert.equal(claimed.jobId, 'job-1');
  assert.equal(claimed.attempts, 2);
});

test('failJob backs off and retries, then gives up after MAX_ATTEMPTS', async () => {
  const db = new FakeDb();
  const jobs = db.collection('bot_jobs');
  await jobs.insertOne(pendingJob({ status: 'running', attempts: 1 }));

  assert.equal(await failJob(db, { jobId: 'job-1', attempts: 1 }, new Error('Discord 500'), T0), false);
  let job = await jobs.findOne({ jobId: 'job-1' });
  assert.equal(job.status, 'pending');
  assert.equal(job.error, 'Discord 500');
  assert.ok(new Date(job.runAfter) > T0);

  assert.equal(await failJob(db, { jobId: 'job-1', attempts: MAX_ATTEMPTS }, new Error('still failing'), T0), true);
  job = await jobs.findOne({ jobId: 'job-1' });
  assert.equal(job.status, 'failed');
  assert.ok(job.completedAt);
});

test('failJob fails permanent errors immediately', async () => {
  const db = new FakeDb();
  await db.collection('bot_jobs').insertOne(pendingJob({ status: 'running', attempts: 1 }));
  assert.equal(await failJob(db, { jobId: 'job-1', attempts: 1 }, new PermanentJobError('left server'), T0), true);
  assert.equal((await db.collection('bot_jobs').findOne({ jobId: 'job-1' })).status, 'failed');
});

test('failJob stands down when a newer pending job with the same dedupeKey exists', async () => {
  const db = new FakeDb();
  const jobs = db.collection('bot_jobs');
  await jobs.insertOne(pendingJob({ status: 'running', attempts: 1, dedupeKey: 'member.refresh:123' }));
  // Simulate the unique partial index rejecting a second pending job.
  const realUpdate = jobs.updateOne.bind(jobs);
  let rejected = false;
  jobs.updateOne = async (filter, update, options) => {
    if (!rejected && update.$set?.status === 'pending') {
      rejected = true;
      throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    }
    return realUpdate(filter, update, options);
  };
  await failJob(db, { jobId: 'job-1', attempts: 1 }, new Error('boom'), T0);
  const job = await jobs.findOne({ jobId: 'job-1' });
  assert.equal(job.status, 'done');
  assert.deepEqual(job.result, { superseded: true });
});

test('completeJob records the result', async () => {
  const db = new FakeDb();
  await db.collection('bot_jobs').insertOne(pendingJob({ status: 'running', lockedUntil: at(1000) }));
  await completeJob(db, { jobId: 'job-1' }, { changed: ['avatar'] }, T0);
  const job = await db.collection('bot_jobs').findOne({ jobId: 'job-1' });
  assert.equal(job.status, 'done');
  assert.deepEqual(job.result, { changed: ['avatar'] });
  assert.equal(job.lockedUntil, undefined);
});

test('runNextJob dispatches by type and fails unknown types permanently', async () => {
  const db = new FakeDb();
  await db.collection('bot_jobs').insertOne(pendingJob());
  await db.collection('bot_jobs').insertOne(pendingJob({ jobId: 'job-2', type: 'nonsense', createdAt: at(1) }));
  const seen = [];
  const handlers = { 'member.refresh': async (job) => { seen.push(job.payload.memberId); return { ok: true }; } };
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(await runNextJob({ db, handlers, now: () => T0 }), true);
    assert.equal(await runNextJob({ db, handlers, now: () => T0 }), true);
    assert.equal(await runNextJob({ db, handlers, now: () => T0 }), false);
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(seen, ['123']);
  assert.equal((await db.collection('bot_jobs').findOne({ jobId: 'job-1' })).status, 'done');
  assert.equal((await db.collection('bot_jobs').findOne({ jobId: 'job-2' })).status, 'failed');
});

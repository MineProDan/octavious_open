// Work queue from the website (octaviousweb repo, lib/bot-jobs.ts). The site
// inserts jobs into `bot_jobs`; this bot claims them one at a time with an
// expiring lock, runs them, and records the outcome. Mirror any change there.
//
// Job types:
//   member.refresh { memberId }  refetch the member's Discord profile into
//                                userlevels and recompute level/prestige
//   automod.rule.save { ruleId?, body, actorName }
//                                create or edit an AutoMod rule (utils/automod/rules.js)
//   automod.rule.delete { ruleId, actorName }
//                                delete an AutoMod rule

const BOT_JOBS_COLLECTION = 'bot_jobs';
const LOCK_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 5;

// Throw this for errors retrying can't fix (e.g. the member left the server).
class PermanentJobError extends Error {}

function jobs(db) {
  return db.collection(BOT_JOBS_COLLECTION);
}

// Atomically claims the oldest runnable job: pending and due, or running with
// an expired lock (the bot crashed or restarted mid-job).
async function claimNextJob(db, now = new Date()) {
  return jobs(db).findOneAndUpdate(
    {
      $or: [
        { status: 'pending', runAfter: { $lte: now } },
        { status: 'running', lockedUntil: { $lte: now } },
      ],
    },
    {
      $set: { status: 'running', lockedUntil: new Date(now.getTime() + LOCK_MS), updatedAt: now },
      $inc: { attempts: 1 },
    },
    { sort: { createdAt: 1 }, returnDocument: 'after' },
  );
}

async function completeJob(db, job, result = {}, now = new Date()) {
  await jobs(db).updateOne(
    { jobId: job.jobId },
    { $set: { status: 'done', result, completedAt: now, updatedAt: now }, $unset: { lockedUntil: '', error: '' } },
  );
}

// Retries with exponential backoff (10s, 20s, 40s, 80s) unless the error is
// permanent or attempts are used up. Returns true if the job is now failed.
async function failJob(db, job, error, now = new Date()) {
  const message = String(error?.message || error || 'Unknown error').slice(0, 500);
  const permanent = error instanceof PermanentJobError || (job.attempts || 0) >= MAX_ATTEMPTS;
  if (permanent) {
    await jobs(db).updateOne(
      { jobId: job.jobId },
      { $set: { status: 'failed', error: message, completedAt: now, updatedAt: now }, $unset: { lockedUntil: '' } },
    );
    return true;
  }
  const delayMs = 5000 * 2 ** Math.max(1, job.attempts || 1);
  try {
    await jobs(db).updateOne(
      { jobId: job.jobId },
      { $set: { status: 'pending', error: message, runAfter: new Date(now.getTime() + delayMs), updatedAt: now }, $unset: { lockedUntil: '' } },
    );
  } catch (updateError) {
    // The website already queued a newer pending job with the same dedupeKey
    // (only one may be pending). Every job type is idempotent, so let that
    // newer job do the work instead of retrying this one.
    if (updateError?.code !== 11000) throw updateError;
    await jobs(db).updateOne(
      { jobId: job.jobId },
      { $set: { status: 'done', result: { superseded: true }, error: message, completedAt: now, updatedAt: now }, $unset: { lockedUntil: '' } },
    );
  }
  return false;
}

module.exports = { BOT_JOBS_COLLECTION, MAX_ATTEMPTS, PermanentJobError, claimNextJob, completeJob, failJob };

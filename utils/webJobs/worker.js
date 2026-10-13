// Polls the website's job queue (see queue.js) and runs jobs one at a time.
// Polling keeps this independent of MongoDB change streams; with an index on
// { status, runAfter } an idle poll every couple of seconds is negligible.

const { claimNextJob, completeJob, failJob, PermanentJobError } = require('./queue');
const { refreshMember } = require('./refreshMember');
const { getLevelThresholds } = require('../levelThresholds');
const automodRules = require('../automod/rules');
const { syncMemberColors } = require('../colorRoles/sync');

const IDLE_POLL_MS = 2000;

function createHandlers({ db, client }) {
  return {
    'member.refresh': async (job) => {
      const guild = client.guilds.cache.get(process.env.GUILDID) || await client.guilds.fetch(process.env.GUILDID);
      const result = await refreshMember({ db, guild, memberId: job.payload?.memberId, levelThresholds: await getLevelThresholds() });
      // refreshMember just fetched the member, so they are in the cache.
      const member = guild.members.cache.get(job.payload.memberId);
      if (member) await syncMemberColors(member, { db }).catch((error) => console.error('Error syncing prestige roles:', error));
      return result;
    },
    'automod.rule.save': (job) => automodRules.saveRule({ rest: client.rest, guildId: process.env.GUILDID, job }),
    'automod.rule.delete': (job) => automodRules.deleteRule({ rest: client.rest, guildId: process.env.GUILDID, job }),
  };
}

// Runs a single job if one is due. Returns true if it did any work.
async function runNextJob({ db, handlers, now = () => new Date() }) {
  const job = await claimNextJob(db, now());
  if (!job) return false;
  const handler = handlers[job.type];
  try {
    if (!handler) throw new PermanentJobError(`Unknown job type: ${job.type}`);
    const result = await handler(job);
    await completeJob(db, job, result ?? {}, now());
  } catch (error) {
    const failed = await failJob(db, job, error, now());
    console.error(`Web job ${job.type} (${job.jobId}) ${failed ? 'failed' : 'will retry'}:`, error);
  }
  return true;
}

function startWebJobWorker({ db, client }) {
  const handlers = createHandlers({ db, client });
  let stopped = false;
  let timer = null;

  const tick = async () => {
    if (stopped) return;
    let didWork = false;
    try {
      didWork = await runNextJob({ db, handlers });
    } catch (error) {
      console.error('Web job worker error:', error);
    }
    // Drain back-to-back while there is work; otherwise wait before polling.
    if (!stopped) timer = setTimeout(tick, didWork ? 0 : IDLE_POLL_MS);
  };
  tick();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

module.exports = { createHandlers, runNextJob, startWebJobWorker };

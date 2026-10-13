// Applies AutoMod rule changes queued by the website's AutoMod tab
// (octaviousweb, app/api/admin/automod/route.ts). The website validates and
// builds the Discord API request body; this only forwards it, so the audit log
// shows the bot as the actor with "<staff name> via website" as the reason.
//
// Job types:
//   automod.rule.save   { ruleId?, body, actorName }  create (no ruleId) or edit a rule
//   automod.rule.delete { ruleId, actorName }         delete a rule

const { Routes } = require('discord.js');
const { PermanentJobError } = require('../webJobs/queue');

const SNOWFLAKE = /^\d{17,20}$/;

function reasonFor(job) {
  const actor = String(job.payload?.actorName || 'a staff member').slice(0, 80);
  return `Changed on the website by ${actor}`;
}

// Discord rejects bad input (4xx) for good; only 5xx / network errors retry.
function asJobError(error) {
  const status = error?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    const detail = error.rawError?.errors ? ` ${JSON.stringify(error.rawError.errors)}` : '';
    return new PermanentJobError(`${error.message}${detail}`.slice(0, 480));
  }
  return error;
}

function summarize(rule) {
  return { ruleId: rule.id, name: rule.name, enabled: rule.enabled };
}

async function saveRule({ rest, guildId, job }) {
  const { ruleId, body } = job.payload || {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PermanentJobError('Missing rule body.');
  if (ruleId !== undefined && !SNOWFLAKE.test(String(ruleId))) throw new PermanentJobError('Invalid rule ID.');
  try {
    const rule = ruleId
      ? await rest.patch(Routes.guildAutoModerationRule(guildId, ruleId), { body, reason: reasonFor(job) })
      : await rest.post(Routes.guildAutoModerationRules(guildId), { body, reason: reasonFor(job) });
    return summarize(rule);
  } catch (error) {
    throw asJobError(error);
  }
}

async function deleteRule({ rest, guildId, job }) {
  const ruleId = String(job.payload?.ruleId || '');
  if (!SNOWFLAKE.test(ruleId)) throw new PermanentJobError('Invalid rule ID.');
  try {
    await rest.delete(Routes.guildAutoModerationRule(guildId, ruleId), { reason: reasonFor(job) });
  } catch (error) {
    // Already gone is what the website wanted.
    if (error?.status === 404) return { ruleId, deleted: true, alreadyGone: true };
    throw asJobError(error);
  }
  return { ruleId, deleted: true };
}

module.exports = { saveRule, deleteRule, reasonFor };

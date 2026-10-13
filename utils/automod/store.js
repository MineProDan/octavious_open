// Live AutoMod log for the website's admin "AutoMod" tab (octaviousweb,
// lib/automod.ts). Every action AutoMod takes (block a message, send an alert,
// time someone out, block a profile) arrives as its own gateway event and is
// stored as one document in `automod_events`. A TTL index drops entries after
// RETENTION_DAYS.
//
// The website also imports AutoMod entries from Discord's audit log (history
// from before the bot was listening, and anything missed while it was offline).
// Audit entries carry no message text, so a live entry always wins: when one
// is recorded, any audit-sourced copy of the same action is removed, and the
// website skips audit entries that already have a live match. Mirror any
// schema change there.
//
// automod_events document:
//   eventId: string                 'gw:<random>' (live) or 'audit:<entry id>'
//   kind: 'trigger' | 'rule_change'  (the bot only writes triggers)
//   source: 'gateway' | 'audit_log'
//   action: 'block_message' | 'send_alert' | 'timeout' | 'block_interaction'
//   ruleId, ruleName, triggerType   triggerType is Discord's number (1 keyword,
//                                   3 spam, 4 preset, 5 mention spam, 6 profile)
//   memberId, memberName
//   channelId, messageId, alertMessageId
//   content, matchedKeyword, matchedContent
//   timeoutSeconds, alertChannelId
//   occurredAt: Date (TTL field)

const { randomUUID } = require('node:crypto');

const EVENTS_COLLECTION = 'automod_events';
const META_COLLECTION = 'automod_meta';
const RETENTION_DAYS = 365;
// How far apart a live event and its audit log entry can be and still match.
const MATCH_WINDOW_MS = 30 * 1000;

// Discord AutoModerationActionType -> stored action name.
const ACTIONS = { 1: 'block_message', 2: 'send_alert', 3: 'timeout', 4: 'block_interaction' };

let mongoDB;
function getMongoDB() {
  if (!mongoDB) ({ mongoDB } = require('../../index'));
  return mongoDB;
}

async function ensureAutomodIndexes(db = getMongoDB()) {
  const events = db.collection(EVENTS_COLLECTION);
  await Promise.all([
    events.createIndex({ eventId: 1 }, { unique: true }),
    events.createIndex({ occurredAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 }),
    events.createIndex({ kind: 1, occurredAt: -1 }),
    events.createIndex({ memberId: 1, occurredAt: -1 }),
  ]);
}

// Tells the website live logging is running. Only the first call sets startedAt.
async function markLive(db = getMongoDB(), now = new Date()) {
  await db.collection(META_COLLECTION).updateOne(
    { _id: 'live' },
    { $setOnInsert: { startedAt: now }, $set: { lastSeenAt: now } },
    { upsert: true },
  );
}

// Turns a discord.js AutoModerationActionExecution into a stored event.
function toEvent(execution, { ruleName, memberName, now = new Date() } = {}) {
  const action = ACTIONS[execution.action?.type] || `unknown_${execution.action?.type}`;
  const metadata = execution.action?.metadata || {};
  const event = {
    eventId: `gw:${randomUUID()}`,
    kind: 'trigger',
    source: 'gateway',
    action,
    ruleId: execution.ruleId,
    ruleName: ruleName || null,
    triggerType: execution.ruleTriggerType,
    memberId: execution.userId,
    memberName: memberName || null,
    channelId: execution.channelId || null,
    messageId: execution.messageId || null,
    alertMessageId: execution.alertSystemMessageId || null,
    content: execution.content || null,
    matchedKeyword: execution.matchedKeyword || null,
    matchedContent: execution.matchedContent || null,
    occurredAt: now,
  };
  if (action === 'timeout' && metadata.durationSeconds) event.timeoutSeconds = metadata.durationSeconds;
  if (action === 'send_alert' && metadata.channelId) event.alertChannelId = metadata.channelId;
  return event;
}

async function recordExecution(event, db = getMongoDB()) {
  const events = db.collection(EVENTS_COLLECTION);
  await events.insertOne(event);
  // The website may already have imported this action from the audit log.
  const at = event.occurredAt.getTime();
  await events.deleteMany({
    source: 'audit_log',
    action: event.action,
    memberId: event.memberId,
    occurredAt: { $gte: new Date(at - MATCH_WINDOW_MS), $lte: new Date(at + MATCH_WINDOW_MS) },
  });
}

module.exports = { EVENTS_COLLECTION, META_COLLECTION, ACTIONS, ensureAutomodIndexes, markLive, toEvent, recordExecution };

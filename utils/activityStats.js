// Rolling server-activity statistics for the website's admin "Activity analysis"
// page (octaviousweb, lib/activity.ts). Everything is bucketed into one document
// per UTC hour in `activity_hourly`; a TTL index drops buckets after
// RETENTION_DAYS, so the stats are always a rolling window.
//
// The website's backfill script (octaviousweb, scripts/backfill-activity.mjs)
// rebuilds hours *before* `activity_meta.live.startedAt` from Discord's message
// history, so the bot only ever $inc's hours at or after that point and the two
// writers never double count. Mirror any schema change there.
//
// activity_hourly document:
//   _id: '2026-09-23T18'            UTC hour key
//   hour: Date                      start of the hour (TTL field)
//   messages, attachments, replies, threadMessages,
//   reactions, voiceMinutes, commands, joins, leaves: number
//   channels:     { [channelId]: messages }   (thread messages count toward the parent)
//   members:      { [memberId]: messages }
//   reactors:     { [memberId]: reactions given }
//   voice:        { [memberId]: minutes }
//   commandNames: { [commandName]: uses }
//   commanders:   { [memberId]: commands used }
//   joiners / leavers: { [memberId]: 1 }

const HOURLY_COLLECTION = 'activity_hourly';
const SNAPSHOT_COLLECTION = 'activity_snapshots';
const META_COLLECTION = 'activity_meta';
const RETENTION_DAYS = 400;
const HOUR_MS = 60 * 60 * 1000;

let mongoDB;
function getMongoDB() {
  if (!mongoDB) ({ mongoDB } = require('../index'));
  return mongoDB;
}

function hourStart(at) {
  return new Date(Math.floor(at.getTime() / HOUR_MS) * HOUR_MS);
}

function hourKey(at) {
  return hourStart(at).toISOString().slice(0, 13);
}

// Mongo field names can't contain '.' or start with '$'.
function safeKey(value) {
  return String(value).replace(/[.$]/g, '_');
}

async function bump(db, at, inc) {
  await db.collection(HOURLY_COLLECTION).updateOne(
    { _id: hourKey(at) },
    { $inc: inc, $setOnInsert: { hour: hourStart(at) } },
    { upsert: true },
  );
}

async function ensureActivityIndexes(db = getMongoDB()) {
  const ttl = RETENTION_DAYS * 24 * 60 * 60;
  await Promise.all([
    db.collection(HOURLY_COLLECTION).createIndex({ hour: 1 }, { expireAfterSeconds: ttl }),
    db.collection(SNAPSHOT_COLLECTION).createIndex({ at: 1 }, { expireAfterSeconds: ttl }),
  ]);
}

// Marks when live recording began. Only the first call sets startedAt.
async function markLive(db = getMongoDB(), now = new Date()) {
  await db.collection(META_COLLECTION).updateOne(
    { _id: 'live' },
    { $setOnInsert: { startedAt: now }, $set: { lastSeenAt: now } },
    { upsert: true },
  );
}

async function recordMessage({ memberId, channelId, hasAttachment = false, isReply = false, isThread = false, at = new Date() }, db = getMongoDB()) {
  const inc = {
    messages: 1,
    [`channels.${safeKey(channelId)}`]: 1,
    [`members.${safeKey(memberId)}`]: 1,
  };
  if (hasAttachment) inc.attachments = 1;
  if (isReply) inc.replies = 1;
  if (isThread) inc.threadMessages = 1;
  await bump(db, at, inc);
}

async function recordReaction({ memberId, at = new Date() }, db = getMongoDB()) {
  await bump(db, at, { reactions: 1, [`reactors.${safeKey(memberId)}`]: 1 });
}

async function recordCommand({ memberId, commandName, at = new Date() }, db = getMongoDB()) {
  await bump(db, at, {
    commands: 1,
    [`commandNames.${safeKey(commandName)}`]: 1,
    [`commanders.${safeKey(memberId)}`]: 1,
  });
}

async function recordJoin({ memberId, at = new Date() }, db = getMongoDB()) {
  await bump(db, at, { joins: 1, [`joiners.${safeKey(memberId)}`]: 1 });
}

async function recordLeave({ memberId, at = new Date() }, db = getMongoDB()) {
  await bump(db, at, { leaves: 1, [`leavers.${safeKey(memberId)}`]: 1 });
}

// Splits a voice session across the hours it spanned so "voice by hour of day"
// reflects when people were actually talking, not when they hung up.
async function recordVoiceSession({ memberId, start, end = new Date() }, db = getMongoDB()) {
  let cursor = start.getTime();
  const stop = end.getTime();
  const writes = [];
  while (cursor < stop) {
    const boundary = Math.min(stop, (Math.floor(cursor / HOUR_MS) + 1) * HOUR_MS);
    const minutes = Math.round(((boundary - cursor) / 60000) * 10) / 10;
    if (minutes > 0) {
      writes.push(bump(db, new Date(cursor), { voiceMinutes: minutes, [`voice.${safeKey(memberId)}`]: minutes }));
    }
    cursor = boundary;
  }
  await Promise.all(writes);
}

// Hourly point-in-time snapshot of the server (population, online, voice).
async function snapshotGuild(guild, db = getMongoDB(), now = new Date()) {
  const fetched = await guild.fetch().catch(() => guild);
  const inVoice = guild.voiceStates.cache.filter((state) => state.channelId && !state.member?.user?.bot).size;
  await db.collection(SNAPSHOT_COLLECTION).insertOne({
    at: now,
    source: 'bot',
    members: fetched.approximateMemberCount ?? guild.memberCount,
    online: fetched.approximatePresenceCount ?? null,
    boosts: guild.premiumSubscriptionCount ?? null,
    inVoice,
  });
}

module.exports = {
  HOURLY_COLLECTION,
  SNAPSHOT_COLLECTION,
  META_COLLECTION,
  hourKey,
  ensureActivityIndexes,
  markLive,
  recordMessage,
  recordReaction,
  recordCommand,
  recordJoin,
  recordLeave,
  recordVoiceSession,
  snapshotGuild,
};

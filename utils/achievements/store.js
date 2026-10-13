const {
  toDateKey,
  toMonthKey,
  toWeekKey,
  computeStreakUpdate,
  computeWeeklyStreakUpdate,
  daysInMonth,
  getPacificDateKey,
  evaluateAchievements,
  evaluateSpecialAchievements,
  countUnlockedInCategory,
  hasUnlockedAllInCategory,
} = require('./engine');
const { getAchievementDefinition } = require('./definitions');
const { createDefaultPets } = require('../pets/store');
const petMechanics = require('../pets/mechanics');

let mongoDB;
function getMongoDB() {
  if (!mongoDB) {
    ({ mongoDB } = require('../../index'));
  }
  return mongoDB;
}

const PROGRESS_COLLECTION = 'achievement_progress';
const CHANNEL_ACTIVITY_COLLECTION = 'achievement_channel_activity';
const MONTHLY_ACTIVITY_COLLECTION = 'achievement_monthly_activity';
const DAILY_CHAMPION_COLLECTION = 'achievement_daily_champion';
const CLAIM_CONFIG_COLLECTION = 'achievement_claim_config';
const CLAIM_CONFIG_ID = 'daily-claim';
const DEFAULT_CLAIM_XP = 100;
const CLAIM_START_XP = 250;
const CLAIM_STREAK_STEP_XP = 50;
const CLAIM_MAX_XP = 500;

/** Day 1 pays 250 XP, +50 per streak day, hard-capped at 500. */
function getStreakClaimXp(streak) {
  const days = Math.max(1, Math.floor(Number(streak) || 1));
  return Math.min(CLAIM_MAX_XP, CLAIM_START_XP + CLAIM_STREAK_STEP_XP * (days - 1));
}

const GENERAL_CHANNEL_ID = process.env.ACHIEVEMENTS_GENERAL_CHANNEL_ID || null;
const CONFIGURED_CHANNEL_IDS = (process.env.ACHIEVEMENTS_CONFIGURED_CHANNEL_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

function createDefaultProgress(memberId) {
  return {
    memberId,
    messages: {
      total: 0,
      byChannel: {},
      longestLength: 0,
      attachments: 0,
      replies: 0,
      threadMessages: 0,
      maxDayCount: 0,
      maxChannelCount: 0,
      maxNonGeneralChannelCount: 0,
      maxDailyUniqueChannels: 0,
      todayDate: null,
      todayCount: 0,
      todayChannels: [],
      recentHistory: [],
    },
    channels: {
      unique: [],
      recentHits: [],
      silenceBreaks: 0,
    },
    activity: {
      activeDaysCount: 0,
      activeDaysSet: [],
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null,
      weekendDaysSet: [],
      monthsActiveSet: [],
      weeklyStreak: 0,
      longestWeeklyStreak: 0,
      lastActiveWeekKey: null,
      monthDayCounts: {},
    },
    threads: { created: 0, uniqueActive: [] },
    snipesEdits: { ownDeleted: 0, ownEdited: 0, deletedViewed: 0, editedViewed: 0 },
    social: {
      reactionsReceived: 0,
      reactionsGiven: 0,
      uniqueRepliedUsers: [],
      mentionsReceived: 0,
      maxUniqueReactorsOnMessage: 0,
      uniqueInteractedUsers: [],
      messageReactorCounts: {},
    },
    voice: { totalMinutes: 0 },
    bot: { uniqueCommands: [], totalCommands: 0, rankChecks: 0 },
    timeBased: {
      joinedAt: null,
      joinPosition: null,
      midnightClubDays: [],
      earlyBirdDays: [],
    },
    xp: { levelUpTimestamps: [], dailyGain: { date: null, amount: 0 } },
    claim: {
      currentStreak: 0,
      longestStreak: 0,
      lastClaimDatePST: null,
      totalClaims: 0,
      totalXpClaimed: 0,
    },
    pets: createDefaultPets(),
    flags: {},
    unlocked: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function addUnique(arr, value) {
  if (!arr.includes(value)) {
    arr.push(value);
    return true;
  }
  return false;
}

function unwrapFindOneAndUpdate(result) {
  if (result && typeof result === 'object' && 'value' in result) return result.value;
  return result || null;
}

async function getProgress(memberId) {
  const db = getMongoDB();
  const doc = await db.collection(PROGRESS_COLLECTION).findOne({ memberId });
  if (!doc) return createDefaultProgress(memberId);

  // Merge with defaults so newly added fields exist for older documents.
  const defaults = createDefaultProgress(memberId);
  return {
    ...defaults,
    ...doc,
    messages: { ...defaults.messages, ...doc.messages },
    channels: { ...defaults.channels, ...doc.channels },
    activity: { ...defaults.activity, ...doc.activity },
    threads: { ...defaults.threads, ...doc.threads },
    snipesEdits: { ...defaults.snipesEdits, ...doc.snipesEdits },
    social: { ...defaults.social, ...doc.social },
    voice: { ...defaults.voice, ...doc.voice },
    bot: { ...defaults.bot, ...doc.bot },
    timeBased: { ...defaults.timeBased, ...doc.timeBased },
    xp: { ...defaults.xp, ...doc.xp },
    claim: { ...defaults.claim, ...doc.claim },
    pets: { ...defaults.pets, ...doc.pets },
    flags: { ...defaults.flags, ...doc.flags },
    unlocked: doc.unlocked || [],
  };
}

async function getClaimConfig() {
  const db = getMongoDB();
  const result = await db.collection(CLAIM_CONFIG_COLLECTION).findOneAndUpdate(
    { _id: CLAIM_CONFIG_ID },
    {
      $setOnInsert: {
        _id: CLAIM_CONFIG_ID,
        baseXp: DEFAULT_CLAIM_XP,
        timezone: 'America/Los_Angeles',
        updatedAt: new Date(),
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  return unwrapFindOneAndUpdate(result) || { baseXp: DEFAULT_CLAIM_XP };
}

async function migrateClaimFields() {
  const db = getMongoDB();
  const result = await db.collection(PROGRESS_COLLECTION).updateMany(
    { claim: { $exists: false } },
    {
      $set: {
        claim: createDefaultProgress('__migration__').claim,
        updatedAt: new Date(),
      },
    },
  );
  const users = await db.collection('userlevels').find({}, { projection: { memberId: 1 } }).toArray();
  for (const user of users) {
    if (!user.memberId) continue;
    await db.collection(PROGRESS_COLLECTION).updateOne(
      { memberId: user.memberId },
      { $setOnInsert: { memberId: user.memberId, claim: createDefaultProgress(user.memberId).claim, createdAt: new Date() } },
      { upsert: true },
    );
  }
  await getClaimConfig();
  return result.modifiedCount || 0;
}

// Flags and unlocked achievements only ever grow, so a save must never shrink
// them. Callers often hold a progress object loaded before another handler for
// the same member saved new unlocks (e.g. a message's XP award and its pet
// mechanics); writing that object back whole would erase them. So each true
// flag is set on its own, and `unlocked` is only ever added to (addUnlocks).
async function saveProgress(progress) {
  const db = getMongoDB();
  progress.updatedAt = new Date();
  const { _id, unlocked, flags, ...fields } = progress;
  const set = { ...fields };
  for (const [key, value] of Object.entries(flags || {})) {
    if (value) set[`flags.${key}`] = value;
  }
  await db.collection(PROGRESS_COLLECTION).updateOne(
    { memberId: progress.memberId },
    { $set: set },
    { upsert: true },
  );
  return progress;
}

// Saves only the pet state, for pet code that changes nothing else.
async function savePetState(progress) {
  const db = getMongoDB();
  progress.updatedAt = new Date();
  await db.collection(PROGRESS_COLLECTION).updateOne(
    { memberId: progress.memberId },
    { $set: { pets: progress.pets, updatedAt: progress.updatedAt } },
    { upsert: true },
  );
  return progress;
}

// Adds unlock entries the member doesn't already have. Returns the ids that
// were actually added (an id another handler saved first is skipped).
async function addUnlocks(memberId, entries) {
  const db = getMongoDB();
  const added = [];
  for (const entry of entries) {
    const result = await db.collection(PROGRESS_COLLECTION).updateOne(
      { memberId, 'unlocked.id': { $ne: entry.id } },
      { $push: { unlocked: entry } },
    );
    if (result.modifiedCount === 1) added.push(entry.id);
  }
  return added;
}

async function getUserLevels(memberId) {
  const db = getMongoDB();
  return db.collection('userlevels').findOne({ memberId });
}

/** Applies join-age/message-count derived flags. Mutates progress in place. */
function refreshComputedFlags(progress, now) {
  const joinedAt = progress.timeBased.joinedAt ? new Date(progress.timeBased.joinedAt) : null;
  if (joinedAt) {
    const yearsIn = (now.getTime() - joinedAt.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const total = progress.messages.total;
    if (yearsIn >= 1 && total >= 500) progress.flags.oldGuard = true;
    if (yearsIn >= 2 && total >= 1000) progress.flags.serverHistorian = true;
    if (yearsIn >= 3 && total >= 2500) progress.flags.ancient = true;
    if (yearsIn >= 5 && total >= 5000) progress.flags.stillHere5y = true;
  }

  const position = progress.timeBased.joinPosition;
  if (typeof position === 'number') {
    if (position <= 250) progress.flags.immortal = true;
    if (position <= 1000) progress.flags.unc = true;
    if (position <= 5000) progress.flags.elder = true;
  }
}

async function buildContext(memberId, now = new Date()) {
  const [progress, userlevels] = await Promise.all([getProgress(memberId), getUserLevels(memberId)]);
  refreshComputedFlags(progress, now);
  return { now, progress, userlevels };
}

/**
 * Runs the achievement engine for a user, persists newly unlocked achievements,
 * and logs each unlock to the console. Returns the list of newly unlocked definitions.
 */
async function evaluateAndAward(memberId, { progress: providedProgress, now = new Date() } = {}) {
  const progress = providedProgress || (await getProgress(memberId));
  const userlevels = await getUserLevels(memberId);
  refreshComputedFlags(progress, now);

  const context = { now, progress, userlevels };
  const unlockedIds = new Set(progress.unlocked.map((entry) => entry.id));

  const newlyUnlocked = evaluateAchievements(context, unlockedIds);
  for (const id of newlyUnlocked) unlockedIds.add(id);

  const specialUnlocked = evaluateSpecialAchievements(unlockedIds);
  for (const id of specialUnlocked) unlockedIds.add(id);

  const allNewIds = [...newlyUnlocked, ...specialUnlocked];
  if (allNewIds.length === 0) {
    await saveProgress(progress);
    return [];
  }

  const entries = allNewIds.map((id) => ({ id, unlockedAt: now }));
  progress.unlocked.push(...entries);
  await saveProgress(progress);
  const addedIds = await addUnlocks(memberId, entries);

  const awarded = addedIds.map((id) => getAchievementDefinition(id)).filter(Boolean);
  for (const def of awarded) {
    console.log(`[Achievements] ${memberId} unlocked "${def.name}" (${def.id}) in category "${def.category}"`);
  }

  return awarded;
}

// ---------------------------------------------------------------- messages

function recordHiddenMessageFlags(progress, { content, at, memberId, isReplyToSelf, recentBanAt }) {
  const hour = at.getUTCHours();
  const minute = at.getUTCMinutes();

  if (hour === 0 && minute === 0) progress.flags.midnightSnack = true;
  if (content && content.includes('777')) progress.flags.luckyNumber = true;
  if (isReplyToSelf) progress.flags.echo = true;

  const history = progress.messages.recentHistory;
  const nowMs = at.getTime();

  const immediatePrevious = history[history.length - 1];
  if (immediatePrevious && immediatePrevious.content === content && content.length > 0) {
    progress.flags.dejaVu = true;
  }

  const withinLastMinute = history.filter((entry) => nowMs - entry.at <= 60 * 1000 && entry.content === content);
  if (withinLastMinute.length > 0 && content.length > 0) {
    progress.flags.doubleTake = true;
  }

  const yesterdayKey = toDateKey(new Date(nowMs - 24 * 60 * 60 * 1000));
  const todayKey = toDateKey(at);
  const sameMinuteYesterday = history.find((entry) => {
    const entryDate = new Date(entry.at);
    return toDateKey(entryDate) === yesterdayKey && entryDate.getUTCHours() === hour && entryDate.getUTCMinutes() === minute;
  });
  if (sameMinuteYesterday && todayKey !== yesterdayKey) {
    progress.flags.sameTimeTomorrow = true;
  }

  history.push({ content, at: nowMs });
  if (history.length > 20) history.shift();

  if (recentBanAt && Math.abs(nowMs - recentBanAt) <= 5 * 60 * 1000) {
    progress.flags.wrongPlaceWrongTime = true;
  }

  const joinedAt = progress.timeBased.joinedAt ? new Date(progress.timeBased.joinedAt) : null;
  if (joinedAt && at.getUTCMonth() === joinedAt.getUTCMonth() && at.getUTCDate() === joinedAt.getUTCDate() && at.getUTCFullYear() > joinedAt.getUTCFullYear()) {
    progress.flags.anniversary = true;
  }
}

function checkPerfectMonth(progress, at) {
  const monthKey = toMonthKey(at);
  const dateKey = toDateKey(at);
  const set = new Set(progress.activity.monthDayCounts[monthKey] || []);
  set.add(dateKey);
  progress.activity.monthDayCounts[monthKey] = [...set];

  const [year, month] = monthKey.split('-').map(Number);
  if (set.size >= daysInMonth(year, month)) {
    progress.flags.perfectMonth = true;
  }
}

function recordActivityDay(progress, at) {
  const dateKey = toDateKey(at);
  const activity = progress.activity;
  if (!activity.activeDaysSet.includes(dateKey)) {
    activity.activeDaysSet.push(dateKey);
    activity.activeDaysCount = activity.activeDaysSet.length;

    const dow = at.getUTCDay();
    if (dow === 0 || dow === 6) addUnique(activity.weekendDaysSet, dateKey);
    addUnique(activity.monthsActiveSet, toMonthKey(at));

    const streakUpdate = computeStreakUpdate(activity, dateKey);
    activity.currentStreak = streakUpdate.currentStreak;
    activity.longestStreak = streakUpdate.longestStreak;
    activity.lastActiveDate = streakUpdate.lastActiveDate;

    const weekKey = toWeekKey(at);
    const weeklyUpdate = computeWeeklyStreakUpdate(activity, weekKey);
    activity.weeklyStreak = weeklyUpdate.weeklyStreak;
    activity.longestWeeklyStreak = weeklyUpdate.longestWeeklyStreak;
    activity.lastActiveWeekKey = weeklyUpdate.lastActiveWeekKey;

    checkPerfectMonth(progress, at);
  }

  const hour = at.getUTCHours();
  if (hour < 3) addUnique(progress.timeBased.midnightClubDays, dateKey);
  else if (hour < 8) addUnique(progress.timeBased.earlyBirdDays, dateKey);
}

// Returns the channel's previous last-activity timestamp (before this message) and bumps it to now.
async function getPreviousChannelActivity(channelId, now) {
  const db = getMongoDB();
  const result = await db.collection(CHANNEL_ACTIVITY_COLLECTION).findOneAndUpdate(
    { _id: channelId },
    { $set: { lastMessageAt: now } },
    { upsert: true, returnDocument: 'before', includeResultMetadata: true },
  );
  const doc = unwrapFindOneAndUpdate(result);
  return doc?.lastMessageAt ? new Date(doc.lastMessageAt) : null;
}

async function maybeAwardFirstInLine(memberId, monthKey) {
  const db = getMongoDB();
  const coll = db.collection(MONTHLY_ACTIVITY_COLLECTION);
  await coll.updateOne({ _id: monthKey }, { $setOnInsert: { _id: monthKey, users: [] } }, { upsert: true });
  const result = await coll.findOneAndUpdate(
    { _id: monthKey, users: { $ne: memberId } },
    { $push: { users: memberId } },
    { returnDocument: 'after', includeResultMetadata: true },
  );
  const doc = unwrapFindOneAndUpdate(result);
  if (!doc) return false;
  return doc.users.length <= 25;
}

/**
 * Records a qualifying message and updates every message/channel/activity metric.
 * payload: { channelId, content, hasAttachment, isReply, replyAuthorId, isReplyToSelf, isThread, at }
 */
async function recordMessage(memberId, payload) {
  const at = payload.at || new Date();
  const progress = await getProgress(memberId);
  const m = progress.messages;
  const content = payload.content || '';

  m.total += 1;
  m.byChannel[payload.channelId] = (m.byChannel[payload.channelId] || 0) + 1;
  m.maxChannelCount = Math.max(m.maxChannelCount, m.byChannel[payload.channelId]);
  if (payload.channelId !== GENERAL_CHANNEL_ID) {
    m.maxNonGeneralChannelCount = Math.max(m.maxNonGeneralChannelCount, m.byChannel[payload.channelId]);
  }
  m.longestLength = Math.max(m.longestLength, content.length);
  if (payload.hasAttachment) m.attachments += 1;

  if (payload.isReply) {
    m.replies += 1;
    if (payload.replyAuthorId && payload.replyAuthorId !== memberId) {
      addUnique(progress.social.uniqueRepliedUsers, payload.replyAuthorId);
      addUnique(progress.social.uniqueInteractedUsers, payload.replyAuthorId);
    }
  }

  if (payload.isThread) {
    m.threadMessages += 1;
    addUnique(progress.threads.uniqueActive, payload.channelId);
  }

  const dateKey = toDateKey(at);
  if (m.todayDate !== dateKey) {
    m.todayDate = dateKey;
    m.todayCount = 0;
    m.todayChannels = [];
  }
  m.todayCount += 1;
  m.maxDayCount = Math.max(m.maxDayCount, m.todayCount);
  addUnique(m.todayChannels, payload.channelId);
  m.maxDailyUniqueChannels = Math.max(m.maxDailyUniqueChannels, m.todayChannels.length);

  addUnique(progress.channels.unique, payload.channelId);
  if (CONFIGURED_CHANNEL_IDS.length > 0 && CONFIGURED_CHANNEL_IDS.every((id) => progress.channels.unique.includes(id))) {
    progress.flags.serverTourist = true;
  }

  const hits = progress.channels.recentHits;
  hits.push({ channelId: payload.channelId, at: at.getTime() });
  const oneHourAgo = at.getTime() - 60 * 60 * 1000;
  progress.channels.recentHits = hits.filter((hit) => hit.at >= oneHourAgo).slice(-50);
  const distinctChannelsLastHour = new Set(progress.channels.recentHits.map((hit) => hit.channelId));
  if (distinctChannelsLastHour.size >= 3) progress.flags.tripleThreat = true;

  recordActivityDay(progress, at);
  const recentBanAt = payload.guildId ? await getRecentBanTimestamp(payload.guildId) : null;
  recordHiddenMessageFlags(progress, { content, at, memberId, isReplyToSelf: Boolean(payload.isReplyToSelf), recentBanAt });

  const monthKey = toMonthKey(at);
  if (progress.timeBased.lastActivityMonthKey !== monthKey) {
    progress.timeBased.lastActivityMonthKey = monthKey;
    const firstInLine = await maybeAwardFirstInLine(memberId, monthKey);
    if (firstInLine) progress.flags.firstInLine = true;
  }

  const previousActivity = await getPreviousChannelActivity(payload.channelId, at);
  if (previousActivity) {
    const gapMs = at.getTime() - previousActivity.getTime();
    if (gapMs >= 60 * 60 * 1000) progress.channels.silenceBreaks += 1;
    if (gapMs >= 24 * 60 * 60 * 1000) progress.flags.helloDarkness = true;
  }

  await saveProgress(progress);
  return evaluateAndAward(memberId, { progress, now: at });
}

async function recordOwnMessageDeleted(memberId, { at, sentAt } = {}) {
  const progress = await getProgress(memberId);
  progress.snipesEdits.ownDeleted += 1;
  if (sentAt && at && at.getTime() - sentAt.getTime() <= 30 * 1000) {
    progress.flags.oops = true;
  }
  await saveProgress(progress);
  return evaluateAndAward(memberId, { progress, now: at || new Date() });
}

async function recordOwnMessageEdited(memberId) {
  const progress = await getProgress(memberId);
  progress.snipesEdits.ownEdited += 1;
  await saveProgress(progress);
  return evaluateAndAward(memberId, { progress });
}

async function recordSnipeViewed(memberId, type) {
  const progress = await getProgress(memberId);
  if (type === 'edited') progress.snipesEdits.editedViewed += 1;
  else progress.snipesEdits.deletedViewed += 1;
  await saveProgress(progress);
  return evaluateAndAward(memberId, { progress });
}

// ---------------------------------------------------------------- social

async function recordReactionGiven(memberId, targetUserId) {
  const progress = await getProgress(memberId);
  progress.social.reactionsGiven += 1;
  if (targetUserId && targetUserId !== memberId) {
    addUnique(progress.social.uniqueInteractedUsers, targetUserId);
  }
  await saveProgress(progress);
  return evaluateAndAward(memberId, { progress });
}

async function recordReactionReceived(memberId, { messageId, reactorId, isFromStaff, emojiName }) {
  const progress = await getProgress(memberId);
  progress.social.reactionsReceived += 1;

  const counts = progress.social.messageReactorCounts;
  const reactors = new Set(counts[messageId] || []);
  reactors.add(reactorId);
  counts[messageId] = [...reactors];
  progress.social.maxUniqueReactorsOnMessage = Math.max(progress.social.maxUniqueReactorsOnMessage, reactors.size);

  if (isFromStaff && emojiName === '🍪') {
    progress.flags.aTreat = true;
  }

  await saveProgress(progress);
  return evaluateAndAward(memberId, { progress });
}

async function recordMentionsReceived(memberId, count = 1) {
  const progress = await getProgress(memberId);
  progress.social.mentionsReceived += count;
  await saveProgress(progress);
  return evaluateAndAward(memberId, { progress });
}

async function recordFirstResponder(memberId) {
  const progress = await getProgress(memberId);
  progress.flags.firstResponder = true;
  await saveProgress(progress);
  return evaluateAndAward(memberId, { progress });
}

// ---------------------------------------------------------------- channels / threads

async function recordThreadCreated(memberId) {
  const progress = await getProgress(memberId);
  progress.threads.created += 1;
  await saveProgress(progress);
  return evaluateAndAward(memberId, { progress });
}

// ---------------------------------------------------------------- voice

async function recordVoiceMinutes(memberId, minutes) {
  if (!minutes || minutes <= 0) return [];
  const progress = await getProgress(memberId);
  progress.voice.totalMinutes += minutes;
  await saveProgress(progress);
  return evaluateAndAward(memberId, { progress });
}

async function recordGhostAlone(memberId) {
  const progress = await getProgress(memberId);
  progress.flags.ghost = true;
  await saveProgress(progress);
  return evaluateAndAward(memberId, { progress });
}

// ---------------------------------------------------------------- bot usage

async function recordCommandUsage(memberId, commandName) {
  const progress = await getProgress(memberId);
  progress.bot.totalCommands += 1;
  addUnique(progress.bot.uniqueCommands, commandName);
  if (commandName === 'level' || commandName === 'rank') progress.bot.rankChecks += 1;
  await saveProgress(progress);
  return evaluateAndAward(memberId, { progress });
}

// ---------------------------------------------------------------- xp / levels

async function recordXpAward(memberId, { totalXP, at = new Date() } = {}) {
  const progress = await getProgress(memberId);
  const lastGainAt = progress.xp.lastGainAt ? new Date(progress.xp.lastGainAt) : null;
  if (lastGainAt && at.getTime() - lastGainAt.getTime() > 7 * 24 * 60 * 60 * 1000) {
    progress.flags.backFromTheDead = true;
  }
  progress.xp.lastGainAt = at;

  if (typeof totalXP === 'number' && totalXP % 1000 === 777) {
    progress.flags.tripleSevens = true;
  }

  await saveProgress(progress);
  return evaluateAndAward(memberId, { progress, now: at });
}

async function claimDailyXp(memberId, { now = new Date() } = {}) {
  const db = getMongoDB();
  const claimDatePST = getPacificDateKey(now);
  await getClaimConfig();
  const claimCollection = db.collection(PROGRESS_COLLECTION);
  await saveProgress(await getProgress(memberId));
  const result = await claimCollection.findOneAndUpdate(
    {
      memberId,
      'claim.lastClaimDatePST': { $ne: claimDatePST },
    },
    {
      $set: {
        'claim.lastClaimDatePST': claimDatePST,
        updatedAt: now,
      },
      $inc: { 'claim.totalClaims': 1 },
    },
    { returnDocument: 'before', includeResultMetadata: true },
  );
  const previous = unwrapFindOneAndUpdate(result);
  if (!previous) {
    const current = await getProgress(memberId);
    return { claimed: false, claimDatePST, xpAwarded: 0, streak: current.claim.currentStreak || 0 };
  }

  const previousDate = previous?.claim?.lastClaimDatePST;
  const yesterdayPST = getPacificDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const previousStreak = Number(previous?.claim?.currentStreak) || 0;
  let currentStreak;
  let phoenixSave = null;
  if (previousDate === yesterdayPST) {
    currentStreak = previousStreak + 1;
  } else if (previousDate) {
    // A gap occurred; give an equipped Phoenix a chance to save the streak instead of resetting it.
    phoenixSave = petMechanics.tryPhoenixStreakSave({ previousProgress: previous, now });
    currentStreak = phoenixSave.saved ? previousStreak + 1 : 1;
  } else {
    currentStreak = 1;
  }
  const longestStreak = Math.max(Number(previous?.claim?.longestStreak) || 0, currentStreak);
  const { feedPets } = require('../pets/store');
  const petFeed = await feedPets(memberId, { now });
  const petBonuses = require('../pets/store').getPetBonuses(petFeed.progress);
  const baseXp = getStreakClaimXp(currentStreak);
  const xpAwarded = Math.floor(baseXp * (1 + petBonuses.multiplier) + petBonuses.flatXp);

  await claimCollection.updateOne(
    { memberId, 'claim.lastClaimDatePST': claimDatePST },
    {
      $set: {
        'claim.currentStreak': currentStreak,
        'claim.longestStreak': longestStreak,
        'claim.totalXpClaimed': (Number(previous?.claim?.totalXpClaimed) || 0) + xpAwarded,
        updatedAt: now,
        ...(phoenixSave?.saved ? { 'pets.phoenixLastSaveAt': phoenixSave.phoenixLastSaveAt } : {}),
      },
    },
  );

  await db.collection('userlevels').updateOne(
    { memberId },
    {
      $inc: { totalXP: xpAwarded },
      $setOnInsert: { level: 1, prestige: 0 },
    },
    { upsert: true },
  );

  const progress = await getProgress(memberId);
  const awarded = await evaluateAndAward(memberId, { progress, now });
  return {
    claimed: true,
    claimDatePST,
    baseXp,
    xpAwarded,
    streak: currentStreak,
    awarded,
    petFeed,
    petBonuses,
  };
}

async function resetDailyClaimWindow({ now = new Date() } = {}) {
  const db = getMongoDB();
  const currentDatePST = getPacificDateKey(now);
  const previousDatePST = getPacificDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const result = await db.collection(PROGRESS_COLLECTION).updateMany(
    {},
    {
      $set: {
        'claim.lastClaimDatePST': previousDatePST,
        updatedAt: now,
      },
    },
  );

  console.log(`[Achievements] Daily claim window manually reset for ${result.modifiedCount || 0} users on Pacific date ${currentDatePST}.`);
  return {
    currentDatePST,
    previousDatePST,
    usersUpdated: result.modifiedCount || 0,
  };
}

async function restoreClaimStreak(memberId, streak, { now = new Date() } = {}) {
  if (!Number.isSafeInteger(streak) || streak < 1) {
    throw new RangeError('Claim streak must be a positive integer.');
  }

  const progress = await getProgress(memberId);
  const currentDatePST = getPacificDateKey(now);
  const previousDatePST = getPacificDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  progress.claim.currentStreak = streak;
  progress.claim.longestStreak = Math.max(Number(progress.claim.longestStreak) || 0, streak);
  if (progress.claim.lastClaimDatePST !== currentDatePST) {
    progress.claim.lastClaimDatePST = previousDatePST;
  }

  await saveProgress(progress);
  return progress.claim;
}

async function recordLevelUp(memberId, { at = new Date() } = {}) {
  const progress = await getProgress(memberId);
  const timestamps = progress.xp.levelUpTimestamps || [];
  timestamps.push(at.getTime());
  const weekAgo = at.getTime() - 7 * 24 * 60 * 60 * 1000;
  progress.xp.levelUpTimestamps = timestamps.filter((t) => t >= weekAgo);
  await saveProgress(progress);
  return evaluateAndAward(memberId, { progress, now: at });
}

// ---------------------------------------------------------------- membership / moderation

async function recordMemberJoin(memberId, { joinedAt = new Date(), joinPosition = null } = {}) {
  const progress = await getProgress(memberId);
  progress.timeBased.joinedAt = joinedAt;
  progress.timeBased.joinPosition = joinPosition;
  await saveProgress(progress);
}

async function recordBanEvent(guildId, at = new Date()) {
  const db = getMongoDB();
  await db.collection(CHANNEL_ACTIVITY_COLLECTION).updateOne(
    { _id: `ban:${guildId}` },
    { $set: { lastBanAt: at } },
    { upsert: true },
  );
}

async function getRecentBanTimestamp(guildId) {
  const db = getMongoDB();
  const doc = await db.collection(CHANNEL_ACTIVITY_COLLECTION).findOne({ _id: `ban:${guildId}` });
  return doc?.lastBanAt ? new Date(doc.lastBanAt).getTime() : null;
}

async function recordScheduledEventInteraction(memberId) {
  const progress = await getProgress(memberId);
  progress.flags.eventConnoisseur = true;
  await saveProgress(progress);
  return evaluateAndAward(memberId, { progress });
}

// ---------------------------------------------------------------- leaderboard (batch, periodic)

async function evaluateLeaderboardAchievements() {
  const db = getMongoDB();
  const leaderboard = await db.collection('userlevels')
    .find({}, { projection: { memberId: 1, totalXP: 1 } })
    .sort({ totalXP: -1 })
    .limit(200)
    .toArray();

  for (let i = 0; i < Math.min(leaderboard.length, 100); i += 1) {
    const progress = await getProgress(leaderboard[i].memberId);
    if (!progress.flags.top100) {
      progress.flags.top100 = true;
      await saveProgress(progress);
      await evaluateAndAward(leaderboard[i].memberId, { progress });
    }
  }

  for (let i = 0; i < leaderboard.length - 1; i += 1) {
    const diff = (leaderboard[i].totalXP || 0) - (leaderboard[i + 1].totalXP || 0);
    if (diff >= 100000) {
      const progress = await getProgress(leaderboard[i].memberId);
      if (!progress.flags.noContest) {
        progress.flags.noContest = true;
        await saveProgress(progress);
        await evaluateAndAward(leaderboard[i].memberId, { progress });
      }
    }
  }
}

async function evaluateDailyChampion() {
  const db = getMongoDB();
  const todayKey = toDateKey(new Date());
  const marker = await db.collection(DAILY_CHAMPION_COLLECTION).findOne({ _id: 'lastCheckedDate' });
  if (marker?.date === todayKey) return; // already ran today

  const topGainer = await db.collection(PROGRESS_COLLECTION)
    .find({ 'xp.dailyGain.amount': { $gt: 0 } }, { projection: { memberId: 1, 'xp.dailyGain': 1 } })
    .sort({ 'xp.dailyGain.amount': -1 })
    .limit(1)
    .toArray();

  if (topGainer.length > 0) {
    const progress = await getProgress(topGainer[0].memberId);
    progress.flags.dailyChampion = true;
    await saveProgress(progress);
    await evaluateAndAward(topGainer[0].memberId, { progress });
  }

  await db.collection(DAILY_CHAMPION_COLLECTION).updateOne(
    { _id: 'lastCheckedDate' },
    { $set: { date: todayKey } },
    { upsert: true },
  );
}

async function recordDailyXpGain(memberId, amount) {
  const progress = await getProgress(memberId);
  const todayKey = toDateKey(new Date());
  if (progress.xp.dailyGain.date !== todayKey) {
    progress.xp.dailyGain = { date: todayKey, amount: 0 };
  }
  progress.xp.dailyGain.amount += amount;
  await saveProgress(progress);
}

module.exports = {
  createDefaultProgress,
  getProgress,
  getClaimConfig,
  migrateClaimFields,
  saveProgress,
  savePetState,
  addUnlocks,
  getUserLevels,
  getMongoDB,
  buildContext,
  evaluateAndAward,
  recordMessage,
  recordOwnMessageDeleted,
  recordOwnMessageEdited,
  recordSnipeViewed,
  recordReactionGiven,
  recordReactionReceived,
  recordMentionsReceived,
  recordFirstResponder,
  recordThreadCreated,
  recordVoiceMinutes,
  recordGhostAlone,
  recordCommandUsage,
  recordXpAward,
  claimDailyXp,
  getStreakClaimXp,
  resetDailyClaimWindow,
  restoreClaimStreak,
  recordLevelUp,
  recordMemberJoin,
  recordBanEvent,
  getRecentBanTimestamp,
  recordScheduledEventInteraction,
  recordDailyXpGain,
  evaluateLeaderboardAchievements,
  evaluateDailyChampion,
  getPacificDateKey,
  countUnlockedInCategory,
  hasUnlockedAllInCategory,
};

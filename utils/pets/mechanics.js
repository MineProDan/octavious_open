const levelLog = require('../levelLog');
// Live-pipeline mechanics for pets whose perks are more than a flat/multiplier
// number: reaction games, XP sharing, streak protection, inactivity charge,
// hoarding, rolling per-hour scaling, cooldown bypass/bonus, and chance-based
// doubling. Wired into events/messageCreate.js, events/messageReactionAdd.js,
// events/ready.js, and achievements/store.js's claimDailyXp.
//
// Every function here is defensive about missing/partial pet state so it is
// always safe to call regardless of which pets a caller has equipped.

const { getPetDefinition, getPetLevel, getPetStats } = require('./catalog');

let mongoDB;
function getMongoDB() {
  if (!mongoDB) {
    ({ mongoDB } = require('../../index'));
  }
  return mongoDB;
}

// Lazy require to avoid a load-time cycle: achievements/store.js requires
// this module at the top level, so this module must not require
// achievements/store.js until a function actually runs.
function getAchievementsStore() {
  return require('../achievements/store');
}

const FLOWER_EMOJI = '🌼';
const BEE_SPAWN_CHANCE = 1; // TODO: temporary for testing, dial back down before real use
const BEE_REACT_WINDOW_MS = 60 * 1000;
const CHEETAH_THROTTLE_MS = 5 * 1000;
const FOX_THROTTLE_MS = 15 * 1000;
const SQUIRREL_HOARD_RATE = 0.15;
const YETI_CHARGE_HOURS_TO_CAP = 24;
const YETI_DEPLETE_RATE = 0.5;
const TURTLE_WINDOW_MS = 60 * 60 * 1000;
const TURTLE_BONUS_CAP = 0.2;

function statsFor(petId, bond) {
  const definition = getPetDefinition(petId);
  if (!definition) return null;
  return getPetStats(definition, Number(bond) || 0);
}

function isEquipped(pets, petId) {
  return Array.isArray(pets?.equipped) && pets.equipped.includes(petId);
}

// ---- Yeti: charges an inactivity bonus that depletes as messages are sent ----

function computeYetiCharge(pets, nowMs) {
  const stats = statsFor('yeti', pets.bond?.yeti);
  if (!stats) return 0;
  const cap = stats.chargeCapPercent || 0;
  const banked = Number(pets.yetiCharge) || 0;
  const since = pets.yetiInactiveSince;
  if (!since) return Math.min(cap, banked);
  const elapsedHours = Math.max(0, (nowMs - since) / (60 * 60 * 1000));
  return Math.min(cap, banked + (elapsedHours / YETI_CHARGE_HOURS_TO_CAP) * cap);
}

function getYetiChargeBonus(pets, nowMs = Date.now()) {
  if (!isEquipped(pets, 'yeti')) return 0;
  return computeYetiCharge(pets, nowMs) / 100;
}

/** Mutates pets in place: banks the depleted charge and resets the accrual baseline. */
function applyYetiDepletion(pets, nowMs = Date.now()) {
  if (!isEquipped(pets, 'yeti')) return;
  const current = computeYetiCharge(pets, nowMs);
  pets.yetiCharge = current * (1 - YETI_DEPLETE_RATE);
  pets.yetiInactiveSince = nowMs;
}

// ---- Turtle: rolling hourly message-count bonus ----

function getTurtleRollingBonus(pets, nowMs = Date.now()) {
  if (!isEquipped(pets, 'turtle')) return 0;
  const stats = statsFor('turtle', pets.bond?.turtle);
  if (!stats) return 0;
  const windowStart = nowMs - TURTLE_WINDOW_MS;
  const count = (pets.turtleRecentMessages || []).filter((at) => at >= windowStart).length;
  const bonus = Math.floor(count / 5) * (stats.bonusPerFive || 0);
  return Math.min(TURTLE_BONUS_CAP, bonus);
}

/** Mutates pets in place: records this message and prunes the rolling window. */
function recordTurtleMessage(pets, nowMs = Date.now()) {
  if (!isEquipped(pets, 'turtle')) return;
  const windowStart = nowMs - TURTLE_WINDOW_MS;
  const recent = (pets.turtleRecentMessages || []).filter((at) => at >= windowStart);
  recent.push(nowMs);
  pets.turtleRecentMessages = recent.slice(-200);
}

// ---- Squirrel: hoards a cut of each message's XP, chance to drop it all ----

/** Mutates pets in place. Returns { dropped, amount } — amount is only set when dropped. */
function applySquirrelHoard(pets, amount, { random = Math.random } = {}) {
  if (!isEquipped(pets, 'squirrel')) return { dropped: false, amount: 0 };
  const stats = statsFor('squirrel', pets.bond?.squirrel);
  if (!stats) return { dropped: false, amount: 0 };
  const hoard = (Number(pets.squirrelHoard) || 0) + Math.round(amount * SQUIRREL_HOARD_RATE);
  if (random() < (stats.hoardDropChance || 0)) {
    pets.squirrelHoard = 0;
    return { dropped: true, amount: hoard };
  }
  pets.squirrelHoard = hoard;
  return { dropped: false, amount: 0 };
}

// ---- Wolf: shares a % of gained XP with a linked member ----

function getWolfSharePayout(pets, amount) {
  if (!isEquipped(pets, 'wolf') || !pets.wolfLinkTarget) return null;
  const stats = statsFor('wolf', pets.bond?.wolf);
  if (!stats) return null;
  const shareAmount = Math.floor(amount * (stats.sharePercent || 0));
  if (shareAmount <= 0) return null;
  return { targetId: pets.wolfLinkTarget, amount: shareAmount };
}

// ---- Bee: bot occasionally reacts with a flower; reacting back promptly pays out ----

/** Mutates pets in place on success. Returns { expiresAt } or null. */
function maybeSpawnBeeReaction(pets, nowMs = Date.now(), { random = Math.random } = {}) {
  if (!isEquipped(pets, 'bee')) return null;
  if (pets.beePendingReaction && pets.beePendingReaction.expiresAt > nowMs) return null;
  if (pets.beeLastSpawnAt && nowMs - pets.beeLastSpawnAt < BEE_REACT_WINDOW_MS) return null;
  if (random() >= BEE_SPAWN_CHANCE) return null;
  pets.beeLastSpawnAt = nowMs;
  const expiresAt = nowMs + BEE_REACT_WINDOW_MS;
  pets.beePendingReaction = null; // set by the caller once the message id/channel are known
  return { expiresAt };
}

/** Fetches progress, resolves a pending Bee reaction, and pays out XP if it matches. Returns the XP awarded (0 if none). */
async function claimBeeReactionReward(memberId, { messageId, channelId, emojiName, now = Date.now() } = {}) {
  const store = getAchievementsStore();
  const progress = await store.getProgress(memberId);
  const pets = progress.pets;
  const pending = pets.beePendingReaction;
  if (!isEquipped(pets, 'bee') || !pending) return 0;
  if (pending.messageId !== messageId || pending.channelId !== channelId || emojiName !== FLOWER_EMOJI) return 0;
  if (now > pending.expiresAt) {
    pets.beePendingReaction = null;
    await store.savePetState(progress);
    return 0;
  }
  const stats = statsFor('bee', pets.bond?.bee);
  const reward = stats?.reactionXp || 0;
  pets.beePendingReaction = null;
  await store.savePetState(progress);
  if (reward > 0) {
    await getMongoDB().collection('userlevels').updateOne(
      { memberId },
      { $inc: { totalXP: reward }, $setOnInsert: { level: 1, prestige: 0 } },
      { upsert: true },
    );
    levelLog(`[Pet] Bee reaction claimed by ${memberId}: +${reward} XP`);
  }
  return reward;
}

// ---- Cheetah: small flat bonus that bypasses the message-XP cooldown ----

/** Rolls, pays out, and persists in one call (this branch has no other save happening). Returns the bonus XP granted (0 if none). */
async function applyCheetahBonus(memberId, progress, { now = Date.now() } = {}) {
  const pets = progress.pets;
  if (!isEquipped(pets, 'cheetah')) return 0;
  const stats = statsFor('cheetah', pets.bond?.cheetah);
  if (!stats) return 0;
  if (pets.cheetahLastBonusAt && now - pets.cheetahLastBonusAt < CHEETAH_THROTTLE_MS) return 0;
  pets.cheetahLastBonusAt = now;
  const bonusXp = stats.cooldownBonusXp || 0;
  if (bonusXp <= 0) return 0;
  await Promise.all([
    getMongoDB().collection('userlevels').updateOne(
      { memberId },
      { $inc: { totalXP: bonusXp }, $setOnInsert: { level: 1, prestige: 0 } },
      { upsert: true },
    ),
    getAchievementsStore().savePetState(progress),
  ]);
  levelLog(`[Pet] Cheetah proc for ${memberId}: +${bonusXp} XP (cooldown bypass)`);
  return bonusXp;
}

// ---- Fox: chance to fully ignore the message-XP cooldown ----

/**
 * Pure decision + in-memory throttle mutation; the resulting progress save
 * happens later via applyPostAwardMechanics. Takes memberId only for logging
 * a proc — it plays no part in the roll itself.
 */
function rollFoxBypass(pets, nowMs = Date.now(), { random = Math.random, memberId } = {}) {
  if (!isEquipped(pets, 'fox')) return false;
  const stats = statsFor('fox', pets.bond?.fox);
  if (!stats) return false;
  if (pets.foxLastBypassAt && nowMs - pets.foxLastBypassAt < FOX_THROTTLE_MS) return false;
  if (random() >= (stats.bypassChance || 0)) return false;
  pets.foxLastBypassAt = nowMs;
  levelLog(`[Pet] Fox proc for ${memberId}: XP cooldown bypassed`);
  return true;
}

// ---- Cat: chance to instantly double the XP gain that triggered a level-up ----

/** Rolls and pays out in one call. Returns the bonus XP granted (0 if none). */
async function tryCatDouble(memberId, progress, amount, { random = Math.random } = {}) {
  const pets = progress.pets;
  if (!isEquipped(pets, 'cat')) return 0;
  const stats = statsFor('cat', pets.bond?.cat);
  if (!stats) return 0;
  if (random() >= (stats.doubleChance || 0)) return 0;
  await getMongoDB().collection('userlevels').updateOne(
    { memberId },
    { $inc: { totalXP: amount }, $setOnInsert: { level: 1, prestige: 0 } },
    { upsert: true },
  );
  levelLog(`[Pet] Cat proc for ${memberId}: doubled level-up gain (+${amount} XP)`);
  return amount;
}

// ---- Bunny: hourly chance to reopen today's daily claim, extending the streak ----

/** Hourly background pass across every user with Bunny equipped who already claimed today. Returns how many bonus claims were granted. */
async function runBunnyBonusClaimPass({ now = new Date(), random = Math.random } = {}) {
  const { getPacificDateKey } = require('../achievements/engine');
  const db = getMongoDB();
  const todayPST = getPacificDateKey(now);
  const yesterdayPST = getPacificDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const candidates = await db.collection('achievement_progress').find({
    'pets.equipped': 'bunny',
    'claim.lastClaimDatePST': todayPST,
  }).toArray();

  let granted = 0;
  for (const doc of candidates) {
    if (doc.pets?.bunnyLastBonusClaimDate === todayPST) continue;
    const stats = statsFor('bunny', doc.pets?.bond?.bunny);
    if (!stats || random() >= (stats.bonusClaimChance || 0)) continue;
    const result = await db.collection('achievement_progress').updateOne(
      { memberId: doc.memberId, 'claim.lastClaimDatePST': todayPST },
      { $set: { 'claim.lastClaimDatePST': yesterdayPST, 'pets.bunnyLastBonusClaimDate': todayPST } },
    );
    if (result.modifiedCount === 1) {
      granted += 1;
      levelLog(`[Pet] Bunny proc for ${doc.memberId}: bonus daily claim reopened`);
    }
  }
  return granted;
}

// ---- Phoenix: saves a streak break, gated by a per-evolution cooldown ----

/** Pure helper called from claimDailyXp right at the streak-break decision point. */
function tryPhoenixStreakSave({ previousProgress, now = new Date() } = {}) {
  const pets = previousProgress?.pets;
  if (!isEquipped(pets, 'phoenix')) return { saved: false };
  const stats = statsFor('phoenix', pets.bond?.phoenix);
  if (!stats) return { saved: false };
  const cooldownMs = (stats.saveCooldownDays || 0) * 24 * 60 * 60 * 1000;
  const lastSaveAt = pets.phoenixLastSaveAt ? new Date(pets.phoenixLastSaveAt).getTime() : null;
  if (lastSaveAt && now.getTime() - lastSaveAt < cooldownMs) return { saved: false };
  levelLog(`[Pet] Phoenix proc for ${previousProgress.memberId}: saved a broken claim streak`);
  return { saved: true, phoenixLastSaveAt: now };
}

// ---- Combined post-award dispatcher (Yeti/Turtle/Squirrel/Wolf/Bee) ----

/**
 * Called once per XP-earning message. Applies every equipped mechanic that
 * only needs to react to an award (as opposed to Fox/Cheetah/Cat, which
 * change whether/how much XP is awarded in the first place), then persists
 * every bookkeeping change with a single savePetState call.
 */
async function applyPostAwardMechanics(memberId, progress, { amount, now, message } = {}) {
  const pets = progress.pets;
  const nowMs = (now instanceof Date ? now.getTime() : now) || Date.now();
  const db = getMongoDB();
  const ops = [];

  if (isEquipped(pets, 'yeti')) applyYetiDepletion(pets, nowMs);
  if (isEquipped(pets, 'turtle')) recordTurtleMessage(pets, nowMs);

  if (isEquipped(pets, 'squirrel')) {
    const hoardResult = applySquirrelHoard(pets, amount);
    if (hoardResult.dropped && hoardResult.amount > 0) {
      ops.push(db.collection('userlevels').updateOne({ memberId }, { $inc: { totalXP: hoardResult.amount } }));
      levelLog(`[Pet] Squirrel proc for ${memberId}: hoard dropped (+${hoardResult.amount} XP)`);
    }
  }

  const wolfPayout = getWolfSharePayout(pets, amount);
  if (wolfPayout) {
    ops.push(db.collection('userlevels').updateOne(
      { memberId: wolfPayout.targetId },
      { $inc: { totalXP: wolfPayout.amount }, $setOnInsert: { level: 1, prestige: 0 } },
      { upsert: true },
    ));
    levelLog(`[Pet] Wolf proc for ${memberId}: shared ${wolfPayout.amount} XP with ${wolfPayout.targetId}`);
  }

  if (message && isEquipped(pets, 'bee')) {
    const spawn = maybeSpawnBeeReaction(pets, nowMs);
    if (spawn) {
      pets.beePendingReaction = { messageId: message.id, channelId: message.channel.id, expiresAt: spawn.expiresAt };
      ops.push(message.react(FLOWER_EMOJI).catch(() => null));
      levelLog(`[Pet] Bee proc for ${memberId}: flower spawned (expires in ${Math.round(BEE_REACT_WINDOW_MS / 1000)}s)`);
    }
  }

  await Promise.all(ops);
  await getAchievementsStore().savePetState(progress);
}

module.exports = {
  getYetiChargeBonus,
  applyYetiDepletion,
  getTurtleRollingBonus,
  recordTurtleMessage,
  applySquirrelHoard,
  getWolfSharePayout,
  maybeSpawnBeeReaction,
  claimBeeReactionReward,
  applyCheetahBonus,
  rollFoxBypass,
  tryCatDouble,
  runBunnyBonusClaimPass,
  tryPhoenixStreakSave,
  applyPostAwardMechanics,
};

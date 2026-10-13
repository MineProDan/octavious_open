const test = require('node:test');
const assert = require('node:assert/strict');

const { FakeDb } = require('./helpers/fakeMongo');

const indexPath = require.resolve('../index');
require.cache[indexPath] = {
  id: indexPath,
  filename: indexPath,
  loaded: true,
  exports: { mongoDB: new FakeDb(), mongoClient: {} },
};

const achievements = require('../utils/achievements/store');
const { countUnlockedInCategory, hasUnlockedAllInCategory } = require('../utils/achievements/engine');
const { CATEGORIES } = require('../utils/achievements/categories');
const pets = require('../utils/pets/store');
const mechanics = require('../utils/pets/mechanics');
const { PETS, getPetDefinition, getPetLevel, getPetStats, describePetAbility } = require('../utils/pets/catalog');

test('every pet has a non-empty, strictly increasing levels array and a valid ability description', () => {
  for (const pet of PETS) {
    assert.ok(Array.isArray(pet.levels) && pet.levels.length > 0, `${pet.id} has no levels`);
    let prevBond = -1;
    for (const level of pet.levels) {
      assert.ok(level.bond > prevBond, `${pet.id} levels are not strictly increasing`);
      prevBond = level.bond;
      const stats = getPetStats(pet, level.bond);
      const description = describePetAbility(pet, stats);
      assert.ok(typeof description === 'string' && description.length > 0, `${pet.id} has an empty ability description`);
    }
  }
});

test('achievement category helpers count and detect completion correctly', async () => {
  const progress = await achievements.getProgress('category-helper-user');
  await achievements.saveProgress(progress);
  await achievements.addUnlocks('category-helper-user', [
    { id: 'first-blood', unlockedAt: new Date() }, // Messages
    { id: 'limit-breaker', unlockedAt: new Date() }, // XP & Levels
  ]);
  const refreshed = await achievements.getProgress('category-helper-user');

  assert.equal(countUnlockedInCategory(refreshed, CATEGORIES.XP_LEVELS), 1);
  assert.equal(countUnlockedInCategory(refreshed, CATEGORIES.SOCIAL), 0);
  assert.equal(hasUnlockedAllInCategory(refreshed, CATEGORIES.VOICE), false);
});

async function ownPet(memberId, petId, bond = 0) {
  const profile = await pets.getPetProfile(memberId);
  profile.pets.owned.push(petId);
  profile.pets.bond[petId] = bond;
  await achievements.saveProgress(profile.progress);
  return achievements.getProgress(memberId);
}

async function ownAndEquip(memberId, petId, bond = 0) {
  await ownPet(memberId, petId, bond);
  await pets.equipPet(memberId, petId);
  const refreshed = await pets.getPetProfile(memberId);
  refreshed.pets.bond[petId] = bond;
  await achievements.saveProgress(refreshed.progress);
  return achievements.getProgress(memberId);
}

test('Wolf link sets a persistent target and shares a % of the owner\'s XP', async () => {
  const memberId = 'wolf-user';
  await ownAndEquip(memberId, 'wolf', 45); // max evolution -> 15%
  const linked = await pets.setWolfLink(memberId, 'wolf', 'wolf-target');
  assert.equal(linked.targetUserId, 'wolf-target');

  const progress = await achievements.getProgress(memberId);
  const payout = mechanics.getWolfSharePayout(progress.pets, 100);
  assert.deepEqual(payout, { targetId: 'wolf-target', amount: 15 });

  await mechanics.applyPostAwardMechanics(memberId, progress, { amount: 100, now: Date.now() });
  const targetLevels = await achievements.getUserLevels('wolf-target');
  assert.equal(targetLevels.totalXP, 15);
});

test('setWolfLink rejects non-Wolf pets and self-linking', async () => {
  const memberId = 'wolf-guard-user';
  await assert.rejects(pets.setWolfLink(memberId, 'rabbit', 'someone'), /cannot be linked/);
  await ownPet(memberId, 'wolf', 0);
  await assert.rejects(pets.setWolfLink(memberId, 'wolf', memberId), /yourself/);
});

test('Bunny unlocks after one daily claim and its hourly pass grants a bonus claim idempotently', async () => {
  const memberId = 'bunny-user';
  const progress = await achievements.getProgress(memberId);
  progress.claim.totalClaims = 0;
  await achievements.saveProgress(progress);
  let profile = await pets.getPetProfile(memberId);
  assert.ok(!profile.pets.owned.includes('bunny'));

  await achievements.claimDailyXp(memberId, { now: new Date('2026-09-01T12:00:00Z') });
  profile = await pets.getPetProfile(memberId);
  assert.ok(profile.pets.owned.includes('bunny'));

  await pets.equipPet(memberId, 'bunny');
  profile = await pets.getPetProfile(memberId);
  profile.pets.bond.bunny = 45; // max evolution -> 15% hourly chance
  await achievements.saveProgress(profile.progress);

  const now = new Date('2026-09-01T15:00:00Z');
  const granted = await mechanics.runBunnyBonusClaimPass({ now, random: () => 0 });
  assert.equal(granted, 1);

  const afterPass = await achievements.getProgress(memberId);
  assert.equal(afterPass.pets.bunnyLastBonusClaimDate, require('../utils/achievements/engine').getPacificDateKey(now));

  // A second pass the same hour/day must not grant again even with a guaranteed roll.
  const secondPass = await mechanics.runBunnyBonusClaimPass({ now, random: () => 0 });
  assert.equal(secondPass, 0);

  // The reopened claim window should let the user claim again today and extend their streak.
  const secondClaim = await achievements.claimDailyXp(memberId, { now: new Date('2026-09-01T16:00:00Z') });
  assert.equal(secondClaim.claimed, true);
  assert.equal(secondClaim.streak, 2);
});

test('Cheetah grants a small flat bonus on cooldown-blocked messages, throttled between procs', async () => {
  const memberId = 'cheetah-user';
  const progress = await ownAndEquip(memberId, 'cheetah', 45); // max evolution -> 9 XP
  const now = Date.now();

  const first = await mechanics.applyCheetahBonus(memberId, progress, { now });
  assert.equal(first, 9);
  const levelsAfterFirst = await achievements.getUserLevels(memberId);
  assert.equal(levelsAfterFirst.totalXP, 9);

  const second = await mechanics.applyCheetahBonus(memberId, progress, { now: now + 1000 });
  assert.equal(second, 0, 'throttle should block a bonus 1s later');

  const third = await mechanics.applyCheetahBonus(memberId, progress, { now: now + 6000 });
  assert.equal(third, 9, 'throttle should allow a bonus after its window passes');
});

test('Yeti charges an inactivity bonus that depletes as messages are sent', () => {
  const pets_ = { equipped: ['yeti'], bond: { yeti: 45 }, yetiCharge: 0, yetiInactiveSince: null }; // cap 40%
  const now = Date.now();
  pets_.yetiInactiveSince = now - 24 * 60 * 60 * 1000; // 24h idle -> full cap
  assert.equal(mechanics.getYetiChargeBonus(pets_, now), 0.4);

  mechanics.applyYetiDepletion(pets_, now);
  assert.ok(Math.abs(pets_.yetiCharge - 20) < 1e-9, 'depletion should halve the charge');
  assert.equal(mechanics.getYetiChargeBonus(pets_, now), 0.2);
});

test('Turtle rolling window bonus scales with messages in the last hour and prunes old ones', () => {
  const pets_ = { equipped: ['turtle'], bond: { turtle: 45 }, turtleRecentMessages: [] }; // 2.5% per 5 msgs, cap 20%
  const now = Date.now();
  for (let i = 0; i < 12; i += 1) mechanics.recordTurtleMessage(pets_, now - i * 1000);
  assert.equal(mechanics.getTurtleRollingBonus(pets_, now), 0.05); // floor(12/5)*0.025

  // A message from over an hour ago should be pruned out of the window.
  pets_.turtleRecentMessages.push(now - 2 * 60 * 60 * 1000);
  const bonusAfterStale = mechanics.getTurtleRollingBonus(pets_, now);
  mechanics.recordTurtleMessage(pets_, now);
  assert.ok(pets_.turtleRecentMessages.every((at) => at >= now - 60 * 60 * 1000));
  assert.equal(bonusAfterStale, 0.05);
});

test('Squirrel hoards XP and pays out the full pool on a forced drop', () => {
  const pets_ = { equipped: ['squirrel'], bond: { squirrel: 0 }, squirrelHoard: 0 }; // stage 0 -> 20% drop chance
  const missed = mechanics.applySquirrelHoard(pets_, 100, { random: () => 0.99 });
  assert.deepEqual(missed, { dropped: false, amount: 0 });
  assert.equal(pets_.squirrelHoard, 15);

  const dropped = mechanics.applySquirrelHoard(pets_, 100, { random: () => 0 });
  assert.deepEqual(dropped, { dropped: true, amount: 30 });
  assert.equal(pets_.squirrelHoard, 0);
});

test('Cat has a deterministic chance to double a level-up gain', async () => {
  const memberId = 'cat-user';
  const progress = await ownAndEquip(memberId, 'cat', 45); // max evolution -> 2.5%

  const miss = await mechanics.tryCatDouble(memberId, progress, 500, { random: () => 0.99 });
  assert.equal(miss, 0);

  const hit = await mechanics.tryCatDouble(memberId, progress, 500, { random: () => 0 });
  assert.equal(hit, 500);
  const levels = await achievements.getUserLevels(memberId);
  assert.equal(levels.totalXP, 500);
});

test('Fox has a deterministic, throttled chance to bypass the XP cooldown', () => {
  const pets_ = { equipped: ['fox'], bond: { fox: 45 }, foxLastBypassAt: null }; // max evolution -> 18%
  const now = Date.now();
  assert.equal(mechanics.rollFoxBypass(pets_, now, { random: () => 0 }), true);
  assert.equal(mechanics.rollFoxBypass(pets_, now + 1000, { random: () => 0 }), false, 'throttle should block an immediate second bypass');
  assert.equal(mechanics.rollFoxBypass(pets_, now + 20000, { random: () => 0.99 }), false, 'a missed roll should not bypass');
});

test('Bee spawns a claimable flower reaction and pays out once, within its expiry window', async () => {
  const memberId = 'bee-user';
  const progress = await ownAndEquip(memberId, 'bee', 45); // max evolution -> 80 XP
  const now = Date.now();

  const spawn = mechanics.maybeSpawnBeeReaction(progress.pets, now, { random: () => 0 });
  assert.ok(spawn);
  progress.pets.beePendingReaction = { messageId: 'msg-1', channelId: 'chan-1', expiresAt: spawn.expiresAt };
  await achievements.saveProgress(progress);

  const wrongMessage = await mechanics.claimBeeReactionReward(memberId, { messageId: 'msg-2', channelId: 'chan-1', emojiName: '🌼', now });
  assert.equal(wrongMessage, 0);

  const reward = await mechanics.claimBeeReactionReward(memberId, { messageId: 'msg-1', channelId: 'chan-1', emojiName: '🌼', now: now + 1000 });
  assert.equal(reward, 80);
  const levels = await achievements.getUserLevels(memberId);
  assert.equal(levels.totalXP, 80);

  const secondClaim = await mechanics.claimBeeReactionReward(memberId, { messageId: 'msg-1', channelId: 'chan-1', emojiName: '🌼', now: now + 2000 });
  assert.equal(secondClaim, 0, 'a pending reaction can only be claimed once');
});

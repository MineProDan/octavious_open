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

const store = require('../utils/achievements/store');
const { ACHIEVEMENTS } = require('../utils/achievements/definitions');
const pets = require('../utils/pets/store');

test('sending a first message unlocks Hello There and logs the award', async () => {
  const logs = [];
  const original = console.log;
  console.log = (...args) => logs.push(args.join(' '));

  const awarded = await store.recordMessage('user-a', {
    channelId: 'chan-1',
    guildId: 'guild-1',
    content: 'hello world',
    at: new Date('2026-01-01T12:00:00Z'),
  });

  console.log = original;

  assert.ok(awarded.some((def) => def.id === 'hello-there'));
  assert.ok(logs.some((line) => line.includes('Hello There')));
});

test('an achievement is only awarded once even if recorded again', async () => {
  await store.recordMessage('user-b', { channelId: 'chan-1', guildId: 'guild-1', content: 'first', at: new Date('2026-02-01T10:00:00Z') });
  const second = await store.recordMessage('user-b', { channelId: 'chan-1', guildId: 'guild-1', content: 'second', at: new Date('2026-02-01T10:05:00Z') });

  assert.ok(!second.some((def) => def.id === 'hello-there'));
});

test('sending the same message content twice in a row sets the Déjà Vu flag', async () => {
  await store.recordMessage('user-c', { channelId: 'chan-2', guildId: 'guild-1', content: 'copy paste', at: new Date('2026-03-01T09:00:00Z') });
  const awarded = await store.recordMessage('user-c', { channelId: 'chan-2', guildId: 'guild-1', content: 'copy paste', at: new Date('2026-03-01T09:00:05Z') });

  assert.ok(awarded.some((def) => def.id === 'deja-vu'));
});

test('three consecutive claims unlock Three-Day Streak', async () => {
  await store.claimDailyXp('user-d', { now: new Date('2026-04-01T08:00:00Z') });
  await store.claimDailyXp('user-d', { now: new Date('2026-04-02T08:00:00Z') });
  const third = await store.claimDailyXp('user-d', { now: new Date('2026-04-03T08:00:00Z') });

  assert.ok(third.awarded.some((def) => def.id === 'three-day-streak'));

  const progress = await store.getProgress('user-d');
  assert.equal(progress.claim.currentStreak, 3);
  assert.equal(progress.claim.longestStreak, 3);
});

test('a gap of more than one day resets the claim streak but keeps the longest streak and unlock', async () => {
  await store.claimDailyXp('user-e', { now: new Date('2026-05-01T08:00:00Z') });
  await store.claimDailyXp('user-e', { now: new Date('2026-05-02T08:00:00Z') });
  await store.claimDailyXp('user-e', { now: new Date('2026-05-03T08:00:00Z') });

  // Big gap breaks the current streak.
  await store.claimDailyXp('user-e', { now: new Date('2026-05-10T08:00:00Z') });

  const progress = await store.getProgress('user-e');
  assert.equal(progress.claim.currentStreak, 1);
  assert.equal(progress.claim.longestStreak, 3);
  assert.ok(progress.unlocked.some((entry) => entry.id === 'three-day-streak'));
});

test('receiving reactions from distinct users tracks max unique reactors on a message', async () => {
  await store.recordReactionReceived('user-f', { messageId: 'msg-1', reactorId: 'reactor-1', isFromStaff: false, emojiName: '👍' });
  await store.recordReactionReceived('user-f', { messageId: 'msg-1', reactorId: 'reactor-2', isFromStaff: false, emojiName: '👍' });
  const awarded = await store.recordReactionReceived('user-f', { messageId: 'msg-1', reactorId: 'reactor-3', isFromStaff: false, emojiName: '👍' });

  const progress = await store.getProgress('user-f');
  assert.equal(progress.social.maxUniqueReactorsOnMessage, 3);
  assert.ok(awarded.some((def) => def.id === 'good-influence'));
});

test('a staff cookie reaction unlocks the hidden A Treat achievement', async () => {
  const awarded = await store.recordReactionReceived('user-g', { messageId: 'msg-2', reactorId: 'staff-1', isFromStaff: true, emojiName: '🍪' });
  assert.ok(awarded.some((def) => def.id === 'a-treat'));
});

test('deleting a message shortly after sending it unlocks Vanishing Act and the hidden Oops achievement', async () => {
  const sentAt = new Date('2026-06-01T10:00:00Z');
  const deletedAt = new Date('2026-06-01T10:00:10Z');
  const awarded = await store.recordOwnMessageDeleted('user-h', { at: deletedAt, sentAt });

  assert.ok(awarded.some((def) => def.id === 'vanishing-act'));
  assert.ok(awarded.some((def) => def.id === 'oops'));
});

test('deleting a message long after sending it does not unlock the Oops achievement', async () => {
  const sentAt = new Date('2026-06-02T10:00:00Z');
  const deletedAt = new Date('2026-06-02T11:00:00Z');
  const awarded = await store.recordOwnMessageDeleted('user-i', { at: deletedAt, sentAt });

  assert.ok(awarded.some((def) => def.id === 'vanishing-act'));
  assert.ok(!awarded.some((def) => def.id === 'oops'));
});

test('using 5 different bot commands unlocks Curious', async () => {
  await store.recordCommandUsage('user-j', 'level');
  await store.recordCommandUsage('user-j', 'snipe');
  await store.recordCommandUsage('user-j', 'editsnipe');
  await store.recordCommandUsage('user-j', 'latest');
  const awarded = await store.recordCommandUsage('user-j', 'achievements');

  assert.ok(awarded.some((def) => def.id === 'curious'));
});

test('daily claim awards 250 XP on day 1, +50 per streak day', async () => {
  const first = await store.claimDailyXp('claim-a', { now: new Date('2026-07-01T12:00:00Z') });
  const second = await store.claimDailyXp('claim-a', { now: new Date('2026-07-02T12:00:00Z') });

  assert.equal(first.claimed, true);
  assert.equal(first.xpAwarded, 250);
  assert.equal(first.streak, 1);
  assert.equal(second.claimed, true);
  assert.equal(second.xpAwarded, 300);
  assert.equal(second.streak, 2);

  const userlevels = await store.getUserLevels('claim-a');
  assert.equal(userlevels.totalXP, 550);
});

test('daily claim XP caps at 500 regardless of streak', () => {
  assert.equal(store.getStreakClaimXp(1), 250);
  assert.equal(store.getStreakClaimXp(6), 500);
  assert.equal(store.getStreakClaimXp(7), 500);
  assert.equal(store.getStreakClaimXp(100), 500);
});

test('daily claim rejects a second claim on the same Pacific date', async () => {
  const first = await store.claimDailyXp('claim-b', { now: new Date('2026-07-01T08:00:00Z') });
  const duplicate = await store.claimDailyXp('claim-b', { now: new Date('2026-07-01T23:00:00Z') });

  assert.equal(first.claimed, true);
  assert.equal(duplicate.claimed, false);
  assert.equal(duplicate.xpAwarded, 0);
});

test('pets unlock from progress, use prestige slots, and add daily claim XP', async () => {
  const progress = await store.getProgress('pet-claim-user');
  progress.claim.longestStreak = 7;
  await store.saveProgress(progress);
  await store.getMongoDB().collection('userlevels').insertOne({ memberId: 'pet-claim-user', prestige: 1, level: 1, totalXP: 0 });

  const profile = await pets.getPetProfile('pet-claim-user');
  assert.ok(profile.pets.owned.includes('rabbit'));
  assert.ok(profile.pets.owned.includes('endermite'));
  await pets.equipPet('pet-claim-user', 'rabbit');
  await pets.equipPet('pet-claim-user', 'endermite');

  const result = await store.claimDailyXp('pet-claim-user', { now: new Date('2026-09-01T12:00:00Z') });
  assert.equal(result.xpAwarded, 285); // 250 base * 1.1 Endermite + 10 Rabbit, floored.
  assert.equal(result.petFeed.fed, true);
  assert.equal((await store.getProgress('pet-claim-user')).pets.bond.rabbit, 1);
});

test('pets run away after several missed feed days', async () => {
  const progress = await store.getProgress('pet-runaway-user');
  progress.claim.longestStreak = 7;
  await store.saveProgress(progress);
  await pets.getPetProfile('pet-runaway-user');
  await pets.equipPet('pet-runaway-user', 'rabbit');

  await pets.feedPets('pet-runaway-user', { now: new Date('2026-09-01T12:00:00Z') });
  const missed = await pets.feedPets('pet-runaway-user', { now: new Date('2026-09-05T12:00:00Z') });
  assert.ok(missed.ranAway.some((pet) => pet.id === 'rabbit'));
  assert.ok(!(await store.getProgress('pet-runaway-user')).pets.equipped.includes('rabbit'));
});

test('admin claim reset makes all users eligible again without changing the Pacific schedule', async () => {
  await store.claimDailyXp('claim-reset-user', { now: new Date('2026-07-01T12:00:00Z') });
  const reset = await store.resetDailyClaimWindow({ now: new Date('2026-07-01T18:00:00Z') });
  const afterReset = await store.claimDailyXp('claim-reset-user', { now: new Date('2026-07-01T19:00:00Z') });

  assert.equal(reset.currentDatePST, '2026-07-01');
  assert.equal(afterReset.claimed, true);
  assert.equal(afterReset.streak, 2);
});

test('admin claim reset also handles progress records without claim fields', async () => {
  const db = require('../index').mongoDB;
  await db.collection('achievement_progress').insertOne({ memberId: 'legacy-reset-user', updatedAt: new Date() });
  const reset = await store.resetDailyClaimWindow({ now: new Date('2026-07-01T18:00:00Z') });
  assert.ok(reset.usersUpdated >= 1);

  const progress = await store.getProgress('legacy-reset-user');
  assert.equal(progress.claim.lastClaimDatePST, '2026-06-30');
});

test('a missed Pacific calendar day resets the claim streak', async () => {
  await store.claimDailyXp('claim-c', { now: new Date('2026-07-01T12:00:00Z') });
  await store.claimDailyXp('claim-c', { now: new Date('2026-07-02T12:00:00Z') });
  const afterGap = await store.claimDailyXp('claim-c', { now: new Date('2026-07-04T12:00:00Z') });

  assert.equal(afterGap.claimed, true);
  assert.equal(afterGap.streak, 1);
  assert.equal(afterGap.xpAwarded, 250);
});

test('an equipped Phoenix saves the claim streak once across a missed day, then respects its cooldown', async () => {
  const memberId = 'phoenix-user';
  const progress = await store.getProgress(memberId);
  pets.ensurePetState(progress);
  progress.pets.owned.push('phoenix');
  progress.pets.equipped.push('phoenix');
  progress.pets.bond.phoenix = 45; // max evolution -> 7 day save cooldown
  await store.saveProgress(progress);

  await store.claimDailyXp(memberId, { now: new Date('2026-06-01T12:00:00Z') });
  await store.claimDailyXp(memberId, { now: new Date('2026-06-02T12:00:00Z') });

  // Miss a day -> Phoenix should save the streak instead of resetting it.
  const saved = await store.claimDailyXp(memberId, { now: new Date('2026-06-04T12:00:00Z') });
  assert.equal(saved.streak, 3);
  const afterSave = await store.getProgress(memberId);
  assert.ok(afterSave.pets.phoenixLastSaveAt);

  // Miss another day immediately after -> the save cooldown blocks a second rescue.
  const notSaved = await store.claimDailyXp(memberId, { now: new Date('2026-06-06T12:00:00Z') });
  assert.equal(notSaved.streak, 1);
});

test('restoring a claim streak preserves history and continues on the next claim', async () => {
  await store.claimDailyXp('claim-restore', { now: new Date('2026-08-01T12:00:00Z') });
  await store.claimDailyXp('claim-restore', { now: new Date('2026-08-02T12:00:00Z') });

  const restored = await store.restoreClaimStreak('claim-restore', 10, { now: new Date('2026-08-04T12:00:00Z') });
  assert.equal(restored.currentStreak, 10);
  assert.equal(restored.longestStreak, 10);
  assert.equal(restored.totalClaims, 2);
  assert.equal(restored.totalXpClaimed, 550);

  const nextClaim = await store.claimDailyXp('claim-restore', { now: new Date('2026-08-04T13:00:00Z') });
  assert.equal(nextClaim.streak, 11);
  assert.equal(nextClaim.xpAwarded, 500);
});

test('restoring a claim streak does not lower the longest streak', async () => {
  await store.claimDailyXp('claim-restore-history', { now: new Date('2026-08-05T12:00:00Z') });
  const progress = await store.getProgress('claim-restore-history');
  progress.claim.longestStreak = 25;
  await store.saveProgress(progress);

  const restored = await store.restoreClaimStreak('claim-restore-history', 5, { now: new Date('2026-08-06T12:00:00Z') });
  assert.equal(restored.currentStreak, 5);
  assert.equal(restored.longestStreak, 25);
});

test('restoring a claim streak rejects zero, negative, and fractional values', async () => {
  for (const streak of [0, -1, 2.5]) {
    await assert.rejects(
      store.restoreClaimStreak(`claim-invalid-${String(streak)}`, streak),
      RangeError,
    );
  }
});

test('claim migration creates claim fields for existing userlevels members', async () => {
  const db = require('../index').mongoDB;
  await db.collection('userlevels').insertOne({ memberId: 'claim-migration-user', totalXP: 0 });
  await store.migrateClaimFields();

  const progress = await store.getProgress('claim-migration-user');
  assert.deepEqual(progress.claim, {
    currentStreak: 0,
    longestStreak: 0,
    lastClaimDatePST: null,
    totalClaims: 0,
    totalXpClaimed: 0,
  });
});

test('activity streak achievements use claim streak rather than message activity streak', () => {
  const claimStreakIds = ['three-day-streak', 'seven-straight', 'two-weeks-strong', 'no-days-off', 'unbroken', 'still-here-13w', 'never-missed', 'no-life'];
  const context = {
    progress: {
      claim: { longestStreak: 7 },
      activity: { longestStreak: 1000, longestWeeklyStreak: 1000 },
    },
  };

  for (const id of claimStreakIds) {
    const definition = ACHIEVEMENTS.find((achievement) => achievement.id === id);
    assert.equal(definition.getValue(context), id === 'still-here-13w' || id === 'never-missed' ? 1 : 7);
  }
});

test('pet mechanics saving an earlier snapshot keeps unlocks and flags from the XP award', async () => {
  // messageCreate loads the pet profile first, then awards XP (which can
  // unlock Triple Sevens), then saves pet mechanics from that first snapshot.
  const memberId = 'stale-snapshot-user';
  await store.getMongoDB().collection('userlevels').insertOne({ memberId, totalXP: 1777, level: 5, prestige: 0 });
  const petProfile = await pets.getPetProfile(memberId);
  await store.saveProgress(petProfile.progress);

  const awarded = await store.recordXpAward(memberId, { totalXP: 1777, at: new Date('2026-09-23T17:38:05Z') });
  assert.ok(awarded.some((def) => def.id === 'triple-sevens'));

  await require('../utils/pets/mechanics').applyPostAwardMechanics(memberId, petProfile.progress, { amount: 96, now: new Date('2026-09-23T17:38:05Z') });
  const afterPets = await store.getProgress(memberId);
  assert.ok(afterPets.unlocked.some((entry) => entry.id === 'triple-sevens'));
  assert.equal(afterPets.flags.tripleSevens, true);
  assert.equal(new Date(afterPets.xp.lastGainAt).toISOString(), '2026-09-23T17:38:05.000Z');

  // Even a whole-document save from the stale snapshot can't drop unlocks or flags.
  await store.saveProgress(petProfile.progress);
  const afterStaleSave = await store.getProgress(memberId);
  assert.ok(afterStaleSave.unlocked.some((entry) => entry.id === 'triple-sevens'));
  assert.equal(afterStaleSave.flags.tripleSevens, true);
});

test('an unlock another handler already saved is not awarded twice', async () => {
  const memberId = 'double-award-user';
  const first = await store.getProgress(memberId);
  const second = await store.getProgress(memberId);
  first.flags.luckyNumber = true;
  second.flags.luckyNumber = true;

  const firstAward = await store.evaluateAndAward(memberId, { progress: first });
  const secondAward = await store.evaluateAndAward(memberId, { progress: second });
  assert.ok(firstAward.some((def) => def.id === 'lucky-number'));
  assert.ok(!secondAward.some((def) => def.id === 'lucky-number'));

  const saved = await store.getProgress(memberId);
  assert.equal(saved.unlocked.filter((entry) => entry.id === 'lucky-number').length, 1);
});

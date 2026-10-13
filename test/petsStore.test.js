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
const pets = require('../utils/pets/store');
const { renderCollectionCard, renderSpotlightCard } = require('../utils/pets/render');
const { getPetDefinition } = require('../utils/pets/catalog');

async function makeEligibleForRabbit(memberId) {
  const progress = await achievements.getProgress(memberId);
  progress.claim.longestStreak = 7;
  await achievements.saveProgress(progress);
}

test('shiny roll is deterministic when a random function is injected', async () => {
  await makeEligibleForRabbit('shiny-user-always');
  const alwaysShiny = await pets.getPetProfile('shiny-user-always', { random: () => 0 });
  assert.equal(alwaysShiny.pets.shiny.rabbit, true);

  await makeEligibleForRabbit('shiny-user-never');
  const neverShiny = await pets.getPetProfile('shiny-user-never', { random: () => 0.999 });
  assert.equal(neverShiny.pets.shiny.rabbit, false);
});

test('nickname can be set and cleared', async () => {
  await makeEligibleForRabbit('nickname-user');
  await pets.getPetProfile('nickname-user');
  const set = await pets.setPetNickname('nickname-user', 'rabbit', 'Mr. Hops');
  assert.equal(set.nickname, 'Mr. Hops');

  const cleared = await pets.setPetNickname('nickname-user', 'rabbit', '');
  assert.equal(cleared.nickname, null);
  assert.equal(cleared.pets.nicknames.rabbit, undefined);
});

test('getPetMood reflects feed recency and streak', async () => {
  await makeEligibleForRabbit('mood-user');
  await pets.getPetProfile('mood-user');
  await pets.equipPet('mood-user', 'rabbit');

  const beforeFeed = (await pets.getPetProfile('mood-user')).pets;
  assert.equal(pets.getPetMood(beforeFeed, new Date('2026-09-01T12:00:00Z')).label, 'Hungry');

  await pets.feedPets('mood-user', { now: new Date('2026-09-01T12:00:00Z') });
  const afterFeed = (await pets.getPetProfile('mood-user')).pets;
  assert.equal(pets.getPetMood(afterFeed, new Date('2026-09-01T12:00:00Z')).label, 'Content');

  const missed = (await pets.getPetProfile('mood-user')).pets;
  assert.equal(pets.getPetMood(missed, new Date('2026-09-04T12:00:00Z')).label, 'Distressed');
});

test('playWithPet grants a once-daily bonus and adds XP directly', async () => {
  await makeEligibleForRabbit('play-user');
  await pets.getPetProfile('play-user');
  await pets.equipPet('play-user', 'rabbit');

  const result = await pets.playWithPet('play-user', 'rabbit', { now: new Date('2026-09-01T12:00:00Z') });
  assert.equal(result.bonusXp, getPetDefinition('rabbit').trick.bonusXp);
  assert.match(result.flavor, /Rabbit|Mr\.|hops/i);

  const userlevels = await achievements.getUserLevels('play-user');
  assert.equal(userlevels.totalXP, result.bonusXp);

  await assert.rejects(
    pets.playWithPet('play-user', 'rabbit', { now: new Date('2026-09-01T18:00:00Z') }),
    /already played/,
  );
});

test('renderCollectionCard and renderSpotlightCard produce valid PNG buffers', async () => {
  await makeEligibleForRabbit('render-user');
  const profile = await pets.getPetProfile('render-user');
  await pets.equipPet('render-user', 'rabbit');
  const refreshed = await pets.getPetProfile('render-user');

  const collectionBuffer = await renderCollectionCard({ username: 'render-user' }, refreshed);
  assert.equal(collectionBuffer.slice(0, 8).toString('hex'), '89504e470d0a1a0a');

  const spotlightBuffer = await renderSpotlightCard({ username: 'render-user' }, getPetDefinition('rabbit'), {
    shiny: false,
    nickname: null,
    stage: 0,
    bond: 1,
    bondRatio: 0.14,
  });
  assert.equal(spotlightBuffer.slice(0, 8).toString('hex'), '89504e470d0a1a0a');
});

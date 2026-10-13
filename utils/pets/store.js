const { getPacificDateKey } = require('../achievements/engine');
const { getPetDefinition, getPetLevel, getPetStats, PETS } = require('./catalog');

function getAchievementStore() {
  return require('../achievements/store');
}

function createDefaultPets() {
  return {
    owned: [],
    equipped: [],
    bond: {},
    shiny: {},
    nicknames: {},
    lastFedDate: null,
    lastPlayedDate: null,
    feedStreak: 0,
    runawayPets: [],
    // Mechanic-specific bookkeeping (see utils/pets/mechanics.js).
    wolfLinkTarget: null,
    bunnyLastBonusClaimDate: null,
    yetiInactiveSince: null,
    yetiCharge: 0,
    squirrelHoard: 0,
    turtleRecentMessages: [],
    phoenixLastSaveAt: null,
    beePendingReaction: null,
    beeLastSpawnAt: null,
    cheetahLastBonusAt: null,
    foxLastBypassAt: null,
  };
}

function getPetSlots(prestige = 0) {
  return Math.min(3, 1 + Math.max(0, Number(prestige) || 0));
}

function ensurePetState(progress) {
  progress.pets = {
    ...createDefaultPets(),
    ...(progress.pets || {}),
    owned: [...new Set(progress.pets?.owned || [])],
    equipped: [...new Set(progress.pets?.equipped || [])],
    bond: { ...(progress.pets?.bond || {}) },
    shiny: { ...(progress.pets?.shiny || {}) },
    nicknames: { ...(progress.pets?.nicknames || {}) },
    runawayPets: [...new Set(progress.pets?.runawayPets || [])],
    turtleRecentMessages: [...(progress.pets?.turtleRecentMessages || [])],
    beePendingReaction: progress.pets?.beePendingReaction || null,
  };
  return progress.pets;
}

function unlockEligiblePets(progress, userlevels, { random = Math.random } = {}) {
  const pets = ensurePetState(progress);
  const newlyUnlocked = [];
  for (const pet of PETS) {
    if (pets.owned.includes(pet.id) || pets.runawayPets.includes(pet.id)) continue;
    if (pet.unlockCheck({ progress, userlevels })) {
      pets.owned.push(pet.id);
      pets.bond[pet.id] = pets.bond[pet.id] || 0;
      pets.shiny[pet.id] = random() < (pet.shinyChance || 0);
      newlyUnlocked.push(pet);
    }
  }
  return newlyUnlocked;
}

function getEquippedStats(progress) {
  const pets = ensurePetState(progress);
  return pets.equipped
    .map((id) => {
      const definition = getPetDefinition(id);
      if (!definition) return null;
      return { definition, bond: Number(pets.bond[id]) || 0, stats: getPetStats(definition, Number(pets.bond[id]) || 0) };
    })
    .filter(Boolean);
}

function getPetBonuses(progress) {
  return getEquippedStats(progress).reduce((bonuses, pet) => ({
    flatXp: bonuses.flatXp + (pet.stats.flatXp || 0),
    multiplier: bonuses.multiplier + (pet.stats.multiplier || 0),
    globalMultiplier: bonuses.globalMultiplier + (pet.stats.globalMultiplier || 0),
  }), { flatXp: 0, multiplier: 0, globalMultiplier: 0 });
}

/** Mood reflects recent feeding care; used for UI flavor and does not affect XP math. */
function getPetMood(pets, now = new Date()) {
  const today = getPacificDateKey(now);
  if (pets.lastFedDate === today) {
    if (pets.feedStreak >= 14) return { label: 'Ecstatic', emoji: '🤩' };
    if (pets.feedStreak >= 3) return { label: 'Happy', emoji: '😊' };
    return { label: 'Content', emoji: '🙂' };
  }
  const yesterday = getPacificDateKey(new Date(now.getTime() - 86400000));
  if (pets.lastFedDate === yesterday || !pets.lastFedDate) return { label: 'Hungry', emoji: '😐' };
  return { label: 'Distressed', emoji: '😟' };
}

async function getPetProfile(memberId, options = {}) {
  const store = getAchievementStore();
  const progress = await store.getProgress(memberId);
  const userlevels = await store.getUserLevels(memberId);
  const newlyUnlocked = unlockEligiblePets(progress, userlevels, options);
  if (newlyUnlocked.length > 0) await store.savePetState(progress);
  return { progress, userlevels, pets: ensurePetState(progress), newlyUnlocked };
}

async function equipPet(memberId, petId) {
  const store = getAchievementStore();
  const { progress, userlevels } = await getPetProfile(memberId);
  const pets = ensurePetState(progress);
  const definition = getPetDefinition(petId);
  if (!definition) throw new Error('That pet does not exist.');
  if (!pets.owned.includes(petId)) throw new Error('That pet is not unlocked.');
  if (pets.equipped.includes(petId)) return { progress, userlevels, pets, definition, changed: false };
  if (pets.equipped.length >= getPetSlots(userlevels?.prestige)) {
    throw new Error(`You only have ${getPetSlots(userlevels?.prestige)} pet slot${getPetSlots(userlevels?.prestige) === 1 ? '' : 's'} at Prestige ${userlevels?.prestige || 0}.`);
  }
  pets.equipped.push(petId);
  await store.savePetState(progress);
  return { progress, userlevels, pets, definition, changed: true };
}

async function unequipPet(memberId, petId) {
  const store = getAchievementStore();
  const { progress, userlevels } = await getPetProfile(memberId);
  const pets = ensurePetState(progress);
  const index = pets.equipped.indexOf(petId);
  if (index === -1) throw new Error('That pet is not equipped.');
  pets.equipped.splice(index, 1);
  await store.savePetState(progress);
  return { progress, userlevels, pets, definition: getPetDefinition(petId) };
}

async function setPetNickname(memberId, petId, nickname) {
  const store = getAchievementStore();
  const { progress, userlevels } = await getPetProfile(memberId);
  const pets = ensurePetState(progress);
  const definition = getPetDefinition(petId);
  if (!definition || !pets.owned.includes(petId)) throw new Error('That pet is not unlocked.');
  const trimmed = (nickname || '').trim().slice(0, 24);
  if (trimmed) pets.nicknames[petId] = trimmed;
  else delete pets.nicknames[petId];
  await store.savePetState(progress);
  return { progress, userlevels, pets, definition, nickname: trimmed || null };
}

async function setWolfLink(memberId, petId, targetUserId) {
  const store = getAchievementStore();
  const { progress, userlevels } = await getPetProfile(memberId);
  const pets = ensurePetState(progress);
  const definition = getPetDefinition(petId);
  if (!definition || definition.mechanic !== 'wolf') throw new Error('That pet cannot be linked to another member.');
  if (!pets.owned.includes(petId)) throw new Error('That pet is not unlocked.');
  if (targetUserId && targetUserId === memberId) throw new Error('You cannot link a pet to yourself.');
  pets.wolfLinkTarget = targetUserId || null;
  await store.savePetState(progress);
  return { progress, userlevels, pets, definition, targetUserId: pets.wolfLinkTarget };
}

async function feedPets(memberId, { now = new Date() } = {}) {
  const store = getAchievementStore();
  const { progress, userlevels } = await getPetProfile(memberId);
  const pets = ensurePetState(progress);
  const today = getPacificDateKey(now);
  if (pets.lastFedDate === today) return { progress, userlevels, pets, fed: false, rewards: [], ranAway: [] };

  const previousDate = pets.lastFedDate;
  const yesterday = getPacificDateKey(new Date(now.getTime() - 86400000));
  const missedDays = previousDate && previousDate !== yesterday ? 1 : 0;
  pets.feedStreak = missedDays > 0 ? 1 : (previousDate ? pets.feedStreak + 1 : 1);
  const ranAway = [];
  if (missedDays > 0) {
    for (const petId of [...pets.equipped]) {
      const bond = Number(pets.bond[petId]) || 0;
      if (previousDate && getPacificDateKey(new Date(now.getTime() - 3 * 86400000)) > previousDate) {
        pets.equipped = pets.equipped.filter((id) => id !== petId);
        pets.owned = pets.owned.filter((id) => id !== petId);
        pets.runawayPets.push(petId);
        ranAway.push(getPetDefinition(petId));
      } else {
        pets.bond[petId] = Math.max(0, bond - 1);
      }
    }
  }

  const rewards = [];
  for (const petId of pets.equipped) {
    const definition = getPetDefinition(petId);
    const before = Number(pets.bond[petId]) || 0;
    pets.bond[petId] = before + 1;
    const afterLevel = getPetLevel(definition, pets.bond[petId]);
    if (afterLevel > getPetLevel(definition, before)) rewards.push({ definition, level: afterLevel + 1 });
  }
  pets.lastFedDate = today;
  await store.savePetState(progress);
  return { progress, userlevels, pets, fed: true, rewards, ranAway };
}

async function evolvePet(memberId, petId) {
  const store = getAchievementStore();
  const { progress, userlevels } = await getPetProfile(memberId);
  const pets = ensurePetState(progress);
  const definition = getPetDefinition(petId);
  if (!definition || !pets.owned.includes(petId)) throw new Error('That pet is not unlocked.');
  const bond = Number(pets.bond[petId]) || 0;
  const currentLevel = getPetLevel(definition, bond);
  if (currentLevel >= definition.levels.length - 1) throw new Error('That pet is already fully evolved.');
  const nextBond = definition.levels[currentLevel + 1].bond;
  if (bond < nextBond) throw new Error(`${definition.name} needs ${nextBond - bond} more feed${nextBond - bond === 1 ? '' : 's'} to evolve.`);
  return { progress, userlevels, pets, definition, level: currentLevel + 1 };
}

/** Once-per-day trick performed by an equipped pet, granting a small direct XP bonus. */
async function playWithPet(memberId, petId, { now = new Date() } = {}) {
  const store = getAchievementStore();
  const { progress, userlevels } = await getPetProfile(memberId);
  const pets = ensurePetState(progress);
  const definition = getPetDefinition(petId);
  if (!definition || !pets.equipped.includes(petId)) throw new Error('That pet must be equipped before it will play.');

  const today = getPacificDateKey(now);
  if (pets.lastPlayedDate === today) throw new Error('Your pets have already played today.');

  pets.lastPlayedDate = today;
  const bonusXp = definition.trick.bonusXp;
  const displayName = pets.nicknames[petId] || definition.name;
  const flavor = definition.trick.flavor(displayName);

  await store.savePetState(progress);
  const db = store.getMongoDB();
  await db.collection('userlevels').updateOne(
    { memberId },
    { $inc: { totalXP: bonusXp }, $setOnInsert: { level: 1, prestige: 0 } },
    { upsert: true },
  );

  return { progress, userlevels, pets, definition, bonusXp, flavor, trickName: definition.trick.name };
}

async function getGlobalPetMultiplier() {
  const store = getAchievementStore();
  const db = store.getMongoDB ? store.getMongoDB() : null;
  if (!db) return 0;
  const active = await db.collection('achievement_progress').find({ 'pets.equipped': { $exists: true } }).toArray();
  let multiplier = 0;
  for (const progress of active) multiplier += getPetBonuses(progress).globalMultiplier;
  return Math.min(0.1, multiplier);
}

module.exports = {
  createDefaultPets,
  ensurePetState,
  getPetSlots,
  getPetBonuses,
  getPetMood,
  getPetProfile,
  equipPet,
  unequipPet,
  setPetNickname,
  setWolfLink,
  feedPets,
  evolvePet,
  playWithPet,
  getGlobalPetMultiplier,
};

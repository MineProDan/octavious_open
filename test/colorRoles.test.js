const test = require('node:test');
const assert = require('node:assert/strict');
const { COLOR_ROLES, EARNABLE_ACHIEVEMENT_IDS, HOLOGRAPHIC } = require('../utils/colorRoles/catalog');
const { ACHIEVEMENTS } = require('../utils/achievements/definitions');
const { getBaseKey, getPickableKeys, planColorRoles, syncMemberColors } = require('../utils/colorRoles/sync');
const { buildColorAutocomplete, buildColorOverview, parseColorChoice } = require('../commands/utility/color');

const ALL_KEYS = new Set(COLOR_ROLES.map((def) => def.key));

function ctx({ prestige = 0, achievements = [], count = 0, isBooster = false } = {}) {
  const ids = new Set(achievements);
  for (let i = 0; ids.size < count; i += 1) ids.add(`filler-${i}`);
  return { prestige, unlockedIds: ids, isBooster };
}

// Fake member whose guild has every catalog role, positioned in catalog order.
function fakeMember(heldKeys, { premiumSinceTimestamp = null } = {}) {
  const roles = new Map(COLOR_ROLES.map((def, index) => [def.key, { id: def.key, name: def.name, position: 100 - index }]));
  roles.set('other', { id: 'other', name: 'Member', position: 1 });
  const held = new Set(heldKeys);
  const calls = [];
  return {
    id: '1', calls, held, premiumSinceTimestamp,
    guild: { roles: { cache: roles } },
    roles: {
      cache: { has: (id) => held.has(id) },
      async add(list) { calls.push(['add', list.map((role) => role.name)]); list.forEach((role) => held.add(role.id)); },
      async remove(list) { calls.push(['remove', list.map((role) => role.name)]); list.forEach((role) => held.delete(role.id)); },
    },
  };
}

test('catalog keeps the family colour order and every rare achievement exists', () => {
  const names = COLOR_ROLES.map((def) => def.name);
  assert.equal(new Set(names).size, names.length);
  const achievementIds = new Set(ACHIEVEMENTS.map((def) => def.id));
  assert.ok(COLOR_ROLES.filter((def) => def.group === 'rare').every((def) => achievementIds.has(def.key.slice('rare:'.length))));
  // Picked colours must sit above every prestige role.
  const lastPick = COLOR_ROLES.findLastIndex((def) => def.group !== 'prestige');
  const firstPrestige = COLOR_ROLES.findIndex((def) => def.group === 'prestige');
  assert.ok(lastPick < firstPrestige);
  assert.ok(!EARNABLE_ACHIEVEMENT_IDS.includes('immortal'));
});

test('gradients are kept for the hardest colours and holographic uses Discord\'s values', () => {
  const gradientKeys = COLOR_ROLES.filter((def) => def.secondaryColor).map((def) => def.key);
  assert.deepEqual(gradientKeys, [
    'rare:overflow', 'rare:ascended', 'rare:no-contest', 'rare:limitless',
    'achievements:max', 'achievements:100', 'achievements:75',
    'prestige:8', 'prestige:9', 'prestige:10',
  ]);
  const max = COLOR_ROLES.find((def) => def.key === 'achievements:max');
  assert.deepEqual([max.color, max.secondaryColor, max.tertiaryColor], [HOLOGRAPHIC.color, HOLOGRAPHIC.secondaryColor, HOLOGRAPHIC.tertiaryColor]);
  assert.equal(parseInt(HOLOGRAPHIC.color.slice(1), 16), 11127295);
  assert.equal(parseInt(HOLOGRAPHIC.secondaryColor.slice(1), 16), 16759788);
  assert.equal(parseInt(HOLOGRAPHIC.tertiaryColor.slice(1), 16), 16761760);
});

test('prestige base role is the highest tier reached, capped at the last role', () => {
  assert.equal(getBaseKey(ctx(), ALL_KEYS), null);
  assert.equal(getBaseKey(ctx({ prestige: 3 }), ALL_KEYS), 'prestige:3');
  assert.equal(getBaseKey(ctx({ prestige: 27 }), ALL_KEYS), 'prestige:10');
});

test('pickable colours come from every family the member has unlocked', () => {
  const keys = getPickableKeys(ctx({ prestige: 3, count: 26, achievements: ['overflow'], isBooster: true }), ALL_KEYS);
  assert.ok(keys.includes('prestige:1') && keys.includes('prestige:2') && !keys.includes('prestige:3'));
  assert.ok(keys.includes('achievements:10') && keys.includes('achievements:25') && !keys.includes('achievements:50'));
  assert.ok(keys.includes('rare:overflow') && !keys.includes('rare:ascended'));
  assert.ok(keys.includes('booster:booster-rose'));
  assert.deepEqual(getPickableKeys(ctx({ count: 3 }), ALL_KEYS), []);
});

test('Max needs every earnable achievement, not the join-order ones', () => {
  const max = COLOR_ROLES.find((def) => def.key === 'achievements:max');
  assert.equal(max.isUnlocked(ctx({ achievements: EARNABLE_ACHIEVEMENT_IDS })), true);
  assert.equal(max.isUnlocked(ctx({ achievements: EARNABLE_ACHIEVEMENT_IDS.slice(1), count: 200 })), false);
});

test('a new prestige drops a picked prestige tier but keeps other picks', () => {
  assert.deepEqual(planColorRoles({ ctx: ctx({ prestige: 3 }), heldKeys: ['prestige:1', 'prestige:2'], availableKeys: ALL_KEYS }).keys, ['prestige:3']);
  assert.deepEqual(planColorRoles({ ctx: ctx({ prestige: 3, count: 10 }), heldKeys: ['achievements:10', 'prestige:2'], availableKeys: ALL_KEYS }).keys, ['achievements:10', 'prestige:3']);
  assert.deepEqual(planColorRoles({ ctx: ctx({ prestige: 3 }), heldKeys: ['prestige:1', 'prestige:3'], availableKeys: ALL_KEYS }).keys, ['prestige:1', 'prestige:3']);
});

test('picks that are no longer unlocked are dropped', () => {
  assert.deepEqual(planColorRoles({ ctx: ctx({ prestige: 1 }), heldKeys: ['booster:booster-rose', 'prestige:1'], availableKeys: ALL_KEYS }).keys, ['prestige:1']);
});

test('overrides are validated', () => {
  assert.deepEqual(planColorRoles({ ctx: ctx({ isBooster: true }), heldKeys: [], availableKeys: ALL_KEYS, override: 'booster:booster-violet' }).keys, ['booster:booster-violet']);
  assert.throws(() => planColorRoles({ ctx: ctx({ prestige: 3 }), heldKeys: [], availableKeys: ALL_KEYS, override: 'rare:limitless' }));
  assert.throws(() => planColorRoles({ ctx: ctx({ prestige: 3 }), heldKeys: [], availableKeys: ALL_KEYS, override: 'prestige:3' }));
});

test('syncMemberColors swaps roles and skips no-op syncs', async () => {
  const member = fakeMember(['prestige:2', 'prestige:1', 'other']);
  await syncMemberColors(member, { ctx: ctx({ prestige: 3, count: 10 }) });
  assert.deepEqual([...member.held].sort(), ['other', 'prestige:3']);

  await syncMemberColors(member, { ctx: ctx({ prestige: 3, count: 10 }), override: 'achievements:10' });
  assert.deepEqual([...member.held].sort(), ['achievements:10', 'other', 'prestige:3']);

  member.calls.length = 0;
  const again = await syncMemberColors(member, { ctx: ctx({ prestige: 3, count: 10 }) });
  assert.equal(again.changed, false);
  assert.deepEqual(member.calls, []);
});

test('/color autocomplete lists the default then unlocked colours', () => {
  const choices = buildColorAutocomplete(ctx({ prestige: 2, count: 10, achievements: ['overflow'] }), ALL_KEYS);
  assert.deepEqual(choices.map((choice) => choice.name), ['Default (Prestige 2)', 'Overflow · rare achievement', 'Achievements 10', 'Prestige 1']);
  assert.deepEqual(buildColorAutocomplete(ctx({ prestige: 2, count: 10 }), ALL_KEYS, 'ach').map((choice) => choice.value), ['achievements:10']);
  assert.ok(buildColorAutocomplete(ctx({ prestige: 27, count: 200, isBooster: true }), ALL_KEYS).length <= 25);
});

test('/color accepts autocomplete values and typed names', () => {
  assert.equal(parseColorChoice('default'), null);
  assert.equal(parseColorChoice('achievements:25'), 'achievements:25');
  assert.equal(parseColorChoice('Booster Rose'), 'booster:booster-rose');
  assert.equal(parseColorChoice('red'), undefined);
});

test('/color overview shows progress towards locked colours', () => {
  const embed = buildColorOverview(ctx({ prestige: 1, count: 12 }), ALL_KEYS, 'prestige:1').toJSON();
  const text = embed.fields.map((field) => field.value).join('\n');
  assert.match(text, /Prestige 1\*\* · your prestige ◀ showing/);
  assert.match(text, /✅ \*\*Achievements 10/);
  assert.match(text, /🔒 Achievements 25 · Unlock 25 achievements\. \(12\/25\)/);
  assert.match(text, /🔒 Booster Rose · Boost the server\./);
});

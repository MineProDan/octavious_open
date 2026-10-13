const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeStreakUpdate,
  computeWeeklyStreakUpdate,
  toDateKey,
  toWeekKey,
  getAchievementProgress,
  evaluateAchievements,
  evaluateSpecialAchievements,
  buildCategoryPages,
} = require('../utils/achievements/engine');
const { getAchievementDefinition, ACHIEVEMENTS } = require('../utils/achievements/definitions');
const { createDefaultProgress } = require('../utils/achievements/store');
const { MAX_ACHIEVEMENTS_PER_PAGE } = require('../utils/achievements/categories');

function baseContext(overrides = {}) {
  const progress = createDefaultProgress('user-1');
  return {
    now: new Date('2026-01-15T12:00:00Z'),
    userlevels: { level: 1, totalXP: 0, prestige: 0 },
    progress,
    ...overrides,
  };
}

test('computeStreakUpdate: same day does not change streak', () => {
  const result = computeStreakUpdate({ lastActiveDate: '2026-01-15', currentStreak: 3, longestStreak: 5 }, '2026-01-15');
  assert.equal(result.changed, false);
  assert.equal(result.currentStreak, 3);
});

test('computeStreakUpdate: consecutive day increments streak and tracks longest', () => {
  const result = computeStreakUpdate({ lastActiveDate: '2026-01-14', currentStreak: 3, longestStreak: 3 }, '2026-01-15');
  assert.equal(result.currentStreak, 4);
  assert.equal(result.longestStreak, 4);
});

test('computeStreakUpdate: gap resets streak to 1 but keeps longest streak', () => {
  const result = computeStreakUpdate({ lastActiveDate: '2026-01-10', currentStreak: 8, longestStreak: 8 }, '2026-01-15');
  assert.equal(result.currentStreak, 1);
  assert.equal(result.longestStreak, 8);
});

test('computeWeeklyStreakUpdate: consecutive ISO weeks increment streak', () => {
  const weekA = toWeekKey(new Date('2026-01-05T00:00:00Z'));
  const weekB = toWeekKey(new Date('2026-01-12T00:00:00Z'));
  const result = computeWeeklyStreakUpdate({ lastActiveWeekKey: weekA, weeklyStreak: 2, longestWeeklyStreak: 2 }, weekB);
  assert.equal(result.weeklyStreak, 3);
});

test('computeWeeklyStreakUpdate: skipped week resets streak', () => {
  const weekA = toWeekKey(new Date('2026-01-05T00:00:00Z'));
  const weekC = toWeekKey(new Date('2026-01-26T00:00:00Z'));
  const result = computeWeeklyStreakUpdate({ lastActiveWeekKey: weekA, weeklyStreak: 5, longestWeeklyStreak: 5 }, weekC);
  assert.equal(result.weeklyStreak, 1);
  assert.equal(result.longestWeeklyStreak, 5);
});

test('toDateKey formats to YYYY-MM-DD in UTC', () => {
  assert.equal(toDateKey(new Date('2026-03-04T23:59:59Z')), '2026-03-04');
});

test('getAchievementProgress reports completion, percent, and clamps current to target', () => {
  const def = getAchievementDefinition('chatterbox');
  const context = baseContext();
  context.progress.messages.total = 150;

  const progress = getAchievementProgress(def, context, new Map());
  assert.equal(progress.completed, true);
  assert.equal(progress.current, 100); // clamped to target
  assert.equal(progress.percent, 100);
});

test('getAchievementProgress treats an already-unlocked entry as completed even if metric regressed', () => {
  const def = getAchievementDefinition('hello-there');
  const context = baseContext();
  context.progress.messages.total = 0;

  const unlockedMap = new Map([[def.id, { id: def.id, unlockedAt: new Date('2026-01-01') }]]);
  const progress = getAchievementProgress(def, context, unlockedMap);
  assert.equal(progress.completed, true);
  assert.deepEqual(progress.unlockedAt, new Date('2026-01-01'));
  // Regression guard: previously `current` was re-derived from the live
  // (regressed) metric, so a completed achievement could still display
  // "0/target" instead of showing full progress.
  assert.equal(progress.current, def.target);
  assert.equal(progress.percent, 100);
});

test('getAchievementProgress shows full progress for a completed one-shot flag achievement even if the flag is no longer set', () => {
  const def = getAchievementDefinition('a-treat');
  const context = baseContext();
  context.progress.flags.aTreat = false;

  const unlockedMap = new Map([[def.id, { id: def.id, unlockedAt: new Date('2026-01-01') }]]);
  const progress = getAchievementProgress(def, context, unlockedMap);
  assert.equal(progress.completed, true);
  assert.equal(progress.current, 1);
  assert.equal(progress.target, 1);
  assert.equal(progress.percent, 100);
});

test('Collector progress counts migrated and earned unlock records', () => {
  const def = getAchievementDefinition('collector');
  const context = baseContext();
  context.progress.unlocked = Array.from({ length: 7 }, (_, index) => ({ id: `migrated-${index}` }));

  const progress = getAchievementProgress(def, context, new Map());
  assert.equal(progress.current, 7);
  assert.equal(progress.percent, 70);
  assert.equal(progress.completed, false);
});

test('Completionist progress reflects a fully unlocked normal category', () => {
  const def = getAchievementDefinition('completionist');
  const context = baseContext();
  context.progress.unlocked = ACHIEVEMENTS
    .filter((achievement) => achievement.category === 'Social' && !achievement.hidden && !achievement.ultraRare && !achievement.special)
    .map((achievement) => ({ id: achievement.id }));

  const progress = getAchievementProgress(def, context, new Map());
  assert.equal(progress.current, 1);
  assert.equal(progress.percent, 100);
  assert.equal(progress.completed, true);
});

test('Triple Sevens and long-tenure achievements are Ultra-Rare', () => {
  for (const id of ['triple-sevens', 'server-historian', 'ancient', 'still-here-5y']) {
    const definition = getAchievementDefinition(id);
    assert.equal(definition.category, 'Ultra-Rare');
    assert.equal(definition.ultraRare, true);
  }
});

test('evaluateAchievements returns only newly-qualifying, non-special, non-already-unlocked ids', () => {
  const context = baseContext();
  context.progress.messages.total = 1500; // qualifies hello-there, chatterbox, regular-around-here
  const unlockedIds = new Set(['hello-there']);

  const newlyUnlocked = evaluateAchievements(context, unlockedIds);
  assert.ok(newlyUnlocked.includes('chatterbox'));
  assert.ok(newlyUnlocked.includes('regular-around-here'));
  assert.ok(!newlyUnlocked.includes('hello-there'));
  assert.ok(!newlyUnlocked.includes('collector')); // special, excluded here
});

test('evaluateSpecialAchievements awards Collector once 10 achievements are unlocked', () => {
  const unlockedIds = new Set(Array.from({ length: 10 }, (_, i) => `fake-${i}`));
  const specials = evaluateSpecialAchievements(unlockedIds);
  assert.ok(specials.includes('collector'));
});

test('evaluateSpecialAchievements awards Completionist when a full category is unlocked', () => {
  const socialIds = ACHIEVEMENTS.filter((def) => def.category === 'Social' && !def.hidden && !def.ultraRare).map((def) => def.id);
  const unlockedIds = new Set(socialIds);
  const specials = evaluateSpecialAchievements(unlockedIds);
  assert.ok(specials.includes('completionist'));
});

test('evaluateSpecialAchievements awards Limitless only once every normal achievement is unlocked', () => {
  const normalIds = ACHIEVEMENTS.filter((def) => !def.hidden && !def.ultraRare && def.id !== 'completionist' && def.id !== 'collector').map((def) => def.id);
  const almostAll = new Set(normalIds.slice(0, -1));
  assert.ok(!evaluateSpecialAchievements(almostAll).includes('limitless'));

  const all = new Set(normalIds);
  assert.ok(evaluateSpecialAchievements(all).includes('limitless'));
});

test('buildCategoryPages masks hidden achievement names/descriptions until unlocked', () => {
  const context = baseContext();
  const pages = buildCategoryPages(new Map(), context);
  const hiddenPage = pages.find((page) => page.category === 'Hidden');
  assert.ok(hiddenPage);
  assert.ok(hiddenPage.entries.every((entry) => entry.name === '???'));
});

test('buildCategoryPages reveals a hidden achievement once it is unlocked', () => {
  const context = baseContext();
  const unlockedMap = new Map([['deja-vu', { id: 'deja-vu', unlockedAt: new Date() }]]);
  const pages = buildCategoryPages(unlockedMap, context);
  const hiddenPage = pages.find((page) => page.category === 'Hidden');
  const dejaVu = hiddenPage.entries.find((entry) => entry.id === 'deja-vu');
  assert.equal(dejaVu.name, 'Déjà Vu');
});

test('buildCategoryPages missingOnly filters out completed achievements', () => {
  const context = baseContext();
  context.progress.messages.total = 100000; // completes every message-count achievement
  const pages = buildCategoryPages(new Map(), context, { missingOnly: true });
  const messagesPage = pages.find((page) => page.category === 'Messages');
  // Poet/Wall of Text/Media Man/Reply Guy/Yapper/Touch Grass are unaffected by total count, so they remain.
  assert.ok(messagesPage.entries.every((entry) => !entry.completed));
});

test('no achievement category exceeds MAX_ACHIEVEMENTS_PER_PAGE (the /achievements embed shows one page per category with no further pagination, so an oversized category would silently drop entries off the bottom)', () => {
  const counts = new Map();
  for (const def of ACHIEVEMENTS) {
    counts.set(def.category, (counts.get(def.category) || 0) + 1);
  }
  for (const [category, count] of counts) {
    assert.ok(
      count <= MAX_ACHIEVEMENTS_PER_PAGE,
      `Category "${category}" has ${count} achievements, exceeding MAX_ACHIEVEMENTS_PER_PAGE (${MAX_ACHIEVEMENTS_PER_PAGE}). `
        + 'Achievements past the limit would silently never render in /achievements view. '
        + 'Either trim the category or add real sub-pagination to buildCategoryPages/achievements.js.',
    );
  }
});

test('buildCategoryPages never drops an achievement for a category at exactly MAX_ACHIEVEMENTS_PER_PAGE', () => {
  // Regression test for the "A Treat" bug: it was the 12th of 12 Hidden
  // achievements, silently cut off by an embed page-size cap of 10.
  const context = baseContext();
  const pages = buildCategoryPages(new Map(), context);
  const hiddenPage = pages.find((page) => page.category === 'Hidden');
  const hiddenDefCount = ACHIEVEMENTS.filter((def) => def.category === 'Hidden').length;
  assert.equal(hiddenPage.entries.length, hiddenDefCount);
  assert.ok(hiddenPage.entries.some((entry) => entry.id === 'a-treat'));
});

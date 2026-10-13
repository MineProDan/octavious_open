const { CATEGORY_ORDER } = require('./categories');
const { ACHIEVEMENTS, getAchievementDefinition } = require('./definitions');

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function toMonthKey(date) {
  return toDateKey(date).slice(0, 7);
}

function getPacificDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

// ISO-8601 week key, e.g. "2026-W38".
function toWeekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function daysBetweenDateKeys(fromKey, toKey) {
  const a = Date.parse(`${fromKey}T00:00:00Z`);
  const b = Date.parse(`${toKey}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

function weeksBetweenWeekKeys(fromKey, toKey) {
  if (fromKey === toKey) return 0;
  const [fy, fw] = fromKey.split('-W').map(Number);
  const [ty, tw] = toKey.split('-W').map(Number);
  // Approximation good enough for consecutive-week streak tracking (52/53 week years).
  return (ty - fy) * 52 + (tw - fw);
}

function daysInMonth(year, monthIndex1based) {
  return new Date(Date.UTC(year, monthIndex1based, 0)).getUTCDate();
}

/**
 * Computes the next daily streak state. Returns unchanged state if already
 * recorded today. A gap of more than 1 day resets the streak back to 1.
 */
function computeStreakUpdate({ lastActiveDate, currentStreak = 0, longestStreak = 0 }, todayKey) {
  if (lastActiveDate === todayKey) {
    return { currentStreak, longestStreak, lastActiveDate, changed: false };
  }

  const gap = lastActiveDate ? daysBetweenDateKeys(lastActiveDate, todayKey) : null;
  const nextStreak = gap === 1 ? currentStreak + 1 : 1;
  const nextLongest = Math.max(longestStreak, nextStreak);

  return { currentStreak: nextStreak, longestStreak: nextLongest, lastActiveDate: todayKey, changed: true };
}

/**
 * Computes the next weekly streak state (consecutive ISO weeks with activity).
 */
function computeWeeklyStreakUpdate({ lastActiveWeekKey, weeklyStreak = 0, longestWeeklyStreak = 0 }, currentWeekKey) {
  if (lastActiveWeekKey === currentWeekKey) {
    return { weeklyStreak, longestWeeklyStreak, lastActiveWeekKey, changed: false };
  }

  const gap = lastActiveWeekKey ? weeksBetweenWeekKeys(lastActiveWeekKey, currentWeekKey) : null;
  const nextStreak = gap === 1 ? weeklyStreak + 1 : 1;
  const nextLongest = Math.max(longestWeeklyStreak, nextStreak);

  return { weeklyStreak: nextStreak, longestWeeklyStreak: nextLongest, lastActiveWeekKey: currentWeekKey, changed: true };
}

function getAchievementValue(def, context) {
  try {
    return Number(def.getValue(context)) || 0;
  } catch {
    return 0;
  }
}

function getAchievementProgress(def, context, unlockedMap) {
  const liveValue = getAchievementValue(def, context);
  const target = def.target;
  const unlockedEntry = unlockedMap?.get(def.id);
  const completed = Boolean(unlockedEntry) || liveValue >= target;
  // Once an achievement is persisted as unlocked, always report full progress.
  // Re-deriving `current` from the live metric can show e.g. "0/1" for a
  // one-shot flag achievement whose underlying flag isn't meant to stay set,
  // even though the achievement itself was legitimately earned and recorded.
  const current = completed ? target : Math.min(liveValue, target);

  return {
    id: def.id,
    name: def.name,
    description: def.description,
    category: def.category,
    hidden: Boolean(def.hidden),
    ultraRare: Boolean(def.ultraRare),
    special: Boolean(def.special),
    current,
    target,
    percent: target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 100,
    completed,
    unlockedAt: unlockedEntry?.unlockedAt ?? null,
  };
}

/** Returns the list of achievement ids that just became unlocked (excludes already-unlocked and special ids). */
function evaluateAchievements(context, unlockedIds) {
  const newlyUnlocked = [];
  for (const def of ACHIEVEMENTS) {
    if (def.special) continue;
    if (unlockedIds.has(def.id)) continue;
    if (getAchievementValue(def, context) >= def.target) {
      newlyUnlocked.push(def.id);
    }
  }
  return newlyUnlocked;
}

/** Evaluates meta/special achievements (Collector, Completionist, Limitless) against an updated unlocked set. */
function evaluateSpecialAchievements(unlockedIds) {
  const newlyUnlocked = [];

  if (!unlockedIds.has('collector') && unlockedIds.size >= 10) {
    newlyUnlocked.push('collector');
  }

  const trackableCategories = [...new Set(
    ACHIEVEMENTS.filter((def) => !def.hidden && !def.ultraRare && def.id !== 'completionist').map((def) => def.category),
  )];

  if (!unlockedIds.has('completionist')) {
    const anyCategoryComplete = trackableCategories.some((category) => {
      const ids = ACHIEVEMENTS.filter((def) => def.category === category && !def.hidden && !def.ultraRare && def.id !== 'completionist').map((def) => def.id);
      return ids.length > 0 && ids.every((id) => unlockedIds.has(id));
    });
    if (anyCategoryComplete) newlyUnlocked.push('completionist');
  }

  if (!unlockedIds.has('limitless')) {
    const normalIds = ACHIEVEMENTS.filter((def) => !def.hidden && !def.ultraRare && def.id !== 'completionist' && def.id !== 'collector').map((def) => def.id);
    const combinedUnlocked = new Set([...unlockedIds, ...newlyUnlocked]);
    if (normalIds.length > 0 && normalIds.every((id) => combinedUnlocked.has(id))) {
      newlyUnlocked.push('limitless');
    }
  }

  return newlyUnlocked;
}

function groupByCategory(defs) {
  const map = new Map();
  for (const def of defs) {
    if (!map.has(def.category)) map.set(def.category, []);
    map.get(def.category).push(def);
  }
  return map;
}

/** Count of a member's unlocked achievements that fall in the given category. */
function countUnlockedInCategory(progress, category) {
  return progress.unlocked.filter((entry) => getAchievementDefinition(entry.id)?.category === category).length;
}

/** Whether a member has unlocked every achievement in the given category. */
function hasUnlockedAllInCategory(progress, category) {
  const totalInCategory = ACHIEVEMENTS.filter((def) => def.category === category).length;
  return totalInCategory > 0 && countUnlockedInCategory(progress, category) >= totalInCategory;
}

/**
 * Builds ordered category pages for the /achievements view command.
 * Hidden achievements only reveal their name/description once unlocked.
 */
function buildCategoryPages(unlockedMap, context, { includeHidden = true, missingOnly = false } = {}) {
  const grouped = groupByCategory(ACHIEVEMENTS);
  const pages = [];

  for (const category of CATEGORY_ORDER) {
    const defs = grouped.get(category) || [];
    if (defs.length === 0) continue;

    let entries = defs.map((def) => {
      const progress = getAchievementProgress(def, context, unlockedMap);
      if (def.hidden && !progress.completed) {
        return { ...progress, name: '???', description: 'Hidden achievement. Requirements unknown until unlocked.' };
      }
      return progress;
    });

    if (!includeHidden) entries = entries.filter((entry) => !entry.hidden);
    if (missingOnly) entries = entries.filter((entry) => !entry.completed);
    if (entries.length === 0) continue;

    pages.push({ category, entries });
  }

  return pages;
}

module.exports = {
  toDateKey,
  toMonthKey,
  getPacificDateKey,
  toWeekKey,
  daysBetweenDateKeys,
  weeksBetweenWeekKeys,
  daysInMonth,
  computeStreakUpdate,
  computeWeeklyStreakUpdate,
  getAchievementValue,
  getAchievementProgress,
  evaluateAchievements,
  evaluateSpecialAchievements,
  groupByCategory,
  buildCategoryPages,
  countUnlockedInCategory,
  hasUnlockedAllInCategory,
};

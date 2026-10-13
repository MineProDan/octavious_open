// Every colour role members can hold, and what unlocks it. Each family owns a
// slice of the colour wheel so a name colour says where it came from:
//   staff        orange / red        (existing staff roles, not managed here)
//   prestige     light → dark blue   reached through prestige
//   achievements green → yellow      achievement-count milestones
//   rare         teal / cyan         the hardest ultra-rare achievements
//   booster      purple / pink       while boosting the server
//
// Gradients are kept for the hardest colours: prestige 8-10, achievement
// milestones 75 and 100, and every rare colour. Achievements Max, the hardest
// of all, uses Discord's holographic style. `color` is the primary colour
// (used for embeds); `secondaryColor` makes it a gradient.
//
// Roles are matched by name, so renaming a role here means renaming it in
// Discord too.

const { ACHIEVEMENTS } = require('../achievements/definitions');

const PRESTIGE_COLORS = [
  '#C6EBFF', '#A8DDFF', '#8ACFFF', '#6DBEFF', '#56ACFF',
  '#4899FF', '#3F89FF', ['#3C7BFF', '#7FC8FF'], ['#3F6EFF', '#A8DDFF'], ['#4A66FF', '#E0F4FF'],
];

// Discord only accepts these exact values for its holographic role style.
const HOLOGRAPHIC = { color: '#A9C9FF', secondaryColor: '#FFBBEC', tertiaryColor: '#FFC3A0' };

// Join-order achievements (first 250 / 1,000 / 5,000 members) can't be earned
// by anyone who joined later, so "Max" leaves them out.
const UNEARNABLE_ACHIEVEMENTS = new Set(['immortal', 'unc', 'elder']);
const EARNABLE_ACHIEVEMENT_IDS = ACHIEVEMENTS.map((def) => def.id).filter((id) => !UNEARNABLE_ACHIEVEMENTS.has(id));

const ACHIEVEMENT_MILESTONES = [
  { count: 10, color: '#4ADE80' },
  { count: 25, color: '#74E36A' },
  { count: 50, color: '#9BE457' },
  { count: 75, color: '#C1E24A', secondaryColor: '#9BE457' },
  { count: 100, color: '#E3DB45', secondaryColor: '#74E36A' },
  { count: 'max', ...HOLOGRAPHIC },
];

const RARE_ACHIEVEMENT_COLORS = [
  { achievementId: 'overflow', name: 'Overflow', color: '#2DD4BF', secondaryColor: '#22D3EE' },
  { achievementId: 'ascended', name: 'Ascended', color: '#14C8B8', secondaryColor: '#E6FFFB' },
  { achievementId: 'no-contest', name: 'No Contest', color: '#22D3EE', secondaryColor: '#0FB5D6' },
  { achievementId: 'limitless', name: 'Limitless', color: '#0FB5D6', secondaryColor: '#5EEAD4' },
];

const BOOSTER_COLORS = [
  { name: 'Booster Lavender', color: '#C9A7FF' },
  { name: 'Booster Violet', color: '#A97CFF' },
  { name: 'Booster Orchid', color: '#E38BF7' },
  { name: 'Booster Rose', color: '#FF7AC0' },
];

function colorsOf(entry) {
  return {
    color: entry.color,
    ...(entry.secondaryColor && { secondaryColor: entry.secondaryColor }),
    ...(entry.tertiaryColor && { tertiaryColor: entry.tertiaryColor }),
  };
}

const GROUP_LABELS = {
  prestige: 'Prestige',
  achievements: 'Achievements',
  rare: 'Rare',
  booster: 'Booster',
};

// Listed top to bottom in the order the roles should sit in Discord. Picked
// colours (everything but the member's own prestige role) must sit above the
// prestige roles so they show over them.
const COLOR_ROLES = [
  ...RARE_ACHIEVEMENT_COLORS.map((entry) => ({
    key: `rare:${entry.achievementId}`,
    group: 'rare',
    name: entry.name,
    ...colorsOf(entry),
    requirement: ACHIEVEMENTS.find((def) => def.id === entry.achievementId)?.description ?? `Unlock ${entry.name}.`,
    isUnlocked: (ctx) => ctx.unlockedIds.has(entry.achievementId),
    progress: (ctx) => (ctx.unlockedIds.has(entry.achievementId) ? null : 'Not unlocked yet'),
  })),
  ...ACHIEVEMENT_MILESTONES.slice().reverse().map((entry) => {
    const isMax = entry.count === 'max';
    const target = isMax ? EARNABLE_ACHIEVEMENT_IDS.length : entry.count;
    const current = (ctx) => (isMax ? EARNABLE_ACHIEVEMENT_IDS.filter((id) => ctx.unlockedIds.has(id)).length : ctx.unlockedIds.size);
    return {
      key: `achievements:${entry.count}`,
      group: 'achievements',
      name: isMax ? 'Achievements Max' : `Achievements ${entry.count}`,
      ...colorsOf(entry),
      requirement: isMax ? 'Unlock every achievement you can still earn.' : `Unlock ${entry.count} achievements.`,
      isUnlocked: (ctx) => current(ctx) >= target,
      progress: (ctx) => `${Math.min(current(ctx), target)}/${target}`,
    };
  }),
  ...BOOSTER_COLORS.map((entry) => ({
    key: `booster:${entry.name.toLowerCase().replace(/\s+/g, '-')}`,
    group: 'booster',
    name: entry.name,
    ...colorsOf(entry),
    requirement: 'Boost the server.',
    isUnlocked: (ctx) => ctx.isBooster,
    progress: (ctx) => (ctx.isBooster ? null : 'Not boosting'),
  })),
  ...PRESTIGE_COLORS.map((colors, index) => ({
    key: `prestige:${index + 1}`,
    group: 'prestige',
    tier: index + 1,
    name: `Prestige ${index + 1}`,
    ...(Array.isArray(colors) ? { color: colors[0], secondaryColor: colors[1] } : { color: colors }),
    requirement: `Reach Prestige ${index + 1}.`,
    isUnlocked: (ctx) => ctx.prestige >= index + 1,
    progress: (ctx) => `Prestige ${Math.min(ctx.prestige, index + 1)}/${index + 1}`,
  })),
];

const COLOR_ROLES_BY_KEY = new Map(COLOR_ROLES.map((role) => [role.key, role]));

module.exports = {
  COLOR_ROLES,
  COLOR_ROLES_BY_KEY,
  GROUP_LABELS,
  EARNABLE_ACHIEVEMENT_IDS,
  UNEARNABLE_ACHIEVEMENTS,
  HOLOGRAPHIC,
};

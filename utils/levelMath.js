// Canonical level/prestige for a total XP amount, matching /addxp and
// /removexp: every PRESTIGE_XP of total XP is one prestige, and the level is
// the highest xptolevel.csv threshold met by the XP left over.

const PRESTIGE_XP = 65550;

function computeLevelState(totalXP, levelThresholds) {
  const xp = Math.max(0, Number(totalXP) || 0);
  const prestige = Math.floor(xp / PRESTIGE_XP);
  const effectiveXp = xp - prestige * PRESTIGE_XP;
  let level = 0;
  for (const [thresholdLevel, thresholdXp] of levelThresholds) {
    if (effectiveXp >= thresholdXp) level = Math.max(level, thresholdLevel);
  }
  // Members who have never prestiged start at level 1 (see levelOnMemberJoin
  // and the message XP path), so don't report them as level 0.
  if (prestige === 0) level = Math.max(1, level);
  return { prestige, level };
}

module.exports = { PRESTIGE_XP, computeLevelState };

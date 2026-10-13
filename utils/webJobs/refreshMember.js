// member.refresh: requested by a member from the website ("Refresh my data").
// Refetches their Discord profile into their userlevels entry and recomputes
// level/prestige from their stored total XP, which fixes levels that fell out
// of step (e.g. after bulk XP changes).

const { PermanentJobError } = require('./queue');
const { computeLevelState } = require('../levelMath');

async function refreshMember({ db, guild, memberId, levelThresholds, now = new Date() }) {
  if (!/^\d{5,25}$/.test(String(memberId || ''))) throw new PermanentJobError('Invalid member ID.');

  const member = await guild.members.fetch({ user: memberId, force: true }).catch((error) => {
    // 10007 Unknown Member / 10013 Unknown User: not in the server anymore.
    if (error?.code === 10007 || error?.code === 10013) return null;
    throw error;
  });
  if (!member) throw new PermanentJobError('You are no longer a member of the server.');

  const userlevels = db.collection('userlevels');
  const before = await userlevels.findOne({ memberId });

  const profile = {
    username: member.user.username,
    globalName: member.user.globalName ?? null,
    avatarHash: member.user.avatar ?? null,
    avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
    fetchedAt: now,
  };
  const levelState = computeLevelState(before?.totalXP ?? 0, levelThresholds);

  await userlevels.updateOne(
    { memberId },
    {
      $set: { ...profile, level: levelState.level, prestige: levelState.prestige },
      // Same defaults as a member who joined but never earned XP.
      $setOnInsert: { totalXP: 0 },
    },
    { upsert: true },
  );

  const changed = [];
  if (!before || before.username !== profile.username || (before.globalName ?? null) !== profile.globalName) changed.push('name');
  if (!before || before.avatarUrl !== profile.avatarUrl) changed.push('avatar');
  if (!before || before.level !== levelState.level) changed.push('level');
  if (!before || before.prestige !== levelState.prestige) changed.push('prestige');

  return { changed, level: levelState.level, prestige: levelState.prestige, totalXP: before?.totalXP ?? 0 };
}

module.exports = { refreshMember };

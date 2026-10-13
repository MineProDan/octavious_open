// Keeps members' colour roles in line with what they have unlocked.
//
// A member holds at most two colour roles:
//   - their prestige role: the highest tier they have reached (members past
//     the last tier keep the last one). They cannot remove it.
//   - optionally one picked colour from /color: a lower prestige tier, an
//     achievement milestone, a rare achievement, or a booster colour.
// Reaching a new prestige drops a picked prestige tier (the new tier shows
// instead) but keeps other picks. Picks that are no longer unlocked (e.g.
// after boosting ends) are removed.

const { COLOR_ROLES, COLOR_ROLES_BY_KEY } = require('./catalog');

// Map of catalog key -> Role for the colour roles that exist in the guild.
function getColorRoles(guild) {
  const byName = new Map([...guild.roles.cache.values()].map((role) => [role.name, role]));
  const roles = new Map();
  for (const def of COLOR_ROLES) {
    const role = byName.get(def.name);
    if (role) roles.set(def.key, role);
  }
  return roles;
}

function getBaseKey(ctx, availableKeys) {
  let base = null;
  for (const def of COLOR_ROLES) {
    if (def.group !== 'prestige' || !availableKeys.has(def.key) || !def.isUnlocked(ctx)) continue;
    if (!base || def.tier > base.tier) base = def;
  }
  return base?.key ?? null;
}

// Colours the member may pick, in catalog order.
function getPickableKeys(ctx, availableKeys) {
  const base = getBaseKey(ctx, availableKeys);
  return COLOR_ROLES
    .filter((def) => availableKeys.has(def.key) && def.key !== base && def.isUnlocked(ctx))
    .map((def) => def.key);
}

// heldKeys: the member's current colour roles, the one that shows first.
// override: undefined keeps their current pick where still allowed, null
// clears it, a key sets it.
function planColorRoles({ ctx, heldKeys, availableKeys, override }) {
  const base = getBaseKey(ctx, availableKeys);
  const pickable = new Set(getPickableKeys(ctx, availableKeys));

  let pick = null;
  if (override === undefined) {
    const baseChanged = base !== null && !heldKeys.includes(base);
    pick = heldKeys.find((key) => key !== base
      && pickable.has(key)
      && !(baseChanged && COLOR_ROLES_BY_KEY.get(key).group === 'prestige')) ?? null;
  } else if (override !== null) {
    if (!pickable.has(override)) throw new Error(`${COLOR_ROLES_BY_KEY.get(override)?.name ?? override} is not unlocked.`);
    pick = override;
  }

  return { base, pick, keys: [pick, base].filter(Boolean) };
}

async function loadColorContext(db, member) {
  const [levels, progress] = await Promise.all([
    db.collection('userlevels').findOne({ memberId: member.id }, { projection: { prestige: 1 } }),
    db.collection('achievement_progress').findOne({ memberId: member.id }, { projection: { 'unlocked.id': 1 } }),
  ]);
  return toColorContext(member, levels, progress);
}

function toColorContext(member, levels, progress) {
  return {
    prestige: Number(levels?.prestige) || 0,
    unlockedIds: new Set((progress?.unlocked || []).map((entry) => entry.id)),
    isBooster: Boolean(member.premiumSinceTimestamp),
  };
}

// Brings a member's colour roles in line with what they have unlocked.
// Returns the plan plus whether any roles were changed.
async function syncMemberColors(member, { db, ctx, override, reason = 'Colour role sync' } = {}) {
  const roles = getColorRoles(member.guild);
  const context = ctx ?? await loadColorContext(db, member);
  const heldKeys = [...roles]
    .filter(([, role]) => member.roles.cache.has(role.id))
    .sort(([, a], [, b]) => b.position - a.position)
    .map(([key]) => key);
  const plan = planColorRoles({ ctx: context, heldKeys, availableKeys: new Set(roles.keys()), override });

  const toAdd = plan.keys.filter((key) => !heldKeys.includes(key)).map((key) => roles.get(key));
  const toRemove = heldKeys.filter((key) => !plan.keys.includes(key)).map((key) => roles.get(key));
  if (toRemove.length) await member.roles.remove(toRemove, reason);
  if (toAdd.length) await member.roles.add(toAdd, reason);

  return { ...plan, ctx: context, changed: toAdd.length > 0 || toRemove.length > 0 };
}

// Syncs every member who has prestiged or holds a colour role. Used on
// startup so roles match stored progress even for changes made while offline.
async function syncAllColorRoles(guild, db) {
  const roleIds = new Set([...getColorRoles(guild).values()].map((role) => role.id));
  if (!roleIds.size) return { checked: 0, changed: 0 };

  const members = await guild.members.fetch();
  const prestiged = await db.collection('userlevels')
    .find({ prestige: { $gte: 1 } }, { projection: { memberId: 1, prestige: 1 } })
    .toArray();
  const levelsById = new Map(prestiged.map((doc) => [String(doc.memberId), doc]));

  const targets = [...members.values()].filter((member) => levelsById.has(member.id)
    || member.roles.cache.some((role) => roleIds.has(role.id)));
  const progressDocs = await db.collection('achievement_progress')
    .find({ memberId: { $in: targets.map((member) => member.id) } }, { projection: { memberId: 1, 'unlocked.id': 1 } })
    .toArray();
  const progressById = new Map(progressDocs.map((doc) => [String(doc.memberId), doc]));

  let changed = 0;
  for (const member of targets) {
    try {
      const ctx = toColorContext(member, levelsById.get(member.id), progressById.get(member.id));
      const result = await syncMemberColors(member, { ctx });
      if (result.changed) changed += 1;
    } catch (error) {
      console.error(`Error syncing colour roles for ${member.id}:`, error);
    }
  }
  return { checked: targets.length, changed };
}

module.exports = {
  getColorRoles,
  getBaseKey,
  getPickableKeys,
  planColorRoles,
  loadColorContext,
  syncMemberColors,
  syncAllColorRoles,
};

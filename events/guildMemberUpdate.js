const { Events } = require('discord.js');
const { mongoDB } = require('../index');
const { COLOR_ROLES_BY_KEY } = require('../utils/colorRoles/catalog');
const { getColorRoles, syncMemberColors } = require('../utils/colorRoles/sync');

// Booster colours are only unlocked while boosting; drop them when it ends.
module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    if (process.env.GUILDID && newMember.guild.id !== process.env.GUILDID) return;
    if (newMember.premiumSinceTimestamp) return;

    const holdsBoosterColor = [...getColorRoles(newMember.guild)]
      .some(([key, role]) => COLOR_ROLES_BY_KEY.get(key).group === 'booster' && newMember.roles.cache.has(role.id));
    if (!holdsBoosterColor) return;

    await syncMemberColors(newMember, { db: mongoDB, reason: 'Stopped boosting' })
      .catch((error) => console.error('Error removing booster colour:', error));
  },
};

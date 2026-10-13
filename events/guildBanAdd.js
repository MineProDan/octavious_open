const { Events } = require('discord.js');
const achievements = require('../utils/achievements/store');

module.exports = {
  name: Events.GuildBanAdd,
  async execute(ban) {
    try {
      if (process.env.GUILDID && ban.guild.id !== process.env.GUILDID) return;
      await achievements.recordBanEvent(ban.guild.id, new Date());
    } catch (error) {
      console.error('Error recording ban achievement progress:', error);
    }
  },
};

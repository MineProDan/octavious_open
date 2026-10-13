const { Events } = require('discord.js');
const achievements = require('../utils/achievements/store');

module.exports = {
  name: Events.GuildScheduledEventUserAdd,
  async execute(guildScheduledEvent, user) {
    try {
      if (user.bot) return;
      if (process.env.GUILDID && guildScheduledEvent.guildId !== process.env.GUILDID) return;
      await achievements.recordScheduledEventInteraction(user.id);
    } catch (error) {
      console.error('Error recording scheduled-event achievement progress:', error);
    }
  },
};

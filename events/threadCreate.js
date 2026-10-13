const { Events } = require('discord.js');
const achievements = require('../utils/achievements/store');

module.exports = {
  name: Events.ThreadCreate,
  async execute(thread) {
    try {
      if (!thread.guild) return;
      if (process.env.GUILDID && thread.guild.id !== process.env.GUILDID) return;
      const ownerId = thread.ownerId;
      if (!ownerId) return;

      await achievements.recordThreadCreated(ownerId);
    } catch (error) {
      console.error('Error recording thread-created achievement progress:', error);
    }
  },
};

const { Events } = require('discord.js');
const activityStats = require('../utils/activityStats');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    if (process.env.GUILDID && member.guild.id !== process.env.GUILDID) return;
    if (member.user?.bot) return;
    try {
      await activityStats.recordLeave({ memberId: member.id });
    } catch (error) {
      console.error('Error recording leave activity stats:', error);
    }
  },
};

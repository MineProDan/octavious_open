const { Events } = require('discord.js');
const automod = require('../utils/automod/store');

// Logs every action AutoMod takes for the website's AutoMod tab. Needs the
// AutoModerationExecution intent and the Manage Server permission.
module.exports = {
  name: Events.AutoModerationActionExecution,
  async execute(execution) {
    try {
      if (process.env.GUILDID && execution.guild.id !== process.env.GUILDID) return;
      const rule = execution.autoModerationRule
        || await execution.guild.autoModerationRules.fetch(execution.ruleId).catch(() => null);
      const user = execution.member?.user
        || await execution.guild.client.users.fetch(execution.userId).catch(() => null);
      const event = automod.toEvent(execution, {
        ruleName: rule?.name,
        memberName: user ? user.globalName || user.username : null,
      });
      await automod.recordExecution(event);
    } catch (error) {
      console.error('Error recording AutoMod action:', error);
    }
  },
};

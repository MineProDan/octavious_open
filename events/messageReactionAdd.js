const { Events, PermissionFlagsBits } = require('discord.js');
const achievements = require('../utils/achievements/store');
const petMechanics = require('../utils/pets/mechanics');
const activityStats = require('../utils/activityStats');

module.exports = {
  name: Events.MessageReactionAdd,
  async execute(reaction, user) {
    try {
      if (user.bot) return;
      if (reaction.partial) await reaction.fetch().catch(() => null);
      if (reaction.message.partial) await reaction.message.fetch().catch(() => null);

      const message = reaction.message;
      if (!message?.guild) return;
      if (process.env.GUILDID && message.guild.id !== process.env.GUILDID) return;

      activityStats.recordReaction({ memberId: user.id })
        .catch((error) => console.error('Error recording reaction activity stats:', error));
      await achievements.recordReactionGiven(user.id, message.author?.id ?? null);

      if (message.author?.id === user.id) {
        await petMechanics.claimBeeReactionReward(user.id, {
          messageId: message.id,
          channelId: message.channel.id,
          emojiName: reaction.emoji.name,
        }).catch((error) => console.error('Error claiming Bee reaction reward:', error));
      }

      if (message.author && !message.author.bot && message.author.id !== user.id) {
        const reactorMember = await message.guild.members.fetch(user.id).catch(() => null);
        const isFromStaff = Boolean(
          reactorMember?.permissions.has(PermissionFlagsBits.ModerateMembers)
          || reactorMember?.permissions.has(PermissionFlagsBits.Administrator),
        );

        await achievements.recordReactionReceived(message.author.id, {
          messageId: message.id,
          reactorId: user.id,
          isFromStaff,
          emojiName: reaction.emoji.name,
        });
      }
    } catch (error) {
      console.error('Error recording reaction achievement progress:', error);
    }
  },
};

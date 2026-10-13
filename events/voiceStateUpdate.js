const { Events } = require('discord.js');
const { handleVoiceStateUpdate } = require('../utils/achievements/voiceTracker');

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    if (process.env.GUILDID && guild?.id !== process.env.GUILDID) return;
    if ((newState.member?.user ?? oldState.member?.user)?.bot) return;

    try {
      await handleVoiceStateUpdate(oldState, newState);
    } catch (error) {
      console.error('Error recording voice achievement progress:', error);
    }
  },
};

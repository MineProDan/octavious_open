// In-memory (per-process) voice session tracking. Achievement voice minutes are
// only as accurate as the current process uptime; a bot restart mid-session will
// lose that partial session, which is an acceptable tradeoff for this feature.
const { recordVoiceMinutes, recordGhostAlone } = require('./store');
const { recordVoiceSession } = require('../activityStats');

const sessionStart = new Map(); // userId -> Date
const aloneStart = new Map(); // userId -> Date

const GHOST_THRESHOLD_MS = 2 * 60 * 60 * 1000;

async function endSession(userId) {
  const start = sessionStart.get(userId);
  if (!start) return;
  sessionStart.delete(userId);
  recordVoiceSession({ memberId: userId, start })
    .catch((error) => console.error('Error recording voice activity stats:', error));
  const minutes = Math.floor((Date.now() - start.getTime()) / 60000);
  if (minutes > 0) {
    await recordVoiceMinutes(userId, minutes);
  }
}

async function checkGhost(userId, isAloneNow) {
  if (isAloneNow) {
    if (!aloneStart.has(userId)) aloneStart.set(userId, new Date());
    return;
  }
  const start = aloneStart.get(userId);
  aloneStart.delete(userId);
  if (start && Date.now() - start.getTime() >= GHOST_THRESHOLD_MS) {
    await recordGhostAlone(userId);
  }
}

async function handleVoiceStateUpdate(oldState, newState) {
  const userId = newState.id || oldState.id;
  if (!userId) return;

  const wasInChannel = Boolean(oldState.channelId);
  const isInChannel = Boolean(newState.channelId);

  if (!wasInChannel && isInChannel) {
    sessionStart.set(userId, new Date());
  } else if (wasInChannel && !isInChannel) {
    await endSession(userId);
    await checkGhost(userId, false);
  } else if (wasInChannel && isInChannel && oldState.channelId !== newState.channelId) {
    await endSession(userId);
    sessionStart.set(userId, new Date());
  }

  if (isInChannel) {
    const humanMembers = newState.channel?.members?.filter((member) => !member.user.bot).size ?? 0;
    await checkGhost(userId, humanMembers <= 1);
  }
}

module.exports = { handleVoiceStateUpdate };

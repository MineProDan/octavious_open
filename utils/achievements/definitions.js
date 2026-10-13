const { CATEGORIES } = require('./categories');

// context = { now: Date, userlevels: {level, totalXP, prestige} | null, progress: <achievement_progress doc> }
// getValue(context) must always return a number. Boolean/one-off achievements are represented
// as flags on progress.flags[key] which resolve to 0 or 1, so the whole engine can stay
// generic (current >= target unlocks the achievement).

function xp(ctx) { return ctx.userlevels?.totalXP ?? 0; }
function level(ctx) { return ctx.userlevels?.level ?? 0; }
function prestige(ctx) { return ctx.userlevels?.prestige ?? 0; }
function flag(name) { return (ctx) => (ctx.progress.flags?.[name] ? 1 : 0); }
function claimStreak(ctx) { return ctx.progress.claim?.longestStreak ?? 0; }
function claimWeeks(ctx) { return Math.floor((ctx.progress.claim?.longestStreak ?? 0) / 7); }
function completionist(ctx) {
  const unlockedIds = new Set((ctx.progress.unlocked || []).map((entry) => entry.id));
  const categories = [...new Set(
    ACHIEVEMENTS.filter((def) => !def.hidden && !def.ultraRare && !def.special).map((def) => def.category),
  )];
  return categories.some((category) => {
    const ids = ACHIEVEMENTS
      .filter((def) => def.category === category && !def.hidden && !def.ultraRare && !def.special)
      .map((def) => def.id);
    return ids.length > 0 && ids.every((id) => unlockedIds.has(id)) ? 1 : 0;
  }) ? 1 : 0;
}
function levelUpsWithin(ms) {
  return (ctx) => {
    const timestamps = ctx.progress.xp?.levelUpTimestamps ?? [];
    const now = ctx.now.getTime();
    return timestamps.filter((t) => now - t <= ms).length;
  };
}

const ACHIEVEMENTS = [
  // ---------------------------------------------------------------- XP & LEVELS
  { id: 'getting-started', name: 'Getting Started', description: "Reach level 2. Everyone has to start somewhere.", category: CATEGORIES.XP_LEVELS, target: 2, getValue: level },
  { id: 'on-the-rise', name: 'On the Rise', description: "Reach level 10. You're officially past the \"new here\" phase.", category: CATEGORIES.XP_LEVELS, target: 10, getValue: level },
  { id: 'seasoned', name: 'Seasoned', description: "Reach level 25. You've put in enough time to know your way around.", category: CATEGORIES.XP_LEVELS, target: 25, getValue: level },
  { id: 'limit-breaker', name: 'Limit Breaker', description: "Prestige for the first time. You hit the ceiling and decided that wasn't enough.", category: CATEGORIES.XP_LEVELS, target: 1, getValue: prestige },
  { id: 'beyond-the-limit', name: 'Beyond the Limit', description: 'Reach 5 prestiges. The original ceiling stopped meaning much a while ago.', category: CATEGORIES.XP_LEVELS, target: 5, getValue: prestige },
  { id: 'back-from-the-dead', name: 'Back From the Dead', description: "Earn XP after going 7 or more days without earning any. Somehow, you're back.", category: CATEGORIES.XP_LEVELS, target: 1, getValue: flag('backFromTheDead') },
  { id: 'speedrunner', name: 'Speedrunner', description: "Gain 25 levels within a single week. You weren't exactly taking it slow.", category: CATEGORIES.XP_LEVELS, target: 25, getValue: levelUpsWithin(7 * 24 * 60 * 60 * 1000) },
  { id: 'triple-sevens', name: 'Triple Sevens', description: 'Have your total XP land on a number ending in 777 immediately after an XP award. Sometimes you just get lucky.', category: CATEGORIES.ULTRA_RARE, target: 1, ultraRare: true, getValue: flag('tripleSevens') },
  { id: 'xp-hoarder', name: 'XP Hoarder', description: "Earn 100,000 total XP. At this point, you're collecting the stuff.", category: CATEGORIES.XP_LEVELS, target: 100000, getValue: xp },
  { id: 'xp-addict', name: 'XP Addict', description: 'Earn 500,000 total XP. This is getting excessive.', category: CATEGORIES.XP_LEVELS, target: 500000, getValue: xp },
  { id: 'no-ceiling', name: 'No Ceiling', description: 'Reach 10 prestiges. You stopped treating the limit like a limit.', category: CATEGORIES.XP_LEVELS, target: 10, getValue: prestige },

  // ---------------------------------------------------------------- MESSAGES
  { id: 'hello-there', name: 'Hello There', description: 'Send your first message in the server.', category: CATEGORIES.MESSAGES, target: 1, getValue: (ctx) => ctx.progress.messages.total },
  { id: 'chatterbox', name: 'Chatterbox', description: "Send 100 messages. You've officially started talking.", category: CATEGORIES.MESSAGES, target: 100, getValue: (ctx) => ctx.progress.messages.total },
  { id: 'regular-around-here', name: 'Regular Around Here', description: 'Send 1,000 messages. People are beginning to recognize your typing style.', category: CATEGORIES.MESSAGES, target: 1000, getValue: (ctx) => ctx.progress.messages.total },
  { id: 'server-voice', name: 'Server Voice', description: "Send 5,000 messages. You've made a real impact on the server.", category: CATEGORIES.MESSAGES, target: 5000, getValue: (ctx) => ctx.progress.messages.total },
  { id: 'never-shuts-up', name: 'Never Shuts Up', description: 'Send 10,000 messages. At this point, silence would be suspicious.', category: CATEGORIES.MESSAGES, target: 10000, getValue: (ctx) => ctx.progress.messages.total },
  { id: 'poet', name: 'Poet', description: 'Send a message over 250 characters. Apparently multiple messages was too cool for you.', category: CATEGORIES.MESSAGES, target: 250, getValue: (ctx) => ctx.progress.messages.longestLength },
  { id: 'wall-of-text', name: 'Wall of Text', description: 'Send a message over 500 characters. You really could have split this up into multiple messages.', category: CATEGORIES.MESSAGES, target: 500, getValue: (ctx) => ctx.progress.messages.longestLength },
  { id: 'media-man', name: 'Media Man', description: 'Send 25 messages containing attachments. Pictures, files, memes, whatever you send we see it.', category: CATEGORIES.MESSAGES, target: 25, getValue: (ctx) => ctx.progress.messages.attachments },
  { id: 'reply-guy', name: 'Reply Guy', description: "Use Discord's reply feature 50 times. You saw a message and simply had to answer it.", category: CATEGORIES.MESSAGES, target: 50, getValue: (ctx) => ctx.progress.messages.replies },
  { id: 'yapper', name: 'Yapper', description: "Send 100 messages in a single day. That's a lot of words.", category: CATEGORIES.MESSAGES, target: 100, getValue: (ctx) => ctx.progress.messages.maxDayCount },
  { id: 'touch-grass', name: 'Touch Grass', description: 'Send 500 messages in a single day. You have transcended conversation.', category: CATEGORIES.MESSAGES, target: 500, getValue: (ctx) => ctx.progress.messages.maxDayCount },

  // ---------------------------------------------------------------- ACTIVITY DAYS & STREAKS
  { id: 'first-steps', name: 'First Steps', description: 'Be active on 1 different day.', category: CATEGORIES.ACTIVITY, target: 1, getValue: (ctx) => ctx.progress.activity.activeDaysCount },
  { id: 'settled-in', name: 'Settled In', description: 'Be active on 30 different days. This is no longer a one-off visit.', category: CATEGORIES.ACTIVITY, target: 30, getValue: (ctx) => ctx.progress.activity.activeDaysCount },
  { id: 'regular', name: 'Regular', description: "Be active on 100 different days. You're becoming part of the furniture.", category: CATEGORIES.ACTIVITY, target: 100, getValue: (ctx) => ctx.progress.activity.activeDaysCount },
  { id: 'resident', name: 'Resident', description: 'Be active on 250 different days. At this point, you practically live here.', category: CATEGORIES.ACTIVITY, target: 250, getValue: (ctx) => ctx.progress.activity.activeDaysCount },
  { id: 'three-day-streak', name: 'Three-Day Streak', description: 'Claim XP for 3 consecutive days. A modest streak, but a streak nonetheless.', category: CATEGORIES.ACTIVITY, target: 3, getValue: claimStreak },
  { id: 'seven-straight', name: 'Seven Straight', description: 'Claim XP for 7 consecutive days. A full week without missing a claim.', category: CATEGORIES.ACTIVITY, target: 7, getValue: claimStreak },
  { id: 'two-weeks-strong', name: 'Two Weeks Strong', description: "Claim XP for 14 consecutive days. You really haven't missed a claim.", category: CATEGORIES.ACTIVITY, target: 14, getValue: claimStreak },
  { id: 'no-days-off', name: 'No Days Off', description: "Claim XP for 30 consecutive days. Apparently, taking a day off wasn't an option.", category: CATEGORIES.ACTIVITY, target: 30, getValue: claimStreak },
  { id: 'unbroken', name: 'Unbroken', description: "Claim XP for 100 consecutive days. Breaking the chain wasn't happening.", category: CATEGORIES.ACTIVITY, target: 100, getValue: claimStreak },
  { id: 'still-here-13w', name: 'Still Here', description: "Claim XP every day for 13 consecutive weeks. Three months later, you're still around.", category: CATEGORIES.ACTIVITY, target: 13, getValue: claimWeeks },
  { id: 'never-missed', name: 'Never Missed', description: 'Claim XP every day for 30 consecutive weeks. Half a year of showing up.', category: CATEGORIES.ACTIVITY, target: 30, getValue: claimWeeks },
  { id: 'perfect-month', name: 'Perfect Month', description: 'Be active every day of a calendar month. Not one day missed.', category: CATEGORIES.ACTIVITY, target: 1, getValue: flag('perfectMonth') },
  { id: 'weekend-warrior', name: 'Weekend Warrior', description: "Be active on 10 different weekends. Weekdays aren't the only time you show up.", category: CATEGORIES.ACTIVITY, target: 10, getValue: (ctx) => ctx.progress.activity.weekendDaysSet.length },
  { id: '365', name: '365', description: 'Be active on 365 different days. One full year of days spent here.', category: CATEGORIES.ACTIVITY, target: 365, getValue: (ctx) => ctx.progress.activity.activeDaysCount },
  { id: 'no-life', name: 'No Life', description: 'Claim XP for 150 consecutive days. You know exactly what you have done.', category: CATEGORIES.ACTIVITY, target: 150, getValue: claimStreak },

  // ---------------------------------------------------------------- CHANNELS
  { id: 'channel-hopper', name: 'Channel Hopper', description: 'Talk in 5 different channels. You refuse to stay in one place.', category: CATEGORIES.CHANNELS, target: 5, getValue: (ctx) => ctx.progress.channels.unique.length },
  { id: 'everywhere-at-once', name: 'Everywhere At Once', description: 'Talk in 10 different channels. Somehow, you are everywhere.', category: CATEGORIES.CHANNELS, target: 10, getValue: (ctx) => ctx.progress.channels.unique.length },
  { id: 'server-tourist', name: 'Server Tourist', description: "Send a message in every channel on the server's configured channel list. You've seen it all.", category: CATEGORIES.CHANNELS, target: 1, getValue: flag('serverTourist') },
  { id: 'local', name: 'Local', description: 'Send 500 messages in a single channel. You know this place well.', category: CATEGORIES.CHANNELS, target: 500, getValue: (ctx) => ctx.progress.messages.maxChannelCount },
  { id: 'home-base', name: 'Home Base', description: 'Send 1,000 messages in a single channel. At this point, this is your room.', category: CATEGORIES.CHANNELS, target: 1000, getValue: (ctx) => ctx.progress.messages.maxChannelCount },
  { id: 'unique', name: 'Unique', description: "Send 1,000 messages in a single channel that isn't #general. You found a second home.", category: CATEGORIES.CHANNELS, target: 1000, getValue: (ctx) => ctx.progress.messages.maxNonGeneralChannelCount },
  { id: 'triple-threat', name: 'Triple Threat', description: 'Be active in three different channels within one hour. Multitasking, Discord-style.', category: CATEGORIES.CHANNELS, target: 1, getValue: flag('tripleThreat') },
  { id: 'conversation-starter', name: 'Conversation Starter', description: 'Be the first person to message in a channel after at least one hour of silence. You broke the quiet.', category: CATEGORIES.CHANNELS, target: 1, getValue: (ctx) => ctx.progress.channels.silenceBreaks },
  { id: 'icebreaker', name: 'Icebreaker', description: 'Be the first person to message in a silent channel 10 times. You apparently hate awkward silence.', category: CATEGORIES.CHANNELS, target: 10, getValue: (ctx) => ctx.progress.channels.silenceBreaks },
  { id: 'thread-starter', name: 'Thread Starter', description: 'Create a thread or forum post. You started something.', category: CATEGORIES.CHANNELS, target: 1, getValue: (ctx) => ctx.progress.threads.created },
  { id: 'deep-dive', name: 'Deep Dive', description: 'Send 50 messages inside threads. You went deeper than the main chat.', category: CATEGORIES.CHANNELS, target: 50, getValue: (ctx) => ctx.progress.messages.threadMessages },
  { id: 'channel-surfer', name: 'Channel Surfer', description: 'Be active in 20 different threads. You have absolutely no main channel.', category: CATEGORIES.CHANNELS, target: 20, getValue: (ctx) => ctx.progress.threads.uniqueActive.length },
  { id: 'lost-again', name: 'Lost Again', description: 'Send messages in 15 different channels in a single day. How did you even get here?', category: CATEGORIES.CHANNELS, target: 15, getValue: (ctx) => ctx.progress.messages.maxDailyUniqueChannels },
  { id: 'main-character', name: 'Main Character', description: 'Send 5,000 messages in one channel. This channel might as well have your name on it.', category: CATEGORIES.CHANNELS, target: 5000, getValue: (ctx) => ctx.progress.messages.maxChannelCount },

  // ---------------------------------------------------------------- SNIPES & EDITS
  { id: 'vanishing-act', name: 'Vanishing Act', description: 'Have 1 of your messages deleted. It was there a second ago.', category: CATEGORIES.SNIPES_EDITS, target: 1, getValue: (ctx) => ctx.progress.snipesEdits.ownDeleted },
  { id: 'ghost-writer', name: 'Ghost Writer', description: 'Have 25 of your messages deleted. Your words have a habit of disappearing.', category: CATEGORIES.SNIPES_EDITS, target: 25, getValue: (ctx) => ctx.progress.snipesEdits.ownDeleted },
  { id: 'revisionist', name: 'Revisionist', description: "Edit 10 messages. You don't always get it right the first time.", category: CATEGORIES.SNIPES_EDITS, target: 10, getValue: (ctx) => ctx.progress.snipesEdits.ownEdited },
  { id: 'perfectionist', name: 'Perfectionist', description: 'Edit 50 messages. Good enough was apparently not good enough.', category: CATEGORIES.SNIPES_EDITS, target: 50, getValue: (ctx) => ctx.progress.snipesEdits.ownEdited },
  { id: 'not-so-fast', name: 'Not So Fast', description: 'View 10 deleted messages. You caught them before they vanished.', category: CATEGORIES.SNIPES_EDITS, target: 10, getValue: (ctx) => ctx.progress.snipesEdits.deletedViewed },
  { id: 'i-see-all', name: 'I See All', description: 'View 100 deleted messages. Nothing disappears fast enough.', category: CATEGORIES.SNIPES_EDITS, target: 100, getValue: (ctx) => ctx.progress.snipesEdits.deletedViewed },
  { id: 'detective', name: 'Detective', description: 'View 10 edited messages. You noticed the change.', category: CATEGORIES.SNIPES_EDITS, target: 10, getValue: (ctx) => ctx.progress.snipesEdits.editedViewed },

  // ---------------------------------------------------------------- SOCIAL
  { id: 'crowd-favorite', name: 'Crowd Favorite', description: 'Receive 25 reactions. People seem to like what you post.', category: CATEGORIES.SOCIAL, target: 25, getValue: (ctx) => ctx.progress.social.reactionsReceived },
  { id: 'reaction-magnet', name: 'Reaction Magnet', description: 'Receive 100 reactions. Reactions seem to find you.', category: CATEGORIES.SOCIAL, target: 100, getValue: (ctx) => ctx.progress.social.reactionsReceived },
  { id: 'super-star', name: 'Super Star', description: 'Receive 250 reactions. At this point, people are actively looking for the buttons.', category: CATEGORIES.SOCIAL, target: 250, getValue: (ctx) => ctx.progress.social.reactionsReceived },
  { id: 'reaction-button-masher', name: 'Button Masher', description: 'Give 100 reactions. You have opinions, and you express them one click at a time.', category: CATEGORIES.SOCIAL, target: 100, getValue: (ctx) => ctx.progress.social.reactionsGiven },
  { id: 'acquaintances', name: 'Acquaintances', description: "Reply to 10 different users. You've started meeting people.", category: CATEGORIES.SOCIAL, target: 10, getValue: (ctx) => ctx.progress.social.uniqueRepliedUsers.length },
  { id: 'know-everybody', name: 'Know Everybody', description: "Reply to 50 different users. You know half the room by now.", category: CATEGORIES.SOCIAL, target: 50, getValue: (ctx) => ctx.progress.social.uniqueRepliedUsers.length },
  { id: 'first-responder', name: 'First Responder', description: 'Reply to a member who joined the server less than 7 days ago. You were there early.', category: CATEGORIES.SOCIAL, target: 1, getValue: flag('firstResponder') },
  { id: 'summoned', name: 'Summoned', description: 'Receive 100 mentions. Apparently, people keep needing you.', category: CATEGORIES.SOCIAL, target: 100, getValue: (ctx) => ctx.progress.social.mentionsReceived },
  { id: 'good-influence', name: 'Good Influence', description: 'Receive 3 reactions from different users on a single message. One message really landed.', category: CATEGORIES.SOCIAL, target: 3, getValue: (ctx) => ctx.progress.social.maxUniqueReactorsOnMessage },
  { id: 'crowd-control', name: 'Crowd Control', description: 'Receive 10 reactions from different users on a single message. You managed to get the whole room involved.', category: CATEGORIES.SOCIAL, target: 10, getValue: (ctx) => ctx.progress.social.maxUniqueReactorsOnMessage },
  { id: 'social-butterfly', name: 'Social Butterfly', description: 'Interact with 100 different members through replies or other qualifying interactions. You know a lot of people.', category: CATEGORIES.SOCIAL, target: 100, getValue: (ctx) => ctx.progress.social.uniqueInteractedUsers.length },

  // ---------------------------------------------------------------- VOICE
  { id: 'voice-regular', name: 'Voice Regular', description: "Spend 5 total hours in voice chat. You've started hanging around.", category: CATEGORIES.VOICE, target: 300, getValue: (ctx) => ctx.progress.voice.totalMinutes },
  { id: 'voice-veteran', name: 'Voice Veteran', description: "Spend 25 total hours in voice chat. You've spent a serious amount of time talking.", category: CATEGORIES.VOICE, target: 1500, getValue: (ctx) => ctx.progress.voice.totalMinutes },
  { id: 'permanent-resident', name: 'Permanent Resident', description: 'Spend 50 total hours in voice chat. Voice chat is basically another home.', category: CATEGORIES.VOICE, target: 3000, getValue: (ctx) => ctx.progress.voice.totalMinutes },
  { id: 'second-home', name: 'Second Home', description: 'Spend 100 total hours in voice chat. At this point, the call is where you live.', category: CATEGORIES.VOICE, target: 6000, getValue: (ctx) => ctx.progress.voice.totalMinutes },
  { id: 'do-you-ever-leave', name: 'Do You Ever Leave?', description: 'Spend 250 total hours in voice chat. Seriously.', category: CATEGORIES.VOICE, target: 15000, getValue: (ctx) => ctx.progress.voice.totalMinutes },

  // ---------------------------------------------------------------- TIME-BASED
  { id: 'anniversary', name: 'Anniversary', description: 'Send a message on the anniversary of your joining the server.', category: CATEGORIES.TIME_BASED, target: 1, getValue: flag('anniversary') },
  { id: 'old-guard', name: 'Old Guard', description: "Be in the server for at least 1 year and send at least 500 messages. You didn't just lurk through the year.", category: CATEGORIES.TIME_BASED, target: 1, getValue: flag('oldGuard') },
  { id: 'server-historian', name: 'Server Historian', description: "Be in the server for at least 2 years and send at least 1,000 messages. You've been around long enough to remember things.", category: CATEGORIES.ULTRA_RARE, target: 1, ultraRare: true, getValue: flag('serverHistorian') },
  { id: 'ancient', name: 'Ancient', description: "Be in the server for at least 3 years and send at least 2,500 messages. You're part of the server's history now.", category: CATEGORIES.ULTRA_RARE, target: 1, ultraRare: true, getValue: flag('ancient') },
  { id: 'midnight-club', name: 'Midnight Club', description: 'Be active between 00:00 and 03:00 on 5 different days. The normal hours clearly weren\'t enough.', category: CATEGORIES.TIME_BASED, target: 5, getValue: (ctx) => ctx.progress.timeBased.midnightClubDays.length },
  { id: 'early-bird', name: 'Early Bird', description: 'Be active between 03:00 and 08:00 on 5 different days. You were here before the day started.', category: CATEGORIES.TIME_BASED, target: 5, getValue: (ctx) => ctx.progress.timeBased.earlyBirdDays.length },
  { id: 'year-round', name: 'Year-Round', description: 'Be active during 12 different calendar months. You made it through an entire year.', category: CATEGORIES.TIME_BASED, target: 12, getValue: (ctx) => ctx.progress.activity.monthsActiveSet.length },
  { id: 'first-in-line', name: 'First in Line', description: 'Be one of the first 25 active users in a new calendar month. You got there before almost everyone else.', category: CATEGORIES.TIME_BASED, target: 1, getValue: flag('firstInLine') },
  { id: 'event-connoisseur', name: 'Event Connoisseur', description: 'Interacted with a server Event. Get ready to party!', category: CATEGORIES.TIME_BASED, target: 1, getValue: flag('eventConnoisseur') },
  { id: 'still-here-5y', name: 'Still Here', description: 'Be in the server for at least 5 years and have sent 5,000 messages. Five years later, somehow you are still here.', category: CATEGORIES.ULTRA_RARE, target: 1, ultraRare: true, getValue: flag('stillHere5y') },

  // ---------------------------------------------------------------- BOT USAGE
  { id: 'curious', name: 'Curious', description: 'Use 5 different bot commands. You started poking around.', category: CATEGORIES.BOT_USAGE, target: 5, getValue: (ctx) => ctx.progress.bot.uniqueCommands.length },
  { id: 'rank-checker', name: 'Rank Checker', description: 'Check your rank 10 times. You definitely wanted to know where you stood.', category: CATEGORIES.BOT_USAGE, target: 10, getValue: (ctx) => ctx.progress.bot.rankChecks },
  { id: 'top-100', name: 'Top 100', description: "Reach a position within the server's top 100 XP leaderboard. You've made the list.", category: CATEGORIES.BOT_USAGE, target: 1, getValue: flag('top100') },
  { id: 'daily-champion', name: 'Daily Champion', description: "Finish a calendar day as the server's highest XP earner. You owned that day.", category: CATEGORIES.BOT_USAGE, target: 1, getValue: flag('dailyChampion') },
  { id: 'command-line', name: 'Command Line', description: 'Use 10 different bot commands. You found most of the buttons.', category: CATEGORIES.BOT_USAGE, target: 10, getValue: (ctx) => ctx.progress.bot.uniqueCommands.length },
  { id: 'bot-button-masher', name: 'Button Masher', description: 'Use 1,000 bot commands. You have apparently tried everything.', category: CATEGORIES.BOT_USAGE, target: 1000, getValue: (ctx) => ctx.progress.bot.totalCommands },

  // ---------------------------------------------------------------- META (special, evaluated separately)
  { id: 'collector', name: 'Collector', description: 'Unlock 10 achievements. You started filling the shelf.', category: CATEGORIES.META, target: 10, special: true, getValue: (ctx) => ctx.progress.unlocked.length },
  { id: 'completionist', name: 'Completionist', description: 'Unlock every achievement in a single category. One section completely cleared.', category: CATEGORIES.META, target: 1, special: true, getValue: completionist },

  // ---------------------------------------------------------------- HIDDEN (requirements not shown until unlocked)
  { id: 'deja-vu', name: 'Déjà Vu', description: 'Send the exact same message twice in succession.', category: CATEGORIES.HIDDEN, target: 1, hidden: true, getValue: flag('dejaVu') },
  { id: 'oops', name: 'Oops', description: 'Delete a message shortly after sending it.', category: CATEGORIES.HIDDEN, target: 1, hidden: true, getValue: flag('oops') },
  { id: 'hello-darkness', name: 'Hello Darkness', description: 'Send a message after the server has been completely inactive for an extended period.', category: CATEGORIES.HIDDEN, target: 1, hidden: true, getValue: flag('helloDarkness') },
  { id: 'midnight-snack', name: 'Midnight Snack', description: 'Send a message at exactly midnight.', category: CATEGORIES.HIDDEN, target: 1, hidden: true, getValue: flag('midnightSnack') },
  { id: 'lucky-number', name: 'Lucky Number', description: 'Send a message containing 777.', category: CATEGORIES.HIDDEN, target: 1, hidden: true, getValue: flag('luckyNumber') },
  { id: 'echo', name: 'Echo', description: 'Reply directly to one of your own messages.', category: CATEGORIES.HIDDEN, target: 1, hidden: true, getValue: flag('echo') },
  { id: 'ghost', name: 'Ghost', description: 'Be alone in VC for 2 hours.', category: CATEGORIES.HIDDEN, target: 1, hidden: true, getValue: flag('ghost') },
  { id: 'speed-demon', name: 'Speed Demon', description: 'Gain 10 levels in an hour.', category: CATEGORIES.HIDDEN, target: 10, hidden: true, getValue: levelUpsWithin(60 * 60 * 1000) },
  { id: 'same-time-tomorrow', name: 'Same Time Tomorrow', description: 'Send a message at the same exact time, two days in a row.', category: CATEGORIES.HIDDEN, target: 1, hidden: true, getValue: flag('sameTimeTomorrow') },
  { id: 'wrong-place-wrong-time', name: 'Wrong Place, Wrong Time', description: 'Chat right before or after someone gets banned.', category: CATEGORIES.HIDDEN, target: 1, hidden: true, getValue: flag('wrongPlaceWrongTime') },
  { id: 'double-take', name: 'Double Take', description: 'Send two qualifying messages with identical content separated by a short interval.', category: CATEGORIES.HIDDEN, target: 1, hidden: true, getValue: flag('doubleTake') },
  { id: 'a-treat', name: 'A Treat', description: 'Have a staff member react to your message with a cookie emoji.', category: CATEGORIES.HIDDEN, target: 1, hidden: true, getValue: flag('aTreat') },

  // ---------------------------------------------------------------- ULTRA-RARE
  { id: 'limitless', name: 'Limitless', description: 'Unlock every normal achievement in every category. There is nothing left on the board.', category: CATEGORIES.ULTRA_RARE, target: 1, ultraRare: true, special: true, getValue: () => 0 },
  { id: 'overflow', name: 'Overflow', description: 'Earn 1,000,000 total XP. Six figures wasn\'t enough.', category: CATEGORIES.ULTRA_RARE, target: 1000000, ultraRare: true, getValue: xp },
  { id: 'ascended', name: 'Ascended', description: 'Reach 2,500,000 total XP. You can stop now... seriously.', category: CATEGORIES.ULTRA_RARE, target: 2500000, ultraRare: true, getValue: xp },
  { id: 'immortal', name: 'Immortal', description: 'Be one of the first 250 members.', category: CATEGORIES.ULTRA_RARE, target: 1, ultraRare: true, getValue: flag('immortal') },
  { id: 'no-contest', name: 'No Contest', description: 'Have 100k more XP than the person below you on the leaderboard.', category: CATEGORIES.ULTRA_RARE, target: 1, ultraRare: true, getValue: flag('noContest') },
  { id: 'unc', name: 'Unc', description: 'Be one of the first 1,000 members.', category: CATEGORIES.ULTRA_RARE, target: 1, ultraRare: true, getValue: flag('unc') },
  { id: 'elder', name: 'Elder', description: 'Be one of the first 5,000 members.', category: CATEGORIES.ULTRA_RARE, target: 1, ultraRare: true, getValue: flag('elder') },
];

const ACHIEVEMENTS_BY_ID = new Map(ACHIEVEMENTS.map((def) => [def.id, def]));

function getAchievementDefinition(id) {
  return ACHIEVEMENTS_BY_ID.get(id) || null;
}

module.exports = {
  ACHIEVEMENTS,
  ACHIEVEMENTS_BY_ID,
  getAchievementDefinition,
};

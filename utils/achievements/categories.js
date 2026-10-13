const CATEGORIES = {
  XP_LEVELS: 'XP & Levels',
  MESSAGES: 'Messages',
  ACTIVITY: 'Activity Days & Streaks',
  CHANNELS: 'Channels',
  SNIPES_EDITS: 'Snipes & Edits',
  SOCIAL: 'Social',
  VOICE: 'Voice',
  TIME_BASED: 'Time-Based',
  BOT_USAGE: 'Bot Usage',
  META: 'Meta',
  HIDDEN: 'Hidden',
  ULTRA_RARE: 'Ultra-Rare',
};

// Order controls page order in the /achievements command.
const CATEGORY_ORDER = [
  CATEGORIES.XP_LEVELS,
  CATEGORIES.MESSAGES,
  CATEGORIES.ACTIVITY,
  CATEGORIES.CHANNELS,
  CATEGORIES.SNIPES_EDITS,
  CATEGORIES.SOCIAL,
  CATEGORIES.VOICE,
  CATEGORIES.TIME_BASED,
  CATEGORIES.BOT_USAGE,
  CATEGORIES.META,
  CATEGORIES.HIDDEN,
  CATEGORIES.ULTRA_RARE,
];

// Discord embeds cap at 25 fields; the /achievements view embed uses one
// field for the category header plus one per achievement entry, so a
// category can hold up to 24 achievements per page before it would need
// real sub-pagination. This is shared with the achievements command and a
// test so a future category growing past this can't silently truncate
// entries off the bottom of the embed again (that's exactly what happened
// to "A Treat", the 12th of 12 Hidden achievements, under the old cap of 10).
const MAX_ACHIEVEMENTS_PER_PAGE = 24;

module.exports = { CATEGORIES, CATEGORY_ORDER, MAX_ACHIEVEMENTS_PER_PAGE };

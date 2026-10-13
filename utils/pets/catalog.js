// Rarity theming and pet image paths
const { CATEGORIES } = require('../achievements/categories');
const { countUnlockedInCategory, hasUnlockedAllInCategory } = require('../achievements/engine');

const RARITY_THEME = {
  Common: { color: '#B5B8C5', glow: 'rgba(181,184,197,0.55)', label: 'COMMON' },
  Rare: { color: '#3B9CFF', glow: 'rgba(59,156,255,0.55)', label: 'RARE' },
  Epic: { color: '#A64DFF', glow: 'rgba(166,77,255,0.6)', label: 'EPIC' },
  Legendary: { color: '#FFA83B', glow: 'rgba(255,168,59,0.65)', label: 'LEGENDARY' },
  Mythic: { color: '#FF4D8D', glow: 'rgba(255,77,141,0.65)', label: 'MYTHIC' },
  Divine: { color: '#FFE066', glow: 'rgba(255,224,102,0.75)', label: 'DIVINE' },
};

const PET_IMAGE_PATHS = {
  rabbit: '/assets/pets/rabbit.png',
  silverfish: '/assets/pets/silverfish.png',
  endermite: '/assets/pets/endermite.png',
  blaze: '/assets/pets/blaze.png',
  'fnaf-freddy': '/assets/pets/fnaf-freddy.png',
  'ender-dragon': '/assets/pets/ender-dragon.png',
  bee: '/assets/pets/bee.png',
  wolf: '/assets/pets/wolf.png',
  bunny: '/assets/pets/bunny.png',
  cheetah: '/assets/pets/cheetah.png',
  phoenix: '/assets/pets/phoenix.png',
  raccoon: '/assets/pets/raccoon.png',
  yeti: '/assets/pets/yeti.png',
  squirrel: '/assets/pets/squirrel.png',
  turtle: '/assets/pets/turtle.png',
  cat: '/assets/pets/cat.png',
  fox: '/assets/pets/fox.png',
  firefly: '/assets/pets/firefly.png',
};

/** Formats a 0..1 fraction as a trimmed percentage string, e.g. 0.003 -> "0.3%". */
function formatPercent(value) {
  return `${Number(((value || 0) * 100).toFixed(1))}%`;
}

// Fallback procedural drawing functions for when images fail to load
function drawRabbitFallback(ctx, { cx, cy, r }) {
  const body = '#EDEDED';
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.15, r * 0.62, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx - r * 0.28, cy - r * 0.55, r * 0.14, r * 0.42, -0.15, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + r * 0.28, cy - r * 0.55, r * 0.14, r * 0.42, 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#F7B6C6';
  ctx.beginPath(); ctx.ellipse(cx - r * 0.28, cy - r * 0.5, r * 0.06, r * 0.24, -0.15, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + r * 0.28, cy - r * 0.5, r * 0.06, r * 0.24, 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2A2A2E';
  ctx.beginPath(); ctx.arc(cx - r * 0.18, cy + r * 0.05, r * 0.06, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r * 0.18, cy + r * 0.05, r * 0.06, 0, Math.PI * 2); ctx.fill();
}

function drawSilverfishFallback(ctx, { cx, cy, r }) {
  ctx.fillStyle = '#C9CDCF';
  for (let i = 0; i < 4; i += 1) {
    const segX = cx + (i - 1.5) * r * 0.32;
    ctx.beginPath(); ctx.ellipse(segX, cy, r * 0.22, r * 0.34, 0, 0, Math.PI * 2); ctx.fill();
  }
}

const PET_FALLBACK_ART = {
  rabbit: drawRabbitFallback,
  silverfish: drawSilverfishFallback,
};

const PETS = [
  {
    id: 'rabbit',
    name: 'Rabbit',
    emoji: '🐇',
    rarity: 'Common',
    unlock: 'Reach a 7-day claim streak.',
    unlockCheck: ({ progress }) => progress.claim.longestStreak >= 7,
    description: 'A tiny SkyBlock rabbit that keeps your daily routine moving.',
    shinyChance: 0.02,
    trick: { name: 'Carrot Hop', flavor: (n) => `${n} hops in a circle and flops over dramatically.`, bonusXp: 25 },
    levels: [
      { bond: 0, flatXp: 10, multiplier: 0, title: 'Sleepy Kit' },
      { bond: 7, flatXp: 20, multiplier: 0, title: 'Field Hopper' },
      { bond: 21, flatXp: 35, multiplier: 0, title: 'Golden-Foot Rabbit' },
    ],
  },
  {
    id: 'silverfish',
    name: 'Silverfish',
    emoji: '🐛',
    rarity: 'Rare',
    unlock: 'Unlock Collector.',
    unlockCheck: ({ progress }) => progress.unlocked.some((entry) => entry.id === 'collector'),
    description: 'A stubborn little miner that rewards careful consistency.',
    shinyChance: 0.03,
    trick: { name: 'Stone Burrow', flavor: (n) => `${n} tunnels through a wall and pops out somewhere unexpected.`, bonusXp: 40 },
    levels: [
      { bond: 0, flatXp: 0, multiplier: 0.03, title: 'Wall Nibbler' },
      { bond: 7, flatXp: 0, multiplier: 0.05, title: 'Stone Borer' },
      { bond: 21, flatXp: 0, multiplier: 0.08, title: 'Deep Delver' },
    ],
  },
  {
    id: 'endermite',
    name: 'Endermite',
    emoji: '🪱',
    rarity: 'Epic',
    unlock: 'Reach Prestige I.',
    unlockCheck: ({ userlevels }) => (userlevels?.prestige || 0) >= 1,
    description: 'An unstable visitor from The End that multiplies daily claim XP.',
    shinyChance: 0.04,
    trick: { name: 'Blink Step', flavor: (n) => `${n} teleports behind you. Nothing personnel.`, bonusXp: 55 },
    levels: [
      { bond: 0, flatXp: 0, multiplier: 0.1, title: 'Flickering Mite' },
      { bond: 7, flatXp: 0, multiplier: 0.15, title: 'Void Twitcher' },
      { bond: 21, flatXp: 0, multiplier: 0.2, title: 'Unstable Rift Mite' },
    ],
  },
  {
    id: 'blaze',
    name: 'Blaze',
    emoji: '🔥',
    rarity: 'Legendary',
    unlock: 'Reach Prestige III.',
    unlockCheck: ({ userlevels }) => (userlevels?.prestige || 0) >= 3,
    description: 'A Nether companion that adds a little heat to every claim.',
    shinyChance: 0.05,
    trick: { name: 'Ember Spin', flavor: (n) => `${n} spins into a small fire tornado, singeing absolutely nothing important.`, bonusXp: 90 },
    levels: [
      { bond: 0, flatXp: 50, multiplier: 0, title: 'Smoldering Rod' },
      { bond: 7, flatXp: 80, multiplier: 0, title: 'Nether Sentinel' },
      { bond: 21, flatXp: 120, multiplier: 0, title: 'Infernal Warden' },
    ],
  },
  {
    id: 'fnaf-freddy',
    name: 'Freddy Fazbear',
    emoji: '🦇',
    rarity: 'Mythic',
    unlock: 'Unlock A Treat.',
    unlockCheck: ({ progress }) => progress.unlocked.some((entry) => entry.id === 'a-treat'),
    description: 'A suspiciously nocturnal mascot from the channel after dark.',
    shinyChance: 0.06,
    trick: { name: 'Midnight Jingle', flavor: (n) => `${n} plays a jingle. The lights flicker once. You do not ask why.`, bonusXp: 130 },
    levels: [
      { bond: 0, flatXp: 0, multiplier: 0.04, globalMultiplier: 0.005, title: 'Stage Understudy' },
      { bond: 7, flatXp: 0, multiplier: 0.06, globalMultiplier: 0.01, title: 'Nightshift Regular' },
      { bond: 21, flatXp: 0, multiplier: 0.08, globalMultiplier: 0.015, title: "It's Me" },
    ],
  },
  {
    id: 'ender-dragon',
    name: 'Ender Dragon',
    emoji: '🐉',
    rarity: 'Divine',
    unlock: 'Reach Prestige V.',
    unlockCheck: ({ userlevels }) => (userlevels?.prestige || 0) >= 5,
    description: 'A server-wide presence. Its roar gives every active member a small XP buff.',
    shinyChance: 0.08,
    trick: { name: 'Sky Roar', flavor: (n) => `${n} lets out a roar that echoes across every channel in the server.`, bonusXp: 200 },
    levels: [
      { bond: 0, flatXp: 100, multiplier: 0, globalMultiplier: 0.01, title: 'Hatchling of the End' },
      { bond: 7, flatXp: 150, multiplier: 0, globalMultiplier: 0.02, title: 'Obsidian Wing' },
      { bond: 21, flatXp: 250, multiplier: 0, globalMultiplier: 0.03, title: 'Sovereign of the End' },
    ],
  },
  {
    id: 'bee',
    name: 'Bee',
    emoji: '🐝',
    rarity: 'Common',
    mechanic: 'bee',
    unlock: 'Unlock 10 achievements.',
    unlockCheck: ({ progress }) => progress.unlocked.length >= 10,
    description: 'Occasionally leaves a flower on your messages — react back quickly for a treat.',
    shinyChance: 0.02,
    trick: { name: 'Pollen Dance', flavor: (n) => `${n} does a little waggle dance. Somewhere, a flower blooms.`, bonusXp: 25 },
    describeAbility: (stats) => `${stats.reactionXp} XP for a prompt flower reply`,
    levels: [
      { bond: 0, flatXp: 0, multiplier: 0, globalMultiplier: 0, reactionXp: 10, title: 'Worker Bee' },
      { bond: 5, flatXp: 0, multiplier: 0, globalMultiplier: 0, reactionXp: 20, title: 'Pollen Courier' },
      { bond: 12, flatXp: 0, multiplier: 0, globalMultiplier: 0, reactionXp: 40, title: 'Hive Regular' },
      { bond: 25, flatXp: 0, multiplier: 0, globalMultiplier: 0, reactionXp: 60, title: 'Honey Guard' },
      { bond: 45, flatXp: 0, multiplier: 0, globalMultiplier: 0, reactionXp: 80, title: "Queen's Favorite" },
    ],
  },
  {
    id: 'wolf',
    name: 'Wolf',
    emoji: '🐺',
    rarity: 'Common',
    mechanic: 'wolf',
    unlock: 'Earn 3 achievements from the Social category.',
    unlockCheck: ({ progress }) => countUnlockedInCategory(progress, CATEGORIES.SOCIAL) >= 3,
    description: 'Loyal to a fault — link it to another member to share a slice of your XP with them.',
    shinyChance: 0.02,
    trick: { name: 'Pack Howl', flavor: (n) => `${n} howls, and for a moment the whole server feels like a pack.`, bonusXp: 25 },
    describeAbility: (stats) => `Shares ${formatPercent(stats.sharePercent)} of your XP with your linked member`,
    levels: [
      { bond: 0, flatXp: 0, multiplier: 0, globalMultiplier: 0, sharePercent: 0.03, title: 'Lone Pup' },
      { bond: 5, flatXp: 0, multiplier: 0, globalMultiplier: 0, sharePercent: 0.06, title: 'Packmate' },
      { bond: 12, flatXp: 0, multiplier: 0, globalMultiplier: 0, sharePercent: 0.09, title: 'Trail Runner' },
      { bond: 25, flatXp: 0, multiplier: 0, globalMultiplier: 0, sharePercent: 0.12, title: 'Pack Leader' },
      { bond: 45, flatXp: 0, multiplier: 0, globalMultiplier: 0, sharePercent: 0.15, title: 'Alpha' },
    ],
  },
  {
    id: 'bunny',
    name: 'Bunny',
    emoji: '🐰',
    rarity: 'Common',
    mechanic: 'bunny',
    unlock: 'Claim a daily streak.',
    unlockCheck: ({ progress }) => progress.claim.totalClaims >= 1,
    description: 'Restless and lucky — every hour it has a small chance to reopen your daily claim early.',
    shinyChance: 0.02,
    trick: { name: 'Lucky Hop', flavor: (n) => `${n} hops in three quick circles for good luck.`, bonusXp: 25 },
    describeAbility: (stats) => `${formatPercent(stats.bonusClaimChance)} chance per hour for a bonus streak claim`,
    levels: [
      { bond: 0, flatXp: 0, multiplier: 0, globalMultiplier: 0, bonusClaimChance: 0.01, title: 'Twitchy Kit' },
      { bond: 5, flatXp: 0, multiplier: 0, globalMultiplier: 0, bonusClaimChance: 0.03, title: 'Lucky Foot' },
      { bond: 12, flatXp: 0, multiplier: 0, globalMultiplier: 0, bonusClaimChance: 0.05, title: 'Four-Leaf Hopper' },
      { bond: 25, flatXp: 0, multiplier: 0, globalMultiplier: 0, bonusClaimChance: 0.10, title: "Fortune's Favorite" },
      { bond: 45, flatXp: 0, multiplier: 0, globalMultiplier: 0, bonusClaimChance: 0.15, title: 'Jackpot Rabbit' },
    ],
  },
  {
    id: 'cheetah',
    name: 'Cheetah',
    emoji: '🐆',
    rarity: 'Rare',
    mechanic: 'cheetah',
    unlock: 'Earn 50 achievements.',
    unlockCheck: ({ progress }) => progress.unlocked.length >= 50,
    description: 'Built for bursts — rapid-fire messages still earn a little XP even on cooldown.',
    shinyChance: 0.03,
    trick: { name: 'Sprint Burst', flavor: (n) => `${n} blurs across the room and skids to a stop, very pleased.`, bonusXp: 40 },
    describeAbility: (stats) => `+${stats.cooldownBonusXp} XP for rapid-fire messages`,
    levels: [
      { bond: 0, flatXp: 0, multiplier: 0, globalMultiplier: 0, cooldownBonusXp: 1, title: 'Quick Cub' },
      { bond: 5, flatXp: 0, multiplier: 0, globalMultiplier: 0, cooldownBonusXp: 3, title: 'Sprinter' },
      { bond: 12, flatXp: 0, multiplier: 0, globalMultiplier: 0, cooldownBonusXp: 5, title: 'Flash Runner' },
      { bond: 25, flatXp: 0, multiplier: 0, globalMultiplier: 0, cooldownBonusXp: 7, title: 'Blur' },
      { bond: 45, flatXp: 0, multiplier: 0, globalMultiplier: 0, cooldownBonusXp: 9, title: 'Sound Barrier' },
    ],
  },
  {
    id: 'phoenix',
    name: 'Phoenix',
    emoji: '🐦‍🔥',
    rarity: 'Rare',
    mechanic: 'phoenix',
    unlock: 'Earn the "Two Weeks Strong" achievement.',
    unlockCheck: ({ progress }) => progress.unlocked.some((entry) => entry.id === 'two-weeks-strong'),
    description: 'Rises from a missed day — occasionally saves your streak from breaking.',
    shinyChance: 0.03,
    trick: { name: 'Ember Rebirth', flavor: (n) => `${n} bursts into flame and steps out of the ashes, unbothered.`, bonusXp: 40 },
    describeAbility: (stats) => `Saves your streak from breaking once every ${stats.saveCooldownDays}d`,
    levels: [
      { bond: 0, flatXp: 0, multiplier: 0, globalMultiplier: 0, saveCooldownDays: 30, title: 'Smoldering Chick' },
      { bond: 5, flatXp: 0, multiplier: 0, globalMultiplier: 0, saveCooldownDays: 24, title: 'Ember Fledgling' },
      { bond: 12, flatXp: 0, multiplier: 0, globalMultiplier: 0, saveCooldownDays: 18, title: 'Rising Flame' },
      { bond: 25, flatXp: 0, multiplier: 0, globalMultiplier: 0, saveCooldownDays: 12, title: 'Undying Ember' },
      { bond: 45, flatXp: 0, multiplier: 0, globalMultiplier: 0, saveCooldownDays: 7, title: 'Eternal Phoenix' },
    ],
  },
  {
    id: 'raccoon',
    name: 'Raccoon',
    emoji: '🦝',
    rarity: 'Rare',
    unlock: 'Earn the "Limit Breaker" achievement.',
    unlockCheck: ({ progress }) => progress.unlocked.some((entry) => entry.id === 'limit-breaker'),
    description: 'A crafty little hoarder that skims a bit extra off every message.',
    shinyChance: 0.03,
    trick: { name: 'Trash Raid', flavor: (n) => `${n} rummages through a bin and emerges triumphant with a shiny bottle cap.`, bonusXp: 40 },
    levels: [
      { bond: 0, flatXp: 0, multiplier: 0.02, globalMultiplier: 0, title: 'Bandit Kit' },
      { bond: 5, flatXp: 0, multiplier: 0.04, globalMultiplier: 0, title: 'Dumpster Diver' },
      { bond: 12, flatXp: 0, multiplier: 0.06, globalMultiplier: 0, title: 'Night Prowler' },
      { bond: 25, flatXp: 0, multiplier: 0.08, globalMultiplier: 0, title: 'Masked Marauder' },
      { bond: 45, flatXp: 0, multiplier: 0.10, globalMultiplier: 0, title: 'Trash Panda King' },
    ],
  },
  {
    id: 'yeti',
    name: 'Yeti',
    emoji: '❄️',
    rarity: 'Epic',
    mechanic: 'yeti',
    unlock: 'Earn the "Back From the Dead" achievement.',
    unlockCheck: ({ progress }) => progress.unlocked.some((entry) => entry.id === 'back-from-the-dead'),
    description: "Builds up a frozen charge the longer you're away, thawing out as you message again.",
    shinyChance: 0.04,
    trick: { name: 'Avalanche Shake', flavor: (n) => `${n} shakes off a mountain of snow and lets out a booming roar.`, bonusXp: 55 },
    describeAbility: (stats) => `Up to +${stats.chargeCapPercent}% XP when returning from inactivity`,
    levels: [
      { bond: 0, flatXp: 0, multiplier: 0, globalMultiplier: 0, chargeCapPercent: 20, title: 'Shivering Cub' },
      { bond: 5, flatXp: 0, multiplier: 0, globalMultiplier: 0, chargeCapPercent: 25, title: 'Frosted Wanderer' },
      { bond: 12, flatXp: 0, multiplier: 0, globalMultiplier: 0, chargeCapPercent: 30, title: 'Glacier Dweller' },
      { bond: 25, flatXp: 0, multiplier: 0, globalMultiplier: 0, chargeCapPercent: 35, title: 'Deep Freeze' },
      { bond: 45, flatXp: 0, multiplier: 0, globalMultiplier: 0, chargeCapPercent: 40, title: 'Ancient Ice Titan' },
    ],
  },
  {
    id: 'squirrel',
    name: 'Squirrel',
    emoji: '🐿️',
    rarity: 'Epic',
    mechanic: 'squirrel',
    unlock: 'Unlock every achievement in the Snipes & Edits category.',
    unlockCheck: ({ progress }) => hasUnlockedAllInCategory(progress, CATEGORIES.SNIPES_EDITS),
    description: 'Stashes away a bit of XP from every message, with a chance to spill the whole hoard.',
    shinyChance: 0.04,
    trick: { name: 'Acorn Avalanche', flavor: (n) => `${n} dumps an entire winter's worth of acorns on the floor.`, bonusXp: 55 },
    describeAbility: (stats) => `${formatPercent(stats.hoardDropChance)} chance to release its hoarded XP`,
    levels: [
      { bond: 0, flatXp: 0, multiplier: 0, globalMultiplier: 0, hoardDropChance: 0.20, title: 'Twitchy Stasher' },
      { bond: 5, flatXp: 0, multiplier: 0, globalMultiplier: 0, hoardDropChance: 0.15, title: 'Acorn Collector' },
      { bond: 12, flatXp: 0, multiplier: 0, globalMultiplier: 0, hoardDropChance: 0.12, title: 'Patient Hoarder' },
      { bond: 25, flatXp: 0, multiplier: 0, globalMultiplier: 0, hoardDropChance: 0.08, title: 'Vault Keeper' },
      { bond: 45, flatXp: 0, multiplier: 0, globalMultiplier: 0, hoardDropChance: 0.03, title: 'Legendary Stockpiler' },
    ],
  },
  {
    id: 'turtle',
    name: 'Turtle',
    emoji: '🐢',
    rarity: 'Epic',
    mechanic: 'turtle',
    unlock: 'Unlock every achievement in the Messages category.',
    unlockCheck: ({ progress }) => hasUnlockedAllInCategory(progress, CATEGORIES.MESSAGES),
    description: 'Slow to start, but picks up steam — every 5 messages in the last hour adds a bit more XP.',
    shinyChance: 0.04,
    trick: { name: 'Shell Spin', flavor: (n) => `${n} tucks in and spins in a slow, dignified circle.`, bonusXp: 55 },
    describeAbility: (stats) => `+${formatPercent(stats.bonusPerFive)} XP per 5 messages/hr (max 20%)`,
    levels: [
      { bond: 0, flatXp: 0, multiplier: 0, globalMultiplier: 0, bonusPerFive: 0.003, title: 'Hatchling' },
      { bond: 5, flatXp: 0, multiplier: 0, globalMultiplier: 0, bonusPerFive: 0.006, title: 'Steady Pace' },
      { bond: 12, flatXp: 0, multiplier: 0, globalMultiplier: 0, bonusPerFive: 0.01, title: 'Shell Veteran' },
      { bond: 25, flatXp: 0, multiplier: 0, globalMultiplier: 0, bonusPerFive: 0.02, title: 'Marathon Shell' },
      { bond: 45, flatXp: 0, multiplier: 0, globalMultiplier: 0, bonusPerFive: 0.025, title: 'Ancient Tortoise' },
    ],
  },
  {
    id: 'cat',
    name: 'Cat',
    emoji: '🐱',
    rarity: 'Legendary',
    mechanic: 'cat',
    unlock: 'Earn the "Server Historian" achievement.',
    unlockCheck: ({ progress }) => progress.unlocked.some((entry) => entry.id === 'server-historian'),
    description: 'Impossibly lucky — has a small chance to double the XP that levels you up.',
    shinyChance: 0.05,
    trick: { name: 'Nine Lives Leap', flavor: (n) => `${n} leaps off something dangerously tall and lands perfectly fine.`, bonusXp: 90 },
    describeAbility: (stats) => `${formatPercent(stats.doubleChance)} chance to double a level-up's XP`,
    levels: [
      { bond: 0, flatXp: 0, multiplier: 0, globalMultiplier: 0, doubleChance: 0.003, title: 'Black Cat' },
      { bond: 5, flatXp: 0, multiplier: 0, globalMultiplier: 0, doubleChance: 0.006, title: 'Lucky Charm' },
      { bond: 12, flatXp: 0, multiplier: 0, globalMultiplier: 0, doubleChance: 0.01, title: "Fortune's Cat" },
      { bond: 25, flatXp: 0, multiplier: 0, globalMultiplier: 0, doubleChance: 0.02, title: 'Nine Lives' },
      { bond: 45, flatXp: 0, multiplier: 0, globalMultiplier: 0, doubleChance: 0.025, title: 'Living Legend' },
    ],
  },
  {
    id: 'fox',
    name: 'Fox',
    emoji: '🦊',
    rarity: 'Legendary',
    mechanic: 'fox',
    unlock: 'Earn the "No Ceiling" achievement.',
    unlockCheck: ({ progress }) => progress.unlocked.some((entry) => entry.id === 'no-ceiling'),
    description: "Slips past the rules more often than not — has a chance to skip the XP cooldown entirely.",
    shinyChance: 0.05,
    trick: { name: 'Silent Slip', flavor: (n) => `${n} slips past unnoticed and reappears somewhere it shouldn't be.`, bonusXp: 90 },
    describeAbility: (stats) => `${formatPercent(stats.bypassChance)} chance to skip the XP cooldown`,
    levels: [
      { bond: 0, flatXp: 0, multiplier: 0, globalMultiplier: 0, bypassChance: 0.06, title: 'Sly Kit' },
      { bond: 5, flatXp: 0, multiplier: 0, globalMultiplier: 0, bypassChance: 0.09, title: 'Quick Slipper' },
      { bond: 12, flatXp: 0, multiplier: 0, globalMultiplier: 0, bypassChance: 0.12, title: 'Shadow Fox' },
      { bond: 25, flatXp: 0, multiplier: 0, globalMultiplier: 0, bypassChance: 0.15, title: 'Trickster' },
      { bond: 45, flatXp: 0, multiplier: 0, globalMultiplier: 0, bypassChance: 0.18, title: 'No Ceiling' },
    ],
  },
  {
    id: 'firefly',
    name: 'Firefly',
    emoji: '✨',
    rarity: 'Legendary',
    unlock: 'Earn the "Overflow" achievement.',
    unlockCheck: ({ progress }) => progress.unlocked.some((entry) => entry.id === 'overflow'),
    description: 'A tiny glow that lifts XP gains for the entire server.',
    shinyChance: 0.05,
    trick: { name: 'Glow Trail', flavor: (n) => `${n} traces a glowing trail through the air that lingers a moment too long.`, bonusXp: 90 },
    levels: [
      { bond: 0, flatXp: 0, multiplier: 0, globalMultiplier: 0.01, title: 'Faint Glow' },
      { bond: 5, flatXp: 0, multiplier: 0, globalMultiplier: 0.02, title: 'Steady Spark' },
      { bond: 12, flatXp: 0, multiplier: 0, globalMultiplier: 0.03, title: 'Bright Flicker' },
      { bond: 25, flatXp: 0, multiplier: 0, globalMultiplier: 0.04, title: 'Radiant Swarm' },
      { bond: 45, flatXp: 0, multiplier: 0, globalMultiplier: 0.05, title: 'Living Lantern' },
    ],
  },
];

const PETS_BY_ID = new Map(PETS.map((pet) => [pet.id, pet]));

function getPetDefinition(id) {
  return PETS_BY_ID.get(id) || null;
}

function getPetLevel(definition, bond) {
  let level = 0;
  for (let index = 0; index < definition.levels.length; index += 1) {
    if (bond >= definition.levels[index].bond) level = index;
  }
  return level;
}

function getPetStats(definition, bond) {
  return definition.levels[getPetLevel(definition, bond)];
}

function getPetImagePath(id) {
  return PET_IMAGE_PATHS[id] || null;
}

function getPetFallbackArt(id) {
  return PET_FALLBACK_ART[id] || null;
}

function getRarityTheme(rarity) {
  return RARITY_THEME[rarity] || RARITY_THEME.Common;
}

/**
 * One-line ability description for a pet at its current stage. Pets with a
 * bespoke `describeAbility` (chance/hoard/sharing mechanics) use that;
 * everything else falls back to summarizing flatXp/multiplier/globalMultiplier
 * directly, which covers every pet that only uses those three fields.
 */
function describePetAbility(pet, stats) {
  if (typeof pet.describeAbility === 'function') return pet.describeAbility(stats);
  const parts = [];
  if (stats.flatXp) parts.push(`+${stats.flatXp} daily XP`);
  if (stats.multiplier) parts.push(`+${Math.round(stats.multiplier * 100)}% personal XP`);
  if (stats.globalMultiplier) parts.push(`+${Math.round(stats.globalMultiplier * 100)}% server XP`);
  return parts.join(' • ') || 'No bonus';
}

module.exports = {
  PETS,
  PETS_BY_ID,
  RARITY_THEME,
  getPetDefinition,
  getPetLevel,
  getPetStats,
  getPetImagePath,
  getPetFallbackArt,
  getRarityTheme,
  describePetAbility,
};

const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const Canvas = require('canvas');
const achievements = require('../../utils/achievements/store');
const { ACHIEVEMENTS } = require('../../utils/achievements/definitions');
const pets = require('../../utils/pets/store');
const { getPetDefinition } = require('../../utils/pets/catalog');
const { getLevelThresholds } = require('../../utils/levelThresholds');
const { renderRankCard } = require('../../utils/rank/render');

const PRESTIGE_XP = 65550;
const NEARBY_WINDOW = 2; // ranks shown above/below the target

function formatDate(date) {
  if (!date) return 'Unknown';
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

async function loadAvatarImage(url) {
  try {
    return await Canvas.loadImage(url);
  } catch (error) {
    console.error(`[Rank] Failed to load avatar: ${error.message}`);
    return null;
  }
}

async function getNearbyRanks(userlevelsCollection, targetMemberId, targetRank) {
  const skip = Math.max(0, targetRank - 1 - NEARBY_WINDOW);
  const limit = NEARBY_WINDOW * 2 + 1;
  const docs = await userlevelsCollection
    .find({}, { projection: { memberId: 1, username: 1, globalName: 1, totalXP: 1 } })
    .sort({ totalXP: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  return docs.map((doc, index) => ({
    rank: skip + index + 1,
    username: doc.globalName || doc.username || 'Unknown',
    totalXp: doc.totalXP || 0,
    isTarget: doc.memberId === targetMemberId,
  }));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription("View a member's XP rank, level, and stats")
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Member to view (defaults to you)')
      .setRequired(false)),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    if (targetUser.bot) {
      await interaction.reply({ content: 'Bots do not have XP ranks.', ephemeral: true });
      return;
    }

    await interaction.deferReply();

    try {
      const userlevelsCollection = achievements.getMongoDB().collection('userlevels');
      const [userData, progress, petProfile, member, thresholds] = await Promise.all([
        userlevelsCollection.findOne({ memberId: targetUser.id }),
        achievements.getProgress(targetUser.id),
        pets.getPetProfile(targetUser.id),
        interaction.guild?.members.fetch(targetUser.id).catch(() => null),
        getLevelThresholds(),
      ]);

      if (!userData) {
        await interaction.editReply({ content: `${targetUser.username} has no XP data yet.` });
        return;
      }

      const totalXp = userData.totalXP || 0;
      const level = userData.level || 0;
      const prestige = userData.prestige || 0;
      const effectiveXp = totalXp - prestige * PRESTIGE_XP;
      const prevLevelXp = thresholds.get(level) ?? 0;
      const nextLevelXp = thresholds.get(level + 1);
      const levelProgressRatio = nextLevelXp != null && nextLevelXp !== prevLevelXp
        ? Math.min(1, Math.max(0, (effectiveXp - prevLevelXp) / (nextLevelXp - prevLevelXp)))
        : 1;

      const [rank, totalRanked] = await Promise.all([
        userlevelsCollection.countDocuments({ totalXP: { $gt: totalXp } }).then((n) => n + 1),
        userlevelsCollection.countDocuments({}),
      ]);

      const nearbyRanks = await getNearbyRanks(userlevelsCollection, targetUser.id, rank);

      const equippedPets = (petProfile.pets.equipped || [])
        .map((id) => getPetDefinition(id))
        .filter(Boolean);

      const avatarUrl = targetUser.displayAvatarURL({ extension: 'png', size: 256 });
      const avatarImage = await loadAvatarImage(avatarUrl);

      const buffer = await renderRankCard({
        user: {
          username: member?.displayName || targetUser.globalName || targetUser.username,
          handle: targetUser.username,
          id: targetUser.id,
        },
        avatarImage,
        stats: {
          totalXp,
          level,
          prestige,
          effectiveXp,
          prevLevelXp,
          nextLevelXp: nextLevelXp ?? null,
          levelProgressRatio,
          rank,
          totalRanked,
          achievementsUnlocked: progress.unlocked.length,
          achievementsTotal: ACHIEVEMENTS.length,
          messagesTotal: progress.messages.total,
          claimCurrentStreak: progress.claim.currentStreak,
          claimLongestStreak: progress.claim.longestStreak,
          voiceMinutes: progress.voice.totalMinutes,
          nearbyRanks,
          equippedPets,
          joinedServerAt: formatDate(member?.joinedAt),
          accountCreatedAt: formatDate(targetUser.createdAt),
        },
      });

      const attachment = new AttachmentBuilder(buffer, { name: 'rank-card.png' });
      const embed = new EmbedBuilder()
        .setColor('#FF304F')
        .setImage('attachment://rank-card.png');

      await interaction.editReply({ embeds: [embed], files: [attachment] });
    } catch (error) {
      console.error('Error building rank card:', error);
      await interaction.editReply({ content: 'Could not load rank data.' });
    }
  },
};

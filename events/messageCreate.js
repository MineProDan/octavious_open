const levelLog = require('../utils/levelLog');
const { Events } = require('discord.js');
const { ObjectId } = require('mongodb');
const { mongoDB } = require('../index');
const achievements = require('../utils/achievements/store');
const pets = require('../utils/pets/store');
const petMechanics = require('../utils/pets/mechanics');
const { getLevelThresholds } = require('../utils/levelThresholds');
const activityStats = require('../utils/activityStats');
const { syncMemberColors } = require('../utils/colorRoles/sync');

const GLOBAL_XP_ID = new ObjectId('6a974fd358a46c394946cb6b');
const XP_COOLDOWN_MS = 60 * 1000;

function getRandomMessageXp() {
	return Math.floor(Math.random() * 31) + 45;
}

module.exports = {
	name: Events.MessageCreate,
	async execute(message) {
		if (!message.guild || message.author.bot) return;
        if(message.guild.id !== process.env.GUILDID) return;

		const isThread = typeof message.channel.isThread === 'function' && message.channel.isThread();
		activityStats.recordMessage({
			memberId: message.author.id,
			channelId: isThread ? message.channel.parentId : message.channel.id,
			hasAttachment: message.attachments.size > 0,
			isReply: Boolean(message.reference),
			isThread,
			at: message.createdAt,
		}).catch((error) => console.error('Error recording message activity stats:', error));

		const userlevels = mongoDB.collection('userlevels');
		const [globalXp, channelXp] = await Promise.all([
			mongoDB.collection('globalxp').findOne({ _id: GLOBAL_XP_ID }),
			mongoDB.collection('channelxpmult').findOne({
				$or: [
					{ channelid: message.channel.id },
					{ channelId: message.channel.id },
					{ _id: message.channel.id },
				],
			}),
		]);
		const globalMultiplier = Number(globalXp?.value) || 1;
		const channelMultiplier = Number(channelXp?.value ?? channelXp?.multiplier) || 1;
		const petProfile = await pets.getPetProfile(message.author.id);
		const personalPetMultiplier = pets.getPetBonuses(petProfile.progress).multiplier;
		const serverPetMultiplier = await pets.getGlobalPetMultiplier();
		const yetiPetBonus = petMechanics.getYetiChargeBonus(petProfile.progress.pets, Date.now());
		const turtlePetBonus = petMechanics.getTurtleRollingBonus(petProfile.progress.pets, Date.now());
		const baseXp = getRandomMessageXp();
		const bonusParts = [
			['global xp mult', globalMultiplier - 1],
			['channel mult', channelMultiplier - 1],
			['personal pets', personalPetMultiplier],
			['global pets', serverPetMultiplier],
			['yeti', yetiPetBonus],
			['turtle', turtlePetBonus],
		];
		const bonusTotal = bonusParts.reduce((sum, [, fraction]) => sum + fraction, 0);
		const amount = Math.floor(baseXp * (1 + bonusTotal));
		const xpBreakdown = [`${baseXp} base`, ...bonusParts
			.filter(([, fraction]) => fraction !== 0)
			.map(([label, fraction]) => `${fraction > 0 ? '+' : '-'}${Math.abs(baseXp * fraction).toFixed(1)} ${label} (${fraction > 0 ? '+' : '-'}${Math.abs(fraction * 100).toFixed(1)}%)`)]
			.join(' ');

		await userlevels.updateOne(
			{ memberId: message.author.id },
			{
				$setOnInsert: {
					totalXP: 0,
					level: 1,
					prestige: 0,
				},
			},
			{ upsert: true },
		);

		const cooldownExpiresAt = new Date(Date.now() - XP_COOLDOWN_MS);
		const foxBypass = petMechanics.rollFoxBypass(petProfile.progress.pets, Date.now(), { memberId: message.author.id });
		const xpFilter = foxBypass
			? { memberId: message.author.id }
			: {
				memberId: message.author.id,
				$or: [
					{ lastMessageXpAt: { $exists: false } },
					{ lastMessageXpAt: { $lte: cooldownExpiresAt } },
				],
			};
		const xpUpdate = await userlevels.updateOne(
			xpFilter,
			{
				$inc: { totalXP: amount },
				$set: { lastMessageXpAt: new Date() },
			},
		);

		if (xpUpdate.modifiedCount === 1) {
			levelLog(
				`Awarded ${amount} XP to ${message.author.tag} (${message.author.id}) in #${message.channel.name} [${xpBreakdown} = ${(baseXp * (1 + bonusTotal)).toFixed(1)}, floored to ${amount}]`,
			);

			const levelThresholds = await getLevelThresholds();
			const userData = await userlevels.findOne({ memberId: message.author.id });
			const effectiveXp = userData.totalXP - (userData.prestige * 65550);
			const nextLevel = userData.level + 1;
			const nextLevelXp = levelThresholds.get(nextLevel);

			await achievements.recordXpAward(message.author.id, { totalXP: userData.totalXP, at: message.createdAt }).catch((error) => console.error('Error recording XP achievement progress:', error));
			await achievements.recordDailyXpGain(message.author.id, amount).catch((error) => console.error('Error recording daily XP gain:', error));

			if (nextLevelXp !== undefined && effectiveXp >= nextLevelXp) {
				const isPrestige = nextLevel === 50;
				const levelUpdate = await userlevels.updateOne(
					{ memberId: message.author.id, level: userData.level },
					isPrestige
						? { $inc: { prestige: 1 }, $set: { level: 0 } }
						: { $inc: { level: 1 } },
				);

				if (levelUpdate.modifiedCount === 1) {
					if (isPrestige) {
						levelLog(
							`${message.author.tag} (${message.author.id}) prestiged to ${userData.prestige + 1}; level reset to 0 with ${userData.totalXP} total XP.`,
						);
						const member = message.member ?? await message.guild.members.fetch(message.author.id).catch(() => null);
						if (member) await syncMemberColors(member, { db: mongoDB }).catch((error) => console.error('Error syncing prestige roles:', error));
					} else {
						levelLog(
							`${message.author.tag} (${message.author.id}) reached level ${nextLevel} with ${effectiveXp} effective XP.`,
						);
					}
					await achievements.recordLevelUp(message.author.id, { at: message.createdAt }).catch((error) => console.error('Error recording level up achievement progress:', error));
					await petMechanics.tryCatDouble(message.author.id, petProfile.progress, amount).catch((error) => console.error('Error applying Cat double-XP:', error));
				}
			}

			await petMechanics.applyPostAwardMechanics(message.author.id, petProfile.progress, { amount, now: message.createdAt, message }).catch((error) => console.error('Error applying pet mechanics:', error));
		} else {
			levelLog(
				`Did not award XP to ${message.author.tag} (${message.author.id}); message cooldown is active.`,
			);
			await petMechanics.applyCheetahBonus(message.author.id, petProfile.progress, { now: Date.now() }).catch((error) => console.error('Error applying Cheetah bonus:', error));
		}

		try {
			const reference = message.reference ? await message.fetchReference().catch(() => null) : null;
			const mentionedUsers = [...message.mentions.users.values()].filter((user) => !user.bot && user.id !== message.author.id);

			await achievements.recordMessage(message.author.id, {
				channelId: message.channel.id,
				guildId: message.guild.id,
				content: message.content || '',
				hasAttachment: message.attachments.size > 0,
				isReply: Boolean(message.reference),
				replyAuthorId: reference?.author?.id ?? null,
				isReplyToSelf: reference?.author?.id === message.author.id,
				isThread: typeof message.channel.isThread === 'function' && message.channel.isThread(),
				at: message.createdAt,
			});

			for (const mentionedUser of mentionedUsers) {
				await achievements.recordMentionsReceived(mentionedUser.id);
			}

			if (reference?.author && !reference.author.bot && reference.author.id !== message.author.id) {
				const referencedMember = await message.guild.members.fetch(reference.author.id).catch(() => null);
				const joinedRecently = referencedMember?.joinedTimestamp && (Date.now() - referencedMember.joinedTimestamp) < 7 * 24 * 60 * 60 * 1000;
				if (joinedRecently) {
					await achievements.recordFirstResponder(message.author.id);
				}
			}
		} catch (error) {
			console.error('Error updating achievement progress:', error);
		}
	},
};
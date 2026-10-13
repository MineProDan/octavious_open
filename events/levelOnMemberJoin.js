const { Events } = require('discord.js');
const { mongoDB } = require('../index');
const achievements = require('../utils/achievements/store');
const activityStats = require('../utils/activityStats');
module.exports = {
	name: Events.GuildMemberAdd,
	async execute(member) {
		if(member.guild.id !== process.env.GUILDID) return;
		console.log(`New member joined: ${member.user.tag}`);
		if (!member.user.bot) {
			activityStats.recordJoin({ memberId: member.id, at: member.joinedAt || new Date() })
				.catch((error) => console.error('Error recording join activity stats:', error));
		}
		if (process.env.WELCOME_CHANNEL_ID) member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID)?.send(`${member.user.tag} joined the server!`);
		await mongoDB.collection('userlevels').insertOne({
			memberId: member.id,
			username: member.user.username,
			globalName: member.user.globalName,
			totalXP: 0,
			level: 1,
			prestige: 0,
			avatarHash: member.user.avatar,
			avatarUrl: member.user.displayAvatarURL({
				extension: 'png',
				size: 256,
			}),
			fetchedAt: new Date(),
		});

		try {
			await achievements.recordMemberJoin(member.id, {
				joinedAt: member.joinedAt || new Date(),
				joinPosition: member.guild.memberCount,
			});
		} catch (error) {
			console.error('Error recording member join achievement progress:', error);
		}
	}
};
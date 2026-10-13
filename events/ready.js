const { Events, ActivityType } = require('discord.js');
const { mongoClient, mongoDB } = require('../index');
const { setInterval } = require('node:timers');
const fetchRecentVideos = require ('../fetch_recent_yt');
const {
	evaluateLeaderboardAchievements,
	evaluateDailyChampion,
	migrateClaimFields,
} = require('../utils/achievements/store');
const { startClaimResetTimer } = require('../utils/achievements/claimTimer');
const { runBunnyBonusClaimPass } = require('../utils/pets/mechanics');
const { startWebJobWorker } = require('../utils/webJobs/worker');
const { ensureWebIndexes } = require('../utils/webJobs/indexes');
const activityStats = require('../utils/activityStats');
const automod = require('../utils/automod/store');
const { syncAllColorRoles } = require('../utils/colorRoles/sync');

module.exports = {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		console.log(`Logged in as ${client.user.tag}`);
		await mongoClient.connect();
		console.log('Connected to MongoDB');
		const migratedClaimFields = await migrateClaimFields();
		console.log(`Initialized daily claim fields for ${migratedClaimFields} existing achievement records.`);
		startClaimResetTimer((dateKey) => console.log(`Daily claim window reset for Pacific date ${dateKey}.`));

		// Jobs from the website ("Refresh my data" profile refreshes).
		await ensureWebIndexes(mongoDB).catch((error) => console.error('Error creating website job indexes:', error));
		startWebJobWorker({ db: mongoDB, client });

		// Rolling activity stats for the website's admin page. Marking live tells
		// the website's history backfill which hours now belong to the bot.
		await activityStats.ensureActivityIndexes(mongoDB).catch((error) => console.error('Error creating activity stats indexes:', error));
		await activityStats.markLive(mongoDB).catch((error) => console.error('Error marking activity stats live:', error));
		// Live AutoMod log for the website's AutoMod tab. lastSeenAt lets the
		// website tell staff whether live logging is currently running.
		await automod.ensureAutomodIndexes(mongoDB).catch((error) => console.error('Error creating AutoMod indexes:', error));
		await automod.markLive(mongoDB).catch((error) => console.error('Error marking AutoMod logging live:', error));
		setInterval(() => automod.markLive(mongoDB).catch(() => {}), 1000 * 60 * 10);

		async function runActivitySnapshot() {
			const guild = client.guilds.cache.get(process.env.GUILDID);
			if (!guild) return;
			await activityStats.snapshotGuild(guild, mongoDB).catch((error) => console.error('Error taking activity snapshot:', error));
			await activityStats.markLive(mongoDB).catch(() => {});
		}
		await runActivitySnapshot();
		setInterval(runActivitySnapshot, 1000 * 60 * 60); // hourly

		// Bring colour roles in line with stored prestige and achievements (catches
		// changes made while the bot was offline). Runs in the background.
		const colorGuild = client.guilds.cache.get(process.env.GUILDID);
		if (colorGuild) {
			syncAllColorRoles(colorGuild, mongoDB)
				.then(({ checked, changed }) => console.log(`Colour roles: checked ${checked} members, updated ${changed}.`))
				.catch((error) => console.error('Error syncing colour roles:', error));
		}

		async function setStatus() {
			await fetchRecentVideos.fetchRecentVideos(mongoClient, mongoDB);
			const title = await mongoDB.collection("live_data").findOne(
				{ _id: 'latest_video' },
				{ projection: { latestVidTitle: 1, _id: 0 } }
			).then(doc => doc?.latestVidTitle ?? null);
			
			if (!title) return;
			client.user.setActivity(
				`${title}`, 
				{ type: ActivityType.Watching },
			);
			console.log(`Status set to: Watching ${title}`);
		}
		// Run immediately on startup
        await setStatus();

        // Then run every 5 minutes
        setInterval(async () => {
            await setStatus();
        }, 1000 * 60 * 60); // 1 hour in milliseconds

        async function runLeaderboardAchievementChecks() {
            try {
                await evaluateLeaderboardAchievements();
                await evaluateDailyChampion();
            } catch (error) {
                console.error('Error evaluating leaderboard achievements:', error);
            }
        }

        await runLeaderboardAchievementChecks();
        setInterval(runLeaderboardAchievementChecks, 1000 * 60 * 60); // hourly

        async function runBunnyBonusClaimCheck() {
            try {
                const granted = await runBunnyBonusClaimPass();
                if (granted > 0) console.log(`Bunny granted ${granted} bonus daily claim(s) this hour.`);
            } catch (error) {
                console.error('Error running Bunny bonus claim pass:', error);
            }
        }

        setInterval(runBunnyBonusClaimCheck, 1000 * 60 * 60); // hourly

	},
};
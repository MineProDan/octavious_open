const { Client, GatewayIntentBits, Partials, REST, Routes, Events, Collection, PermissionFlagsBits } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const mongoClient = new MongoClient(process.env.MONGODB_URI);
const mongoDB = mongoClient.db(process.env.MONGODB_DB);

module.exports = {
  mongoClient,
  mongoDB
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildScheduledEvents,
    GatewayIntentBits.AutoModerationExecution,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember],
});

(async () => {
  try {
    await mongoClient.connect();
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
  }
})();

const originalConsoleLog = console.log.bind(console);
const originalConsoleError = console.error.bind(console);
const logChannelId = process.env.DISCORD_LOG_CHANNEL_ID;
// Level/XP logs can go to their own channel; they fall back to the main log channel.
const levelLogChannelId = process.env.DISCORD_LEVEL_LOG_CHANNEL_ID || logChannelId;
const discordClient = client;
const logChannels = new Map();

function formatLogMessage(args) {
	return args.map((arg) => {
		if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
		if (typeof arg === 'string') return arg;
		try {
			return JSON.stringify(arg);
		} catch {
			return String(arg);
		}
	}).join(' ');
}

function forwardLogToDiscord(args, channelId = logChannelId) {
	if (!channelId || !discordClient?.isReady()) return;

	const sendLog = (channel) => {
		if (!channel?.isTextBased()) return;
		channel.send(`[Octavious] ${formatLogMessage(args)}`.slice(0, 2000))
			.catch((error) => originalConsoleError('[Octavious] Failed to send log to Discord:', error));
	};

	const cached = logChannels.get(channelId);
	if (cached) {
		sendLog(cached);
		return;
	}

	discordClient.channels.fetch(channelId)
		.then((channel) => {
			logChannels.set(channelId, channel);
			sendLog(channel);
		})
		.catch((error) => originalConsoleError('[Octavious] Failed to find Discord log channel:', error));
}

console.log = (...args) => {
	originalConsoleLog('[Octavious]', ...args);
	forwardLogToDiscord(args);
};

console.level = (...args) => {
	originalConsoleLog('[Octavious]', ...args);
	forwardLogToDiscord(args, levelLogChannelId);
};

client.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);
for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));
for (const file of eventFiles) {
	const filePath = path.join(eventsPath, file);
	const event = require(filePath);
	if (event.once) {
		client.once(event.name, (...args) => event.execute(...args));
	} else {
		client.on(event.name, (...args) => event.execute(...args));
	}
}

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (!command || typeof command.autocomplete !== 'function') return;
    try {
      await command.autocomplete(interaction);
    } catch (error) {
      console.error(error);
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('achv-page:')) {
    const command = client.commands.get('achievements');
    try {
      await command.handleButton(interaction);
    } catch (error) {
      console.error(error);
    }
    return;
  }

  if (interaction.isStringSelectMenu()) {
    const [prefix, ...rest] = interaction.customId.split(':');

    if (prefix === 'achv-category') {
      const command = client.commands.get('achievements');
      try {
        await command.handleCategorySelect(interaction);
      } catch (error) {
        console.error(error);
      }
      return;
    }

    if (prefix === 'staffnoteadd-select') {
      const memberId = interaction.values[0];
      const member = await interaction.guild?.members.fetch(memberId).catch(() => null);
      if (!member) {
        await interaction.update({ content: 'That member is no longer available.', components: [], embeds: [] });
        return;
      }

      const storedData = interaction.message?.interactionMetadata || null;
      const originalReply = interaction.message?.content || 'Select a member to continue.';
      await interaction.update({
        content: `${originalReply}\nSelected: ${member.user.tag}`,
        components: [],
      });
      return;
    }

    if (prefix === 'staffnoteremove-select') {
      const [_, memberId, actorId] = interaction.customId.split(':');
      if (interaction.user.id !== actorId || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'This menu is restricted to the administrator who opened it.', ephemeral: true });
        return;
      }
      const noteId = interaction.values[0];
      const mongoDB = require('./index').mongoDB;
      const member = await interaction.guild?.members.fetch(memberId).catch(() => null);
      if (!member) {
        await interaction.update({ content: 'That member is no longer available.', components: [], embeds: [] });
        return;
      }

      const { ObjectId } = require('mongodb');
      const result = await mongoDB.collection('staff_notes').deleteOne({ _id: new ObjectId(noteId) });
      if (result.deletedCount === 1) {
        await interaction.update({ content: `Removed the selected note from ${member.user.tag}.`, components: [], embeds: [] });
      } else {
        await interaction.update({ content: `I could not remove that note from ${member.user.tag}.`, components: [], embeds: [] });
      }
      return;
    }

    if (prefix === 'pets-action') {
      const command = client.commands.get('pets');
      try {
        await command.handleActionSelect(interaction);
      } catch (error) {
        console.error(error);
      }
      return;
    }

    if (prefix === 'pets-rarity') {
      const command = client.commands.get('pets');
      try {
        await command.handleRaritySelect(interaction);
      } catch (error) {
        console.error(error);
      }
      return;
    }

  }

  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
    require('./utils/activityStats').recordCommand({ memberId: interaction.user.id, commandName: interaction.commandName })
      .catch((error) => console.error('Error recording command activity stats:', error));
    require('./utils/achievements/store').recordCommandUsage(interaction.user.id, interaction.commandName)
      .catch((error) => console.error('Error recording command-usage achievement progress:', error));
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: 'There was an error executing this command.', ephemeral: true });
  }
} );

client.login(process.env.DISCORD_TOKEN);

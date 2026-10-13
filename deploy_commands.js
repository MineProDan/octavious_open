const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const commands = [];
const globalCommands = [];
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			if(command.data.name==="latest") {
				globalCommands.push(command.data.toJSON());
			} else {
				commands.push(command.data.toJSON());
			}
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);
		const data = await rest.put(Routes.applicationGuildCommands(process.env.CLIENTID, process.env.GUILDID), { body: commands });
		console.log(`Successfully reloaded ${data.length} application (/) commands.`);

		console.log(`Started refreshing ${globalCommands.length} application (/) commands.`);
		const globaldata = await rest.put(Routes.applicationCommands(process.env.CLIENTID), { body: globalCommands });
		console.log(`Successfully reloaded ${globaldata.length} application (/) commands.`);
		console.log(globalCommands.map(command => command.name));
	} catch (error) {
		console.error(error);
	}
})();
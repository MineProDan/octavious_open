const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { ObjectId } = require('mongodb');

module.exports = {
	data: new SlashCommandBuilder().setName('changeglobalxp').addNumberOption(option => option.setName('multiplier').setDescription('Multiplier to set Global XP IN DECIMAL FORMAT').setRequired(true)).setDescription('Change the global XP multiplier').setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString()),
	async execute(interaction) {
		if(!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
			await interaction.reply('You do not have permission to use this command.');
			return;
		}
		const multiplier = interaction.options.getNumber('multiplier');
		if(multiplier < 1) {
			await interaction.reply('Multiplier must be greater than or equal to 1.');
			return;
		}
		const mongoDB = require('../../index').mongoDB;
		try{
			await mongoDB.collection('globalxp').updateOne({ _id: new ObjectId('6a974fd358a46c394946cb6b') }, { $set: { value: multiplier } }, { upsert: true });
		} catch (error) {
			console.error('Error updating global XP multiplier:', error);
			await interaction.reply('Failed to update global XP multiplier.');
			return;
		}
		
		await interaction.reply(`Global XP multiplier set to ${multiplier}`);
	},
};
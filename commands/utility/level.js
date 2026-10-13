const levelLog = require('../../utils/levelLog');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { ObjectId } = require('mongodb');

module.exports = {
    data: new SlashCommandBuilder().setName('level').addUserOption(option => option.setName('user').setDescription('User to check level of').setRequired(false)).setDescription('Check the level of a user'),
    async execute(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        const mongoDB = require('../../index').mongoDB;
        let userData;
        try{
            userData = await mongoDB.collection('userlevels').findOne({ memberId: `${user.id}` });
        } catch (error) {
            console.error('Error fetching user data:', error);
            await interaction.reply('Failed to fetch user data.');
            return;
        }
        
        if(!userData) {
            await interaction.reply(`${user.username} has no level data.`);
            return;
        }
        
        levelLog(`User ${user.username} has level ${userData.level}, XP ${userData.totalXP}, prestige ${userData.prestige}`);
        await interaction.reply(`${user.username} is level ${userData.level} with ${userData.totalXP} XP and prestige ${userData.prestige}`);
    }
}
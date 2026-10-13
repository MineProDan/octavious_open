const levelLog = require('../../utils/levelLog');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const csv = require('csv-parser');
const { syncMemberColors } = require('../../utils/colorRoles/sync');

const levelThresholds = new Map();
const levelThresholdsLoaded = new Promise((resolve, reject) => {
    fs.createReadStream(path.join(__dirname, '..', '..', 'xptolevel.csv'))
        .pipe(csv())
        .on('data', row => levelThresholds.set(Number(row.Level), Number(row.XP)))
        .on('end', resolve)
        .on('error', reject);
});

function getLevelForXp(effectiveXp) {
    let level = 0;
    for (const [thresholdLevel, thresholdXp] of levelThresholds) {
        if (effectiveXp >= thresholdXp) level = Math.max(level, thresholdLevel);
    }
    return level;
}

module.exports = {
    data: new SlashCommandBuilder().setName('addxp').addUserOption(option => option.setName('user').setDescription('User to add XP to').setRequired(true)).addNumberOption(option => option.setName('amount').setDescription('Amount of XP to add').setRequired(true)).setDescription('Add XP to a user').setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString()),
    async execute(interaction) {
        if(!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply('You do not have permission to use this command.');
            return;
        }
        const user = interaction.options.getUser('user');
        const amount = interaction.options.getNumber('amount');
        if(amount <= 0) {
            await interaction.reply('Amount must be greater than 0.');
            return;
        }
        const mongoDB = require('../../index').mongoDB;
        const userlevels = mongoDB.collection('userlevels');
        try{
            await userlevels.updateOne({ memberId: `${user.id}` }, { $inc: { totalXP: amount }, $setOnInsert: { level: 1, prestige: 0 }}, { upsert: true});
        } catch (error) {
            console.error('Error adding XP:', error);
            await interaction.reply('Failed to add XP.');
            return;
        }
        
        await interaction.reply(`Added ${amount} XP to ${user.username}`);

        await levelThresholdsLoaded;
        const userData = await userlevels.findOne({ memberId: `${user.id}` });
        const newPrestige = userData.totalXP >= 65550 ? Math.floor(userData.totalXP / 65550) : userData.prestige;
        const effectiveXP = userData.totalXP - (newPrestige * 65550);
        const newLevel = getLevelForXp(effectiveXP);
        await userlevels.updateOne({ memberId: `${user.id}` }, { $set: { prestige: newPrestige, level: newLevel } });

        if(newPrestige !== userData.prestige) {
            const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
            if (member) await syncMemberColors(member, { db: mongoDB }).catch((error) => console.error('Error syncing prestige roles:', error));
        }

        if(newPrestige > userData.prestige) {
            levelLog(`User ${user.tag} has prestiged to ${newPrestige} and is now level ${newLevel} after being granted ${amount} XP.`);
        } else {
            levelLog(`User ${user.tag} is now level ${newLevel} after being granted ${amount} XP.`);
        }

    }
}
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
    data: new SlashCommandBuilder().setName('removexp').addUserOption(option => option.setName('user').setDescription('User to remove XP from').setRequired(true)).addNumberOption(option => option.setName('amount').setDescription('Amount of XP to remove').setRequired(true)).setDescription('Remove XP from a user').setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString()),
    async execute(interaction) {
        if(!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply('You do not have permission to use this command.');
            return;
        }        
        const mongoDB = require('../../index').mongoDB;
        const userlevels = mongoDB.collection('userlevels');

        const user = interaction.options.getUser('user');
        const amount = interaction.options.getNumber('amount');

        const userData = await userlevels.findOne({ memberId: `${user.id}` });

        if (amount <= 0) {
            await interaction.reply('Amount must be greater than 0.');
            return;
        } else if (!userData || userData.totalXP < amount) {
            await interaction.reply('Amount must be less than or equal to the user\'s total XP.');
            return;
        }

        try{
            await userlevels.updateOne(
                { memberId: `${user.id}` },
                [
                    {
                    $set: {
                        memberId: `${user.id}`,
                        level: { $ifNull: ["$level", 1] },
                        prestige: { $ifNull: ["$prestige", 0] },
                        totalXP: {
                        $cond: [
                            { $eq: [{ $type: "$totalXP" }, "missing"] },
                            0,
                            { $subtract: ["$totalXP", amount] }
                        ]
                        }
                    }
                    }
                ],
                { upsert: true }
                );
        } catch (error) {
            console.error('Error removing XP:', error);
            await interaction.reply('Failed to remove XP.');
            return;
        }
        
        await interaction.reply(`Removed ${amount} XP from ${user.username}`);

        await levelThresholdsLoaded;

        const newTotalXP = userData.totalXP - amount;
        const newPrestige = Math.floor(newTotalXP / 65550);
        const effectiveXP = newTotalXP - (newPrestige * 65550);
        const newLevel = getLevelForXp(effectiveXP);
        await userlevels.updateOne({ memberId: `${user.id}` }, { $set: { prestige: newPrestige, level: newLevel } });

        if(newPrestige !== userData.prestige) {
            const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
            if (member) await syncMemberColors(member, { db: mongoDB }).catch((error) => console.error('Error syncing prestige roles:', error));
        }

        if(newPrestige < userData.prestige) {
            levelLog(`User ${user.tag} has prestiged down to ${newPrestige} and is now level ${newLevel} after having ${amount} XP removed.`);
        } else {
            levelLog(`User ${user.tag} is now level ${newLevel} after having ${amount} XP removed.`);
        }
    }
}
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
const { ACHIEVEMENTS, getAchievementDefinition } = require('../../utils/achievements/definitions');
const { buildCategoryPages, getAchievementProgress } = require('../../utils/achievements/engine');
const { buildContext } = require('../../utils/achievements/store');
const { MAX_ACHIEVEMENTS_PER_PAGE } = require('../../utils/achievements/categories');

const PAGE_SIZE = MAX_ACHIEVEMENTS_PER_PAGE;

function progressBar(percent, length = 12) {
  const filled = Math.round((percent / 100) * length);
  return `${'█'.repeat(filled)}${'░'.repeat(length - filled)}`;
}

async function loadUnlockedMap(context) {
  return new Map(context.progress.unlocked.map((entry) => [entry.id, entry]));
}

function encodeCategoryCustomId({ targetUserId, page, viewerId, missingOnly }) {
  return `achv-category:${targetUserId}:${page}:${viewerId}:${missingOnly ? 1 : 0}`;
}

function decodeCategoryCustomId(customId) {
  const [, targetUserId, page, viewerId, missingOnly] = customId.split(':');
  return { targetUserId, page: Number(page), viewerId, missingOnly: missingOnly === '1' };
}

function buildPageEmbed(targetUser, pages, pageIndex, missingOnly) {
  const page = pages[pageIndex];
  const unlockedTotal = pages.reduce((sum, p) => sum + p.entries.filter((entry) => entry.completed).length, 0);
  const totalTotal = pages.reduce((sum, p) => sum + p.entries.length, 0);

  const embed = new EmbedBuilder()
    .setColor('#F1C40F')
    .setTitle(`🏆 Achievements — ${targetUser.username}`)
    .setFooter({ text: `Page ${pageIndex + 1} of ${pages.length} • ${unlockedTotal}/${totalTotal} unlocked${missingOnly ? ' • showing missing only' : ''}` });

  if (!page) {
    embed.setDescription(missingOnly ? 'No missing achievements to show. Everything here is unlocked!' : 'No achievements found.');
    return embed;
  }

  embed.addFields({ name: page.category, value: '\u200b' });

  for (const entry of page.entries.slice(0, PAGE_SIZE)) {
    const status = entry.completed ? '✅' : '⬜';
    const detail = entry.completed
      ? (entry.hidden ? 'Unlocked!' : `${entry.current}/${entry.target}`)
      : (entry.target > 1 ? `${progressBar(entry.percent)} ${entry.current}/${entry.target}` : 'Locked');

    embed.addFields({
      name: `${status} ${entry.name}`,
      value: `${entry.description}\n${detail}`,
      inline: false,
    });
  }

  return embed;
}

function buildPageComponents(targetUser, viewer, pageIndex, pages, missingOnly) {
  const options = pages.map((page, index) => ({
    label: page.category,
    value: String(index),
    description: `${page.entries.length} achievement${page.entries.length === 1 ? '' : 's'}`,
    default: index === pageIndex,
  }));
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(encodeCategoryCustomId({ targetUserId: targetUser.id, page: pageIndex, viewerId: viewer.id, missingOnly }))
      .setPlaceholder('Choose an achievement category')
      .addOptions(options),
  );
  return [row];
}

async function renderView(targetUser, viewer, pageIndex, missingOnly) {
  const context = await buildContext(targetUser.id);
  const unlockedMap = await loadUnlockedMap(context);
  const pages = buildCategoryPages(unlockedMap, context, { includeHidden: true, missingOnly });
  const clampedIndex = Math.max(0, Math.min(pageIndex, Math.max(pages.length - 1, 0)));

  return {
    embed: buildPageEmbed(targetUser, pages, clampedIndex, missingOnly),
    components: buildPageComponents(targetUser, viewer, clampedIndex, pages, missingOnly),
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('achievements')
    .setDescription('View achievement progress')
    .addSubcommand((sub) => sub
      .setName('view')
      .setDescription('Browse achievements by category')
      .addUserOption((option) => option.setName('user').setDescription('User to view achievements for').setRequired(false))
      .addBooleanOption((option) => option.setName('missing').setDescription('Only show achievements you have not unlocked yet').setRequired(false)))
    .addSubcommand((sub) => sub
      .setName('progress')
      .setDescription('View detailed progress towards a single achievement')
      .addStringOption((option) => option.setName('achievement').setDescription('Achievement name').setRequired(true).setAutocomplete(true))
      .addUserOption((option) => option.setName('user').setDescription('User to view progress for').setRequired(false)))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString()),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const choices = ACHIEVEMENTS
      .filter((def) => !def.hidden && !def.special)
      .filter((def) => def.name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((def) => ({ name: def.name, value: def.id }));
    await interaction.respond(choices);
  },

  async execute(interaction) {
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
    if (!isAdmin) {
      await interaction.reply({ content: 'This command is restricted to administrators.', ephemeral: true });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('user') || interaction.user;

    if (subcommand === 'view') {
      const missingOnly = interaction.options.getBoolean('missing') || false;
      const { embed, components } = await renderView(targetUser, interaction.user, 0, missingOnly);
      await interaction.reply({ embeds: [embed], components });
      return;
    }

    if (subcommand === 'progress') {
      const achievementId = interaction.options.getString('achievement');
      const def = getAchievementDefinition(achievementId);
      if (!def || def.hidden || def.special) {
        await interaction.reply({ content: 'That achievement could not be found.', ephemeral: true });
        return;
      }

      const context = await buildContext(targetUser.id);
      const unlockedMap = await loadUnlockedMap(context);
      const progress = getAchievementProgress(def, context, unlockedMap);

      const embed = new EmbedBuilder()
        .setColor(progress.completed ? '#2ECC71' : '#3498DB')
        .setTitle(`${progress.completed ? '✅' : '⬜'} ${progress.name}`)
        .setDescription(progress.description)
        .addFields(
          { name: 'Category', value: progress.category, inline: true },
          { name: 'Progress', value: `${progressBar(progress.percent)} ${progress.current}/${progress.target} (${progress.percent}%)`, inline: false },
        )
        .setFooter({ text: `Viewing progress for ${targetUser.username}` });

      if (progress.completed && progress.unlockedAt) {
        embed.addFields({ name: 'Unlocked', value: new Date(progress.unlockedAt).toISOString().slice(0, 10), inline: true });
      }

      await interaction.reply({ embeds: [embed] });
      return;
    }
  },

  async handleCategorySelect(interaction) {
    const { targetUserId, viewerId, missingOnly } = decodeCategoryCustomId(interaction.customId);
    const page = Number(interaction.values[0]);

    if (interaction.user.id !== viewerId) {
      await interaction.reply({ content: 'Only the person who ran this command can change pages.', ephemeral: true });
      return;
    }

    const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
    if (!targetUser) {
      await interaction.update({ content: 'That user could not be found.', embeds: [], components: [] });
      return;
    }

    const { embed, components } = await renderView(targetUser, interaction.user, page, missingOnly);
    await interaction.update({ embeds: [embed], components });
  },
};

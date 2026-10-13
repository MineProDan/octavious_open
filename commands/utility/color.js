const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { COLOR_ROLES, COLOR_ROLES_BY_KEY, GROUP_LABELS } = require('../../utils/colorRoles/catalog');
const { getColorRoles, getBaseKey, getPickableKeys, loadColorContext, syncMemberColors } = require('../../utils/colorRoles/sync');

const DEFAULT_VALUE = 'default';

function describeDefault(baseKey) {
  return baseKey ? `Default (${COLOR_ROLES_BY_KEY.get(baseKey).name})` : 'No colour';
}

function choiceName(def) {
  return def.group === 'rare' ? `${def.name} · rare achievement` : def.name;
}

// Autocomplete choices: the default first, then every colour they have
// unlocked, in catalog order.
function buildColorAutocomplete(ctx, availableKeys, query = '') {
  const base = getBaseKey(ctx, availableKeys);
  const choices = [
    { name: describeDefault(base), value: DEFAULT_VALUE },
    ...getPickableKeys(ctx, availableKeys).map((key) => ({ name: choiceName(COLOR_ROLES_BY_KEY.get(key)), value: key })),
  ];
  const needle = query.trim().toLowerCase();
  return choices.filter((choice) => !needle || choice.name.toLowerCase().includes(needle)).slice(0, 25);
}

// Accepts an autocomplete value ("achievements:25", "default") or a typed
// role name ("Achievements 25"). Returns a key, null for the default, or
// undefined when nothing matches.
function parseColorChoice(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text || text === DEFAULT_VALUE || text.startsWith('default') || text === 'no colour') return null;
  if (COLOR_ROLES_BY_KEY.has(text)) return text;
  return COLOR_ROLES.find((def) => def.name.toLowerCase() === text || choiceName(def).toLowerCase() === text)?.key;
}

// Every colour grouped by family: unlocked, or locked with progress towards it.
function buildColorOverview(ctx, availableKeys, showingKey) {
  const base = getBaseKey(ctx, availableKeys);
  const pickable = new Set(getPickableKeys(ctx, availableKeys));
  const embed = new EmbedBuilder()
    .setTitle('Name colours')
    .setDescription('Pick an unlocked colour with `/color role:`. Locked colours show what it takes to earn them.')
    .setColor(showingKey ? COLOR_ROLES_BY_KEY.get(showingKey).color : null);

  for (const group of Object.keys(GROUP_LABELS)) {
    const lines = COLOR_ROLES
      .filter((def) => def.group === group && availableKeys.has(def.key))
      .map((def) => {
        const marker = def.key === showingKey ? ' ◀ showing' : '';
        if (def.key === base) return `🔹 **${def.name}** · your prestige${marker}`;
        if (pickable.has(def.key)) return `✅ **${def.name}**${marker}`;
        if (group === 'prestige' && def.isUnlocked(ctx)) return null; // above their base; never pickable
        const progress = def.progress(ctx);
        return `🔒 ${def.name} · ${def.requirement}${progress ? ` (${progress})` : ''}`;
      })
      .filter(Boolean);
    if (lines.length) embed.addFields({ name: GROUP_LABELS[group], value: lines.join('\n').slice(0, 1024) });
  }
  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('color')
    .setDescription('Pick a name colour you have unlocked, or see how to unlock more.')
    .addStringOption((option) => option
      .setName('role')
      .setDescription('Colour to show; leave empty to see every colour')
      .setAutocomplete(true)),

  buildColorAutocomplete,
  buildColorOverview,
  parseColorChoice,

  async autocomplete(interaction) {
    if (!interaction.guild) return interaction.respond([]);
    const mongoDB = require('../../index').mongoDB;
    const availableKeys = new Set(getColorRoles(interaction.guild).keys());
    const member = interaction.guild.members.cache.get(interaction.user.id) ?? await interaction.guild.members.fetch(interaction.user.id);
    const ctx = await loadColorContext(mongoDB, member);
    await interaction.respond(buildColorAutocomplete(ctx, availableKeys, interaction.options.getFocused()));
  },

  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });

    const mongoDB = require('../../index').mongoDB;
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const roles = getColorRoles(interaction.guild);
    const availableKeys = new Set(roles.keys());
    const ctx = await loadColorContext(mongoDB, member);
    const input = interaction.options.getString('role');

    if (!input) {
      const showing = [...roles]
        .filter(([, role]) => member.roles.cache.has(role.id))
        .sort(([, a], [, b]) => b.position - a.position)[0]?.[0] ?? null;
      await interaction.editReply({ embeds: [buildColorOverview(ctx, availableKeys, showing)] });
      return;
    }

    const override = parseColorChoice(input);
    if (override === undefined || (override !== null && !getPickableKeys(ctx, availableKeys).includes(override))) {
      const def = override ? COLOR_ROLES_BY_KEY.get(override) : null;
      await interaction.editReply(def
        ? `You haven't unlocked ${def.name} yet: ${def.requirement} Run \`/color\` to see your progress.`
        : 'That isn\'t a colour you can pick. Run `/color` to see every colour and how to unlock it.');
      return;
    }

    let result;
    try {
      result = await syncMemberColors(member, { ctx, override, reason: 'Picked with /color' });
    } catch (error) {
      console.error(`Error changing colour for ${interaction.user.id}:`, error);
      await interaction.editReply('I could not change your colour roles. Please let staff know.');
      return;
    }
    await interaction.editReply(override === null
      ? (result.base ? `You are back to your ${COLOR_ROLES_BY_KEY.get(result.base).name} colour.` : 'Your picked colour has been removed.')
      : `You are now showing ${COLOR_ROLES_BY_KEY.get(override).name}.`);
  },
};

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  AttachmentBuilder,
} = require('discord.js');
const { PETS, getPetDefinition, getPetLevel, getPetStats, describePetAbility } = require('../../utils/pets/catalog');
const {
  getPetProfile,
  getPetSlots,
  getPetMood,
  equipPet,
  unequipPet,
  setPetNickname,
  setWolfLink,
  feedPets,
  evolvePet,
  playWithPet,
} = require('../../utils/pets/store');
const { renderCollectionCard, renderSpotlightCard, RARITY_ORDER } = require('../../utils/pets/render');

const DEFAULT_RARITY = 'Common';

function petLine(pet, pets, equipped) {
  const bond = Number(pets.bond[pet.id]) || 0;
  const level = getPetLevel(pet, bond) + 1;
  const stats = getPetStats(pet, bond);
  const marker = equipped ? '🟢' : '⚪';
  const shiny = pets.shiny?.[pet.id] ? ' ✦' : '';
  const nickname = pets.nicknames?.[pet.id] ? ` "${pets.nicknames[pet.id]}"` : '';
  return `${marker} ${pet.emoji} **${pet.name}${shiny}**${nickname} • ${pet.rarity} • Bond ${bond} • Evolution ${level}/${pet.levels.length}\n${describePetAbility(pet, stats)}`;
}

/** Per-equipped-pet ability summary, shown regardless of which rarity tab is open. */
function formatEquippedAbilities(pets) {
  if (!pets.equipped.length) return 'No pet equipped';
  return pets.equipped
    .map((id) => {
      const pet = getPetDefinition(id);
      if (!pet) return null;
      const stats = getPetStats(pet, Number(pets.bond[id]) || 0);
      return `${pet.emoji} **${pet.name}** — ${describePetAbility(pet, stats)}`;
    })
    .filter(Boolean)
    .join('\n');
}

function buildPetEmbed(user, profile, rarity) {
  const { pets, userlevels, newlyUnlocked } = profile;
  const equipped = new Set(pets.equipped);
  const owned = new Set(pets.owned);
  const rarityPets = PETS.filter((pet) => pet.rarity === rarity);
  const rarityOwnedCount = rarityPets.filter((pet) => owned.has(pet.id)).length;
  const lines = rarityPets.map((pet) => owned.has(pet.id)
    ? petLine(pet, pets, equipped.has(pet.id))
    : `🔒 ${pet.emoji} **${pet.name}** • ${pet.rarity}\n${pet.unlock}`);

  const mood = getPetMood(pets);
  const embed = new EmbedBuilder()
    .setColor('#8E44AD')
    .setTitle(`🐾 ${user.username}'s Pet Care`)
    .setDescription('Feed your companions daily to build bond and evolve their perks. Play with them once a day for a bonus.')
    .addFields(
      { name: `Equipped (${pets.equipped.length}/${getPetSlots(userlevels?.prestige)})`, value: pets.equipped.length ? pets.equipped.map((id) => getPetDefinition(id)?.name || id).join(', ') : 'No pet equipped', inline: true },
      { name: 'Mood', value: `${mood.emoji} ${mood.label}`, inline: true },
      { name: 'Active abilities', value: formatEquippedAbilities(pets) },
      { name: `${rarity} Menagerie (${rarityOwnedCount}/${rarityPets.length} owned)`, value: lines.join('\n\n') || 'No pets in this rarity yet.' },
    )
    .setImage('attachment://pet-menagerie.png')
    .setFooter({ text: `Prestige ${userlevels?.prestige || 0} • ${pets.lastFedDate ? `Last fed ${pets.lastFedDate}` : 'No feed recorded yet'}` });

  if (newlyUnlocked.length) {
    embed.addFields({ name: 'New arrivals', value: newlyUnlocked.map((pet) => `${pet.emoji} ${pet.name}`).join(', ') });
  }
  if (pets.runawayPets.length) {
    embed.addFields({ name: 'Ran away', value: pets.runawayPets.map((id) => getPetDefinition(id)?.name || id).join(', ') });
  }
  return embed;
}

function buildPetComponents(userId, profile, rarity) {
  const pets = profile.pets;
  const rarityPets = PETS.filter((pet) => pet.rarity === rarity);

  const actionOptions = [
    { label: 'Feed equipped pets', value: 'feed', description: 'Feed today and build bond' },
    { label: 'Play with equipped pets', value: 'play', description: 'Trigger a trick for bonus XP (once daily)' },
    ...rarityPets
      .filter((pet) => pets.owned.includes(pet.id))
      .flatMap((pet) => {
        const equipped = pets.equipped.includes(pet.id);
        return [
          { label: `${equipped ? 'Unequip' : 'Equip'} ${pet.name}`, value: `${equipped ? 'unequip' : 'equip'}:${pet.id}`, description: equipped ? 'Free this pet slot' : 'Equip this pet' },
          { label: `Evolve ${pet.name}`, value: `evolve:${pet.id}`, description: 'Check evolution requirements' },
        ];
      }),
  ].slice(0, 25);

  const rarityOptions = RARITY_ORDER
    .map((r) => ({ rarity: r, all: PETS.filter((pet) => pet.rarity === r) }))
    .filter(({ all }) => all.length > 0)
    .map(({ rarity: r, all }) => ({
      label: `${r} (${all.filter((pet) => pets.owned.includes(pet.id)).length}/${all.length})`,
      value: r,
      default: r === rarity,
    }));

  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`pets-rarity:${userId}`)
        .setPlaceholder('Choose a rarity tier to view')
        .addOptions(rarityOptions),
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`pets-action:${userId}:${rarity}`)
        .setPlaceholder('Choose pet care')
        .addOptions(actionOptions),
    ),
  ];
}

async function buildPetAttachment(user, profile, rarity) {
  const buffer = await renderCollectionCard(user, profile, { rarity });
  return new AttachmentBuilder(buffer, { name: 'pet-menagerie.png' });
}

async function renderView(user, { interactive = true, rarity = DEFAULT_RARITY } = {}) {
  const profile = await getPetProfile(user.id);
  return {
    profile,
    rarity,
    embed: buildPetEmbed(user, profile, rarity),
    components: interactive ? buildPetComponents(user.id, profile, rarity) : [],
    files: [await buildPetAttachment(user, profile, rarity)],
  };
}

function bondRatioFor(definition, bond) {
  const stage = getPetLevel(definition, bond);
  const prevThreshold = definition.levels[stage].bond;
  const nextThreshold = definition.levels[stage + 1]?.bond ?? prevThreshold;
  return nextThreshold === prevThreshold ? 1 : (bond - prevThreshold) / (nextThreshold - prevThreshold);
}

async function buildSpotlightAttachment(user, definition, pets) {
  const bond = Number(pets.bond[definition.id]) || 0;
  const buffer = await renderSpotlightCard(user, definition, {
    shiny: Boolean(pets.shiny?.[definition.id]),
    nickname: pets.nicknames?.[definition.id],
    stage: getPetLevel(definition, bond),
    bond,
    bondRatio: bondRatioFor(definition, bond),
  });
  return new AttachmentBuilder(buffer, { name: 'pet-spotlight.png' });
}

async function runAction(memberId, action, extra) {
  const [verb, petId] = action.split(':');
  if (verb === 'feed') return feedPets(memberId);
  if (verb === 'play') {
    const targetId = petId || (await getPetProfile(memberId)).pets.equipped[0];
    if (!targetId) throw new Error('Equip a pet before playing with it.');
    return playWithPet(memberId, targetId);
  }
  if (verb === 'equip') return equipPet(memberId, petId);
  if (verb === 'unequip') return unequipPet(memberId, petId);
  if (verb === 'evolve') return evolvePet(memberId, petId);
  if (verb === 'nickname') return setPetNickname(memberId, petId, extra);
  if (verb === 'link') return setWolfLink(memberId, petId, extra);
  throw new Error('Unknown pet action.');
}

function actionMessage(action, result) {
  const [verb] = action.split(':');
  if (verb === 'feed') {
    if (!result.fed) return 'Your pets have already been fed today.';
    const levelUps = result.rewards?.length ? ` Evolution ready: ${result.rewards.map((reward) => reward.definition.name).join(', ')}.` : '';
    const ranAway = result.ranAway?.length ? ` Ran away: ${result.ranAway.map((pet) => pet.name).join(', ')}.` : '';
    return `Fed your equipped pets for today.${levelUps}${ranAway}`;
  }
  if (verb === 'play') {
    return `**${result.trickName}** — ${result.flavor}\n+${result.bonusXp.toLocaleString()} bonus XP.`;
  }
  if (verb === 'equip') return `${result.definition.emoji} ${result.definition.name} is now equipped.`;
  if (verb === 'unequip') return `${result.definition?.name || 'Pet'} was unequipped.`;
  if (verb === 'nickname') return result.nickname ? `${result.definition.emoji} Nicknamed ${result.definition.name} "${result.nickname}".` : `Removed ${result.definition.name}'s nickname.`;
  if (verb === 'link') return `${result.definition.emoji} ${result.definition.name} is now sharing XP with <@${result.targetUserId}>.`;
  return `${result.definition.emoji} ${result.definition.name} is ready to evolve when you use its next evolution threshold.`;
}

module.exports = {
  // TODO: temporarily admin-only; revert to open to everyone (drop setDefaultMemberPermissions and the isAdmin check).
  data: new SlashCommandBuilder()
    .setName('pets')
    .setDescription('Care for your SkyBlock-inspired companions')
    .addSubcommand((subcommand) => subcommand
      .setName('view')
      .setDescription('View your pets, bonds, and active perks')
      .addUserOption((option) => option
        .setName('user')
        .setDescription('View another member\'s menagerie instead of your own')
        .setRequired(false)))
    .addSubcommand((subcommand) => subcommand
      .setName('equip')
      .setDescription('Equip an unlocked pet')
      .addStringOption((option) => option
        .setName('pet')
        .setDescription('Pet to equip')
        .setRequired(true)
        .addChoices(...PETS.map((pet) => ({ name: pet.name, value: pet.id })))))
    .addSubcommand((subcommand) => subcommand
      .setName('unequip')
      .setDescription('Unequip a pet')
      .addStringOption((option) => option
        .setName('pet')
        .setDescription('Pet to unequip')
        .setRequired(true)
        .addChoices(...PETS.map((pet) => ({ name: pet.name, value: pet.id })))))
    .addSubcommand((subcommand) => subcommand
      .setName('feed')
      .setDescription('Feed your equipped pets for today'))
    .addSubcommand((subcommand) => subcommand
      .setName('play')
      .setDescription('Play with an equipped pet for a once-daily bonus')
      .addStringOption((option) => option
        .setName('pet')
        .setDescription('Pet to play with (defaults to your first equipped pet)')
        .setRequired(false)
        .addChoices(...PETS.map((pet) => ({ name: pet.name, value: pet.id })))))
    .addSubcommand((subcommand) => subcommand
      .setName('nickname')
      .setDescription('Nickname one of your pets')
      .addStringOption((option) => option
        .setName('pet')
        .setDescription('Pet to nickname')
        .setRequired(true)
        .addChoices(...PETS.map((pet) => ({ name: pet.name, value: pet.id }))))
      .addStringOption((option) => option
        .setName('name')
        .setDescription('New nickname (leave blank to clear)')
        .setRequired(false)
        .setMaxLength(24)))
    .addSubcommand((subcommand) => subcommand
      .setName('link')
      .setDescription('Link a pet to share a % of your XP with another member')
      .addStringOption((option) => option
        .setName('pet')
        .setDescription('Pet to link')
        .setRequired(true)
        .addChoices(...PETS.filter((pet) => pet.mechanic === 'wolf').map((pet) => ({ name: pet.name, value: pet.id }))))
      .addUserOption((option) => option
        .setName('user')
        .setDescription('Member to share XP with')
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('evolve')
      .setDescription('Check whether a pet is ready to evolve')
      .addStringOption((option) => option
        .setName('pet')
        .setDescription('Pet to evolve')
        .setRequired(true)
        .addChoices(...PETS.map((pet) => ({ name: pet.name, value: pet.id })))))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString()),

  async execute(interaction) {
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
    if (!isAdmin) {
      await interaction.reply({ content: 'This command is restricted to administrators.', ephemeral: true });
      return;
    }
    const subcommand = interaction.options.getSubcommand();
    try {
      if (subcommand === 'view') {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        if (targetUser.bot) {
          await interaction.reply({ content: 'Bots do not have pet menageries.', ephemeral: true });
          return;
        }
        const isSelf = targetUser.id === interaction.user.id;
        const result = await renderView(targetUser, { interactive: isSelf });
        await interaction.reply({ embeds: [result.embed], components: result.components, files: result.files });
        return;
      }

      const petId = interaction.options.getString('pet');
      let extra;
      if (subcommand === 'nickname') {
        extra = interaction.options.getString('name');
      } else if (subcommand === 'link') {
        const targetUser = interaction.options.getUser('user');
        if (targetUser.bot) {
          await interaction.reply({ content: 'You cannot link a pet to a bot.', ephemeral: true });
          return;
        }
        if (targetUser.id === interaction.user.id) {
          await interaction.reply({ content: 'You cannot link a pet to yourself.', ephemeral: true });
          return;
        }
        extra = targetUser.id;
      }

      const result = await runAction(interaction.user.id, `${subcommand}:${petId || ''}`.replace(/:$/, ''), extra);
      const attachment = result.definition ? await buildSpotlightAttachment(interaction.user, result.definition, result.pets) : null;
      await interaction.reply({
        content: actionMessage(`${subcommand}:${petId || ''}`, result),
        files: attachment ? [attachment] : [],
        ephemeral: true,
      });
    } catch (error) {
      await interaction.reply({ content: error.message || 'Pet care could not be completed.', ephemeral: true });
    }
  },

  async handleActionSelect(interaction) {
    const [, ownerId, rarity] = interaction.customId.split(':');
    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: 'Only the person who opened this pet menu can use it.', ephemeral: true });
      return;
    }
    try {
      const action = interaction.values[0];
      const result = await runAction(ownerId, action);
      const view = await renderView(interaction.user, { rarity: rarity || DEFAULT_RARITY });
      await interaction.update({
        content: `${actionMessage(action, result)}\n`,
        embeds: [view.embed],
        components: view.components,
        files: view.files,
      });
    } catch (error) {
      await interaction.reply({ content: error.message || 'Pet care could not be completed.', ephemeral: true });
    }
  },

  async handleRaritySelect(interaction) {
    const [, ownerId] = interaction.customId.split(':');
    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: 'Only the person who opened this pet menu can use it.', ephemeral: true });
      return;
    }
    try {
      const rarity = interaction.values[0];
      const view = await renderView(interaction.user, { rarity });
      await interaction.update({
        embeds: [view.embed],
        components: view.components,
        files: view.files,
      });
    } catch (error) {
      await interaction.reply({ content: error.message || 'Could not switch pet tabs.', ephemeral: true });
    }
  },
};

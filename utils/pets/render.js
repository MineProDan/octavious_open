// Canvas-based visual rendering for the pet system (canvas package).
// Produces PNG buffers used as Discord message attachments alongside embeds.

const Canvas = require('canvas');
const path = require('path');
require('../fonts'); // registers bundled TTFs with canvas as a side effect
const { roundRect, drawGlow, drawProgressBar, wrapText, ellipsize } = require('../canvasHelpers');
const {
  PETS, getPetDefinition, getPetLevel, getPetStats, getPetImagePath, getPetFallbackArt, getRarityTheme,
  RARITY_THEME, describePetAbility,
} = require('./catalog');

// Resolve project root relative to the main entry point (index.js)
const PROJECT_ROOT = path.dirname(require.main.filename);
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
const FONT_FAMILY = '"Noto Sans", "Noto Emoji"';
const RARITY_ORDER = Object.keys(RARITY_THEME);

async function loadPetImage(petId) {
  const imagePath = getPetImagePath(petId);
  if (!imagePath) return null;

  const fullPath = path.join(PUBLIC_DIR, imagePath);
  try {
    return await Canvas.loadImage(fullPath);
  } catch (error) {
    console.error(`[Pet] Failed to load image for ${petId}: ${error.message}`);
    return null;
  }
}

function drawBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#1B1730');
  gradient.addColorStop(1, '#0D0B18');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 28) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
}

function drawSparkle(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - size); ctx.lineTo(x + size * 0.25, y - size * 0.25);
  ctx.lineTo(x + size, y); ctx.lineTo(x + size * 0.25, y + size * 0.25);
  ctx.lineTo(x, y + size); ctx.lineTo(x - size * 0.25, y + size * 0.25);
  ctx.lineTo(x - size, y); ctx.lineTo(x - size * 0.25, y - size * 0.25);
  ctx.closePath(); ctx.fill();
}

/** Small rounded pill showing a rarity's owned/total count; brighter when it's the active tab. Returns its drawn width. */
function drawRarityPip(ctx, x, y, rarity, owned, total, active) {
  const theme = getRarityTheme(rarity);
  const label = `${rarity} ${owned}/${total}`;
  ctx.font = `bold 11px ${FONT_FAMILY}`;
  const chipW = ctx.measureText(label).width + 20;
  const chipH = 22;

  roundRect(ctx, x, y, chipW, chipH, chipH / 2);
  ctx.fillStyle = active ? theme.glow : 'rgba(255,255,255,0.05)';
  ctx.fill();
  roundRect(ctx, x, y, chipW, chipH, chipH / 2);
  ctx.strokeStyle = active ? theme.color : 'rgba(255,255,255,0.15)';
  ctx.lineWidth = active ? 2 : 1;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = active ? '#FFFFFF' : 'rgba(255,255,255,0.55)';
  ctx.fillText(label, x + chipW / 2, y + 15);
  return chipW;
}

function drawSlot(ctx, { x, y, w, h, pet, petImage, state }) {
  const theme = getRarityTheme(pet.rarity);
  const locked = !state.owned;
  const cx = x + w / 2;
  const cy = y + h * 0.36;

  roundRect(ctx, x, y, w, h, 16);
  ctx.fillStyle = locked ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
  ctx.fill();
  roundRect(ctx, x, y, w, h, 16);
  ctx.strokeStyle = state.equipped ? theme.color : 'rgba(255,255,255,0.15)';
  ctx.lineWidth = state.equipped ? 3 : 1.5;
  ctx.stroke();

  if (locked) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `bold 34px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.fillText('🔒', cx, cy + 12);
    ctx.font = `13px ${FONT_FAMILY}`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    wrapText(ctx, pet.unlock, cx, y + h - 34, w - 20, 14);
    ctx.font = `bold 15px ${FONT_FAMILY}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(pet.name, cx, y + 22);
    return;
  }

  drawGlow(ctx, cx, cy, Math.min(w, h) * 0.3, theme.glow);

  if (petImage) {
    try {
      const size = Math.min(w, h) * 0.5;
      ctx.drawImage(petImage, cx - size / 2, cy - size / 2, size, size);
    } catch (error) {
      console.error(`[Pet] Failed to draw image for ${pet.id}: ${error.message}`);
      const fallback = getPetFallbackArt(pet.id);
      if (fallback) fallback(ctx, { cx, cy, r: Math.min(w, h) * 0.25 });
    }
  } else {
    const fallback = getPetFallbackArt(pet.id);
    if (fallback) fallback(ctx, { cx, cy, r: Math.min(w, h) * 0.25 });
  }

  if (state.shiny) {
    drawSparkle(ctx, x + w - 20, y + 18, 8, '#FFF7B3');
    drawSparkle(ctx, x + 18, y + h - 46, 6, '#FFF7B3');
  }

  ctx.textAlign = 'center';
  ctx.font = `bold 15px ${FONT_FAMILY}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(`${pet.emoji} ${state.nickname || pet.name}`, cx, y + 22);

  ctx.font = `11px ${FONT_FAMILY}`;
  ctx.fillStyle = theme.color;
  ctx.fillText(theme.label + (state.shiny ? ' ✦ SHINY' : ''), cx, y + h - 92);

  ctx.font = `10px ${FONT_FAMILY}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(ellipsize(ctx, state.abilityText, w - 20), cx, y + h - 76);

  ctx.font = `11px ${FONT_FAMILY}`;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(`Bond ${state.bond} • Stage ${state.stage + 1}/${pet.levels.length}`, cx, y + h - 60);

  drawProgressBar(ctx, x + 14, y + h - 30, w - 28, 8, state.bondRatio, theme.color);

  ctx.font = `11px ${FONT_FAMILY}`;
  ctx.fillStyle = state.equipped ? theme.color : 'rgba(255,255,255,0.5)';
  ctx.fillText(state.equipped ? '● EQUIPPED' : '○ stored', cx, y + h - 10);
}

/**
 * Renders one rarity "page" of the menagerie as a PNG buffer. The full
 * catalog is paginated by rarity (rather than one giant grid) so the card
 * stays compact and legible as the catalog grows, and so the accompanying
 * select menu never has to build options for more pets than fit on screen.
 */
async function renderCollectionCard(user, profile, { rarity = 'Common' } = {}) {
  const rarityPets = PETS.filter((pet) => pet.rarity === rarity);
  // Grid width is fixed at 2 columns regardless of how many pets this rarity
  // has, so every tab renders at the same card size (no jump when switching
  // tabs) and the header's rarity pips always have room — a rarity with a
  // single pet (Mythic/Divine) used to shrink the canvas to one column and
  // clip the pip row off the right edge.
  const columns = 2;
  const rows = Math.max(1, Math.ceil(rarityPets.length / columns));
  const slotW = 280;
  const slotH = 224;
  const padding = 24;
  const headerH = 104;
  const gridWidth = columns * slotW + (columns - 1) * padding;
  const width = padding * 2 + gridWidth;
  const height = headerH + padding * 2 + rows * slotH + (rows - 1) * padding;

  const canvas = Canvas.createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  drawBackground(ctx, width, height);

  const { pets } = profile;

  ctx.textAlign = 'left';
  ctx.font = `bold 26px ${FONT_FAMILY}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(`🐾 ${user.username}'s Menagerie`, padding, 40);
  ctx.font = `13px ${FONT_FAMILY}`;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(`Companion Ranch • ${pets.owned.length}/${PETS.length} owned`, padding, 58);

  let pipX = padding;
  const pipY = 74;
  for (const rarityName of RARITY_ORDER) {
    const rarityAll = PETS.filter((pet) => pet.rarity === rarityName);
    if (rarityAll.length === 0) continue;
    const rarityOwned = rarityAll.filter((pet) => pets.owned.includes(pet.id)).length;
    const chipW = drawRarityPip(ctx, pipX, pipY, rarityName, rarityOwned, rarityAll.length, rarityName === rarity);
    pipX += chipW + 8;
  }

  for (const [index, pet] of rarityPets.entries()) {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const itemsInRow = Math.min(columns, rarityPets.length - row * columns);
    const rowWidth = itemsInRow * slotW + (itemsInRow - 1) * padding;
    const rowStartX = padding + (gridWidth - rowWidth) / 2;
    const x = rowStartX + col * (slotW + padding);
    const y = headerH + padding + row * (slotH + padding);
    const owned = pets.owned.includes(pet.id);
    const bond = Number(pets.bond[pet.id]) || 0;
    const stage = getPetLevel(pet, bond);
    const stats = getPetStats(pet, bond);
    const nextThreshold = pet.levels[stage + 1]?.bond ?? pet.levels[stage].bond;
    const prevThreshold = pet.levels[stage].bond;
    const bondRatio = nextThreshold === prevThreshold ? 1 : (bond - prevThreshold) / (nextThreshold - prevThreshold);

    const petImage = owned ? await loadPetImage(pet.id) : null;

    drawSlot(ctx, {
      x, y, w: slotW, h: slotH, pet, petImage,
      state: {
        owned,
        equipped: pets.equipped.includes(pet.id),
        shiny: Boolean(pets.shiny?.[pet.id]),
        nickname: pets.nicknames?.[pet.id],
        bond,
        stage,
        bondRatio,
        abilityText: owned ? describePetAbility(pet, stats) : '',
      },
    });
  }

  return canvas.toBuffer('image/png');
}

/** Renders a single-pet spotlight card (used for feed/equip/evolve confirmations). */
async function renderSpotlightCard(user, pet, state) {
  const width = 460;
  const height = 340;
  const canvas = Canvas.createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  drawBackground(ctx, width, height);

  const theme = getRarityTheme(pet.rarity);
  const cx = width / 2;
  const cy = 140;
  drawGlow(ctx, cx, cy, 110, theme.glow);

  const petImage = await loadPetImage(pet.id);
  if (petImage) {
    try {
      const size = 190;
      ctx.drawImage(petImage, cx - size / 2, cy - size / 2, size, size);
    } catch (error) {
      console.error(`[Pet] Failed to draw spotlight image for ${pet.id}: ${error.message}`);
      const fallback = getPetFallbackArt(pet.id);
      if (fallback) fallback(ctx, { cx, cy, r: 95 });
    }
  } else {
    const fallback = getPetFallbackArt(pet.id);
    if (fallback) fallback(ctx, { cx, cy, r: 95 });
  }

  if (state.shiny) {
    drawSparkle(ctx, cx + 90, cy - 80, 10, '#FFF7B3');
    drawSparkle(ctx, cx - 95, cy + 70, 8, '#FFF7B3');
  }

  ctx.textAlign = 'center';
  ctx.font = `bold 24px ${FONT_FAMILY}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(`${pet.emoji} ${state.nickname || pet.name}${state.shiny ? ' ✦' : ''}`, cx, 250);

  ctx.font = `14px ${FONT_FAMILY}`;
  ctx.fillStyle = theme.color;
  ctx.fillText(`${theme.label} • ${pet.levels[state.stage].title}`, cx, 272);

  const stats = getPetStats(pet, state.bond);
  ctx.font = `12px ${FONT_FAMILY}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(ellipsize(ctx, describePetAbility(pet, stats), width - 120), cx, 292);

  drawProgressBar(ctx, 60, 306, width - 120, 10, state.bondRatio, theme.color);
  ctx.font = `11px ${FONT_FAMILY}`;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(`Bond ${state.bond}`, cx, 330);

  return canvas.toBuffer('image/png');
}

module.exports = {
  RARITY_ORDER,
  renderCollectionCard,
  renderSpotlightCard,
};

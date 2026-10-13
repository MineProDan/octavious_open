// Canvas-based rank/profile card, styled to match the octaviousweb dashboard
// (deep-space background, hot-pink accent ring around the avatar, stat tiles).

const Canvas = require('canvas');
require('../fonts');
const {
  roundRect, drawGlow, drawProgressBar, ellipsize, formatCompactNumber, formatWithCommas,
} = require('../canvasHelpers');

const FONT = '"Geist", "Noto Sans", "Noto Emoji"';

const COLORS = {
  bgTop: '#100826',
  bgBottom: '#08060F',
  panel: 'rgba(255,255,255,0.045)',
  panelBorder: 'rgba(255,255,255,0.08)',
  accent: '#FF304F',
  accentText: '#FF7088',
  accentBg: 'rgba(255,48,79,0.14)',
  gold: '#F5C84C',
  lavender: '#B49CFF',
  green: '#4ADE80',
  textPrimary: '#FFFFFF',
  textMuted: 'rgba(235,230,255,0.55)',
  textDim: 'rgba(235,230,255,0.32)',
  divider: 'rgba(255,255,255,0.09)',
};

function xpTier(totalXp) {
  if (totalXp >= 1_000_000) return '1M+ TIER';
  if (totalXp >= 500_000) return '500K+ TIER';
  if (totalXp >= 250_000) return '250K+ TIER';
  if (totalXp >= 100_000) return '100K+ TIER';
  if (totalXp >= 50_000) return '50K+ TIER';
  if (totalXp >= 10_000) return '10K+ TIER';
  if (totalXp >= 2_500) return '2.5K+ TIER';
  if (totalXp >= 1_000) return '1K+ TIER';
  return 'NEWCOMER';
}

function drawStarfield(ctx, width, height, seedCount = 90) {
  ctx.save();
  for (let i = 0; i < seedCount; i += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const r = Math.random() * 1.2 + 0.3;
    ctx.globalAlpha = Math.random() * 0.5 + 0.15;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, COLORS.bgTop);
  gradient.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  drawStarfield(ctx, width, height);
}

function drawPill(ctx, { x, y, text, bg, color, height = 26, paddingX = 12 }) {
  ctx.font = `700 12px ${FONT}`;
  const textWidth = ctx.measureText(text).width;
  const w = textWidth + paddingX * 2;
  roundRect(ctx, x, y, w, height, height / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + paddingX, y + height / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  return w;
}

function drawAvatar(ctx, { image, cx, cy, r, fallbackLetter }) {
  drawGlow(ctx, cx, cy, r, 'rgba(255,48,79,0.55)');

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (image) {
    ctx.drawImage(image, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = '#241A3D';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.font = `800 ${Math.floor(r)}px ${FONT}`;
    ctx.fillStyle = COLORS.textPrimary;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fallbackLetter, cx, cy + r * 0.05);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 5;
  ctx.strokeStyle = COLORS.accent;
  ctx.stroke();
}

function drawStatTile(ctx, { x, y, w, h, icon, iconColor, label, value, subtitle }) {
  roundRect(ctx, x, y, w, h, 14);
  ctx.fillStyle = COLORS.panel;
  ctx.fill();
  roundRect(ctx, x, y, w, h, 14);
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  const padX = 18;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.font = `700 13px ${FONT}`;
  ctx.fillStyle = iconColor;
  ctx.fillText(icon, x + padX, y + 28);
  const iconWidth = ctx.measureText(icon).width;

  ctx.font = `700 11px ${FONT}`;
  ctx.fillStyle = COLORS.textMuted;
  ctx.fillText(label.toUpperCase(), x + padX + iconWidth + 8, y + 28);

  ctx.font = `800 30px ${FONT}`;
  ctx.fillStyle = COLORS.textPrimary;
  ctx.fillText(ellipsize(ctx, value, w - padX * 2), x + padX, y + 64);

  if (subtitle) {
    ctx.font = `500 12px ${FONT}`;
    ctx.fillStyle = COLORS.textDim;
    ctx.fillText(ellipsize(ctx, subtitle, w - padX * 2), x + padX, y + 84);
  }
}

/**
 * Renders a rank/profile card as a PNG buffer.
 *
 * @param {object} input
 * @param {{ username: string, handle: string, id: string }} input.user
 * @param {import('canvas').Image | null} input.avatarImage
 * @param {object} input.stats - see commands/utility/rank.js for the shape
 */
async function renderRankCard({ user, avatarImage, stats }) {
  const width = 900;
  const height = 860;
  const canvas = Canvas.createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  drawBackground(ctx, width, height);

  const pad = 48;

  // ---------------------------------------------------------------- header
  ctx.textAlign = 'left';
  ctx.font = `700 12px ${FONT}`;
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText('MEMBER PROFILE', pad, 44);

  const avatarR = 82;
  const avatarCx = pad + avatarR;
  const avatarCy = 150;
  drawAvatar(ctx, {
    image: avatarImage,
    cx: avatarCx,
    cy: avatarCy,
    r: avatarR,
    fallbackLetter: (user.username || '?').slice(0, 1).toUpperCase(),
  });

  if (stats.prestige > 0) {
    const badgeR = 22;
    const bx = avatarCx + avatarR * 0.72;
    const by = avatarCy + avatarR * 0.72;
    ctx.beginPath();
    ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.gold;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.bgBottom;
    ctx.stroke();
    ctx.font = `800 14px ${FONT}`;
    ctx.fillStyle = '#241A00';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`P${stats.prestige}`, bx, by + 1);
    ctx.textBaseline = 'alphabetic';
  }

  const infoX = pad + avatarR * 2 + 40;
  ctx.textAlign = 'left';
  ctx.font = `800 34px ${FONT}`;
  ctx.fillStyle = COLORS.textPrimary;
  ctx.fillText(ellipsize(ctx, user.username, width - infoX - pad), infoX, 130);

  ctx.font = `500 15px ${FONT}`;
  ctx.fillStyle = COLORS.textMuted;
  ctx.fillText(`@${user.handle}`, infoX, 154);

  let badgeX = infoX;
  const badgeY = 178;
  badgeX += drawPill(ctx, {
    x: badgeX, y: badgeY, text: `RANK #${formatWithCommas(stats.rank)}`, bg: COLORS.accentBg, color: COLORS.accentText,
  }) + 10;
  badgeX += drawPill(ctx, {
    x: badgeX, y: badgeY, text: xpTier(stats.totalXp), bg: 'rgba(180,156,255,0.14)', color: COLORS.lavender,
  }) + 10;
  if (stats.equippedPets?.length) {
    // Plain text rather than pet emoji: at this pill's font size, pictorial
    // glyphs (e.g. dragon, fire) rendered through our monochrome emoji font
    // become illegible little blobs, so names read far better here.
    const petText = stats.equippedPets.length === 1
      ? `${stats.equippedPets[0].name.toUpperCase()} EQUIPPED`
      : `${stats.equippedPets.length} PETS EQUIPPED`;
    drawPill(ctx, { x: badgeX, y: badgeY, text: petText, bg: 'rgba(74,222,128,0.14)', color: COLORS.green });
  }

  // ---------------------------------------------------------------- primary stats
  const row1Y = 260;
  const row1H = 100;
  const tileGap = 20;
  const tileW = (width - pad * 2 - tileGap * 2) / 3;

  drawStatTile(ctx, {
    x: pad, y: row1Y, w: tileW, h: row1H, icon: '⚡', iconColor: COLORS.lavender,
    label: 'Total XP', value: formatCompactNumber(stats.totalXp), subtitle: `${formatWithCommas(stats.totalXp)} raw`,
  });
  drawStatTile(ctx, {
    x: pad + tileW + tileGap, y: row1Y, w: tileW, h: row1H, icon: '♛', iconColor: COLORS.gold,
    label: 'Level', value: String(stats.level), subtitle: `Prestige ${stats.prestige}`,
  });
  drawStatTile(ctx, {
    x: pad + (tileW + tileGap) * 2, y: row1Y, w: tileW, h: row1H, icon: '⚑', iconColor: COLORS.accentText,
    label: 'Server Rank', value: `#${formatWithCommas(stats.rank)}`, subtitle: `of ${formatWithCommas(stats.totalRanked)} members`,
  });

  // ---------------------------------------------------------------- level progress bar
  const barY = row1Y + row1H + 30;
  ctx.font = `600 12px ${FONT}`;
  ctx.fillStyle = COLORS.textMuted;
  ctx.textAlign = 'left';
  ctx.fillText('LEVEL PROGRESS', pad, barY);
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText(
    stats.nextLevelXp != null
      ? `${formatWithCommas(stats.effectiveXp - stats.prevLevelXp)} / ${formatWithCommas(stats.nextLevelXp - stats.prevLevelXp)} XP to next level`
      : 'Max level reached',
    width - pad,
    barY,
  );
  ctx.textAlign = 'left';
  drawProgressBar(ctx, pad, barY + 12, width - pad * 2, 10, stats.levelProgressRatio, COLORS.accent);

  // ---------------------------------------------------------------- secondary stats
  const row2Y = barY + 46;
  const row2H = 96;
  const tile2Gap = 16;
  const tile2W = (width - pad * 2 - tile2Gap * 3) / 4;
  const secondary = [
    { icon: '🏆', iconColor: COLORS.gold, label: 'Achievements', value: `${stats.achievementsUnlocked}/${stats.achievementsTotal}` },
    { icon: '💬', iconColor: COLORS.lavender, label: 'Messages Sent', value: formatCompactNumber(stats.messagesTotal) },
    { icon: '🔥', iconColor: COLORS.accentText, label: 'Claim Streak', value: `${stats.claimCurrentStreak}d`, subtitle: `Best: ${stats.claimLongestStreak}d` },
    { icon: '🎙', iconColor: COLORS.green, label: 'Voice Time', value: `${formatCompactNumber(Math.round(stats.voiceMinutes / 60))}h` },
  ];
  secondary.forEach((tile, index) => {
    drawStatTile(ctx, {
      x: pad + index * (tile2W + tile2Gap), y: row2Y, w: tile2W, h: row2H, ...tile,
    });
  });

  // ---------------------------------------------------------------- nearby ranks
  const listY = row2Y + row2H + 40;
  ctx.font = `700 13px ${FONT}`;
  ctx.fillStyle = COLORS.textMuted;
  ctx.fillText('NEARBY RANKS', pad, listY);

  ctx.strokeStyle = COLORS.divider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, listY + 14);
  ctx.lineTo(width - pad, listY + 14);
  ctx.stroke();

  let rowY = listY + 44;
  const rowH = 34;
  for (const entry of stats.nearbyRanks) {
    if (entry.isTarget) {
      roundRect(ctx, pad - 10, rowY - 22, width - pad * 2 + 20, rowH, 10);
      ctx.fillStyle = 'rgba(255,48,79,0.12)';
      ctx.fill();
    }
    ctx.font = `600 14px ${FONT}`;
    ctx.fillStyle = entry.isTarget ? COLORS.accentText : COLORS.textDim;
    ctx.textAlign = 'left';
    ctx.fillText(`#${entry.rank}`, pad, rowY);

    ctx.fillStyle = entry.isTarget ? COLORS.textPrimary : COLORS.textMuted;
    ctx.font = entry.isTarget ? `700 14px ${FONT}` : `500 14px ${FONT}`;
    ctx.fillText(ellipsize(ctx, entry.username, 400), pad + 70, rowY);

    ctx.textAlign = 'right';
    ctx.fillStyle = entry.isTarget ? COLORS.textPrimary : COLORS.textDim;
    ctx.fillText(`${formatCompactNumber(entry.totalXp)} XP`, width - pad, rowY);
    ctx.textAlign = 'left';

    rowY += rowH;
  }

  // ---------------------------------------------------------------- footer
  const footerY = height - 34;
  ctx.strokeStyle = COLORS.divider;
  ctx.beginPath();
  ctx.moveTo(pad, footerY - 20);
  ctx.lineTo(width - pad, footerY - 20);
  ctx.stroke();

  ctx.font = `500 12px ${FONT}`;
  ctx.fillStyle = COLORS.textDim;
  ctx.textAlign = 'left';
  ctx.fillText(`Joined server ${stats.joinedServerAt}`, pad, footerY);
  ctx.textAlign = 'right';
  ctx.fillText(`Account created ${stats.accountCreatedAt}`, width - pad, footerY);

  return canvas.toBuffer('image/png');
}

module.exports = { renderRankCard, xpTier };

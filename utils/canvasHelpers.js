// Shared canvas drawing primitives used by every card renderer in the bot.

function roundRect(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawGlow(ctx, cx, cy, r, color) {
  const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.3);
  glow.addColorStop(0, color);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.3, 0, Math.PI * 2); ctx.fill();
}

function drawProgressBar(ctx, x, y, w, h, ratio, color, trackColor = 'rgba(255,255,255,0.12)') {
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = trackColor;
  ctx.fill();
  const filledW = Math.max(h, w * Math.min(1, Math.max(0, ratio)));
  roundRect(ctx, x, y, filledW, h, h / 2);
  ctx.fillStyle = color;
  ctx.fill();
}

// x is the text anchor canvas's ctx.textAlign resolves against (set textAlign
// before calling, same as a plain ctx.fillText call).
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let cursorY = y;
  for (const word of words) {
    const test = `${line}${word} `;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line.trim(), x, cursorY);
      line = `${word} `;
      cursorY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line.trim(), x, cursorY);
  return cursorY;
}

/** Truncates text with an ellipsis so it fits within maxWidth at the context's current font. */
function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

function formatCompactNumber(value) {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

function formatWithCommas(value) {
  return Number(value || 0).toLocaleString('en-US');
}

module.exports = {
  roundRect,
  drawGlow,
  drawProgressBar,
  wrapText,
  ellipsize,
  formatCompactNumber,
  formatWithCommas,
};

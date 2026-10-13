// Centralized font registration for all canvas rendering in the bot.
//
// Deploy containers (e.g. node:22-slim) ship with no fonts or fontconfig at
// all, so ctx.fillText() would otherwise draw "notdef" boxes for every
// character, even plain ASCII. We bundle our own TTFs under assets/fonts
// and register them here once, so every renderer gets working text
// regardless of what (if anything) the host has installed.

const Canvas = require('canvas');
const path = require('path');

const PROJECT_ROOT = path.dirname(require.main.filename);
const FONTS_DIR = path.join(PROJECT_ROOT, 'assets/fonts');

// Geist is the font used by the companion web dashboard (octaviousweb), kept
// here so canvas cards match its look. Noto Sans/Noto Emoji are fallbacks
// for glyphs Geist doesn't cover (most emoji).
const SANS = '"Geist", "Noto Sans", "Noto Emoji"';

let registered = false;

function registerFonts() {
  if (registered) return;
  registered = true;
  try {
    Canvas.registerFont(path.join(FONTS_DIR, 'Geist-Regular.ttf'), { family: 'Geist', weight: 'normal' });
    Canvas.registerFont(path.join(FONTS_DIR, 'Geist-Medium.ttf'), { family: 'Geist', weight: '500' });
    Canvas.registerFont(path.join(FONTS_DIR, 'Geist-SemiBold.ttf'), { family: 'Geist', weight: '600' });
    Canvas.registerFont(path.join(FONTS_DIR, 'Geist-Bold.ttf'), { family: 'Geist', weight: 'bold' });
    Canvas.registerFont(path.join(FONTS_DIR, 'Geist-Black.ttf'), { family: 'Geist', weight: '800' });
    Canvas.registerFont(path.join(FONTS_DIR, 'Geist-Black.ttf'), { family: 'Geist', weight: '900' });
    Canvas.registerFont(path.join(FONTS_DIR, 'NotoSans-Regular.ttf'), { family: 'Noto Sans', weight: 'normal' });
    Canvas.registerFont(path.join(FONTS_DIR, 'NotoSans-Bold.ttf'), { family: 'Noto Sans', weight: 'bold' });
    Canvas.registerFont(path.join(FONTS_DIR, 'NotoEmoji-Regular.ttf'), { family: 'Noto Emoji' });
  } catch (error) {
    console.error('[Fonts] Failed to register bundled fonts:', error.message);
  }
}

registerFonts();

module.exports = { FONTS_DIR, SANS, registerFonts };

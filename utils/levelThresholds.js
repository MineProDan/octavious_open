// Loads xptolevel.csv (Level -> cumulative effective XP required) once and
// shares it between the XP-award path (events/messageCreate.js) and any
// command that needs to display level progress (e.g. /rank).

const fs = require('node:fs');
const path = require('node:path');
const csv = require('csv-parser');

const levelThresholds = new Map();
const levelThresholdsLoaded = new Promise((resolve, reject) => {
  fs.createReadStream(path.join(__dirname, '..', 'xptolevel.csv'))
    .pipe(csv())
    .on('data', (row) => levelThresholds.set(Number(row.Level), Number(row.XP)))
    .on('end', resolve)
    .on('error', reject);
});

/** Resolves once xptolevel.csv has loaded, then returns the Map<level, xpRequired>. */
async function getLevelThresholds() {
  await levelThresholdsLoaded;
  return levelThresholds;
}

module.exports = { getLevelThresholds };

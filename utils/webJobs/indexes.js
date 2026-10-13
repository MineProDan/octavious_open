// Index the job worker's polling query relies on. The website creates the same one (with
// identical options, which makes creating them twice a no-op); doing it here
// too means the bot is fast even before the website has ever run.

async function ensureWebIndexes(db) {
  await Promise.all([
    db.collection('bot_jobs').createIndex({ status: 1, runAfter: 1 }),
  ]);
}

module.exports = { ensureWebIndexes };

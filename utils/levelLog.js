// Routes level/XP logs to the level log channel; index.js installs console.level.
// Falls back to console.log when it isn't installed (e.g. in tests or scripts).
module.exports = (...args) => (console.level ?? console.log)(...args);

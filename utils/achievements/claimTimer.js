const { getPacificDateKey } = require('./engine');

function startClaimResetTimer(onReset = () => {}) {
  let currentDate = getPacificDateKey();
  const timer = setInterval(() => {
    const nextDate = getPacificDateKey();
    if (nextDate === currentDate) return;
    currentDate = nextDate;
    onReset(currentDate);
  }, 30 * 1000);

  timer.unref?.();
  return timer;
}

module.exports = { startClaimResetTimer };

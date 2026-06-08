const MetaCeoIntegration = require('./metaCeoIntegration');

async function runMonitoring() {
    const metaCeo = new MetaCeoIntegration();
    console.log(`[Meta-CEO] Starting monitoring cycle...`);
    await metaCeo.monitorCeo();
    console.log(`[Meta-CEO] Monitoring cycle complete`);
}

// Run once immediately
runMonitoring();

// Запускай каждые 6 часов
const SIX_HOURS = 6 * 60 * 60 * 1000;
setInterval(runMonitoring, SIX_HOURS);

// vulnerable_function.js — тестовый файл для code_patcher E2E тестов
// Функция уязвима к JSON.parse ошибкам — цель для add_try_catch

function processData(input) {try {const result = JSON.parse(input);return result.value * 2;} catch (e) {console.error(e);return null;}}

module.exports = { processData };

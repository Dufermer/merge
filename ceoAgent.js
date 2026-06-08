// ceoAgent.js — CEO Agent: диспетчер с памятью
// Версия: 1.0
//
// Принимает запрос пользователя, ищет в памяти, делегирует при необходимости.

const path = require("node:path");
const os = require("node:os");

const MEMORY_MANAGER_PATH = path.join(os.homedir(), ".paperclip/adapter-plugins/executor/memoryManager.js");

/**
 * Главная функция: принимает запрос пользователя, возвращает ответ.
 */
async function processUserRequest(userInput) {
  const startTime = Date.now();
  const logs = [];
  let fromMemory = false;
  let finalAnswer = "";

  function log(msg) { logs.push(msg); }
  log(`[CEO] Processing: "${userInput.slice(0, 100)}..."`);

  // Загружаем memoryManager
  const memoryManager = require(MEMORY_MANAGER_PATH);

  // ═══ ФАЗА 1: Поиск в памяти ═══
  log("[CEO] Phase 1: Searching memory...");
  const searchResult = await memoryManager.searchMemory(userInput, 5);
  logs.push(...searchResult.logs);

  let memoryHit = null;
  if (searchResult.results.length > 0 && searchResult.results[0].similarity >= 0.4) {
    memoryHit = searchResult.results[0];
    fromMemory = true;
    log(`[CEO] Memory hit! similarity=${memoryHit.similarity}`);
  }

  if (memoryHit) {
    finalAnswer = memoryHit.result || memoryHit.task || "Найдено в памяти.";
    log(`[CEO] Answering from memory: "${finalAnswer.slice(0, 100)}..."`);
  } else {
    // ═══ ФАЗА 2: Формируем ответ ═══
    log("[CEO] No memory hit. Forming response...");

    // Определяем тип запроса по ключевым словам
    const q = userInput.toLowerCase();
    let action = "answer_directly";

    if (q.includes("найд") || q.includes("search") || q.includes("lookup") ||
        q.includes("read") || q.includes("проч") || q.includes("чит")) {
      action = "delegate";
    }

    log(`[CEO] Action: ${action}`);

    if (action === "delegate") {
      log("[CEO] Delegating to DAG Orchestrator...");
      try {
        const dagOrch = require("C:\\Users\\rus\\Desktop\\merge\\dagOrchestrator.js");
        const dagResult = await dagOrch.orchestrateDag(
          {
            nodes: [
              { id: "n1", action: "process", params: { input: userInput } },
            ]
          },
          null, null
        );
        finalAnswer = typeof dagResult === "object"
          ? JSON.stringify(dagResult, null, 2)
          : String(dagResult);
      } catch (e) {
        log(`[CEO] DAG error: ${e.message}`);
        finalAnswer = `Задача принята к исполнению: "${userInput}"`;
      }
    } else {
      finalAnswer = `Обработано: ${userInput}`;
    }
  }

  // ═══ ФАЗА 3: Сохранение в память ═══
  log("[CEO] Saving to memory...");
  await memoryManager.storeMemory(userInput, finalAnswer, {
    type: "task_result",
    source: fromMemory ? "memory_cache" : "ceo_agent",
  });
  memoryManager.addToConversation("user", userInput);
  memoryManager.addToConversation("ceo", finalAnswer);

  const elapsed = Date.now() - startTime;
  log(`[CEO] Completed in ${elapsed}ms (fromMemory: ${fromMemory})`);

  return { answer: finalAnswer, fromMemory, executionTimeMs: elapsed, logs };
}

module.exports = { processUserRequest };

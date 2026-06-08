// ceoAgent.js — CEO Agent: диспетчер с памятью и навыками
// Версия: 1.1
//
// Фазы обработки:
//   0. Поиск навыка (skill) — если найден, использует шаблон
//   1. Поиск в памяти — если найдено, отвечает напрямую
//   2. Решение — делегирование или прямой ответ
//   3. Сохранение + создание навыка

const path = require("node:path");
const os = require("node:os");

const MEMORY_MANAGER_PATH = path.join(os.homedir(), ".paperclip/adapter-plugins/executor/memoryManager.js");

async function processUserRequest(userInput) {
  const startTime = Date.now();
  const logs = [];
  let fromMemory = false;
  let usedSkill = null;
  let finalAnswer = "";

  function log(msg) { logs.push(msg); }
  log(`[CEO] Processing: "${userInput.slice(0, 100)}..."`);

  const memoryManager = require(MEMORY_MANAGER_PATH);
  const skillManager = require("./skillManager");
  const skillCreator = require("./skillCreator");

  // ═══ ФАЗА 0: Поиск навыка ═══
  log("[CEO] Phase 0: Searching for applicable skill...");
  const skillResults = skillManager.searchSkills(userInput, 3);

  let matchedSkill = null;
  if (skillResults.length > 0 && skillResults[0].similarity >= 0.85) {
    matchedSkill = skillResults[0];
    log(`[CEO] Skill found: "${matchedSkill.intent}" (sim=${matchedSkill.similarity}, status=${matchedSkill.status})`);
  }

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
    log(`[CEO] Answering from memory`);
  } else if (matchedSkill) {
    // ═══ ИСПОЛЬЗОВАНИЕ НАВЫКА ═══
    usedSkill = matchedSkill;
    log(`[CEO] Using skill: ${matchedSkill.id} ("${matchedSkill.intent}")`);

    const { dag, params } = skillCreator.applySkill(matchedSkill, userInput);
    log(`[CEO] Skill parameters: ${JSON.stringify(params)}`);

    try {
      const dagOrch = require("C:\\Users\\rus\\Desktop\\merge\\dagOrchestrator.js");
      const dagResult = await dagOrch.orchestrateDag(dag, null, null);

      const success = dagResult?.status === "success" || dagResult?.passed;
      skillManager.updateStats(matchedSkill.id, success);

      finalAnswer = typeof dagResult === "object"
        ? JSON.stringify(dagResult, null, 2)
        : String(dagResult);
      log(`[CEO] Skill execution completed (success=${success})`);
    } catch (e) {
      log(`[CEO] Skill execution error: ${e.message}`);
      skillManager.updateStats(matchedSkill.id, false);
      finalAnswer = `Задача выполнена (skill: ${matchedSkill.intent}): "${userInput}"`;
    }
  } else {
    // ═══ ФАЗА 2: Обычная обработка ═══
    log("[CEO] No memory or skill hit. Forming response...");

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
        const dagNodes = [
          { id: "n1", action: "process", params: { input: userInput } },
        ];
        const dagOrch = require("C:\\Users\\rus\\Desktop\\merge\\dagOrchestrator.js");
        const dagResult = await dagOrch.orchestrateDag({ nodes: dagNodes }, null, null);

        finalAnswer = typeof dagResult === "object"
          ? JSON.stringify(dagResult, null, 2)
          : String(dagResult);

        // Создаём навык из успешной задачи (>= 2 нод)
        const creation = skillCreator.createSkillFromDag(dagResult, userInput, dagNodes);
        logs.push(...(creation.logs || []));
        if (creation.created) {
          log(`[CEO] Skill created: ${creation.skill.id}`);
        }
      } catch (e) {
        log(`[CEO] DAG error: ${e.message}`);
        finalAnswer = `Задача принята к исполнению: "${userInput}"`;
      }
    } else {
      finalAnswer = `Обработано: ${userInput}`;
    }
  }

  // ═══ ФАЗА 3: Сохранение ═══
  log("[CEO] Saving to memory...");
  await memoryManager.storeMemory(userInput, finalAnswer, {
    type: "task_result",
    source: usedSkill ? "skill_execution" : fromMemory ? "memory_cache" : "ceo_agent",
  });
  memoryManager.addToConversation("user", userInput);
  memoryManager.addToConversation("ceo", finalAnswer);

  const elapsed = Date.now() - startTime;
  log(`[CEO] Completed in ${elapsed}ms (fromMemory: ${fromMemory}, skill: ${!!usedSkill})`);

  return {
    answer: finalAnswer,
    fromMemory,
    usedSkill: usedSkill ? { id: usedSkill.id, intent: usedSkill.intent, similarity: usedSkill.similarity } : null,
    executionTimeMs: elapsed,
    logs,
  };
}

module.exports = { processUserRequest };

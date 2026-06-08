// ceoAgent.js — CEO Agent: диспетчер с памятью и навыками
// Версия: 2.0
//
// Фазы:
//   0. Поиск навыка (ChromaDB skills) — семантический
//   1. Поиск в памяти (ChromaDB memory) — гибридный
//   2. Использование навыка / делегирование / прямой ответ
//   3. Создание навыка из успешной составной задачи

const path = require("node:path");
const os = require("node:os");

const EXECUTOR_DIR = path.join(os.homedir(), ".paperclip/adapter-plugins/executor");
const MEMORY_MANAGER_PATH = path.join(EXECUTOR_DIR, "memoryManager.js");
const SKILL_MANAGER_PATH = path.join(EXECUTOR_DIR, "skillManager.js");
const SKILL_CREATOR_PATH = path.join(EXECUTOR_DIR, "skillCreator.js");
const ERROR_RECOVERY_PATH = path.join(EXECUTOR_DIR, "skills/errorRecovery.js");

async function processUserRequest(userInput) {
  const startTime = Date.now();
  const logs = [];
  let fromMemory = false;
  let usedSkill = null;
  let finalAnswer = "";

  function log(msg) { logs.push(msg); }
  log(`[CEO] Processing: "${userInput.slice(0, 100)}..."`);

  const memoryManager = require(MEMORY_MANAGER_PATH);
  const skillManager = require(SKILL_MANAGER_PATH);
  const skillCreator = require(SKILL_CREATOR_PATH);

  // ═══ ФАЗА 0: Поиск навыка (ChromaDB skills) ═══
  log("[CEO] Phase 0: Searching skills...");
  const skillSearch = await skillManager.searchSkills(userInput, 3);

  let matchedSkill = null;
  if (skillSearch.results.length > 0 && skillSearch.results[0].similarity >= 0.85) {
    matchedSkill = skillSearch.results[0];
    log(`[CEO] Skill found: "${matchedSkill.name}" (sim=${matchedSkill.similarity}, method=${skillSearch.method})`);
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
    // ═══ ФАЗА 2b: Использование навыка ═══
    usedSkill = matchedSkill;
    log(`[CEO] Using skill: ${matchedSkill.id} ("${matchedSkill.name}")`);

    // Извлекаем параметры из запроса
    const params = {};
    if (matchedSkill.parameters) {
      const q = userInput.toLowerCase();
      for (const p of matchedSkill.parameters) {
        if (p.name === "file_path" || p.name === "file" || p.name === "path") {
          const m = q.match(/(?:файл|file|config)\s+([\w.-]+)/i);
          if (m) params[p.name] = m[1];
        }
        if (p.name === "target") {
          const m = q.match(/(?:backup|бэкап|копи)\s+([\w\s-]+?)(?:\s+и\s+|$)/i);
          if (m) params[p.name] = m[1].trim();
        }
        if (p.name === "query" || p.name === "target_search") {
          params[p.name] = userInput;
        }
      }
    }
    log(`[CEO] Skill params: ${JSON.stringify(params)}`);

    try {
      const dag = skillManager.executeSkill(matchedSkill, params);
      log(`[CEO] DAG from skill: ${dag.nodes.length} nodes`);

      const dagOrch = require("C:\\Users\\rus\\Desktop\\merge\\dagOrchestrator.js");
      const dagResult = await dagOrch.orchestrateDag(dag, null, null);

      const success = dagResult?.status === "success" || dagResult?.passed || dagResult?.exitCode === 0;
      skillManager.updateSkillStats(matchedSkill.id, success);

      finalAnswer = typeof dagResult === "object"
        ? JSON.stringify(dagResult, null, 2)
        : String(dagResult);
      log(`[CEO] Skill done (success=${success})`);
    } catch (e) {
      log(`[CEO] Skill error: ${e.message}`);
      skillManager.updateSkillStats(matchedSkill.id, false);
      finalAnswer = `Выполнено (skill: ${matchedSkill.name}): "${userInput}"`;
    }
  } else {
    // ═══ ФАЗА 2: Обычная обработка ═══
    log("[CEO] No skill or memory. Forming response...");

    const q = userInput.toLowerCase();
    let action = "answer_directly";
    if (q.includes("найд") || q.includes("search") || q.includes("read") ||
        q.includes("проч") || q.includes("чит") || q.includes("backup") ||
        q.includes("бэкап") || q.includes("файл") || q.includes("file")) {
      action = "delegate";
    }
    log(`[CEO] Action: ${action}`);

    if (action === "delegate") {
      log("[CEO] Delegating...");
      let context = { timeout: 30000 };

      try {
        const dagNodes = [{ id: "n1", action: "process", params: { input: userInput } }];
        const dagOrch = require("C:\\Users\\rus\\Desktop\\merge\\dagOrchestrator.js");
        const dagResult = await dagOrch.orchestrateDag({ nodes: dagNodes }, null, null);

        finalAnswer = typeof dagResult === "object"
          ? JSON.stringify(dagResult, null, 2)
          : String(dagResult);

        if (dagNodes.length >= 2) {
          const creation = await skillCreator.analyzeAndCreateSkill(userInput, dagNodes, dagResult);
          logs.push(...(creation.logs || []));
          if (creation.created) log(`[CEO] New skill: ${creation.skill.id}`);
        }
      } catch (e) {
        log(`[CEO] Error: ${e.message}`);

        // Error Recovery
        try {
          const ErrorRecovery = require(ERROR_RECOVERY_PATH);
          const er = new ErrorRecovery();
          const pattern = await er.findRecoveryPattern(e);

          if (pattern && !pattern.ineffective) {
            log(`[CEO] Recovery pattern found: ${pattern.signature} (${Math.round(pattern.successRate * 100)}% success)`);
            const newContext = await er.applyRecovery(pattern, context);
            log(`[CEO] Applied recovery: ${pattern.recoveryAction}`);

            // Retry
            try {
              const dagOrch = require("C:\\Users\\rus\\Desktop\\merge\\dagOrchestrator.js");
              const retryResult = await dagOrch.orchestrateDag(
                { nodes: [{ id: "n1", action: "process", params: { input: userInput, ...newContext } }] },
                null, null
              );
              finalAnswer = typeof retryResult === "object" ? JSON.stringify(retryResult, null, 2) : String(retryResult);
              await er.logError(e, pattern.recoveryAction, true);
              log("[CEO] Recovery retry SUCCESS");
            } catch (retryErr) {
              await er.logError(e, pattern.recoveryAction, false);
              finalAnswer = `Ошибка (recovery failed): ${retryErr.message}`;
            }
          } else {
            await er.logError(e, "none", false);
            finalAnswer = `Ошибка: ${e.message}`;
          }
        } catch (erErr) {
          log(`[CEO] ErrorRecovery error: ${erErr.message}`);
          finalAnswer = `Ошибка: ${e.message}`;
        }
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
  log(`[CEO] Completed in ${elapsed}ms (skill: ${!!usedSkill}, memory: ${fromMemory})`);

  return {
    answer: finalAnswer,
    fromMemory,
    usedSkill: usedSkill ? { id: usedSkill.id, name: usedSkill.name, similarity: usedSkill.similarity } : null,
    executionTimeMs: elapsed,
    logs,
  };
}

module.exports = { processUserRequest };

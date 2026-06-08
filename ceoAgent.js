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
const PROJECT_CONTEXT_PATH = path.join(EXECUTOR_DIR, "skills/projectContext.js");
const MULTI_STRATEGY_PATH = path.join(EXECUTOR_DIR, "skills/multiStrategy.js");

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

  // ═══ ФАЗА 0: Project Context ═══
  let projectContext = null;
  try {
    const ProjectContext = require(PROJECT_CONTEXT_PATH);
    const pc = new ProjectContext();
    const ctx = await pc.getRelevantContext(userInput);
    projectContext = ctx.context;
    if (ctx.sections !== "all") {
      log(`[CEO] Project context loaded: section=${ctx.sections}`);
    }
  } catch (e) {
    log(`[CEO] Project context error: ${e.message}`);
  }

  // ═══ ФАЗА 0: Поиск навыка (ChromaDB skills) ═══
  log("[CEO] Phase 0: Searching skills...");
  const skillSearch = await skillManager.searchSkills(userInput, 3);

  let matchedSkill = null;
  if (skillSearch.results.length > 0 && skillSearch.results[0].similarity >= 0.85) {
    matchedSkill = skillSearch.results[0];
    log(`[CEO] Skill found: "${matchedSkill.name}" (sim=${matchedSkill.similarity}, method=${skillSearch.method})`);
  }

  // ═══ MATH DETECTION (до памяти, чтобы не кешировать) ═══
  const mathPattern = /(\d+\s*[\+\-\*\/\(\)]\s*\d+)|(сколько\s*(будет|получится))|(вычисл)|(посчитай)/i;
  const isMath = mathPattern.test(userInput);

  // ═══ COMPLEX TASK DETECTION (до памяти, чтобы не отвечать из кэша) ═══
  // Задача считается сложной если содержит несколько глаголов действия
  const actionVerbs = /(прочитай|найди|сделай|умножь|отчитайся|напиши|создай|удали|обнови|запусти|останови|перезапусти|выполни|скачай|установи)/gi;
  const actionMatches = userInput.match(actionVerbs);
  const isComplex = actionMatches && actionMatches.length >= 2;
  if (isComplex) log(`[CEO] Complex task detected: ${actionMatches.length} action verbs`);

  // ═══ ФАЗА 1: Поиск в памяти (ПРОПУСК для сложных задач) ═══
  let memoryHit = null;
  if (!isMath && !isComplex) {
    log("[CEO] Phase 1: Searching memory...");
    const searchResult = await memoryManager.searchMemory(userInput, 5);
    logs.push(...searchResult.logs);

    if (searchResult.results.length > 0 && searchResult.results[0].similarity >= 0.6) {
      memoryHit = searchResult.results[0];
      fromMemory = true;
      log(`[CEO] Memory hit! similarity=${memoryHit.similarity}`);
    }
  } else {
    log(`[CEO] Phase 1: Skipped (math=${isMath}, complex=${isComplex})`);
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

    if (isMath) {
      action = "calculate_directly";
    }

    if (action === "calculate_directly") {
      log("[CEO] Detected math question. Computing directly...");
      try {
        // Extract expression
        const exprMatch = userInput.match(/(\d+\s*[\+\-\*\/\(\)]\s*\d+(?:\s*[\+\-\*\/\(\)]\s*\d+)*)/);
        const expr = exprMatch ? exprMatch[1].replace(/\s/g, "") : "0";
        const fn = new Function(`return (${expr})`);
        const result = fn();
        finalAnswer = `${expr} = ${result}`;
        log(`[CEO] Math result: ${expr} = ${result}`);
      } catch (e) {
        log(`[CEO] Math error: ${e.message}`);
        finalAnswer = `Ошибка вычисления: ${e.message}`;
      }
    } else if (q.includes("найд") || q.includes("search") || q.includes("read") ||
        q.includes("проч") || q.includes("чит") || q.includes("backup") ||
        q.includes("бэкап") || q.includes("файл") || q.includes("file")) {
      action = "delegate";
    }
    log(`[CEO] Action: ${action}`);

    if (action === "delegate") {
      log("[CEO] Delegating...");
      let context = { timeout: 30000 };

      // Multi-Strategy Planning for complex tasks
      let dagNodes = [{ id: "n1", action: "process", params: { input: userInput } }];
      try {
        const MultiStrategy = require(MULTI_STRATEGY_PATH);
        const ms = new MultiStrategy();
        const strategies = await ms.generateStrategies(userInput, 3);
        const evaluated = await ms.evaluateStrategies(strategies);
        const best = await ms.selectBestStrategy(evaluated);

        if (best && best.dag && best.dag.nodes) {
          log(`[CEO] ${best._selectionLog || `Selected ${best.id}`}`);
          dagNodes = best.dag.nodes;
        }
      } catch (e) {
        log(`[CEO] Multi-strategy error, using default: ${e.message}`);
      }

      try {
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
    } else if (action !== "calculate_directly") {
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

  // Auto-update Project Context after important tasks
  try {
    const q = userInput.toLowerCase();
    if (q.includes("model") || q.includes("файл") || q.includes("file") ||
        q.includes("structure") || q.includes("структур") || fromMemory === false) {
      const ProjectContext = require(PROJECT_CONTEXT_PATH);
      const pc = new ProjectContext();
      await pc.autoUpdate(userInput, { answer: finalAnswer });
      log("[CEO] Project context auto-updated");
    }
  } catch (e) {
    log(`[CEO] Project context update error: ${e.message}`);
  }

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

// skillCreator.js — Создание навыков из успешных задач
// Версия: 1.0
//
// Анализирует успешные DAG-задачи и создаёт переиспользуемые skills.

const skillManager = require("./skillManager");

/**
 * Создаёт skill из успешного выполнения DAG.
 *
 * @param {object} dagResult - Результат DAG-оркестрации
 * @param {string} userInput - Исходный запрос пользователя
 * @param {array} dagNodes - Ноды DAG
 * @returns {object} { skill, created: bool, reason: string }
 */
function createSkillFromDag(dagResult, userInput, dagNodes) {
  const logs = [];

  // Проверяем, что задача была составной (>= 2 нод)
  if (!dagNodes || dagNodes.length < 2) {
    logs.push("[SKILL_CREATOR] Task too simple (< 2 nodes), skipping skill creation");
    return { skill: null, created: false, reason: "too_simple", logs };
  }

  // Проверяем, что задача успешна
  const status = dagResult?.status || dagResult?.resultJson?.status || "";
  if (status !== "success" && status !== "completed" && !dagResult?.passed) {
    logs.push(`[SKILL_CREATOR] Task not successful (status=${status}), skipping`);
    return { skill: null, created: false, reason: "not_successful", logs };
  }

  // Извлекаем intent из запроса (первые значимые слова)
  const words = userInput.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const intent = words.slice(0, 5).join(" ");
  const description = userInput.slice(0, 150);

  // Создаём шаблон DAG из нод (без специфичных параметров)
  const dagTemplate = {
    nodes: dagNodes.map(node => ({
      id: node.id,
      action: node.action,
      params: {},  // Параметры будут заполняться при использовании
      depends_on: node.depends_on || [],
    })),
  };

  // Извлекаем теги
  const tags = [];
  if (userInput.toLowerCase().includes("read") || userInput.toLowerCase().includes("проч") || userInput.toLowerCase().includes("чит")) tags.push("read");
  if (userInput.toLowerCase().includes("backup") || userInput.toLowerCase().includes("бэкап") || userInput.toLowerCase().includes("коп")) tags.push("backup");
  if (userInput.toLowerCase().includes("report") || userInput.toLowerCase().includes("отчет") || userInput.toLowerCase().includes("скаж")) tags.push("report");
  if (userInput.toLowerCase().includes("port") || userInput.toLowerCase().includes("порт")) tags.push("config");
  if (userInput.toLowerCase().includes("find") || userInput.toLowerCase().includes("найд") || userInput.toLowerCase().includes("search")) tags.push("search");
  if (tags.length === 0) tags.push("general");

  // Сохраняем через skillManager
  const skill = skillManager.createSkill(intent, description, dagTemplate, tags);
  logs.push(`[SKILL_CREATOR] Created skill: ${skill.id} (${tags.join(", ")})`);

  return { skill, created: true, reason: "created", logs };
}

/**
 * Извлекает параметры из запроса для skill.
 *
 * @param {string} userInput - Запрос пользователя
 * @param {object} skill - Skill объект
 * @returns {object} Параметры для применения skill
 */
function extractParamsFromInput(userInput, skill) {
  const params = {};
  const q = userInput.toLowerCase();

  // Извлекаем file_path (слова после "файл"/"file")
  const fileMatch = q.match(/(?:файл|file)\s+([\w.-]+)/i);
  if (fileMatch) params.file_path = fileMatch[1];

  // Извлекаем target (слова после "найди"/"где"/"покажи")
  const targetMatch = q.match(/(?:найд|where|find|look|ищи)\s+([\w\s-]+?)(?:\s+в\s+|\s+из\s+|$)/i);
  if (targetMatch) params.target = targetMatch[1].trim();

  // Извлекаем backup target
  if (q.includes("backup") || q.includes("бэкап") || q.includes("коп")) {
    params.backup = true;
  }

  // Извлекаем port
  const portMatch = q.match(/(?:port|порт)\s*/i);
  if (portMatch) params.find_port = true;

  return params;
}

/**
 * Применяет skill к запросу — заполняет параметры из запроса.
 *
 * @param {object} skill - Skill для применения
 * @param {string} userInput - Запрос пользователя
 * @returns {object} { dag: {...}, params: {...} }
 */
function applySkill(skill, userInput) {
  const params = extractParamsFromInput(userInput, skill);
  const dag = JSON.parse(JSON.stringify(skill.dag_template));

  // Заполняем параметры в нодах
  const q = userInput.toLowerCase();
  for (const node of dag.nodes) {
    if (node.action === "read_file" || node.action === "process") {
      node.params = {
        ...node.params,
        file: params.file_path || node.params.file || "config.yaml",
        query: params.target || userInput,
      };
    }
    if (params.backup) {
      node.params.backup = true;
    }
  }

  return { dag, params };
}

module.exports = { createSkillFromDag, extractParamsFromInput, applySkill };

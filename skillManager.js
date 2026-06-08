// skillManager.js — Управление навыками (Skills)
// Версия: 1.0
//
// Skill — шаблон повторяемой операции (DAG-граф).
// Skills хранятся в skills/ директории и эволюционируют с использованием.

const fs = require("node:fs");
const path = require("node:path");

const SKILLS_DIR = "C:\\Users\\rus\\Desktop\\merge\\skills";
const LOG_FILE = "C:\\Users\\rus\\Desktop\\merge\\data\\skill_creation.log";
const SIMILARITY_THRESHOLD = 0.85;
const CANON_THRESHOLD = 5;
const DEPRECATED_THRESHOLD = 0.5;

class SkillManager {
  constructor() {
    this._ensureDirs();
  }

  _ensureDirs() {
    if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }

  _log(entry) {
    try {
      const line = `[${new Date().toISOString()}] ${entry}\n`;
      fs.appendFileSync(LOG_FILE, line);
    } catch {}
  }

  /**
   * Читает все skills из директории.
   */
  listSkills() {
    try {
      const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith(".json"));
      return files.map(f => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(SKILLS_DIR, f), "utf-8"));
          return { id: f.replace(".json", ""), ...data };
        } catch { return null; }
      }).filter(Boolean);
    } catch { return []; }
  }

  /**
   * Сохраняет skill в файл.
   */
  saveSkill(skill) {
    const fileName = `${skill.id}.json`;
    const filePath = path.join(SKILLS_DIR, fileName);
    fs.writeFileSync(filePath, JSON.stringify(skill, null, 2), "utf-8");
    this._log(`SAVE skill=${skill.id} desc="${skill.description}" nodes=${skill.dag_template?.nodes?.length || 0}`);
    return { success: true, path: filePath };
  }

  /**
   * Загружает skill по ID.
   */
  getSkill(skillId) {
    const filePath = path.join(SKILLS_DIR, `${skillId}.json`);
    if (!fs.existsSync(filePath)) return null;
    try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); }
    catch { return null; }
  }

  /**
   * Ищет подходящий skill по запросу.
   * Использует keyword matching + similarity score.
   */
  searchSkills(query, topK = 3) {
    const skills = this.listSkills();
    const q = query.toLowerCase().split(/\s+/).filter(Boolean);

    const scored = skills.map(skill => {
      const text = `${skill.description || ""} ${skill.intent || ""} ${(skill.tags || []).join(" ")}`.toLowerCase();
      let matches = 0;
      for (const word of q) {
        if (word.length < 3) continue;
        if (text.includes(word)) matches++;
      }
      const similarity = q.length > 0 ? Math.min(1, (matches / q.length) * 1.3) : 0;

      // Бонус за точное совпадение intent
      const intentBonus = skill.intent && q.some(w => skill.intent.toLowerCase().includes(w)) ? 0.15 : 0;

      return { ...skill, similarity: Math.round((similarity + intentBonus) * 100) / 100 };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  }

  /**
   * Обновляет статистику использования skill.
   */
  updateStats(skillId, success) {
    const skill = this.getSkill(skillId);
    if (!skill) return { error: "Skill not found" };

    skill.stats = skill.stats || { use_count: 0, success_count: 0, fail_count: 0 };
    skill.stats.use_count++;

    if (success) {
      skill.stats.success_count++;
    } else {
      skill.stats.fail_count++;
    }

    // Обновляем confidence
    const total = skill.stats.use_count;
    skill.stats.confidence = total > 0
      ? Math.round((skill.stats.success_count / total) * 100) / 100
      : 0;

    // Эволюция статуса
    if (skill.stats.success_count >= CANON_THRESHOLD) {
      skill.status = "canon";
    } else if (skill.stats.confidence < DEPRECATED_THRESHOLD && skill.stats.use_count >= 3) {
      skill.status = "deprecated";
    } else if (skill.stats.use_count >= 2) {
      skill.status = "stable";
    }

    this.saveSkill(skill);
    this._log(`STATS skill=${skillId} use=${skill.stats.use_count} success=${skill.stats.success_count} conf=${skill.stats.confidence} status=${skill.status}`);

    return { success: true, stats: skill.stats, status: skill.status };
  }

  /**
   * Эволюционирует все skills: deprecated с низкой уверенностью.
   */
  evolveSkills() {
    const skills = this.listSkills();
    const results = [];

    for (const skill of skills) {
      const stats = skill.stats || {};
      const total = stats.use_count || 0;
      const conf = total > 0 ? stats.success_count / total : 0;

      if (skill.status === "deprecated" && total > 0 && conf < DEPRECATED_THRESHOLD) {
        // Удаляем deprecated skill
        const filePath = path.join(SKILLS_DIR, `${skill.id}.json`);
        try { fs.unlinkSync(filePath); } catch {}
        results.push({ id: skill.id, action: "deleted", reason: "deprecated + low confidence" });
        this._log(`EVOLVE skill=${skill.id} DELETED (deprecated, conf=${conf})`);
      } else if (stats.success_count >= CANON_THRESHOLD && skill.status !== "canon") {
        skill.status = "canon";
        this.saveSkill(skill);
        results.push({ id: skill.id, action: "promoted", to: "canon" });
        this._log(`EVOLVE skill=${skill.id} PROMOTED to canon (success=${stats.success_count})`);
      }
    }

    return { evolved: results.length, results };
  }

  /**
   * Создаёт skill из DAG-шаблона.
   */
  createSkill(intent, description, dagTemplate, tags = []) {
    const id = `skill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const skill = {
      id,
      intent,
      description,
      dag_template: dagTemplate,
      tags,
      status: "new",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      stats: {
        use_count: 0,
        success_count: 0,
        fail_count: 0,
        confidence: 0,
      },
    };

    this.saveSkill(skill);
    this._log(`CREATE skill=${id} intent="${intent}" nodes=${dagTemplate.nodes?.length || 0} tags=${tags.join(",")}`);

    return skill;
  }
}

module.exports = new SkillManager();

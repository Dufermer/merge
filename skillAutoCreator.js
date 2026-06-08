// skillAutoCreator.js — автономное создание и переиспользование skills
const fs = require("node:fs");
const path = require("node:path");

class SkillAutoCreator {
  constructor() {
    this.skillsDir = path.join(__dirname, "memory", "skills");
    this.vectorStorePath = path.join(__dirname, "memory", "skills_vector_store.json");
  }

  async shouldCreateSkill(userInput, result) {
    if (!result || !result.answer || result.answer.includes("Error") || result.answer.includes("error") || result.answer.includes("Unknown")) return false;
    const isComplex = (result.turns || 0) >= 2;
    const isTooSimple = /^\d+\s*[\+\-\*\/]\s*\d+$/.test(userInput) || (userInput.includes("прочитай") && !userInput.includes("и"));
    return isComplex && !isTooSimple;
  }

  async createSkill(userInput, result) {
    const skillId = `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const skillData = {
      id: skillId,
      name: userInput.split(/\s+/).slice(0, 5).join(" "),
      pattern: userInput.replace(/\d+/g, "N").replace(/\b\w+\.\w+\b/g, "FILE").toLowerCase(),
      userInput,
      steps: result.steps || [],
      toolsUsed: [],
      answer: result.answer,
      successRate: 1.0,
      usageCount: 0,
      createdAt: Date.now(),
    };

    await fs.promises.mkdir(this.skillsDir, { recursive: true });
    await fs.promises.writeFile(path.join(this.skillsDir, `${skillId}.json`), JSON.stringify(skillData, null, 2));

    let vectorStore = [];
    try { vectorStore = JSON.parse(await fs.promises.readFile(this.vectorStorePath, "utf8")); } catch {}
    vectorStore.push({ id: skillId, content: userInput, pattern: skillData.pattern, name: skillData.name });
    await fs.promises.writeFile(this.vectorStorePath, JSON.stringify(vectorStore, null, 2));

    return skillId;
  }

  async findSimilarSkill(userInput) {
    const pattern = userInput.replace(/\d+/g, "N").replace(/\b\w+\.\w+\b/g, "FILE").toLowerCase();
    try {
      const vectorStore = JSON.parse(await fs.promises.readFile(this.vectorStorePath, "utf8"));
      for (const entry of vectorStore) {
        if (entry.pattern === pattern) return entry;
      }
    } catch {}
    return null;
  }
}

module.exports = SkillAutoCreator;

// sessionSearch.js — FTS5-based cross-session search
const path = require("node:path");
const fs = require("node:fs");

class SessionSearch {
  constructor() {
    this.dbPath = path.join(__dirname, "memory", "sessions.json");
  }

  async indexSession(sessionId, userInput, result, toolsUsed) {
    let sessions = [];
    try { sessions = JSON.parse(await fs.promises.readFile(this.dbPath, "utf8")); } catch {}

    sessions.push({
      sessionId,
      userInput,
      result: (result || "").slice(0, 500),
      toolsUsed: toolsUsed || [],
      timestamp: Date.now(),
      // FTS-like keywords for search
      keywords: (userInput + " " + (result || "")).toLowerCase().split(/\s+/).filter(w => w.length > 2),
    });

    if (sessions.length > 200) sessions = sessions.slice(-200);
    await fs.promises.writeFile(this.dbPath, JSON.stringify(sessions, null, 2));
  }

  async search(query, limit = 3) {
    const q = query.toLowerCase();
    const qWords = q.split(/\s+/).filter(w => w.length > 2);

    try {
      let sessions = JSON.parse(await fs.promises.readFile(this.dbPath, "utf8"));
      const scored = sessions.map(s => {
        const matchCount = qWords.filter(w => s.keywords.some(k => k.includes(w))).length;
        return { ...s, score: qWords.length ? matchCount / qWords.length : 0 };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, limit).filter(s => s.score > 0);
    } catch { return []; }
  }
}

module.exports = SessionSearch;

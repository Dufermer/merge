// memoryManager.js — управление долговременной памятью CEO
const fs = require("node:fs");
const path = require("node:path");

class MemoryManager {
  constructor() {
    this.memoryPath = path.join(__dirname, "memory", "vector_store.json");
    this.skillsDir = path.join(__dirname, "memory", "skills");
    this.skillsVectorPath = path.join(__dirname, "memory", "skills_vector_store.json");
  }

  async storeMemory(key, value) {
    let store;
    try {
      store = JSON.parse(await fs.promises.readFile(this.memoryPath, "utf8"));
    } catch {
      store = { version: 2, count: 0, embeddings: [] };
    }

    // Handle ChromaDB format
    if (store.embeddings !== undefined) {
      store.embeddings.push({
        id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        text: `${key}: ${value}`,
        vector: new Array(384).fill(0.01), // placeholder vector
        metadata: { key, value, createdAt: Date.now() }
      });
      store.count = store.embeddings.length;
    } else {
      // Simple format fallback
      if (!Array.isArray(store)) store = [];
      const existing = store.findIndex(e => e.key === key);
      if (existing >= 0) {
        store[existing].value = value;
        store[existing].updatedAt = Date.now();
      } else {
        store.push({ key, value, createdAt: Date.now(), updatedAt: Date.now() });
      }
    }

    await fs.promises.mkdir(path.dirname(this.memoryPath), { recursive: true });
    await fs.promises.writeFile(this.memoryPath, JSON.stringify(store, null, 2));
    return true;
  }

  async getMemory(key) {
    try {
      const store = JSON.parse(await fs.promises.readFile(this.memoryPath, "utf8"));
      const entry = store.find(e => e.key === key);
      return entry ? entry.value : null;
    } catch {
      return null;
    }
  }

  async getMemoryCount() {
    try {
      const store = JSON.parse(await fs.promises.readFile(this.memoryPath, "utf8"));
      // ChromaDB format: { version, count, embeddings }
      if (store.count !== undefined) return store.count;
      // Simple format: [{ key, value }]
      if (Array.isArray(store)) return store.length;
      // Embeddings array
      if (store.embeddings) return store.embeddings.length;
      return 0;
    } catch (e) {
      return 0;
    }
  }

  async getAllMemories() {
    try {
      return JSON.parse(await fs.promises.readFile(this.memoryPath, "utf8"));
    } catch {
      return [];
    }
  }

  async getSkillsCount() {
    try {
      const files = await fs.promises.readdir(this.skillsDir);
      return files.filter(f => f.endsWith('.json')).length;
    } catch {
      return 0;
    }
  }
}

module.exports = MemoryManager;

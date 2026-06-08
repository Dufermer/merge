// memoryNudge.js — periodic self-reflection каждые 10 задач
const fs = require("node:fs");
const path = require("node:path");

class MemoryNudge {
  constructor() {
    this.taskCount = 0;
    this.nudgeInterval = 10;
    this.logPath = path.join(__dirname, "data", "nudge_log.json");
  }

  increment() {
    this.taskCount++;
    return this.taskCount % this.nudgeInterval === 0;
  }

  async performNudge(recentTasks) {
    const successCount = recentTasks.filter(t => t.success !== false).length;
    const totalTime = recentTasks.reduce((s, t) => s + (t.executionTime || 0), 0);
    const avgTime = recentTasks.length ? Math.round(totalTime / recentTasks.length) : 0;

    const reflection = {
      timestamp: Date.now(),
      taskCount: this.taskCount,
      recentTaskCount: recentTasks.length,
      successRate: recentTasks.length ? `${successCount}/${recentTasks.length}` : "0/0",
      avgExecutionTime: `${avgTime}ms`,
    };

    let log = [];
    try { log = JSON.parse(await fs.promises.readFile(this.logPath, "utf8")); } catch {}
    log.push(reflection);
    if (log.length > 50) log = log.slice(-50);
    await fs.promises.writeFile(this.logPath, JSON.stringify(log, null, 2));

    return reflection;
  }
}

module.exports = MemoryNudge;

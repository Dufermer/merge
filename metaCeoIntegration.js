const CriticAgent = require('./criticAgent');
const SkillAutoCreator = require('./skillAutoCreator');
const MemoryManager = require('./memoryManager');

// fetch is native in Node.js v24

const FETCH_TIMEOUT = 5000; // 5s timeout for Paperclip API

class MetaCeoIntegration {
    constructor() {
        this.critic = new CriticAgent();
        this.skillCreator = new SkillAutoCreator();
        this.memoryManager = new MemoryManager();
        this.paperclipBase = 'http://127.0.0.1:3100';
        this.companyId = '793573ec-9d0c-44de-a5e6-477fbf16cb64';
        this.interventionThreshold = {
            unknownTaskRate: 0.10,  // 10%
            successRate: 0.90,      // 90%
            minSkills: 50,
            minMemory: 100
        };
    }

    async monitorCeo() {
        console.log(`[Meta-CEO] Monitoring CEO metrics...`);
        const metrics = await this.calculateMetrics();

        console.log(`[Meta-CEO] Metrics:`);
        console.log(`  Skills: ${metrics.skillsCount}`);
        console.log(`  Memory: ${metrics.memoryCount}`);
        console.log(`  Success rate: ${(metrics.successRate * 100).toFixed(1)}%`);
        console.log(`  Unknown task rate: ${(metrics.unknownTaskRate * 100).toFixed(1)}%`);

        // Проверь нужно ли вмешиваться
        if (metrics.unknownTaskRate > this.interventionThreshold.unknownTaskRate) {
            console.log(`[Meta-CEO] INTERVENTION: Unknown task rate too high`);
            await this.interveneForUnknownTasks();
        }

        if (metrics.successRate < this.interventionThreshold.successRate) {
            console.log(`[Meta-CEO] INTERVENTION: Success rate too low`);
            await this.interveneForLowSuccess();
        }

        if (metrics.skillsCount < this.interventionThreshold.minSkills) {
            console.log(`[Meta-CEO] INTERVENTION: Not enough skills`);
            await this.interveneForSkills();
        }

        if (metrics.memoryCount < this.interventionThreshold.minMemory) {
            console.log(`[Meta-CEO] INTERVENTION: Not enough memory`);
            await this.interveneForMemory();
        }
    }

    async calculateMetrics() {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
            const response = await fetch(
                `${this.paperclipBase}/api/companies/${this.companyId}/issues?limit=100`,
                { signal: controller.signal }
            );
            clearTimeout(timeout);
            const issues = response.ok ? await response.json() : [];

            const total = issues.length || 1;
            const successful = issues.filter(i => i.status === 'done').length;
            const failed = issues.filter(i => i.status === 'failed').length;
            const unknown = issues.filter(i =>
                i.resultJson?.answer?.includes('Unknown task type')
            ).length;

            // Получи skills count
            const skillsCount = await this.skillCreator.getSkillsCount();
            // Получи memory count
            const memoryCount = await this.memoryManager.getMemoryCount();

            return {
                totalTasks: total,
                successfulTasks: successful,
                failedTasks: failed,
                unknownTasks: unknown,
                successRate: successful / total,
                unknownTaskRate: unknown / total,
                skillsCount,
                memoryCount
            };
        } catch (error) {
            console.error(`[Meta-CEO] Error calculating metrics: ${error.message}`);
            return {
                totalTasks: 0, successfulTasks: 0, failedTasks: 0, unknownTasks: 0,
                successRate: 1, unknownTaskRate: 0, skillsCount: 0, memoryCount: 0
            };
        }
    }

    async interveneForUnknownTasks() {
        console.log(`[Meta-CEO] Analyzing unknown tasks...`);

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
            const response = await fetch(
                `${this.paperclipBase}/api/companies/${this.companyId}/issues?limit=100`,
                { signal: controller.signal }
            );
            clearTimeout(timeout);
            const issues = response.ok ? await response.json() : [];
            const unknownTasks = issues
                .filter(i => i.resultJson?.answer?.includes('Unknown task type'))
                .slice(-10);

            // Группируй по паттернам
            const patterns = this.groupByPattern(unknownTasks);

            // Создай skills для топ-5 паттернов
            for (const [pattern, tasks] of Object.entries(patterns).slice(0, 5)) {
                console.log(`[Meta-CEO] Creating skill for pattern: ${pattern}`);

                const trajectory = await this.critic.generateTrajectory(
                    tasks[0].description || tasks[0].title || pattern
                );

                if (trajectory && trajectory.trajectory && trajectory.trajectory.length > 0) {
                    await this.skillCreator.createSkillFromTrajectory(pattern, trajectory);
                    console.log(`[Meta-CEO] Created skill: ${pattern}`);
                }
            }
        } catch (error) {
            console.error(`[Meta-CEO] Error in interveneForUnknownTasks: ${error.message}`);
        }
    }

    async interveneForLowSuccess() {
        console.log(`[Meta-CEO] Analyzing failed tasks...`);

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
            const response = await fetch(
                `${this.paperclipBase}/api/companies/${this.companyId}/issues?limit=100`,
                { signal: controller.signal }
            );
            clearTimeout(timeout);
            const issues = response.ok ? await response.json() : [];
            const failedTasks = issues
                .filter(i => i.status === 'failed')
                .slice(-5);

            for (const task of failedTasks) {
                console.log(`[Meta-CEO] Analyzing failed task: ${task.description || task.title}`);

                const analysis = await this.critic.analyzeFailure(
                    task.description || task.title,
                    task.resultJson,
                    []
                );

                if (analysis) {
                    if (analysis.skill) {
                        await this.skillCreator.createSkill(analysis.skill);
                    }
                    for (const fact of analysis.memory_facts || []) {
                        await this.memoryManager.storeMemory(fact, fact);
                    }
                    console.log(`[Meta-CEO] Applied Critic recommendations`);
                }
            }
        } catch (error) {
            console.error(`[Meta-CEO] Error in interveneForLowSuccess: ${error.message}`);
        }
    }

    async interveneForSkills() {
        console.log(`[Meta-CEO] Creating starter skills...`);

        const starterPatterns = [
            'прочитай файл',
            'сколько файлов',
            'вычисли',
            'прочитай репозиторий',
            'какой hostname'
        ];

        for (const pattern of starterPatterns) {
            const trajectory = await this.critic.generateTrajectory(pattern);
            if (trajectory) {
                await this.skillCreator.createSkillFromTrajectory(pattern, trajectory);
            }
        }
    }

    async interveneForMemory() {
        console.log(`[Meta-CEO] Enriching memory...`);

        const facts = [
            'Проект CEO Agent System — self-hosted AI agent',
            'Архитектура: CEO + Translator + Executor + Compiler + Critic',
            'Paperclip — orchestration framework',
            'LLM модели: Saiga 8B, Qwen 7B, SmolLM2 3.6B',
            'FreeQwenApi: http://localhost:3264/api (Qwen 3.7 Max)',
            'Hermes Agent v0.16.0 — Meta-CEO (parent-mentor)',
            'Executor НЕ имеет skills — получает готовые инструкции',
            'Skills принадлежат CEO и Meta-CEO (thinkers), не Executor (doer)'
        ];

        for (const fact of facts) {
            await this.memoryManager.storeMemory(fact, fact);
        }
    }

    groupByPattern(tasks) {
        const patterns = {};
        for (const task of tasks) {
            const pattern = this.extractPattern(task.description || task.title || '');
            if (!patterns[pattern]) {
                patterns[pattern] = [];
            }
            patterns[pattern].push(task);
        }
        return patterns;
    }

    extractPattern(description) {
        return description
            .replace(/\d+/g, 'NUMBER')
            .replace(/\b\w+\.\w+\b/g, 'FILE')
            .toLowerCase()
            .substring(0, 50);
    }
}

module.exports = MetaCeoIntegration;

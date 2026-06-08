// critic_intervention.js — вызывает Critic для топ-паттернов и создаёт skills
const fs = require('fs');
const CriticAgent = require('./criticAgent');
const SkillAutoCreator = require('./skillAutoCreator');

async function runIntervention() {
    console.log(`[Intervention] Starting Critic intervention...`);

    const critic = new CriticAgent();
    const skillCreator = new SkillAutoCreator();

    // Загрузи паттерны
    const data = JSON.parse(fs.readFileSync('failed_patterns.json', 'utf8'));
    const patterns = data.patterns.filter(p => p.pattern !== 'other'); // skip 'other' — too diverse

    console.log(`[Intervention] Found ${patterns.length} patterns to process`);
    console.log(`[Intervention] Current stats: ${data.done}/${data.total} done (${data.success_rate}%)`);

    const createdSkills = [];

    for (const patternData of patterns) {
        console.log(`\n[Intervention] === Processing pattern: ${patternData.pattern} (${patternData.count} tasks) ===`);

        const exampleTask = patternData.examples[0];
        console.log(`[Intervention] Example: "${exampleTask}"`);

        // Вызови Critic для генерации trajectory
        console.log(`[Intervention] Calling Critic (Qwen 3.7 Max)...`);
        const trajectory = await critic.generateTrajectory(exampleTask);

        if (trajectory && trajectory.trajectory && trajectory.trajectory.length > 0) {
            console.log(`[Intervention] Trajectory generated:`);
            console.log(JSON.stringify(trajectory, null, 2));

            // Создай skill из trajectory
            const skillName = `skill-${patternData.pattern}-${Date.now()}`;
            console.log(`[Intervention] Creating skill: ${skillName}...`);

            const skillId = await skillCreator.createSkillFromTrajectory(
                patternData.pattern,
                trajectory
            );

            createdSkills.push({
                pattern: patternData.pattern,
                skillId: skillId,
                trajectory: trajectory.trajectory,
                reasoning: trajectory.reasoning
            });
            console.log(`[Intervention] Skill created: ${skillId}`);
        } else {
            console.log(`[Intervention] Failed to generate trajectory for ${patternData.pattern}`);
            if (trajectory) console.log(`  Raw response: ${JSON.stringify(trajectory)}`);
        }
    }

    // Сохрани отчёт
    const report = {
        timestamp: new Date().toISOString(),
        patternsProcessed: patterns.length,
        skillsCreated: createdSkills.length,
        createdSkills,
        previousSuccessRate: data.success_rate
    };

    fs.writeFileSync('critic_intervention_result.json', JSON.stringify(report, null, 2));
    console.log(`\n[Intervention] === INTERVENTION COMPLETE ===`);
    console.log(`[Intervention] Patterns processed: ${patterns.length}`);
    console.log(`[Intervention] Skills created: ${createdSkills.length}`);
    console.log(`[Intervention] Report saved to critic_intervention_result.json`);
}

runIntervention().catch(err => {
    console.error(`[Intervention] Fatal error:`, err);
    process.exit(1);
});

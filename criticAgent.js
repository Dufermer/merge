const fetch = require('node-fetch');

class CriticAgent {
    constructor() {
        this.qwenEndpoint = 'http://localhost:3264/api';
        this.model = 'qwen3.7-max';
        this.apiKey = 'dummy-key';
    }

    async analyzeFailure(taskDescription, ceoResponse, logs) {
        console.log(`[Critic] Analyzing failure for: "${taskDescription}"`);
        const prompt = `You are a wise AI mentor analyzing why a junior CEO agent failed a task.

Task: "${taskDescription}"

CEO Response: ${JSON.stringify(ceoResponse, null, 2)}

Recent Logs:
${(logs || []).slice(-20).join('\n')}

Analyze:
1. What went wrong?
2. What knowledge/skill is missing?
3. How should the CEO handle this in the future?

Generate a trajectory (step-by-step solution) that the CEO can learn from:

Trajectory:
1. [step 1]
2. [step 2]
3. [step 3]

Skill to create:
- Name: [skill name]
- Pattern: [pattern to match similar tasks]
- Steps: [array of tool calls]

Memory facts to add:
- [fact 1]
- [fact 2]

Respond in JSON:
{
  "analysis": "...",
  "trajectory": [...],
  "skill": {...},
  "memory_facts": [...]
}`;

        try {
            const response = await fetch(`${this.qwenEndpoint}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        { role: 'user', content: prompt }
                    ],
                    stream: false
                })
            });
            const data = await response.json();
            const content = data.choices[0].message.content;

            // Parse JSON from response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return { analysis: content, trajectory: [], skill: null, memory_facts: [] };
        } catch (error) {
            console.error(`[Critic] Error: ${error.message}`);
            return null;
        }
    }

    async generateTrajectory(taskDescription) {
        console.log(`[Critic] Generating trajectory for: "${taskDescription}"`);

        const prompt = `You are a wise AI mentor. Generate an optimal trajectory for this task:

Task: "${taskDescription}"

Trajectory (step-by-step solution):
1. [tool call or action]
2. [tool call or action]
3. [tool call or action]

Available tools:
- read_file(path)
- write_file(path, content)
- terminal_exec(command)
- calculate(expression)
- list_files(path)
- web_fetch(url)
- search(query)

Respond in JSON:
{
  "trajectory": [
    { "tool": "read_file", "params": {"path": "..."} },
    { "tool": "calculate", "params": {"expression": "..."} }
  ],
  "reasoning": "why this approach is optimal"
}`;

        try {
            const response = await fetch(`${this.qwenEndpoint}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        { role: 'user', content: prompt }
                    ],
                    stream: false
                })
            });
            const data = await response.json();
            const content = data.choices[0].message.content;

            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return { trajectory: [], reasoning: content };
        } catch (error) {
            console.error(`[Critic] Error: ${error.message}`);
            return null;
        }
    }
}

module.exports = CriticAgent;

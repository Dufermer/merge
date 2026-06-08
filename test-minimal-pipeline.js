const fs = require('fs').promises;

// ШАГ 1: Создать тестовый файл
async function setup() {
    await fs.mkdir('C:\\Users\\rus\\Desktop\\merge\\data', { recursive: true });
    await fs.writeFile('C:\\Users\\rus\\Desktop\\merge\\data\\test.txt', 'Hello from minimal pipeline test!');
    console.log('✅ Test file created: data/test.txt');
}

// ШАГ 2: Вызвать Translator напрямую
async function callTranslator(userInput) {
    console.log(`\n[Translator] Input: "${userInput}"`);

    try {
        const http = require('http');
        // Use the same prompt format as the actual translator adapter
        const messages = [
            { role: "system", content: "ТЫ ПАРСЕР. ОТДАЙ ТОЛЬКО JSON. НИ СЛОВА БОЛЬШЕ." },
            { role: "user", content: userInput }
        ];
        const data = JSON.stringify({
            model: "saiga_llama3_8b",
            messages,
            temperature: 0.0,
            max_tokens: 256
        });

        const result = await new Promise((resolve, reject) => {
            const opts = {
                hostname: '127.0.0.1', port: 8081, path: '/v1/chat/completions',
                method: 'POST', timeout: 30000,
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
            };
            const req = http.request(opts, (res) => {
                let d = ''; res.on('data', c => d += c);
                res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
            });
            req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
            req.write(data); req.end();
        });

        const content = result.choices?.[0]?.message?.content || '';
        console.log(`[Translator] Raw: ${content.slice(0, 300)}`);

        // Try to parse JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                console.log(`[Translator] Parsed:`, JSON.stringify(parsed));
                return parsed;
            } catch (e) {
                console.error(`[Translator] JSON parse error: ${e.message}`);
            }
        }
        return null;
    } catch (error) {
        console.error(`[Translator] Error: ${error.message}`);
        return null;
    }
}

// ШАГ 3: Вызвать Executor напрямую
async function callExecutor(translatorResult) {
    // Extract tool call from Translator's JSON format
    const toolName = translatorResult.params?.tool || 'read_file';
    const filePath = translatorResult.params?.path || translatorResult.params?.file || '';

    console.log(`\n[Executor] Translator result:`, JSON.stringify(translatorResult));
    console.log(`[Executor] Tool: ${toolName}, Path: ${filePath}`);

    if (toolName !== 'read_file' && toolName !== 'read') {
        console.error(`[Executor] Unknown tool: ${toolName}`);
        return null;
    }

    try {
        // Try path as-is, then with CWD prefix
        const paths = [filePath, `C:\\Users\\rus\\Desktop\\merge\\${filePath}`];
        let content = null;
        for (const p of paths) {
            try {
                content = await fs.readFile(p, 'utf8');
                break;
            } catch {}
        }
        if (content === null) throw new Error(`File not found: ${filePath}`);

        console.log(`[Executor] Content: "${content}"`);
        return { success: true, content };
    } catch (error) {
        console.error(`[Executor] Error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// ШАГ 4: Запустить минимальный пайплайн
async function runMinimalPipeline() {
    console.log('=== MINIMAL PIPELINE TEST ===\n');

    await setup();

    const userInput = 'прочитай файл data/test.txt';
    const toolCall = await callTranslator(userInput);

    if (!toolCall) {
        console.error('\n❌ FAILED: Translator did not return valid tool call');
        return;
    }

    const result = await callExecutor(toolCall);

    if (!result || !result.success) {
        console.error('\n❌ FAILED: Executor did not execute successfully');
        return;
    }

    console.log('\n✅ SUCCESS: Minimal pipeline works!');
    console.log(`Final answer: ${result.content}`);
}

runMinimalPipeline().catch(console.error);

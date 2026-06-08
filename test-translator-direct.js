async function testTranslator() {
    try {
        const http = require('http');
        const data = JSON.stringify({
            prompt: 'Parse this user request into JSON with intent and target: "прочитай файл data/test.txt"',
            n_predict: 200,
            temperature: 0.1
        });
        const opts = {
            hostname: '127.0.0.1',
            port: 8081,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            },
            timeout: 30000
        };
        const result = await new Promise((resolve, reject) => {
            const req = http.request(opts, (res) => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => {
                    try { resolve(JSON.parse(d)); }
                    catch (e) { reject(new Error('JSON parse: ' + e.message)); }
                });
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
            req.write(data);
            req.end();
        });
        const content = result.choices?.[0]?.message?.content || '';
        console.log('✅ Translator responds:');
        console.log(`   Raw: ${content.slice(0, 200)}`);
        try {
            const parsed = JSON.parse(content);
            console.log(`   Intent: ${parsed.intent}`);
            console.log(`   Target: ${parsed.target}`);
        } catch {
            console.log('   (not valid JSON)');
        }
        return true;
    } catch (error) {
        console.error('❌ Translator failed:');
        console.error(`   Error: ${error.message}`);
        return false;
    }
}
testTranslator().then(success => { process.exit(success ? 0 : 1); });

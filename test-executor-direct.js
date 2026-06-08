const fs = require('fs').promises;
async function testReadFile() {
    try {
        await fs.mkdir('C:\\Users\\rus\\Desktop\\merge\\data', { recursive: true });
        await fs.writeFile('C:\\Users\\rus\\Desktop\\merge\\data\\test.txt', 'Hello from Executor test!');
        const content = await fs.readFile('C:\\Users\\rus\\Desktop\\merge\\data\\test.txt', 'utf8');
        console.log('✅ Executor.read_file works:');
        console.log(`   Content: ${content}`);
        return true;
    } catch (error) {
        console.error('❌ Executor.read_file failed:');
        console.error(`   Error: ${error.message}`);
        return false;
    }
}
testReadFile().then(success => { process.exit(success ? 0 : 1); });

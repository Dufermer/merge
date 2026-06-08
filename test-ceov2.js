// test-ceov2.js — Тест CEO Agent v2 с agent loop
const ceoV2 = require('./ceoAgentV2');
const { runAgentLoop } = require('./hermes-wrapper');

async function runTests() {
  console.log('=== CEO AGENT V2 TESTS ===\n');

  // TEST 0: Direct agent loop test (read_file)
  console.log('--- TEST 0: Agent loop read_file ---');
  const r0 = await runAgentLoop('прочитай файл data/test.txt');
  console.log(`Result: ${r0.answer}`);
  console.log(`Turns: ${r0.turns}, Time: ${r0.timeMs}ms`);
  console.log('');

  // TEST 1: Simple math
  console.log('--- TEST 1: Math (2+2) ---');
  const r1 = await ceoV2.processTask('сколько будет 2+2');
  console.log(`Answer: ${r1.answer}`);
  console.log(`Turns: ${r1.turns}, Time: ${r1.timeMs}ms`);
  console.log('');

  // TEST 2: File read via CEO
  console.log('--- TEST 2: File read ---');
  const r2 = await ceoV2.processTask('прочитай файл C:\\Users\\rus\\Desktop\\merge\\data\\test.txt');
  console.log(`Answer: ${r2.answer}`);
  console.log(`Turns: ${r2.turns}, Time: ${r2.timeMs}ms`);
  console.log('');

  // TEST 3: Memory (repeat test 1)
  console.log('--- TEST 3: Memory (repeat 2+2) ---');
  const r3 = await ceoV2.processTask('сколько будет 2+2');
  console.log(`Answer: ${r3.answer}`);
  console.log(`Turns: ${r3.turns}, Time: ${r3.timeMs}ms, fromMemory: ${r3.fromMemory}`);
  console.log('');

  // Summary
  console.log('=== SUMMARY ===');
  const tests = [r0, r1, r2, r3];
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    console.log(`  Test ${i}: ${t.turns}turns ${t.timeMs}ms "${t.answer.slice(0, 50)}"`);
  }
}

runTests().catch(e => console.log('FATAL:', e.message));

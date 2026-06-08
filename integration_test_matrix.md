# Integration Test Matrix — All 21 Tests

## Simple (Fallback FIRST, 10-100ms)
1. Math: "сколько будет 2+2?" → "4"
2. Math: "15*3" → "45"
3. File read: "прочитай файл data/test.txt" → file content
4. File list: "сколько файлов в директории data/?" → count
5. Date: "какая сегодня дата?" → date/time
6. Hostname: "какой у меня hostname?" → computer name
7. IP: "какой у меня IP?" → ipconfig

## Complex (Agent Loop, 2000-3000ms)
8. DAG 3-step: "прочитай config.json, найди порт, умножь на 2" → "Порт: X, результат: Y"
9. DAG 4-step: "прочитай config.json, найди порт, умножь на 10, отчитайся" → report
10. Web fetch GitHub: "анализ https://github.com/nousresearch/hermes-agent" → README
11. Web fetch web: "что на https://example.com" → HTML

## Delegation
12. Simple delegate: "прочитай файл data/test.txt" → sub-issue → done
13. URL no-delegate: "прочитай https://example.com" → CEO does NOT delegate

## Memory & Skills
14. Memory hit: "сколько будет 2+2?" → 4 (from memory, <50ms)
15. Skill reuse: [repeat test 8] → faster (<1000ms)
16. Same question different path: "прочитай data/test.txt" → file content

## Security
17. Blocked command: "удали все файлы" → blocked, status=failed
18. Blocked shutdown: "перезагрузи компьютер" → blocked, status=failed

## Stress
19. Parallel 3 tasks: 3 math tasks simultaneously → all done
20. Repeated 5x: same file read 5 times → consistent results
21. Error recovery: non-existent file → graceful error, NOT infinite loop

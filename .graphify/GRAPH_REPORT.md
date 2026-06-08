# Graph Report - .  (2026-06-08)

## Corpus Check
- Corpus is ~24 922 words - fits in a single context window. You may not need a graph.

## Summary
- 40 nodes · 44 edges · 6 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: contains: 32 · calls: 8 · method: 4


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 38 · Candidates: 61
- Excluded: 1 untracked · 14910 ignored · 0 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `55e3eff`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `DatabaseConnector` - 5 edges
2. `handleUserLogin()` - 4 edges
3. `findLevels()` - 3 edges
4. `executeNode()` - 3 edges
5. `findUserByUsername()` - 3 edges
6. `httpRequest()` - 2 edges
7. `writeState()` - 2 edges
8. `topologicalSort()` - 2 edges
9. `orchestrateDag()` - 2 edges
10. `generateToken()` - 2 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.18
Nodes (9): ERROR_RECOVERY_PATH, EXECUTOR_DIR, MEMORY_MANAGER_PATH, MULTI_STRATEGY_PATH, os, path, PROJECT_CONTEXT_PATH, SKILL_CREATOR_PATH (+1 more)

### Community 1 - "Community 1"
Cohesion: 0.29
Nodes (7): crypto, findUserByUsername(), generateToken(), handleUserLogin(), hashPassword(), jwt, validatePassword()

### Community 2 - "Community 2"
Cohesion: 0.33
Nodes (4): fs, http, https, path

### Community 3 - "Community 3"
Cohesion: 0.40
Nodes (1): DatabaseConnector

### Community 4 - "Community 4"
Cohesion: 0.67
Nodes (3): executeNode(), httpRequest(), writeState()

### Community 5 - "Community 5"
Cohesion: 0.67
Nodes (3): findLevels(), orchestrateDag(), topologicalSort()

## Knowledge Gaps
- **15 isolated node(s):** `path`, `os`, `EXECUTOR_DIR`, `MEMORY_MANAGER_PATH`, `SKILL_MANAGER_PATH` (+10 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 3`** (1 nodes): `DatabaseConnector`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DatabaseConnector` connect `Community 3` to `Community 1`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `findLevels()` connect `Community 5` to `Community 2`?**
  _High betweenness centrality (0.001) - this node is a cross-community bridge._
- **What connects `path`, `os`, `EXECUTOR_DIR` to the rest of the system?**
  _15 weakly-connected nodes found - possible documentation gaps or missing edges._
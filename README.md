# vscode-cscout

## Demo

[![CScout VS Code Extension Demo](https://img.youtube.com/vi/eaO7j1sIIhA/0.jpg)](https://www.youtube.com/watch?v=eaO7j1sIIhA)

---

## The Idea

CScout already does the hard work: it parses whole C programs, builds equivalence classes of identifiers across files, computes metrics, and tracks every token location. What it lacks is a modern IDE interface. Right now its only UI is a web browser pointed at its built-in HTTP server, navigating plain HTML pages.

The goal of this project is to give CScout a proper VS Code interface, so you can explore cross-references, jump to definitions, see call graphs, and get diagnostics all inside the editor, without leaving it.

---

## How It Would Work (the Real Flow)

In the actual GSoC implementation:

1. You run CScout on your C project as usual (`cscout make.cs`), it starts its HTTP server on port 8081
2. You open that project folder in VS Code
3. You run **CScout: Connect to Running Server** in the command palette
4. The extension queries CScout via REST endpoints and populates the sidebar

The extension talks to CScout **only over HTTP**. It never touches any database file directly. CScout answers queries from its own in-memory data structures. The VS Code side doesn't need to know anything about CScout's internals.

---

## What This POC Demonstrates

CScout doesn't have REST endpoints yet, that's what needs to be built in C++ as the core GSoC work. So this POC includes a **mock server** that simulates those endpoints using a sample SQLite database, allowing the full extension experience to be demonstrated on any machine without a running CScout binary.

The mock server is scaffolding. The extension itself is written so that swapping the mock for a real CScout binary requires **zero changes** to the TypeScript code, they speak the same HTTP contract.

### What you can try right now

- **Project Explorer**: browse the sample project's files grouped by project
- **File Metrics**: lines, statements, operators, nesting depth, unique identifiers per file; right-click inside any open C file → *Show File Metrics* to reveal it in the sidebar
- **Identifier Browser**: all identifiers grouped by kind (functions, macros, typedefs, struct tags, struct members, variables); expand any entry to see every source location with one-click navigation
- **Call Graph**: expand any function to drill into its callers and callees; place cursor on a function name and right-click → *Show Call Graph* to focus on it
- **Hover Info**: hover on any C identifier and get a tooltip showing its kind (function, macro, typedef, etc.), whether it's unused, and whether it's from a read-only header
- **Go-to-Definition**: Ctrl+Click on any identifier to jump to all its definition locations across the project (returns all locations, not just the first one)
- **Diagnostics**: unused identifiers show up as warnings in VS Code's Problems panel automatically after connecting
- **Find Unused Identifiers**: lists everything CScout marks as unused in the output panel
- **Disconnect / Refresh**: disconnect from the server or refresh all analysis data without reconnecting

---

## Proposed REST API

These are the endpoints this POC implements in the mock server and that would need to be added to CScout's C++ source:

| Endpoint | Returns |
|---|---|
| `GET /api/identifiers` | All identifiers with type flags |
| `GET /api/identifiers?unused=true` | Filtered to unused identifiers |
| `GET /api/identifiers/:eid` | Single identifier by equivalence class ID |
| `GET /api/identifiers/:eid/locations` | Every token location: `[{file, line, col}]` |
| `GET /api/files` | All files in the analysis |
| `GET /api/files/:fid/metrics` | File-level metrics (NLINE, NSTMT, NOP, …) |
| `GET /api/functions` | All functions |
| `GET /api/functions/:id/callers` | Functions that call this one |
| `GET /api/functions/:id/callees` | Functions this one calls |
| `GET /api/projects` | All projects in the workspace |
| `GET /api/projects/:pid/files` | Files belonging to a project |

---

## Setup

```bash
cd vscode-cscout
npm install
npm run compile
```

### Run With the Mock Server

```bash
# Terminal 1: start the mock server
npm run server

# Terminal 2: launch the extension in a VS Code dev window
code --extensionDevelopmentPath="$(pwd)"
```

Then press `Ctrl+Shift+P` → **CScout: Connect to Running Server**.

The mock server loads `sample/sample-cscout.db` (a small synthetic C project, an arithmetic calculator) and serves all `/api/…` endpoints from it.

> **Note:** Running against a real CScout binary is not possible yet, CScout doesn't expose REST endpoints. Adding those endpoints to CScout's C++ source is the core deliverable of the GSoC project.

### Tests (Generated using AI)

```bash
npm test
```

47 tests covering the database query layer, the HTTP client, and all REST endpoints.

---

## Project Structure

```
src/
├── extension.ts                # Entry point, commands, tree view wiring
├── db/
│   └── cscoutDatabase.ts       # Direct SQLite access (sql.js/WASM), used in tests
├── services/
│   ├── cscoutServer.ts         # HTTP client for CScout's REST API
│   └── cscoutService.ts        # CScout process launcher (cscout -s sqlite)
├── providers/
│   ├── definitionProvider.ts   # Go-to-definition via REST API
│   ├── diagnosticsProvider.ts  # Unused identifier warnings in Problems panel
│   └── hoverProvider.ts        # Hover tooltips: kind, unused status, EID
├── views/
│   ├── projectsTree.ts         # Project/file explorer
│   ├── metricsTree.ts          # Per-file metrics panel
│   ├── identifiersTree.ts      # Identifier browser by category
│   └── callGraphTree.ts        # Function call graph view
├── scripts/
│   ├── mockServer.ts           # Mock CScout server for development/demo
│   └── generateSampleDb.ts     # Generates sample/sample-cscout.db from sample C files
└── test/
    ├── cscoutDatabase.test.ts  # 20 tests DB query layer
    ├── cscoutServer.test.ts    # 10 tests HTTP client and HTML parsers
    └── jsonEndpoint.test.ts    # 17 tests REST endpoint contract
sample/
├── calc/                       # Sample C project (arithmetic calculator)
│   ├── main.c, calc.c, calc.h, utils.c, utils.h
└── sample-cscout.db            # Pre-generated SQLite database for the sample project
```

---

## What Remains for the Actual GSoC Project

This POC covers the VS Code extension side. The larger part of the work is on the CScout side:

- **REST endpoints in CScout C++**: implementing the `/api/…` handlers in `src/cscout.cpp` using CScout's existing internal data structures
- **`RenameProvider`**: fetch all locations for an identifier's equivalence class, show a diff preview, apply the workspace edit atomically
- **`CodeLensProvider`**: inline codelens showing call counts, fan-in, complexity
- **WebView call graph**: a proper interactive graph visualization beyond the tree view
- **Testing on real projects**: validation against large C codebases (e.g., the sample `awk` project included with CScout)

---


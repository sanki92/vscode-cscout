# vscode-cscout

## Demo

[![CScout VS Code Extension Demo](https://img.youtube.com/vi/eaO7j1sIIhA/0.jpg)](https://www.youtube.com/watch?v=eaO7j1sIIhA)

## The Idea

CScout parses whole C programs, builds equivalence classes of identifiers across files, computes metrics, and tracks every token location. Its only UI today is a browser pointed at its built-in SWILL HTTP server. This project adds a proper VS Code interface on top of a new REST API layer.

## How It Works

```mermaid
flowchart LR
    subgraph ext[VS Code Extension]
        direction TB
        trees[Tree Views]
        hover[Hover Provider]
        defn[Definition Provider]
        diag[Diagnostics]
    end

    subgraph cscout[CScout Process]
        direction TB
        api["restapi.cpp (9 endpoints)"]
        swill[SWILL HTTP Server]
        mem[In-memory Analysis]
        api --> swill --> mem
    end

    ext <-->|"JSON over HTTP :8081"| cscout
```

1. Run CScout on your C project (`cscout your-workspace.cs`). It starts listening on port 8081.
2. Open the project folder in VS Code.
3. Run **CScout: Connect to Running Server** from the command palette.
4. The extension probes `/api/projects`. If the REST API exists, it loads data into the sidebar. If not, it falls back to HTML scraping.

## What This POC Demonstrates

Two parts:

1. **REST API endpoints** in CScout's C++ source ([`feat/rest-api` branch](https://github.com/sanki92/cscout/tree/feat/rest-api)). A self-contained `restapi.cpp` registers 9 JSON endpoints with SWILL.
2. **VS Code extension** consuming those endpoints.

A **mock server** backed by a sample SQLite DB lets you try the full UI without compiling CScout. The mock and real CScout serve the same `/api/...` endpoints, so the extension code is identical in both cases. The mock is a dev/test fixture only.

### Features

| Feature | Mock | Real CScout |
|---|---|---|
| Project Explorer | Yes | Yes |
| File Metrics | Yes | Yes |
| Identifier Browser (grouped by kind, clickable locations) | Yes | Yes |
| Call Graph (callers/callees tree) | Yes | Yes |
| Hover (identifier kind, unused, readonly) | Yes | Yes |
| Go-to-Definition (F12 / Ctrl+Click) | Yes (exact column) | Yes (line-level) |
| Diagnostics (unused identifiers in Problems panel) | Yes | Yes |
| Find Unused Identifiers | Yes | Yes |

Go-to-Definition in real mode jumps to the correct file and line. Column-level precision will be added in a future iteration.

## REST API Endpoints

Implemented in `restapi.cpp`, consumed by the extension:

| Endpoint | Returns |
|---|---|
| `GET /api/projects` | All projects |
| `GET /api/project_files?pid=N` | Files in project N |
| `GET /api/files` | All files. Filters: `writable`, `pid`, `limit`, `offset` |
| `GET /api/filemetrics?fid=N` | Per-file metrics |
| `GET /api/identifiers` | All identifiers. Filters: `unused`, `writable`, `limit`, `offset` |
| `GET /api/identifier?eid=N` | Single identifier + token locations |
| `GET /api/functions` | All functions. Filters: `defined`, `limit`, `offset` |
| `GET /api/function?id=N` | Single function + `callers`/`callees` |
| `GET /api/source?fid=N` | Source lines as JSON array |

All endpoints return `application/json`. Query parameters used throughout (SWILL does not support path parameters).

## Setup

```bash
cd vscode-cscout
npm install
npm run compile
```

### Mock server

```bash
npm run server          # Terminal 1: starts mock on :8081
code --extensionDevelopmentPath="$(pwd)"  # Terminal 2: dev window
```

Then run **CScout: Connect to Running Server**. The mock loads `sample/sample-cscout.db` (~96 KB, a small arithmetic calculator project).

### Real CScout

```bash
git clone https://github.com/sanki92/cscout && cd cscout
git checkout feat/rest-api
make
cd example && ../src/cscout awk.cs
```

Then connect from VS Code. Cygwin (`/cygdrive/f/...`) and WSL (`/mnt/f/...`) paths are automatically normalized to Windows paths.

### Tests (Generated using AI)

```bash
npm test   # 47 tests: DB layer, HTTP client, REST endpoint contracts
```

## Project Structure

### CScout C++ (REST API layer)

```
src/
├── restapi.h          # Declares rest_api_register()
├── restapi.cpp        # 9 endpoint handlers, ID maps, JSON helpers
│   ├── json_escape()          RFC 8259 escaping (U+0000..U+001F)
│   ├── build_id_maps()        stable integer IDs for Eclass*/Call*
│   ├── api_projects()         GET /api/projects
│   ├── api_project_files()    GET /api/project_files?pid=N
│   ├── api_files()            GET /api/files
│   ├── api_file_metrics()     GET /api/filemetrics?fid=N
│   ├── api_identifiers()      GET /api/identifiers
│   ├── api_identifier()       GET /api/identifier?eid=N
│   ├── api_functions()        GET /api/functions
│   ├── api_function()         GET /api/function?id=N
│   ├── api_source()           GET /api/source?fid=N
│   └── rest_api_register()    registers all handlers with swill_handle()
├── cscout.cpp         # +1 include, +1 function call
└── Makefile           # +restapi.o in link step
```

SWILL CRLF fix (6 lines in `swill/Source/SWILL/web.c`) is committed separately in SWILL: [sanki92/swill fix/crlf-http-headers](https://github.com/sanki92/swill/tree/fix/crlf-http-headers).

### VS Code Extension

```
vscode-cscout/
├── package.json
├── src/
│   ├── extension.ts           # Entry point, commands, REST vs HTML mode branching
│   ├── services/
│   │   └── cscoutServer.ts    # HTTP client (HTTP-first, TCP fallback on transport error)
│   ├── db/
│   │   └── cscoutDatabase.ts  # sql.js/WASM SQLite for mock + tests
│   ├── providers/
│   │   ├── definitionProvider.ts   # F12 / Ctrl+Click
│   │   ├── diagnosticsProvider.ts  # Unused identifiers in Problems panel
│   │   └── hoverProvider.ts        # Hover tooltips
│   ├── views/
│   │   ├── projectsTree.ts    # Projects -> files tree
│   │   ├── metricsTree.ts     # Per-file metrics
│   │   ├── identifiersTree.ts # Identifiers grouped by kind
│   │   └── callGraphTree.ts   # Callers/callees tree
│   ├── scripts/
│   │   ├── mockServer.ts      # Express mock server (dev/demo only)
│   │   └── generateSampleDb.ts
│   └── test/                  # 47 tests across 3 suites
└── sample/
    ├── calc/                  # Sample C project
    └── sample-cscout.db
```

## What Remains for GSoC

- **RenameProvider**: workspace-wide rename via equivalence class locations
- **CodeLensProvider**: inline call counts, fan-in, cyclomatic complexity
- **Column-level precision**: return column offsets from the C++ API
- **WebView call graph**: interactive visualization beyond the tree view
- **Function metrics endpoint**: per-function metrics alongside file metrics

## Design Decisions

**Separate module.** All endpoints live in `restapi.cpp`. The only change to `cscout.cpp` is one `#include` and one call to `rest_api_register()`. Small diff against upstream, independently reviewable.

**Stable integer IDs.** CScout uses `Eclass*` and `Call*` pointers internally. Exposing raw addresses would be ASLR-dependent and non-portable. `build_id_maps()` assigns sequential integers on first use, stable for the process lifetime.

**Stateless project scoping.** The original web UI sets a global `current_project` server-side. The REST API uses `?pid=N` per request instead, so concurrent clients don't interfere.

**Pagination.** `?limit=N&offset=M` on collection endpoints. The extension fetches in bounded pages with a progress indicator.

**SWILL CRLF fix.** SWILL's `swill_dump_page()` used `\n` in HTTP response headers; RFC 7230 requires `\r\n`. Patched in `swill/Source/SWILL/web.c` (6 lines), branch: [sanki92/swill fix/crlf-http-headers](https://github.com/sanki92/swill/tree/fix/crlf-http-headers). The extension uses Node's `http` module as primary transport, with a raw TCP fallback that accepts both `\r\n` and `\n` for environments where SWILL hasn't been rebuilt. HTTP-level errors (400, 404) are not retried over TCP.

**HTML fallback.** If `/api/projects` doesn't exist (stock CScout without the REST patch), the extension falls back to scraping HTML pages. Works with any CScout installation today.

**Cygwin/WSL path normalization.** CScout under Cygwin/WSL returns `/cygdrive/f/...` or `/mnt/f/...` paths. Normalized to Windows drive paths automatically (win32 only, no-op on Linux).

**Input validation.** Every endpoint validates ID parameters and returns `400`/`404` with a JSON error body.

**RFC 8259 JSON escaping.** `json_escape()` covers the full U+0000..U+001F control range.

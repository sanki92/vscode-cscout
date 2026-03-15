import * as vscode from 'vscode';
import * as fs from 'fs';
import { CScoutServer, ServerIdentifier } from '../services/cscoutServer';

const DIAG_COLLECTION = vscode.languages.createDiagnosticCollection('cscout');

export class CScoutDiagnostics {
    private static async mapWithConcurrency<T, R>(
        items: T[],
        concurrency: number,
        worker: (item: T) => Promise<R>
    ): Promise<R[]> {
        if (items.length === 0) { return []; }
        const results = new Array<R>(items.length);
        let index = 0;
        const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
            while (true) {
                const current = index;
                index++;
                if (current >= items.length) { break; }
                results[current] = await worker(items[current]);
            }
        });
        await Promise.all(workers);
        return results;
    }

    static async refresh(server: CScoutServer) {
        DIAG_COLLECTION.clear();

        const diagMap = new Map<string, vscode.Diagnostic[]>();

        // Unused identifiers via REST (paged to avoid unbounded fetches)
        const cfg = vscode.workspace.getConfiguration('cscout');
        const pageSize = Math.max(50, cfg.get<number>('initialLoadPageSize', 500));
        const maxDiagIdentifiers = Math.max(
            pageSize,
            cfg.get<number>('maxDiagnosticsIdentifiers', 1500)
        );

        let unused: ServerIdentifier[];
        try {
            unused = [];
            let offset = 0;
            while (unused.length < maxDiagIdentifiers) {
                const limit = Math.min(pageSize, maxDiagIdentifiers - unused.length);
                if (limit <= 0) { break; }
                const page = await server.getIdentifiers({
                    unused: true,
                    limit,
                    offset,
                });
                if (!page.length) { break; }
                unused.push(...page);
                if (page.length < limit) { break; }
                offset += page.length;
            }
        } catch {
            return;
        }

        const perIdDiagnostics = await this.mapWithConcurrency(unused, 6, async (id) => {
            try {
                const locations = await server.getIdentifierLocations(id.eid);
                const rows: Array<{ file: string; diag: vscode.Diagnostic }> = [];
                for (const loc of locations) {
                    if (!fs.existsSync(loc.file)) { continue; }

                    const range = new vscode.Range(
                        Math.max(0, loc.line - 1), Math.max(0, loc.col),
                        Math.max(0, loc.line - 1), Math.max(0, loc.col + id.name.length)
                    );

                    const diag = new vscode.Diagnostic(
                        range,
                        `Unused identifier: '${id.name}' (CScout whole-program analysis)`,
                        vscode.DiagnosticSeverity.Warning,
                    );
                    diag.source = 'CScout';
                    diag.code = 'unused-identifier';
                    rows.push({ file: loc.file, diag });
                }
                return rows;
            } catch {
                return [];
            }
        });

        for (const rows of perIdDiagnostics) {
            for (const row of rows) {
                const bucket = diagMap.get(row.file) ?? [];
                bucket.push(row.diag);
                diagMap.set(row.file, bucket);
            }
        }

        for (const [filePath, diags] of diagMap) {
            DIAG_COLLECTION.set(vscode.Uri.file(filePath), diags);
        }
    }

    static clear() {
        DIAG_COLLECTION.clear();
    }
}

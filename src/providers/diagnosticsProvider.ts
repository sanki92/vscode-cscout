import * as vscode from 'vscode';
import * as fs from 'fs';
import { CScoutDatabase } from '../db/cscoutDatabase';

const DIAG_COLLECTION = vscode.languages.createDiagnosticCollection('cscout');

export class CScoutDiagnostics {
    static refresh(db: CScoutDatabase) {
        DIAG_COLLECTION.clear();

        const diagMap = new Map<string, vscode.Diagnostic[]>();

        // Unused identifiers
        const unused = db.getUnusedIdentifiers();
        for (const id of unused) {
            const locs = db.getIdentifierLocations(id.eid);
            for (const loc of locs) {
                if (!fs.existsSync(loc.filePath)) { continue; }

                const range = new vscode.Range(
                    loc.line - 1, loc.column,
                    loc.line - 1, loc.column + id.name.length
                );

                const diag = new vscode.Diagnostic(
                    range,
                    `Unused identifier: '${id.name}'`,
                    vscode.DiagnosticSeverity.Warning,
                );
                diag.source = 'CScout';
                diag.code = 'unused-identifier';

                const key = loc.filePath;
                if (!diagMap.has(key)) { diagMap.set(key, []); }
                diagMap.get(key)!.push(diag);
            }
        }

        // High cyclomatic complexity
        const functions = db.getFunctions(5000);
        for (const fn of functions) {
            if (!fn.defined) { continue; }
            const metrics = db.getFunctionMetrics(fn.id);
            if (!metrics) { continue; }

            const ccycl = (metrics as any).CCYCL1;
            if (typeof ccycl === 'number' && ccycl > 15) {
                const loc = db.getFunctionLocation(fn.id);
                if (!loc || !fs.existsSync(loc.filePath)) { continue; }

                const range = new vscode.Range(
                    loc.line - 1, loc.column,
                    loc.line - 1, loc.column + fn.name.length
                );

                const diag = new vscode.Diagnostic(
                    range,
                    `High cyclomatic complexity: ${fn.name}() = ${ccycl} (threshold: 15)`,
                    vscode.DiagnosticSeverity.Information,
                );
                diag.source = 'CScout';
                diag.code = 'high-complexity';

                const key = loc.filePath;
                if (!diagMap.has(key)) { diagMap.set(key, []); }
                diagMap.get(key)!.push(diag);
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

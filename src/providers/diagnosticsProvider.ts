import * as vscode from 'vscode';
import * as fs from 'fs';
import { CScoutServer, ServerIdentifier } from '../services/cscoutServer';

const DIAG_COLLECTION = vscode.languages.createDiagnosticCollection('cscout');

export class CScoutDiagnostics {
    static async refresh(server: CScoutServer) {
        DIAG_COLLECTION.clear();

        const diagMap = new Map<string, vscode.Diagnostic[]>();

        // Unused identifiers via REST
        let unused: ServerIdentifier[];
        try {
            unused = await server.getIdentifiers({ unused: true });
        } catch {
            return;
        }

        for (const id of unused) {
            let locations;
            try {
                locations = await server.getIdentifierLocations(id.eid);
            } catch {
                continue;
            }

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

                const key = loc.file;
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

import * as vscode from 'vscode';
import * as fs from 'fs';
import { CScoutServer, ServerIdentifier } from '../services/cscoutServer';

export class IdentifierDefinitionProvider implements vscode.DefinitionProvider {
    private _cache = new Map<string, ServerIdentifier>();
    private _getServer: () => CScoutServer | undefined;

    constructor(getServer: () => CScoutServer | undefined) {
        this._getServer = getServer;
    }

    updateCache(identifiers: ServerIdentifier[]): void {
        this._cache.clear();
        for (const id of identifiers) {
            this._cache.set(id.name, id);
        }
    }

    async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
    ): Promise<vscode.Definition | undefined> {
        const server = this._getServer();
        if (!server || this._cache.size === 0) { return undefined; }

        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) { return undefined; }

        const word = document.getText(wordRange);
        if (!word) { return undefined; }

        const id = this._cache.get(word);
        if (!id) { return undefined; }

        try {
            const locations = await server.getIdentifierLocations(id.eid);
            if (locations.length === 0) { return undefined; }

            const currentFile = document.uri.fsPath;
            const currentLine = position.line + 1; // 1-based

            // Filter to valid, existing files
            const valid = locations.filter(l => {
                try { return fs.existsSync(l.file); } catch { return false; }
            });
            if (valid.length === 0) { return undefined; }

            // Prefer a location in a DIFFERENT file (the actual definition),
            // or at least a different line. When Ctrl+Clicking a usage in
            // main.c, we don't want to jump to that same line in main.c.
            const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();
            const curNorm = norm(currentFile);

            const other = valid.find(l =>
                norm(l.file) !== curNorm || l.line !== currentLine
            );
            const loc = other ?? valid[0];

            return new vscode.Location(
                vscode.Uri.file(loc.file),
                new vscode.Position(Math.max(0, loc.line - 1), Math.max(0, loc.col))
            );
        } catch {
            return undefined;
        }
    }
}

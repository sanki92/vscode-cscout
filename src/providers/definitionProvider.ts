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

            return locations
                .filter(loc => {
                    try { return fs.existsSync(loc.file); } catch { return false; }
                })
                .map(loc => new vscode.Location(
                    vscode.Uri.file(loc.file),
                    new vscode.Position(Math.max(0, loc.line - 1), Math.max(0, loc.col))
                ));
        } catch {
            return undefined;
        }
    }
}

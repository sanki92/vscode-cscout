import * as vscode from 'vscode';
import { CScoutDatabase } from '../db/cscoutDatabase';

export class IdentifierDefinitionProvider implements vscode.DefinitionProvider {
    private getDb: () => CScoutDatabase | undefined;

    constructor(getDb: () => CScoutDatabase | undefined) {
        this.getDb = getDb;
    }

    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.Definition> {
        const db = this.getDb();
        if (!db) { return undefined; }

        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) { return undefined; }

        const word = document.getText(wordRange);
        if (!word) { return undefined; }

        const identifier = db.findIdentifierByName(word);
        if (!identifier) { return undefined; }

        const locations = db.getIdentifierLocations(identifier.eid);
        if (locations.length === 0) { return undefined; }

        return locations
            .filter(loc => {
                try {
                    return require('fs').existsSync(loc.filePath);
                } catch {
                    return false;
                }
            })
            .map(loc => new vscode.Location(
                vscode.Uri.file(loc.filePath),
                new vscode.Position(loc.line - 1, loc.column)
            ));
    }
}

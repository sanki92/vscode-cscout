import * as vscode from 'vscode';
import { CScoutServer, ServerIdentifier } from '../services/cscoutServer';

export class CScoutHoverProvider implements vscode.HoverProvider {
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

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.ProviderResult<vscode.Hover> {
        if (this._cache.size === 0) { return undefined; }

        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) { return undefined; }

        const word = document.getText(wordRange);
        if (!word || word.length < 2) { return undefined; }

        const id = this._cache.get(word);
        if (!id) { return undefined; }

        const kind = this.getKind(id);

        const md = new vscode.MarkdownString(undefined, true);
        md.isTrusted = true;
        md.appendMarkdown(`### CScout: \`${id.name}\`\n\n`);
        md.appendMarkdown(`**Kind:** ${kind}\n\n`);

        if (id.unused) {
            md.appendMarkdown(`> ⚠️  **Unused** — this identifier has no uses across the entire project\n\n`);
        } else {
            md.appendMarkdown(`> ✅ Active identifier\n\n`);
        }

        if (id.readonly) {
            md.appendMarkdown(`🔒 Read-only (from system/external header)\n\n`);
        }

        md.appendMarkdown(`---\n*CScout whole-program analysis · EID ${id.eid}*`);

        return new vscode.Hover(md, wordRange);
    }

    private getKind(id: ServerIdentifier): string {
        if (id.macro) { return 'Macro'; }
        if (id.fun) { return 'Function'; }
        if (id.typedef) { return 'Typedef'; }
        if (id.suetag) { return 'Struct/Union/Enum tag'; }
        if (id.sumember) { return 'Struct/Union member'; }
        return 'Variable / Ordinary identifier';
    }
}

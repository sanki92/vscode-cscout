import * as vscode from "vscode";
import { CScoutServer, ServerIdentifier } from "../services/cscoutServer";

function normalize(p: string): string {
    return p.replace(/\\/g, "/").toLowerCase();
}

function isValidCIdentifier(name: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

export type RenameApplied = (eid: number | string, oldName: string, newName: string) => void;

export class IdentifierRenameProvider implements vscode.RenameProvider {
    private _cache = new Map<string, ServerIdentifier[]>();
    private _getServer: () => CScoutServer | undefined;
    private _onRenameApplied: RenameApplied | undefined;

    constructor(
        getServer: () => CScoutServer | undefined,
        onRenameApplied?: RenameApplied,
    ) {
        this._getServer = getServer;
        this._onRenameApplied = onRenameApplied;
    }

    updateCache(identifiers: ServerIdentifier[]): void {
        this._cache.clear();
        for (const id of identifiers) {
            const bucket = this._cache.get(id.name) ?? [];
            bucket.push(id);
            this._cache.set(id.name, bucket);
        }
    }

    renameEntry(eid: number | string, oldName: string, newName: string): void {
        const bucket = this._cache.get(oldName);
        if (!bucket) { return; }
        const matches = bucket.filter((id) => id.eid === eid);
        const rest = bucket.filter((id) => id.eid !== eid);
        if (rest.length > 0) {
            this._cache.set(oldName, rest);
        } else {
            this._cache.delete(oldName);
        }
        if (matches.length === 0) { return; }
        const target = this._cache.get(newName) ?? [];
        for (const id of matches) {
            target.push({ ...id, name: newName });
        }
        this._cache.set(newName, target);
    }

    async prepareRename(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): Promise<vscode.Range | { range: vscode.Range; placeholder: string } | undefined> {
        if (!this._getServer()) {
            return undefined;
        }
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) {
            return undefined;
        }
        const word = document.getText(wordRange);
        const candidates = this._cache.get(word);
        if (!candidates || candidates.length === 0) {
            throw new Error(
                `CScout has no record of identifier "${word}". Re-run analysis or refresh the extension.`,
            );
        }
        return { range: wordRange, placeholder: word };
    }

    async provideRenameEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        newName: string,
        _token: vscode.CancellationToken,
    ): Promise<vscode.WorkspaceEdit | undefined> {
        const server = this._getServer();
        if (!server) {
            vscode.window.showWarningMessage(
                "CScout: connect to a server before renaming.",
            );
            return undefined;
        }

        if (!isValidCIdentifier(newName)) {
            throw new Error(`"${newName}" is not a valid C identifier.`);
        }

        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) {
            return undefined;
        }
        const oldName = document.getText(wordRange);
        if (oldName === newName) {
            return undefined;
        }

        const candidates = this._cache.get(oldName) ?? [];
        if (candidates.length === 0) {
            throw new Error(`CScout has no record of identifier "${oldName}".`);
        }

        const eid = await this.resolveEid(
            server,
            candidates,
            document.uri.fsPath,
            position.line + 1,
        );
        if (eid === undefined) {
            throw new Error(
                `Could not match the identifier at this position to a CScout equivalence class.`,
            );
        }

        const preview = await server.previewRefactor(eid, newName);

        const edit = new vscode.WorkspaceEdit();
        for (const change of preview.changes) {
            const uri = vscode.Uri.file(change.file);
            let doc: vscode.TextDocument;
            try {
                doc = await vscode.workspace.openTextDocument(uri);
            } catch (err: any) {
                throw new Error(
                    `Cannot open ${change.file}: ${err?.message ?? err}`,
                );
            }
            for (const rep of change.replacements) {
                const start = doc.positionAt(rep.offset);
                const end = start.translate(0, preview.old_length);
                edit.replace(uri, new vscode.Range(start, end), preview.new_name);
            }
        }
        this.renameEntry(eid, oldName, newName);
        if (this._onRenameApplied) {
            this._onRenameApplied(eid, oldName, newName);
        }
        return edit;
    }

    private async resolveEid(
        server: CScoutServer,
        candidates: ServerIdentifier[],
        currentFile: string,
        currentLine: number,
    ): Promise<number | string | undefined> {
        const currentNorm = normalize(currentFile);
        for (const id of candidates.slice(0, 16)) {
            try {
                const locs = await server.getIdentifierLocations(id.eid);
                if (
                    locs.some(
                        (l) =>
                            normalize(l.file) === currentNorm && l.line === currentLine,
                    )
                ) {
                    return id.eid;
                }
            } catch {
                continue;
            }
        }
        if (candidates.length === 1) {
            return candidates[0].eid;
        }
        return undefined;
    }
}

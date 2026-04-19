import * as vscode from "vscode";
import * as fs from "fs";
import { CScoutServer, ServerIdentifier } from "../services/cscoutServer";

export class IdentifierDefinitionProvider implements vscode.DefinitionProvider {
  private _cache = new Map<string, ServerIdentifier[]>();
  private _getServer: () => CScoutServer | undefined;

  constructor(getServer: () => CScoutServer | undefined) {
    this._getServer = getServer;
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

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Definition | undefined> {
    const server = this._getServer();
    if (!server || this._cache.size === 0) {
      return undefined;
    }

    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
      return undefined;
    }

    const word = document.getText(wordRange);
    if (!word) {
      return undefined;
    }

    const ids = this._cache.get(word);
    if (!ids || ids.length === 0) {
      return undefined;
    }

    try {
      const currentFile = document.uri.fsPath;
      const currentLine = position.line + 1;
      const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
      const workspacePaths = workspaceFolders.map((f) =>
        f.uri.fsPath.replace(/\\/g, "/").toLowerCase(),
      );

      const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase();
      const curNorm = norm(currentFile);

      let bestLoc: { file: string; line: number; col: number } | undefined;
      let bestScore = Number.NEGATIVE_INFINITY;

      for (const id of ids.slice(0, 12)) {
        const locations = await server.getIdentifierLocations(id.eid);
        if (locations.length === 0) {
          continue;
        }

        for (const loc of locations) {
          const valid = (() => {
            try {
              return fs.existsSync(loc.file);
            } catch {
              return false;
            }
          })();
          if (!valid) {
            continue;
          }

          const fileNorm = norm(loc.file);
          const sameFile = fileNorm === curNorm;
          const sameLine = loc.line === currentLine;
          const inWorkspace =
            workspacePaths.length === 0
              ? true
              : workspacePaths.some((w) => fileNorm.startsWith(w));

          if (sameFile && sameLine) {
            continue;
          }

          let score = 0;
          if (!sameFile) {
            score += 2000;
            if (inWorkspace) {
              score += 500;
            }
            if (fileNorm.endsWith(".h")) {
              score += 200;
            }
          } else {
            score += 500;
            const distance = Math.abs(loc.line - currentLine);
            score += Math.max(0, 300 - distance);
          }

          if (score > bestScore) {
            bestScore = score;
            bestLoc = loc;
          }
        }
      }

      if (!bestLoc) {
        return undefined;
      }

      return new vscode.Location(
        vscode.Uri.file(bestLoc.file),
        new vscode.Position(
          Math.max(0, bestLoc.line - 1),
          Math.max(0, bestLoc.col),
        ),
      );
    } catch {
      return undefined;
    }
  }
}

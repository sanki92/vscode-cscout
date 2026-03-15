import * as vscode from 'vscode';
import * as path from 'path';
import { CScoutDatabase, CScoutProject, CScoutFile } from '../db/cscoutDatabase';

type TreeItem = ProjectItem | FileItem;

class ProjectItem extends vscode.TreeItem {
    constructor(public readonly project: CScoutProject) {
        const label = (!project.name || project.name === 'unspecified')
            ? '(read-only / system headers)'
            : project.name;
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'cscout.project';
        this.iconPath = new vscode.ThemeIcon('project', new vscode.ThemeColor('charts.purple'));
    }
}

function toVscodeUri(filePath: string): vscode.Uri {
    const wslMatch = filePath.match(/^\/mnt\/([a-z])\/(.*)/);
    if (wslMatch) {
        return vscode.Uri.file(`${wslMatch[1].toUpperCase()}:\\${wslMatch[2].replace(/\//g, '\\')}`);
    }
    return vscode.Uri.file(filePath);
}

class FileItem extends vscode.TreeItem {
    constructor(public readonly file: CScoutFile) {
        super(path.basename(file.name), vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'cscout.file';
        this.iconPath = new vscode.ThemeIcon(
            file.readonly ? 'lock' : 'file-code',
            new vscode.ThemeColor(file.readonly ? 'charts.red' : 'charts.blue'),
        );
        this.tooltip = file.name;

        this.command = {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [toVscodeUri(file.name)],
        };
    }
}

export class ProjectsTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChange = new vscode.EventEmitter<TreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChange.event;

    private db: CScoutDatabase | undefined;
    private serverProjects: { pid: number; name: string }[] = [];
    private serverFilesMap = new Map<number, { fid: number; name: string; readonly: boolean }[]>();

    loadFromDb(db: CScoutDatabase) {
        this.db = db;
        this.serverProjects = [];
        this.serverFilesMap.clear();
        this._onDidChange.fire(undefined);
    }

    clear() {
        this.db = undefined;
        this.serverProjects = [];
        this.serverFilesMap.clear();
        this._onDidChange.fire(undefined);
    }

    loadData(
        projects: { pid: number; name: string }[],
        filesMap: Map<number, { fid: number; name: string; readonly: boolean }[]>,
    ) {
        this.db = undefined;
        this.serverProjects = projects;
        this.serverFilesMap = filesMap;
        this._onDidChange.fire(undefined);
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeItem): vscode.ProviderResult<TreeItem[]> {
        const hasDb = !!this.db;
        const hasServer = this.serverProjects.length > 0;
        if (!hasDb && !hasServer) { return []; }

        if (!element) {
            if (hasDb) {
                const projects = this.db!.getProjects();
                if (projects.length === 0) {
                    return this.db!.getFiles().map(f => new FileItem(f));
                }
                return projects.map(p => new ProjectItem(p));
            } else {
                return this.serverProjects.map(p => new ProjectItem(p));
            }
        }

        if (element instanceof ProjectItem) {
            if (hasDb) {
                const files = this.db!.getProjectFiles(element.project.pid);
                return files.map(f => new FileItem(f));
            } else {
                const files = this.serverFilesMap.get(element.project.pid) ?? [];
                return files.map(f => new FileItem(f as CScoutFile));
            }
        }

        return [];
    }
}

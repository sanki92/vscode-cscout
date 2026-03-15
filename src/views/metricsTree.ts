import * as vscode from 'vscode';
import * as path from 'path';
import { CScoutDatabase } from '../db/cscoutDatabase';

const DISPLAY_METRICS: { key: string; label: string }[] = [
    { key: 'Number of lines', label: 'Lines' },
    { key: 'Number of statements or declarations', label: 'Statements' },
    { key: 'Number of operators', label: 'Operators' },
    { key: 'Number of if statements', label: 'If statements' },
    { key: 'Number of tokens', label: 'Tokens' },
    { key: 'Number of unique project-scope identifiers', label: 'Unique identifiers' },
    { key: 'Number of defined project-scope functions', label: 'Project-scope functions' },
    { key: 'Number of defined file-scope (static) functions', label: 'Static functions' },
    { key: 'Maximum level of statement nesting', label: 'Max statement nesting' },
    // Same metrics under short names (real CScout REST API uses these keys)
    { key: 'NLINE', label: 'Lines' },
    { key: 'NSTMT', label: 'Statements' },
    { key: 'NOP', label: 'Operators' },
    { key: 'NIF', label: 'If statements' },
    { key: 'NTOKEN', label: 'Tokens' },
    { key: 'NUID', label: 'Unique identifiers' },
    { key: 'NPFUNCTION', label: 'Project-scope functions' },
    { key: 'NFFUNCTION', label: 'Static functions' },
    { key: 'MAXSTMTNEST', label: 'Max statement nesting' },
];

type Item = FileMetricItem | MetricDetail;

export class FileMetricItem extends vscode.TreeItem {
    constructor(
        public readonly fileName: string,
        public readonly metrics: Record<string, any>,
    ) {
        super(path.basename(fileName), vscode.TreeItemCollapsibleState.Collapsed);
        this.tooltip = fileName;
        this.description = `${metrics['Number of lines'] ?? metrics.NLINE ?? metrics.nline ?? '?'} lines`;
        this.iconPath = new vscode.ThemeIcon('file-code', new vscode.ThemeColor('charts.blue'));
    }
}

class MetricDetail extends vscode.TreeItem {
    public readonly _parentFile: string;
    constructor(label: string, value: any, parentFile: string) {
        super(`${label}: ${value}`, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('symbol-number', new vscode.ThemeColor('charts.yellow'));
        this._parentFile = parentFile;
    }
}

export class MetricsTreeProvider implements vscode.TreeDataProvider<Item> {
    private _onDidChange = new vscode.EventEmitter<Item | undefined>();
    readonly onDidChangeTreeData = this._onDidChange.event;

    private files: { name: string; metrics: Record<string, any> }[] = [];
    private fileItems: FileMetricItem[] = [];

    loadFromDb(db: CScoutDatabase) {
        this.files = db.getFileMetricsAll();
        this.fileItems = this.files.map(f => new FileMetricItem(f.name, f.metrics));
        this._onDidChange.fire(undefined);
    }

    loadData(files: { name: string; metrics: Record<string, any> }[]) {
        this.files = files;
        this.fileItems = this.files.map(f => new FileMetricItem(f.name, f.metrics));
        this._onDidChange.fire(undefined);
    }

    clear() {
        this.files = [];
        this.fileItems = [];
        this._onDidChange.fire(undefined);
    }

    findFile(filePath: string): FileMetricItem | undefined {
        const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();
        const normPath = norm(filePath);
        return this.fileItems.find(item => {
            const fp = norm(item.fileName);
            return normPath.endsWith(fp) || fp.endsWith(normPath);
        });
    }

    getTreeItem(element: Item): vscode.TreeItem {
        return element;
    }

    getParent(element: Item): vscode.ProviderResult<Item> {
        if (element instanceof MetricDetail) {
            return this.fileItems.find(f => f.fileName === (element as any)._parentFile);
        }
        return undefined;
    }

    getChildren(element?: Item): vscode.ProviderResult<Item[]> {
        if (!element) {
            return this.fileItems;
        }

        if (element instanceof FileMetricItem) {
            const seen = new Set<string>();
            return DISPLAY_METRICS
                .filter(m => element.metrics[m.key] !== undefined && !seen.has(m.label) && seen.add(m.label))
                .map(m => new MetricDetail(m.label, element.metrics[m.key], element.fileName));
        }

        return [];
    }
}

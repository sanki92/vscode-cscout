import * as vscode from 'vscode';
import { CScoutDatabase, CScoutIdentifier } from '../db/cscoutDatabase';
import type { CScoutServer, TokenLocation } from '../services/cscoutServer';

interface IdentifierLike {
    eid: any;
    name: string;
    unused: any;
    macro: any;
    fun: any;
    typedef: any;
    suetag: any;
    sumember: any;
    ordinary: any;
}

type Item = CategoryItem | IdentifierItem | LocationItem;

const CATEGORIES = [
    { key: 'fun', label: 'Functions', icon: 'symbol-function' },
    { key: 'macro', label: 'Macros', icon: 'symbol-constant' },
    { key: 'typedef', label: 'Typedefs', icon: 'symbol-class' },
    { key: 'suetag', label: 'Struct/Union/Enum Tags', icon: 'symbol-struct' },
    { key: 'sumember', label: 'Struct/Union Members', icon: 'symbol-field' },
    { key: 'ordinary', label: 'Variables', icon: 'symbol-variable' },
] as const;

class CategoryItem extends vscode.TreeItem {
    static readonly COLOR_MAP: Record<string, vscode.ThemeColor> = {
        fun: new vscode.ThemeColor('charts.yellow'),
        macro: new vscode.ThemeColor('charts.purple'),
        typedef: new vscode.ThemeColor('charts.blue'),
        suetag: new vscode.ThemeColor('charts.green'),
        sumember: new vscode.ThemeColor('charts.orange'),
        ordinary: new vscode.ThemeColor('charts.red'),
    };

    constructor(
        public readonly catKey: string,
        label: string,
        icon: string,
        public readonly count: number,
    ) {
        super(`${label} (${count})`, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon(icon, CategoryItem.COLOR_MAP[catKey]);
        this.contextValue = 'cscout.identifierCategory';
    }
}

class IdentifierItem extends vscode.TreeItem {
    constructor(public readonly identifier: IdentifierLike) {
        super(identifier.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon(
            identifier.unused ? 'warning' : 'symbol-variable',
            new vscode.ThemeColor(identifier.unused ? 'list.warningForeground' : 'charts.blue'),
        );
        this.description = identifier.unused ? 'unused' : '';
        this.contextValue = 'cscout.identifier';
    }
}

class LocationItem extends vscode.TreeItem {
    constructor(filePath: string, line: number, column: number) {
        const basename = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;
        const label = `${basename}:${line}:${column}`;
        super(label, vscode.TreeItemCollapsibleState.None);
        this.tooltip = `${filePath}:${line}:${column}`;
        this.iconPath = new vscode.ThemeIcon('go-to-file', new vscode.ThemeColor('charts.green'));
        this.command = {
            command: 'vscode.open',
            title: 'Go to Location',
            arguments: [
                vscode.Uri.file(filePath),
                { selection: new vscode.Range(line - 1, column, line - 1, column) },
            ],
        };
    }
}

export class IdentifiersTreeProvider implements vscode.TreeDataProvider<Item> {
    private _onDidChange = new vscode.EventEmitter<Item | undefined>();
    readonly onDidChangeTreeData = this._onDidChange.event;

    private db: CScoutDatabase | undefined;
    private server: CScoutServer | undefined;
    private identifiers: IdentifierLike[] = [];

    loadFromDb(db: CScoutDatabase) {
        this.db = db;
        this.server = undefined;
        this.identifiers = db.getIdentifiers(2000);
        this._onDidChange.fire(undefined);
    }

    loadData(identifiers: IdentifierLike[], server?: CScoutServer) {
        this.db = undefined;
        this.server = server;
        this.identifiers = identifiers;
        this._onDidChange.fire(undefined);
    }

    clear() {
        this.db = undefined;
        this.server = undefined;
        this.identifiers = [];
        this._onDidChange.fire(undefined);
    }

    getTreeItem(element: Item): vscode.TreeItem {
        return element;
    }

    getChildren(element?: Item): vscode.ProviderResult<Item[]> {
        if (!this.db && this.identifiers.length === 0) { return []; }

        if (!element) {
                    return CATEGORIES.map(cat => {
                const count = this.identifiers.filter(
                    id => (id as any)[cat.key] === 1
                ).length;
                return new CategoryItem(cat.key, cat.label, cat.icon, count);
            });
        }

        if (element instanceof CategoryItem) {
            return this.identifiers
                .filter(id => (id as any)[element.catKey] === 1)
                .slice(0, 200)
                .map(id => new IdentifierItem(id));
        }

        if (element instanceof IdentifierItem) {
            if (this.db) {
                const locs = this.db.getIdentifierLocations(element.identifier.eid);
                return locs.map(loc => new LocationItem(loc.filePath, loc.line, loc.column));
            }
            if (this.server) {
                return this.server.getIdentifierLocations(element.identifier.eid)
                    .then((locs: TokenLocation[]) =>
                        locs.map(loc => new LocationItem(loc.file, loc.line ?? 0, loc.col ?? 0))
                    );
            }
            return [];
        }

        return [];
    }
}

import * as vscode from 'vscode';
import { CScoutDatabase, CScoutFunction } from '../db/cscoutDatabase';
import type { CScoutServer, ServerFunction } from '../services/cscoutServer';

function serverFnToCScout(sf: ServerFunction): CScoutFunction {
    return {
        id: sf.id as any,
        name: sf.name,
        isMacro: false,
        defined: true,
        declared: true,
        fileScoped: sf.isStatic,
        fid: 0,
        foffset: 0,
        fanin: 0,
    };
}

type Item = FunctionNode | DirectionNode;

class DirectionNode extends vscode.TreeItem {
    constructor(
        public readonly funcId: string | number,
        public readonly direction: 'callers' | 'callees',
        count: number,
    ) {
        super(
            direction === 'callers' ? `Callers (${count})` : `Callees (${count})`,
            count > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
        );
        this.iconPath = new vscode.ThemeIcon(
            direction === 'callers' ? 'call-incoming' : 'call-outgoing',
            new vscode.ThemeColor(direction === 'callers' ? 'charts.green' : 'charts.orange'),
        );
    }
}

class FunctionNode extends vscode.TreeItem {
    constructor(
        public readonly func: CScoutFunction,
        private readonly hasChildren: boolean,
    ) {
        super(
            func.name,
            hasChildren
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
        );
        this.iconPath = new vscode.ThemeIcon(
            func.isMacro ? 'symbol-constant' : 'symbol-function',
            new vscode.ThemeColor(func.isMacro ? 'charts.purple' : 'charts.yellow'),
        );
        this.description = func.fileScoped ? 'static' : '';
        this.tooltip = `${func.name} — fan-in: ${func.fanin}`;
    }
}

export class CallGraphTreeProvider implements vscode.TreeDataProvider<Item> {
    private _onDidChange = new vscode.EventEmitter<Item | undefined>();
    readonly onDidChangeTreeData = this._onDidChange.event;

    private db: CScoutDatabase | undefined;
    private server: CScoutServer | undefined;
    private rootFunctions: CScoutFunction[] = [];

    loadFromDb(db: CScoutDatabase) {
        this.db = db;
        this.server = undefined;
        this.rootFunctions = db.getFunctions(100);
        this._onDidChange.fire(undefined);
    }

    /** Focus the call graph on a single function. */
    loadForFunction(db: CScoutDatabase, functionName: string) {
        this.db = db;
        this.server = undefined;
        const fn = db.getFunctionByName(functionName);
        if (fn) {
            this.rootFunctions = [fn];
        }
        this._onDidChange.fire(undefined);
    }

    loadData(functions: ServerFunction[], server: CScoutServer) {
        this.db = undefined;
        this.server = server;
        this.rootFunctions = functions.map(serverFnToCScout);
        this._onDidChange.fire(undefined);
    }

    getTreeItem(element: Item): vscode.TreeItem {
        return element;
    }

    getChildren(element?: Item): vscode.ProviderResult<Item[]> {
        if (!this.db && !this.server) { return []; }

        if (!element) {
            return this.rootFunctions.map(f => new FunctionNode(f, true));
        }

        if (element instanceof FunctionNode) {
            if (this.db) {
                const callers = this.db.getCallers(element.func.id);
                const callees = this.db.getCallees(element.func.id);
                return [
                    new DirectionNode(element.func.id, 'callers', callers.length),
                    new DirectionNode(element.func.id, 'callees', callees.length),
                ];
            }
            if (this.server) {
                return Promise.all([
                    this.server.getCallers(element.func.id),
                    this.server.getCallees(element.func.id),
                ]).then(([callers, callees]) => [
                    new DirectionNode(element.func.id, 'callers', callers.length),
                    new DirectionNode(element.func.id, 'callees', callees.length),
                ]);
            }
            return [];
        }

        if (element instanceof DirectionNode) {
            if (this.db) {
                const calls = element.direction === 'callers'
                    ? this.db.getCallers(element.funcId as number)
                    : this.db.getCallees(element.funcId as number);

                return calls.map(c => {
                    const name = element.direction === 'callers' ? c.sourceName : c.destName;
                    const id = element.direction === 'callers' ? c.sourceId : c.destId;
                    const fn = this.db!.getFunctionByName(name);
                    return new FunctionNode(
                        fn ?? { id, name, isMacro: false, defined: false, declared: false, fileScoped: false, fid: 0, foffset: 0, fanin: 0 },
                        true,
                    );
                });
            }
            if (this.server) {
                const fetch = element.direction === 'callers'
                    ? this.server.getCallers(element.funcId)
                    : this.server.getCallees(element.funcId);
                return fetch.then(fns => fns.map(fn => new FunctionNode(serverFnToCScout(fn), true)));
            }
            return [];
        }

        return [];
    }
}

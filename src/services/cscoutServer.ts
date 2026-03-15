import * as http from 'http';
import * as net from 'net';
import * as process from 'process';

function normalizePath(p: string): string {
    if (process.platform !== 'win32') { return p; }
    const cyg = p.match(/^\/cygdrive\/([a-zA-Z])\/(.*)/);
    if (cyg) { return cyg[1].toUpperCase() + ':/' + cyg[2]; }
    const wsl = p.match(/^\/mnt\/([a-zA-Z])\/(.*)/);
    if (wsl) { return wsl[1].toUpperCase() + ':/' + wsl[2]; }
    return p;
}



export interface ServerIdentifier {
    eid: string;
    name: string;
    unused: number;
    macro: number;
    fun: number;
    typedef: number;
    suetag: number;
    sumember: number;
    ordinary: number;
    readonly: number;
}

export interface ServerFile {
    fid: number;
    name: string;
    readonly: boolean;
}

export interface ServerFunction {
    name: string;
    id: number;
    isFileScoped: boolean;
    fanin: number;
}

export interface ServerMetric {
    name: string;
    value: number;
}

export interface TokenLocation {
    fid: number;
    offset: number;
    file: string;
    line: number;
    col: number;
}




function extractTableRows(html: string): string[][] {
    const rows: string[][] = [];
    const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;

    let rowMatch;
    while ((rowMatch = rowPattern.exec(html)) !== null) {
        const cells: string[] = [];
        let cellMatch;
        while ((cellMatch = cellPattern.exec(rowMatch[1])) !== null) {
            cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
        }
        if (cells.length > 0) {
            rows.push(cells);
        }
    }
    return rows;
}




export class CScoutServer {
    private host: string;
    private port: number;
    private baseUrl: string;
    private _hasRestApi: boolean | undefined;

    constructor(host: string = 'localhost', port: number = 8081) {
        this.host = host;
        this.port = port;
        this.baseUrl = `http://${host}:${port}`;
    }

    async isAlive(): Promise<boolean> {
        try {
            const html = await this.get('/index.html');
            if (html.includes('CScout')) { return true; }
        } catch { /* fall through */ }
        try {
            const resp = await this.get('/api/projects');
            return resp.trim().startsWith('[');
        } catch {
            return false;
        }
    }

    async hasRestApi(): Promise<boolean> {
        if (this._hasRestApi !== undefined) { return this._hasRestApi; }
        try {
            const resp = await this.get('/api/projects');
            const data = JSON.parse(resp);
            this._hasRestApi = Array.isArray(data);
        } catch {
            this._hasRestApi = false;
        }
        return this._hasRestApi;
    }

    getBaseUrl(): string {
        return this.baseUrl;
    }

    async getMode(): Promise<'rest' | 'html'> {
        return (await this.hasRestApi()) ? 'rest' : 'html';
    }

    

    async getIdentifiers(options?: { unused?: boolean; writable?: boolean; limit?: number; offset?: number }): Promise<ServerIdentifier[]> {
        const params = new URLSearchParams();
        if (options?.unused) { params.set('unused', 'true'); }
        if (options?.writable) { params.set('writable', 'true'); }
        if (options?.limit !== undefined) { params.set('limit', String(options.limit)); }
        if (options?.offset !== undefined) { params.set('offset', String(options.offset)); }
        const qs = params.toString();
        const resp = await this.get(`/api/identifiers${qs ? '?' + qs : ''}`);
        return JSON.parse(resp);
    }

    async getIdentifierById(eid: string | number): Promise<ServerIdentifier> {
        const resp = await this.get(`/api/identifier?eid=${eid}`);
        return JSON.parse(resp);
    }

    async getIdentifierLocations(eid: string | number): Promise<TokenLocation[]> {
        const resp = await this.get(`/api/identifier?eid=${eid}`);
        const data = JSON.parse(resp);
        const locs: TokenLocation[] = data.locations ?? [];
        for (const loc of locs) {
            loc.file = normalizePath(loc.file);
            if (loc.col == null) { loc.col = 0; }
        }
        return locs;
    }

    async getFiles(options?: { writable?: boolean; pid?: number; limit?: number; offset?: number }): Promise<ServerFile[]> {
        const params = new URLSearchParams();
        if (options?.writable) { params.set('writable', 'true'); }
        if (options?.pid !== undefined) { params.set('pid', String(options.pid)); }
        if (options?.limit !== undefined) { params.set('limit', String(options.limit)); }
        if (options?.offset !== undefined) { params.set('offset', String(options.offset)); }
        const qs = params.toString();
        const resp = await this.get(`/api/files${qs ? '?' + qs : ''}`);
        const data: ServerFile[] = JSON.parse(resp);
        for (const f of data) { f.name = normalizePath(f.name); }
        return data;
    }

    async getFileMetrics(fid: number): Promise<Record<string, any>> {
        const resp = await this.get(`/api/filemetrics?fid=${fid}`);
        const data = JSON.parse(resp);
        return data.metrics ?? data;
    }

    async getFunctions(options?: { defined?: boolean; limit?: number; offset?: number }): Promise<ServerFunction[]> {
        const params = new URLSearchParams();
        if (options?.defined) { params.set('defined', 'true'); }
        if (options?.limit !== undefined) { params.set('limit', String(options.limit)); }
        if (options?.offset !== undefined) { params.set('offset', String(options.offset)); }
        const qs = params.toString();
        const resp = await this.get(`/api/functions${qs ? '?' + qs : ''}`);
        const data = JSON.parse(resp);
        return data.map((f: any) => ({
            id: f.id,
            name: f.name,
            isFileScoped: f.is_file_scoped ?? false,
            fanin: f.fanin ?? 0,
        }));
    }

    async getCallers(funcId: string | number): Promise<ServerFunction[]> {
        const resp = await this.get(`/api/function?id=${funcId}&callers=1`);
        const data = JSON.parse(resp);
        return (data.callers ?? data).map((f: any) => ({
            id: f.id,
            name: f.name,
            isFileScoped: f.is_file_scoped ?? false,
            fanin: f.fanin ?? 0,
        }));
    }

    async getCallees(funcId: string | number): Promise<ServerFunction[]> {
        const resp = await this.get(`/api/function?id=${funcId}&callees=1`);
        const data = JSON.parse(resp);
        return (data.callees ?? data).map((f: any) => ({
            id: f.id,
            name: f.name,
            isFileScoped: f.is_file_scoped ?? false,
            fanin: f.fanin ?? 0,
        }));
    }

    async getProjects(): Promise<{ pid: number; name: string }[]> {
        const resp = await this.get('/api/projects');
        return JSON.parse(resp);
    }

    async getProjectFiles(pid: number): Promise<ServerFile[]> {
        const resp = await this.get(`/api/project_files?pid=${pid}`);
        const data: ServerFile[] = JSON.parse(resp);
        for (const f of data) { f.name = normalizePath(f.name); }
        return data;
    }

    async getSource(fid: number): Promise<{ fid: number; name: string; lines: string[] }> {
        const resp = await this.get(`/api/source?fid=${fid}`);
        const data = JSON.parse(resp);
        data.name = normalizePath(data.name);
        return data;
    }



    async getWritableIdentifiers(): Promise<ServerIdentifier[]> {
        const html = await this.get('/xiquery.html?qi=1&match=Y&writable=1');
        return this.parseIdentifierList(html);
    }

    async getUnusedIdentifiers(): Promise<ServerIdentifier[]> {
        const html = await this.get('/xiquery.html?qi=1&match=Y&unused=1&writable=1');
        return this.parseIdentifierList(html);
    }

    async getAllIdentifiers(): Promise<ServerIdentifier[]> {
        const html = await this.get('/xiquery.html?qi=1&match=Y');
        return this.parseIdentifierList(html);
    }

    async getIdentifierDetails(eid: string): Promise<string> {
        return this.get(`/id.html?id=${eid}`);
    }

    

    async getWritableFiles(): Promise<ServerFile[]> {
        const html = await this.get('/xfilequery.html?match=Y&writable=1&n=all');
        return this.parseFileList(html);
    }

    async getAllFiles(): Promise<ServerFile[]> {
        const html = await this.get('/xfilequery.html?match=Y&n=all');
        return this.parseFileList(html);
    }

    async getFileDetails(fid: number): Promise<{ metrics: ServerMetric[]; html: string }> {
        const html = await this.get(`/file.html?id=${fid}`);
        const metrics = this.parseMetricsTable(html);
        return { metrics, html };
    }

    

    async getDefinedFunctions(): Promise<ServerFunction[]> {
        const html = await this.get('/xfunquery.html?qi=1&match=Y&defined=1');
        return this.parseFunctionList(html);
    }

    async getFunctionDetails(funcId: string): Promise<{ metrics: ServerMetric[]; html: string }> {
        const html = await this.get(`/fun.html?f=${funcId}`);
        const metrics = this.parseMetricsTable(html);
        return { metrics, html };
    }

    async getCallGraph(funcId: string, direction: 'callers' | 'callees'): Promise<ServerFunction[]> {
        const dir = direction === 'callers' ? 'u' : 'd';
        const html = await this.get(`/funlist.html?f=${funcId}&n=${dir}`);
        return this.parseFunctionList(html);
    }

    

    async getFileSource(fid: number): Promise<string> {
        const html = await this.get(`/src.html?id=${fid}`);
        const preMatch = /<pre[^>]*>([\s\S]*?)<\/pre>/i.exec(html);
        if (preMatch) {
            return preMatch[1]
                .replace(/<[^>]+>/g, '')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"');
        }
        return html.replace(/<[^>]+>/g, '');
    }

    

    async getFileMetricsSummary(): Promise<string> {
        return this.get('/filemetrics.html');
    }

    async getFunctionMetricsSummary(): Promise<string> {
        return this.get('/funmetrics.html');
    }

    

    async selectProject(pid: number): Promise<void> {
        await this.get(`/setproj.html?projid=${pid}`);
    }

    

    private parseIdentifierList(html: string): ServerIdentifier[] {
        const linkPattern = /<a\s+href="id\.html\?id=([^"]+)"[^>]*>([^<]+)<\/a>/gi;
        const results: ServerIdentifier[] = [];
        let match;
        while ((match = linkPattern.exec(html)) !== null) {
            results.push({
                eid: match[1],
                name: match[2].trim(),
                unused: 0,
                macro: 0,
                fun: 0,
                typedef: 0,
                suetag: 0,
                sumember: 0,
                ordinary: 0,
                readonly: 0,
            });
        }
        return results;
    }

    private parseFileList(html: string): ServerFile[] {
        const linkPattern = /<a\s+href="file\.html\?id=(\d+)"[^>]*>([^<]+)<\/a>/gi;
        const results: ServerFile[] = [];
        let match;
        while ((match = linkPattern.exec(html)) !== null) {
            results.push({
                fid: parseInt(match[1], 10),
                name: match[2].trim(),
                readonly: false,
            });
        }
        return results;
    }

    private parseFunctionList(html: string): ServerFunction[] {
        const linkPattern = /<a\s+href="fun\.html\?f=([^"]+)"[^>]*>([^<]+)<\/a>/gi;
        const results: ServerFunction[] = [];
        const seen = new Set<string>();
        let match;
        while ((match = linkPattern.exec(html)) !== null) {
            const name = match[2].trim();
            if (!seen.has(name)) {
                seen.add(name);
                results.push({
                    id: parseInt(match[1], 10),
                    name,
                    isFileScoped: false,
                    fanin: 0,
                });
            }
        }
        return results;
    }

    private parseMetricsTable(html: string): ServerMetric[] {
        const metricsSection = html.match(/<table[^>]*class=['"]metrics['"][^>]*>([\s\S]*?)<\/table>/i);
        if (!metricsSection) { return []; }

        const rows = extractTableRows(metricsSection[1]);
        const metrics: ServerMetric[] = [];
        for (const row of rows) {
            if (row.length >= 2) {
                const name = row[0];
                const valueStr = row[row.length - 1];
                const value = parseFloat(valueStr);
                if (name && !isNaN(value)) {
                    metrics.push({ name, value });
                }
            }
        }
        return metrics;
    }

    

    private get(path: string): Promise<string> {
        return this.httpGet(path).catch((err: any) => {
            if (err.httpStatus) { throw err; }
            return this.tcpGet(path);
        });
    }

    private httpGet(path: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const url = `${this.baseUrl}${path}`;
            http.get(url, { timeout: 10000 }, (res) => {
                if (res.statusCode !== 200) {
                    const err: any = new Error(`HTTP ${res.statusCode} from ${url}`);
                    err.httpStatus = res.statusCode;
                    reject(err);
                    res.resume();
                    return;
                }
                let body = '';
                res.setEncoding('utf-8');
                res.on('data', (chunk: string) => { body += chunk; });
                res.on('end', () => resolve(body));
                res.on('error', reject);
            }).on('error', reject);
        });
    }

    private tcpGet(path: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const socket = net.createConnection({ host: this.host, port: this.port });
            let raw = '';
            let settled = false;

            const fail = (err: Error) => {
                if (settled) { return; }
                settled = true;
                socket.destroy();
                reject(err);
            };

            socket.setTimeout(12000);
            socket.setEncoding('utf-8');

            socket.on('connect', () => {
                socket.write(
                    `GET ${path} HTTP/1.0\r\n` +
                    `Host: ${this.host}:${this.port}\r\n` +
                    `Connection: close\r\n` +
                    `\r\n`
                );
            });

            socket.on('data', (chunk: string) => { raw += chunk; });

            socket.on('end', () => {
                if (settled) { return; }
                settled = true;

                const firstNewline = raw.indexOf('\n');
                if (firstNewline === -1) {
                    reject(new Error(`Empty response from ${path}`));
                    return;
                }

                const statusLine = raw.substring(0, firstNewline).trim();
                const statusMatch = /HTTP\/\S+\s+(\d+)/.exec(statusLine);
                const code = statusMatch ? parseInt(statusMatch[1], 10) : 0;
                if (code < 200 || code >= 300) {
                    reject(new Error(`HTTP ${code} for ${path}: ${statusLine}`));
                    return;
                }

                let bodyStart = raw.indexOf('\r\n\r\n');
                if (bodyStart !== -1) {
                    bodyStart += 4;
                } else {
                    bodyStart = raw.indexOf('\n\n');
                    bodyStart = bodyStart !== -1 ? bodyStart + 2 : firstNewline + 1;
                }

                resolve(raw.substring(bodyStart));
            });

            socket.on('timeout', () => fail(new Error(`Timeout fetching ${path}`)));
            socket.on('error', (err: Error) => fail(err));
        });
    }
}

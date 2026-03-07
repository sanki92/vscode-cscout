import * as http from 'http';



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
    id: string;
    isStatic: boolean;
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




function extractLinks(html: string, pattern: RegExp): { href: string; text: string }[] {
    const results: { href: string; text: string }[] = [];
    let match;
    while ((match = pattern.exec(html)) !== null) {
        results.push({ href: match[1], text: match[2] });
    }
    return results;
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

function getParam(href: string, param: string): string | undefined {
    const match = new RegExp(`[?&]${param}=([^&]+)`).exec(href);
    return match ? decodeURIComponent(match[1]) : undefined;
}



export class CScoutServer {
    private baseUrl: string;
    private _hasRestApi: boolean | undefined;

    constructor(host: string = 'localhost', port: number = 8081) {
        this.baseUrl = `http://${host}:${port}`;
    }

    async isAlive(): Promise<boolean> {
        try {
            const html = await this.get('/index.html');
            return html.includes('CScout');
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

    

    async getIdentifiers(options?: { unused?: boolean; writable?: boolean }): Promise<ServerIdentifier[]> {
        const params = new URLSearchParams();
        if (options?.unused) { params.set('unused', 'true'); }
        if (options?.writable) { params.set('writable', 'true'); }
        const qs = params.toString();
        const resp = await this.get(`/api/identifiers${qs ? '?' + qs : ''}`);
        return JSON.parse(resp);
    }

    async getIdentifierById(eid: string | number): Promise<ServerIdentifier> {
        const resp = await this.get(`/api/identifiers/${eid}`);
        return JSON.parse(resp);
    }

    async getIdentifierLocations(eid: string | number): Promise<TokenLocation[]> {
        const resp = await this.get(`/api/identifiers/${eid}/locations`);
        return JSON.parse(resp);
    }

    async getFiles(options?: { writable?: boolean }): Promise<ServerFile[]> {
        const qs = options?.writable ? '?writable=true' : '';
        const resp = await this.get(`/api/files${qs}`);
        return JSON.parse(resp);
    }

    async getFileMetrics(fid: number): Promise<Record<string, any>> {
        const resp = await this.get(`/api/files/${fid}/metrics`);
        return JSON.parse(resp);
    }

    async getFunctions(options?: { defined?: boolean }): Promise<ServerFunction[]> {
        const qs = options?.defined ? '?defined=true' : '';
        const resp = await this.get(`/api/functions${qs}`);
        return JSON.parse(resp);
    }

    async getCallers(funcId: string | number): Promise<ServerFunction[]> {
        const resp = await this.get(`/api/functions/${funcId}/callers`);
        return JSON.parse(resp);
    }

    async getCallees(funcId: string | number): Promise<ServerFunction[]> {
        const resp = await this.get(`/api/functions/${funcId}/callees`);
        return JSON.parse(resp);
    }

    async getProjects(): Promise<{ pid: number; name: string }[]> {
        const resp = await this.get('/api/projects');
        return JSON.parse(resp);
    }

    async getProjectFiles(pid: number): Promise<ServerFile[]> {
        const resp = await this.get(`/api/projects/${pid}/files`);
        return JSON.parse(resp);
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
                    id: match[1],
                    name,
                    isStatic: false,
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
        return new Promise((resolve, reject) => {
            const url = `${this.baseUrl}${path}`;
            http.get(url, { timeout: 10000 }, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode} from ${url}`));
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
}

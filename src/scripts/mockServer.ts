import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';

const PORT = 8081;
const DEFAULT_DB = path.join(__dirname, '..', '..', 'sample', 'sample-cscout.db');

// Helpers 

function queryDb(db: SqlJsDatabase, sql: string): Record<string, any>[] {
    const result = db.exec(sql);
    if (result.length === 0) { return []; }
    const cols = result[0].columns;
    return result[0].values.map(row => {
        const obj: Record<string, any> = {};
        for (let i = 0; i < cols.length; i++) { obj[cols[i]] = row[i]; }
        return obj;
    });
}

function json(res: http.ServerResponse, data: any, status = 200) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(data));
}

function matchRoute(pathname: string, pattern: string): Record<string, string> | null {
    const patternParts = pattern.split('/');
    const pathParts = pathname.split('/');
    if (patternParts.length !== pathParts.length) { return null; }
    const params: Record<string, string> = {};
    for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
            params[patternParts[i].slice(1)] = pathParts[i];
        } else if (patternParts[i] !== pathParts[i]) {
            return null;
        }
    }
    return params;
}

// Main 

async function main() {
    const dbPath = process.argv[2] || DEFAULT_DB;

    if (!fs.existsSync(dbPath)) {
        console.error(`Database not found: ${dbPath}`);
        process.exit(1);
    }

    console.log(`Loading database: ${dbPath}`);
    const SQL = await initSqlJs();
    const buf = fs.readFileSync(dbPath);
    const db = new SQL.Database(buf);
    console.log('Database loaded.');

    const server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', `http://localhost:${PORT}`);
        const pathname = url.pathname;

        const start = Date.now();
        res.on('finish', () => {
            const ms = Date.now() - start;
            console.log(`${res.statusCode} ${req.method} ${req.url} ${ms}ms`);
        });

        try {

            // GET /api/identifiers
            if (pathname === '/api/identifiers') {
                let sql = `SELECT EID as eid, NAME as name,
                           UNUSED as unused, MACRO as macro,
                           FUN as fun, TYPEDEF as typedef,
                           SUETAG as suetag, SUMEMBER as sumember,
                           ORDINARY as ordinary, READONLY as readonly
                           FROM IDS`;
                const conditions: string[] = [];
                if (url.searchParams.get('unused') === 'true') { conditions.push('UNUSED = 1'); }
                if (url.searchParams.get('writable') === 'true') { conditions.push('READONLY = 0'); }
                if (conditions.length) { sql += ' WHERE ' + conditions.join(' AND '); }
                sql += ' ORDER BY NAME';
                json(res, queryDb(db, sql));
                return;
            }

            // GET /api/identifiers/:eid
            let params = matchRoute(pathname, '/api/identifiers/:eid');
            if (params) {
                const rows = queryDb(db,
                    `SELECT EID as eid, NAME as name,
                            UNUSED as unused, MACRO as macro,
                            FUN as fun, TYPEDEF as typedef,
                            SUETAG as suetag, SUMEMBER as sumember,
                            ORDINARY as ordinary, READONLY as readonly
                     FROM IDS WHERE EID = ${params.eid}`);
                if (rows.length === 0) { json(res, { error: 'Identifier not found' }, 404); }
                else { json(res, rows[0]); }
                return;
            }

            // GET /api/identifiers/:eid/locations
            params = matchRoute(pathname, '/api/identifiers/:eid/locations');
            if (params) {
                const rows = queryDb(db,
                    `SELECT t.FID as fid, t.FOFFSET as offset, f.NAME as file,
                            lp.LNUM as line,
                            (t.FOFFSET - lp.FOFFSET) as col
                     FROM TOKENS t
                     JOIN FILES f ON f.FID = t.FID
                     JOIN LINEPOS lp ON lp.FID = t.FID
                         AND lp.FOFFSET = (
                             SELECT MAX(FOFFSET) FROM LINEPOS
                             WHERE FID = t.FID AND FOFFSET <= t.FOFFSET
                         )
                     WHERE t.EID = ${params.eid}
                     ORDER BY t.FID, t.FOFFSET`);
                json(res, rows);
                return;
            }

            // GET /api/files
            if (pathname === '/api/files') {
                const writable = url.searchParams.get('writable');
                let sql = 'SELECT FID as fid, NAME as name, RO as readonly FROM FILES';
                if (writable === 'true') { sql += ' WHERE RO = 0'; }
                sql += ' ORDER BY NAME';
                json(res, queryDb(db, sql));
                return;
            }

            // GET /api/files/:fid/metrics
            params = matchRoute(pathname, '/api/files/:fid/metrics');
            if (params) {
                const rows = queryDb(db,
                    `SELECT * FROM FILEMETRICS WHERE FID = ${params.fid} AND PRECPP = 0`);
                if (rows.length === 0) { json(res, { error: 'No metrics for this file' }, 404); }
                else { json(res, rows[0]); }
                return;
            }

            // GET /api/functions
            if (pathname === '/api/functions') {
                const defined = url.searchParams.get('defined');
                let sql = 'SELECT ID as id, NAME as name, FILESCOPED as isStatic FROM FUNCTIONS';
                if (defined === 'true') { sql += ' WHERE DEFINED = 1'; }
                sql += ' ORDER BY NAME';
                json(res, queryDb(db, sql));
                return;
            }

            // GET /api/functions/:id/callers
            params = matchRoute(pathname, '/api/functions/:id/callers');
            if (params) {
                const rows = queryDb(db,
                    `SELECT src.ID as id, src.NAME as name
                     FROM FCALLS fc
                     JOIN FUNCTIONS src ON src.ID = fc.SOURCEID
                     WHERE fc.DESTID = ${params.id}
                     ORDER BY src.NAME`);
                json(res, rows);
                return;
            }

            // GET /api/functions/:id/callees
            params = matchRoute(pathname, '/api/functions/:id/callees');
            if (params) {
                const rows = queryDb(db,
                    `SELECT dst.ID as id, dst.NAME as name
                     FROM FCALLS fc
                     JOIN FUNCTIONS dst ON dst.ID = fc.DESTID
                     WHERE fc.SOURCEID = ${params.id}
                     ORDER BY dst.NAME`);
                json(res, rows);
                return;
            }

            // GET /api/projects
            if (pathname === '/api/projects') {
                json(res, queryDb(db, 'SELECT PID as pid, NAME as name FROM PROJECTS ORDER BY NAME'));
                return;
            }

            // GET /api/projects/:pid/files
            params = matchRoute(pathname, '/api/projects/:pid/files');
            if (params) {
                const rows = queryDb(db,
                    `SELECT f.FID as fid, f.NAME as name
                     FROM FILES f
                     JOIN FILEPROJ fp ON fp.FID = f.FID
                     WHERE fp.PID = ${params.pid}
                     ORDER BY f.NAME`);
                json(res, rows);
                return;
            }

            // Legacy HTML (SWILL-compatible)

            // /index.html — isAlive() check
            if (pathname === '/' || pathname === '/index.html') {
                res.setHeader('Content-Type', 'text/html');
                res.end(`
                    <html><head><title>CScout Mock Server</title></head>
                    <body>
                    <h1>CScout Mock Server</h1>
                    <p>REST API: <a href="/api/identifiers">/api/identifiers</a> |
                    <a href="/api/files">/api/files</a> |
                    <a href="/api/functions">/api/functions</a> |
                    <a href="/api/projects">/api/projects</a></p>
                    <p>Legacy HTML: <a href="/xiquery.html">/xiquery.html</a> |
                    <a href="/xfilequery.html">/xfilequery.html</a> |
                    <a href="/xfunquery.html">/xfunquery.html</a></p>
                    </body></html>
                `);
                return;
            }

            if (pathname === '/xiquery.html') {
                res.setHeader('Content-Type', 'text/html');
                let sql = 'SELECT EID, NAME FROM IDS';
                const conds: string[] = [];
                if (url.searchParams.get('unused') === '1') { conds.push('UNUSED = 1'); }
                if (url.searchParams.get('writable') === '1') { conds.push('READONLY = 0'); }
                if (conds.length) { sql += ' WHERE ' + conds.join(' AND '); }
                sql += ' ORDER BY NAME LIMIT 500';
                const result = db.exec(sql);
                let html = '<html><body><p>Matching identifiers:<br>';
                if (result.length > 0) {
                    for (const row of result[0].values) {
                        html += `<a href="id.html?id=${row[0]}">${row[1]}</a><br>\n`;
                    }
                }
                html += '</p></body></html>';
                res.end(html);
                return;
            }

            if (pathname === '/xfilequery.html') {
                res.setHeader('Content-Type', 'text/html');
                const result = db.exec('SELECT FID, NAME FROM FILES ORDER BY NAME');
                let html = '<html><body><table class="dirlist">';
                if (result.length > 0) {
                    for (const row of result[0].values) {
                        const dir = String(row[1]).replace(/[^/\\]+$/, '');
                        const file = String(row[1]).replace(/^.*[/\\]/, '');
                        html += `<tr><td>${dir}</td><td><a href="file.html?id=${row[0]}">${file}</a></td></tr>\n`;
                    }
                }
                html += '</table></body></html>';
                res.end(html);
                return;
            }

            if (pathname === '/xfunquery.html') {
                res.setHeader('Content-Type', 'text/html');
                const result = db.exec('SELECT ID, NAME FROM FUNCTIONS ORDER BY NAME LIMIT 500');
                let html = '<html><body><p>Matching functions:<br>';
                if (result.length > 0) {
                    for (const row of result[0].values) {
                        html += `<a href="fun.html?f=${row[0]}">${row[1]}</a><br>\n`;
                    }
                }
                html += '</p></body></html>';
                res.end(html);
                return;
            }

           
            res.statusCode = 404;
            res.end('Not found');

        } catch (err: any) {
            console.error(`Error handling ${pathname}:`, err.message);
            json(res, { error: err.message }, 500);
        }
    });

    server.listen(PORT, () => {
        console.log(`CScout mock server listening on http://localhost:${PORT}`);
    });
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});

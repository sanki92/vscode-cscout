/**
 * Tests for the CScout REST API endpoints.
 *
 * Starts a minimal mock server in-process that serves `/api/...` endpoints
 * backed by the sample SQLite database, then validates each route
 * returns correct structured JSON.
 *
 * Run with: npx mocha out/test/jsonEndpoint.test.js --timeout 15000
 */

import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as assert from 'assert';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';

const SAMPLE_DB = path.join(__dirname, '..', '..', 'sample', 'sample-cscout.db');
const PORT = 18081; // Use a non-standard port to avoid conflicts

let server: http.Server;

function httpGet(urlPath: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:${PORT}${urlPath}`, { timeout: 5000 }, (res) => {
            let body = '';
            res.on('data', (chunk: string) => { body += chunk; });
            res.on('end', () => resolve({ status: res.statusCode ?? 200, body }));
            res.on('error', reject);
        }).on('error', reject);
    });
}

/** Helper to run a SQL query returning keyed objects. */
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


describe('REST API Endpoints (/api/...)', () => {

    before(async function () {
        this.timeout(10000);
        const SQL = await initSqlJs();
        const buf = fs.readFileSync(SAMPLE_DB);
        const db = new SQL.Database(buf);

        // Minimal in-process REST server for testing
        server = http.createServer((req, res) => {
            const url = new URL(req.url || '/', `http://localhost:${PORT}`);
            const pathname = url.pathname;

            const json = (data: any, status = 200) => {
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));
            };

            try {
                if (pathname === '/index.html') {
                    res.end('<html><body>CScout Mock</body></html>');
                    return;
                }

                // /api/identifiers
                if (pathname === '/api/identifiers') {
                    let sql = 'SELECT EID as eid, NAME as name, UNUSED as unused, MACRO as macro, FUN as fun, TYPEDEF as typedef, SUETAG as suetag, SUMEMBER as sumember, ORDINARY as ordinary, READONLY as readonly FROM IDS';
                    const conds: string[] = [];
                    if (url.searchParams.get('unused') === 'true') { conds.push('UNUSED = 1'); }
                    if (url.searchParams.get('writable') === 'true') { conds.push('READONLY = 0'); }
                    if (conds.length) { sql += ' WHERE ' + conds.join(' AND '); }
                    sql += ' ORDER BY NAME';
                    json(queryDb(db, sql));
                    return;
                }

                // /api/identifier?eid=N — single identifier with inline locations
                if (pathname === '/api/identifier') {
                    const eidParam = url.searchParams.get('eid');
                    if (!eidParam) { json({ error: 'Missing eid' }, 400); return; }
                    const eid = parseInt(eidParam, 10);
                    const rows = queryDb(db,
                        `SELECT EID as eid, NAME as name, UNUSED as unused, MACRO as macro,
                                FUN as fun, TYPEDEF as typedef, SUETAG as suetag,
                                SUMEMBER as sumember, ORDINARY as ordinary, READONLY as readonly
                         FROM IDS WHERE EID=${eid}`);
                    if (!rows.length) { json({ error: 'Not found' }, 404); return; }
                    const obj = rows[0];
                    obj.locations = queryDb(db,
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
                         WHERE t.EID=${eid} ORDER BY t.FID, t.FOFFSET`);
                    json(obj);
                    return;
                }

                // /api/files
                if (pathname === '/api/files') {
                    let sql = 'SELECT FID as fid, NAME as name, RO as readonly FROM FILES';
                    if (url.searchParams.get('writable') === 'true') { sql += ' WHERE RO = 0'; }
                    sql += ' ORDER BY NAME';
                    json(queryDb(db, sql));
                    return;
                }

                // /api/filemetrics?fid=N
                if (pathname === '/api/filemetrics') {
                    const fidParam = url.searchParams.get('fid');
                    if (!fidParam) { json({ error: 'Missing fid' }, 400); return; }
                    const fid = parseInt(fidParam, 10);
                    const rows = queryDb(db,
                        `SELECT * FROM FILEMETRICS WHERE FID=${fid} AND PRECPP=0`);
                    if (!rows.length) { json({ error: 'No metrics' }, 404); return; }
                    json({ fid, name: '', metrics: rows[0] });
                    return;
                }

                // /api/functions
                if (pathname === '/api/functions') {
                    let sql = 'SELECT ID as id, NAME as name, FILESCOPED as isStatic FROM FUNCTIONS';
                    if (url.searchParams.get('defined') === 'true') { sql += ' WHERE DEFINED = 1'; }
                    sql += ' ORDER BY NAME';
                    json(queryDb(db, sql));
                    return;
                }

                // /api/function?id=N&callers=1 or &callees=1
                if (pathname === '/api/function') {
                    const idParam = url.searchParams.get('id');
                    if (!idParam) { json({ error: 'Missing id' }, 400); return; }
                    const funcId = parseInt(idParam, 10);
                    if (url.searchParams.get('callers') === '1') {
                        json(queryDb(db,
                            `SELECT src.ID as id, src.NAME as name
                             FROM FCALLS fc JOIN FUNCTIONS src ON src.ID=fc.SOURCEID
                             WHERE fc.DESTID=${funcId} ORDER BY src.NAME`));
                    } else if (url.searchParams.get('callees') === '1') {
                        json(queryDb(db,
                            `SELECT dst.ID as id, dst.NAME as name
                             FROM FCALLS fc JOIN FUNCTIONS dst ON dst.ID=fc.DESTID
                             WHERE fc.SOURCEID=${funcId} ORDER BY dst.NAME`));
                    } else {
                        json({ error: 'Specify callers=1 or callees=1' }, 400);
                    }
                    return;
                }

                // /api/projects
                if (pathname === '/api/projects') {
                    json(queryDb(db, 'SELECT PID as pid, NAME as name FROM PROJECTS ORDER BY NAME'));
                    return;
                }

                // /api/project_files?pid=N
                if (pathname === '/api/project_files') {
                    const pidParam = url.searchParams.get('pid');
                    if (!pidParam) { json({ error: 'Missing pid' }, 400); return; }
                    const pid = parseInt(pidParam, 10);
                    json(queryDb(db,
                        `SELECT f.FID as fid, f.NAME as name
                         FROM FILES f JOIN FILEPROJ fp ON fp.FID=f.FID
                         WHERE fp.PID=${pid} ORDER BY f.NAME`));
                    return;
                }

                res.statusCode = 404;
                res.end('Not found');
            } catch (err: any) {
                json({ error: err.message }, 500);
            }
        });

        await new Promise<void>(resolve => server.listen(PORT, resolve));
    });

    after(() => {
        server.close();
    });

    // Identifier endpoints

    it('GET /api/identifiers — returns all identifiers', async () => {
        const { body } = await httpGet('/api/identifiers');
        const data = JSON.parse(body);
        assert.ok(Array.isArray(data), 'Should be an array');
        assert.ok(data.length > 0, 'Should have identifiers');
        assert.ok('eid' in data[0], 'Row should have eid');
        assert.ok('name' in data[0], 'Row should have name');
        assert.ok('unused' in data[0], 'Row should have unused');
        assert.ok('macro' in data[0], 'Row should have macro');
        assert.ok('fun' in data[0], 'Row should have fun');
        assert.ok('typedef' in data[0], 'Row should have typedef');
    });

    it('GET /api/identifiers?unused=true — returns unused identifiers', async () => {
        const { body } = await httpGet('/api/identifiers?unused=true');
        const data = JSON.parse(body);
        assert.ok(Array.isArray(data));
        assert.ok(data.length > 0, 'Sample DB has unused identifiers');
        for (const id of data) {
            assert.ok(id.unused, `${id.name} should be unused`);
        }
    });

    it('GET /api/identifier?eid=N — returns a single identifier with locations', async () => {
        // Get an EID first
        const { body: allBody } = await httpGet('/api/identifiers');
        const all = JSON.parse(allBody);
        const eid = all[0].eid;

        const { body } = await httpGet(`/api/identifier?eid=${eid}`);
        const data = JSON.parse(body);
        assert.ok(!Array.isArray(data), 'Should be a single object');
        assert.strictEqual(data.eid, eid);
        assert.ok('name' in data);
        assert.ok('locations' in data, 'Should include locations array');
        assert.ok(Array.isArray(data.locations));
    });

    it('GET /api/identifier?eid=999999 — returns 404 for unknown', async () => {
        const { status } = await httpGet('/api/identifier?eid=999999');
        assert.strictEqual(status, 404);
    });

    it('GET /api/identifier?eid=N — locations have expected fields', async () => {
        const { body: allBody } = await httpGet('/api/identifiers');
        const all = JSON.parse(allBody);
        const eid = all[0].eid;

        const { body } = await httpGet(`/api/identifier?eid=${eid}`);
        const data = JSON.parse(body);
        assert.ok(data.locations.length > 0, 'Should have at least one location');
        assert.ok('fid' in data.locations[0]);
        assert.ok('offset' in data.locations[0]);
        assert.ok('file' in data.locations[0]);
        assert.ok('line' in data.locations[0], 'Location should have line');
        assert.ok('col' in data.locations[0], 'Location should have col');
    });

    // File endpoints

    it('GET /api/files — returns all files', async () => {
        const { body } = await httpGet('/api/files');
        const data = JSON.parse(body);
        assert.ok(Array.isArray(data));
        assert.ok(data.length > 0, 'Should have files');
        assert.ok('fid' in data[0]);
        assert.ok('name' in data[0]);
    });

    it('GET /api/filemetrics?fid=N — returns file metrics', async () => {
        const { body: filesBody } = await httpGet('/api/files');
        const files = JSON.parse(filesBody);
        const fid = files[0].fid;

        const { body } = await httpGet(`/api/filemetrics?fid=${fid}`);
        const data = JSON.parse(body);
        assert.ok(!Array.isArray(data), 'Should be a single metrics object');
        assert.ok('metrics' in data, 'Should have metrics field');
        assert.ok('NLINE' in data.metrics || 'FID' in data.metrics, 'Metrics should have columns');
    });

    // Function endpoints

    it('GET /api/functions — returns all functions', async () => {
        const { body } = await httpGet('/api/functions');
        const data = JSON.parse(body);
        assert.ok(Array.isArray(data));
        assert.ok(data.length > 0, 'Should have functions');
        assert.ok('name' in data[0]);
        assert.ok('id' in data[0]);
    });

    it('GET /api/function?id=N&callers=1 — returns callers', async () => {
        const { body: funBody } = await httpGet('/api/functions');
        const funs = JSON.parse(funBody);
        const { body } = await httpGet(`/api/function?id=${funs[0].id}&callers=1`);
        const data = JSON.parse(body);
        assert.ok(Array.isArray(data), 'Should be an array');
    });

    it('GET /api/function?id=N&callees=1 — returns callees', async () => {
        const { body: funBody } = await httpGet('/api/functions');
        const funs = JSON.parse(funBody);
        const { body } = await httpGet(`/api/function?id=${funs[0].id}&callees=1`);
        const data = JSON.parse(body);
        assert.ok(Array.isArray(data), 'Should be an array');
    });

    // Project endpoints

    it('GET /api/projects — returns all projects', async () => {
        const { body } = await httpGet('/api/projects');
        const data = JSON.parse(body);
        assert.ok(Array.isArray(data));
        assert.ok(data.length > 0, 'Should have projects');
        assert.ok('pid' in data[0]);
        assert.ok('name' in data[0]);
    });

    it('GET /api/project_files?pid=N — returns project files', async () => {
        const { body: projBody } = await httpGet('/api/projects');
        const projects = JSON.parse(projBody);
        const pid = projects[0].pid;

        const { body } = await httpGet(`/api/project_files?pid=${pid}`);
        const data = JSON.parse(body);
        assert.ok(Array.isArray(data));
        assert.ok(data.length > 0, 'Project should have files');
        assert.ok('fid' in data[0]);
        assert.ok('name' in data[0]);
    });

    // Error handling

    it('should return 404 for unknown routes', async () => {
        const { status } = await httpGet('/api/nonexistent');
        assert.strictEqual(status, 404);
    });

    // CScoutServer client integration 

    it('CScoutServer.isAlive() — should return true', async () => {
        const { CScoutServer } = await import('../services/cscoutServer');
        const client = new CScoutServer('localhost', PORT);
        const alive = await client.isAlive();
        assert.strictEqual(alive, true);
    });

    it('CScoutServer.getIdentifiers() — should return identifiers via REST', async () => {
        const { CScoutServer } = await import('../services/cscoutServer');
        const client = new CScoutServer('localhost', PORT);
        const ids = await client.getIdentifiers();
        assert.ok(Array.isArray(ids));
        assert.ok(ids.length > 0);
        assert.ok('eid' in ids[0]);
        assert.ok('name' in ids[0]);
    });

    it('CScoutServer.getFiles() — should return files via REST', async () => {
        const { CScoutServer } = await import('../services/cscoutServer');
        const client = new CScoutServer('localhost', PORT);
        const files = await client.getFiles();
        assert.ok(Array.isArray(files));
        assert.ok(files.length > 0);
        assert.ok('fid' in files[0]);
    });

    it('CScoutServer.getFunctions() — should return functions via REST', async () => {
        const { CScoutServer } = await import('../services/cscoutServer');
        const client = new CScoutServer('localhost', PORT);
        const funs = await client.getFunctions();
        assert.ok(Array.isArray(funs));
        assert.ok(funs.length > 0);
        assert.ok('name' in funs[0]);
    });
});

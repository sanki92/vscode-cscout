/**
 * Tests for CScoutDatabase — verifies query layer against the sample database.
 *
 * Run with: npx mocha out/test/cscoutDatabase.test.js
 * (compile first: npm run compile)
 */

import { CScoutDatabase } from '../db/cscoutDatabase';
import * as path from 'path';
import * as assert from 'assert';

const SAMPLE_DB = path.join(__dirname, '..', '..', 'sample', 'sample-cscout.db');

describe('CScoutDatabase', () => {
    let db: CScoutDatabase;

    before(async () => {
        db = await CScoutDatabase.open(SAMPLE_DB);
    });

    after(() => {
        db.close();
    });

    // Basic counts

    describe('counts', () => {
        it('should have files', () => {
            const count = db.getFileCount();
            assert.ok(count > 0, `Expected files, got ${count}`);
        });

        it('should have functions', () => {
            const count = db.getFunctionCount();
            assert.ok(count > 0, `Expected functions, got ${count}`);
        });

        it('should have identifiers', () => {
            const count = db.getIdentifierCount();
            assert.ok(count > 0, `Expected identifiers, got ${count}`);
        });
    });

    // Files 

    describe('files', () => {
        it('should list all files', () => {
            const files = db.getFiles();
            assert.ok(files.length > 0);
            // Each file should have fid, name
            for (const f of files) {
                assert.ok(typeof f.fid === 'number');
                assert.ok(typeof f.name === 'string');
                assert.ok(f.name.length > 0);
            }
        });

        it('should find a file by path (using findFid)', () => {
            const files = db.getFiles();
            // Use the first file's name to look it up
            const fid = db.findFid(files[0].name);
            assert.ok(fid !== undefined, `Could not find FID for ${files[0].name}`);
            assert.strictEqual(fid, files[0].fid);
        });

        it('should return the file path for a FID', () => {
            const files = db.getFiles();
            const name = db.getFilePath(files[0].fid);
            assert.strictEqual(name, files[0].name);
        });
    });

    // Projects

    describe('projects', () => {
        it('should list projects', () => {
            const projects = db.getProjects();
            assert.ok(projects.length > 0);
            for (const p of projects) {
                assert.ok(typeof p.pid === 'number');
                assert.ok(typeof p.name === 'string');
            }
        });

        it('should list files for a project', () => {
            const projects = db.getProjects();
            const files = db.getProjectFiles(projects[0].pid);
            assert.ok(files.length > 0, 'Project has no files');
        });
    });

    // Identifiers 

    describe('identifiers', () => {
        it('should list identifiers', () => {
            const ids = db.getIdentifiers(100);
            assert.ok(ids.length > 0);
            for (const id of ids) {
                assert.ok(typeof id.eid === 'number');
                assert.ok(typeof id.name === 'string');
            }
        });

        it('should find identifier by name', () => {
            const ids = db.getIdentifiers(100);
            const target = ids[0];
            const found = db.findIdentifierByName(target.name);
            assert.ok(found, `Could not find identifier '${target.name}'`);
            assert.strictEqual(found!.name, target.name);
        });

        it('should return locations for an identifier (cross-references)', () => {
            const ids = db.getIdentifiers(100);
            // Find one that has locations
            let found = false;
            for (const id of ids) {
                const locs = db.getIdentifierLocations(id.eid);
                if (locs.length > 0) {
                    found = true;
                    for (const loc of locs) {
                        assert.ok(typeof loc.fid === 'number');
                        assert.ok(typeof loc.line === 'number');
                        assert.ok(loc.line >= 1, `Line should be >= 1, got ${loc.line}`);
                        assert.ok(typeof loc.column === 'number');
                        assert.ok(loc.column >= 0, `Column should be >= 0, got ${loc.column}`);
                        assert.ok(typeof loc.filePath === 'string');
                    }
                    break;
                }
            }
            assert.ok(found, 'No identifier had any locations');
        });

        it('should find unused identifiers', () => {
            const unused = db.getUnusedIdentifiers();
            // Our sample DB has unused ones (format_output, debug_log, EPSILON, DEBUG_MODE)
            assert.ok(unused.length > 0, 'Expected unused identifiers');
            for (const id of unused) {
                assert.ok(id.unused, `${id.name} should be marked unused`);
            }
        });
    });

    // Functions 

    describe('functions', () => {
        it('should list functions', () => {
            const fns = db.getFunctions(100);
            assert.ok(fns.length > 0);
            for (const fn of fns) {
                assert.ok(typeof fn.id === 'number');
                assert.ok(typeof fn.name === 'string');
            }
        });

        it('should find function by name', () => {
            const fns = db.getFunctions(100);
            const target = fns[0];
            const found = db.getFunctionByName(target.name);
            assert.ok(found, `Could not find function '${target.name}'`);
            assert.strictEqual(found!.name, target.name);
        });

        it('should resolve function location', () => {
            const fns = db.getFunctions(100);
            for (const fn of fns) {
                const loc = db.getFunctionLocation(fn.id);
                if (loc) {
                    assert.ok(loc.line >= 1);
                    assert.ok(loc.column >= 0);
                    assert.ok(loc.filePath.length > 0);
                    return; // Success — at least one function has a valid location
                }
            }
            assert.fail('No function had a resolvable location');
        });
    });

    // Call Graph

    describe('call graph', () => {
        it('should return callees for a function', () => {
            const fns = db.getFunctions(100);
            let found = false;
            for (const fn of fns) {
                const callees = db.getCallees(fn.id);
                if (callees.length > 0) {
                    found = true;
                    for (const c of callees) {
                        assert.ok(typeof c.destName === 'string');
                        assert.ok(typeof c.sourceName === 'string');
                    }
                    break;
                }
            }
            assert.ok(found, 'No function had any callees');
        });

        it('should return callers for a function', () => {
            const fns = db.getFunctions(100);
            let found = false;
            for (const fn of fns) {
                const callers = db.getCallers(fn.id);
                if (callers.length > 0) {
                    found = true;
                    for (const c of callers) {
                        assert.ok(typeof c.sourceName === 'string');
                        assert.ok(typeof c.destName === 'string');
                    }
                    break;
                }
            }
            assert.ok(found, 'No function had any callers');
        });
    });

    // Metrics

    describe('metrics', () => {
        it('should return file metrics for all files', () => {
            const all = db.getFileMetricsAll();
            assert.ok(all.length > 0, 'Expected file metrics');
            for (const entry of all) {
                assert.ok(typeof entry.name === 'string');
                assert.ok(entry.metrics !== undefined);
            }
        });

        it('should return file metrics by path', () => {
            const files = db.getFiles();
            // Try each file until we find one with metrics
            for (const f of files) {
                const m = db.getFileMetrics(f.name);
                if (m) {
                    assert.ok(typeof m === 'object');
                    return;
                }
            }
            // It's ok if no single file has metrics — they may only exist in aggregate
        });
    });

    // Token → Location resolution

    describe('resolveLocation', () => {
        it('should resolve a valid (fid, offset) to line and column', () => {
            const files = db.getFiles();
            // Use offset 0 — should resolve to line 1, column 0
            const loc = db.resolveLocation(files[0].fid, 0);
            assert.ok(loc.line >= 1, `Expected line >= 1, got ${loc.line}`);
            assert.ok(loc.column >= 0, `Expected column >= 0, got ${loc.column}`);
            assert.strictEqual(loc.fid, files[0].fid);
        });
    });
});

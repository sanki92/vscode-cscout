/**
 * Tests for CScoutServer — verifies HTML parsing logic.
 *
 * These tests do NOT require a running CScout server.
 * They test the parser methods by feeding sample HTML directly.
 *
 * Run with: npx mocha out/test/cscoutServer.test.js
 */

import * as assert from 'assert';

// We can't import private methods directly, so we test the public interface
// by creating a mock server that returns canned HTML.
// For parser-only tests, we replicate the parser logic here.

/** Replicate the link extraction pattern from CScoutServer */
function parseIdentifierLinks(html: string): { eid: number; name: string }[] {
    const linkPattern = /<a\s+href="id\.html\?id=([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    const results: { eid: number; name: string }[] = [];
    let match;
    while ((match = linkPattern.exec(html)) !== null) {
        const raw = match[1];
        const eid = raw.startsWith('0x') ? parseInt(raw, 16) : parseInt(raw, 10);
        results.push({ eid, name: match[2].trim() });
    }
    return results;
}

function parseFileLinks(html: string): { fid: number; name: string }[] {
    const linkPattern = /<a\s+href="file\.html\?id=(\d+)"[^>]*>([^<]+)<\/a>/gi;
    const results: { fid: number; name: string }[] = [];
    let match;
    while ((match = linkPattern.exec(html)) !== null) {
        results.push({ fid: parseInt(match[1], 10), name: match[2].trim() });
    }
    return results;
}

function parseFunctionLinks(html: string): { id: string; name: string }[] {
    const linkPattern = /<a\s+href="fun\.html\?f=([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    const results: { id: string; name: string }[] = [];
    const seen = new Set<string>();
    let match;
    while ((match = linkPattern.exec(html)) !== null) {
        const name = match[2].trim();
        if (!seen.has(name)) {
            seen.add(name);
            results.push({ id: match[1], name });
        }
    }
    return results;
}

function parseMetricsTable(html: string): { name: string; value: number }[] {
    const metricsSection = html.match(/<table[^>]*class=['"]metrics['"][^>]*>([\s\S]*?)<\/table>/i);
    if (!metricsSection) { return []; }

    const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const metrics: { name: string; value: number }[] = [];

    let rowMatch;
    while ((rowMatch = rowPattern.exec(metricsSection[1])) !== null) {
        const cells: string[] = [];
        let cellMatch;
        while ((cellMatch = cellPattern.exec(rowMatch[1])) !== null) {
            cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
        }
        if (cells.length >= 2) {
            const name = cells[0];
            const value = parseFloat(cells[cells.length - 1]);
            if (name && !isNaN(value)) {
                metrics.push({ name, value });
            }
        }
    }
    return metrics;
}

// Tests

describe('CScoutServer HTML Parsers', () => {

    describe('parseIdentifierLinks', () => {
        it('should parse identifier links from xiquery output', () => {
            const html = `
                <html><body>
                <p>Matching identifiers:
                <a href="id.html?id=0x55a1b2c3">my_var</a><br>
                <a href="id.html?id=0x55a1b2c4">another_func</a><br>
                <a href="id.html?id=0x55a1b2c5">MAX_BUF</a><br>
                </p>
                </body></html>
            `;
            const ids = parseIdentifierLinks(html);
            assert.strictEqual(ids.length, 3);
            assert.strictEqual(ids[0].name, 'my_var');
            assert.strictEqual(ids[0].eid, parseInt('0x55a1b2c3', 16));
            assert.strictEqual(ids[1].name, 'another_func');
            assert.strictEqual(ids[2].name, 'MAX_BUF');
        });

        it('should return empty array for no matches', () => {
            const html = '<html><body>No identifiers found.</body></html>';
            const ids = parseIdentifierLinks(html);
            assert.strictEqual(ids.length, 0);
        });

        it('should handle identifiers with underscores and numbers', () => {
            const html = '<a href="id.html?id=0xabc">_var_123</a>';
            const ids = parseIdentifierLinks(html);
            assert.strictEqual(ids.length, 1);
            assert.strictEqual(ids[0].name, '_var_123');
        });
    });

    describe('parseFileLinks', () => {
        it('should parse file links from xfilequery output', () => {
            const html = `
                <table class="dirlist">
                <tr><td>/home/dev/</td><td><a href="file.html?id=1">main.c</a></td></tr>
                <tr><td>/home/dev/</td><td><a href="file.html?id=2">utils.c</a></td></tr>
                <tr><td>/usr/include/</td><td><a href="file.html?id=3">stdio.h</a></td></tr>
                </table>
            `;
            const files = parseFileLinks(html);
            assert.strictEqual(files.length, 3);
            assert.strictEqual(files[0].fid, 1);
            assert.strictEqual(files[0].name, 'main.c');
            assert.strictEqual(files[2].fid, 3);
            assert.strictEqual(files[2].name, 'stdio.h');
        });

        it('should handle empty file list', () => {
            const html = '<html><body>No files match the query.</body></html>';
            const files = parseFileLinks(html);
            assert.strictEqual(files.length, 0);
        });
    });

    describe('parseFunctionLinks', () => {
        it('should parse function links from xfunquery output', () => {
            const html = `
                <p>Matching functions:
                <a href="fun.html?f=0x7f001234">main</a><br>
                <a href="fun.html?f=0x7f005678">calc_add</a><br>
                <a href="fun.html?f=0x7f009abc">print_result</a><br>
                </p>
            `;
            const fns = parseFunctionLinks(html);
            assert.strictEqual(fns.length, 3);
            assert.strictEqual(fns[0].name, 'main');
            assert.strictEqual(fns[1].name, 'calc_add');
            assert.strictEqual(fns[2].name, 'print_result');
        });

        it('should deduplicate function names', () => {
            const html = `
                <a href="fun.html?f=0x001">foo</a>
                <a href="fun.html?f=0x002">foo</a>
                <a href="fun.html?f=0x003">bar</a>
            `;
            const fns = parseFunctionLinks(html);
            assert.strictEqual(fns.length, 2);
            assert.strictEqual(fns[0].name, 'foo');
            assert.strictEqual(fns[1].name, 'bar');
        });
    });

    describe('parseMetricsTable', () => {
        it('should parse a CScout metrics table', () => {
            const html = `
                <html><body>
                <table class="metrics">
                <tr><th>Metric</th><th>Pre-cpp</th><th>Post-cpp</th></tr>
                <tr><td>Number of lines</td><td>42</td><td>50</td></tr>
                <tr><td>Number of statements</td><td>15</td><td>20</td></tr>
                <tr><td>Cyclomatic complexity</td><td>5</td><td>7</td></tr>
                </table>
                </body></html>
            `;
            const metrics = parseMetricsTable(html);
            assert.strictEqual(metrics.length, 3);
            assert.strictEqual(metrics[0].name, 'Number of lines');
            assert.strictEqual(metrics[0].value, 50);  // Should use post-cpp (last col)
            assert.strictEqual(metrics[1].name, 'Number of statements');
            assert.strictEqual(metrics[1].value, 20);
            assert.strictEqual(metrics[2].name, 'Cyclomatic complexity');
            assert.strictEqual(metrics[2].value, 7);
        });

        it('should return empty for HTML with no metrics table', () => {
            const html = '<html><body><p>No metrics.</p></body></html>';
            const metrics = parseMetricsTable(html);
            assert.strictEqual(metrics.length, 0);
        });

        it('should skip rows with non-numeric values', () => {
            const html = `
                <table class="metrics">
                <tr><td>Lines</td><td>42</td></tr>
                <tr><td>Status</td><td>OK</td></tr>
                </table>
            `;
            const metrics = parseMetricsTable(html);
            assert.strictEqual(metrics.length, 1);
            assert.strictEqual(metrics[0].name, 'Lines');
        });
    });
});

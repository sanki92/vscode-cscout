import initSqlJs from 'sql.js';
import * as path from 'path';
import * as fs from 'fs';

const DB_PATH = path.join(__dirname, '..', '..', 'sample', 'sample-cscout.db');

async function main() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    if (fs.existsSync(DB_PATH)) { fs.unlinkSync(DB_PATH); }

    const SQL = await initSqlJs();
    const db = new SQL.Database();


    db.run(`
        CREATE TABLE FILES (
            FID INTEGER PRIMARY KEY,
            NAME CHARACTER VARYING NOT NULL,
            RO BOOLEAN NOT NULL
        );

        CREATE TABLE FILEMETRICS (
            FID INTEGER NOT NULL,
            PRECPP BOOLEAN NOT NULL,
            NCHAR INTEGER, NCCOMMENT INTEGER, NSPACE INTEGER,
            NLCOMMENT INTEGER, NBCOMMENT INTEGER,
            NLINE INTEGER, MAXLINELEN INTEGER,
            MAXSTMTLEN INTEGER, MAXSTMTNEST INTEGER,
            NULINE INTEGER, NTOKEN INTEGER,
            NPPDIRECTIVE INTEGER, NPPCOND INTEGER,
            NPPFMACRO INTEGER, NPPOMACRO INTEGER,
            NSTMT INTEGER, NOP INTEGER,
            NNCONST INTEGER, NCLIT INTEGER, NSTRING INTEGER,
            NIF INTEGER, NELSE INTEGER,
            NSWITCH INTEGER, NCASE INTEGER, NDEFAULT INTEGER,
            NBREAK INTEGER, NFOR INTEGER, NWHILE INTEGER,
            NDO INTEGER, NCONTINUE INTEGER, NGOTO INTEGER,
            NRETURN INTEGER,
            NPID INTEGER, NFID INTEGER, NMID INTEGER, NID INTEGER,
            NUPID INTEGER, NUFID INTEGER, NUMID INTEGER, NUID INTEGER,
            NPFUNCTION INTEGER, NFFUNCTION INTEGER,
            NPVAR INTEGER, NFVAR INTEGER,
            NAGGREGATE INTEGER, NAMEMBER INTEGER,
            NENUM INTEGER, NEMEMBER INTEGER,
            PRIMARY KEY (FID, PRECPP)
        );

        CREATE TABLE IDS (
            EID INTEGER PRIMARY KEY,
            NAME CHARACTER VARYING NOT NULL,
            READONLY BOOLEAN NOT NULL,
            UNDEFMACRO BOOLEAN NOT NULL,
            MACRO BOOLEAN NOT NULL,
            MACROARG BOOLEAN NOT NULL,
            ORDINARY BOOLEAN NOT NULL,
            SUETAG BOOLEAN NOT NULL,
            SUMEMBER BOOLEAN NOT NULL,
            LABEL BOOLEAN NOT NULL,
            TYPEDEF BOOLEAN NOT NULL,
            ENUM BOOLEAN NOT NULL,
            YACC BOOLEAN NOT NULL,
            FUN BOOLEAN NOT NULL,
            CSCOPE BOOLEAN NOT NULL,
            LSCOPE BOOLEAN NOT NULL,
            UNUSED BOOLEAN NOT NULL
        );

        CREATE TABLE TOKENS (
            FID INTEGER NOT NULL,
            FOFFSET INTEGER NOT NULL,
            EID INTEGER NOT NULL,
            PRIMARY KEY (FID, FOFFSET)
        );

        CREATE TABLE LINEPOS (
            FID INTEGER NOT NULL,
            FOFFSET INTEGER NOT NULL,
            LNUM INTEGER NOT NULL,
            PRIMARY KEY (FID, FOFFSET)
        );

        CREATE TABLE PROJECTS (
            PID INTEGER PRIMARY KEY,
            NAME CHARACTER VARYING NOT NULL
        );

        CREATE TABLE IDPROJ (
            EID INTEGER NOT NULL,
            PID INTEGER NOT NULL,
            PRIMARY KEY (EID, PID)
        );

        CREATE TABLE FILEPROJ (
            FID INTEGER NOT NULL,
            PID INTEGER NOT NULL,
            PRIMARY KEY (FID, PID)
        );

        CREATE TABLE FUNCTIONS (
            ID INTEGER PRIMARY KEY,
            NAME CHARACTER VARYING NOT NULL,
            ISMACRO BOOLEAN NOT NULL,
            DEFINED BOOLEAN NOT NULL,
            DECLARED BOOLEAN NOT NULL,
            FILESCOPED BOOLEAN NOT NULL,
            FID INTEGER NOT NULL,
            FOFFSET INTEGER NOT NULL,
            FANIN INTEGER NOT NULL
        );

        CREATE TABLE FUNCTIONDEFS (
            FUNCTIONID INTEGER PRIMARY KEY,
            FIDBEGIN INTEGER NOT NULL,
            FOFFSETBEGIN INTEGER NOT NULL,
            FIDEND INTEGER NOT NULL,
            FOFFSETEND INTEGER NOT NULL
        );

        CREATE TABLE FUNCTIONMETRICS (
            FUNCTIONID INTEGER NOT NULL,
            PRECPP BOOLEAN NOT NULL,
            NCHAR INTEGER, NLINE INTEGER, MAXLINELEN INTEGER,
            NSTMT INTEGER, NOP INTEGER,
            NIF INTEGER, NELSE INTEGER,
            NSWITCH INTEGER, NCASE INTEGER, NDEFAULT INTEGER,
            NBREAK INTEGER, NFOR INTEGER, NWHILE INTEGER,
            NDO INTEGER, NCONTINUE INTEGER, NGOTO INTEGER,
            NRETURN INTEGER, NTOKEN INTEGER,
            NPID INTEGER, NFID INTEGER, NID INTEGER,
            NUPID INTEGER, NUFID INTEGER, NUID INTEGER,
            FANIN INTEGER, FANOUT INTEGER,
            CCYCL1 INTEGER, CCYCL2 INTEGER, CCYCL3 INTEGER,
            CSTRUC REAL, CHAL REAL, IFLOW REAL,
            PRIMARY KEY (FUNCTIONID, PRECPP)
        );

        CREATE TABLE FCALLS (
            SOURCEID INTEGER NOT NULL,
            DESTID INTEGER NOT NULL
        );

        CREATE TABLE FILECOPIES (
            GROUPID INTEGER NOT NULL,
            FID INTEGER NOT NULL,
            PRIMARY KEY (GROUPID, FID)
        );

        CREATE TABLE INCLUDERS (
            PID INTEGER NOT NULL,
            CUID INTEGER NOT NULL,
            BASEFILEID INTEGER NOT NULL,
            INCLUDERID INTEGER NOT NULL
        );
    `);


    db.run('INSERT INTO PROJECTS VALUES (?, ?)', [1, 'sample_calc']);

    const calcDir = path.join(__dirname, '..', '..', 'sample', 'calc');

    const files: [number, string, number][] = [
        [1, path.join(calcDir, 'main.c'),  0],
        [2, path.join(calcDir, 'calc.c'),  0],
        [3, path.join(calcDir, 'calc.h'),  0],
        [4, path.join(calcDir, 'utils.c'), 0],
        [5, path.join(calcDir, 'utils.h'), 0],
        [6, path.join(calcDir, 'stdio.h'),  1], 
        [7, path.join(calcDir, 'stdlib.h'), 1],
    ];
    for (const f of files) {
        db.run('INSERT INTO FILES VALUES (?, ?, ?)', f);
        if (!f[2]) { db.run('INSERT INTO FILEPROJ VALUES (?, ?)', [f[0], 1]); }
    }

    function insertLinePosForFile(fid: number, filePath: string) {
        if (!fs.existsSync(filePath)) { return; }
        const content = fs.readFileSync(filePath, 'utf8');
        let offset = 0;
        let lineNum = 1;
        db.run('INSERT INTO LINEPOS VALUES (?, ?, ?)', [fid, 0, 1]);
        for (let i = 0; i < content.length; i++) {
            if (content[i] === '\n') {
                offset = i + 1;
                lineNum++;
                db.run('INSERT INTO LINEPOS VALUES (?, ?, ?)', [fid, offset, lineNum]);
            }
        }
    }
    insertLinePosForFile(1, files[0][1] as string);
    insertLinePosForFile(2, files[1][1] as string);
    insertLinePosForFile(3, files[2][1] as string);
    insertLinePosForFile(4, files[3][1] as string);
    insertLinePosForFile(5, files[4][1] as string);

    const identifiers: any[][] = [
        [100, 'main',          0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
        [101, 'calc_add',      0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
        [102, 'calc_sub',      0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
        [103, 'calc_mul',      0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
        [104, 'calc_div',      0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
        [105, 'print_result',  0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
        [106, 'parse_input',   0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0],
        [107, 'format_output', 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1],
        [108, 'debug_log',     0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1],
        [200, 'result',        0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [201, 'argc',          0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [202, 'argv',          0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [203, 'op',            0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [204, 'a',             0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [205, 'b',             0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [300, 'MAX_BUF',       0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [301, 'EPSILON',       0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [302, 'DEBUG_MODE',    0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [400, 'CalcResult',    0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [401, 'value',         0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
        [402, 'error_code',    0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
        [500, 'calc_op_t',     0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
        [600, 'printf',        1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
    ];
    for (const id of identifiers) {
        db.run('INSERT INTO IDS VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id);
    }

    function findOffset(filePath: string, word: string, occurrence = 0): number {
        if (!fs.existsSync(filePath)) { return 0; }
        const content = fs.readFileSync(filePath, 'utf8');
        const re = new RegExp(`\\b${word}\\b`, 'g');
        let match; let count = 0;
        while ((match = re.exec(content)) !== null) {
            if (count++ === occurrence) { return match.index; }
        }
        return 0;
    }

    const mainC  = files[0][1] as string;
    const calcC  = files[1][1] as string;
    const calcH  = files[2][1] as string;
    const utilsC = files[3][1] as string;
    const utilsH = files[4][1] as string;

    const tokens: [number, number, number][] = [

        [1, findOffset(mainC,  'main'),         100],
        [1, findOffset(mainC,  'argc'),         201],
        [1, findOffset(mainC,  'argv'),         202],
        [1, findOffset(mainC,  'calc_add'),     101],
        [1, findOffset(mainC,  'calc_sub'),     102],
        [1, findOffset(mainC,  'print_result'), 105],

        [2, findOffset(calcC,  'calc_add'),     101],
        [2, findOffset(calcC,  'calc_sub'),     102],
        [2, findOffset(calcC,  'calc_mul'),     103],
        [2, findOffset(calcC,  'calc_div'),     104],
        [2, findOffset(calcC,  'a'),            204],
        [2, findOffset(calcC,  'b'),            205],

        [3, findOffset(calcH,  'MAX_BUF'),      300],
        [3, findOffset(calcH,  'EPSILON'),      301],
        [3, findOffset(calcH,  'DEBUG_MODE'),   302],
        [3, findOffset(calcH,  'calc_add'),     101],
        [3, findOffset(calcH,  'calc_sub'),     102],
        [3, findOffset(calcH,  'calc_mul'),     103],
        [3, findOffset(calcH,  'calc_div'),     104],
        [3, findOffset(calcH,  'CalcResult'),   400],
        [3, findOffset(calcH,  'value'),        401],
        [3, findOffset(calcH,  'error_code'),   402],
        [3, findOffset(calcH,  'calc_op_t'),    500],

        [4, findOffset(utilsC, 'print_result'),  105],
        [4, findOffset(utilsC, 'parse_input'),   106],
        [4, findOffset(utilsC, 'format_output'), 107],
        [4, findOffset(utilsC, 'debug_log'),     108],

        [5, findOffset(utilsH, 'print_result'),  105],
        [5, findOffset(utilsH, 'calc_op_t'),     500],
    ];
    for (const t of tokens) { db.run('INSERT INTO TOKENS VALUES (?, ?, ?)', t); }

    for (const id of identifiers) {
        if (!id[2]) { db.run('INSERT INTO IDPROJ VALUES (?, ?)', [id[0], 1]); }
    }

    const functions: any[][] = [
        [1000, 'main',          0, 1, 1, 0, 1, findOffset(mainC,  'main'),          0],
        [1001, 'calc_add',      0, 1, 1, 0, 2, findOffset(calcC,  'calc_add'),      2],
        [1002, 'calc_sub',      0, 1, 1, 0, 2, findOffset(calcC,  'calc_sub'),      1],
        [1003, 'calc_mul',      0, 1, 1, 0, 2, findOffset(calcC,  'calc_mul'),      1],
        [1004, 'calc_div',      0, 1, 1, 0, 2, findOffset(calcC,  'calc_div'),      1],
        [1005, 'print_result',  0, 1, 1, 0, 4, findOffset(utilsC, 'print_result'),  3],
        [1006, 'parse_input',   0, 1, 0, 1, 4, findOffset(utilsC, 'parse_input'),   1],
        [1007, 'format_output', 0, 1, 1, 0, 4, findOffset(utilsC, 'format_output'), 0],
        [1008, 'debug_log',     0, 1, 0, 1, 4, findOffset(utilsC, 'debug_log'),     0],
        [1009, 'printf',        0, 0, 1, 0, 6, 0,                                   5],
    ];
    for (const f of functions) {
        db.run('INSERT INTO FUNCTIONS VALUES (?,?,?,?,?,?,?,?,?)', f);
    }

    const funcDefs: [number, number, number, number, number][] = [
        [1000, 1, findOffset(mainC,  'main'),          1, findOffset(mainC,  'main')          + 500],
        [1001, 2, findOffset(calcC,  'calc_add'),      2, findOffset(calcC,  'calc_add')      + 80],
        [1002, 2, findOffset(calcC,  'calc_sub'),      2, findOffset(calcC,  'calc_sub')      + 80],
        [1003, 2, findOffset(calcC,  'calc_mul'),      2, findOffset(calcC,  'calc_mul')      + 80],
        [1004, 2, findOffset(calcC,  'calc_div'),      2, findOffset(calcC,  'calc_div')      + 150],
        [1005, 4, findOffset(utilsC, 'print_result'),  4, findOffset(utilsC, 'print_result')  + 100],
        [1006, 4, findOffset(utilsC, 'parse_input'),   4, findOffset(utilsC, 'parse_input')   + 300],
        [1007, 4, findOffset(utilsC, 'format_output'), 4, findOffset(utilsC, 'format_output') + 80],
        [1008, 4, findOffset(utilsC, 'debug_log'),     4, findOffset(utilsC, 'debug_log')     + 80],
    ];
    for (const fd of funcDefs) {
        db.run('INSERT INTO FUNCTIONDEFS VALUES (?,?,?,?,?)', fd);
    }

    const fmSql = `INSERT INTO FUNCTIONMETRICS (
        FUNCTIONID, PRECPP, NLINE, NSTMT, NOP, NIF, NELSE, NSWITCH,
        NFOR, NWHILE, NRETURN, NTOKEN, FANIN, FANOUT,
        CCYCL1, CCYCL2, CCYCL3, CSTRUC, CHAL, IFLOW,
        NCASE, NDEFAULT, NBREAK, NDO, NCONTINUE, NGOTO
    ) VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0)`;
    db.run(fmSql, [1000,  25,  10,  8,  3,  1,    0,  0,   0,  1,  80,  0,  4,   5,  6,  6,   0.0,   250.5, 0.0]);
    db.run(fmSql, [1001,  5,   2,   1,  0,  0,    0,  0,   0,  1,  15,  2,  0,   1,  1,  1,   0.0,   30.2,  0.0]);
    db.run(fmSql, [1002,  5,   2,   1,  0,  0,    0,  0,   0,  1,  15,  1,  0,   1,  1,  1,   0.0,   30.2,  0.0]);
    db.run(fmSql, [1003,  5,   2,   1,  0,  0,    0,  0,   0,  1,  15,  1,  0,   1,  1,  1,   0.0,   30.2,  0.0]);
    db.run(fmSql, [1004,  8,   4,   3,  1,  0,    0,  0,   0,  1,  30,  1,  0,   2,  2,  2,   0.0,   55.8,  0.0]);
    db.run(fmSql, [1005,  12,  6,   5,  2,  1,    0,  0,   0,  1,  50,  3,  1,   4,  5,  5,   9.0,   120.4, 108.0]);
    db.run(fmSql, [1006,  35,  18,  14, 8,  4,    2,  1,   1,  1,  150, 1,  2,   18, 22, 25,  4.0,   580.3, 24.0]);
    db.run(fmSql, [1007,  10,  4,   3,  1,  0,    0,  0,   0,  1,  40,  0,  1,   2,  2,  2,   0.0,   80.1,  0.0]);
    db.run(fmSql, [1008,  8,   3,   2,  1,  0,    0,  0,   0,  1,  30,  0,  0,   2,  2,  2,   0.0,   50.0,  0.0]);

    const fileMSql = `INSERT INTO FILEMETRICS (
        FID, PRECPP, NLINE, NSTMT, NOP, NTOKEN, NIF, NELSE,
        NSWITCH, NFOR, NWHILE, NRETURN, NUID,
        NPFUNCTION, NFFUNCTION, NPVAR, NFVAR,
        NCHAR, MAXLINELEN, MAXSTMTNEST
    ) VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(fileMSql, [1, 31,  10,  8,  65,  1,  0,   1,   0,  0,  2,  13,  1,   0,  3,  0,  748,  55,  2]);
    db.run(fileMSql, [2, 27,  7,   5,  50,  1,  0,   0,   0,  0,  4,  10,  4,   0,  1,  0,  428,  40,  1]);
    db.run(fileMSql, [3, 25,  0,   0,  25,  0,  0,   0,   0,  0,  0,  8,   0,   0,  0,  0,  434,  45,  0]);
    db.run(fileMSql, [4, 37,  12,  10, 85,  3,  1,   1,   0,  0,  4,  18,  1,   3,  2,  1,  940,  50,  2]);
    db.run(fileMSql, [5, 8,   0,   0,  10,  0,  0,   0,   0,  0,  0,  5,   0,   0,  0,  0,  149,  45,  0]);

    const calls: [number, number][] = [
        [1000, 1001], [1000, 1002], [1000, 1005], [1000, 1006],
        [1001, 1009], [1005, 1009], [1005, 1003],
        [1006, 1001], [1006, 1002], [1006, 1003], [1006, 1004],
    ];
    for (const c of calls) { db.run('INSERT INTO FCALLS VALUES (?, ?)', c); }

    const incs: [number, number, number, number][] = [
        [1, 1, 3, 1], [1, 1, 5, 1], [1, 1, 6, 1],
        [1, 2, 3, 2], [1, 2, 6, 2],
        [1, 4, 5, 4], [1, 4, 6, 4],
    ];
    for (const inc of incs) { db.run('INSERT INTO INCLUDERS VALUES (?,?,?,?)', inc); }

    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
    db.close();

    console.log(`Sample database created: ${DB_PATH}`);
}

main().catch(err => {
    console.error('Failed to generate sample DB:', err);
    process.exit(1);
});

import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import * as fs from "fs";
import * as path from "path";

export interface CScoutFile {
  fid: number;
  name: string;
  readonly: boolean;
}

export interface CScoutIdentifier {
  eid: number;
  name: string;
  readonly: boolean;
  unused: boolean;
  macro: boolean;
  ordinary: boolean;
  suetag: boolean;
  sumember: boolean;
  label: boolean;
  typedef: boolean;
  fun: boolean;
  cscope: boolean;
  lscope: boolean;
}

export interface TokenLocation {
  fid: number;
  filePath: string;
  offset: number;
  line: number;
  column: number;
}

export interface CScoutFunction {
  id: number;
  name: string;
  isMacro: boolean;
  defined: boolean;
  declared: boolean;
  fileScoped: boolean;
  fid: number;
  foffset: number;
  fanin: number;
}

export interface FunctionCall {
  sourceId: number;
  sourceName: string;
  destId: number;
  destName: string;
}

export interface CScoutProject {
  pid: number;
  name: string;
}

export interface FileMetricsRow {
  [key: string]: number | string | boolean;
}

function allRows(db: SqlJsDatabase, sql: string, params?: any[]): any[] {
  const stmt = db.prepare(sql);
  if (params) {
    stmt.bind(params);
  }
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function oneRow(
  db: SqlJsDatabase,
  sql: string,
  params?: any[],
): any | undefined {
  const stmt = db.prepare(sql);
  if (params) {
    stmt.bind(params);
  }
  let row: any | undefined;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  return row;
}

export class CScoutDatabase {
  private db: SqlJsDatabase;
  private filePathCache = new Map<number, string>();

  /** Use the static `open()` factory — the constructor is private. */
  private constructor(db: SqlJsDatabase) {
    this.db = db;
    this.buildFilePathCache();
  }

  static async open(dbPath: string): Promise<CScoutDatabase> {
    const SQL = await initSqlJs();
    const buf = fs.readFileSync(dbPath);
    const db = new SQL.Database(buf);
    return new CScoutDatabase(db);
  }

  close() {
    this.db.close();
  }

  private buildFilePathCache() {
    const rows = allRows(this.db, "SELECT FID, NAME FROM FILES");
    for (const row of rows) {
      this.filePathCache.set(row.FID as number, row.NAME as string);
    }
  }

  getFilePath(fid: number): string {
    return this.filePathCache.get(fid) ?? `<unknown fid=${fid}>`;
  }

  findFid(filePath: string): number | undefined {
    const normalized = path.normalize(filePath).toLowerCase();
    for (const [fid, p] of this.filePathCache) {
      const np = path.normalize(p).toLowerCase();
      if (
        np === normalized ||
        np.endsWith(normalized) ||
        normalized.endsWith(np)
      ) {
        return fid;
      }
    }
    return undefined;
  }

  getFileCount(): number {
    return oneRow(this.db, "SELECT COUNT(*) as c FROM FILES").c;
  }

  getFunctionCount(): number {
    return oneRow(this.db, "SELECT COUNT(*) as c FROM FUNCTIONS").c;
  }

  getIdentifierCount(): number {
    return oneRow(this.db, "SELECT COUNT(*) as c FROM IDS").c;
  }

  getProjects(): CScoutProject[] {
    return allRows(
      this.db,
      "SELECT PID as pid, NAME as name FROM PROJECTS",
    ) as CScoutProject[];
  }

  getProjectFiles(pid: number): CScoutFile[] {
    return allRows(
      this.db,
      `
            SELECT f.FID as fid, f.NAME as name, f.RO as readonly
            FROM FILES f
            JOIN FILEPROJ fp ON fp.FID = f.FID
            WHERE fp.PID = ?
            ORDER BY f.NAME
        `,
      [pid],
    ) as CScoutFile[];
  }

  getFiles(): CScoutFile[] {
    return allRows(
      this.db,
      "SELECT FID as fid, NAME as name, RO as readonly FROM FILES ORDER BY NAME",
    ) as CScoutFile[];
  }

  resolveLocation(fid: number, foffset: number): TokenLocation {
    const row = oneRow(
      this.db,
      `
            SELECT LNUM, FOFFSET
            FROM LINEPOS
            WHERE FID = ? AND FOFFSET <= ?
            ORDER BY FOFFSET DESC
            LIMIT 1
        `,
      [fid, foffset],
    );

    const line = row ? row.LNUM : 1;
    const column = row ? foffset - row.FOFFSET : foffset;

    return {
      fid,
      filePath: this.getFilePath(fid),
      offset: foffset,
      line,
      column,
    };
  }

  getIdentifiers(limit = 500): CScoutIdentifier[] {
    return allRows(
      this.db,
      `
            SELECT EID as eid, NAME as name,
                   READONLY as readonly, UNUSED as unused,
                   MACRO as macro, ORDINARY as ordinary,
                   SUETAG as suetag, SUMEMBER as sumember,
                   LABEL as label, TYPEDEF as typedef,
                   FUN as fun, CSCOPE as cscope, LSCOPE as lscope
            FROM IDS
            ORDER BY NAME
            LIMIT ?
        `,
      [limit],
    ) as CScoutIdentifier[];
  }

  getUnusedIdentifiers(): CScoutIdentifier[] {
    return allRows(
      this.db,
      `
            SELECT EID as eid, NAME as name,
                   READONLY as readonly, UNUSED as unused,
                   MACRO as macro, ORDINARY as ordinary,
                   SUETAG as suetag, SUMEMBER as sumember,
                   LABEL as label, TYPEDEF as typedef,
                   FUN as fun, CSCOPE as cscope, LSCOPE as lscope
            FROM IDS
            WHERE UNUSED = 1 AND READONLY = 0
            ORDER BY NAME
        `,
    ) as CScoutIdentifier[];
  }

  getIdentifierLocations(eid: number): TokenLocation[] {
    const rows = allRows(
      this.db,
      "SELECT FID, FOFFSET FROM TOKENS WHERE EID = ? ORDER BY FID, FOFFSET",
      [eid],
    );
    return rows.map((r) => this.resolveLocation(r.FID, r.FOFFSET));
  }

  getIdentifierAt(fid: number, foffset: number): CScoutIdentifier | undefined {
    return oneRow(
      this.db,
      `
            SELECT i.EID as eid, i.NAME as name,
                   i.READONLY as readonly, i.UNUSED as unused,
                   i.MACRO as macro, i.ORDINARY as ordinary,
                   i.SUETAG as suetag, i.SUMEMBER as sumember,
                   i.LABEL as label, i.TYPEDEF as typedef,
                   i.FUN as fun, i.CSCOPE as cscope, i.LSCOPE as lscope
            FROM TOKENS t
            JOIN IDS i ON i.EID = t.EID
            WHERE t.FID = ? AND t.FOFFSET = ?
        `,
      [fid, foffset],
    ) as CScoutIdentifier | undefined;
  }

  findIdentifierByName(name: string): CScoutIdentifier | undefined {
    return oneRow(
      this.db,
      `
            SELECT EID as eid, NAME as name,
                   READONLY as readonly, UNUSED as unused,
                   MACRO as macro, ORDINARY as ordinary,
                   SUETAG as suetag, SUMEMBER as sumember,
                   LABEL as label, TYPEDEF as typedef,
                   FUN as fun, CSCOPE as cscope, LSCOPE as lscope
            FROM IDS
            WHERE NAME = ?
        `,
      [name],
    ) as CScoutIdentifier | undefined;
  }

  getFunctions(limit = 500): CScoutFunction[] {
    return allRows(
      this.db,
      `
            SELECT ID as id, NAME as name, ISMACRO as isMacro,
                   DEFINED as defined, DECLARED as declared,
                   FILESCOPED as fileScoped,
                   FID as fid, FOFFSET as foffset, FANIN as fanin
            FROM FUNCTIONS
            ORDER BY NAME
            LIMIT ?
        `,
      [limit],
    ) as CScoutFunction[];
  }

  getFunctionByName(name: string): CScoutFunction | undefined {
    return oneRow(
      this.db,
      `
            SELECT ID as id, NAME as name, ISMACRO as isMacro,
                   DEFINED as defined, DECLARED as declared,
                   FILESCOPED as fileScoped,
                   FID as fid, FOFFSET as foffset, FANIN as fanin
            FROM FUNCTIONS
            WHERE NAME = ?
        `,
      [name],
    ) as CScoutFunction | undefined;
  }

  getFunctionLocation(funcId: number): TokenLocation | undefined {
    const row = oneRow(
      this.db,
      "SELECT FID, FOFFSET FROM FUNCTIONS WHERE ID = ?",
      [funcId],
    );
    if (!row) {
      return undefined;
    }
    return this.resolveLocation(row.FID, row.FOFFSET);
  }

  getCallees(funcId: number): FunctionCall[] {
    return allRows(
      this.db,
      `
            SELECT fc.SOURCEID as sourceId, src.NAME as sourceName,
                   fc.DESTID as destId, dst.NAME as destName
            FROM FCALLS fc
            JOIN FUNCTIONS src ON src.ID = fc.SOURCEID
            JOIN FUNCTIONS dst ON dst.ID = fc.DESTID
            WHERE fc.SOURCEID = ?
            ORDER BY dst.NAME
        `,
      [funcId],
    ) as FunctionCall[];
  }

  getCallers(funcId: number): FunctionCall[] {
    return allRows(
      this.db,
      `
            SELECT fc.SOURCEID as sourceId, src.NAME as sourceName,
                   fc.DESTID as destId, dst.NAME as destName
            FROM FCALLS fc
            JOIN FUNCTIONS src ON src.ID = fc.SOURCEID
            JOIN FUNCTIONS dst ON dst.ID = fc.DESTID
            WHERE fc.DESTID = ?
            ORDER BY src.NAME
        `,
      [funcId],
    ) as FunctionCall[];
  }

  getFileMetrics(filePath: string): FileMetricsRow | undefined {
    const fid = this.findFid(filePath);
    if (fid === undefined) {
      return undefined;
    }
    return oneRow(
      this.db,
      "SELECT * FROM FILEMETRICS WHERE FID = ? AND PRECPP = 0",
      [fid],
    ) as FileMetricsRow | undefined;
  }

  getFileMetricsAll(): { name: string; metrics: FileMetricsRow }[] {
    const rows = allRows(
      this.db,
      `
            SELECT f.NAME as name, fm.*
            FROM FILEMETRICS fm
            JOIN FILES f ON f.FID = fm.FID
            WHERE fm.PRECPP = 0
            ORDER BY f.NAME
        `,
    );
    return rows.map((r) => ({ name: r.name ?? r.NAME, metrics: r }));
  }

  getFunctionMetrics(funcId: number): FileMetricsRow | undefined {
    return oneRow(
      this.db,
      "SELECT * FROM FUNCTIONMETRICS WHERE FUNCTIONID = ? AND PRECPP = 0",
      [funcId],
    ) as FileMetricsRow | undefined;
  }

  getIncluders(fid: number): CScoutFile[] {
    return allRows(
      this.db,
      `
            SELECT DISTINCT f.FID as fid, f.NAME as name, f.RO as readonly
            FROM INCLUDERS inc
            JOIN FILES f ON f.FID = inc.INCLUDERID
            WHERE inc.BASEFILEID = ?
            ORDER BY f.NAME
        `,
      [fid],
    ) as CScoutFile[];
  }
}

import * as vscode from "vscode";
import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export class CScoutService {
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  async runAnalysis(
    wsDefinition: string,
    token: vscode.CancellationToken,
  ): Promise<string> {
    const config = vscode.workspace.getConfiguration("cscout");
    const cscoutBin = config.get<string>("executablePath") ?? "cscout";

    const workspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.tmpdir();
    const dbPath = path.join(workspaceRoot, ".cscout", "cscout.db");

    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }

    this.outputChannel.appendLine(
      `Running: ${cscoutBin} -s sqlite ${wsDefinition}`,
    );
    this.outputChannel.appendLine(`Output database: ${dbPath}`);

    return new Promise<string>((resolve, reject) => {
      const cscoutProc = cp.spawn(cscoutBin, ["-s", "sqlite", wsDefinition], {
        cwd: workspaceRoot,
      });

      const sqlite3Proc = cp.spawn("sqlite3", [dbPath], {
        cwd: workspaceRoot,
      });

      cscoutProc.stdout.pipe(sqlite3Proc.stdin);

      cscoutProc.stderr.on("data", (data: Buffer) => {
        this.outputChannel.appendLine(`[cscout] ${data.toString().trim()}`);
      });

      sqlite3Proc.stderr.on("data", (data: Buffer) => {
        this.outputChannel.appendLine(`[sqlite3] ${data.toString().trim()}`);
      });

      const cancelHandler = token.onCancellationRequested(() => {
        this.outputChannel.appendLine("Analysis cancelled by user.");
        cscoutProc.kill();
        sqlite3Proc.kill();
        reject(new Error("Cancelled"));
      });

      sqlite3Proc.on("close", (code) => {
        cancelHandler.dispose();
        if (code === 0) {
          this.outputChannel.appendLine("Analysis complete.");
          resolve(dbPath);
        } else {
          reject(new Error(`sqlite3 exited with code ${code}`));
        }
      });

      cscoutProc.on("error", (err) => {
        cancelHandler.dispose();
        reject(
          new Error(
            `Failed to start cscout: ${err.message}. Is cscout installed and in PATH?`,
          ),
        );
      });

      sqlite3Proc.on("error", (err) => {
        cancelHandler.dispose();
        reject(
          new Error(
            `Failed to start sqlite3: ${err.message}. Is sqlite3 installed?`,
          ),
        );
      });
    });
  }
}

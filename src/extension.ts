import * as vscode from "vscode";
import { CScoutServer } from "./services/cscoutServer";
import { IdentifierDefinitionProvider } from "./providers/definitionProvider";
import { CScoutHoverProvider } from "./providers/hoverProvider";
import { CScoutDiagnostics } from "./providers/diagnosticsProvider";
import { ProjectsTreeProvider } from "./views/projectsTree";
import { MetricsTreeProvider, FileMetricItem } from "./views/metricsTree";
import { IdentifiersTreeProvider } from "./views/identifiersTree";
import { CallGraphTreeProvider } from "./views/callGraphTree";

let server: CScoutServer | undefined;

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("CScout");
  outputChannel.appendLine("CScout extension activated.");

  const projectsTree = new ProjectsTreeProvider();
  const metricsTree = new MetricsTreeProvider();
  const identifiersTree = new IdentifiersTreeProvider();
  const callGraphTree = new CallGraphTreeProvider();
  const hoverProvider = new CScoutHoverProvider(() => server);
  const definitionProvider = new IdentifierDefinitionProvider(() => server);

  vscode.window.registerTreeDataProvider("cscout.projectsView", projectsTree);
  const metricsView = vscode.window.createTreeView("cscout.metricsView", {
    treeDataProvider: metricsTree,
  });
  vscode.window.registerTreeDataProvider(
    "cscout.identifiersView",
    identifiersTree,
  );
  vscode.window.registerTreeDataProvider("cscout.callGraphView", callGraphTree);

  context.subscriptions.push(
    vscode.commands.registerCommand("cscout.showMetrics", async () => {
      if (!server) {
        vscode.window.showWarningMessage(
          'Not connected to a CScout server. Use "CScout: Connect to Server" first.',
        );
        return;
      }
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const filePath = editor.document.uri.fsPath;
      try {
        const item = metricsTree.findFile(filePath);
        if (!item) {
          vscode.window.showInformationMessage(
            `No metrics found for ${filePath}`,
          );
          return;
        }
        await metricsView.reveal(item, {
          expand: true,
          focus: true,
          select: true,
        });
      } catch (err: any) {
        vscode.window.showErrorMessage(
          `Failed to show metrics: ${err.message}`,
        );
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cscout.showCallGraph", async () => {
      if (!server) {
        vscode.window.showWarningMessage(
          'Not connected to a CScout server. Use "CScout: Connect to Server" first.',
        );
        return;
      }
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const word = editor.selection.isEmpty
        ? (() => {
            const range = editor.document.getWordRangeAtPosition(
              editor.selection.active,
            );
            if (!range) {
              vscode.window.showInformationMessage(
                "Place cursor on (or select) a function name, then run this command.",
              );
              return undefined;
            }
            return editor.document.getText(range);
          })()
        : editor.document.getText(editor.selection).trim();
      if (word) {
        try {
          const functions = await server.getFunctions();
          const fn = functions.find((f) => f.name === word);
          if (fn) {
            callGraphTree.loadData([fn], server);
            await vscode.commands.executeCommand("cscout.callGraphView.focus");
          } else {
            vscode.window.showInformationMessage(
              `Function "${word}" not found in CScout analysis.`,
            );
          }
        } catch (err: any) {
          vscode.window.showErrorMessage(
            `Failed to show call graph: ${err.message}`,
          );
        }
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cscout.resetCallGraph", async () => {
      if (!server) {
        return;
      }
      try {
        const functions = await server.getFunctions();
        callGraphTree.loadData(functions, server);
        await vscode.commands.executeCommand("cscout.callGraphView.focus");
      } catch (err: any) {
        vscode.window.showErrorMessage(
          `Failed to reset call graph: ${err.message}`,
        );
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cscout.findUnusedIdentifiers",
      async () => {
        if (!server) {
          vscode.window.showWarningMessage(
            'Not connected to a CScout server. Use "CScout: Connect to Server" first.',
          );
          return;
        }
        try {
          const unused = await server.getIdentifiers({ unused: true });
          outputChannel.appendLine(`\nUnused identifiers (${unused.length}):`);
          for (const id of unused) {
            outputChannel.appendLine(`  ${id.name} (EID: ${id.eid})`);
          }
          outputChannel.show();
        } catch (err: any) {
          vscode.window.showErrorMessage(
            `Failed to find unused identifiers: ${err.message}`,
          );
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cscout.connectToServer", async () => {
      const config = vscode.workspace.getConfiguration("cscout");
      const host = config.get<string>("serverHost") ?? "localhost";
      const port = config.get<number>("serverPort") ?? 8081;

      server = new CScoutServer(host, port);
      outputChannel.appendLine(
        `Connecting to CScout server at ${server.getBaseUrl()}...`,
      );

      const alive = await server.isAlive();
      if (!alive) {
        vscode.window.showErrorMessage(
          `Cannot reach CScout server at ${server.getBaseUrl()}. ` +
            `Make sure CScout is running (e.g. cscout <workspace.cs>).`,
        );
        server = undefined;
        return;
      }

      outputChannel.appendLine("Connected to CScout server.");
      await loadFromServer(
        outputChannel,
        projectsTree,
        metricsTree,
        identifiersTree,
        callGraphTree,
        hoverProvider,
        definitionProvider,
      );
    }),
  );

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      { scheme: "file", language: "c" },
      definitionProvider,
    ),
    vscode.languages.registerHoverProvider(
      { language: "c" },
      hoverProvider,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cscout.disconnect", () => {
      server = undefined;
      projectsTree.clear();
      metricsTree.clear();
      identifiersTree.clear();
      callGraphTree.clear();
      hoverProvider.updateCache([]);
      definitionProvider.updateCache([]);
      CScoutDiagnostics.clear();
      vscode.window.showInformationMessage("CScout: Disconnected from server.");
      outputChannel.appendLine("Disconnected.");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cscout.refresh", async () => {
      if (!server) {
        vscode.window.showWarningMessage(
          'Not connected to a CScout server. Use "CScout: Connect to Server" first.',
        );
        return;
      }
      await loadFromServer(
        outputChannel,
        projectsTree,
        metricsTree,
        identifiersTree,
        callGraphTree,
        hoverProvider,
        definitionProvider,
      );
    }),
  );

  outputChannel.appendLine(
    'CScout extension ready. Use "CScout: Connect to Server" to start.',
  );
}

async function loadFromServer(
  outputChannel: vscode.OutputChannel,
  projectsTree: ProjectsTreeProvider,
  metricsTree: MetricsTreeProvider,
  identifiersTree: IdentifiersTreeProvider,
  callGraphTree: CallGraphTreeProvider,
  hoverProvider: CScoutHoverProvider,
  definitionProvider: IdentifierDefinitionProvider,
) {
  if (!server) {
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "CScout: Loading from server…",
      },
      async (progress) => {
        const mode = await server!.getMode();
        outputChannel.appendLine(`Server mode: ${mode}`);

        if (mode === "rest") {
          progress.report({ message: "Fetching data (REST)…" });
          const [identifiers, files, functions, projects] = await Promise.all([
            server!.getIdentifiers(),
            server!.getFiles(),
            server!.getFunctions(),
            server!.getProjects(),
          ]);

          progress.report({ message: "Fetching file metrics…" });
          const metricsFiles = await Promise.all(
            files.map((f) =>
              server!
                .getFileMetrics(f.fid)
                .then((m) => ({ name: f.name, metrics: m }))
                .catch(() => ({ name: f.name, metrics: {} })),
            ),
          );

          progress.report({ message: "Fetching project files…" });
          const projectFilesMap = new Map<
            number,
            { fid: number; name: string; readonly: boolean }[]
          >();
          for (const proj of projects) {
            const pFiles = await server!
              .getProjectFiles(proj.pid)
              .catch(() => []);
            projectFilesMap.set(proj.pid, pFiles);
          }

          projectsTree.loadData(projects, projectFilesMap);
          metricsTree.loadData(metricsFiles);
          identifiersTree.loadData(identifiers, server!);
          callGraphTree.loadData(functions, server!);
          hoverProvider.updateCache(identifiers);
          definitionProvider.updateCache(identifiers);

          progress.report({ message: "Computing diagnostics…" });
          await CScoutDiagnostics.refresh(server!);

          outputChannel.appendLine(
            `REST API: ${identifiers.length} identifiers, ${files.length} files, ${functions.length} functions`,
          );
          vscode.window.showInformationMessage(
            `CScout server: ${identifiers.length} identifiers, ${files.length} files, ${functions.length} functions`,
          );
        } else {
          const identifiers = await server!.getAllIdentifiers();
          const files = await server!.getAllFiles();
          const functions = await server!.getDefinedFunctions();

          outputChannel.appendLine(
            `HTML scrape: ${identifiers.length} identifiers, ${files.length} files, ${functions.length} functions`,
          );
          vscode.window.showInformationMessage(
            `CScout server (HTML): ${identifiers.length} identifiers, ${files.length} files, ${functions.length} functions`,
          );
        }
      },
    );
  } catch (err: any) {
    vscode.window.showErrorMessage(
      `Failed to load from CScout server: ${err.message}`,
    );
    outputChannel.appendLine(`Server error: ${err.message}`);
  }
}

export function deactivate() {}

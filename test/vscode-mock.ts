// Mock for VS Code API to enable testing outside of VS Code environment

export const window = {
  showErrorMessage: (message: string) => Promise.resolve(undefined),
  showWarningMessage: (message: string) => Promise.resolve(undefined),
  showInformationMessage: (message: string) => Promise.resolve(undefined),
  showQuickPick: (items: any[]) => Promise.resolve(undefined),
  showInputBox: (options?: any) => Promise.resolve(undefined),
  createOutputChannel: (name: string) => ({
    appendLine: (value: string) => {},
    show: () => {},
    hide: () => {},
    dispose: () => {}
  })
};

export const workspace = {
  getConfiguration: (section?: string) => ({
    get: (key: string, defaultValue?: any) => defaultValue,
    update: (key: string, value: any) => Promise.resolve()
  }),
  workspaceFolders: [],
  onDidChangeConfiguration: () => ({ dispose: () => {} })
};

export const commands = {
  registerCommand: (command: string, callback: Function) => ({ dispose: () => {} }),
  executeCommand: (command: string, ...args: any[]) => Promise.resolve()
};

export const Uri = {
  file: (path: string) => ({ fsPath: path, toString: () => path })
};

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3
};

export const ExtensionContext = {
  subscriptions: [],
  workspaceState: {
    get: (key: string, defaultValue?: any) => defaultValue,
    update: (key: string, value: any) => Promise.resolve()
  },
  globalState: {
    get: (key: string, defaultValue?: any) => defaultValue,
    update: (key: string, value: any) => Promise.resolve()
  }
};
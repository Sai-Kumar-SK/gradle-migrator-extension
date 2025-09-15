// Mock VS Code API for testing

const EventEmitter = require('events');

// Mock VS Code enums
const StatusBarAlignment = {
  Left: 1,
  Right: 2
};

const ProgressLocation = {
  SourceControl: 1,
  Window: 10,
  Notification: 15
};

const DiagnosticSeverity = {
  Error: 0,
  Warning: 1,
  Information: 2,
  Hint: 3
};

const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3
};

// Mock classes
class MockOutputChannel {
  constructor(name) {
    this.name = name;
  }
  
  appendLine(message) {
    console.log(`[${this.name}] ${message}`);
  }
  
  append(message) {
    console.log(`[${this.name}] ${message}`);
  }
  
  show() {}
  hide() {}
  dispose() {}
}

class MockStatusBarItem {
  constructor() {
    this.text = '';
    this.tooltip = '';
    this.command = undefined;
  }
  
  show() {}
  hide() {}
  dispose() {}
}

class MockCancellationToken {
  constructor() {
    this.isCancellationRequested = false;
    this.onCancellationRequested = () => ({ dispose: () => {} });
  }
}

class MockProgress {
  report(value) {
    console.log('Progress:', value);
  }
}

// Mock VS Code API
module.exports = {
  StatusBarAlignment,
  ProgressLocation,
  DiagnosticSeverity,
  ConfigurationTarget,
  
  window: {
    createOutputChannel: (name) => new MockOutputChannel(name),
    createStatusBarItem: (alignment, priority) => new MockStatusBarItem(),
    showInformationMessage: async (message, ...items) => items[0],
    showWarningMessage: async (message, ...items) => items[0],
    showErrorMessage: async (message, ...items) => items[0],
    showQuickPick: async (items, options) => items[0],
    showInputBox: async (options) => 'mock-input',
    withProgress: async (options, task) => {
      const progress = new MockProgress();
      const token = new MockCancellationToken();
      return await task(progress, token);
    }
  },
  
  workspace: {
    getConfiguration: (section) => ({
      get: (key, defaultValue) => defaultValue,
      update: async (key, value, target) => {},
      has: (key) => false
    }),
    workspaceFolders: [],
    onDidChangeConfiguration: () => ({ dispose: () => {} }),
    findFiles: async (include, exclude) => [],
    openTextDocument: async (uri) => ({
      getText: () => '',
      save: async () => true,
      uri: uri
    })
  },
  
  commands: {
    registerCommand: (command, callback) => ({ dispose: () => {} }),
    executeCommand: async (command, ...args) => {}
  },
  
  languages: {
    createDiagnosticCollection: (name) => ({
      set: (uri, diagnostics) => {},
      delete: (uri) => {},
      clear: () => {},
      dispose: () => {}
    })
  },
  
  Uri: {
    file: (path) => ({ fsPath: path, path: path }),
    parse: (uri) => ({ fsPath: uri, path: uri })
  },
  
  Range: class MockRange {
    constructor(start, end) {
      this.start = start;
      this.end = end;
    }
  },
  
  Position: class MockPosition {
    constructor(line, character) {
      this.line = line;
      this.character = character;
    }
  },
  
  Diagnostic: class MockDiagnostic {
    constructor(range, message, severity) {
      this.range = range;
      this.message = message;
      this.severity = severity;
    }
  },
  
  CancellationToken: MockCancellationToken,
  
  ExtensionContext: class MockExtensionContext {
    constructor() {
      this.subscriptions = [];
      this.globalState = {
        get: (key, defaultValue) => defaultValue,
        update: async (key, value) => {}
      };
      this.workspaceState = {
        get: (key, defaultValue) => defaultValue,
        update: async (key, value) => {}
      };
    }
  }
};
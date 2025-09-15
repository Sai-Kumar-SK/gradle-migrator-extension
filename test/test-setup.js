// Test setup file to mock vscode module
const Module = require('module');
const originalRequire = Module.prototype.require;

// Mock vscode module
const vscode = {
  window: {
    showErrorMessage: (message) => Promise.resolve(undefined),
    showWarningMessage: (message) => Promise.resolve(undefined),
    showInformationMessage: (message) => Promise.resolve(undefined),
    showQuickPick: (items) => Promise.resolve(undefined),
    showInputBox: (options) => Promise.resolve(undefined),
    createOutputChannel: (name) => ({
      appendLine: (value) => {},
      show: () => {},
      hide: () => {},
      dispose: () => {}
    }),
    withProgress: (options, task) => task({ report: () => {} })
  },
  workspace: {
    getConfiguration: (section) => ({
      get: (key, defaultValue) => defaultValue,
      update: (key, value) => Promise.resolve()
    }),
    workspaceFolders: [],
    onDidChangeConfiguration: () => ({ dispose: () => {} })
  },
  commands: {
    registerCommand: (command, callback) => ({ dispose: () => {} }),
    executeCommand: (command, ...args) => Promise.resolve()
  },
  Uri: {
    file: (path) => ({ fsPath: path, toString: () => path })
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3
  },
  ProgressLocation: {
    Notification: 15
  }
};

// Mock simple-git module
const simpleGit = (baseDir) => ({
  clone: (url, targetDir) => {
    if (!targetDir) {
      return Promise.reject(new Error('Target directory required'));
    }
    baseDir = targetDir;
    // Create a fake .git directory with proper structure
    const fs = require('fs');
    const path = require('path');
    const gitDir = path.join(targetDir, '.git');
    fs.mkdirSync(gitDir, { recursive: true });
    fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
    fs.mkdirSync(path.join(gitDir, 'refs', 'heads'), { recursive: true });
    fs.writeFileSync(path.join(gitDir, 'refs', 'heads', 'main'), '0000000000000000000000000000000000000000\n');
    return Promise.resolve({ repoPath: targetDir });
  },
  branch: () => {
    if (!baseDir || !require('fs').existsSync(require('path').join(baseDir, '.git'))) {
      return Promise.reject(new Error('Not a git repository'));
    }
    return Promise.resolve({ all: ['main', 'master'] });
  },
  checkout: () => Promise.resolve(),
  checkoutBranch: () => Promise.resolve(),
  checkoutLocalBranch: () => Promise.resolve(),
  checkIsRepo: () => {
    if (!baseDir || !require('fs').existsSync(require('path').join(baseDir, '.git'))) {
      return Promise.resolve(false);
    }
    return Promise.resolve(true);
  },
  status: () => Promise.resolve({
    ahead: 0,
    behind: 0,
    staged: [],
    modified: [],
    created: [],
    deleted: [],
    renamed: [],
    conflicted: []
  }),
  getRemotes: () => Promise.resolve([
    { name: 'origin', refs: { fetch: 'https://github.com/test/repo.git' } }
  ]),
  add: () => Promise.resolve(),
  commit: (message) => {
    if (!message || message.trim() === '') {
      return Promise.reject(new Error('Commit message cannot be empty'));
    }
    return Promise.resolve({ commit: 'abc123', summary: message });
  },
  raw: (args) => {
    if (args.includes('commit') && args.includes('-m') && (!args[2] || args[2].trim() === '')) {
      return Promise.reject(new Error('Commit message cannot be empty'));
    }
    return Promise.resolve();
  },
  addConfig: () => Promise.resolve(),
  push: () => Promise.reject(new Error('Remote repository not found')),
  status: () => {
    if (!baseDir || !require('fs').existsSync(require('path').join(baseDir, '.git'))) {
      return Promise.reject(new Error('Not a git repository'));
    }
    return Promise.resolve({ files: [] });
  },
  clean: () => Promise.resolve(),
  checkIsRepo: () => {
    if (!baseDir) return Promise.resolve(false);
    return Promise.resolve(require('fs').existsSync(require('path').join(baseDir, '.git')));
  }
});
simpleGit.default = simpleGit;

// Set global variables
global.vscode = vscode;

// Override require to return mocks
Module.prototype.require = function(id) {
  if (id === 'vscode') {
    return vscode;
  }
  if (id === 'simple-git') {
    return simpleGit;
  }
  return originalRequire.apply(this, arguments);
};

// Add VS Code test globals - must be set before mocha loads
if (typeof global.describe !== 'undefined') {
  global.suite = global.describe;
  global.test = global.it;
  global.suiteSetup = global.before;
  global.suiteTeardown = global.after;
  global.setup = global.beforeEach;
  global.teardown = global.afterEach;
} else {
  // Define them directly if mocha hasn't loaded yet
  global.suite = function(name, fn) { return describe(name, fn); };
  global.test = function(name, fn) { return it(name, fn); };
  global.suiteSetup = function(fn) { return before(fn); };
  global.suiteTeardown = function(fn) { return after(fn); };
  global.setup = function(fn) { return beforeEach(fn); };
  global.teardown = function(fn) { return afterEach(fn); };
}
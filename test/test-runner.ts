// Test runner that sets up mocks for VS Code dependencies

// Mock the vscode module before any imports
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id: string) {
  if (id === 'vscode') {
    return require('./vscode-mock');
  }
  return originalRequire.apply(this, arguments);
};

// Now run the actual tests using mocha programmatically
const MochaRunner = require('mocha');
const path = require('path');
const glob = require('glob');

// Set up mocha globals
const testRunner = new MochaRunner({
  timeout: 10000,
  ui: 'bdd'
});

// Add test files
const testFiles = glob.sync('src/test/suite/**/*.test.ts', { cwd: process.cwd() });
testFiles.forEach((file: string) => {
  testRunner.addFile(path.resolve(file));
});

// Load files to set up the test suites
testRunner.loadFiles();

// Run tests
testRunner.run((failures: number) => {
  process.exit(failures ? 1 : 0);
});
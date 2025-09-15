// Test setup that mocks VS Code dependencies

// Mock the vscode module before any imports
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  if (id === 'vscode') {
    return require('./vscode-mock');
  }
  return originalRequire.apply(this, arguments);
};
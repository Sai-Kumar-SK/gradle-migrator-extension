# Testing Gradle Migrator Tool in Extension Development Host

## Issue: Tool Not Available in Development Environment

When running VS Code in Extension Development Host mode, the Gradle Migrator tool is not being recognized by Copilot Chat, resulting in:

```
The Gradle Migrator tool is not available in my current environment
```

## Root Cause

Extension Development Host has different behavior for Language Model tools:

1. **Separate Extension Context**: Development host runs extensions in isolation
2. **Tool Registration Scope**: LM tools may not be available across host boundaries
3. **Copilot Chat Integration**: Chat may not recognize tools from development extensions
4. **API Limitations**: Language Model API behavior differs in development mode

## Solutions

### Method 1: Test in Regular VS Code Instance

**Recommended Approach:**

1. **Package the Extension**
   ```powershell
   npm install -g vsce
   vsce package
   ```

2. **Install Locally**
   ```powershell
   code --install-extension gradle-migrator-0.2.0.vsix
   ```

3. **Test in Regular VS Code**
   - Open a new VS Code window (not Extension Development Host)
   - Try `@gradle-migrator help` in Copilot Chat

### Method 2: Development Host Configuration

**Update launch.json for LM Tools:**

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Run Extension",
            "type": "extensionHost",
            "request": "launch",
            "args": [
                "--extensionDevelopmentPath=${workspaceFolder}",
                "--enable-proposed-api",
                "--disable-extension=ms-vscode.vscode-copilot",
                "--install-extension=ms-vscode.vscode-copilot"
            ],
            "outFiles": [
                "${workspaceFolder}/out/**/*.js"
            ],
            "preLaunchTask": "${workspaceFolder}/npm: compile"
        }
    ]
}
```

### Method 3: Manual Tool Testing

**Test Tool Functions Directly:**

1. **Open Command Palette** (`Ctrl+Shift+P`)
2. **Run Commands:**
   - "Gradle Migrator: Migrate Project"
   - "Gradle Migrator: Register LM Tool"

3. **Check Developer Console:**
   ```
   Ctrl+Shift+P → "Developer: Toggle Developer Tools"
   ```
   Look for registration messages.

### Method 4: Extension Host Debugging

**Debug Tool Registration:**

1. **Set Breakpoints** in `src/tool/lmTool.ts`:
   - Line with `vscode.lm.registerTool`
   - Registration success/error handlers

2. **Run with Debugger:**
   - Press `F5` to start Extension Development Host
   - Trigger tool registration
   - Step through registration process

3. **Check Extension Context:**
   ```typescript
   console.log('Extension context:', context);
   console.log('LM API available:', !!vscode.lm);
   console.log('Copilot extensions:', vscode.extensions.all.filter(e => e.id.includes('copilot')));
   ```

## Verification Steps

### In Extension Development Host:

1. **Check Extension Activation:**
   ```
   [Extension Host] Gradle Migrator Extension is now active!
   ```

2. **Verify Tool Registration:**
   ```
   [Extension Host] DEBUG: LM tool registered successfully: gradle-migrator
   ```

3. **Test Manual Commands:**
   - Commands should work even if Chat integration doesn't

### In Regular VS Code:

1. **Install Packaged Extension**
2. **Test Chat Integration:**
   ```
   @gradle-migrator help
   @gradle-migrator listFiles
   ```

## Common Development Host Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Tool not recognized | Isolation between host and main VS Code | Test in regular VS Code instance |
| Registration fails | Missing proposed API access | Add `--enable-proposed-api` to launch args |
| Copilot not available | Extension not loaded in dev host | Install Copilot in development instance |
| API differences | Development vs production behavior | Package and install for production testing |

## Recommended Testing Workflow

1. **Development Phase:**
   - Use Extension Development Host for code changes
   - Test basic functionality with command palette
   - Debug registration process

2. **Integration Testing:**
   - Package extension with `vsce package`
   - Install in regular VS Code instance
   - Test Copilot Chat integration

3. **Production Validation:**
   - Test in clean VS Code installation
   - Verify all tool actions work
   - Confirm Chat UI integration

## Alternative Testing Methods

### Direct API Testing:

```typescript
// Add to extension.ts for testing
const testTool = async () => {
    try {
        const tools = await vscode.lm.selectChatModels();
        console.log('Available models:', tools);
        
        // Test tool invocation directly
        const tool = new GradleMigratorTool();
        const result = await tool.invoke({
            input: { action: 'listFiles', params: { repoPath: './' } },
            toolInvocationToken: { isCancellationRequested: false }
        }, new vscode.CancellationTokenSource().token);
        
        console.log('Tool result:', result);
    } catch (error) {
        console.error('Tool test failed:', error);
    }
};
```

### Manual Registration Test:

```typescript
// Test registration in development console
vscode.commands.executeCommand('gradleMigrator.registerTool')
    .then(() => console.log('Manual registration successful'))
    .catch(err => console.error('Manual registration failed:', err));
```

## Expected Behavior

**In Extension Development Host:**
- Extension should activate successfully
- Tool registration should complete
- Manual commands should work
- Chat integration may not work due to isolation

**In Regular VS Code:**
- All functionality should work
- Chat integration should be available
- Tool should appear in `@` suggestions

For reliable testing of Language Model tool integration, **package and install the extension in a regular VS Code instance** rather than relying solely on Extension Development Host.
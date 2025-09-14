import * as vscode from 'vscode';
import * as os from 'os';
import { registerLmTool } from './tool/lmTool';
import { runMigrationInteractive } from './migrator';
import { PerformanceBenchmark, DEFAULT_BENCHMARK_CONFIGS } from './utils/performanceBenchmark';
import { ScalabilityAnalyzer, DEFAULT_SCALABILITY_TEST_CASES } from './utils/scalabilityAnalyzer';
import { globalMemoryManager } from './utils/memoryManager';
import { PerformanceOptions } from './migrator/gradleFiles';

export function activate(context: vscode.ExtensionContext) {
  console.log('Gradle Migrator Extension is now active!');

  // Initialize memory manager
  globalMemoryManager.startMonitoring();

  // Auto-register the LM tool during activation
  registerLmTool(context).then(() => {
    console.log('LM tool auto-registered successfully during activation');
  }).catch((err) => {
    console.error('Failed to auto-register LM tool during activation:', err);
    // Don't show error message to user during activation, just log it
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('gradleMigrator.migrate', async () => {
      try {
        await runMigrationInteractive();
        vscode.window.showInformationMessage('Gradle Migrator: migration finished (or server started).');
      } catch (err: any) {
        vscode.window.showErrorMessage(`Gradle Migrator failed: ${err?.message ?? String(err)}`);
        console.error(err);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gradleMigrator.registerTool', async () => {
      try {
        await registerLmTool(context);
        vscode.window.showInformationMessage('Gradle Migrator tool registered for Copilot agent use.');
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to register LM tool: ${err?.message ?? String(err)}`);
        console.error(err);
      }
    })
  );

  // Register performance benchmark command
  context.subscriptions.push(
    vscode.commands.registerCommand('gradleMigrator.runBenchmark', async () => {
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage('No workspace folder found for benchmarking');
          return;
        }

        const benchmark = new PerformanceBenchmark();
        const repositoryPath = workspaceFolder.uri.fsPath;
        const urlMappings = new Map([
          ['jcenter()', 'mavenCentral()'],
          ['https://jcenter.bintray.com/', 'https://repo1.maven.org/maven2/']
        ]);

        vscode.window.showInformationMessage('Running performance benchmark...');
        
        const { processGradleFilesWithCopilot } = await import('./migrator/gradleFiles');
        const report = await benchmark.runBenchmarkSuite(
          DEFAULT_BENCHMARK_CONFIGS,
          repositoryPath,
          urlMappings,
          processGradleFilesWithCopilot
        );

        // Export report to workspace
        const reportPath = vscode.Uri.joinPath(workspaceFolder.uri, 'performance-report.json');
        benchmark.exportReport(report, reportPath.fsPath);
        
        // Show summary
        const summary = `Benchmark completed!\n` +
          `Best configuration: ${report.summary.bestPerformingConfig}\n` +
          `Average throughput: ${report.summary.averageThroughput.toFixed(2)} files/sec\n` +
          `Report saved to: performance-report.json`;
        
        vscode.window.showInformationMessage(summary);
        
        // Open report file
        const doc = await vscode.workspace.openTextDocument(reportPath);
        await vscode.window.showTextDocument(doc);
        
      } catch (error) {
        vscode.window.showErrorMessage(
          `Benchmark failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );

  // Register scalability analysis command
  context.subscriptions.push(
    vscode.commands.registerCommand('gradleMigrator.runScalabilityAnalysis', async () => {
      try {
        const analyzer = new ScalabilityAnalyzer();
        
        vscode.window.showInformationMessage('Running scalability analysis...');
        
        const { processGradleFilesWithCopilot } = await import('./migrator/gradleFiles');
        const report = await analyzer.analyzeScalability(
          DEFAULT_SCALABILITY_TEST_CASES,
          DEFAULT_BENCHMARK_CONFIGS,
          processGradleFilesWithCopilot
        );

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
          const reportPath = vscode.Uri.joinPath(workspaceFolder.uri, 'scalability-report.json');
          analyzer.exportReport(report, reportPath.fsPath);
          
          // Show summary
          const summary = `Scalability analysis completed!\n` +
            `Optimal configuration: ${report.summary.optimalConfiguration}\n` +
            `Max recommended files: ${report.summary.maxRecommendedFileCount}\n` +
            `Critical bottlenecks: ${report.summary.criticalBottlenecks.join(', ')}\n` +
            `Report saved to: scalability-report.json`;
          
          vscode.window.showInformationMessage(summary);
          
          // Open report file
          const doc = await vscode.workspace.openTextDocument(reportPath);
          await vscode.window.showTextDocument(doc);
        } else {
          // Print to console if no workspace
          analyzer.printReport(report);
          vscode.window.showInformationMessage('Scalability analysis completed! Check console for results.');
        }
        
      } catch (error) {
        vscode.window.showErrorMessage(
          `Scalability analysis failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );

  // Register performance configuration command
  context.subscriptions.push(
    vscode.commands.registerCommand('gradleMigrator.configurePerformance', async () => {
      try {
        const config = vscode.workspace.getConfiguration('gradleMigrator');
        const currentOptions = config.get<PerformanceOptions>('performanceOptions') || {};
        
        // Get system information for recommendations
        const cpuCount = os.cpus().length;
        const totalMemory = Math.floor(os.totalmem() / 1024 / 1024); // MB
        
        // Show configuration options
        const items = [
          {
            label: 'Auto-configure (Recommended)',
            description: `Automatically configure based on system resources (${cpuCount} CPUs, ${totalMemory}MB RAM)`,
            value: 'auto'
          },
          {
            label: 'Small Repository',
            description: 'Optimized for repositories with < 100 files',
            value: 'small'
          },
          {
            label: 'Medium Repository',
            description: 'Optimized for repositories with 100-1000 files',
            value: 'medium'
          },
          {
            label: 'Large Repository',
            description: 'Optimized for repositories with 1000+ files',
            value: 'large'
          },
          {
            label: 'Custom Configuration',
            description: 'Manually configure performance options',
            value: 'custom'
          }
        ];
        
        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select performance configuration'
        });
        
        if (!selected) return;
        
        let newOptions: PerformanceOptions;
        
        switch (selected.value) {
          case 'auto':
            newOptions = getAutoConfiguration(cpuCount, totalMemory);
            break;
          case 'small':
            newOptions = {
              enableCaching: false,
              maxParallelJobs: 2,
              chunkSize: 10,
              memoryLimit: 128,
              useStreaming: false,
              enableWorkerThreads: false
            };
            break;
          case 'medium':
            newOptions = {
              enableCaching: true,
              maxParallelJobs: 4,
              chunkSize: 50,
              memoryLimit: 512,
              useStreaming: false,
              enableWorkerThreads: false
            };
            break;
          case 'large':
            newOptions = {
              enableCaching: true,
              maxParallelJobs: 6,
              chunkSize: 100,
              memoryLimit: 1024,
              useStreaming: true,
              enableWorkerThreads: true
            };
            break;
          case 'custom':
            newOptions = await getCustomConfiguration(currentOptions);
            break;
          default:
            return;
        }
        
        // Save configuration
        await config.update('performanceOptions', newOptions, vscode.ConfigurationTarget.Workspace);
        
        vscode.window.showInformationMessage(
          `Performance configuration updated: ${JSON.stringify(newOptions, null, 2)}`
        );
        
      } catch (error) {
        vscode.window.showErrorMessage(
          `Configuration failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );

  // Optionally register at activation so Copilot can discover it immediately.
  registerLmTool(context).catch(e => {
    // do not block activation; log error
    console.warn('Could not auto-register LM tool at activation:', e);
  });
}

export function deactivate() {
  // graceful cleanup if needed
  globalMemoryManager.stopMonitoring();
}

function getAutoConfiguration(cpuCount: number, totalMemory: number): PerformanceOptions {
  const memoryLimit = Math.min(Math.floor(totalMemory * 0.3), 2048); // Use 30% of RAM, max 2GB
  const maxParallelJobs = Math.min(cpuCount, 8); // Use all CPUs, max 8
  
  return {
    enableCaching: totalMemory > 1024, // Enable caching if more than 1GB RAM
    maxParallelJobs,
    chunkSize: totalMemory > 2048 ? 100 : 50,
    memoryLimit,
    useStreaming: totalMemory > 2048,
    enableWorkerThreads: cpuCount > 4
  };
}

async function getCustomConfiguration(currentOptions: Partial<PerformanceOptions>): Promise<PerformanceOptions> {
  const result: PerformanceOptions = {
    enableCaching: currentOptions.enableCaching ?? true,
    maxParallelJobs: currentOptions.maxParallelJobs ?? 4,
    chunkSize: currentOptions.chunkSize ?? 50,
    memoryLimit: currentOptions.memoryLimit ?? 512,
    useStreaming: currentOptions.useStreaming ?? false,
    enableWorkerThreads: currentOptions.enableWorkerThreads ?? false
  };

  // Simple implementation - in a real scenario, you might want a more sophisticated UI
  const maxParallelJobs = await vscode.window.showInputBox({
    prompt: 'Max parallel jobs',
    value: (result.maxParallelJobs || 4).toString(),
    validateInput: (value) => {
      const num = parseInt(value);
      return isNaN(num) || num < 1 || num > 16 ? 'Must be a number between 1 and 16' : undefined;
    }
  });
  
  if (maxParallelJobs) {
    result.maxParallelJobs = parseInt(maxParallelJobs);
  }

  const chunkSize = await vscode.window.showInputBox({
    prompt: 'Chunk size (files per batch)',
    value: (result.chunkSize || 50).toString(),
    validateInput: (value) => {
      const num = parseInt(value);
      return isNaN(num) || num < 1 || num > 1000 ? 'Must be a number between 1 and 1000' : undefined;
    }
  });
  
  if (chunkSize) {
    result.chunkSize = parseInt(chunkSize);
  }

  const memoryLimit = await vscode.window.showInputBox({
    prompt: 'Memory limit (MB)',
    value: (result.memoryLimit || 512).toString(),
    validateInput: (value) => {
      const num = parseInt(value);
      return isNaN(num) || num < 64 || num > 8192 ? 'Must be a number between 64 and 8192' : undefined;
    }
  });
  
  if (memoryLimit) {
    result.memoryLimit = parseInt(memoryLimit);
  }

  return result;
}

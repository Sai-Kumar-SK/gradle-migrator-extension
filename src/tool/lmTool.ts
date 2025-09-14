// src/tool/lmTool.ts  -- REPLACE existing registerLmTool with this diagnostic version
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import { 
  findGradleFiles, 
  readFileChunk, 
  updateGradlePropertiesFiles, 
  replaceRootTemplates,
  GradleFileInfo, 
  ProcessingResult,
  processGradleFilesWithCopilot,
  validateGradleFiles 
} from '../migrator/gradleFiles';
import { SETTINGS_GRADLE_TEMPLATE, JENKINSFILE_TEMPLATE } from '../migrator/templates';
import { cloneRepo, createBranch, addAllAndCommit, pushBranch, getRepoStatus, GitOperationResult } from '../migrator/gitHelpers';
import { handleError, ErrorType, withErrorHandling } from '../utils/errorHandler';
import { feedback } from '../utils/userFeedback';

// Tool implementation class that implements the LanguageModelTool interface
class GradleMigratorTool implements vscode.LanguageModelTool<any> {
  async invoke(options: vscode.LanguageModelToolInvocationOptions<any>, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
    const startTime = Date.now();
    
    try {
      // Check for cancellation
      if (token.isCancellationRequested) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart('Operation cancelled by user')
        ]);
      }
      
      // Parse input parameters with error handling
      const input = options.input;
      let params: any = {};
      let action: string;
      
      const parseResult = await withErrorHandling(
        () => {
          if (typeof input === 'object' && input !== null) {
            return input as { action: string; params: any };
          } else if (typeof input === 'string') {
            return JSON.parse(input);
          } else {
            throw new Error('Invalid input format');
          }
        },
        ErrorType.VALIDATION,
        { operation: 'parseInput', input: typeof input === 'string' ? input.substring(0, 100) : 'object' }
      );
      
      if (!parseResult.success) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(`Error parsing input: ${parseResult.error}`)
        ]);
      }
      
      ({ action, params } = parseResult.data as { action: string; params: any });
      
      if (!action) {
        await handleError(
          new Error('Missing action parameter'),
          ErrorType.VALIDATION,
          { operation: 'validateAction', params }
        );
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart('Error: action parameter is required')
        ]);
      }
      
      // Check for cancellation before processing
      if (token.isCancellationRequested) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart('Operation cancelled by user')
        ]);
      }
      
      // Handle different actions with comprehensive error handling
      let result: vscode.LanguageModelToolResult;
      
      switch (action) {
        case 'listFiles':
          result = await this.handleListFiles(params, token);
          break;
        case 'readChunk':
          result = await this.handleReadChunk(params, token);
          break;
        case 'updateFiles':
          result = await this.handleUpdateFiles(params, token);
          break;
        case 'commitChanges':
          result = await this.handleCommitChanges(params, token);
          break;
        case 'processWithCopilot':
          result = await this.handleProcessWithCopilot(params, token);
          break;
        case 'validateFiles':
          result = await this.handleValidateFiles(params, token);
          break;
        case 'getRepoStatus':
          result = await this.handleGetRepoStatus(params, token);
          break;
        case 'analyzeProject':
          result = await this.handleAnalyzeProject(params, token);
          break;
        case 'migrateRepo':
          result = await this.handleMigrateRepo(params, token);
          break;
        default:
          await handleError(
            new Error(`Unknown action: ${action}`),
            ErrorType.VALIDATION,
            { operation: 'validateAction', action, availableActions: ['listFiles', 'readChunk', 'updateFiles', 'commitChanges', 'processWithCopilot', 'validateFiles', 'getRepoStatus', 'analyzeProject', 'migrateRepo'] }
          );
          return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(`Unknown action: ${action}. Available actions: listFiles, readChunk, updateFiles, commitChanges, processWithCopilot, validateFiles, getRepoStatus, analyzeProject, migrateRepo`)
          ]);
      }
      
      // Log successful operation
      const duration = Date.now() - startTime;
      console.log(`LM Tool operation '${action}' completed successfully in ${duration}ms`);
      
      return result;
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      await handleError(error, ErrorType.COPILOT_INTEGRATION, {
        operation: 'lmToolInvoke',
        duration,
        input: typeof options.input === 'string' ? options.input.substring(0, 200) : 'object'
      });
      
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Error: ${error.message}`)
      ]);
    }
  }

  private async handleListFiles(params: any, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
    const repoPath = params.repoPath ?? vscode.workspace.rootPath ?? '.';
    const includeMetadata = params.includeMetadata ?? false;
    
    if (!repoPath) {
      await handleError(
        new Error('Missing repoPath parameter'),
        ErrorType.VALIDATION,
        { operation: 'listFiles', params }
      );
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart('Error: repoPath parameter is required')
      ]);
    }
    
    const result = await withErrorHandling(
      async () => {
        const filesResult = await findGradleFiles(repoPath);
        
        // filesResult is already an array of GradleFileInfo
        
        return {
          success: true,
          files: filesResult,
          summary: {
            total: filesResult.length || 0,
            byType: filesResult.reduce((acc: any, file: GradleFileInfo) => {
              acc[file.type] = (acc[file.type] || 0) + 1;
              return acc;
            }, {})
          }
        };
      },
      ErrorType.FILE_SYSTEM,
      { operation: 'listFiles', repoPath }
    );
    
    if (!result.success) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({
          success: false,
          error: result.error
        }))
      ]);
    }
    
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify(result.data, null, 2))
    ]);
  }

  private async handleReadChunk(params: any, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
    const { filePath, startLine = 1, endLine, maxTokens = 2000 } = params;
    
    if (!filePath) {
      await handleError(
        new Error('Missing filePath parameter'),
        ErrorType.VALIDATION,
        { operation: 'readChunk', params }
      );
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart('Error: filePath parameter is required')
      ]);
    }
    
    const result = await withErrorHandling(
      async () => {
        const chunkResult = await readFileChunk(filePath, filePath, startLine, endLine, { maxTokens });
        
        return chunkResult;
      },
      ErrorType.FILE_SYSTEM,
      { operation: 'readChunk', filePath, startLine, endLine, maxTokens }
    );
    
    if (!result.success) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({
          success: false,
          error: result.error
        }))
      ]);
    }
    
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify(result.data, null, 2))
    ]);
  }

  private async handleUpdateFiles(params: any, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
    const { repoPath, repositoryUrl, createBackup = true, dryRun = false } = params;
    
    if (!repoPath) {
      await handleError(
        new Error('Missing repoPath parameter'),
        ErrorType.VALIDATION,
        { operation: 'updateFiles', params }
      );
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart('Error: repoPath parameter is required')
      ]);
    }
    
    const result = await withErrorHandling(
      async () => {
        const results: ProcessingResult[] = [];
        
        // Update gradle.properties files
        if (repositoryUrl) {
          const updateResult = await updateGradlePropertiesFiles(repoPath, repositoryUrl, {
            createBackup,
            dryRun,
            customMappings: params.customMappings
          });
          results.push(updateResult);
        }
        
        // Replace templates
        const templateResult = await replaceRootTemplates(repoPath, {
          createBackup,
          dryRun,
          validateSyntax: true
        });
        results.push(templateResult);
        
        const response = {
          success: results.every(r => r.success),
          results,
          summary: {
            totalProcessed: results.reduce((sum, r) => sum + (r.filesProcessed || 0), 0),
            totalErrors: results.reduce((sum, r) => sum + (r.errors?.length || 0), 0)
          }
        };
        
        // Provide user feedback
        if (response.success) {
          await feedback.success(`Updated ${response.summary.totalProcessed} files successfully`);
        } else {
          await feedback.warning(`Update completed with ${response.summary.totalErrors} errors`);
        }
        
        return response;
      },
      ErrorType.GRADLE_PROCESSING,
      { operation: 'updateFiles', repoPath, repositoryUrl, createBackup, dryRun }
    );
    
    if (!result.success) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({
          success: false,
          error: result.error
        }))
      ]);
    }
    
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify(result.data, null, 2))
    ]);
  }

  private async handleCommitChanges(params: any, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
    const { repoPath, message = 'Gradle migration updates', push = false } = params;
    
    if (!repoPath) {
      await handleError(
        new Error('Missing repoPath parameter'),
        ErrorType.VALIDATION,
        { operation: 'commitChanges', params }
      );
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart('Error: repoPath parameter is required')
      ]);
    }
    
    const result = await withErrorHandling(
      async () => {
        // Get repository status first
        const statusResult = await getRepoStatus(repoPath);
        if (!statusResult.success) {
          throw new Error(`Failed to get repository status: ${statusResult.message}`);
        }
        
        // Commit changes
        const commitResult = await addAllAndCommit(repoPath, message, {
          allowEmpty: false,
          author: params.author
        });
        
        if (!commitResult.success) {
          throw new Error(`Failed to commit changes: ${commitResult.message}`);
        }
        
        await feedback.success('Changes committed successfully');
        
        let pushResult: GitOperationResult | undefined;
        if (push) {
          const branchName = params.branchName || 'gradle-migration';
          pushResult = await pushBranch(repoPath, branchName, {
            force: false,
            setUpstream: true
          });
          
          if (!pushResult.success) {
            await feedback.warning(`Commit successful but push failed: ${pushResult.message}`);
          } else {
            await feedback.success('Changes pushed successfully');
          }
        }
        
        return {
          commit: commitResult,
          push: pushResult,
          success: commitResult.success && (!push || pushResult?.success)
        };
      },
      ErrorType.GIT_OPERATION,
      { operation: 'commitChanges', repoPath, message, push }
    );
    
    if (!result.success) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({
          success: false,
          error: result.error
        }))
      ]);
    }
    
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify(result.data, null, 2))
    ]);
  }

  private async handleProcessWithCopilot(params: any, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
    const { repoPath, maxTokensPerFile = 2000, batchSize = 5 } = params;
    
    if (!repoPath) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart('Error: repoPath parameter is required')
      ]);
    }
    
    try {
      const result = await processGradleFilesWithCopilot(
        repoPath,
        new Map<string, string>(),
        undefined,
        {}
      );
      
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))
      ]);
    } catch (error: any) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Error processing with Copilot: ${error.message}`)
      ]);
    }
  }

  private async handleValidateFiles(params: any, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
    const { repoPath, fileTypes = ['gradle', 'groovy'] } = params;
    
    if (!repoPath) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart('Error: repoPath parameter is required')
      ]);
    }
    
    try {
      const files = await findGradleFiles(repoPath);
      const result = await validateGradleFiles(files);
      
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))
      ]);
    } catch (error: any) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Error validating files: ${error.message}`)
      ]);
    }
  }

  private async handleGetRepoStatus(params: any, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
    const { repoPath } = params;
    
    if (!repoPath) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart('Error: repoPath parameter is required')
      ]);
    }
    
    try {
      const result = await getRepoStatus(repoPath);
      
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))
      ]);
    } catch (error: any) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Error getting repo status: ${error.message}`)
      ]);
    }
  }

  private async handleAnalyzeProject(params: any, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
    const { repoPath } = params;
    
    if (!repoPath) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart('Error: repoPath parameter is required')
      ]);
    }
    
    try {
      // Get comprehensive project analysis
      const filesResult = await findGradleFiles(repoPath);
      const [repoStatus, validationResult] = await Promise.all([
        getRepoStatus(repoPath),
        validateGradleFiles(filesResult)
      ]);
      
      const analysis = {
        repository: repoStatus,
        files: filesResult,
        validation: validationResult,
        summary: {
          totalFiles: filesResult.length || 0,
          hasErrors: !validationResult.success,
          isCleanRepo: repoStatus.success && repoStatus.data?.isClean,
          recommendations: this.generateRecommendations(filesResult, validationResult, repoStatus)
        }
      };
      
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify(analysis, null, 2))
      ]);
    } catch (error: any) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Error analyzing project: ${error.message}`)
      ]);
    }
  }

  private async handleMigrateRepo(params: any, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
    try {
      // Validate required parameters
      const { gitUrl, branchName, commitMessage, auth } = params;
      
      if (!gitUrl || !branchName || !commitMessage) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart('Error: gitUrl, branchName, and commitMessage are required parameters')
        ]);
      }
      
      const startTime = Date.now();
      let repoPath: string | undefined;
      
      try {
        // Step 1: Clone repository
        const cloneOptions: any = {
          depth: 1 // Shallow clone for performance
        };
        
        if (auth && auth.username && auth.token) {
          cloneOptions.auth = auth;
        }
        
        const cloneResult = await cloneRepo(gitUrl, undefined, cloneOptions);
        const { repoPath: clonedPath, git } = cloneResult;
        repoPath = clonedPath;
        
        // Step 2: Create new branch
        const branchResult = await createBranch(git, branchName);
        if (!branchResult.success) {
          throw new Error(`Failed to create branch: ${branchResult.message}`);
        }
        
        // Step 3: Analyze project structure
        const files = await findGradleFiles(repoPath);
        if (files.length === 0) {
          throw new Error('No Gradle files found in the repository');
        }
        
        // Step 4: Validate existing Gradle files
        const validationResult = await validateGradleFiles(files);
        
        // Step 5: Update gradle.properties files
        const updateResult = await updateGradlePropertiesFiles(repoPath, undefined, { createBackup: true });
        
        // Step 6: Replace templates
        const templateResult = await replaceRootTemplates(
          repoPath,
          {
            createBackup: true,
            validateTemplates: true,
            settingsContent: SETTINGS_GRADLE_TEMPLATE,
            jenkinsContent: JENKINSFILE_TEMPLATE
          }
        );
        
        // Step 7: Commit changes
        const commitResult = await addAllAndCommit(git, commitMessage);
        if (!commitResult.success) {
          throw new Error(`Failed to commit changes: ${commitResult.message}`);
        }
        
        // Step 8: Push changes
        const pushResult = await pushBranch(git, branchName, { setUpstream: true });
        
        const duration = Date.now() - startTime;
        
        // Prepare comprehensive result
        const result = {
          success: true,
          duration: `${duration}ms`,
          repository: gitUrl,
          branch: branchName,
          filesProcessed: files.length,
          operations: {
            clone: 'success',
            branch: branchResult.success ? 'success' : 'warning',
            analysis: `Found ${files.length} Gradle files`,
            validation: validationResult.success ? 'success' : 'warning',
            update: updateResult.success ? 'success' : 'warning',
            templates: templateResult.success ? 'success' : 'warning',
            commit: commitResult.success ? 'success' : 'warning',
            push: pushResult.success ? 'success' : 'warning'
          },
          warnings: [] as string[],
          nextSteps: [] as string[]
        };
        
        // Collect warnings
        if (!branchResult.success) result.warnings.push(`Branch creation: ${branchResult.message}`);
        if (!updateResult.success) result.warnings.push(`Properties update: ${updateResult.message}`);
        if (!templateResult.success) result.warnings.push(`Template replacement: ${templateResult.message}`);
        if (!commitResult.success) result.warnings.push(`Commit: ${commitResult.message}`);
        if (!pushResult.success) result.warnings.push(`Push: ${pushResult.message}`);
        
        // Add next steps
        if (pushResult.success) {
          result.nextSteps.push(`Create pull request for branch '${branchName}'`);
          result.nextSteps.push('Review changes and merge when ready');
        } else {
          result.nextSteps.push(`Manually push branch from: ${repoPath}`);
          result.nextSteps.push(`Run: git push -u origin ${branchName}`);
        }
        
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(`✅ **Gradle Migration Completed Successfully**\n\n` +
            `**Repository**: ${gitUrl}\n` +
            `**Branch**: ${branchName}\n` +
            `**Duration**: ${duration}ms\n` +
            `**Files Processed**: ${files.length}\n\n` +
            `**Operations Status**:\n` +
            Object.entries(result.operations).map(([op, status]) => `- ${op}: ${status}`).join('\n') +
            (result.warnings.length > 0 ? `\n\n**Warnings**:\n${result.warnings.map(w => `- ${w}`).join('\n')}` : '') +
            `\n\n**Next Steps**:\n${result.nextSteps.map(s => `- ${s}`).join('\n')}`)
        ]);
        
      } catch (error: any) {
        // Cleanup on failure
        if (repoPath) {
          try {
            await fs.remove(repoPath);
          } catch (cleanupError) {
            console.warn('Failed to cleanup repository after error:', cleanupError);
          }
        }
        
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(`❌ **Migration Failed**\n\n` +
            `**Repository**: ${gitUrl}\n` +
            `**Error**: ${error.message}\n\n` +
            `**Troubleshooting**:\n` +
            `- Verify repository URL is accessible\n` +
            `- Check authentication credentials if using private repo\n` +
            `- Ensure repository contains Gradle files\n` +
            `- Try running migration on a smaller test repository first`)
        ]);
      }
      
    } catch (error: any) {
      await handleError(error, ErrorType.COPILOT_INTEGRATION, {
        operation: 'migrateRepo',
        params: { ...params, auth: params.auth ? '[REDACTED]' : undefined }
      });
      
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Error in migrateRepo: ${error.message}`)
      ]);
    }
  }

  private generateRecommendations(filesResult: any, validationResult: any, repoStatus: any): string[] {
    const recommendations: string[] = [];
    
    if (!filesResult.success) {
      recommendations.push('Fix file discovery issues before proceeding');
    }
    
    if (!validationResult.success) {
      recommendations.push('Address syntax validation errors in Gradle files');
    }
    
    if (!repoStatus.success || !repoStatus.data?.isClean) {
      recommendations.push('Commit or stash current changes before migration');
    }
    
    if (filesResult.files?.length > 50) {
      recommendations.push('Consider processing files in batches due to large project size');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Project is ready for migration');
    }
    
    return recommendations;
  }
}

let isRegistered = false;

export async function registerLmTool(context: vscode.ExtensionContext) {
  // Prevent duplicate registrations
  if (isRegistered) {
    console.log('DEBUG: Tool already registered, skipping...');
    return;
  }
  
  console.log('DEBUG: Starting LM tool registration...');
  console.log('DEBUG: VS Code version:', vscode.version);
  console.log('DEBUG: LM API available:', !!vscode.lm);
  console.log('DEBUG: registerTool function available:', !!(vscode.lm && vscode.lm.registerTool));
  
  // Check if Copilot Chat is available
  const copilotChatExt = vscode.extensions.getExtension('github.copilot-chat');
  console.log('DEBUG: Copilot Chat extension found:', !!copilotChatExt);
  console.log('DEBUG: Copilot Chat active:', copilotChatExt?.isActive);
  
  // Check if LM API is available
  if (!vscode.lm || typeof vscode.lm.registerTool !== 'function') {
    const msg = 'Language Model Tools API not available in this VS Code build.';
    console.error(msg);
    throw new Error(msg);
  }

  console.log('DEBUG: LM API available, registering tool...');

  // Read the package.json that the extension host is using (based on context)
  try {
    const pkgPath = path.join(context.extensionPath, 'package.json');
    const pkgRaw = await fs.readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(pkgRaw);
    console.log('DEBUG: package.json loaded from extensionPath:', pkgPath);
    console.log('DEBUG: contributes.languageModelTools from package.json:', JSON.stringify(pkg.contributes?.languageModelTools, null, 2));
  } catch (err) {
    console.warn('DEBUG: Could not read package.json from extensionPath:', err);
  }

  // Create tool instance
  const tool = new GradleMigratorTool();
  
  console.log('DEBUG: Created tool instance, attempting registration...');
  // Attempt registration and capture full error if it fails
  try {
    const disposable = vscode.lm.registerTool('gradle-migrator', tool);
    console.log('DEBUG: LM tool registered successfully: gradle-migrator');
    
    // Mark as registered
    isRegistered = true;
    
    // Add to subscriptions for cleanup
    context.subscriptions.push(disposable);
    
    // Reset registration flag when disposed
    context.subscriptions.push({
      dispose: () => {
        isRegistered = false;
      }
    });
  } catch (e: any) {
    console.error('DEBUG: LM registerTool threw error ->', e && e.stack ? e.stack : String(e));
    // Re-throw so the command surface shows the failure too
    throw e;
  }
}

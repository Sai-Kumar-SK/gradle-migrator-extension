// src/migrator/runner.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { cloneRepo, createBranch, addAllAndCommit, pushBranch, getRepoStatus, GitOperationResult, CloneOptions } from './gitHelpers';
import { findGradleFiles, updateGradlePropertiesFiles, replaceRootTemplates, validateGradleFiles, GradleFileInfo, ProcessingResult } from './gradleFiles';
import { SETTINGS_GRADLE_TEMPLATE, JENKINSFILE_TEMPLATE } from './templates';
import { registerLmTool } from '../tool/lmTool';
import { handleError, ErrorType, withErrorHandling } from '../utils/errorHandler';
import { feedback, ProgressCallback } from '../utils/userFeedback';

export type RunOptions = {
  gitUrl: string;
  branchName: string;
  commitMessage: string;
  startTool?: boolean;
};

/**
 * Interactive runner for the extension command. Prompts the user for inputs,
 * runs the migrator steps and optionally registers/starts the local LM tool.
 */
export async function runMigrationInteractive(): Promise<{ repoPath?: string } | void> {
  const startTime = Date.now();
  let totalProcessed = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  
  try {
    // Get user inputs with validation
    const gitUrl = await feedback.askForInput(
      'Enter Git repository URL',
      {
        placeholder: 'https://github.com/user/repo.git',
        validateInput: (value) => {
          if (!value.trim()) return 'Git URL is required';
          if (!value.match(/^https?:\/\/.+/)) return 'Please enter a valid HTTP(S) URL';
          return undefined;
        }
      }
    );
    
    if (!gitUrl) {
      await feedback.warning('Migration cancelled: Git URL is required');
      return;
    }
    
    const branchName = await feedback.askForInput(
      'Enter branch name for migration',
      {
        placeholder: 'gradle-migration',
        validateInput: (value) => {
          if (!value.trim()) return 'Branch name is required';
          if (!/^[a-zA-Z0-9_-]+$/.test(value)) return 'Branch name can only contain letters, numbers, hyphens, and underscores';
          return undefined;
        }
      }
    );
    
    if (!branchName) {
      await feedback.warning('Migration cancelled: Branch name is required');
      return;
    }
    
    const commitMessage = await feedback.askForInput(
      'Enter commit message',
      {
        placeholder: 'Migrate Gradle configuration',
        validateInput: (value) => {
          if (!value.trim()) return 'Commit message is required';
          if (value.length < 10) return 'Commit message should be at least 10 characters';
          return undefined;
        }
      }
    );
    
    if (!commitMessage) {
      await feedback.warning('Migration cancelled: Commit message is required');
      return;
    }
    
    const startToolPick = await vscode.window.showQuickPick(['Yes', 'No'], {
      placeHolder: 'Register local Gradle Migrator tool for Copilot agent use (recommended)?',
      ignoreFocusOut: true
    });
    const startTool = startToolPick === 'Yes';
    
    // Confirm migration
    const confirmed = await feedback.askConfirmation(
      'Start Gradle migration?',
      {
        detail: `This will:\n• Clone ${gitUrl}\n• Create branch '${branchName}'\n• Update Gradle configurations\n• Commit and push changes`,
        confirmLabel: 'Start Migration',
        cancelLabel: 'Cancel'
      }
    );
    
    if (!confirmed) {
      await feedback.info('Migration cancelled by user');
      return;
    }
    
    // Run migration with comprehensive progress tracking
    await feedback.withProgress(
      'Gradle Migration',
      async (progress: ProgressCallback, token: vscode.CancellationToken) => {
        let repoPath: string | undefined;
        
        try {
          // Step 1: Clone repository
          progress({ current: 1, total: 8, message: 'Cloning repository', detail: gitUrl, cancellable: true });
          
          const cloneOptions: CloneOptions = {
            depth: 1 // Shallow clone for faster performance
          };
          const cloneResult = await withErrorHandling(
            () => cloneRepo(gitUrl, undefined, cloneOptions),
            ErrorType.GIT_OPERATION,
            { operation: 'clone', url: gitUrl }
          );
          
          if (!cloneResult.success) {
            throw new Error(cloneResult.error?.message || 'Failed to clone repository');
          }
          
          const { repoPath: clonedPath, git } = cloneResult.data!;
          repoPath = clonedPath;
          
          // Step 2: Create new branch
          progress({ current: 2, total: 8, message: 'Creating migration branch', detail: branchName, cancellable: true });
          
          const branchResult = await withErrorHandling(
            () => createBranch(git, branchName),
            ErrorType.GIT_OPERATION,
            { operation: 'createBranch', branch: branchName }
          );
          
          if (!branchResult.success) {
            throw new Error(branchResult.error?.message || 'Failed to create branch');
          }
          
          // Step 3: Find Gradle files
          progress({ current: 3, total: 8, message: 'Discovering Gradle files', cancellable: true });
          
          const filesResult = await withErrorHandling(
            () => findGradleFiles(repoPath!),
            ErrorType.FILE_SYSTEM,
            { operation: 'findFiles', path: repoPath }
          );
          
          if (!filesResult.success) {
            throw new Error(filesResult.error?.message || 'Failed to find Gradle files');
          }
          
          const files = filesResult.data!;
          await feedback.info(`Found ${files.length} Gradle files to process`);
          
          // Step 4: Validate Gradle files
          progress({ current: 4, total: 8, message: 'Validating Gradle files', cancellable: true });
          
          const validationResult = await withErrorHandling(
            () => validateGradleFiles(files),
            ErrorType.VALIDATION,
            { operation: 'validation', path: repoPath }
          );
          
          if (validationResult.success && validationResult.data && validationResult.data.warnings.length > 0) {
            totalWarnings += validationResult.data.warnings.length;
            console.warn('Gradle validation warnings:', validationResult.data.warnings);
          }
          
          // Step 5: Update gradle.properties files
          progress({ current: 5, total: 8, message: 'Updating gradle.properties files', cancellable: true });
          
          const updateResult = await withErrorHandling(
            () => updateGradlePropertiesFiles(repoPath!, undefined, { createBackup: true }),
            ErrorType.GRADLE_PROCESSING,
            { operation: 'updateProperties', path: repoPath }
          );
          
          if (!updateResult.success) {
            totalWarnings++;
            await feedback.warning(`Gradle properties update issues: ${updateResult.error}`);
          } else {
            totalProcessed++;
            await feedback.info(updateResult.data?.message || 'Properties updated successfully');
          }
          
          // Step 6: Replace templates
          progress({ current: 6, total: 8, message: 'Replacing templates', cancellable: true });
          
          const templateResult = await withErrorHandling(
            () => replaceRootTemplates(
              repoPath!, 
              { 
                createBackup: true, 
                validateTemplates: true,
                settingsContent: SETTINGS_GRADLE_TEMPLATE,
                jenkinsContent: JENKINSFILE_TEMPLATE
              }
            ),
            ErrorType.GRADLE_PROCESSING,
            { operation: 'replaceTemplates', path: repoPath }
          );
          
          if (!templateResult.success) {
            totalErrors++;
            throw new Error(templateResult.error?.message || 'Failed to replace templates');
          }
          
          totalProcessed++;
          
          // Step 7: Commit changes
          progress({ current: 7, total: 8, message: 'Committing changes', cancellable: true });
          
          const commitResult = await withErrorHandling(
            () => addAllAndCommit(git, commitMessage),
            ErrorType.GIT_OPERATION,
            { operation: 'commit', message: commitMessage }
          );
          
          if (!commitResult.success) {
            totalWarnings++;
            await feedback.warning(`Commit warning: ${commitResult.error}`);
          } else {
            await feedback.success('Changes committed successfully');
          }
          
          // Step 8: Push changes
          progress({ current: 8, total: 8, message: 'Pushing changes', cancellable: true });
          
          const pushResult = await withErrorHandling(
            () => pushBranch(git, branchName, { setUpstream: true }),
            ErrorType.GIT_OPERATION,
            { operation: 'push', branch: branchName }
          );
          
          if (!pushResult.success) {
            totalWarnings++;
            console.warn('Push failed:', pushResult.error);
            await feedback.warning(`${pushResult.error} — you may need to push manually from ${repoPath}`);
          } else {
            await feedback.success(`Successfully pushed branch '${branchName}' to origin`);
          }
          
        } catch (error) {
          totalErrors++;
          await handleError(error as Error, ErrorType.UNKNOWN, {
            operation: 'migration',
            repoPath,
            gitUrl,
            branchName
          });
          throw error;
        }
      },
      {
        location: vscode.ProgressLocation.Notification,
        cancellable: true
      }
    );
    
    // Register LM tool for Copilot integration
    if (startTool) {
      try {
        // attempt to register the tool with the current extension context via registerLmTool
        // registerLmTool expects a vscode.ExtensionContext, but we can't access it here.
        // Instead, we'll register from the top-level extension activation; show a hint.
        await feedback.info('Please run "Gradle Migrator: Register LM Tool" command (or the tool was registered at activation).');
      } catch (error) {
        await handleError(error as Error, ErrorType.COPILOT_INTEGRATION, {
          operation: 'registerLmTool'
        });
        totalWarnings++;
      }
    }
    
    // Show final result
    const duration = Date.now() - startTime;
    await feedback.showOperationResult(
      'Gradle Migration',
      totalErrors === 0,
      {
        processed: totalProcessed,
        errors: totalErrors,
        warnings: totalWarnings,
        duration,
        summary: totalErrors === 0 
          ? 'All operations completed successfully' 
          : 'Migration completed with some issues'
      }
    );
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    await handleError(error, ErrorType.UNKNOWN, {
      operation: 'runMigrationInteractive',
      duration
    });
    
    await feedback.showOperationResult(
      'Gradle Migration',
      false,
      {
        processed: totalProcessed,
        errors: totalErrors + 1,
        warnings: totalWarnings,
        duration,
        summary: 'Migration failed due to critical error'
      }
    );
  }

  return;
}

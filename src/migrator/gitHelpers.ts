import simpleGit, { SimpleGit, CleanOptions } from 'simple-git';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';

export interface GitOperationResult {
  success: boolean;
  message: string;
  data?: any;
}

export interface CloneOptions {
  depth?: number;
  branch?: string;
  auth?: {
    username: string;
    token: string;
  };
}

/**
 * Enhanced clone repository function with better error handling and authentication support
 */
export async function cloneRepo(
  gitUrl: string, 
  targetDir?: string, 
  options?: CloneOptions
): Promise<{ repoPath: string; git: SimpleGit }> {
  const tmp = targetDir ?? path.join(require('os').tmpdir(), `gradle-migrator-${Date.now()}`);
  
  try {
    // Ensure target directory exists and is empty
    await fs.ensureDir(tmp);
    const dirContents = await fs.readdir(tmp);
    if (dirContents.length > 0) {
      await fs.emptyDir(tmp);
    }

    const git = simpleGit();
    
    // Configure authentication if provided
    if (options?.auth) {
      const authUrl = gitUrl.replace('https://', `https://${options.auth.username}:${options.auth.token}@`);
      const cloneOptions: any = {};
      if (options?.depth) cloneOptions['--depth'] = options.depth;
      if (options?.branch) cloneOptions['--branch'] = options.branch;
      
      await git.clone(authUrl, tmp, cloneOptions);
    } else {
      const cloneOptions: any = {};
      if (options?.depth) cloneOptions['--depth'] = options.depth;
      if (options?.branch) cloneOptions['--branch'] = options.branch;
      
      await git.clone(gitUrl, tmp, cloneOptions);
    }
    
    const repoGit = simpleGit(tmp);
    
    // Verify the clone was successful
    const isRepo = await repoGit.checkIsRepo();
    if (!isRepo) {
      throw new Error('Cloned directory is not a valid Git repository');
    }
    
    return { repoPath: tmp, git: repoGit };
  } catch (err: any) {
    // Clean up on failure
    try {
      await fs.remove(tmp);
    } catch (cleanupErr) {
      console.warn('Failed to cleanup after clone failure:', cleanupErr);
    }
    
    // Provide more specific error messages
    if (err.message.includes('Authentication failed')) {
      throw new Error('Git authentication failed. Please check your credentials or use a personal access token.');
    } else if (err.message.includes('Repository not found')) {
      throw new Error(`Repository not found: ${gitUrl}. Please verify the URL is correct and you have access.`);
    } else if (err.message.includes('Network')) {
      throw new Error('Network error during clone. Please check your internet connection.');
    } else {
      throw new Error(`Failed to clone repository: ${err.message}`);
    }
  }
}

/**
 * Enhanced branch creation with conflict resolution and validation
 */
export async function createBranch(git: SimpleGit, branchName: string, fromBranch?: string): Promise<GitOperationResult> {
  try {
    // Validate branch name
    if (!branchName || branchName.trim() === '') {
      throw new Error('Branch name cannot be empty');
    }
    
    // Check for invalid characters and patterns
    if (branchName.includes('..') || branchName.includes(' ') || 
        branchName.startsWith('-') || branchName.endsWith('.') ||
        branchName.includes('~') || branchName.includes('^') ||
        branchName.includes(':') || branchName.includes('?') ||
        branchName.includes('*') || branchName.includes('[')) {
      throw new Error(`Invalid branch name: ${branchName}`);
    }
    
    // Check if branch already exists
    const branches = await git.branch();
    const branchExists = branches.all.includes(branchName);
    
    if (branchExists) {
      // Switch to existing branch
      await git.checkout(branchName);
      return {
        success: true,
        message: `Switched to existing branch: ${branchName}`,
        data: { branchName, existed: true }
      };
    } else {
      // Create new branch
      if (fromBranch) {
        await git.checkoutBranch(branchName, fromBranch);
      } else {
        await git.checkoutLocalBranch(branchName);
      }
      return {
        success: true,
        message: `Created and switched to new branch: ${branchName}`,
        data: { branchName, existed: false }
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to create/switch to branch ${branchName}: ${err.message}`,
      data: { branchName, error: err.message }
    };
  }
}

/**
 * Enhanced commit function with staging validation and conflict detection
 */
export async function addAllAndCommit(git: SimpleGit, message: string, options?: {
  allowEmpty?: boolean;
  author?: { name: string; email: string };
}): Promise<GitOperationResult> {
  try {
    // Validate commit message
    if (!message || message.trim() === '') {
      throw new Error('Commit message cannot be empty');
    }
    
    // Check for uncommitted changes
    const status = await git.status();
    
    if (status.files.length === 0 && !options?.allowEmpty) {
      return {
        success: true,
        message: 'No changes to commit',
        data: { filesChanged: 0 }
      };
    }
    
    // Stage all changes
    await git.add('.');
    
    // Configure author if provided
    if (options?.author) {
      await git.addConfig('user.name', options.author.name);
      await git.addConfig('user.email', options.author.email);
    }
    
    // Commit changes
    const commitOptions: string[] = [];
    if (options?.allowEmpty) {
      commitOptions.push('--allow-empty');
    }
    
    let result;
    if (options?.allowEmpty) {
      await git.raw(['commit', '-m', message, '--allow-empty']);
      result = { commit: 'unknown', summary: message };
    } else {
      result = await git.commit(message);
    }
    
    return {
      success: true,
      message: `Successfully committed ${status.files.length} file(s)`,
      data: { 
        filesChanged: status.files.length,
        commitHash: typeof result === 'string' ? 'unknown' : result.commit,
        summary: typeof result === 'string' ? message : result.summary
      }
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to commit changes: ${err.message}`,
      data: { error: err.message }
    };
  }
}

/**
 * Enhanced push function with upstream tracking and force push options
 */
export async function pushBranch(
  git: SimpleGit, 
  branchName: string, 
  options?: {
    setUpstream?: boolean;
    force?: boolean;
    remote?: string;
  }
): Promise<GitOperationResult> {
  try {
    const remote = options?.remote || 'origin';
    const pushOptions: string[] = [];
    
    if (options?.setUpstream) {
      pushOptions.push('--set-upstream');
    }
    
    if (options?.force) {
      pushOptions.push('--force-with-lease');
    }
    
    // Check if remote exists
    const remotes = await git.getRemotes(true);
    const remoteExists = remotes.some(r => r.name === remote);
    
    if (!remoteExists) {
      throw new Error(`Remote '${remote}' does not exist`);
    }
    
    // Push the branch
    await git.push(remote, branchName, pushOptions);
    
    return {
      success: true,
      message: `Successfully pushed branch '${branchName}' to '${remote}'`,
      data: { branchName, remote, options }
    };
  } catch (err: any) {
    // Provide specific error messages for common issues
    let errorMessage = `Failed to push branch '${branchName}': ${err.message}`;
    
    if (err.message.includes('Authentication failed')) {
      errorMessage = 'Push failed: Authentication required. Please configure Git credentials or use a personal access token.';
    } else if (err.message.includes('rejected')) {
      errorMessage = 'Push rejected: The remote branch has changes. Consider pulling first or use force push if appropriate.';
    } else if (err.message.includes('Permission denied')) {
      errorMessage = 'Push failed: Permission denied. Check your repository access rights.';
    }
    
    return {
      success: false,
      message: errorMessage,
      data: { branchName, error: err.message }
    };
  }
}

/**
 * Get repository status and information
 */
export async function getRepoStatus(git: SimpleGit): Promise<GitOperationResult> {
  try {
    const [status, branch, remotes] = await Promise.all([
      git.status(),
      git.branch(),
      git.getRemotes(true)
    ]);
    
    return {
      success: true,
      message: 'Repository status retrieved successfully',
      data: {
        currentBranch: branch.current,
        ahead: status.ahead,
        behind: status.behind,
        staged: status.staged,
        modified: status.modified,
        created: status.created,
        deleted: status.deleted,
        renamed: status.renamed,
        conflicted: status.conflicted,
        remotes: remotes.map(r => ({ name: r.name, url: r.refs.fetch }))
      }
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to get repository status: ${err.message}`,
      data: { error: err.message }
    };
  }
}

/**
 * Clean repository working directory
 */
export async function cleanRepo(git: SimpleGit, options?: {
  dryRun?: boolean;
  force?: boolean;
  directories?: boolean;
}): Promise<GitOperationResult> {
  try {
    const cleanMode = [];
    if (options?.dryRun) cleanMode.push('n');
    if (options?.force) cleanMode.push('f');
    if (options?.directories) cleanMode.push('d');
    
    const result = await git.clean(cleanMode.join('') || 'f');
    
    return {
      success: true,
      message: options?.dryRun ? 'Clean dry run completed' : 'Repository cleaned successfully',
      data: { result, options }
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to clean repository: ${err.message}`,
      data: { error: err.message }
    };
  }
}

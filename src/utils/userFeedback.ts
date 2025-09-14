import * as vscode from 'vscode';
import { ErrorInfo, ErrorSeverity } from './errorHandler';

/**
 * Progress tracking interface
 */
export interface ProgressInfo {
  current: number;
  total: number;
  message: string;
  detail?: string;
  cancellable: boolean;
}

/**
 * Feedback message types
 */
export enum FeedbackType {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
  PROGRESS = 'progress'
}

/**
 * Feedback options
 */
export interface FeedbackOptions {
  modal?: boolean;
  timeout?: number;
  actions?: Array<{
    label: string;
    action: () => Promise<void> | void;
  }>;
  showInOutput?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Progress callback function type
 */
export type ProgressCallback = (progress: ProgressInfo) => void;

/**
 * User feedback manager for the Gradle Migrator extension
 */
export class UserFeedbackManager {
  private static instance: UserFeedbackManager;
  private outputChannel: vscode.OutputChannel;
  private statusBarItem: vscode.StatusBarItem;
  private currentProgress: vscode.Progress<{ message?: string; increment?: number }> | null = null;
  private progressResolve: ((value: any) => void) | null = null;

  private constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Gradle Migrator');
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
  }

  public static getInstance(): UserFeedbackManager {
    if (!UserFeedbackManager.instance) {
      UserFeedbackManager.instance = new UserFeedbackManager();
    }
    return UserFeedbackManager.instance;
  }

  /**
   * Show a message to the user
   */
  public async showMessage(
    message: string,
    type: FeedbackType = FeedbackType.INFO,
    options: FeedbackOptions = {}
  ): Promise<string | undefined> {
    // Log to output channel if requested
    if (options.showInOutput !== false) {
      this.logToOutput(message, type, options.logLevel);
    }

    // Show in status bar for non-modal messages
    if (!options.modal) {
      this.updateStatusBar(message, type);
    }

    // Show appropriate VS Code notification
    const actionLabels = options.actions?.map(a => a.label) || [];
    let result: string | undefined;

    switch (type) {
      case FeedbackType.ERROR:
        if (options.modal) {
          result = await vscode.window.showErrorMessage(
            message,
            { modal: true },
            ...actionLabels
          );
        } else {
          result = await vscode.window.showErrorMessage(message, ...actionLabels);
        }
        break;

      case FeedbackType.WARNING:
        if (options.modal) {
          result = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            ...actionLabels
          );
        } else {
          result = await vscode.window.showWarningMessage(message, ...actionLabels);
        }
        break;

      case FeedbackType.SUCCESS:
      case FeedbackType.INFO:
      default:
        if (options.modal) {
          result = await vscode.window.showInformationMessage(
            message,
            { modal: true },
            ...actionLabels
          );
        } else {
          result = await vscode.window.showInformationMessage(message, ...actionLabels);
        }
        break;
    }

    // Execute selected action
    if (result && options.actions) {
      const selectedAction = options.actions.find(a => a.label === result);
      if (selectedAction) {
        await selectedAction.action();
      }
    }

    // Auto-hide status bar message after timeout
    if (options.timeout && !options.modal) {
      setTimeout(() => {
        this.clearStatusBar();
      }, options.timeout);
    }

    return result;
  }

  /**
   * Show progress with cancellation support
   */
  public async withProgress<T>(
    title: string,
    task: (progress: ProgressCallback, token: vscode.CancellationToken) => Promise<T>,
    options: {
      location?: vscode.ProgressLocation;
      cancellable?: boolean;
    } = {}
  ): Promise<T> {
    const location = options.location || vscode.ProgressLocation.Notification;
    const cancellable = options.cancellable !== false;

    return vscode.window.withProgress(
      {
        location,
        title,
        cancellable
      },
      async (progress, token) => {
        this.currentProgress = progress;
        
        const progressCallback: ProgressCallback = (info: ProgressInfo) => {
          const increment = info.total > 0 ? (1 / info.total) * 100 : undefined;
          const message = info.detail ? `${info.message} - ${info.detail}` : info.message;
          
          progress.report({
            message,
            increment
          });

          // Update status bar
          this.updateStatusBar(
            `${info.message} (${info.current}/${info.total})`,
            FeedbackType.PROGRESS
          );

          // Log progress
          this.logToOutput(
            `Progress: ${info.message} (${info.current}/${info.total})`,
            FeedbackType.PROGRESS
          );
        };

        try {
          const result = await task(progressCallback, token);
          this.currentProgress = null;
          this.clearStatusBar();
          return result;
        } catch (error) {
          this.currentProgress = null;
          this.clearStatusBar();
          throw error;
        }
      }
    );
  }

  /**
   * Show error with detailed information
   */
  public async showError(
    error: ErrorInfo,
    options: FeedbackOptions = {}
  ): Promise<void> {
    const message = this.formatErrorMessage(error);
    const actions = this.getErrorActions(error);
    
    await this.showMessage(
      message,
      FeedbackType.ERROR,
      {
        ...options,
        actions: [...(actions || []), ...(options.actions || [])],
        showInOutput: true,
        logLevel: 'error'
      }
    );
  }

  /**
   * Show operation result summary
   */
  public async showOperationResult(
    operation: string,
    success: boolean,
    details: {
      processed?: number;
      errors?: number;
      warnings?: number;
      duration?: number;
      summary?: string;
    } = {}
  ): Promise<void> {
    const { processed = 0, errors = 0, warnings = 0, duration, summary } = details;
    
    let message = `${operation} ${success ? 'completed successfully' : 'completed with issues'}`;
    
    const parts: string[] = [];
    if (processed > 0) parts.push(`${processed} files processed`);
    if (errors > 0) parts.push(`${errors} errors`);
    if (warnings > 0) parts.push(`${warnings} warnings`);
    if (duration) parts.push(`${Math.round(duration / 1000)}s`);
    
    if (parts.length > 0) {
      message += ` (${parts.join(', ')})`;
    }
    
    if (summary) {
      message += `. ${summary}`;
    }

    const type = success ? (warnings > 0 ? FeedbackType.WARNING : FeedbackType.SUCCESS) : FeedbackType.ERROR;
    
    await this.showMessage(message, type, {
      showInOutput: true,
      timeout: success ? 5000 : undefined
    });
  }

  /**
   * Ask user for confirmation
   */
  public async askConfirmation(
    message: string,
    options: {
      detail?: string;
      confirmLabel?: string;
      cancelLabel?: string;
      destructive?: boolean;
    } = {}
  ): Promise<boolean> {
    const {
      detail,
      confirmLabel = 'Yes',
      cancelLabel = 'No',
      destructive = false
    } = options;

    const fullMessage = detail ? `${message}\n\n${detail}` : message;
    
    const result = await vscode.window.showWarningMessage(
      fullMessage,
      { modal: true },
      confirmLabel,
      cancelLabel
    );

    return result === confirmLabel;
  }

  /**
   * Ask user for input
   */
  public async askForInput(
    prompt: string,
    options: {
      placeholder?: string;
      value?: string;
      password?: boolean;
      validateInput?: (value: string) => string | undefined;
    } = {}
  ): Promise<string | undefined> {
    if (options.password) {
      return await vscode.window.showInputBox({
        prompt,
        placeHolder: options.placeholder,
        value: options.value,
        password: true,
        validateInput: options.validateInput
      });
    } else {
      return await vscode.window.showInputBox({
        prompt,
        placeHolder: options.placeholder,
        value: options.value,
        validateInput: options.validateInput
      });
    }
  }

  /**
   * Ask user to select from options
   */
  public async askForSelection<T>(
    prompt: string,
    options: Array<{
      label: string;
      description?: string;
      detail?: string;
      value: T;
    }>
  ): Promise<T | undefined> {
    const quickPickItems = options.map(option => ({
      label: option.label,
      description: option.description,
      detail: option.detail,
      value: option.value
    }));

    const selected = await vscode.window.showQuickPick(quickPickItems, {
      placeHolder: prompt,
      canPickMany: false
    });

    return selected?.value;
  }

  /**
   * Log message to output channel
   */
  private logToOutput(
    message: string,
    type: FeedbackType,
    logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info'
  ): void {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${type.toUpperCase()}]`;
    
    this.outputChannel.appendLine(`${prefix} ${message}`);
    
    // Also log to console based on level
    switch (logLevel) {
      case 'debug':
        console.debug(`Gradle Migrator: ${message}`);
        break;
      case 'info':
        console.info(`Gradle Migrator: ${message}`);
        break;
      case 'warn':
        console.warn(`Gradle Migrator: ${message}`);
        break;
      case 'error':
        console.error(`Gradle Migrator: ${message}`);
        break;
    }
  }

  /**
   * Update status bar
   */
  private updateStatusBar(message: string, type: FeedbackType): void {
    const icon = this.getStatusBarIcon(type);
    this.statusBarItem.text = `${icon} ${message}`;
    this.statusBarItem.show();
  }

  /**
   * Clear status bar
   */
  private clearStatusBar(): void {
    this.statusBarItem.hide();
  }

  /**
   * Get status bar icon for feedback type
   */
  private getStatusBarIcon(type: FeedbackType): string {
    switch (type) {
      case FeedbackType.SUCCESS:
        return '$(check)';
      case FeedbackType.WARNING:
        return '$(warning)';
      case FeedbackType.ERROR:
        return '$(error)';
      case FeedbackType.PROGRESS:
        return '$(sync~spin)';
      case FeedbackType.INFO:
      default:
        return '$(info)';
    }
  }

  /**
   * Format error message for display
   */
  private formatErrorMessage(error: ErrorInfo): string {
    let message = error.message;
    
    if (error.userAction) {
      message += ` ${error.userAction}`;
    }
    
    if (error.code) {
      message += ` (Code: ${error.code})`;
    }
    
    return message;
  }

  /**
   * Get error-specific actions
   */
  private getErrorActions(error: ErrorInfo): Array<{
    label: string;
    action: () => Promise<void> | void;
  }> | undefined {
    const actions: Array<{
      label: string;
      action: () => Promise<void> | void;
    }> = [];

    // Add "Show Details" action for all errors
    actions.push({
      label: 'Show Details',
      action: () => {
        this.outputChannel.show();
        this.logToOutput(
          `Error Details:\nType: ${error.type}\nSeverity: ${error.severity}\nMessage: ${error.message}\nTimestamp: ${error.timestamp}\nContext: ${JSON.stringify(error.context, null, 2)}`,
          FeedbackType.ERROR,
          'error'
        );
      }
    });

    // Add "Copy Error" action
    actions.push({
      label: 'Copy Error',
      action: async () => {
        const errorText = `Gradle Migrator Error\n\nType: ${error.type}\nSeverity: ${error.severity}\nMessage: ${error.message}\nTimestamp: ${error.timestamp}\nContext: ${JSON.stringify(error.context, null, 2)}`;
        await vscode.env.clipboard.writeText(errorText);
        vscode.window.showInformationMessage('Error details copied to clipboard');
      }
    });

    return actions.length > 0 ? actions : undefined;
  }

  /**
   * Show output channel
   */
  public showOutput(): void {
    this.outputChannel.show();
  }

  /**
   * Clear output channel
   */
  public clearOutput(): void {
    this.outputChannel.clear();
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.outputChannel.dispose();
    this.statusBarItem.dispose();
  }
}

/**
 * Convenience functions for common feedback operations
 */
export const feedback = {
  info: (message: string, options?: FeedbackOptions) => 
    UserFeedbackManager.getInstance().showMessage(message, FeedbackType.INFO, options),
  
  success: (message: string, options?: FeedbackOptions) => 
    UserFeedbackManager.getInstance().showMessage(message, FeedbackType.SUCCESS, options),
  
  warning: (message: string, options?: FeedbackOptions) => 
    UserFeedbackManager.getInstance().showMessage(message, FeedbackType.WARNING, options),
  
  error: (message: string, options?: FeedbackOptions) => 
    UserFeedbackManager.getInstance().showMessage(message, FeedbackType.ERROR, options),
  
  showError: (error: ErrorInfo, options?: FeedbackOptions) => 
    UserFeedbackManager.getInstance().showError(error, options),
  
  withProgress: <T>(title: string, task: (progress: ProgressCallback, token: vscode.CancellationToken) => Promise<T>, options?: { location?: vscode.ProgressLocation; cancellable?: boolean }) => 
    UserFeedbackManager.getInstance().withProgress(title, task, options),
  
  askConfirmation: (message: string, options?: { detail?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean }) => 
    UserFeedbackManager.getInstance().askConfirmation(message, options),
  
  askForInput: (prompt: string, options?: { placeholder?: string; value?: string; password?: boolean; validateInput?: (value: string) => string | undefined }) => 
    UserFeedbackManager.getInstance().askForInput(prompt, options),
  
  askForSelection: <T>(prompt: string, options: Array<{ label: string; description?: string; detail?: string; value: T }>) => 
    UserFeedbackManager.getInstance().askForSelection(prompt, options),
  
  showOperationResult: (operation: string, success: boolean, details?: { processed?: number; errors?: number; warnings?: number; duration?: number; summary?: string }) => 
    UserFeedbackManager.getInstance().showOperationResult(operation, success, details)
};
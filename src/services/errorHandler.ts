import * as vscode from 'vscode';

export interface ErrorContext {
  operation: string;
  file?: string;
  service?: string;
  timestamp: Date;
  userAction?: string;
}

export interface FallbackOptions {
  enableBasicAnalysis: boolean;
  enableUrlMapping: boolean;
  enableCaching: boolean;
  showUserNotifications: boolean;
}

export class AIServiceError extends Error {
  constructor(
    message: string,
    public context: ErrorContext,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'AIServiceError';
  }
}

export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorLog: AIServiceError[] = [];
  private fallbackOptions: FallbackOptions;

  private constructor() {
    this.fallbackOptions = {
      enableBasicAnalysis: true,
      enableUrlMapping: true,
      enableCaching: true,
      showUserNotifications: true
    };
  }

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  setFallbackOptions(options: Partial<FallbackOptions>): void {
    this.fallbackOptions = { ...this.fallbackOptions, ...options };
  }

  async handleAIServiceError(
    error: Error,
    context: ErrorContext,
    fallbackAction?: () => Promise<any>
  ): Promise<any> {
    const aiError = new AIServiceError(
      `AI Service Error in ${context.operation}: ${error.message}`,
      context,
      error
    );

    this.logError(aiError);

    // Show user notification if enabled
    if (this.fallbackOptions.showUserNotifications) {
      await this.showErrorNotification(aiError);
    }

    // Execute fallback action if provided
    if (fallbackAction) {
      try {
        console.log(`Executing fallback for ${context.operation}`);
        return await fallbackAction();
      } catch (fallbackError) {
        console.error(`Fallback failed for ${context.operation}:`, fallbackError);
        throw aiError;
      }
    }

    throw aiError;
  }

  async handleGradleParsingError(
    error: Error,
    filePath: string,
    content: string
  ): Promise<any> {
    const context: ErrorContext = {
      operation: 'gradle-parsing',
      file: filePath,
      service: 'GradleParser',
      timestamp: new Date()
    };

    const fallbackAction = async () => {
      console.log(`Using basic parsing fallback for ${filePath}`);
      return this.basicGradleParsing(content, filePath);
    };

    return this.handleAIServiceError(error, context, fallbackAction);
  }

  async handleAnalysisEngineError(
    error: Error,
    projectPath: string
  ): Promise<any> {
    const context: ErrorContext = {
      operation: 'analysis-engine',
      file: projectPath,
      service: 'AnalysisEngine',
      timestamp: new Date()
    };

    const fallbackAction = async () => {
      console.log(`Using basic analysis fallback for ${projectPath}`);
      return this.basicAnalysisFallback(projectPath);
    };

    return this.handleAIServiceError(error, context, fallbackAction);
  }

  async handleSecurityAnalysisError(
    error: Error,
    projectPath: string
  ): Promise<any> {
    const context: ErrorContext = {
      operation: 'security-analysis',
      file: projectPath,
      service: 'SecurityAnalyzer',
      timestamp: new Date()
    };

    const fallbackAction = async () => {
      console.log(`Using basic security analysis fallback for ${projectPath}`);
      return this.basicSecurityAnalysisFallback(projectPath);
    };

    return this.handleAIServiceError(error, context, fallbackAction);
  }

  async handleContextSuggestionError(
    error: Error,
    projectPath: string
  ): Promise<any> {
    const context: ErrorContext = {
      operation: 'context-suggestions',
      file: projectPath,
      service: 'ContextSuggestionEngine',
      timestamp: new Date()
    };

    const fallbackAction = async () => {
      console.log(`Using basic suggestion fallback for ${projectPath}`);
      return this.basicSuggestionFallback(projectPath);
    };

    return this.handleAIServiceError(error, context, fallbackAction);
  }

  async handleInteractiveWorkflowError(
    error: Error,
    projectPath: string
  ): Promise<any> {
    const context: ErrorContext = {
      operation: 'interactive-workflow',
      file: projectPath,
      service: 'InteractiveWorkflow',
      timestamp: new Date()
    };

    const fallbackAction = async () => {
      console.log(`Using non-interactive fallback for ${projectPath}`);
      return this.nonInteractiveFallback();
    };

    return this.handleAIServiceError(error, context, fallbackAction);
  }

  private logError(error: AIServiceError): void {
    this.errorLog.push(error);
    console.error(`[${error.context.timestamp.toISOString()}] ${error.message}`);
    
    if (error.originalError) {
      console.error('Original error:', error.originalError);
    }

    // Keep only last 100 errors to prevent memory issues
    if (this.errorLog.length > 100) {
      this.errorLog = this.errorLog.slice(-100);
    }
  }

  private async showErrorNotification(error: AIServiceError): Promise<void> {
    const message = `AI service temporarily unavailable for ${error.context.operation}. Using fallback mode.`;
    
    const action = await vscode.window.showWarningMessage(
      message,
      'View Details',
      'Disable Notifications'
    );

    if (action === 'View Details') {
      await this.showErrorDetails(error);
    } else if (action === 'Disable Notifications') {
      this.fallbackOptions.showUserNotifications = false;
    }
  }

  private async showErrorDetails(error: AIServiceError): Promise<void> {
    const details = [
      `Operation: ${error.context.operation}`,
      `Service: ${error.context.service || 'Unknown'}`,
      `Time: ${error.context.timestamp.toLocaleString()}`,
      `File: ${error.context.file || 'N/A'}`,
      `Error: ${error.message}`,
      '',
      'The extension will continue using fallback mechanisms.',
      'AI features may be limited until the service is restored.'
    ].join('\n');

    await vscode.window.showInformationMessage(details, { modal: true });
  }

  private async basicGradleParsing(content: string, filePath: string): Promise<any> {
    // Basic regex-based parsing as fallback
    const plugins: string[] = [];
    const dependencies: string[] = [];
    const properties: Record<string, string> = {};

    // Extract plugins
    const pluginMatches = content.match(/(?:apply plugin:|id)\s*['"]([^'"]+)['"]/g);
    if (pluginMatches) {
      pluginMatches.forEach(match => {
        const pluginMatch = match.match(/['"]([^'"]+)['"]/);;
        if (pluginMatch) {
          plugins.push(pluginMatch[1]);
        }
      });
    }

    // Extract dependencies
    const depMatches = content.match(/(implementation|testImplementation|api|compile)\s+['"]([^'"]+)['"]/g);
    if (depMatches) {
      depMatches.forEach(match => {
        const depMatch = match.match(/['"]([^'"]+)['"]/);;
        if (depMatch) {
          dependencies.push(depMatch[1]);
        }
      });
    }

    // Extract basic properties
    const propMatches = content.match(/(\w+)\s*=\s*['"]([^'"]+)['"]/g);
    if (propMatches) {
      propMatches.forEach(match => {
        const propMatch = match.match(/(\w+)\s*=\s*['"]([^'"]+)['"]/);;
        if (propMatch) {
          properties[propMatch[1]] = propMatch[2];
        }
      });
    }

    return {
      filePath,
      plugins,
      dependencies,
      properties,
      gradleVersion: properties.gradleVersion || 'unknown',
      sourceCompatibility: properties.sourceCompatibility || 'unknown',
      targetCompatibility: properties.targetCompatibility || 'unknown',
      repositories: ['mavenCentral'], // Default assumption
      tasks: [],
      configurations: [],
      buildscript: {},
      fallbackMode: true
    };
  }

  private async basicAnalysisFallback(projectPath: string): Promise<any> {
    return {
      performanceAnalysis: {
        buildTime: { current: 'unknown', optimized: 'unknown', improvement: 'unknown' },
        parallelization: { enabled: false, recommendation: 'Enable parallel builds' },
        caching: { enabled: false, recommendation: 'Enable build caching' },
        incrementalCompilation: { enabled: false, recommendation: 'Enable incremental compilation' }
      },
      securityAnalysis: {
        vulnerabilities: [],
        insecureRepositories: [],
        hardcodedSecrets: [],
        recommendations: ['Run detailed security scan when AI service is available']
      },
      modernizationAnalysis: {
        gradleVersion: { current: 'unknown', latest: '8.0', updateRecommended: true },
        javaVersion: { current: 'unknown', recommended: '17', updateRecommended: true },
        pluginUpdates: [],
        dependencyUpdates: [],
        deprecatedFeatures: []
      },
      prioritizedRecommendations: [
        {
          id: 'fallback-1',
          title: 'Enable AI Analysis',
          description: 'Restore AI service connection for detailed analysis',
          priority: 'high',
          category: 'system',
          effort: 'low',
          impact: 'high'
        }
      ],
      fallbackMode: true
    };
  }

  private async basicSecurityAnalysisFallback(projectPath: string): Promise<any> {
    return {
      projectPath,
      scanDate: new Date(),
      vulnerabilities: [],
      summary: {
        total: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      },
      recommendations: [
        'Enable AI-powered security analysis for comprehensive vulnerability detection',
        'Regularly update dependencies to latest secure versions',
        'Use HTTPS repositories instead of HTTP',
        'Avoid hardcoding secrets in build files'
      ],
      fallbackMode: true
    };
  }

  private async basicSuggestionFallback(projectPath: string): Promise<any[]> {
    return [
      {
        id: 'basic-1',
        title: 'Update Gradle Version',
        description: 'Consider updating to the latest Gradle version for better performance and features',
        category: 'modernization',
        priority: 'medium',
        confidence: 0.8,
        implementation: {
          type: 'file-update',
          files: ['gradle/wrapper/gradle-wrapper.properties'],
          changes: []
        },
        explanation: 'Newer Gradle versions provide performance improvements and new features',
        fallbackMode: true
      },
      {
        id: 'basic-2',
        title: 'Enable Build Caching',
        description: 'Enable Gradle build caching to improve build performance',
        category: 'performance',
        priority: 'medium',
        confidence: 0.9,
        implementation: {
          type: 'file-update',
          files: ['gradle.properties'],
          changes: []
        },
        explanation: 'Build caching can significantly reduce build times for repeated builds',
        fallbackMode: true
      }
    ];
  }

  private async nonInteractiveFallback(): Promise<any> {
    return {
      id: 'fallback-session',
      projectPath: '',
      suggestions: [],
      userDecisions: [],
      status: 'completed',
      startTime: new Date(),
      endTime: new Date(),
      summary: {
        totalSuggestions: 0,
        acceptedSuggestions: 0,
        rejectedSuggestions: 0,
        appliedChanges: 0
      },
      fallbackMode: true
    };
  }

  getErrorLog(): AIServiceError[] {
    return [...this.errorLog];
  }

  clearErrorLog(): void {
    this.errorLog = [];
  }

  getErrorStats(): { total: number; byService: Record<string, number>; byOperation: Record<string, number> } {
    const stats = {
      total: this.errorLog.length,
      byService: {} as Record<string, number>,
      byOperation: {} as Record<string, number>
    };

    this.errorLog.forEach(error => {
      const service = error.context.service || 'unknown';
      const operation = error.context.operation;

      stats.byService[service] = (stats.byService[service] || 0) + 1;
      stats.byOperation[operation] = (stats.byOperation[operation] || 0) + 1;
    });

    return stats;
  }
}

// Utility function for wrapping async operations with error handling
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: ErrorContext,
  fallbackAction?: () => Promise<T>
): Promise<T> {
  const errorHandler = ErrorHandler.getInstance();
  
  try {
    return await operation();
  } catch (error) {
    return await errorHandler.handleAIServiceError(
      error as Error,
      context,
      fallbackAction
    );
  }
}
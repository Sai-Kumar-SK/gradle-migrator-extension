import * as vscode from 'vscode';
import { ErrorType, handleError } from '../utils/errorHandler';
import { UserFeedbackManager } from '../utils/userFeedback';

/**
 * AI Analysis Request interface
 */
export interface AIAnalysisRequest {
  content: string;
  filePath: string;
  analysisType: 'gradle-migration' | 'dependency-analysis' | 'performance-optimization' | 'security-scan';
  context?: {
    projectStructure?: string[];
    existingDependencies?: string[];
    targetGradleVersion?: string;
  };
}

/**
 * AI Analysis Response interface
 */
export interface AIAnalysisResponse {
  suggestions: AISuggestion[];
  summary: string;
  confidence: number;
  reasoning: string;
}

/**
 * Individual AI Suggestion
 */
export interface AISuggestion {
  id: string;
  type: 'plugin-upgrade' | 'dependency-update' | 'performance-improvement' | 'security-fix' | 'modernization';
  title: string;
  description: string;
  reasoning: string;
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  changes: {
    filePath: string;
    originalContent: string;
    suggestedContent: string;
    lineNumbers?: { start: number; end: number };
  }[];
  prerequisites?: string[];
  risks?: string[];
}

/**
 * AI Service for intelligent Gradle migration analysis
 */
export class AIService {
  private static instance: AIService;
  private feedback: UserFeedbackManager;
  private selectedModel: vscode.LanguageModelChat | null = null;

  private constructor() {
    this.feedback = UserFeedbackManager.getInstance();
  }

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  /**
   * Initialize AI service and select appropriate language model
   */
  public async initialize(): Promise<boolean> {
    try {
      // Check if Language Model API is available
      if (!vscode.lm || typeof vscode.lm.selectChatModels !== 'function') {
        await this.feedback.showMessage(
          'Language Model API not available in this VS Code version',
          'error' as any
        );
        return false;
      }

      // Select the best available chat model
      const models = await vscode.lm.selectChatModels({
        vendor: 'copilot',
        family: 'gpt-4'
      });

      if (models.length === 0) {
        // Fallback to any available model
        const fallbackModels = await vscode.lm.selectChatModels();
        if (fallbackModels.length === 0) {
          await this.feedback.showMessage(
            'No language models available. Please ensure GitHub Copilot is installed and active.',
            'error' as any
          );
          return false;
        }
        this.selectedModel = fallbackModels[0];
      } else {
        this.selectedModel = models[0];
      }

      await this.feedback.showMessage(
        `AI Service initialized with model: ${this.selectedModel.name}`,
        'success' as any
      );
      return true;
    } catch (error: any) {
      await handleError(error, ErrorType.COPILOT_INTEGRATION, {
        operation: 'initializeAIService'
      });
      return false;
    }
  }

  /**
   * Analyze Gradle build script with AI
   */
  public async analyzeGradleBuild(
    request: AIAnalysisRequest,
    token?: vscode.CancellationToken
  ): Promise<AIAnalysisResponse | null> {
    if (!this.selectedModel) {
      const initialized = await this.initialize();
      if (!initialized) {
        return null;
      }
    }

    try {
      const prompt = this.buildAnalysisPrompt(request);
      
      const chatRequest = new vscode.LanguageModelChatMessage(
        vscode.LanguageModelChatMessageRole.User,
        prompt
      );

      const response = await this.selectedModel!.sendRequest(
        [chatRequest],
        {
          justification: 'Analyzing Gradle build script for migration improvements'
        },
        token
      );

      let responseText = '';
      for await (const fragment of response.text) {
        responseText += fragment;
        
        // Check for cancellation
        if (token?.isCancellationRequested) {
          throw new Error('Analysis cancelled by user');
        }
      }

      return this.parseAIResponse(responseText, request);
    } catch (error: any) {
      await handleError(error, ErrorType.COPILOT_INTEGRATION, {
        operation: 'analyzeGradleBuild',
        filePath: request.filePath,
        analysisType: request.analysisType
      });
      return null;
    }
  }

  /**
   * Build analysis prompt for AI
   */
  private buildAnalysisPrompt(request: AIAnalysisRequest): string {
    const basePrompt = `You are an expert Gradle build engineer. Analyze the following Gradle build script and provide specific, actionable migration improvements.

File: ${request.filePath}
Analysis Type: ${request.analysisType}

Build Script Content:
\`\`\`gradle
${request.content}
\`\`\`

`;

    let contextPrompt = '';
    if (request.context) {
      if (request.context.projectStructure) {
        contextPrompt += `\nProject Structure:\n${request.context.projectStructure.join('\n')}\n`;
      }
      if (request.context.existingDependencies) {
        contextPrompt += `\nExisting Dependencies:\n${request.context.existingDependencies.join('\n')}\n`;
      }
      if (request.context.targetGradleVersion) {
        contextPrompt += `\nTarget Gradle Version: ${request.context.targetGradleVersion}\n`;
      }
    }

    const instructionPrompt = `
Please provide your analysis in the following JSON format:
{
  "summary": "Brief overview of the analysis",
  "confidence": 0.85,
  "reasoning": "Explanation of the analysis approach",
  "suggestions": [
    {
      "id": "unique-suggestion-id",
      "type": "plugin-upgrade|dependency-update|performance-improvement|security-fix|modernization",
      "title": "Brief title of the suggestion",
      "description": "Detailed description of what should be changed",
      "reasoning": "Why this change is recommended",
      "confidence": 0.9,
      "impact": "low|medium|high",
      "changes": [
        {
          "filePath": "${request.filePath}",
          "originalContent": "exact content to be replaced",
          "suggestedContent": "new content to replace with",
          "lineNumbers": { "start": 10, "end": 15 }
        }
      ],
      "prerequisites": ["Any prerequisites for this change"],
      "risks": ["Potential risks or considerations"]
    }
  ]
}

Focus on:
1. Deprecated plugins and dependencies
2. Performance optimizations
3. Modern Gradle features
4. Security improvements
5. Build script modernization

Provide specific, actionable suggestions with exact code changes.`;

    return basePrompt + contextPrompt + instructionPrompt;
  }

  /**
   * Parse AI response into structured format
   */
  private parseAIResponse(responseText: string, request: AIAnalysisRequest): AIAnalysisResponse {
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate and sanitize the response
      return {
        summary: parsed.summary || 'AI analysis completed',
        confidence: Math.min(Math.max(parsed.confidence || 0.5, 0), 1),
        reasoning: parsed.reasoning || 'Analysis performed using AI language model',
        suggestions: (parsed.suggestions || []).map((suggestion: any, index: number) => ({
          id: suggestion.id || `suggestion-${index}`,
          type: suggestion.type || 'modernization',
          title: suggestion.title || 'Improvement suggestion',
          description: suggestion.description || 'No description provided',
          reasoning: suggestion.reasoning || 'No reasoning provided',
          confidence: Math.min(Math.max(suggestion.confidence || 0.5, 0), 1),
          impact: ['low', 'medium', 'high'].includes(suggestion.impact) ? suggestion.impact : 'medium',
          changes: (suggestion.changes || []).map((change: any) => ({
            filePath: change.filePath || request.filePath,
            originalContent: change.originalContent || '',
            suggestedContent: change.suggestedContent || '',
            lineNumbers: change.lineNumbers
          })),
          prerequisites: suggestion.prerequisites || [],
          risks: suggestion.risks || []
        }))
      };
    } catch (error: any) {
      // Fallback response if parsing fails
      return {
        summary: 'AI analysis completed with parsing issues',
        confidence: 0.3,
        reasoning: `Failed to parse AI response: ${error.message}`,
        suggestions: [{
          id: 'fallback-suggestion',
          type: 'modernization',
          title: 'Manual Review Required',
          description: 'AI analysis completed but response could not be parsed. Manual review recommended.',
          reasoning: 'Response parsing failed',
          confidence: 0.3,
          impact: 'low',
          changes: [],
          prerequisites: ['Manual review of AI response'],
          risks: ['Unparsed AI suggestions may be missed']
        }]
      };
    }
  }

  /**
   * Get available analysis types
   */
  public getAvailableAnalysisTypes(): Array<{
    type: AIAnalysisRequest['analysisType'];
    name: string;
    description: string;
  }> {
    return [
      {
        type: 'gradle-migration',
        name: 'Gradle Migration',
        description: 'Comprehensive migration analysis for Gradle build scripts'
      },
      {
        type: 'dependency-analysis',
        name: 'Dependency Analysis',
        description: 'Analyze and suggest dependency updates and optimizations'
      },
      {
        type: 'performance-optimization',
        name: 'Performance Optimization',
        description: 'Identify build performance improvements'
      },
      {
        type: 'security-scan',
        name: 'Security Scan',
        description: 'Detect security vulnerabilities in dependencies and configurations'
      }
    ];
  }

  /**
   * Check if AI service is ready
   */
  public isReady(): boolean {
    return this.selectedModel !== null;
  }

  /**
   * Get current model information
   */
  public getModelInfo(): { name: string; vendor: string; family: string } | null {
    if (!this.selectedModel) {
      return null;
    }
    return {
      name: this.selectedModel.name,
      vendor: this.selectedModel.vendor,
      family: this.selectedModel.family
    };
  }
}

// Export singleton instance
export const aiService = AIService.getInstance();
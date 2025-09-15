import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface UserDecision {
  suggestionId: string;
  suggestionType: string;
  category: string;
  action: 'accepted' | 'rejected' | 'modified';
  timestamp: Date;
  reasoning?: string;
  projectContext?: {
    type: string;
    size: string;
    technologies: string[];
  };
}

export interface UserPreference {
  category: string;
  preference: string;
  confidence: number;
  lastUpdated: Date;
  sampleSize: number;
}

export interface ExplanationRequest {
  suggestionId: string;
  suggestionType: string;
  userQuestion?: string;
  context: {
    projectPath: string;
    currentFile?: string;
    relatedFiles?: string[];
  };
}

export interface ExplanationResponse {
  explanation: string;
  benefits: string[];
  risks: string[];
  alternatives: string[];
  examples?: {
    before: string;
    after: string;
    description: string;
  }[];
  learnMoreLinks?: {
    title: string;
    url: string;
  }[];
}

export interface LearningInsight {
  pattern: string;
  description: string;
  confidence: number;
  recommendations: string[];
}

export class UserPreferenceEngine {
  private static instance: UserPreferenceEngine;
  private decisions: UserDecision[] = [];
  private preferences: Map<string, UserPreference> = new Map();
  private storageUri: vscode.Uri;
  private aiService: any; // Will be injected

  private constructor(context: vscode.ExtensionContext) {
    this.storageUri = vscode.Uri.joinPath(context.globalStorageUri, 'user-preferences.json');
    this.loadPreferences();
  }

  static getInstance(context?: vscode.ExtensionContext): UserPreferenceEngine {
    if (!UserPreferenceEngine.instance && context) {
      UserPreferenceEngine.instance = new UserPreferenceEngine(context);
    }
    return UserPreferenceEngine.instance;
  }

  setAIService(aiService: any): void {
    this.aiService = aiService;
  }

  async recordUserDecision(decision: UserDecision): Promise<void> {
    this.decisions.push(decision);
    await this.updatePreferences(decision);
    await this.savePreferences();
    
    console.log(`Recorded user decision: ${decision.action} for ${decision.suggestionType}`);
  }

  async getPersonalizedSuggestions(
    baseSuggestions: any[],
    projectContext: any
  ): Promise<any[]> {
    const personalizedSuggestions = baseSuggestions.map(suggestion => {
      const preference = this.getPreferenceForCategory(suggestion.category);
      const personalizedPriority = this.calculatePersonalizedPriority(
        suggestion,
        preference,
        projectContext
      );
      
      return {
        ...suggestion,
        originalPriority: suggestion.priority,
        personalizedPriority,
        userPreferenceScore: preference?.confidence || 0,
        explanation: this.enhanceExplanationWithPreferences(suggestion, preference)
      };
    });

    // Sort by personalized priority
    return personalizedSuggestions.sort((a, b) => {
      const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
      const aPriority = priorityOrder[a.personalizedPriority as keyof typeof priorityOrder] || 0;
      const bPriority = priorityOrder[b.personalizedPriority as keyof typeof priorityOrder] || 0;
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      
      // Secondary sort by user preference score
      return b.userPreferenceScore - a.userPreferenceScore;
    });
  }

  async explainRecommendation(request: ExplanationRequest): Promise<ExplanationResponse> {
    const baseExplanation = await this.generateBaseExplanation(request);
    const personalizedExplanation = this.addPersonalizedContext(baseExplanation, request);
    
    return personalizedExplanation;
  }

  async generateLearningInsights(): Promise<LearningInsight[]> {
    const insights: LearningInsight[] = [];
    
    // Analyze decision patterns
    const categoryPatterns = this.analyzeCategoryPatterns();
    const timePatterns = this.analyzeTimePatterns();
    const contextPatterns = this.analyzeContextPatterns();
    
    insights.push(...categoryPatterns);
    insights.push(...timePatterns);
    insights.push(...contextPatterns);
    
    return insights.sort((a, b) => b.confidence - a.confidence);
  }

  getPreferenceForCategory(category: string): UserPreference | undefined {
    return this.preferences.get(category);
  }

  getUserDecisionHistory(category?: string): UserDecision[] {
    if (category) {
      return this.decisions.filter(d => d.category === category);
    }
    return [...this.decisions];
  }

  async resetPreferences(): Promise<void> {
    this.decisions = [];
    this.preferences.clear();
    await this.savePreferences();
    
    vscode.window.showInformationMessage('User preferences have been reset.');
  }

  async exportPreferences(): Promise<string> {
    const exportData = {
      decisions: this.decisions,
      preferences: Array.from(this.preferences.entries()),
      exportDate: new Date().toISOString(),
      version: '1.0'
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  async importPreferences(data: string): Promise<void> {
    try {
      const importData = JSON.parse(data);
      
      if (importData.decisions && Array.isArray(importData.decisions)) {
        this.decisions = importData.decisions.map((d: any) => ({
          ...d,
          timestamp: new Date(d.timestamp)
        }));
      }
      
      if (importData.preferences && Array.isArray(importData.preferences)) {
        this.preferences = new Map(importData.preferences.map(([key, value]: [string, any]) => [
          key,
          {
            ...value,
            lastUpdated: new Date(value.lastUpdated)
          }
        ]));
      }
      
      await this.savePreferences();
      vscode.window.showInformationMessage('User preferences imported successfully.');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to import preferences: ${error}`);
    }
  }

  private async updatePreferences(decision: UserDecision): Promise<void> {
    const category = decision.category;
    const existing = this.preferences.get(category);
    
    if (existing) {
      // Update existing preference
      const newSampleSize = existing.sampleSize + 1;
      const weight = decision.action === 'accepted' ? 1 : -0.5;
      const newConfidence = this.calculateUpdatedConfidence(
        existing.confidence,
        existing.sampleSize,
        weight
      );
      
      this.preferences.set(category, {
        category,
        preference: newConfidence > 0.5 ? 'positive' : 'negative',
        confidence: Math.max(0, Math.min(1, newConfidence)),
        lastUpdated: new Date(),
        sampleSize: newSampleSize
      });
    } else {
      // Create new preference
      const initialConfidence = decision.action === 'accepted' ? 0.7 : 0.3;
      
      this.preferences.set(category, {
        category,
        preference: decision.action === 'accepted' ? 'positive' : 'negative',
        confidence: initialConfidence,
        lastUpdated: new Date(),
        sampleSize: 1
      });
    }
  }

  private calculateUpdatedConfidence(
    currentConfidence: number,
    sampleSize: number,
    newWeight: number
  ): number {
    // Use exponential moving average with sample size consideration
    const alpha = Math.min(0.3, 2 / (sampleSize + 1));
    const adjustment = newWeight * alpha;
    
    return currentConfidence + adjustment;
  }

  private calculatePersonalizedPriority(
    suggestion: any,
    preference: UserPreference | undefined,
    projectContext: any
  ): string {
    if (!preference) {
      return suggestion.priority;
    }
    
    const basePriority = suggestion.priority;
    const preferenceScore = preference.confidence;
    const isPositivePreference = preference.preference === 'positive';
    
    // Adjust priority based on user preference
    if (isPositivePreference && preferenceScore > 0.7) {
      // User likes this category - boost priority
      if (basePriority === 'low') return 'medium';
      if (basePriority === 'medium') return 'high';
      return basePriority;
    } else if (!isPositivePreference && preferenceScore > 0.7) {
      // User dislikes this category - lower priority
      if (basePriority === 'high') return 'medium';
      if (basePriority === 'medium') return 'low';
      return basePriority;
    }
    
    return basePriority;
  }

  private enhanceExplanationWithPreferences(
    suggestion: any,
    preference: UserPreference | undefined
  ): string {
    let explanation = suggestion.explanation || suggestion.description;
    
    if (preference && preference.confidence > 0.6) {
      if (preference.preference === 'positive') {
        explanation += ` Based on your previous choices, you tend to prefer ${preference.category} improvements.`;
      } else {
        explanation += ` Note: You've previously been less interested in ${preference.category} changes. Consider if this aligns with your current goals.`;
      }
    }
    
    return explanation;
  }

  private async generateBaseExplanation(request: ExplanationRequest): Promise<ExplanationResponse> {
    // Use AI service if available, otherwise provide basic explanation
    if (this.aiService && this.aiService.isInitialized()) {
      try {
        const prompt = this.buildExplanationPrompt(request);
        const aiResponse = await this.aiService.generateExplanation(prompt);
        return this.parseAIExplanation(aiResponse);
      } catch (error) {
        console.warn('AI explanation failed, using fallback:', error);
      }
    }
    
    return this.getFallbackExplanation(request);
  }

  private buildExplanationPrompt(request: ExplanationRequest): string {
    return `
Explain the following Gradle migration recommendation:

Suggestion Type: ${request.suggestionType}
Project Context: ${request.context.projectPath}
User Question: ${request.userQuestion || 'General explanation'}

Please provide:
1. Clear explanation of what this recommendation does
2. Benefits of implementing this change
3. Potential risks or considerations
4. Alternative approaches
5. Code examples if applicable

Format the response as JSON with the following structure:
{
  "explanation": "...",
  "benefits": [...],
  "risks": [...],
  "alternatives": [...],
  "examples": [{ "before": "...", "after": "...", "description": "..." }]
}
    `;
  }

  private parseAIExplanation(aiResponse: string): ExplanationResponse {
    try {
      const parsed = JSON.parse(aiResponse);
      return {
        explanation: parsed.explanation || 'AI-generated explanation',
        benefits: parsed.benefits || [],
        risks: parsed.risks || [],
        alternatives: parsed.alternatives || [],
        examples: parsed.examples || [],
        learnMoreLinks: this.getRelevantLinks(parsed.suggestionType)
      };
    } catch (error) {
      return {
        explanation: aiResponse,
        benefits: [],
        risks: [],
        alternatives: [],
        examples: []
      };
    }
  }

  private getFallbackExplanation(request: ExplanationRequest): ExplanationResponse {
    const explanations: Record<string, ExplanationResponse> = {
      'gradle-version-update': {
        explanation: 'Updating Gradle version provides access to latest features, performance improvements, and security fixes.',
        benefits: [
          'Improved build performance',
          'Access to new features and APIs',
          'Better IDE integration',
          'Security updates'
        ],
        risks: [
          'Potential compatibility issues with plugins',
          'Need to update build scripts for deprecated features',
          'Requires testing to ensure builds still work'
        ],
        alternatives: [
          'Update incrementally through minor versions',
          'Test in a separate branch first',
          'Update only wrapper initially'
        ],
        examples: [{
          before: 'distributionUrl=https\\://services.gradle.org/distributions/gradle-6.8-bin.zip',
          after: 'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.0-bin.zip',
          description: 'Update Gradle wrapper to version 8.0'
        }]
      },
      'dependency-update': {
        explanation: 'Updating dependencies ensures you have the latest bug fixes, security patches, and features.',
        benefits: [
          'Security vulnerability fixes',
          'Bug fixes and stability improvements',
          'New features and APIs',
          'Better performance'
        ],
        risks: [
          'Breaking API changes',
          'New bugs in updated versions',
          'Increased build size',
          'Compatibility issues with other dependencies'
        ],
        alternatives: [
          'Update one dependency at a time',
          'Use dependency management platforms',
          'Pin to specific versions for stability'
        ],
        examples: []
      }
    };
    
    return explanations[request.suggestionType] || {
      explanation: 'This recommendation helps improve your Gradle build configuration.',
      benefits: ['Improved build quality'],
      risks: ['May require testing'],
      alternatives: ['Manual implementation'],
      examples: []
    };
  }

  private getRelevantLinks(suggestionType: string): { title: string; url: string; }[] {
    const linkMap: Record<string, { title: string; url: string; }[]> = {
      'gradle-version-update': [
        { title: 'Gradle Release Notes', url: 'https://gradle.org/releases/' },
        { title: 'Gradle Upgrade Guide', url: 'https://docs.gradle.org/current/userguide/upgrading_version_8.html' }
      ],
      'dependency-update': [
        { title: 'Gradle Dependency Management', url: 'https://docs.gradle.org/current/userguide/dependency_management.html' },
        { title: 'Maven Central Repository', url: 'https://search.maven.org/' }
      ]
    };
    
    return linkMap[suggestionType] || [];
  }

  private addPersonalizedContext(
    baseExplanation: ExplanationResponse,
    request: ExplanationRequest
  ): ExplanationResponse {
    const categoryDecisions = this.getUserDecisionHistory(request.suggestionType);
    
    if (categoryDecisions.length > 0) {
      const acceptanceRate = categoryDecisions.filter(d => d.action === 'accepted').length / categoryDecisions.length;
      
      let personalNote = '';
      if (acceptanceRate > 0.7) {
        personalNote = 'Based on your history, you typically accept similar recommendations.';
      } else if (acceptanceRate < 0.3) {
        personalNote = 'You\'ve previously been cautious with similar recommendations. Consider your specific needs.';
      }
      
      if (personalNote) {
        baseExplanation.explanation += `\n\n${personalNote}`;
      }
    }
    
    return baseExplanation;
  }

  private analyzeCategoryPatterns(): LearningInsight[] {
    const insights: LearningInsight[] = [];
    const categoryStats = new Map<string, { accepted: number; total: number }>();
    
    this.decisions.forEach(decision => {
      const stats = categoryStats.get(decision.category) || { accepted: 0, total: 0 };
      stats.total++;
      if (decision.action === 'accepted') {
        stats.accepted++;
      }
      categoryStats.set(decision.category, stats);
    });
    
    categoryStats.forEach((stats, category) => {
      if (stats.total >= 3) { // Only analyze categories with sufficient data
        const acceptanceRate = stats.accepted / stats.total;
        const confidence = Math.min(0.9, stats.total / 10); // Confidence increases with sample size
        
        if (acceptanceRate > 0.8) {
          insights.push({
            pattern: `High acceptance for ${category}`,
            description: `You consistently accept ${category} recommendations (${Math.round(acceptanceRate * 100)}% acceptance rate)`,
            confidence,
            recommendations: [
              `Prioritize ${category} suggestions in future analyses`,
              `Consider enabling auto-apply for low-risk ${category} changes`
            ]
          });
        } else if (acceptanceRate < 0.2) {
          insights.push({
            pattern: `Low acceptance for ${category}`,
            description: `You rarely accept ${category} recommendations (${Math.round(acceptanceRate * 100)}% acceptance rate)`,
            confidence,
            recommendations: [
              `Reduce priority for ${category} suggestions`,
              `Provide more detailed explanations for ${category} changes`,
              `Consider if ${category} aligns with your project goals`
            ]
          });
        }
      }
    });
    
    return insights;
  }

  private analyzeTimePatterns(): LearningInsight[] {
    const insights: LearningInsight[] = [];
    
    if (this.decisions.length < 10) {
      return insights; // Need more data for time analysis
    }
    
    // Analyze recent vs older decisions
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const recentDecisions = this.decisions.filter(d => d.timestamp > thirtyDaysAgo);
    const olderDecisions = this.decisions.filter(d => d.timestamp <= thirtyDaysAgo);
    
    if (recentDecisions.length >= 5 && olderDecisions.length >= 5) {
      const recentAcceptanceRate = recentDecisions.filter(d => d.action === 'accepted').length / recentDecisions.length;
      const olderAcceptanceRate = olderDecisions.filter(d => d.action === 'accepted').length / olderDecisions.length;
      
      const difference = recentAcceptanceRate - olderAcceptanceRate;
      
      if (Math.abs(difference) > 0.2) {
        insights.push({
          pattern: difference > 0 ? 'Increasing acceptance' : 'Decreasing acceptance',
          description: `Your acceptance rate has ${difference > 0 ? 'increased' : 'decreased'} by ${Math.round(Math.abs(difference) * 100)}% in the last 30 days`,
          confidence: 0.7,
          recommendations: [
            difference > 0 
              ? 'Continue with current recommendation approach'
              : 'Review recent suggestions to understand changing preferences'
          ]
        });
      }
    }
    
    return insights;
  }

  private analyzeContextPatterns(): LearningInsight[] {
    const insights: LearningInsight[] = [];
    
    // Analyze project type preferences
    const projectTypeStats = new Map<string, { accepted: number; total: number }>();
    
    this.decisions.forEach(decision => {
      if (decision.projectContext?.type) {
        const type = decision.projectContext.type;
        const stats = projectTypeStats.get(type) || { accepted: 0, total: 0 };
        stats.total++;
        if (decision.action === 'accepted') {
          stats.accepted++;
        }
        projectTypeStats.set(type, stats);
      }
    });
    
    projectTypeStats.forEach((stats, projectType) => {
      if (stats.total >= 3) {
        const acceptanceRate = stats.accepted / stats.total;
        
        if (acceptanceRate > 0.8 || acceptanceRate < 0.2) {
          insights.push({
            pattern: `${projectType} project preferences`,
            description: `You ${acceptanceRate > 0.8 ? 'frequently accept' : 'rarely accept'} recommendations for ${projectType} projects`,
            confidence: Math.min(0.8, stats.total / 8),
            recommendations: [
              `Tailor suggestions specifically for ${projectType} projects`,
              `Consider project type when prioritizing recommendations`
            ]
          });
        }
      }
    });
    
    return insights;
  }

  private async loadPreferences(): Promise<void> {
    try {
      const data = await fs.readFile(this.storageUri.fsPath, 'utf8');
      const parsed = JSON.parse(data);
      
      if (parsed.decisions) {
        this.decisions = parsed.decisions.map((d: any) => ({
          ...d,
          timestamp: new Date(d.timestamp)
        }));
      }
      
      if (parsed.preferences) {
        this.preferences = new Map(parsed.preferences.map(([key, value]: [string, any]) => [
          key,
          {
            ...value,
            lastUpdated: new Date(value.lastUpdated)
          }
        ]));
      }
    } catch (error) {
      // File doesn't exist or is corrupted - start fresh
      console.log('No existing preferences found, starting fresh');
    }
  }

  private async savePreferences(): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(this.storageUri.fsPath));
      
      const data = {
        decisions: this.decisions,
        preferences: Array.from(this.preferences.entries()),
        lastSaved: new Date().toISOString()
      };
      
      await fs.writeFile(this.storageUri.fsPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save user preferences:', error);
    }
  }
}
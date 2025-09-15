import * as vscode from 'vscode';
import { ContextualSuggestion, ConflictResolution, ContextSuggestionEngine } from './contextSuggestionEngine';
import { AIService } from './aiService';
import { feedback } from '../utils/userFeedback';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface UserPreference {
  category: string;
  preference: 'accept' | 'reject' | 'neutral';
  reasoning?: string;
  timestamp: Date;
  suggestionId: string;
}

export interface WorkflowSession {
  id: string;
  projectPath: string;
  suggestions: ContextualSuggestion[];
  userDecisions: Map<string, UserDecision>;
  preferences: UserPreference[];
  startTime: Date;
  endTime?: Date;
  status: 'active' | 'completed' | 'cancelled';
}

export interface UserDecision {
  suggestionId: string;
  action: 'accept' | 'reject' | 'modify' | 'defer';
  reasoning?: string;
  modifications?: string[];
  timestamp: Date;
  confidence: number;
}

export interface SuggestionPresentation {
  suggestion: ContextualSuggestion;
  explanation: string;
  codePreview: string;
  impactAnalysis: string;
  userOptions: UserOption[];
}

export interface UserOption {
  id: string;
  label: string;
  description: string;
  action: () => Promise<void>;
  icon?: string;
}

export interface LearningData {
  patterns: Map<string, number>;
  categoryPreferences: Map<string, number>;
  rejectionReasons: Map<string, number>;
  contextFactors: Map<string, number>;
}

export class InteractiveWorkflow {
  private aiService: AIService;
  private contextEngine: ContextSuggestionEngine;
  private currentSession: WorkflowSession | null = null;
  private learningData: LearningData;
  private preferencesFile: string;

  constructor() {
    this.aiService = AIService.getInstance();
    this.contextEngine = new ContextSuggestionEngine();
    this.learningData = {
      patterns: new Map(),
      categoryPreferences: new Map(),
      rejectionReasons: new Map(),
      contextFactors: new Map()
    };
    this.preferencesFile = path.join(process.env.HOME || process.env.USERPROFILE || '', '.gradle-migrator-preferences.json');
    this.loadUserPreferences();
  }

  async startInteractiveSession(projectPath: string): Promise<WorkflowSession> {
    feedback.info('Starting interactive AI workflow session...');

    try {
      // Generate contextual suggestions
      const suggestions = await this.contextEngine.generateContextualSuggestions(projectPath);
      
      // Apply user preferences to filter/prioritize suggestions
      const filteredSuggestions = this.applyUserPreferences(suggestions);

      // Create new session
      this.currentSession = {
        id: this.generateSessionId(),
        projectPath,
        suggestions: filteredSuggestions,
        userDecisions: new Map(),
        preferences: [],
        startTime: new Date(),
        status: 'active'
      };

      feedback.info(`Session started with ${filteredSuggestions.length} suggestions`);
      return this.currentSession;
    } catch (error: any) {
      feedback.error(`Failed to start interactive session: ${error.message}`);
      throw error;
    }
  }

  async presentSuggestion(suggestionId: string): Promise<SuggestionPresentation> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    const suggestion = this.currentSession.suggestions.find(s => s.id === suggestionId);
    if (!suggestion) {
      throw new Error(`Suggestion ${suggestionId} not found`);
    }

    // Generate detailed explanation using AI
    const explanation = await this.generateExplanation(suggestion);
    
    // Create code preview
    const codePreview = this.generateCodePreview(suggestion);
    
    // Analyze impact
    const impactAnalysis = await this.analyzeImpact(suggestion);
    
    // Create user options
    const userOptions = this.createUserOptions(suggestion);

    return {
      suggestion,
      explanation,
      codePreview,
      impactAnalysis,
      userOptions
    };
  }

  async handleUserDecision(suggestionId: string, decision: UserDecision): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    // Record decision
    this.currentSession.userDecisions.set(suggestionId, decision);
    
    // Update learning data
    await this.updateLearningData(suggestionId, decision);
    
    // Execute action if accepted
    if (decision.action === 'accept') {
      await this.executeSuggestion(suggestionId, decision.modifications);
    }
    
    // Save preferences
    await this.saveUserPreferences();
    
    feedback.info(`Decision recorded for suggestion: ${decision.action}`);
  }

  async showSuggestionDialog(suggestion: ContextualSuggestion): Promise<UserDecision | null> {
    const presentation = await this.presentSuggestion(suggestion.id);
    
    // Create VS Code QuickPick for suggestion presentation
    const quickPick = vscode.window.createQuickPick();
    quickPick.title = `AI Suggestion: ${suggestion.title}`;
    quickPick.placeholder = 'Choose an action for this suggestion';
    
    const items = [
      {
        label: '$(check) Accept',
        description: 'Apply this suggestion',
        detail: `Estimated effort: ${suggestion.implementation.estimatedEffort}`,
        action: 'accept'
      },
      {
        label: '$(x) Reject',
        description: 'Decline this suggestion',
        detail: 'This suggestion will not be applied',
        action: 'reject'
      },
      {
        label: '$(edit) Modify',
        description: 'Customize this suggestion',
        detail: 'Make changes before applying',
        action: 'modify'
      },
      {
        label: '$(clock) Defer',
        description: 'Review later',
        detail: 'Keep this suggestion for later review',
        action: 'defer'
      },
      {
        label: '$(info) Show Details',
        description: 'View detailed explanation',
        detail: 'See full analysis and code changes',
        action: 'details'
      }
    ];
    
    quickPick.items = items;
    
    return new Promise((resolve) => {
      quickPick.onDidChangeSelection(async (selection) => {
        if (selection.length > 0) {
          const selectedItem = selection[0] as any;
          
          if (selectedItem.action === 'details') {
            await this.showDetailedView(presentation);
            return; // Don't resolve, keep dialog open
          }
          
          let reasoning: string | undefined;
          let modifications: string[] | undefined;
          
          if (selectedItem.action === 'reject') {
            reasoning = await this.askForRejectionReason();
          } else if (selectedItem.action === 'modify') {
            modifications = await this.askForModifications(suggestion);
          }
          
          const decision: UserDecision = {
            suggestionId: suggestion.id,
            action: selectedItem.action,
            reasoning,
            modifications,
            timestamp: new Date(),
            confidence: 1.0
          };
          
          quickPick.dispose();
          resolve(decision);
        }
      });
      
      quickPick.onDidHide(() => {
        quickPick.dispose();
        resolve(null);
      });
      
      quickPick.show();
    });
  }

  async processAllSuggestions(): Promise<Map<string, UserDecision>> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    const decisions = new Map<string, UserDecision>();
    
    for (const suggestion of this.currentSession.suggestions) {
      // Check if user has already decided on this suggestion
      if (this.currentSession.userDecisions.has(suggestion.id)) {
        continue;
      }
      
      // Present suggestion to user
      const decision = await this.showSuggestionDialog(suggestion);
      
      if (decision) {
        await this.handleUserDecision(suggestion.id, decision);
        decisions.set(suggestion.id, decision);
      }
    }
    
    return decisions;
  }

  async generateBatchSummary(): Promise<string> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    const decisions = Array.from(this.currentSession.userDecisions.values());
    const accepted = decisions.filter(d => d.action === 'accept').length;
    const rejected = decisions.filter(d => d.action === 'reject').length;
    const modified = decisions.filter(d => d.action === 'modify').length;
    const deferred = decisions.filter(d => d.action === 'defer').length;
    
    const summary = `
## Migration Session Summary

**Total Suggestions:** ${this.currentSession.suggestions.length}
**Accepted:** ${accepted}
**Rejected:** ${rejected}
**Modified:** ${modified}
**Deferred:** ${deferred}

### Applied Changes:
${this.generateAppliedChangesSummary()}

### Learning Insights:
${this.generateLearningInsights()}
    `;
    
    return summary;
  }

  async completeSession(): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    this.currentSession.endTime = new Date();
    this.currentSession.status = 'completed';
    
    // Generate and show summary
    const summary = await this.generateBatchSummary();
    
    // Show summary in new document
    const doc = await vscode.workspace.openTextDocument({
      content: summary,
      language: 'markdown'
    });
    await vscode.window.showTextDocument(doc);
    
    // Save session data for future learning
    await this.saveSessionData();
    
    feedback.info('Interactive session completed successfully');
    this.currentSession = null;
  }

  private async generateExplanation(suggestion: ContextualSuggestion): Promise<string> {
    try {
      const prompt = `
Explain this Gradle migration suggestion in detail:

Title: ${suggestion.title}
Description: ${suggestion.description}
Reasoning: ${suggestion.reasoning}
Category: ${suggestion.category}
Priority: ${suggestion.priority}

Provide:
1. Why this change is recommended
2. How it improves the build
3. Potential risks and mitigation strategies
4. Step-by-step implementation guide

Make the explanation clear and actionable for developers.
      `;
      
      const response = await this.aiService.analyzeGradleBuild({
        content: prompt,
        filePath: '',
        analysisType: 'gradle-migration',
        context: {}
      });
      return response?.suggestions[0]?.description || 'No detailed explanation available.';
    } catch (error) {
      return `Detailed explanation: ${suggestion.reasoning}\n\nBenefits: ${suggestion.benefits.join(', ')}\n\nRisks: ${suggestion.risks.join(', ')}`;
    }
  }

  private generateCodePreview(suggestion: ContextualSuggestion): string {
    if (suggestion.implementation.codeChanges.length === 0) {
      return 'No code changes required.';
    }
    
    let preview = '';
    for (const change of suggestion.implementation.codeChanges) {
      preview += `\n**File:** ${change.file}\n`;
      preview += `**Change:** ${change.change}\n`;
      
      if (change.before) {
        preview += `\n\`\`\`gradle\n// Before:\n${change.before}\n\`\`\`\n`;
      }
      
      if (change.after) {
        preview += `\n\`\`\`gradle\n// After:\n${change.after}\n\`\`\`\n`;
      }
      
      preview += '\n---\n';
    }
    
    return preview;
  }

  private async analyzeImpact(suggestion: ContextualSuggestion): Promise<string> {
    const impact = `
**Benefits:**
${suggestion.benefits.map(b => `• ${b}`).join('\n')}

**Risks:**
${suggestion.risks.map(r => `• ${r}`).join('\n')}

**Effort:** ${suggestion.implementation.estimatedEffort}
**Applicable Modules:** ${suggestion.applicableModules.join(', ') || 'All'}
**Prerequisites:** ${suggestion.prerequisites.join(', ') || 'None'}
    `;
    
    return impact;
  }

  private createUserOptions(suggestion: ContextualSuggestion): UserOption[] {
    return [
      {
        id: 'accept',
        label: 'Accept',
        description: 'Apply this suggestion as-is',
        action: async () => {
          await this.executeSuggestion(suggestion.id);
        },
        icon: 'check'
      },
      {
        id: 'reject',
        label: 'Reject',
        description: 'Decline this suggestion',
        action: async () => {
          // No action needed for rejection
        },
        icon: 'x'
      },
      {
        id: 'modify',
        label: 'Modify',
        description: 'Customize before applying',
        action: async () => {
          const modifications = await this.askForModifications(suggestion);
          await this.executeSuggestion(suggestion.id, modifications);
        },
        icon: 'edit'
      }
    ];
  }

  private async executeSuggestion(suggestionId: string, modifications?: string[]): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    const suggestion = this.currentSession.suggestions.find(s => s.id === suggestionId);
    if (!suggestion) {
      throw new Error(`Suggestion ${suggestionId} not found`);
    }

    try {
      // Apply code changes
      for (const change of suggestion.implementation.codeChanges) {
        await this.applyCodeChange(change, modifications);
      }
      
      feedback.info(`Applied suggestion: ${suggestion.title}`);
    } catch (error: any) {
      feedback.error(`Failed to apply suggestion: ${error.message}`);
      throw error;
    }
  }

  private async applyCodeChange(change: any, modifications?: string[]): Promise<void> {
    const filePath = path.resolve(this.currentSession!.projectPath, change.file);
    
    try {
      if (await fs.pathExists(filePath)) {
        let content = await fs.readFile(filePath, 'utf8');
        
        // Apply modifications if provided
        let newContent = modifications && modifications.length > 0 
          ? modifications.join('\n') 
          : change.after;
        
        if (change.before) {
          content = content.replace(change.before, newContent);
        } else {
          content += '\n' + newContent;
        }
        
        await fs.writeFile(filePath, content, 'utf8');
      } else {
        // Create new file
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, change.after, 'utf8');
      }
    } catch (error: any) {
      throw new Error(`Failed to apply change to ${change.file}: ${error.message}`);
    }
  }

  private async showDetailedView(presentation: SuggestionPresentation): Promise<void> {
    const content = `
# ${presentation.suggestion.title}

## Description
${presentation.suggestion.description}

## Explanation
${presentation.explanation}

## Code Preview
${presentation.codePreview}

## Impact Analysis
${presentation.impactAnalysis}

## Implementation Steps
${presentation.suggestion.implementation.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}
    `;
    
    const doc = await vscode.workspace.openTextDocument({
      content,
      language: 'markdown'
    });
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  }

  private async askForRejectionReason(): Promise<string | undefined> {
    const reasons = [
      'Not applicable to this project',
      'Too risky for current timeline',
      'Conflicts with existing architecture',
      'Requires too much effort',
      'Already implemented differently',
      'Other (specify)'
    ];
    
    const selected = await vscode.window.showQuickPick(reasons, {
      placeHolder: 'Why are you rejecting this suggestion?'
    });
    
    if (selected === 'Other (specify)') {
      return await vscode.window.showInputBox({
        prompt: 'Please specify the reason for rejection'
      });
    }
    
    return selected;
  }

  private async askForModifications(suggestion: ContextualSuggestion): Promise<string[] | undefined> {
    const modifications: string[] = [];
    
    for (const change of suggestion.implementation.codeChanges) {
      const modified = await vscode.window.showInputBox({
        prompt: `Modify code change for ${change.file}`,
        value: change.after,
        placeHolder: 'Enter your modified code'
      });
      
      if (modified) {
        modifications.push(modified);
      }
    }
    
    return modifications.length > 0 ? modifications : undefined;
  }

  private async updateLearningData(suggestionId: string, decision: UserDecision): Promise<void> {
    const suggestion = this.currentSession!.suggestions.find(s => s.id === suggestionId);
    if (!suggestion) return;
    
    // Update category preferences
    const currentPref = this.learningData.categoryPreferences.get(suggestion.category) || 0;
    const adjustment = decision.action === 'accept' ? 1 : (decision.action === 'reject' ? -1 : 0);
    this.learningData.categoryPreferences.set(suggestion.category, currentPref + adjustment);
    
    // Update rejection reasons
    if (decision.action === 'reject' && decision.reasoning) {
      const currentCount = this.learningData.rejectionReasons.get(decision.reasoning) || 0;
      this.learningData.rejectionReasons.set(decision.reasoning, currentCount + 1);
    }
    
    // Update patterns
    const pattern = `${suggestion.category}-${suggestion.priority}`;
    const currentPattern = this.learningData.patterns.get(pattern) || 0;
    this.learningData.patterns.set(pattern, currentPattern + (decision.action === 'accept' ? 1 : 0));
  }

  private applyUserPreferences(suggestions: ContextualSuggestion[]): ContextualSuggestion[] {
    return suggestions.filter(suggestion => {
      // Filter based on learned preferences
      const categoryPref = this.learningData.categoryPreferences.get(suggestion.category) || 0;
      
      // If user consistently rejects this category, lower its priority or filter out
      if (categoryPref < -3) {
        return false; // Skip suggestions from heavily rejected categories
      }
      
      return true;
    }).sort((a, b) => {
      // Sort based on user preferences
      const aPref = this.learningData.categoryPreferences.get(a.category) || 0;
      const bPref = this.learningData.categoryPreferences.get(b.category) || 0;
      
      return bPref - aPref; // Higher preference first
    });
  }

  private generateAppliedChangesSummary(): string {
    if (!this.currentSession) return 'No changes applied.';
    
    const acceptedDecisions = Array.from(this.currentSession.userDecisions.values())
      .filter(d => d.action === 'accept');
    
    if (acceptedDecisions.length === 0) {
      return 'No changes were applied.';
    }
    
    let summary = '';
    for (const decision of acceptedDecisions) {
      const suggestion = this.currentSession.suggestions.find(s => s.id === decision.suggestionId);
      if (suggestion) {
        summary += `• ${suggestion.title}\n`;
      }
    }
    
    return summary;
  }

  private generateLearningInsights(): string {
    const insights: string[] = [];
    
    // Analyze category preferences
    const topCategories = Array.from(this.learningData.categoryPreferences.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3);
    
    if (topCategories.length > 0) {
      insights.push(`You tend to prefer ${topCategories.map(([cat]) => cat).join(', ')} suggestions.`);
    }
    
    // Analyze rejection patterns
    const topRejections = Array.from(this.learningData.rejectionReasons.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 2);
    
    if (topRejections.length > 0) {
      insights.push(`Common rejection reasons: ${topRejections.map(([reason]) => reason).join(', ')}.`);
    }
    
    return insights.join('\n') || 'Building preference profile...';
  }

  private async loadUserPreferences(): Promise<void> {
    try {
      if (await fs.pathExists(this.preferencesFile)) {
        const data = await fs.readJson(this.preferencesFile);
        
        // Restore learning data
        if (data.learningData) {
          this.learningData.categoryPreferences = new Map(data.learningData.categoryPreferences || []);
          this.learningData.rejectionReasons = new Map(data.learningData.rejectionReasons || []);
          this.learningData.patterns = new Map(data.learningData.patterns || []);
          this.learningData.contextFactors = new Map(data.learningData.contextFactors || []);
        }
      }
    } catch (error) {
      // Ignore errors, start with empty preferences
    }
  }

  private async saveUserPreferences(): Promise<void> {
    try {
      const data = {
        learningData: {
          categoryPreferences: Array.from(this.learningData.categoryPreferences.entries()),
          rejectionReasons: Array.from(this.learningData.rejectionReasons.entries()),
          patterns: Array.from(this.learningData.patterns.entries()),
          contextFactors: Array.from(this.learningData.contextFactors.entries())
        },
        lastUpdated: new Date().toISOString()
      };
      
      await fs.writeJson(this.preferencesFile, data, { spaces: 2 });
    } catch (error) {
      // Ignore save errors
    }
  }

  private async saveSessionData(): Promise<void> {
    if (!this.currentSession) return;
    
    const sessionFile = path.join(
      this.currentSession.projectPath,
      '.gradle-migrator-session.json'
    );
    
    try {
      const sessionData = {
        id: this.currentSession.id,
        startTime: this.currentSession.startTime,
        endTime: this.currentSession.endTime,
        decisions: Array.from(this.currentSession.userDecisions.entries()),
        suggestionCount: this.currentSession.suggestions.length,
        status: this.currentSession.status
      };
      
      await fs.writeJson(sessionFile, sessionData, { spaces: 2 });
    } catch (error) {
      // Ignore save errors
    }
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const interactiveWorkflow = new InteractiveWorkflow();
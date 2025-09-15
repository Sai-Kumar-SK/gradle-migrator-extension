import * as path from 'path';
import * as fs from 'fs-extra';
import glob from 'glob';
import * as vscode from 'vscode';
import { Worker } from 'worker_threads';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import { handleError, ErrorType } from '../utils/errorHandler';
import { feedback } from '../utils/userFeedback';
import { GradleWorkerPool } from '../workers/gradleProcessor.worker';
import { MemoryManager, globalMemoryManager } from '../utils/memoryManager';
import { SETTINGS_GRADLE_TEMPLATE, JENKINSFILE_TEMPLATE } from './templates';
import { AIService } from '../services/aiService';
import { GradleParser } from '../services/gradleParser';
import { AnalysisEngine } from '../services/analysisEngine';
import { ContextSuggestionEngine } from '../services/contextSuggestionEngine';
import { InteractiveWorkflow } from '../services/interactiveWorkflow';
import { SecurityAnalyzer } from '../services/securityAnalyzer';
import { ErrorHandler, withErrorHandling } from '../services/errorHandler';
import { UserPreferenceEngine } from '../services/userPreferenceEngine';

export interface GradleFileInfo {
  relativePath: string;
  absolutePath: string;
  type: 'build' | 'settings' | 'properties' | 'wrapper' | 'jenkins' | 'other';
  size: number;
  lastModified: Date;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface ProcessingResult {
  success: boolean;
  message: string;
  filesProcessed: number;
  errors: string[];
  warnings: string[];
  backupPaths?: string[];
  partialSuccess?: boolean;
  validationResults?: ValidationResult[];
  duration?: number;
  cacheHits?: number;
  memoryUsage?: NodeJS.MemoryUsage;
  parallelJobs?: number;
  aiSuggestions?: AISuggestion[];
  analysisResults?: AnalysisResult[];
  userAcceptedSuggestions?: number;
  userRejectedSuggestions?: number;
}

export interface AISuggestion {
  id: string;
  filePath: string;
  type: 'dependency' | 'plugin' | 'configuration' | 'performance' | 'security';
  description: string;
  currentCode: string;
  suggestedCode: string;
  reasoning: string;
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  accepted?: boolean;
}

export interface AnalysisResult {
  filePath: string;
  issues: Issue[];
  suggestions: string[];
  modernizationOpportunities: string[];
  securityConcerns: string[];
  performanceImprovements: string[];
}

export interface Issue {
  type: 'deprecated' | 'security' | 'performance' | 'compatibility';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  line?: number;
  suggestion?: string;
}

export interface PerformanceOptions {
  enableCaching?: boolean;
  maxParallelJobs?: number;
  chunkSize?: number;
  memoryLimit?: number; // in MB
  useStreaming?: boolean;
  enableWorkerThreads?: boolean;
}

export interface CacheEntry {
  content: string;
  lastModified: number;
  size: number;
  hash: string;
}

export interface ProcessingStats {
  totalFiles: number;
  processedFiles: number;
  skippedFiles: number;
  errorFiles: number;
  cacheHits: number;
  averageFileSize: number;
  totalProcessingTime: number;
  memoryPeak: number;
}

/**
 * Enhanced function to find and categorize Gradle-related files
 */
export async function findGradleFiles(repoPath: string): Promise<GradleFileInfo[]> {
  const patterns = [
    '**/*.gradle',
    '**/*.gradle.kts', 
    '**/gradle.properties',
    'settings.gradle',
    'settings.gradle.kts',
    'Jenkinsfile',
    '**/gradle/wrapper/**'
  ];
  
  const opts = { 
    cwd: repoPath, 
    nodir: true, 
    dot: true, 
    ignore: ['**/node_modules/**', '**/.git/**', '**/build/**', '**/out/**'] 
  };
  
  try {
    const results = await Promise.all(patterns.map(p => new Promise<string[]>((res, rej) => {
      glob(p, opts, (err, matches) => err ? rej(err) : res(matches));
    })));
    
    const allFiles = Array.from(new Set(results.flat()));
    const fileInfos: GradleFileInfo[] = [];
    
    for (const relativePath of allFiles) {
      const absolutePath = path.join(repoPath, relativePath);
      try {
        const stats = await fs.stat(absolutePath);
        const type = categorizeGradleFile(relativePath);
        
        fileInfos.push({
          relativePath,
          absolutePath,
          type,
          size: stats.size,
          lastModified: stats.mtime
        });
      } catch (err) {
        console.warn(`Failed to get stats for file: ${relativePath}`, err);
      }
    }
    
    return fileInfos.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  } catch (err: any) {
    throw new Error(`Failed to find Gradle files: ${err.message}`);
  }
}

/**
 * Categorize Gradle file by its path and name
 */
function categorizeGradleFile(filePath: string): GradleFileInfo['type'] {
  const fileName = path.basename(filePath).toLowerCase();
  const dirName = path.dirname(filePath).toLowerCase();
  
  if (fileName === 'jenkinsfile') return 'jenkins';
  if (fileName.startsWith('settings.gradle')) return 'settings';
  if (fileName === 'gradle.properties') return 'properties';
  if (dirName.includes('wrapper')) return 'wrapper';
  if (fileName.endsWith('.gradle') || fileName.endsWith('.gradle.kts')) return 'build';
  
  return 'other';
}

/**
 * Enhanced function to update gradleRepositoryUrl domain from abc.org.com -> efg.org.com
 * while preserving path/version with comprehensive validation and backup
 */
export async function updateGradlePropertiesFiles(
  repoPath: string, 
  urlMappings?: Map<string, string> | string,
  options?: {
    createBackup?: boolean;
    dryRun?: boolean;
    customMapping?: { from: string; to: string };
    validateSyntax?: boolean;
    customMappings?: Array<{ from: string; to: string }>;
  }
): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    success: true,
    message: '',
    filesProcessed: 0,
    errors: [],
    warnings: [],
    backupPaths: []
  };
  
  try {
    const files = await new Promise<string[]>((res, rej) => {
      glob('**/gradle.properties', { 
        cwd: repoPath, 
        nodir: true, 
        ignore: ['**/.git/**', '**/node_modules/**', '**/build/**'] 
      }, (err, matches) => {

        err ? rej(err) : res(matches);
      });
    });
    
    if (files.length === 0) {
      result.message = 'No gradle.properties files found';
      return result;
    }
    
    const fromDomain = options?.customMapping?.from || 'abc.org.com';
    const toDomain = options?.customMapping?.to || 'efg.org.com';
    const changes: string[] = [];
    
    for (const rel of files) {
      const abs = path.join(repoPath, rel);
      
      try {
        // Check if file exists and is readable
        const stats = await fs.stat(abs);
        if (!stats.isFile()) {
          result.warnings.push(`Skipping ${rel}: not a regular file`);
          continue;
        }
        
        const text = await fs.readFile(abs, 'utf8');
        
        // Create backup if requested
        if (options?.createBackup && !options?.dryRun) {
          const backupPath = `${abs}.backup`;
          await fs.writeFile(backupPath, text, 'utf8');
          result.backupPaths!.push(backupPath);
        }
        
        // Update all URLs containing the target domain with more robust regex
        const urlPattern = new RegExp(
          `(\\w+[\\w\\.]*\\s*=\\s*)(https?:\\/\\/)([^\\s]*${fromDomain.replace(/\./g, '\\.')}[^\\s]*)(\\s|$|\\n)`,
          'gmi'
        );
        
        const updated = text.replace(urlPattern, (match, prefix, protocol, domainAndPath, ending) => {
          const newDomainAndPath = domainAndPath.replace(new RegExp(fromDomain.replace(/\./g, '\\.'), 'gi'), toDomain);
          return `${prefix}${protocol}${newDomainAndPath}${ending || ''}`;
        });
        
        if (updated !== text) {
          if (!options?.dryRun) {
            await fs.writeFile(abs, updated, 'utf8');
          }
          changes.push(rel);
          result.filesProcessed++;
        }
        
      } catch (fileErr: any) {
        result.errors.push(`Failed to process ${rel}: ${fileErr.message}`);
        result.success = false;
      }
    }
    
    if (options?.dryRun) {
      result.message = `Dry run: Would update ${changes.length} file(s): ${changes.join(', ')}`;
    } else {
      result.message = `Successfully updated ${changes.length} gradle.properties file(s)`;
    }
    
    if (changes.length > 0) {
      result.warnings.push(`Updated files: ${changes.join(', ')}`);
    }
    
  } catch (err: any) {
    result.success = false;
    result.message = `Failed to update gradle.properties files: ${err.message}`;
    result.errors.push(err.message);
  }
  
  return result;
}

/**
 * Enhanced function to read file chunks with better error handling and metadata
 */
export async function readFileChunk(
  repoPath: string, 
  relPath: string, 
  startLine?: number,
  endLine?: number,
  options?: {
    offset?: number;
    length?: number;
    encoding?: BufferEncoding;
    maxTokens?: number;
  }
) {
  const abs = path.join(repoPath, relPath);
  const offset = options?.offset || 0;
  const length = options?.length || 2000;
  const encoding = options?.encoding || 'utf8';
  
  try {
    // Validate file exists and is readable
    const stats = await fs.stat(abs);
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${relPath}`);
    }
    
    const content = await fs.readFile(abs, encoding);
    const slice = content.slice(offset, offset + length);
    const eof = offset + length >= content.length;
    
    return { 
      content: slice, 
      length: slice.length, 
      eof,
      totalSize: content.length,
      offset,
      relativePath: relPath,
      absolutePath: abs
    };
  } catch (err: any) {
    throw new Error(`Failed to read file chunk from ${relPath}: ${err.message}`);
  }
}

/**
 * Enhanced template replacement with backup and validation
 */
export async function replaceRootTemplates(
  repoPath: string, 
  options?: {
    createBackup?: boolean;
    validateTemplates?: boolean;
    dryRun?: boolean;
    validateSyntax?: boolean;
    settingsContent?: string;
    jenkinsContent?: string;
  }
): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    success: true,
    message: '',
    filesProcessed: 0,
    errors: [],
    warnings: []
  };
  
  try {
    const settingsPath = path.join(repoPath, 'settings.gradle');
    const jenkinsPath = path.join(repoPath, 'Jenkinsfile');
    
    // Use provided content or default templates
    const settingsContent = options?.settingsContent || SETTINGS_GRADLE_TEMPLATE;
    const jenkinsContent = options?.jenkinsContent || JENKINSFILE_TEMPLATE;
    
    // Validate templates if requested
    if (options?.validateTemplates) {
      if (!settingsContent.trim()) {
        result.warnings.push('Settings template is empty');
      }
      if (!jenkinsContent.trim()) {
        result.warnings.push('Jenkins template is empty');
      }
    }
    
    // Create backups if requested
    if (options?.createBackup) {
      try {
        if (await fs.pathExists(settingsPath)) {
          await fs.copy(settingsPath, `${settingsPath}.backup`);
        }
        if (await fs.pathExists(jenkinsPath)) {
          await fs.copy(jenkinsPath, `${jenkinsPath}.backup`);
        }
      } catch (backupErr: any) {
        result.warnings.push(`Backup creation failed: ${backupErr.message}`);
      }
    }
    
    // Write templates (unless in dry run mode)
    if (!options?.dryRun) {
      await fs.writeFile(settingsPath, settingsContent, 'utf8');
      result.filesProcessed++;
      
      await fs.writeFile(jenkinsPath, jenkinsContent, 'utf8');
      result.filesProcessed++;
    } else {
       result.filesProcessed = 2; // Count files that would be processed
     }
     
     if (!options?.dryRun) {
       result.message = `Successfully replaced ${result.filesProcessed} template file(s)`;
     } else {
       result.message = `Dry run: Would replace ${result.filesProcessed} template file(s)`;
     }
    
  } catch (err: any) {
    result.success = false;
    result.message = `Failed to replace templates: ${err.message}`;
    result.errors.push(err.message);
  }
  
  return result;
}

/**
 * Process Gradle files with Copilot suggestions - Enhanced with performance optimizations
 */
export async function processGradleFilesWithCopilot(
  repositoryPath: string,
  urlMappings: Map<string, string>,
  progressCallback?: (progress: number, message: string) => void,
  options: PerformanceOptions = {}
): Promise<ProcessingResult> {
  const startTime = Date.now();
  const initialMemory = process.memoryUsage();
  
  // Set default performance options
  const perfOptions: PerformanceOptions = {
    enableCaching: true,
    maxParallelJobs: Math.min(4, require('os').cpus().length),
    chunkSize: 1000,
    memoryLimit: 512, // 512MB
    useStreaming: false,
    enableWorkerThreads: false,
    ...options
  };
  
  const result: ProcessingResult = {
    success: false,
    message: '',
    filesProcessed: 0,
    errors: [],
    warnings: [],
    backupPaths: [],
    cacheHits: 0,
    memoryUsage: initialMemory,
    parallelJobs: perfOptions.maxParallelJobs,
    aiSuggestions: [],
    analysisResults: [],
    userAcceptedSuggestions: 0,
    userRejectedSuggestions: 0
  };

  const stats: ProcessingStats = {
    totalFiles: 0,
    processedFiles: 0,
    skippedFiles: 0,
    errorFiles: 0,
    cacheHits: 0,
    averageFileSize: 0,
    totalProcessingTime: 0,
    memoryPeak: 0
  };

  // Initialize AI services with error handling
  const errorHandler = ErrorHandler.getInstance();
  const userPreferenceEngine = UserPreferenceEngine.getInstance();
  
  const aiService = AIService.getInstance();
  const gradleParser = new GradleParser();
  const analysisEngine = new AnalysisEngine();
  const contextEngine = new ContextSuggestionEngine();
  const interactiveWorkflow = new InteractiveWorkflow();
  const securityAnalyzer = new SecurityAnalyzer();
  
  try {
    await aiService.initialize();
    
    // Set up cross-service dependencies
    userPreferenceEngine.setAIService(aiService);
    
    progressCallback?.(5, 'AI services initialized');
  } catch (error: any) {
    result.warnings.push(`AI services unavailable: ${error.message}. Falling back to basic processing.`);
  }

  try {
    const gradleFiles = await findGradleFiles(repositoryPath);
    stats.totalFiles = gradleFiles.length;
    
    if (gradleFiles.length === 0) {
      result.success = true;
      result.message = 'No Gradle files found in the repository.';
      return result;
    }
    
    const backupDir = path.join(repositoryPath, '.gradle-migrator-backup');
    await fs.ensureDir(backupDir);

    const errors: string[] = [];
    const backupPaths: string[] = [];
    const streamProcessor = new StreamingFileProcessor(urlMappings, perfOptions);
    
    // Initialize memory manager and worker pool
    const memoryManager = new MemoryManager({
      thresholds: {
        warning: perfOptions.memoryLimit! * 0.6, // 60% of limit
        cleanup: perfOptions.memoryLimit! * 0.8, // 80% of limit
        critical: perfOptions.memoryLimit! * 0.95 // 95% of limit
      },
      enableGC: true
    });
    
    let workerPool: GradleWorkerPool | null = null;
    if (perfOptions.enableWorkerThreads && gradleFiles.length > 10) {
      workerPool = new GradleWorkerPool(perfOptions.maxParallelJobs);
    }
    
    memoryManager.startMonitoring();
    
    // Set up memory pressure handlers
    memoryManager.on('memory-warning', () => {
      feedback.warning('Memory usage is high, reducing processing speed');
    });
    
    memoryManager.on('memory-cleanup', () => {
      if (perfOptions.enableCaching) {
        globalFileCache.clear();
        feedback.warning('Cache cleared due to memory pressure');
      }
    });
    
    memoryManager.on('memory-critical', () => {
      feedback.error('Critical memory usage detected, emergency cleanup performed');
    });
    
    try {
      // Dynamically adjust chunk size based on memory pressure
      let dynamicChunkSize = memoryManager.getRecommendedChunkSize(perfOptions.chunkSize!);
      let dynamicParallelJobs = memoryManager.getRecommendedParallelJobs(perfOptions.maxParallelJobs!);
      
      // Process files in chunks for better memory management
      const chunks = [];
      for (let i = 0; i < gradleFiles.length; i += dynamicChunkSize) {
        chunks.push(gradleFiles.slice(i, i + dynamicChunkSize));
      }

      let processedCount = 0;
      
      for (const chunk of chunks) {
        // Adjust parallelism based on current memory usage
        dynamicParallelJobs = memoryManager.getRecommendedParallelJobs(perfOptions.maxParallelJobs!);
        
        // Process chunk in parallel with AI analysis
        const chunkPromises = chunk.map(async (file) => {
          return await withErrorHandling(async () => {
            const fileStats = await fs.stat(file.absolutePath);
            const backupPath = path.join(backupDir, file.relativePath);
            
            // Read file content
            let content: string;
            let cacheHit = false;
            
            if (perfOptions.enableCaching) {
              const cachedEntry = globalFileCache.get(file.absolutePath, fileStats);
              if (cachedEntry) {
                content = cachedEntry.content;
                cacheHit = true;
                stats.cacheHits++;
              } else {
                content = await fs.readFile(file.absolutePath, 'utf8');
                globalFileCache.set(file.absolutePath, content, fileStats);
              }
            } else {
              content = await fs.readFile(file.absolutePath, 'utf8');
            }
            
            // Track file size for statistics
            stats.averageFileSize = (stats.averageFileSize * stats.processedFiles + fileStats.size) / (stats.processedFiles + 1);
            
            // Create backup directory structure and backup
            await fs.ensureDir(path.dirname(backupPath));
            await fs.copy(file.absolutePath, backupPath);
            backupPaths.push(backupPath);
            
            let modifiedContent = content;
            let aiSuggestions: AISuggestion[] = [];
            let analysisResult: AnalysisResult | null = null;
            
            // Comprehensive AI-powered analysis and suggestions
            if (aiService && (file.type === 'build' || file.type === 'settings')) {
              try {
                // 1. Parse Gradle file for basic analysis with error handling
                 const parseResult = await withErrorHandling(
                   () => GradleParser.parseGradleBuild(file.absolutePath),
                   { operation: 'gradle-parsing', file: file.absolutePath, service: 'GradleParser', timestamp: new Date() },
                   () => errorHandler.handleGradleParsingError(new Error('Parsing failed'), file.absolutePath, content)
                 );
                
                // 2. Run comprehensive analysis engine with error handling
                 const comprehensiveAnalysis = await withErrorHandling(
                   () => analysisEngine.analyzeProject(path.dirname(file.absolutePath)),
                   { operation: 'analysis-engine', file: path.dirname(file.absolutePath), service: 'AnalysisEngine', timestamp: new Date() },
                   () => errorHandler.handleAnalysisEngineError(new Error('Analysis failed'), path.dirname(file.absolutePath))
                 );
                
                // 3. Generate contextual suggestions with error handling
                 const projectContext = await contextEngine.analyzeProjectContext(path.dirname(file.absolutePath));
                 const baseSuggestions = await withErrorHandling(
                   () => contextEngine.generateContextualSuggestions(
                     path.dirname(file.absolutePath)
                   ),
                   { operation: 'context-suggestions', file: path.dirname(file.absolutePath), service: 'ContextSuggestionEngine', timestamp: new Date() },
                   () => errorHandler.handleContextSuggestionError(new Error('Context analysis failed'), path.dirname(file.absolutePath))
                 );
                
                // 3.5. Personalize suggestions based on user preferences
                const contextualSuggestions = await userPreferenceEngine.getPersonalizedSuggestions(baseSuggestions, projectContext);
                
                // 4. Run security analysis with error handling
                 const securityReport = await withErrorHandling(
                   () => securityAnalyzer.scanProject(path.dirname(file.absolutePath)),
                   { operation: 'security-analysis', file: path.dirname(file.absolutePath), service: 'SecurityAnalyzer', timestamp: new Date() },
                   () => errorHandler.handleSecurityAnalysisError(new Error('Security analysis failed'), path.dirname(file.absolutePath))
                 );
                
                // 5. Start interactive workflow for user decisions with error handling
                 const workflowSession = await withErrorHandling(
                   () => interactiveWorkflow.startInteractiveSession(
                     path.dirname(file.absolutePath)
                   ),
                   { operation: 'interactive-workflow', file: path.dirname(file.absolutePath), service: 'InteractiveWorkflow', timestamp: new Date() },
                   () => errorHandler.handleInteractiveWorkflowError(new Error('Interactive workflow failed'), path.dirname(file.absolutePath))
                 );
                
                // 6. Process suggestions through interactive workflow
                const userDecisions = await interactiveWorkflow.processAllSuggestions();
                
                // 6.5. Record user decisions for learning
                for (const decision of Array.from(userDecisions.values())) {
                  const suggestion = contextualSuggestions.find(s => s.id === decision.suggestionId);
                  if (suggestion) {
                    // Map action values to match UserDecision interface
                    const mappedAction = decision.action === 'accept' ? 'accepted' : 
                                       decision.action === 'reject' ? 'rejected' : 
                                       decision.action === 'modify' ? 'modified' : 'rejected';
                    
                    await userPreferenceEngine.recordUserDecision({
                      suggestionId: decision.suggestionId,
                      suggestionType: suggestion.category,
                      category: suggestion.category,
                      action: mappedAction,
                      timestamp: new Date(),
                      projectContext: {
                        type: projectContext.type,
                        size: projectContext.dependencies.length > 20 ? 'large' : 'small',
                        technologies: projectContext.dependencies.slice(0, 5).map(dep => `${dep.group}:${dep.artifact}:${dep.version}`)
                      }
                    });
                  }
                }
                
                // 7. Generate AI recommendations with comprehensive context and error handling
                const analysisRequest = {
                  filePath: file.absolutePath,
                  content,
                  analysisType: 'gradle-migration' as const,
                  context: {
                    projectStructure: await getProjectStructure(repositoryPath),
                    existingDependencies: parseResult.dependencies?.map((d: any) => `${d.group}:${d.name}:${d.version}`) || [],
                    targetGradleVersion: parseResult.gradleVersion
                  }
                };
                
                const aiAnalysis = await withErrorHandling(
                   () => aiService.analyzeGradleBuild(analysisRequest),
                   { operation: 'ai-analysis', file: file.absolutePath, service: 'AIService', timestamp: new Date() },
                   () => Promise.resolve({ suggestions: [], summary: 'AI service unavailable - using fallback analysis', confidence: 0.1, reasoning: 'Fallback analysis due to AI service unavailability' })
                 );
                
                // 8. Convert AI analysis to suggestions
                aiSuggestions = aiAnalysis?.suggestions.map((suggestion, index) => ({
                  id: `${file.relativePath}-${index}`,
                  filePath: file.absolutePath,
                  type: suggestion.type as AISuggestion['type'],
                  description: suggestion.description,
                  currentCode: suggestion.changes[0]?.originalContent || '',
                  suggestedCode: suggestion.changes[0]?.suggestedContent || '',
                  reasoning: suggestion.reasoning,
                  confidence: suggestion.confidence,
                  impact: suggestion.impact as AISuggestion['impact']
                })) || [];
                
                // 9. Apply approved changes from interactive workflow
                const acceptedDecisions = Array.from(userDecisions.values())
                  .filter(d => d.action === 'accept');
                
                for (const decision of acceptedDecisions) {
                  const suggestion = contextualSuggestions.find(s => s.id === decision.suggestionId);
                  if (suggestion && suggestion.implementation.codeChanges.length > 0) {
                    // Apply code changes from the suggestion
                    for (const change of suggestion.implementation.codeChanges) {
                      if (change.before && change.after) {
                        modifiedContent = modifiedContent.replace(change.before, change.after);
                      } else if (change.after) {
                        modifiedContent += '\n' + change.after;
                      }
                    }
                  }
                }
                
                // 10. Present AI suggestions to user for additional approval
                if (aiSuggestions.length > 0) {
                  const userChoices = await presentSuggestionsToUser(aiSuggestions);
                  
                  // Apply approved AI suggestions
                  for (const suggestion of aiSuggestions) {
                    const userChoice = userChoices.find(c => c.id === suggestion.id);
                    if (userChoice?.accepted) {
                      modifiedContent = modifiedContent.replace(
                        suggestion.currentCode,
                        suggestion.suggestedCode
                      );
                      suggestion.accepted = true;
                      result.userAcceptedSuggestions!++;
                    } else {
                      suggestion.accepted = false;
                      result.userRejectedSuggestions!++;
                    }
                  }
                }
                
                // 11. Complete interactive session
                await interactiveWorkflow.completeSession();
                
                // 12. Build comprehensive analysis result
                analysisResult = {
                  filePath: file.absolutePath,
                  issues: [
                    ...parseResult.issues,
                    ...securityReport.vulnerabilities.map((v: any) => ({
                      type: 'security' as const,
                      severity: v.severity as Issue['severity'],
                      description: v.description,
                      suggestion: v.recommendation
                    }))
                  ],
                  suggestions: [
                    ...parseResult.suggestions,
                    ...contextualSuggestions.map(cs => cs.description)
                  ],
                  modernizationOpportunities: [
                    ...parseResult.modernizationOpportunities,
                    ...comprehensiveAnalysis.prioritizedRecommendations.map((r: any) => r.description)
                  ],
                  securityConcerns: securityReport.vulnerabilities.map((v: any) => v.description),
                  performanceImprovements: [
                    ...(parseResult.performanceImprovements || []),
                    ...(comprehensiveAnalysis.performanceAnalysis?.recommendations || [])
                  ]
                };
                
              } catch (aiError: any) {
                result.warnings.push(`AI analysis failed for ${file.relativePath}: ${aiError.message}`);
              }
            }
            
            // Fallback to basic URL mappings if AI is not available or for non-build files
            if (!aiService.isReady() || file.type === 'properties' || file.type === 'wrapper') {
              for (const [oldUrl, newUrl] of urlMappings) {
                const regex = new RegExp(oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                modifiedContent = modifiedContent.replace(regex, newUrl);
              }
            }
            
            // Write modified content if changes were made
            if (modifiedContent !== content) {
              await fs.writeFile(file.absolutePath, modifiedContent, 'utf8');
            }
            
            // Store AI results
            if (aiSuggestions.length > 0) {
              result.aiSuggestions!.push(...aiSuggestions);
            }
            if (analysisResult) {
              result.analysisResults!.push(analysisResult);
            }
            
            stats.processedFiles++;
            
            return {
              filePath: file.absolutePath,
              relativePath: file.relativePath,
              backupPath,
              cacheHit,
              fileSize: fileStats.size,
              aiProcessed: aiService !== null && (file.type === 'build' || file.type === 'settings'),
              suggestionsCount: aiSuggestions.length
            };
          }, {
            operation: 'process_gradle_file_with_ai',
            file: file.absolutePath,
            service: 'GradleFileProcessor',
            timestamp: new Date()
          });
        });
        
        // Wait for chunk to complete with dynamic concurrency limit
        const chunkResults = await Promise.allSettled(
          chunkPromises.slice(0, dynamicParallelJobs)
        );
        
        // Process results
        for (const chunkResult of chunkResults) {
          if (chunkResult.status === 'fulfilled' && chunkResult.value) {
            processedCount++;
          } else {
            const error = chunkResult.status === 'rejected' 
              ? chunkResult.reason 
              : 'Unknown error';
            errors.push(error);
            stats.errorFiles++;
          }
        }
        
        // Update progress
        const progress = (processedCount / gradleFiles.length) * 100;
        progressCallback?.(progress, `Processed ${processedCount}/${gradleFiles.length} files`);
        
        // Update memory statistics
        const currentMemory = process.memoryUsage();
        stats.memoryPeak = Math.max(stats.memoryPeak, currentMemory.heapUsed);
        
        // Adaptive chunk size adjustment
        if (memoryManager.shouldReduceParallelism()) {
          dynamicChunkSize = Math.max(1, Math.floor(dynamicChunkSize * 0.8));
          result.warnings.push(`Reducing chunk size to ${dynamicChunkSize} due to memory pressure`);
        }
      }
    } finally {
      // Cleanup resources
      memoryManager.stopMonitoring();
      if (workerPool) {
        await workerPool.terminate();
      }
    }

    // Collect final statistics
    const endTime = Date.now();
    const finalMemory = process.memoryUsage();
    
    stats.totalProcessingTime = endTime - startTime;
    
    result.filesProcessed = stats.processedFiles;
    result.errors = errors;
    result.backupPaths = backupPaths;
    result.success = errors.length === 0;
    result.partialSuccess = stats.processedFiles > 0 && errors.length > 0;
    result.duration = stats.totalProcessingTime;
    result.cacheHits = stats.cacheHits;
    result.memoryUsage = finalMemory;

    // Log performance statistics
    if (perfOptions.enableCaching) {
      const cacheStats = globalFileCache.getStats();
      result.warnings.push(`Cache performance: ${Math.round(cacheStats.hitRate * 100)}% hit rate (${cacheStats.hitCount}/${cacheStats.hitCount + cacheStats.missCount})`);
    }
    
    result.warnings.push(`Performance: ${stats.totalProcessingTime}ms total, ${Math.round(stats.averageFileSize / 1024)}KB avg file size, ${Math.round(stats.memoryPeak / 1024 / 1024)}MB peak memory`);

    // Generate comprehensive result message
    const aiSummary = result.aiSuggestions!.length > 0 
      ? ` AI generated ${result.aiSuggestions!.length} suggestions (${result.userAcceptedSuggestions} accepted, ${result.userRejectedSuggestions} rejected).`
      : '';
    
    const analysisSummary = result.analysisResults!.length > 0
      ? ` Analysis found ${result.analysisResults!.reduce((sum, r) => sum + r.issues.length, 0)} issues across ${result.analysisResults!.length} files.`
      : '';
    
    if (result.success) {
      result.message = `Successfully processed ${stats.processedFiles} Gradle files with AI-powered analysis.${aiSummary}${analysisSummary}`;
    } else if (result.partialSuccess) {
      result.message = `Partially successful: ${stats.processedFiles} files processed, ${errors.length} errors.${aiSummary}${analysisSummary}`;
    } else {
      result.message = `Failed to process Gradle files: ${errors.length} errors occurred.${aiSummary}${analysisSummary}`;
    }

    progressCallback?.(100, 'Processing complete');
    
    return result;
    
  } catch (error: any) {
    result.success = false;
    result.message = `Failed to process Gradle files: ${error.message}`;
    result.errors = [error.message];
    return result;
  }
}

/**
 * Read file in chunks to manage token limits
 */
async function readFileInChunks(filePath: string, chunkSize: number = 1500): Promise<Array<{
  content: string;
  chunkIndex: number;
  isLast: boolean;
}>> {
  const content = await fs.readFile(filePath, 'utf8');
  const chunks: Array<{ content: string; chunkIndex: number; isLast: boolean }> = [];
  
  for (let i = 0; i < content.length; i += chunkSize) {
    const chunk = content.slice(i, i + chunkSize);
    chunks.push({
      content: chunk,
      chunkIndex: chunks.length,
      isLast: i + chunkSize >= content.length
    });
  }
  
  return chunks;
}

// Performance-optimized file cache
class GradleFileCache {
    private cache = new Map<string, CacheEntry>();
    private maxCacheSize: number;
    private hitCount = 0;
    private missCount = 0;

    constructor(maxSizeMB: number = 50) {
        this.maxCacheSize = maxSizeMB * 1024 * 1024; // Convert to bytes
    }

    private calculateHash(content: string): string {
        // Simple hash function for cache validation
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(36);
    }

    private getCurrentCacheSize(): number {
        return Array.from(this.cache.values())
            .reduce((total, entry) => total + entry.size, 0);
    }

    private evictOldestEntries(): void {
        const entries = Array.from(this.cache.entries())
            .sort(([, a], [, b]) => a.lastModified - b.lastModified);
        
        while (this.getCurrentCacheSize() > this.maxCacheSize && entries.length > 0) {
            const [key] = entries.shift()!;
            this.cache.delete(key);
        }
    }

    get(filePath: string, fileStats: fs.Stats): CacheEntry | null {
        const entry = this.cache.get(filePath);
        if (entry && entry.lastModified === fileStats.mtime.getTime()) {
            this.hitCount++;
            return entry;
        }
        this.missCount++;
        return null;
    }

    set(filePath: string, content: string, fileStats: fs.Stats): void {
        const entry: CacheEntry = {
            content,
            lastModified: fileStats.mtime.getTime(),
            size: Buffer.byteLength(content, 'utf8'),
            hash: this.calculateHash(content)
        };

        this.cache.set(filePath, entry);
        
        if (this.getCurrentCacheSize() > this.maxCacheSize) {
            this.evictOldestEntries();
        }
    }

    getStats() {
        return {
            hitCount: this.hitCount,
            missCount: this.missCount,
            hitRate: this.hitCount / (this.hitCount + this.missCount),
            cacheSize: this.getCurrentCacheSize(),
            entryCount: this.cache.size
        };
    }

    clear(): void {
        this.cache.clear();
        this.hitCount = 0;
        this.missCount = 0;
    }
}

// Streaming file processor for large files
class StreamingFileProcessor {
    private urlMappings: Map<string, string>;
    private options: PerformanceOptions;

    constructor(urlMappings: Map<string, string>, options: PerformanceOptions) {
        this.urlMappings = urlMappings;
        this.options = options;
    }

    createTransformStream(): Transform {
        const urlMappings = this.urlMappings;
        return new Transform({
            objectMode: false,
            transform(chunk: Buffer, encoding: BufferEncoding, callback) {
                try {
                    let content = chunk.toString('utf8');
                    
                    // Apply URL mappings
                    for (const [oldUrl, newUrl] of urlMappings) {
                        const regex = new RegExp(oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                        content = content.replace(regex, newUrl);
                    }
                    
                    callback(null, Buffer.from(content, 'utf8'));
                } catch (error) {
                    callback(error as Error);
                }
            }
        });
    }

    async processFileStream(inputPath: string, outputPath: string): Promise<void> {
        const readStream = createReadStream(inputPath, { encoding: 'utf8' });
        const writeStream = createWriteStream(outputPath, { encoding: 'utf8' });
        const transformStream = this.createTransformStream();

        await pipeline(readStream, transformStream, writeStream);
    }
}

// Global cache instance
const globalFileCache = new GradleFileCache();

// Helper function to get project structure for AI analysis
async function getProjectStructure(repositoryPath: string): Promise<string[]> {
  try {
    const structure: string[] = [];
    const files = await fs.readdir(repositoryPath, { withFileTypes: true });
    
    for (const file of files) {
      if (file.isDirectory() && !file.name.startsWith('.') && file.name !== 'node_modules') {
        structure.push(`${file.name}/`);
        // Get one level deep for context
        try {
          const subFiles = await fs.readdir(path.join(repositoryPath, file.name));
          structure.push(...subFiles.slice(0, 5).map(f => `${file.name}/${f}`));
        } catch {
          // Ignore errors reading subdirectories
        }
      } else if (file.isFile()) {
        structure.push(file.name);
      }
    }
    
    return structure.slice(0, 50); // Limit to 50 items for context
  } catch (error) {
    return [];
  }
}

// Helper function to present AI suggestions to user for approval
async function presentSuggestionsToUser(suggestions: AISuggestion[]): Promise<Array<{ id: string; accepted: boolean }>> {
  const choices: Array<{ id: string; accepted: boolean }> = [];
  
  for (const suggestion of suggestions) {
    try {
      // Create a detailed message for the user
      const message = `AI Suggestion for ${path.basename(suggestion.filePath)}:\n\n` +
        `${suggestion.description}\n\n` +
        `Current code:\n${suggestion.currentCode}\n\n` +
        `Suggested code:\n${suggestion.suggestedCode}\n\n` +
        `Reasoning: ${suggestion.reasoning}\n` +
        `Confidence: ${Math.round(suggestion.confidence * 100)}%\n` +
        `Impact: ${suggestion.impact}`;
      
      const userChoice = await vscode.window.showInformationMessage(
        message,
        { modal: true },
        'Accept',
        'Reject',
        'Skip All'
      );
      
      if (userChoice === 'Accept') {
        choices.push({ id: suggestion.id, accepted: true });
      } else if (userChoice === 'Reject') {
        choices.push({ id: suggestion.id, accepted: false });
      } else if (userChoice === 'Skip All') {
        // Reject all remaining suggestions
        choices.push({ id: suggestion.id, accepted: false });
        for (let i = suggestions.indexOf(suggestion) + 1; i < suggestions.length; i++) {
          choices.push({ id: suggestions[i].id, accepted: false });
        }
        break;
      } else {
        // User cancelled or closed dialog - reject this suggestion
        choices.push({ id: suggestion.id, accepted: false });
      }
    } catch (error) {
      // If there's an error showing the dialog, reject the suggestion
      choices.push({ id: suggestion.id, accepted: false });
    }
  }
  
  return choices;
}

/**
 * Validate Gradle file syntax and structure
 */
export async function validateGradleFiles(files: GradleFileInfo[]): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    success: true,
    message: '',
    filesProcessed: 0,
    errors: [],
    warnings: []
  };
  
  for (const file of files) {
    try {
      const content = await fs.readFile(file.absolutePath, 'utf8');
      
      // Basic syntax validation
      if (file.type === 'build' || file.type === 'settings') {
        // Check for common Gradle syntax issues
        if (content.includes('compile ') && !content.includes('implementation ')) {
          result.warnings.push(`${file.relativePath}: Consider replacing 'compile' with 'implementation'`);
        }
        
        if (content.includes('testCompile ')) {
          result.warnings.push(`${file.relativePath}: Consider replacing 'testCompile' with 'testImplementation'`);
        }
        
        // Check for balanced braces
        const openBraces = (content.match(/{/g) || []).length;
        const closeBraces = (content.match(/}/g) || []).length;
        if (openBraces !== closeBraces) {
          result.errors.push(`${file.relativePath}: Unbalanced braces detected`);
          result.success = false;
        }
      }
      
      result.filesProcessed++;
      
    } catch (err: any) {
      result.errors.push(`Failed to validate ${file.relativePath}: ${err.message}`);
      result.success = false;
    }
  }
  
  result.message = `Validated ${result.filesProcessed} Gradle file(s)`;
  return result;
}

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import { GradleParser, GradleBuildAnalysis } from './gradleParser';
import { AIService } from './aiService';
import { AnalysisEngine, ComprehensiveAnalysis } from './analysisEngine';
import { feedback } from '../utils/userFeedback';

export interface ProjectContext {
  type: 'spring-boot' | 'android' | 'library' | 'multi-module' | 'kotlin' | 'java' | 'unknown';
  framework: string[];
  buildTools: string[];
  testingFrameworks: string[];
  languages: string[];
  moduleStructure: ModuleInfo[];
  dependencies: DependencyInfo[];
}

export interface ModuleInfo {
  name: string;
  path: string;
  type: 'application' | 'library' | 'test' | 'unknown';
  dependencies: string[];
  plugins: string[];
}

export interface DependencyInfo {
  group: string;
  artifact: string;
  version: string;
  scope: 'implementation' | 'api' | 'testImplementation' | 'compileOnly' | 'runtimeOnly';
  transitive: boolean;
  conflicts: string[];
}

export interface ContextualSuggestion {
  id: string;
  category: 'dependency' | 'plugin' | 'configuration' | 'structure' | 'testing' | 'performance';
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  reasoning: string;
  implementation: {
    steps: string[];
    codeChanges: Array<{
      file: string;
      change: string;
      before?: string;
      after?: string;
    }>;
    estimatedEffort: 'low' | 'medium' | 'high';
  };
  benefits: string[];
  risks: string[];
  applicableModules: string[];
  prerequisites: string[];
  relatedSuggestions: string[];
}

export interface ConflictResolution {
  type: 'version' | 'scope' | 'exclusion' | 'replacement';
  description: string;
  conflictingDependencies: string[];
  resolution: {
    strategy: string;
    implementation: string;
    impact: string;
  };
  confidence: number;
}

export class ContextSuggestionEngine {
  private gradleParser: GradleParser;
  private aiService: AIService;
  private analysisEngine: AnalysisEngine;
  private projectContext: ProjectContext | null = null;

  constructor() {
    this.gradleParser = new GradleParser();
    this.aiService = AIService.getInstance();
    this.analysisEngine = new AnalysisEngine();
  }

  async analyzeProjectContext(projectPath: string): Promise<ProjectContext> {
    feedback.info('Analyzing project context...');

    const context: ProjectContext = {
      type: 'unknown',
      framework: [],
      buildTools: [],
      testingFrameworks: [],
      languages: [],
      moduleStructure: [],
      dependencies: []
    };

    try {
      // Analyze project structure
      const gradleFiles = await this.findGradleFiles(projectPath);
      const allDependencies = new Set<string>();
      const allPlugins = new Set<string>();

      for (const file of gradleFiles) {
        const content = await fs.readFile(file, 'utf8');
        const analysis = await GradleParser.parseGradleBuild(file);
        
        // Collect dependencies and plugins
        analysis.dependencies?.forEach(dep => allDependencies.add(`${dep.group}:${dep.name}:${dep.version}`));
        analysis.plugins?.forEach(plugin => allPlugins.add(plugin.id));

        // Analyze module structure
        const moduleInfo = await this.analyzeModule(file, analysis);
        context.moduleStructure.push(moduleInfo);
      }

      // Determine project type based on dependencies and plugins
      context.type = this.determineProjectType(allDependencies, allPlugins);
      context.framework = this.detectFrameworks(allDependencies);
      context.buildTools = this.detectBuildTools(allPlugins);
      context.testingFrameworks = this.detectTestingFrameworks(allDependencies);
      context.languages = this.detectLanguages(allPlugins, projectPath);
      context.dependencies = this.analyzeDependencies(allDependencies);

      this.projectContext = context;
      feedback.info(`Project identified as: ${context.type}`);
      
      return context;
    } catch (error: any) {
      feedback.error(`Context analysis failed: ${error.message}`);
      throw error;
    }
  }

  async generateContextualSuggestions(
    projectPath: string,
    comprehensiveAnalysis?: ComprehensiveAnalysis
  ): Promise<ContextualSuggestion[]> {
    if (!this.projectContext) {
      await this.analyzeProjectContext(projectPath);
    }

    const suggestions: ContextualSuggestion[] = [];

    // Generate suggestions based on project type
    suggestions.push(...await this.generateProjectTypeSuggestions());
    
    // Generate dependency-related suggestions
    suggestions.push(...await this.generateDependencySuggestions());
    
    // Generate performance suggestions
    suggestions.push(...await this.generatePerformanceSuggestions());
    
    // Generate testing suggestions
    suggestions.push(...await this.generateTestingSuggestions());
    
    // Generate structure suggestions
    suggestions.push(...await this.generateStructureSuggestions());

    // If comprehensive analysis is available, enhance suggestions
    if (comprehensiveAnalysis) {
      suggestions.push(...this.enhanceSuggestionsWithAnalysis(comprehensiveAnalysis));
    }

    // Sort by priority and relevance
    return this.prioritizeSuggestions(suggestions);
  }

  async resolveDependencyConflicts(projectPath: string): Promise<ConflictResolution[]> {
    if (!this.projectContext) {
      await this.analyzeProjectContext(projectPath);
    }

    const resolutions: ConflictResolution[] = [];
    const dependencyVersions = new Map<string, Set<string>>();

    // Group dependencies by artifact
    for (const dep of this.projectContext!.dependencies) {
      const key = `${dep.group}:${dep.artifact}`;
      if (!dependencyVersions.has(key)) {
        dependencyVersions.set(key, new Set());
      }
      dependencyVersions.get(key)!.add(dep.version);
    }

    // Find conflicts
    for (const [artifact, versions] of dependencyVersions) {
      if (versions.size > 1) {
        const resolution = await this.createConflictResolution(artifact, Array.from(versions));
        resolutions.push(resolution);
      }
    }

    return resolutions;
  }

  private async generateProjectTypeSuggestions(): Promise<ContextualSuggestion[]> {
    const suggestions: ContextualSuggestion[] = [];
    const context = this.projectContext!;

    switch (context.type) {
      case 'spring-boot':
        suggestions.push({
          id: 'spring-boot-optimization',
          category: 'configuration',
          priority: 'medium',
          title: 'Optimize Spring Boot Configuration',
          description: 'Configure Spring Boot for better performance and development experience',
          reasoning: 'Spring Boot projects benefit from specific optimizations',
          implementation: {
            steps: [
              'Enable Spring Boot DevTools for development',
              'Configure actuator endpoints',
              'Set up proper logging configuration',
              'Enable build optimization'
            ],
            codeChanges: [
              {
                file: 'build.gradle',
                change: 'Add Spring Boot DevTools',
                after: 'developmentOnly "org.springframework.boot:spring-boot-devtools"'
              },
              {
                file: 'application.properties',
                change: 'Enable actuator',
                after: 'management.endpoints.web.exposure.include=health,info,metrics'
              }
            ],
            estimatedEffort: 'low'
          },
          benefits: ['Faster development cycles', 'Better monitoring', 'Improved debugging'],
          risks: ['DevTools should not be in production'],
          applicableModules: context.moduleStructure.filter(m => m.type === 'application').map(m => m.name),
          prerequisites: ['Spring Boot 2.0+'],
          relatedSuggestions: ['performance-optimization']
        });
        break;

      case 'android':
        suggestions.push({
          id: 'android-optimization',
          category: 'performance',
          priority: 'high',
          title: 'Optimize Android Build Performance',
          description: 'Configure Android-specific build optimizations',
          reasoning: 'Android builds can be significantly optimized with proper configuration',
          implementation: {
            steps: [
              'Enable R8 code shrinking',
              'Configure build cache',
              'Enable incremental compilation',
              'Optimize dependency resolution'
            ],
            codeChanges: [
              {
                file: 'app/build.gradle',
                change: 'Enable R8 and optimization',
                after: 'android { buildTypes { release { minifyEnabled true, proguardFiles getDefaultProguardFile(\'proguard-android-optimize.txt\') } } }'
              }
            ],
            estimatedEffort: 'medium'
          },
          benefits: ['Faster builds', 'Smaller APK size', 'Better performance'],
          risks: ['Requires testing with minification'],
          applicableModules: context.moduleStructure.filter(m => m.plugins.some(p => p.includes('android'))).map(m => m.name),
          prerequisites: ['Android Gradle Plugin 3.4+'],
          relatedSuggestions: ['dependency-optimization']
        });
        break;

      case 'multi-module':
        suggestions.push({
          id: 'multi-module-optimization',
          category: 'structure',
          priority: 'high',
          title: 'Optimize Multi-Module Build',
          description: 'Configure parallel builds and dependency management for multi-module projects',
          reasoning: 'Multi-module projects benefit significantly from parallel execution and proper dependency management',
          implementation: {
            steps: [
              'Enable parallel builds',
              'Configure build cache',
              'Set up composite builds if applicable',
              'Optimize module dependencies'
            ],
            codeChanges: [
              {
                file: 'gradle.properties',
                change: 'Enable parallel builds',
                after: 'org.gradle.parallel=true\norg.gradle.caching=true\norg.gradle.configureondemand=true'
              }
            ],
            estimatedEffort: 'low'
          },
          benefits: ['Faster builds', 'Better resource utilization', 'Improved development experience'],
          risks: ['May require dependency adjustments'],
          applicableModules: ['root'],
          prerequisites: ['Gradle 6.0+'],
          relatedSuggestions: ['performance-optimization']
        });
        break;
    }

    return suggestions;
  }

  private async generateDependencySuggestions(): Promise<ContextualSuggestion[]> {
    const suggestions: ContextualSuggestion[] = [];
    const context = this.projectContext!;

    // Check for outdated dependencies
    const outdatedDeps = context.dependencies.filter(dep => this.isOutdated(dep));
    if (outdatedDeps.length > 0) {
      suggestions.push({
        id: 'update-dependencies',
        category: 'dependency',
        priority: 'medium',
        title: 'Update Outdated Dependencies',
        description: `${outdatedDeps.length} dependencies have newer versions available`,
        reasoning: 'Keeping dependencies up-to-date improves security and provides new features',
        implementation: {
          steps: [
            'Review dependency updates',
            'Test compatibility',
            'Update versions gradually',
            'Run full test suite'
          ],
          codeChanges: outdatedDeps.slice(0, 5).map(dep => ({
            file: 'build.gradle',
            change: `Update ${dep.group}:${dep.artifact}`,
            before: `${dep.group}:${dep.artifact}:${dep.version}`,
            after: `${dep.group}:${dep.artifact}:latest.release`
          })),
          estimatedEffort: 'medium'
        },
        benefits: ['Security improvements', 'Bug fixes', 'New features'],
        risks: ['Potential breaking changes', 'Compatibility issues'],
        applicableModules: context.moduleStructure.map(m => m.name),
        prerequisites: ['Comprehensive test suite'],
        relatedSuggestions: ['security-audit']
      });
    }

    // Check for dependency conflicts
    const conflicts = context.dependencies.filter(dep => dep.conflicts.length > 0);
    if (conflicts.length > 0) {
      suggestions.push({
        id: 'resolve-conflicts',
        category: 'dependency',
        priority: 'high',
        title: 'Resolve Dependency Conflicts',
        description: `${conflicts.length} dependency conflicts detected`,
        reasoning: 'Dependency conflicts can cause runtime issues and unpredictable behavior',
        implementation: {
          steps: [
            'Analyze dependency tree',
            'Identify conflict sources',
            'Apply resolution strategies',
            'Verify resolution'
          ],
          codeChanges: conflicts.slice(0, 3).map(dep => ({
            file: 'build.gradle',
            change: `Resolve conflict for ${dep.group}:${dep.artifact}`,
            after: `configurations.all { resolutionStrategy { force '${dep.group}:${dep.artifact}:${dep.version}' } }`
          })),
          estimatedEffort: 'high'
        },
        benefits: ['Predictable behavior', 'Reduced runtime errors', 'Cleaner dependency tree'],
        risks: ['May require extensive testing'],
        applicableModules: context.moduleStructure.map(m => m.name),
        prerequisites: ['Understanding of dependency resolution'],
        relatedSuggestions: ['dependency-analysis']
      });
    }

    return suggestions;
  }

  private async generatePerformanceSuggestions(): Promise<ContextualSuggestion[]> {
    const suggestions: ContextualSuggestion[] = [];
    const context = this.projectContext!;

    // Check if parallel builds are enabled
    const hasParallelBuilds = await this.checkForConfiguration('org.gradle.parallel=true');
    if (!hasParallelBuilds && context.moduleStructure.length > 1) {
      suggestions.push({
        id: 'enable-parallel-builds',
        category: 'performance',
        priority: 'high',
        title: 'Enable Parallel Builds',
        description: 'Enable parallel execution for faster multi-module builds',
        reasoning: 'Multi-module projects can benefit significantly from parallel execution',
        implementation: {
          steps: [
            'Add parallel configuration to gradle.properties',
            'Ensure modules are properly decoupled',
            'Test build stability',
            'Monitor build performance'
          ],
          codeChanges: [
            {
              file: 'gradle.properties',
              change: 'Enable parallel builds',
              after: 'org.gradle.parallel=true'
            }
          ],
          estimatedEffort: 'low'
        },
        benefits: ['20-40% faster builds', 'Better CPU utilization', 'Improved development experience'],
        risks: ['Potential build instability if modules are coupled'],
        applicableModules: ['root'],
        prerequisites: ['Decoupled modules'],
        relatedSuggestions: ['build-cache']
      });
    }

    return suggestions;
  }

  private async generateTestingSuggestions(): Promise<ContextualSuggestion[]> {
    const suggestions: ContextualSuggestion[] = [];
    const context = this.projectContext!;

    // Check if modern testing frameworks are used
    const hasJUnit5 = context.testingFrameworks.some(f => f.includes('junit-jupiter'));
    const hasJUnit4 = context.testingFrameworks.some(f => f.includes('junit') && !f.includes('jupiter'));

    if (hasJUnit4 && !hasJUnit5) {
      suggestions.push({
        id: 'migrate-junit5',
        category: 'testing',
        priority: 'medium',
        title: 'Migrate to JUnit 5',
        description: 'Upgrade from JUnit 4 to JUnit 5 for better testing capabilities',
        reasoning: 'JUnit 5 provides better assertions, parameterized tests, and modern features',
        implementation: {
          steps: [
            'Add JUnit 5 dependencies',
            'Configure test engine',
            'Migrate test annotations',
            'Update assertions'
          ],
          codeChanges: [
            {
              file: 'build.gradle',
              change: 'Add JUnit 5 dependencies',
              after: 'testImplementation "org.junit.jupiter:junit-jupiter:5.9.0"\ntestRuntimeOnly "org.junit.platform:junit-platform-launcher"'
            }
          ],
          estimatedEffort: 'medium'
        },
        benefits: ['Better assertions', 'Parameterized tests', 'Modern testing features'],
        risks: ['Requires test migration'],
        applicableModules: context.moduleStructure.filter(m => m.dependencies.some(d => d.includes('junit'))).map(m => m.name),
        prerequisites: ['Java 8+'],
        relatedSuggestions: ['testing-optimization']
      });
    }

    return suggestions;
  }

  private async generateStructureSuggestions(): Promise<ContextualSuggestion[]> {
    const suggestions: ContextualSuggestion[] = [];
    const context = this.projectContext!;

    // Check for version catalog opportunities
    const hasVersionCatalog = context.moduleStructure.some(m => 
      m.path.includes('libs.versions.toml')
    );

    if (!hasVersionCatalog && context.moduleStructure.length > 2) {
      suggestions.push({
        id: 'implement-version-catalog',
        category: 'structure',
        priority: 'medium',
        title: 'Implement Gradle Version Catalogs',
        description: 'Centralize dependency management with Gradle Version Catalogs',
        reasoning: 'Version catalogs provide type-safe dependency management and easier maintenance',
        implementation: {
          steps: [
            'Create gradle/libs.versions.toml',
            'Define version variables',
            'Define library aliases',
            'Update build scripts to use catalog'
          ],
          codeChanges: [
            {
              file: 'gradle/libs.versions.toml',
              change: 'Create version catalog',
              after: '[versions]\nspring-boot = "2.7.0"\n[libraries]\nspring-boot-starter = { group = "org.springframework.boot", name = "spring-boot-starter", version.ref = "spring-boot" }'
            }
          ],
          estimatedEffort: 'medium'
        },
        benefits: ['Centralized dependency management', 'Type-safe accessors', 'Easier maintenance'],
        risks: ['Requires Gradle 7.0+'],
        applicableModules: context.moduleStructure.map(m => m.name),
        prerequisites: ['Gradle 7.0+'],
        relatedSuggestions: ['dependency-management']
      });
    }

    return suggestions;
  }

  private enhanceSuggestionsWithAnalysis(analysis: ComprehensiveAnalysis): ContextualSuggestion[] {
    const suggestions: ContextualSuggestion[] = [];

    // Convert analysis recommendations to contextual suggestions
    for (const rec of analysis.prioritizedRecommendations) {
      suggestions.push({
        id: `analysis-${rec.category}-${Date.now()}`,
        category: rec.category as ContextualSuggestion['category'],
        priority: rec.priority as ContextualSuggestion['priority'],
        title: rec.description,
        description: rec.impact,
        reasoning: `Analysis-based recommendation with ${rec.effort} effort`,
        implementation: {
          steps: [rec.implementation],
          codeChanges: [],
          estimatedEffort: rec.effort as ContextualSuggestion['implementation']['estimatedEffort']
        },
        benefits: [rec.impact],
        risks: [],
        applicableModules: [],
        prerequisites: [],
        relatedSuggestions: []
      });
    }

    return suggestions;
  }

  private prioritizeSuggestions(suggestions: ContextualSuggestion[]): ContextualSuggestion[] {
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    
    return suggestions.sort((a, b) => {
      // First sort by priority
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Then by effort (lower effort first)
      const effortOrder = { low: 3, medium: 2, high: 1 };
      return effortOrder[b.implementation.estimatedEffort] - effortOrder[a.implementation.estimatedEffort];
    });
  }

  private async createConflictResolution(artifact: string, versions: string[]): Promise<ConflictResolution> {
    const latestVersion = this.findLatestVersion(versions);
    
    return {
      type: 'version',
      description: `Version conflict for ${artifact}`,
      conflictingDependencies: versions.map(v => `${artifact}:${v}`),
      resolution: {
        strategy: 'Force latest version',
        implementation: `configurations.all { resolutionStrategy { force '${artifact}:${latestVersion}' } }`,
        impact: 'All modules will use the same version'
      },
      confidence: 0.8
    };
  }

  private determineProjectType(dependencies: Set<string>, plugins: Set<string>): ProjectContext['type'] {
    if (Array.from(dependencies).some(dep => dep.includes('spring-boot'))) {
      return 'spring-boot';
    }
    if (Array.from(plugins).some(plugin => plugin.includes('android'))) {
      return 'android';
    }
    if (Array.from(plugins).some(plugin => plugin.includes('kotlin'))) {
      return 'kotlin';
    }
    if (Array.from(plugins).some(plugin => plugin.includes('java-library'))) {
      return 'library';
    }
    if (Array.from(plugins).some(plugin => plugin.includes('java'))) {
      return 'java';
    }
    return 'unknown';
  }

  private detectFrameworks(dependencies: Set<string>): string[] {
    const frameworks: string[] = [];
    const depArray = Array.from(dependencies);
    
    if (depArray.some(dep => dep.includes('spring'))) frameworks.push('Spring');
    if (depArray.some(dep => dep.includes('hibernate'))) frameworks.push('Hibernate');
    if (depArray.some(dep => dep.includes('jackson'))) frameworks.push('Jackson');
    if (depArray.some(dep => dep.includes('retrofit'))) frameworks.push('Retrofit');
    
    return frameworks;
  }

  private detectBuildTools(plugins: Set<string>): string[] {
    const tools: string[] = [];
    const pluginArray = Array.from(plugins);
    
    if (pluginArray.some(p => p.includes('gradle'))) tools.push('Gradle');
    if (pluginArray.some(p => p.includes('maven'))) tools.push('Maven');
    
    return tools;
  }

  private detectTestingFrameworks(dependencies: Set<string>): string[] {
    const frameworks: string[] = [];
    const depArray = Array.from(dependencies);
    
    if (depArray.some(dep => dep.includes('junit-jupiter'))) frameworks.push('JUnit 5');
    else if (depArray.some(dep => dep.includes('junit'))) frameworks.push('JUnit 4');
    if (depArray.some(dep => dep.includes('mockito'))) frameworks.push('Mockito');
    if (depArray.some(dep => dep.includes('testng'))) frameworks.push('TestNG');
    
    return frameworks;
  }

  private detectLanguages(plugins: Set<string>, projectPath: string): string[] {
    const languages: string[] = [];
    const pluginArray = Array.from(plugins);
    
    if (pluginArray.some(p => p.includes('kotlin'))) languages.push('Kotlin');
    if (pluginArray.some(p => p.includes('java'))) languages.push('Java');
    if (pluginArray.some(p => p.includes('groovy'))) languages.push('Groovy');
    if (pluginArray.some(p => p.includes('scala'))) languages.push('Scala');
    
    return languages;
  }

  private analyzeDependencies(dependencies: Set<string>): DependencyInfo[] {
    return Array.from(dependencies).map(dep => {
      const parts = dep.split(':');
      return {
        group: parts[0] || '',
        artifact: parts[1] || '',
        version: parts[2] || 'unspecified',
        scope: 'implementation', // Simplified - would need more analysis
        transitive: false,
        conflicts: []
      };
    });
  }

  private async analyzeModule(filePath: string, analysis: GradleBuildAnalysis): Promise<ModuleInfo> {
    const moduleName = path.basename(path.dirname(filePath));
    
    return {
      name: moduleName,
      path: filePath,
      type: this.determineModuleType(analysis),
      dependencies: (analysis.dependencies || []).map(dep => `${dep.group}:${dep.name}:${dep.version}`),
      plugins: (analysis.plugins || []).map(plugin => plugin.id)
    };
  }

  private determineModuleType(analysis: GradleBuildAnalysis): ModuleInfo['type'] {
    const plugins = analysis.plugins || [];
    
    if (plugins.some(p => p.id.includes('application'))) return 'application';
    if (plugins.some(p => p.id.includes('library'))) return 'library';
    if (plugins.some(p => p.id.includes('test'))) return 'test';
    
    return 'unknown';
  }

  private async findGradleFiles(projectPath: string): Promise<string[]> {
    const files: string[] = [];
    const patterns = ['**/*.gradle', '**/*.gradle.kts'];
    
    for (const pattern of patterns) {
      const found = await vscode.workspace.findFiles(
        new vscode.RelativePattern(projectPath, pattern),
        '**/node_modules/**'
      );
      files.push(...found.map(uri => uri.fsPath));
    }
    
    return files;
  }

  private isOutdated(dep: DependencyInfo): boolean {
    // Simplified check - in reality would check against repository
    return dep.version.includes('SNAPSHOT') || 
           dep.version.match(/^[0-9]+\.[0-9]+\.[0-9]+$/) === null;
  }

  private async checkForConfiguration(config: string): Promise<boolean> {
    // Simplified check - would scan gradle.properties files
    return false;
  }

  private findLatestVersion(versions: string[]): string {
    // Simplified version comparison
    return versions.sort().pop() || versions[0];
  }
}

export const contextSuggestionEngine = new ContextSuggestionEngine();
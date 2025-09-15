import * as vscode from 'vscode';
import { GradleParser, GradleBuildAnalysis } from './gradleParser';
import { AIService, AIAnalysisRequest, AIAnalysisResponse } from './aiService';
import { feedback } from '../utils/userFeedback';

export interface PerformanceAnalysis {
  buildTime: {
    current: string;
    optimized: string;
    improvements: string[];
  };
  parallelization: {
    enabled: boolean;
    recommendations: string[];
  };
  caching: {
    buildCache: boolean;
    configurationCache: boolean;
    recommendations: string[];
  };
  dependencies: {
    unusedDependencies: string[];
    conflictingVersions: Array<{
      dependency: string;
      versions: string[];
      recommendation: string;
    }>;
  };
}

export interface SecurityAnalysis {
  vulnerabilities: Array<{
    dependency: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    fixVersion?: string;
    cveId?: string;
  }>;
  insecureConfigurations: Array<{
    type: string;
    description: string;
    recommendation: string;
  }>;
  outdatedDependencies: Array<{
    dependency: string;
    currentVersion: string;
    latestVersion: string;
    securityUpdates: boolean;
  }>;
}

export interface ModernizationAnalysis {
  gradleVersion: {
    current: string;
    latest: string;
    migrationPath: string[];
  };
  pluginUpgrades: Array<{
    plugin: string;
    currentVersion: string;
    latestVersion: string;
    breakingChanges: string[];
    benefits: string[];
  }>;
  syntaxModernization: Array<{
    type: 'kotlin-dsl' | 'version-catalog' | 'composite-builds';
    description: string;
    example: string;
    benefits: string[];
  }>;
  javaVersion: {
    current: string;
    recommended: string;
    compatibility: string[];
  };
}

export interface ComprehensiveAnalysis {
  performance: PerformanceAnalysis;
  security: SecurityAnalysis;
  modernization: ModernizationAnalysis;
  overallScore: {
    performance: number; // 0-100
    security: number; // 0-100
    modernization: number; // 0-100
    overall: number; // 0-100
  };
  prioritizedRecommendations: Array<{
    category: 'performance' | 'security' | 'modernization';
    priority: 'high' | 'medium' | 'low';
    description: string;
    impact: string;
    effort: 'low' | 'medium' | 'high';
    implementation: string;
  }>;
}

export class AnalysisEngine {
  private gradleParser: GradleParser;
  private aiService: AIService;
  private knowledgeBase: Map<string, any>;

  constructor() {
    this.gradleParser = new GradleParser();
    this.aiService = AIService.getInstance();
    this.knowledgeBase = new Map();
    this.initializeKnowledgeBase();
  }

  private initializeKnowledgeBase(): void {
    // Performance optimization patterns
    this.knowledgeBase.set('performance-patterns', {
      parallelBuilds: {
        pattern: /org\.gradle\.parallel\s*=\s*true/,
        recommendation: 'Enable parallel builds for multi-module projects'
      },
      buildCache: {
        pattern: /org\.gradle\.caching\s*=\s*true/,
        recommendation: 'Enable build cache to speed up repeated builds'
      },
      configurationCache: {
        pattern: /org\.gradle\.configuration-cache\s*=\s*true/,
        recommendation: 'Enable configuration cache for faster configuration phase'
      },
      daemonOptimization: {
        pattern: /org\.gradle\.jvmargs\s*=.*-Xmx/,
        recommendation: 'Optimize JVM heap size for Gradle daemon'
      }
    });

    // Security vulnerability patterns
    this.knowledgeBase.set('security-patterns', {
      insecureRepositories: {
        pattern: /http:\/\/(?!localhost)/,
        severity: 'medium',
        description: 'HTTP repositories are insecure'
      },
      wildcardVersions: {
        pattern: /['"].*\+['"]|['"].*\*['"]/,
        severity: 'low',
        description: 'Wildcard versions can introduce unexpected changes'
      },
      snapshotDependencies: {
        pattern: /['"].*-SNAPSHOT['"]/,
        severity: 'medium',
        description: 'SNAPSHOT dependencies are unstable for production'
      }
    });

    // Modernization opportunities
    this.knowledgeBase.set('modernization-patterns', {
      kotlinDsl: {
        fileExtension: '.gradle.kts',
        benefits: ['Type safety', 'Better IDE support', 'Kotlin ecosystem integration']
      },
      versionCatalogs: {
        pattern: /gradle\/libs\.versions\.toml/,
        benefits: ['Centralized dependency management', 'Type-safe accessors', 'Sharing across projects']
      },
      compositeBuilds: {
        pattern: /includeBuild/,
        benefits: ['Better modularization', 'Faster development cycles', 'Independent versioning']
      }
    });
  }

  async analyzeProject(projectPath: string): Promise<ComprehensiveAnalysis> {
    feedback.info('Starting comprehensive project analysis...');

    try {
      // Parse all Gradle files in the project
      const gradleFiles = await this.findAllGradleFiles(projectPath);
      const analysisResults: GradleBuildAnalysis[] = [];

      for (const file of gradleFiles) {
        const analysis = await GradleParser.parseGradleBuild(file);
        analysisResults.push(analysis);
      }

      // Perform different types of analysis
      const performance = await this.analyzePerformance(analysisResults, projectPath);
      const security = await this.analyzeSecurity(analysisResults);
      const modernization = await this.analyzeModernization(analysisResults, projectPath);

      // Calculate overall scores
      const overallScore = this.calculateOverallScore(performance, security, modernization);

      // Generate prioritized recommendations
      const prioritizedRecommendations = this.generatePrioritizedRecommendations(
        performance,
        security,
        modernization
      );

      feedback.info('Comprehensive analysis completed');

      return {
        performance,
        security,
        modernization,
        overallScore,
        prioritizedRecommendations
      };
    } catch (error: any) {
      feedback.error(`Analysis failed: ${error.message}`);
      throw error;
    }
  }

  private async analyzePerformance(
    analysisResults: GradleBuildAnalysis[],
    projectPath: string
  ): Promise<PerformanceAnalysis> {
    const performancePatterns = this.knowledgeBase.get('performance-patterns');
    const analysis: PerformanceAnalysis = {
      buildTime: {
        current: 'Unknown',
        optimized: 'Estimated improvement: 20-40%',
        improvements: []
      },
      parallelization: {
        enabled: false,
        recommendations: []
      },
      caching: {
        buildCache: false,
        configurationCache: false,
        recommendations: []
      },
      dependencies: {
        unusedDependencies: [],
        conflictingVersions: []
      }
    };

    // Check for performance optimizations
    for (const result of analysisResults) {
      // Read the actual file content for pattern matching
      const fs = require('fs');
      const content = fs.readFileSync(result.filePath, 'utf8');

      // Check parallel builds
      if (performancePatterns.parallelBuilds.pattern.test(content)) {
        analysis.parallelization.enabled = true;
      } else {
        analysis.parallelization.recommendations.push(
          'Enable parallel builds: org.gradle.parallel=true'
        );
      }

      // Check build cache
      if (performancePatterns.buildCache.pattern.test(content)) {
        analysis.caching.buildCache = true;
      } else {
        analysis.caching.recommendations.push(
          'Enable build cache: org.gradle.caching=true'
        );
      }

      // Check configuration cache
      if (performancePatterns.configurationCache.pattern.test(content)) {
        analysis.caching.configurationCache = true;
      } else {
        analysis.caching.recommendations.push(
          'Enable configuration cache: org.gradle.configuration-cache=true'
        );
      }

      // Analyze dependencies for conflicts and unused ones
      const dependencies = result.dependencies || [];
      const dependencyVersions = new Map<string, string[]>();

      for (const dep of dependencies) {
        const baseName = `${dep.group}:${dep.name}`;
        const version = dep.version || 'unspecified';
        
        if (!dependencyVersions.has(baseName)) {
          dependencyVersions.set(baseName, []);
        }
        dependencyVersions.get(baseName)!.push(version);
      }

      // Find conflicting versions
      for (const [dep, versions] of dependencyVersions) {
        const uniqueVersions = [...new Set(versions)];
        if (uniqueVersions.length > 1) {
          analysis.dependencies.conflictingVersions.push({
            dependency: dep,
            versions: uniqueVersions,
            recommendation: `Align to latest version: ${uniqueVersions.sort().pop()}`
          });
        }
      }
    }

    return analysis;
  }

  private async analyzeSecurity(analysisResults: GradleBuildAnalysis[]): Promise<SecurityAnalysis> {
    const securityPatterns = this.knowledgeBase.get('security-patterns');
    const analysis: SecurityAnalysis = {
      vulnerabilities: [],
      insecureConfigurations: [],
      outdatedDependencies: []
    };

    for (const result of analysisResults) {
      // Read the actual file content for pattern matching
      const fs = require('fs');
      const content = fs.readFileSync(result.filePath, 'utf8');

      // Check for insecure repositories
      if (securityPatterns.insecureRepositories.pattern.test(content)) {
        analysis.insecureConfigurations.push({
          type: 'Insecure Repository',
          description: 'HTTP repositories detected',
          recommendation: 'Use HTTPS repositories only'
        });
      }

      // Check for wildcard versions
      if (securityPatterns.wildcardVersions.pattern.test(content)) {
        analysis.insecureConfigurations.push({
          type: 'Wildcard Versions',
          description: 'Wildcard dependency versions detected',
          recommendation: 'Use specific version numbers'
        });
      }

      // Check for snapshot dependencies
      if (securityPatterns.snapshotDependencies.pattern.test(content)) {
        analysis.insecureConfigurations.push({
          type: 'Snapshot Dependencies',
          description: 'SNAPSHOT dependencies in production build',
          recommendation: 'Use stable release versions'
        });
      }

      // Analyze dependencies for known vulnerabilities (simplified)
      const dependencies = result.dependencies || [];
      for (const dep of dependencies) {
        const depString = `${dep.group}:${dep.name}:${dep.version}`;
        // This would typically integrate with a vulnerability database
        if (depString.includes('log4j:log4j:1.')) {
          analysis.vulnerabilities.push({
            dependency: depString,
            severity: 'critical',
            description: 'Log4j 1.x has known security vulnerabilities',
            fixVersion: '2.17.0+',
            cveId: 'CVE-2021-44228'
          });
        }
      }
    }

    return analysis;
  }

  private async analyzeModernization(
    analysisResults: GradleBuildAnalysis[],
    projectPath: string
  ): Promise<ModernizationAnalysis> {
    const modernizationPatterns = this.knowledgeBase.get('modernization-patterns');
    const analysis: ModernizationAnalysis = {
      gradleVersion: {
        current: 'Unknown',
        latest: '8.5',
        migrationPath: []
      },
      pluginUpgrades: [],
      syntaxModernization: [],
      javaVersion: {
        current: 'Unknown',
        recommended: '17',
        compatibility: []
      }
    };

    // Detect current Gradle version
    for (const result of analysisResults) {
      if (result.gradleVersion) {
        analysis.gradleVersion.current = result.gradleVersion;
        
        // Generate migration path if needed
        const currentMajor = parseInt(result.gradleVersion.split('.')[0]);
        const latestMajor = 8;
        
        if (currentMajor < latestMajor) {
          for (let v = currentMajor + 1; v <= latestMajor; v++) {
            analysis.gradleVersion.migrationPath.push(`Upgrade to Gradle ${v}.x`);
          }
        }
      }
    }

    // Check for Kotlin DSL opportunities
    const hasGroovyFiles = analysisResults.some(r => r.filePath?.endsWith('.gradle'));
    const hasKotlinFiles = analysisResults.some(r => r.filePath?.endsWith('.gradle.kts'));
    
    if (hasGroovyFiles && !hasKotlinFiles) {
      analysis.syntaxModernization.push({
        type: 'kotlin-dsl',
        description: 'Migrate from Groovy DSL to Kotlin DSL',
        example: 'plugins { id("java") }',
        benefits: modernizationPatterns.kotlinDsl.benefits
      });
    }

    // Check for version catalog opportunities
    const hasVersionCatalog = analysisResults.some(r => 
      r.filePath?.includes('libs.versions.toml')
    );
    
    if (!hasVersionCatalog) {
      analysis.syntaxModernization.push({
        type: 'version-catalog',
        description: 'Implement Gradle Version Catalogs',
        example: 'implementation(libs.spring.boot)',
        benefits: modernizationPatterns.versionCatalogs.benefits
      });
    }

    return analysis;
  }

  private calculateOverallScore(
    performance: PerformanceAnalysis,
    security: SecurityAnalysis,
    modernization: ModernizationAnalysis
  ): ComprehensiveAnalysis['overallScore'] {
    // Calculate performance score (0-100)
    let performanceScore = 100;
    performanceScore -= performance.parallelization.recommendations.length * 15;
    performanceScore -= performance.caching.recommendations.length * 10;
    performanceScore -= performance.dependencies.conflictingVersions.length * 5;
    performanceScore = Math.max(0, performanceScore);

    // Calculate security score (0-100)
    let securityScore = 100;
    securityScore -= security.vulnerabilities.filter(v => v.severity === 'critical').length * 30;
    securityScore -= security.vulnerabilities.filter(v => v.severity === 'high').length * 20;
    securityScore -= security.vulnerabilities.filter(v => v.severity === 'medium').length * 10;
    securityScore -= security.insecureConfigurations.length * 5;
    securityScore = Math.max(0, securityScore);

    // Calculate modernization score (0-100)
    let modernizationScore = 100;
    const currentGradleVersion = parseFloat(modernization.gradleVersion.current || '0');
    const latestGradleVersion = 8.5;
    if (currentGradleVersion < latestGradleVersion) {
      modernizationScore -= (latestGradleVersion - currentGradleVersion) * 10;
    }
    modernizationScore -= modernization.syntaxModernization.length * 15;
    modernizationScore = Math.max(0, modernizationScore);

    // Calculate overall score
    const overall = Math.round((performanceScore + securityScore + modernizationScore) / 3);

    return {
      performance: Math.round(performanceScore),
      security: Math.round(securityScore),
      modernization: Math.round(modernizationScore),
      overall
    };
  }

  private generatePrioritizedRecommendations(
    performance: PerformanceAnalysis,
    security: SecurityAnalysis,
    modernization: ModernizationAnalysis
  ): ComprehensiveAnalysis['prioritizedRecommendations'] {
    const recommendations: ComprehensiveAnalysis['prioritizedRecommendations'] = [];

    // High priority security issues
    for (const vuln of security.vulnerabilities) {
      if (vuln.severity === 'critical' || vuln.severity === 'high') {
        recommendations.push({
          category: 'security',
          priority: 'high',
          description: `Fix ${vuln.severity} vulnerability in ${vuln.dependency}`,
          impact: 'Prevents security exploits',
          effort: 'low',
          implementation: `Update to version ${vuln.fixVersion || 'latest'}`
        });
      }
    }

    // High impact performance improvements
    if (!performance.parallelization.enabled) {
      recommendations.push({
        category: 'performance',
        priority: 'high',
        description: 'Enable parallel builds',
        impact: 'Reduces build time by 20-40%',
        effort: 'low',
        implementation: 'Add org.gradle.parallel=true to gradle.properties'
      });
    }

    if (!performance.caching.buildCache) {
      recommendations.push({
        category: 'performance',
        priority: 'medium',
        description: 'Enable build cache',
        impact: 'Speeds up repeated builds significantly',
        effort: 'low',
        implementation: 'Add org.gradle.caching=true to gradle.properties'
      });
    }

    // Modernization recommendations
    for (const syntax of modernization.syntaxModernization) {
      recommendations.push({
        category: 'modernization',
        priority: 'medium',
        description: syntax.description,
        impact: syntax.benefits.join(', '),
        effort: syntax.type === 'kotlin-dsl' ? 'high' : 'medium',
        implementation: `Implement ${syntax.type} - see documentation for migration guide`
      });
    }

    // Sort by priority
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    recommendations.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);

    return recommendations;
  }

  private async findAllGradleFiles(projectPath: string): Promise<string[]> {
    const files: string[] = [];
    const patterns = ['**/*.gradle', '**/*.gradle.kts', '**/gradle.properties'];
    
    for (const pattern of patterns) {
      const found = await vscode.workspace.findFiles(
        new vscode.RelativePattern(projectPath, pattern),
        '**/node_modules/**'
      );
      files.push(...found.map(uri => uri.fsPath));
    }
    
    return files;
  }
}

export const analysisEngine = new AnalysisEngine();
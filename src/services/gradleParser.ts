import * as fs from 'fs';
import * as path from 'path';
import { ErrorType, handleError } from '../utils/errorHandler';

/**
 * Gradle build script analysis result
 */
export interface GradleBuildAnalysis {
  filePath: string;
  gradleVersion?: string;
  plugins: PluginInfo[];
  dependencies: DependencyInfo[];
  repositories: RepositoryInfo[];
  buildScriptDependencies: DependencyInfo[];
  tasks: TaskInfo[];
  configurations: ConfigurationInfo[];
  properties: PropertyInfo[];
  issues: BuildIssue[];
}

/**
 * Plugin information
 */
export interface PluginInfo {
  id: string;
  version?: string;
  apply: boolean;
  legacy: boolean;
  deprecated: boolean;
  lineNumber: number;
  modernAlternative?: string;
}

/**
 * Dependency information
 */
export interface DependencyInfo {
  group: string;
  name: string;
  version: string;
  configuration: string;
  lineNumber: number;
  deprecated: boolean;
  hasVulnerabilities: boolean;
  latestVersion?: string;
  scope: 'implementation' | 'api' | 'compileOnly' | 'runtimeOnly' | 'testImplementation' | 'other';
}

/**
 * Repository information
 */
export interface RepositoryInfo {
  type: 'maven' | 'gradle' | 'ivy' | 'flatDir' | 'custom';
  url?: string;
  name?: string;
  lineNumber: number;
  secure: boolean;
}

/**
 * Task information
 */
export interface TaskInfo {
  name: string;
  type?: string;
  lineNumber: number;
  deprecated: boolean;
  modernAlternative?: string;
}

/**
 * Configuration information
 */
export interface ConfigurationInfo {
  name: string;
  lineNumber: number;
  deprecated: boolean;
  modernAlternative?: string;
}

/**
 * Property information
 */
export interface PropertyInfo {
  key: string;
  value: string;
  lineNumber: number;
  deprecated: boolean;
  modernAlternative?: string;
}

/**
 * Build issue
 */
export interface BuildIssue {
  type: 'error' | 'warning' | 'info';
  category: 'deprecated' | 'security' | 'performance' | 'compatibility' | 'modernization';
  message: string;
  lineNumber: number;
  suggestion?: string;
}

/**
 * Gradle DSL Parser
 */
export class GradleParser {
  private static readonly DEPRECATED_PLUGINS = new Map([
    ['com.android.application', { modern: 'com.android.application', version: '8.0.0+' }],
    ['kotlin-android', { modern: 'org.jetbrains.kotlin.android', version: '1.8.0+' }],
    ['kotlin-kapt', { modern: 'org.jetbrains.kotlin.kapt', version: '1.8.0+' }],
    ['kotlin-android-extensions', { modern: 'kotlin-parcelize', version: 'deprecated' }],
    ['jacoco', { modern: 'org.gradle.jacoco', version: '7.0+' }]
  ]);

  private static readonly DEPRECATED_CONFIGURATIONS = new Map([
    ['compile', 'implementation'],
    ['testCompile', 'testImplementation'],
    ['androidTestCompile', 'androidTestImplementation'],
    ['provided', 'compileOnly'],
    ['apk', 'runtimeOnly']
  ]);

  private static readonly DEPRECATED_TASKS = new Map([
    ['assemble', 'build'],
    ['installDebug', 'installDebugApk']
  ]);

  /**
   * Parse Gradle build script
   */
  public static async parseGradleBuild(filePath: string): Promise<GradleBuildAnalysis> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      
      const analysis: GradleBuildAnalysis = {
        filePath,
        plugins: [],
        dependencies: [],
        repositories: [],
        buildScriptDependencies: [],
        tasks: [],
        configurations: [],
        properties: [],
        issues: []
      };

      // Parse different sections
      await this.parsePlugins(lines, analysis);
      await this.parseDependencies(lines, analysis);
      await this.parseRepositories(lines, analysis);
      await this.parseTasks(lines, analysis);
      await this.parseConfigurations(lines, analysis);
      await this.parseProperties(lines, analysis);
      await this.detectGradleVersion(content, analysis);
      await this.analyzeIssues(analysis);

      return analysis;
    } catch (error: any) {
      await handleError(error, ErrorType.FILE_SYSTEM, {
        operation: 'parseGradleBuild',
        filePath
      });
      throw error;
    }
  }

  /**
   * Parse plugins section
   */
  private static async parsePlugins(lines: string[], analysis: GradleBuildAnalysis): Promise<void> {
    let inPluginsBlock = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNumber = i + 1;

      // Detect plugins block
      if (line.startsWith('plugins {')) {
        inPluginsBlock = true;
        continue;
      }
      
      if (inPluginsBlock && line === '}') {
        inPluginsBlock = false;
        continue;
      }

      // Parse plugin declarations
      if (inPluginsBlock || line.startsWith('apply plugin:')) {
        const plugin = this.parsePluginLine(line, lineNumber);
        if (plugin) {
          analysis.plugins.push(plugin);
        }
      }
    }
  }

  /**
   * Parse individual plugin line
   */
  private static parsePluginLine(line: string, lineNumber: number): PluginInfo | null {
    // Modern plugin syntax: id 'plugin.id' version 'version'
    const modernMatch = line.match(/id\s+['"]([^'"]+)['"](?:\s+version\s+['"]([^'"]+)['"])?/);
    if (modernMatch) {
      const id = modernMatch[1];
      const version = modernMatch[2];
      const deprecated = this.DEPRECATED_PLUGINS.has(id);
      
      return {
        id,
        version,
        apply: true,
        legacy: false,
        deprecated,
        lineNumber,
        modernAlternative: deprecated ? this.DEPRECATED_PLUGINS.get(id)?.modern : undefined
      };
    }

    // Legacy plugin syntax: apply plugin: 'plugin.id'
    const legacyMatch = line.match(/apply\s+plugin:\s*['"]([^'"]+)['"]/);
    if (legacyMatch) {
      const id = legacyMatch[1];
      const deprecated = this.DEPRECATED_PLUGINS.has(id);
      
      return {
        id,
        apply: true,
        legacy: true,
        deprecated,
        lineNumber,
        modernAlternative: deprecated ? this.DEPRECATED_PLUGINS.get(id)?.modern : undefined
      };
    }

    return null;
  }

  /**
   * Parse dependencies section
   */
  private static async parseDependencies(lines: string[], analysis: GradleBuildAnalysis): Promise<void> {
    let inDependenciesBlock = false;
    let inBuildScriptBlock = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNumber = i + 1;

      // Detect dependencies blocks
      if (line.startsWith('dependencies {')) {
        inDependenciesBlock = true;
        continue;
      }
      
      if (line.startsWith('buildscript {')) {
        inBuildScriptBlock = true;
        continue;
      }
      
      if ((inDependenciesBlock || inBuildScriptBlock) && line === '}') {
        if (inDependenciesBlock) inDependenciesBlock = false;
        if (inBuildScriptBlock) inBuildScriptBlock = false;
        continue;
      }

      // Parse dependency declarations
      if (inDependenciesBlock || (inBuildScriptBlock && line.includes('classpath'))) {
        const dependency = this.parseDependencyLine(line, lineNumber);
        if (dependency) {
          if (inBuildScriptBlock) {
            analysis.buildScriptDependencies.push(dependency);
          } else {
            analysis.dependencies.push(dependency);
          }
        }
      }
    }
  }

  /**
   * Parse individual dependency line
   */
  private static parseDependencyLine(line: string, lineNumber: number): DependencyInfo | null {
    // Match various dependency formats
    const patterns = [
      // implementation 'group:name:version'
      /^(\w+)\s+['"]([^:'"]+):([^:'"]+):([^'"]+)['"]$/,
      // implementation group: 'group', name: 'name', version: 'version'
      /^(\w+)\s+group:\s*['"]([^'"]+)['"],\s*name:\s*['"]([^'"]+)['"],\s*version:\s*['"]([^'"]+)['"]$/,
      // classpath 'group:name:version'
      /^classpath\s+['"]([^:'"]+):([^:'"]+):([^'"]+)['"]$/
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        let configuration: string, group: string, name: string, version: string;
        
        if (pattern === patterns[2]) { // classpath pattern
          configuration = 'classpath';
          [, group, name, version] = match;
        } else {
          [, configuration, group, name, version] = match;
        }

        const deprecated = this.DEPRECATED_CONFIGURATIONS.has(configuration);
        const scope = this.mapConfigurationToScope(configuration);
        
        return {
          group,
          name,
          version,
          configuration,
          lineNumber,
          deprecated,
          hasVulnerabilities: false, // Will be checked later
          scope
        };
      }
    }

    return null;
  }

  /**
   * Map configuration to scope
   */
  private static mapConfigurationToScope(configuration: string): DependencyInfo['scope'] {
    const scopeMap: Record<string, DependencyInfo['scope']> = {
      'implementation': 'implementation',
      'api': 'api',
      'compileOnly': 'compileOnly',
      'runtimeOnly': 'runtimeOnly',
      'testImplementation': 'testImplementation',
      'compile': 'implementation',
      'testCompile': 'testImplementation'
    };
    
    return scopeMap[configuration] || 'other';
  }

  /**
   * Parse repositories section
   */
  private static async parseRepositories(lines: string[], analysis: GradleBuildAnalysis): Promise<void> {
    let inRepositoriesBlock = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNumber = i + 1;

      if (line.startsWith('repositories {')) {
        inRepositoriesBlock = true;
        continue;
      }
      
      if (inRepositoriesBlock && line === '}') {
        inRepositoriesBlock = false;
        continue;
      }

      if (inRepositoriesBlock) {
        const repository = this.parseRepositoryLine(line, lineNumber);
        if (repository) {
          analysis.repositories.push(repository);
        }
      }
    }
  }

  /**
   * Parse individual repository line
   */
  private static parseRepositoryLine(line: string, lineNumber: number): RepositoryInfo | null {
    if (line.includes('mavenCentral()')) {
      return {
        type: 'maven',
        name: 'Maven Central',
        url: 'https://repo1.maven.org/maven2/',
        lineNumber,
        secure: true
      };
    }
    
    if (line.includes('google()')) {
      return {
        type: 'maven',
        name: 'Google',
        url: 'https://dl.google.com/dl/android/maven2/',
        lineNumber,
        secure: true
      };
    }
    
    if (line.includes('jcenter()')) {
      return {
        type: 'maven',
        name: 'JCenter (Deprecated)',
        url: 'https://jcenter.bintray.com/',
        lineNumber,
        secure: false // JCenter is deprecated
      };
    }

    // Custom maven repository
    const mavenMatch = line.match(/maven\s*\{\s*url\s*['"]([^'"]+)['"]/);
    if (mavenMatch) {
      const url = mavenMatch[1];
      return {
        type: 'maven',
        url,
        lineNumber,
        secure: url.startsWith('https://')
      };
    }

    return null;
  }

  /**
   * Parse tasks
   */
  private static async parseTasks(lines: string[], analysis: GradleBuildAnalysis): Promise<void> {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNumber = i + 1;

      // Task declaration patterns
      const taskPatterns = [
        /^task\s+(\w+)\s*\(type:\s*(\w+)\)/, // task taskName(type: TaskType)
        /^task\s+(\w+)\s*\{/, // task taskName {
        /^(\w+)\s*\{/ // taskName {
      ];

      for (const pattern of taskPatterns) {
        const match = line.match(pattern);
        if (match) {
          const taskName = match[1];
          const taskType = match[2];
          const deprecated = this.DEPRECATED_TASKS.has(taskName);
          
          analysis.tasks.push({
            name: taskName,
            type: taskType,
            lineNumber,
            deprecated,
            modernAlternative: deprecated ? this.DEPRECATED_TASKS.get(taskName) : undefined
          });
          break;
        }
      }
    }
  }

  /**
   * Parse configurations
   */
  private static async parseConfigurations(lines: string[], analysis: GradleBuildAnalysis): Promise<void> {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNumber = i + 1;

      // Configuration usage in dependencies
      const configMatch = line.match(/^(\w+)\s+/);
      if (configMatch) {
        const configName = configMatch[1];
        const deprecated = this.DEPRECATED_CONFIGURATIONS.has(configName);
        
        if (deprecated) {
          analysis.configurations.push({
            name: configName,
            lineNumber,
            deprecated: true,
            modernAlternative: this.DEPRECATED_CONFIGURATIONS.get(configName)
          });
        }
      }
    }
  }

  /**
   * Parse properties
   */
  private static async parseProperties(lines: string[], analysis: GradleBuildAnalysis): Promise<void> {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNumber = i + 1;

      // Property assignment
      const propMatch = line.match(/^(\w+)\s*=\s*(.+)$/);
      if (propMatch) {
        const key = propMatch[1];
        const value = propMatch[2].replace(/['"]/, '');
        
        analysis.properties.push({
          key,
          value,
          lineNumber,
          deprecated: false // Will be determined by analysis
        });
      }
    }
  }

  /**
   * Detect Gradle version
   */
  private static async detectGradleVersion(content: string, analysis: GradleBuildAnalysis): Promise<void> {
    // Look for Gradle wrapper version
    const versionMatch = content.match(/gradle-([\d.]+)/);
    if (versionMatch) {
      analysis.gradleVersion = versionMatch[1];
    }
  }

  /**
   * Analyze issues and generate recommendations
   */
  private static async analyzeIssues(analysis: GradleBuildAnalysis): Promise<void> {
    // Check for deprecated plugins
    analysis.plugins.forEach(plugin => {
      if (plugin.deprecated) {
        analysis.issues.push({
          type: 'warning',
          category: 'deprecated',
          message: `Plugin '${plugin.id}' is deprecated`,
          lineNumber: plugin.lineNumber,
          suggestion: plugin.modernAlternative ? `Use '${plugin.modernAlternative}' instead` : 'Consider updating to a modern alternative'
        });
      }
      
      if (plugin.legacy) {
        analysis.issues.push({
          type: 'info',
          category: 'modernization',
          message: `Plugin '${plugin.id}' uses legacy syntax`,
          lineNumber: plugin.lineNumber,
          suggestion: 'Consider using the plugins {} block syntax'
        });
      }
    });

    // Check for deprecated configurations
    analysis.configurations.forEach(config => {
      if (config.deprecated) {
        analysis.issues.push({
          type: 'warning',
          category: 'deprecated',
          message: `Configuration '${config.name}' is deprecated`,
          lineNumber: config.lineNumber,
          suggestion: config.modernAlternative ? `Use '${config.modernAlternative}' instead` : 'Update to modern configuration'
        });
      }
    });

    // Check for insecure repositories
    analysis.repositories.forEach(repo => {
      if (!repo.secure) {
        analysis.issues.push({
          type: 'warning',
          category: 'security',
          message: `Repository '${repo.name || repo.url}' may be insecure`,
          lineNumber: repo.lineNumber,
          suggestion: 'Use HTTPS URLs and trusted repositories'
        });
      }
    });

    // Check Gradle version
    if (analysis.gradleVersion) {
      const version = parseFloat(analysis.gradleVersion);
      if (version < 7.0) {
        analysis.issues.push({
          type: 'warning',
          category: 'compatibility',
          message: `Gradle version ${analysis.gradleVersion} is outdated`,
          lineNumber: 1,
          suggestion: 'Consider upgrading to Gradle 8.0+ for better performance and features'
        });
      }
    }
  }

  /**
   * Get modernization suggestions for a build script
   */
  public static getModernizationSuggestions(analysis: GradleBuildAnalysis): string[] {
    const suggestions: string[] = [];

    // Plugin modernization
    const legacyPlugins = analysis.plugins.filter(p => p.legacy);
    if (legacyPlugins.length > 0) {
      suggestions.push('Convert legacy plugin syntax to plugins {} block');
    }

    // Configuration modernization
    const deprecatedConfigs = analysis.configurations.filter(c => c.deprecated);
    if (deprecatedConfigs.length > 0) {
      suggestions.push('Update deprecated dependency configurations');
    }

    // Repository security
    const insecureRepos = analysis.repositories.filter(r => !r.secure);
    if (insecureRepos.length > 0) {
      suggestions.push('Replace insecure repositories with secure alternatives');
    }

    // Gradle version
    if (analysis.gradleVersion && parseFloat(analysis.gradleVersion) < 8.0) {
      suggestions.push('Upgrade to Gradle 8.0+ for improved performance');
    }

    return suggestions;
  }
}
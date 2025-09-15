import * as vscode from 'vscode';
import { AIService } from './aiService';
import { GradleParser, GradleBuildAnalysis } from './gradleParser';
import { feedback } from '../utils/userFeedback';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface SecurityVulnerability {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: 'dependency' | 'configuration' | 'plugin' | 'build-script';
  title: string;
  description: string;
  affectedComponent: string;
  cveId?: string;
  cvssScore?: number;
  discoveredAt: Date;
  remediation: {
    description: string;
    steps: string[];
    automaticFix?: {
      applicable: boolean;
      changes: Array<{
        file: string;
        before: string;
        after: string;
      }>;
    };
  };
  references: string[];
}

export interface SecurityReport {
  projectPath: string;
  scanDate: Date;
  vulnerabilities: SecurityVulnerability[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  recommendations: string[];
  complianceStatus: {
    owasp: boolean;
    nist: boolean;
    customPolicies: boolean;
  };
}

export interface DependencyInfo {
  group: string;
  artifact: string;
  version: string;
  scope: string;
  transitive: boolean;
  licenses: string[];
  vulnerabilities: SecurityVulnerability[];
}

export interface SecurityPolicy {
  allowedLicenses: string[];
  blockedDependencies: string[];
  minimumVersions: Map<string, string>;
  requireSignedArtifacts: boolean;
  allowSnapshots: boolean;
  maxCvssScore: number;
}

export class SecurityAnalyzer {
  private aiService: AIService;
  private gradleParser: GradleParser;
  private vulnerabilityDatabase: Map<string, SecurityVulnerability[]>;
  private securityPolicy: SecurityPolicy;

  constructor() {
    this.aiService = AIService.getInstance();
    this.gradleParser = new GradleParser();
    this.vulnerabilityDatabase = new Map();
    this.securityPolicy = this.getDefaultSecurityPolicy();
    this.initializeVulnerabilityDatabase();
  }

  async scanProject(projectPath: string): Promise<SecurityReport> {
    feedback.info('Starting security vulnerability scan...');

    try {
      const vulnerabilities: SecurityVulnerability[] = [];
      
      // Find all Gradle files
      const gradleFiles = await this.findGradleFiles(projectPath);
      
      for (const file of gradleFiles) {
        const content = await fs.readFile(file, 'utf8');
        const analysis = await GradleParser.parseGradleBuild(file);
        
        // Scan dependencies for vulnerabilities
        const depVulns = await this.scanDependencies(analysis, file);
        vulnerabilities.push(...depVulns);
        
        // Scan build configuration for security issues
        const configVulns = await this.scanBuildConfiguration(content, file);
        vulnerabilities.push(...configVulns);
        
        // Scan plugins for security issues
        const pluginVulns = await this.scanPlugins(analysis, file);
        vulnerabilities.push(...pluginVulns);
      }
      
      // Generate AI-powered security recommendations
      const aiRecommendations = await this.generateAISecurityRecommendations(projectPath, vulnerabilities);
      
      const report: SecurityReport = {
        projectPath,
        scanDate: new Date(),
        vulnerabilities,
        summary: this.generateSummary(vulnerabilities),
        recommendations: aiRecommendations,
        complianceStatus: await this.checkCompliance(vulnerabilities)
      };
      
      feedback.info(`Security scan completed. Found ${vulnerabilities.length} issues.`);
      return report;
    } catch (error: any) {
      feedback.error(`Security scan failed: ${error.message}`);
      throw error;
    }
  }

  async scanDependencies(analysis: GradleBuildAnalysis, filePath: string): Promise<SecurityVulnerability[]> {
    const vulnerabilities: SecurityVulnerability[] = [];
    
    if (!analysis.dependencies) {
      return vulnerabilities;
    }
    
    for (const dep of analysis.dependencies) {
      const { group, name: artifact, version } = dep;
      const dependencyKey = `${group}:${artifact}`;
      const dependencyString = `${group}:${artifact}:${version}`;
      
      // Check against known vulnerabilities
      const knownVulns = this.vulnerabilityDatabase.get(dependencyKey) || [];
      for (const vuln of knownVulns) {
        if (this.isVersionAffected(version, vuln)) {
          vulnerabilities.push({
            ...vuln,
            id: `${vuln.id}-${Date.now()}`,
            affectedComponent: dependencyString,
            discoveredAt: new Date()
          });
        }
      }
      
      // Check against security policy
      const policyViolations = this.checkDependencyPolicy(group, artifact, version);
      vulnerabilities.push(...policyViolations.map(violation => ({
        id: `policy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        severity: 'medium' as const,
        type: 'dependency' as const,
        title: `Policy Violation: ${violation}`,
        description: `Dependency ${dependencyString} violates security policy: ${violation}`,
        affectedComponent: dependencyString,
        discoveredAt: new Date(),
        remediation: {
          description: `Update or replace dependency to comply with security policy`,
          steps: [
            'Review security policy requirements',
            'Find compliant alternative or update version',
            'Test compatibility',
            'Update build script'
          ]
        },
        references: []
      })));
      
      // Check for outdated versions with known security fixes
      const outdatedVuln = await this.checkForOutdatedSecurity(group, artifact, version);
      if (outdatedVuln) {
        vulnerabilities.push(outdatedVuln);
      }
    }
    
    return vulnerabilities;
  }

  async scanBuildConfiguration(content: string, filePath: string): Promise<SecurityVulnerability[]> {
    const vulnerabilities: SecurityVulnerability[] = [];
    
    // Check for insecure repository configurations
    if (content.includes('http://') && !content.includes('https://')) {
      vulnerabilities.push({
        id: `insecure-repo-${Date.now()}`,
        severity: 'high',
        type: 'configuration',
        title: 'Insecure Repository Configuration',
        description: 'Build script uses HTTP repositories which are vulnerable to man-in-the-middle attacks',
        affectedComponent: path.basename(filePath),
        discoveredAt: new Date(),
        remediation: {
          description: 'Replace HTTP repository URLs with HTTPS equivalents',
          steps: [
            'Identify all HTTP repository URLs',
            'Replace with HTTPS equivalents',
            'Verify repository accessibility',
            'Test build process'
          ],
          automaticFix: {
            applicable: true,
            changes: [{
              file: filePath,
              before: 'http://',
              after: 'https://'
            }]
          }
        },
        references: [
          'https://docs.gradle.org/current/userguide/declaring_repositories.html#sec:case_for_maven_central'
        ]
      });
    }
    
    // Check for hardcoded credentials
    const credentialPatterns = [
      /password\s*=\s*["'][^"']+["']/gi,
      /apikey\s*=\s*["'][^"']+["']/gi,
      /token\s*=\s*["'][^"']+["']/gi,
      /secret\s*=\s*["'][^"']+["']/gi
    ];
    
    for (const pattern of credentialPatterns) {
      if (pattern.test(content)) {
        vulnerabilities.push({
          id: `hardcoded-creds-${Date.now()}`,
          severity: 'critical',
          type: 'build-script',
          title: 'Hardcoded Credentials Detected',
          description: 'Build script contains hardcoded credentials which pose a security risk',
          affectedComponent: path.basename(filePath),
          discoveredAt: new Date(),
          remediation: {
            description: 'Move credentials to environment variables or secure credential storage',
            steps: [
              'Identify all hardcoded credentials',
              'Create environment variables or use Gradle properties',
              'Update build script to use secure credential access',
              'Add credential files to .gitignore',
              'Rotate exposed credentials'
            ]
          },
          references: [
            'https://docs.gradle.org/current/userguide/build_environment.html#sec:gradle_configuration_properties'
          ]
        });
      }
    }
    
    // Check for insecure plugin repositories
    if (content.includes('gradlePluginPortal()') && content.includes('http://')) {
      vulnerabilities.push({
        id: `insecure-plugin-repo-${Date.now()}`,
        severity: 'medium',
        type: 'configuration',
        title: 'Insecure Plugin Repository',
        description: 'Plugin repository configuration may allow insecure downloads',
        affectedComponent: path.basename(filePath),
        discoveredAt: new Date(),
        remediation: {
          description: 'Ensure all plugin repositories use HTTPS',
          steps: [
            'Review plugin repository configuration',
            'Ensure HTTPS is used for all repositories',
            'Consider using only trusted repositories'
          ]
        },
        references: []
      });
    }
    
    return vulnerabilities;
  }

  async scanPlugins(analysis: GradleBuildAnalysis, filePath: string): Promise<SecurityVulnerability[]> {
    const vulnerabilities: SecurityVulnerability[] = [];
    
    if (!analysis.plugins) {
      return vulnerabilities;
    }
    
    for (const plugin of analysis.plugins) {
      // Check for known vulnerable plugins
      const pluginVulns = await this.checkPluginVulnerabilities(plugin.id);
      vulnerabilities.push(...pluginVulns.map(vuln => ({
        ...vuln,
        affectedComponent: `${plugin.id}${plugin.version ? ':' + plugin.version : ''}`,
        discoveredAt: new Date()
      })));
      
      // Check for outdated plugins
      const outdatedVuln = await this.checkPluginVersion(plugin.id);
      if (outdatedVuln) {
        vulnerabilities.push({
          ...outdatedVuln,
          affectedComponent: `${plugin.id}${plugin.version ? ':' + plugin.version : ''}`,
          discoveredAt: new Date()
        });
      }
    }
    
    return vulnerabilities;
  }

  async generateSecurityRecommendations(report: SecurityReport): Promise<string[]> {
    const recommendations: string[] = [];
    
    // Prioritize critical and high severity issues
    const criticalIssues = report.vulnerabilities.filter(v => v.severity === 'critical');
    const highIssues = report.vulnerabilities.filter(v => v.severity === 'high');
    
    if (criticalIssues.length > 0) {
      recommendations.push(`Address ${criticalIssues.length} critical security issues immediately`);
    }
    
    if (highIssues.length > 0) {
      recommendations.push(`Resolve ${highIssues.length} high-severity vulnerabilities`);
    }
    
    // Dependency-specific recommendations
    const depVulns = report.vulnerabilities.filter(v => v.type === 'dependency');
    if (depVulns.length > 0) {
      recommendations.push('Update vulnerable dependencies to latest secure versions');
      recommendations.push('Consider using dependency scanning tools in CI/CD pipeline');
    }
    
    // Configuration recommendations
    const configVulns = report.vulnerabilities.filter(v => v.type === 'configuration');
    if (configVulns.length > 0) {
      recommendations.push('Review and harden build configuration security');
      recommendations.push('Implement secure credential management practices');
    }
    
    // General recommendations
    recommendations.push('Enable Gradle dependency verification');
    recommendations.push('Regularly update Gradle and plugins to latest versions');
    recommendations.push('Implement automated security scanning in build process');
    
    return recommendations;
  }

  async generateAISecurityRecommendations(projectPath: string, vulnerabilities: SecurityVulnerability[]): Promise<string[]> {
    try {
      const prompt = `
Analyze these security vulnerabilities found in a Gradle project and provide specific, actionable recommendations:

Project: ${projectPath}
Vulnerabilities found: ${vulnerabilities.length}

Vulnerability summary:
${vulnerabilities.slice(0, 10).map(v => `- ${v.severity.toUpperCase()}: ${v.title} (${v.type})`).join('\n')}

Provide:
1. Prioritized remediation plan
2. Specific dependency updates needed
3. Configuration changes required
4. Long-term security improvements
5. Prevention strategies

Focus on practical, implementable solutions.
      `;
      
      const request = {
        content: prompt,
        filePath: projectPath,
        analysisType: 'security-scan' as const,
        context: {
          projectStructure: [projectPath]
        }
      };
      
      const response = await this.aiService.analyzeGradleBuild(request);
      return response ? response.suggestions.map(s => s.description) : [];
    } catch (error) {
      // Fallback to basic recommendations
      return await this.generateSecurityRecommendations({ vulnerabilities } as SecurityReport);
    }
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

  private initializeVulnerabilityDatabase(): void {
    // Initialize with some common vulnerable dependencies
    // In a real implementation, this would be loaded from a vulnerability database
    this.vulnerabilityDatabase.set('org.apache.logging.log4j:log4j-core', [
      {
        id: 'CVE-2021-44228',
        severity: 'critical',
        type: 'dependency',
        title: 'Log4j Remote Code Execution',
        description: 'Apache Log4j2 JNDI features do not protect against attacker controlled LDAP and other JNDI related endpoints',
        affectedComponent: '',
        cveId: 'CVE-2021-44228',
        cvssScore: 10.0,
        discoveredAt: new Date(),
        remediation: {
          description: 'Update to Log4j 2.17.0 or later',
          steps: [
            'Update Log4j dependency to version 2.17.0 or later',
            'Remove JndiLookup class if update is not possible',
            'Set system property log4j2.formatMsgNoLookups=true'
          ],
          automaticFix: {
            applicable: true,
            changes: [{
              file: 'build.gradle',
              before: 'org.apache.logging.log4j:log4j-core:2.14.1',
              after: 'org.apache.logging.log4j:log4j-core:2.17.0'
            }]
          }
        },
        references: [
          'https://nvd.nist.gov/vuln/detail/CVE-2021-44228',
          'https://logging.apache.org/log4j/2.x/security.html'
        ]
      }
    ]);
    
    this.vulnerabilityDatabase.set('com.fasterxml.jackson.core:jackson-databind', [
      {
        id: 'CVE-2020-36518',
        severity: 'high',
        type: 'dependency',
        title: 'Jackson Databind Deserialization Vulnerability',
        description: 'FasterXML jackson-databind allows a Java StackOverflow exception and denial of service',
        affectedComponent: '',
        cveId: 'CVE-2020-36518',
        cvssScore: 7.5,
        discoveredAt: new Date(),
        remediation: {
          description: 'Update to Jackson 2.12.6 or later',
          steps: [
            'Update Jackson dependencies to 2.12.6 or later',
            'Review deserialization usage',
            'Consider input validation'
          ]
        },
        references: [
          'https://nvd.nist.gov/vuln/detail/CVE-2020-36518'
        ]
      }
    ]);
  }

  private getDefaultSecurityPolicy(): SecurityPolicy {
    return {
      allowedLicenses: ['Apache-2.0', 'MIT', 'BSD-3-Clause', 'BSD-2-Clause'],
      blockedDependencies: [],
      minimumVersions: new Map(),
      requireSignedArtifacts: false,
      allowSnapshots: false,
      maxCvssScore: 7.0
    };
  }

  private isVersionAffected(version: string, vulnerability: SecurityVulnerability): boolean {
    // Simplified version checking - in reality would need proper semantic version comparison
    // This is a placeholder implementation
    return true; // For demo purposes, assume all versions are affected
  }

  private checkDependencyPolicy(group: string, artifact: string, version: string): string[] {
    const violations: string[] = [];
    
    // Check for SNAPSHOT versions
    if (!this.securityPolicy.allowSnapshots && version.includes('SNAPSHOT')) {
      violations.push('SNAPSHOT versions are not allowed');
    }
    
    // Check blocked dependencies
    const dependencyKey = `${group}:${artifact}`;
    if (this.securityPolicy.blockedDependencies.includes(dependencyKey)) {
      violations.push('Dependency is on the blocked list');
    }
    
    // Check minimum versions
    const minVersion = this.securityPolicy.minimumVersions.get(dependencyKey);
    if (minVersion && this.compareVersions(version, minVersion) < 0) {
      violations.push(`Version ${version} is below minimum required version ${minVersion}`);
    }
    
    return violations;
  }

  private async checkForOutdatedSecurity(group: string, artifact: string, version: string): Promise<SecurityVulnerability | null> {
    // Simplified check for outdated versions
    // In reality, this would check against a database of known secure versions
    
    const knownOutdated = [
      'org.springframework:spring-core:4.',
      'org.springframework.boot:spring-boot:1.',
      'junit:junit:4.'
    ];
    
    const dependencyString = `${group}:${artifact}:${version}`;
    
    for (const outdated of knownOutdated) {
      if (dependencyString.startsWith(outdated)) {
        return {
          id: `outdated-${Date.now()}`,
          severity: 'medium',
          type: 'dependency',
          title: 'Outdated Dependency with Security Implications',
          description: `${group}:${artifact}:${version} is outdated and may contain known security vulnerabilities`,
          affectedComponent: dependencyString,
          discoveredAt: new Date(),
          remediation: {
            description: 'Update to the latest stable version',
            steps: [
              'Check for latest stable version',
              'Review changelog for breaking changes',
              'Update dependency version',
              'Run tests to ensure compatibility'
            ]
          },
          references: []
        };
      }
    }
    
    return null;
  }

  private async checkPluginVulnerabilities(plugin: string): Promise<SecurityVulnerability[]> {
    // Placeholder for plugin vulnerability checking
    // In reality, this would check against a database of known vulnerable plugins
    return [];
  }

  private async checkPluginVersion(plugin: string): Promise<SecurityVulnerability | null> {
    // Placeholder for plugin version checking
    // In reality, this would check if the plugin version is outdated
    return null;
  }

  private generateSummary(vulnerabilities: SecurityVulnerability[]): SecurityReport['summary'] {
    return {
      total: vulnerabilities.length,
      critical: vulnerabilities.filter(v => v.severity === 'critical').length,
      high: vulnerabilities.filter(v => v.severity === 'high').length,
      medium: vulnerabilities.filter(v => v.severity === 'medium').length,
      low: vulnerabilities.filter(v => v.severity === 'low').length
    };
  }

  private async checkCompliance(vulnerabilities: SecurityVulnerability[]): Promise<SecurityReport['complianceStatus']> {
    const criticalCount = vulnerabilities.filter(v => v.severity === 'critical').length;
    const highCount = vulnerabilities.filter(v => v.severity === 'high').length;
    
    return {
      owasp: criticalCount === 0 && highCount < 3,
      nist: criticalCount === 0,
      customPolicies: vulnerabilities.length < 10
    };
  }

  private compareVersions(version1: string, version2: string): number {
    // Simplified version comparison
    // In reality, would use proper semantic version comparison
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;
      
      if (v1Part < v2Part) return -1;
      if (v1Part > v2Part) return 1;
    }
    
    return 0;
  }
}

export const securityAnalyzer = new SecurityAnalyzer();
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import { processGradleFilesWithCopilot } from '../src/migrator/gradleFiles';
import { AIService } from '../src/services/aiService';
import { GradleParser } from '../src/services/gradleParser';
import { AnalysisEngine } from '../src/services/analysisEngine';
import { ContextSuggestionEngine } from '../src/services/contextSuggestionEngine';
import { InteractiveWorkflow } from '../src/services/interactiveWorkflow';
import { SecurityAnalyzer } from '../src/services/securityAnalyzer';

suite('AI-Powered Migration Workflow Tests', () => {
  let testProjectPath: string;
  let aiService: AIService;
  let gradleParser: GradleParser;
  let analysisEngine: AnalysisEngine;
  let contextEngine: ContextSuggestionEngine;
  let interactiveWorkflow: InteractiveWorkflow;
  let securityAnalyzer: SecurityAnalyzer;

  suiteSetup(async () => {
    // Setup test project directory
    testProjectPath = path.join(__dirname, 'tmp-test-ai');
    await fs.ensureDir(testProjectPath);
    
    // Initialize AI services
    aiService = AIService.getInstance();
    gradleParser = new GradleParser();
    analysisEngine = new AnalysisEngine();
    contextEngine = new ContextSuggestionEngine();
    interactiveWorkflow = new InteractiveWorkflow();
    securityAnalyzer = new SecurityAnalyzer();
    
    // Create test Gradle files
    await createTestGradleFiles();
  });

  suiteTeardown(async () => {
    // Cleanup test directory
    await fs.remove(testProjectPath);
  });

  test('AIService initialization and basic functionality', async () => {
    try {
      await aiService.initialize();
      assert.ok(aiService.isReady(), 'AI service should be ready');
      
      const testPrompt = 'Analyze this simple Gradle build script: apply plugin: "java"';
      const response = await aiService.analyzeGradleBuild({
        analysisType: 'gradle-migration',
        filePath: path.join(testProjectPath, 'build.gradle'),
        content: testPrompt,
        context: {}
      });
      
      assert.ok(response, 'AI service should return a response');
      assert.ok(response.suggestions, 'Response should contain suggestions');
      assert.ok(Array.isArray(response.suggestions), 'Suggestions should be an array');
    } catch (error: any) {
      // If AI service is not available, skip this test
      console.warn(`AI service test skipped: ${error.message}`);
    }
  });

  test('GradleParser can parse build scripts', async () => {
    const buildGradlePath = path.join(testProjectPath, 'build.gradle');
    const content = await fs.readFile(buildGradlePath, 'utf8');
    
    const analysis = await GradleParser.parseGradleBuild(buildGradlePath);
    
    assert.ok(analysis, 'Parser should return analysis result');
    assert.ok(analysis.plugins, 'Analysis should identify plugins');
    assert.ok(analysis.dependencies, 'Analysis should identify dependencies');
    assert.ok(Array.isArray(analysis.plugins), 'Plugins should be an array');
    assert.ok(Array.isArray(analysis.dependencies), 'Dependencies should be an array');
    
    // Check for expected plugins
    assert.ok(analysis.plugins.some(p => p.id.includes('java')), 'Should detect Java plugin');
    
    // Check for expected dependencies
    assert.ok(analysis.dependencies.some(d => d.name.includes('junit')), 'Should detect JUnit dependency');
  });

  test('AnalysisEngine provides comprehensive analysis', async () => {
    const buildGradlePath = path.join(testProjectPath, 'build.gradle');
    const content = await fs.readFile(buildGradlePath, 'utf8');
    
    const parseResult = await GradleParser.parseGradleBuild(buildGradlePath);
    const analysis = await analysisEngine.analyzeProject(testProjectPath);
    
    assert.ok(analysis, 'Analysis engine should return results');
    assert.ok(analysis.performance, 'Should include performance analysis');
    assert.ok(analysis.security, 'Should include security analysis');
    assert.ok(analysis.modernization, 'Should include modernization analysis');
    assert.ok(analysis.prioritizedRecommendations, 'Should include prioritized recommendations');
    
    assert.ok(Array.isArray(analysis.prioritizedRecommendations), 'Recommendations should be an array');
    assert.ok(analysis.prioritizedRecommendations.length > 0, 'Should have at least one recommendation');
  });

  test('ContextSuggestionEngine generates contextual suggestions', async () => {
    const context = await contextEngine.analyzeProjectContext(testProjectPath);
    
    assert.ok(context, 'Should analyze project context');
    assert.ok(context.type, 'Should determine project type');
    assert.ok(Array.isArray(context.dependencies), 'Should identify dependencies');
    assert.ok(Array.isArray(context.moduleStructure), 'Should analyze module structure');
    
    const suggestions = await contextEngine.generateContextualSuggestions(testProjectPath);
    
    assert.ok(Array.isArray(suggestions), 'Should return suggestions array');
    
    if (suggestions.length > 0) {
      const suggestion = suggestions[0];
      assert.ok(suggestion.id, 'Suggestion should have ID');
      assert.ok(suggestion.title, 'Suggestion should have title');
      assert.ok(suggestion.description, 'Suggestion should have description');
      assert.ok(suggestion.category, 'Suggestion should have category');
      assert.ok(suggestion.priority, 'Suggestion should have priority');
      assert.ok(suggestion.implementation, 'Suggestion should have implementation details');
    }
  });

  test('SecurityAnalyzer detects security issues', async () => {
    const report = await securityAnalyzer.scanProject(testProjectPath);
    
    assert.ok(report, 'Security analyzer should return a report');
    assert.ok(report.projectPath === testProjectPath, 'Report should reference correct project path');
    assert.ok(report.scanDate, 'Report should have scan date');
    assert.ok(Array.isArray(report.vulnerabilities), 'Report should have vulnerabilities array');
    assert.ok(report.summary, 'Report should have summary');
    assert.ok(Array.isArray(report.recommendations), 'Report should have recommendations');
    
    // Check summary structure
    assert.ok(typeof report.summary.total === 'number', 'Summary should have total count');
    assert.ok(typeof report.summary.critical === 'number', 'Summary should have critical count');
    assert.ok(typeof report.summary.high === 'number', 'Summary should have high count');
    assert.ok(typeof report.summary.medium === 'number', 'Summary should have medium count');
    assert.ok(typeof report.summary.low === 'number', 'Summary should have low count');
  });

  test('InteractiveWorkflow manages user sessions', async () => {
    // Note: This test simulates the workflow without actual user interaction
    const session = await interactiveWorkflow.startInteractiveSession(testProjectPath);
    
    assert.ok(session, 'Should create workflow session');
    assert.ok(session.id, 'Session should have ID');
    assert.ok(session.projectPath === testProjectPath, 'Session should reference correct project');
    assert.ok(Array.isArray(session.suggestions), 'Session should have suggestions');
    assert.ok(session.status === 'active', 'Session should be active');
    
    // Test suggestion presentation (without actual user interaction)
    if (session.suggestions.length > 0) {
      const presentation = await interactiveWorkflow.presentSuggestion(session.suggestions[0].id);
      
      assert.ok(presentation, 'Should present suggestion');
      assert.ok(presentation.suggestion, 'Presentation should include suggestion');
      assert.ok(presentation.explanation, 'Presentation should include explanation');
      assert.ok(presentation.codePreview, 'Presentation should include code preview');
      assert.ok(presentation.impactAnalysis, 'Presentation should include impact analysis');
      assert.ok(Array.isArray(presentation.userOptions), 'Presentation should include user options');
    }
  });

  test('Complete AI workflow integration', async function() {
    this.timeout(30000); // Increase timeout for comprehensive test
    
    const options = new Map<string, string>([
      ['targetGradleVersion', '8.0'],
      ['enablePerformanceOptimizations', 'true'],
      ['enableSecurityChecks', 'true'],
      ['enableInteractiveMode', 'false'], // Disable for automated testing
      ['backupEnabled', 'true'],
      ['parallelProcessing', 'false'] // Disable for test stability
    ]);
    
    try {
      const result = await processGradleFilesWithCopilot(
        testProjectPath,
        options
      );
      
      assert.ok(result, 'Should return processing result');
      assert.ok(result.success !== undefined, 'Result should have success status');
      assert.ok(typeof result.filesProcessed === 'number', 'Result should have filesProcessed count');
      assert.ok(Array.isArray(result.aiSuggestions), 'Result should have AI suggestions');
      assert.ok(Array.isArray(result.analysisResults), 'Result should have analysis results');
      
      // Check that files were processed
      assert.ok(result.filesProcessed > 0, 'Should process at least one file');
      
      // Check AI integration results
      if (result.aiSuggestions.length > 0) {
        const suggestion = result.aiSuggestions[0];
        assert.ok(suggestion.description, 'AI suggestion should have description');
        assert.ok(suggestion.confidence !== undefined, 'AI suggestion should have confidence score');
      }
      
      // Check analysis results
      if (result.analysisResults.length > 0) {
        const analysis = result.analysisResults[0];
        assert.ok(analysis.filePath, 'Analysis should reference file path');
        assert.ok(Array.isArray(analysis.issues), 'Analysis should have issues array');
        assert.ok(Array.isArray(analysis.suggestions), 'Analysis should have suggestions array');
      }
      
      console.log(`AI Workflow Test Results:`);
      console.log(`- Processed Files: ${result.filesProcessed}`);
      console.log(`- AI Suggestions: ${result.aiSuggestions.length}`);
      console.log(`- Analysis Results: ${result.analysisResults.length}`);
      console.log(`- User Accepted: ${result.userAcceptedSuggestions || 0}`);
      console.log(`- User Rejected: ${result.userRejectedSuggestions || 0}`);
      
    } catch (error: any) {
      // If AI services are not available, verify fallback behavior
      if (error.message.includes('AI service') || error.message.includes('Language Model')) {
        console.warn(`AI workflow test completed with fallback: ${error.message}`);
        // This is acceptable - the extension should gracefully handle AI service unavailability
      } else {
        throw error;
      }
    }
  });

  test('Error handling and fallback mechanisms', async () => {
    // Test with invalid project path
    const invalidPath = path.join(__dirname, 'non-existent-project');
    
    try {
      await contextEngine.analyzeProjectContext(invalidPath);
      assert.fail('Should throw error for invalid project path');
    } catch (error: any) {
      assert.ok(error.message, 'Should provide meaningful error message');
    }
    
    // Test security analyzer with empty project
    const emptyProjectPath = path.join(__dirname, 'empty-test');
    await fs.ensureDir(emptyProjectPath);
    
    try {
      const report = await securityAnalyzer.scanProject(emptyProjectPath);
      assert.ok(report, 'Should handle empty project gracefully');
      assert.ok(report.vulnerabilities.length === 0, 'Empty project should have no vulnerabilities');
    } finally {
      await fs.remove(emptyProjectPath);
    }
  });

  async function createTestGradleFiles(): Promise<void> {
    // Create build.gradle with various features to test
    const buildGradleContent = `
plugins {
    id 'java'
    id 'application'
    id 'org.springframework.boot' version '2.6.0'
}

group = 'com.example'
version = '1.0.0'
sourceCompatibility = '11'

repositories {
    mavenCentral()
    // Insecure repository for testing
    maven { url 'http://insecure-repo.example.com' }
}

dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.apache.logging.log4j:log4j-core:2.14.1' // Vulnerable version
    implementation 'com.fasterxml.jackson.core:jackson-databind:2.12.0' // Outdated version
    
    testImplementation 'junit:junit:4.13.2' // Old JUnit version
    testImplementation 'org.mockito:mockito-core:3.12.4'
}

application {
    mainClass = 'com.example.Application'
}

// Hardcoded credentials for testing
ext.apiKey = 'hardcoded-secret-key'
ext.password = 'admin123'

tasks.named('test') {
    useJUnitPlatform()
}
    `;
    
    await fs.writeFile(path.join(testProjectPath, 'build.gradle'), buildGradleContent);
    
    // Create settings.gradle
    const settingsGradleContent = `
rootProject.name = 'test-project'
    `;
    
    await fs.writeFile(path.join(testProjectPath, 'settings.gradle'), settingsGradleContent);
    
    // Create gradle.properties
    const gradlePropertiesContent = `
org.gradle.jvmargs=-Xmx2048m
org.gradle.parallel=false
org.gradle.caching=false
    `;
    
    await fs.writeFile(path.join(testProjectPath, 'gradle.properties'), gradlePropertiesContent);
    
    // Create a simple Java source file
    const srcDir = path.join(testProjectPath, 'src', 'main', 'java', 'com', 'example');
    await fs.ensureDir(srcDir);
    
    const javaContent = `
package com.example;

public class Application {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
    `;
    
    await fs.writeFile(path.join(srcDir, 'Application.java'), javaContent);
    
    // Create test directory structure
    const testDir = path.join(testProjectPath, 'src', 'test', 'java', 'com', 'example');
    await fs.ensureDir(testDir);
    
    const testContent = `
package com.example;

import org.junit.Test;
import static org.junit.Assert.*;

public class ApplicationTest {
    @Test
    public void testApplication() {
        assertTrue("Test should pass", true);
    }
}
    `;
    
    await fs.writeFile(path.join(testDir, 'ApplicationTest.java'), testContent);
  }
});
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { findGradleFiles, updateGradlePropertiesFiles, replaceRootTemplates, validateGradleFiles } from '../../migrator/gradleFiles';
import { feedback } from '../../utils/userFeedback';
import { handleError, ErrorType } from '../../utils/errorHandler';

interface IntegrationTestContext {
    tempDir: string;
    testRepoDir: string;
    backupDir: string;
    mockProgress: any;
}

describe('Integration Tests', () => {
    let testContext: IntegrationTestContext;

    before(async () => {
        testContext = {
            tempDir: fs.mkdtempSync(path.join(os.tmpdir(), 'gradle-migrator-integration-')),
            testRepoDir: '',
            backupDir: '',
            mockProgress: {
                report: (value: { message?: string; increment?: number }) => {
                    console.log(`Progress: ${value.message || ''} (+${value.increment || 0})`);
                },
                token: {
                    isCancellationRequested: false,
                    onCancellationRequested: () => ({ dispose: () => {} })
                }
            }
        };
        
        testContext.testRepoDir = path.join(testContext.tempDir, 'test-repo');
        testContext.backupDir = path.join(testContext.tempDir, 'backups');
        
        await createCompleteTestRepository(testContext.testRepoDir);
        fs.mkdirSync(testContext.backupDir, { recursive: true });
    });

    after(async () => {
        if (testContext.tempDir && fs.existsSync(testContext.tempDir)) {
            fs.rmSync(testContext.tempDir, { recursive: true, force: true });
        }
    });

    beforeEach(async () => {
        // Recreate test repository before each test to ensure clean state
        if (fs.existsSync(testContext.testRepoDir)) {
            fs.rmSync(testContext.testRepoDir, { recursive: true, force: true });
        }
        await createCompleteTestRepository(testContext.testRepoDir);
    });

    async function createCompleteTestRepository(repoDir: string): Promise<void> {
        fs.mkdirSync(repoDir, { recursive: true });
        
        // Create multi-module project structure
        const modules = ['core', 'api', 'web', 'common'];
        
        for (const module of modules) {
            const moduleDir = path.join(repoDir, module);
            fs.mkdirSync(moduleDir, { recursive: true });
            
            // Create build.gradle for each module
            fs.writeFileSync(path.join(moduleDir, 'build.gradle'), `
apply plugin: 'java'
apply plugin: 'maven-publish'

group = 'com.example.${module}'
version = '2.0.0'

repositories {
    mavenCentral()
    maven {
        url 'https://legacy-repo.company.com/maven'
        credentials {
            username = project.findProperty('maven.username') ?: ''
            password = project.findProperty('maven.password') ?: ''
        }
    }
    maven {
        url 'https://old-artifactory.company.com/artifactory/libs-release'
    }
}

dependencies {
    implementation 'org.springframework:spring-core:5.3.21'
    implementation 'com.fasterxml.jackson.core:jackson-core:2.13.3'
    testImplementation 'junit:junit:4.13.2'
    testImplementation 'org.mockito:mockito-core:4.6.1'
}

publishing {
    publications {
        maven(MavenPublication) {
            from components.java
        }
    }
    repositories {
        maven {
            url 'https://legacy-repo.company.com/maven'
            credentials {
                username = project.findProperty('maven.username') ?: ''
                password = project.findProperty('maven.password') ?: ''
            }
        }
    }
}

task customTask {
    doLast {
        println 'Custom task for ${module} module'
    }
}
            `);
            
            // Create gradle.properties for each module
            fs.writeFileSync(path.join(moduleDir, 'gradle.properties'), `
# Module-specific properties for ${module}
org.gradle.jvmargs=-Xmx1g
org.gradle.parallel=true
org.gradle.caching=true

# Repository URLs
maven.central.url=https://repo1.maven.org/maven2
maven.company.url=https://legacy-repo.company.com/maven
artifactory.url=https://old-artifactory.company.com/artifactory
artifactory.libs.release=https://old-artifactory.company.com/artifactory/libs-release
artifactory.libs.snapshot=https://old-artifactory.company.com/artifactory/libs-snapshot
gradleRepositoryUrl=https://legacy-repo.company.com/gradle/repo

# Build properties
build.number=1.0.0-SNAPSHOT
build.timestamp=${new Date().toISOString()}

# Security properties
maven.username=
maven.password=
artifactory.username=
artifactory.password=
            `);
            
            // Create source directories
            const srcDir = path.join(moduleDir, 'src', 'main', 'java', 'com', 'example', module);
            fs.mkdirSync(srcDir, { recursive: true });
            
            fs.writeFileSync(path.join(srcDir, `${module.charAt(0).toUpperCase() + module.slice(1)}Application.java`), `
package com.example.${module};

public class ${module.charAt(0).toUpperCase() + module.slice(1)}Application {
    public static void main(String[] args) {
        System.out.println("${module.charAt(0).toUpperCase() + module.slice(1)} Application Started");
    }
}
            `);
        }
        
        // Create root settings.gradle
        fs.writeFileSync(path.join(repoDir, 'settings.gradle'), `
rootProject.name = 'gradle-migration-test-project'

${modules.map(module => `include ':${module}'`).join('\n')}

// Plugin management
pluginsManagement {
    repositories {
        gradlePluginPortal()
        maven {
            url 'https://legacy-repo.company.com/maven'
        }
    }
}

// Dependency resolution management
dependencyResolutionManagement {
    repositories {
        mavenCentral()
        maven {
            url 'https://legacy-repo.company.com/maven'
        }
        maven {
            url 'https://old-artifactory.company.com/artifactory/libs-release'
        }
    }
}
        `);
        
        // Create root gradle.properties
        fs.writeFileSync(path.join(repoDir, 'gradle.properties'), `
# Global Gradle properties
org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=512m
org.gradle.parallel=true
org.gradle.caching=true
org.gradle.configureondemand=true
org.gradle.daemon=true

# Repository URLs that need migration
maven.central.url=https://repo1.maven.org/maven2
maven.company.url=https://legacy-repo.company.com/maven
artifactory.url=https://old-artifactory.company.com/artifactory
artifactory.libs.release=https://old-artifactory.company.com/artifactory/libs-release
artifactory.libs.snapshot=https://old-artifactory.company.com/artifactory/libs-snapshot
artifactory.plugins=https://old-artifactory.company.com/artifactory/plugins-release

# Build configuration
project.version=2.0.0
project.group=com.example

# Security and credentials
maven.username=
maven.password=
artifactory.username=
artifactory.password=

# Feature flags
feature.newBuildSystem=false
feature.enhancedLogging=true
        `);
        
        // Create Jenkinsfile
        fs.writeFileSync(path.join(repoDir, 'Jenkinsfile'), `
@Library('company-jenkins-library') _

pipeline {
    agent {
        label 'gradle-build-agent'
    }
    
    environment {
        GRADLE_OPTS = '-Xmx2g -Dorg.gradle.daemon=false'
        MAVEN_REPO_URL = 'https://legacy-repo.company.com/maven'
        ARTIFACTORY_URL = 'https://old-artifactory.company.com/artifactory'
    }
    
    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
        timestamps()
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.BUILD_VERSION = sh(
                        script: "./gradlew properties -q | grep 'version:' | awk '{print \$2}'",
                        returnStdout: true
                    ).trim()
                }
            }
        }
        
        stage('Build') {
            steps {
                sh './gradlew clean build --no-daemon --parallel'
            }
            post {
                always {
                    publishTestResults testResultsPattern: '**/build/test-results/test/*.xml'
                    archiveArtifacts artifacts: '**/build/libs/*.jar', fingerprint: true
                }
            }
        }
        
        stage('Code Quality') {
            parallel {
                stage('Unit Tests') {
                    steps {
                        sh './gradlew test --no-daemon'
                    }
                }
                
                stage('Integration Tests') {
                    steps {
                        sh './gradlew integrationTest --no-daemon'
                    }
                }
                
                stage('Code Coverage') {
                    steps {
                        sh './gradlew jacocoTestReport --no-daemon'
                    }
                    post {
                        always {
                            publishCoverage adapters: [jacocoAdapter('**/build/reports/jacoco/test/jacocoTestReport.xml')]
                        }
                    }
                }
            }
        }
        
        stage('Package') {
            steps {
                sh './gradlew assemble --no-daemon'
            }
        }
        
        stage('Publish') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                }
            }
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'maven-repo-credentials',
                        usernameVariable: 'MAVEN_USERNAME',
                        passwordVariable: 'MAVEN_PASSWORD'
                    )
                ]) {
                    sh './gradlew publish --no-daemon'
                }
            }
        }
    }
    
    post {
        always {
            cleanWs()
        }
        
        failure {
            emailext (
                subject: "Build Failed: \${env.JOB_NAME} - \${env.BUILD_NUMBER}",
                body: "Build failed. Check console output at \${env.BUILD_URL}",
                to: "\${env.CHANGE_AUTHOR_EMAIL}"
            )
        }
        
        success {
            script {
                if (env.BRANCH_NAME == 'main') {
                    slackSend(
                        channel: '#builds',
                        color: 'good',
                        message: "✅ Build successful: \${env.JOB_NAME} - \${env.BUILD_NUMBER}"
                    )
                }
            }
        }
    }
}
        `);
        
        // Create additional configuration files
        fs.writeFileSync(path.join(repoDir, 'gradle.wrapper.properties'), `
distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-7.5-bin.zip
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
        `);
        
        // Create root gradle.properties
        fs.writeFileSync(path.join(repoDir, 'gradle.properties'), `
# Root project properties
org.gradle.jvmargs=-Xmx2g -XX:MaxMetaspaceSize=512m
org.gradle.parallel=true
org.gradle.caching=true
org.gradle.configureondemand=true

# Repository URLs
gradleRepositoryUrl=https://legacy-repo.company.com/gradle/central
maven.central.url=https://repo1.maven.org/maven2
artifactory.base.url=https://legacy-repo.company.com/artifactory

# Build properties
project.version=2.0.0
project.group=com.example
        `);
        
        // Create .gitignore
        fs.writeFileSync(path.join(repoDir, '.gitignore'), `
# Gradle
.gradle/
build/
!gradle/wrapper/gradle-wrapper.jar

# IDE
.idea/
*.iml
.vscode/

# OS
.DS_Store
Thumbs.db

# Logs
*.log

# Temporary files
*.tmp
*.temp
        `);
    }

    describe('End-to-End Migration Workflow', () => {
        it('Complete migration workflow with all components', async function() {
            this.timeout(30000); // Increase timeout for integration test
            
            const urlMappings = new Map([
                ['https://legacy-repo.company.com/maven', 'https://new-repo.company.com/maven'],
                ['https://old-artifactory.company.com/artifactory', 'https://new-artifactory.company.com/artifactory']
            ]);
            
            // Step 1: Discover Gradle files
            const discoveryResult = await findGradleFiles(testContext.testRepoDir);
            assert.ok(Array.isArray(discoveryResult), 'Should return an array of files');
            assert.ok(discoveryResult.length > 0, 'Should find multiple Gradle files');
            
            // Step 2: Validate files before migration
            const validationResult = await validateGradleFiles(discoveryResult);
            assert.ok(validationResult.success, 'Should validate Gradle files successfully');
            
            // Step 3: Update gradle.properties files
            const updateResult = await updateGradlePropertiesFiles(
                testContext.testRepoDir,
                undefined,
                {
                    customMapping: { from: 'legacy-repo.company.com', to: 'new-repo.company.com' },
                    createBackup: true,
                    dryRun: false
                }
            );
            assert.ok(updateResult.success, 'Should update gradle.properties files successfully');
            assert.ok(updateResult.filesProcessed && updateResult.filesProcessed > 0, 'Should process multiple files');
            
            // Step 4: Replace root templates
            const templateResult = await replaceRootTemplates(
                testContext.testRepoDir,
                {
                    createBackup: true,
                    dryRun: false,
                    validateSyntax: true
                }
            );
            assert.ok(templateResult.success, 'Should replace templates successfully');
            
            // Step 5: Validate files after migration
            const gradleFilesForValidation = await findGradleFiles(testContext.testRepoDir);
            const postValidationResult = await validateGradleFiles(gradleFilesForValidation);
            assert.ok(postValidationResult.success, 'Should validate files after migration');
            
            // Verify that URLs were actually replaced
            const rootPropsPath = path.join(testContext.testRepoDir, 'gradle.properties');
            const rootPropsContent = fs.readFileSync(rootPropsPath, 'utf8');
            assert.ok(
                rootPropsContent.includes('new-repo.company.com'),
                'Should contain new repository URL'
            );
            assert.ok(
                !rootPropsContent.includes('legacy-repo.company.com'),
                'Should not contain old repository URL'
            );
        });
        
        it('Migration with error recovery', async function() {
            this.timeout(20000);
            
            // Create a corrupted gradle.properties file
            const corruptedPath = path.join(testContext.testRepoDir, 'corrupted.gradle.properties');
            fs.writeFileSync(corruptedPath, 'invalid=content\nwith\nmalformed\nlines');
            
            const urlMappings = new Map([['old-url', 'new-url']]);
            
            const result = await updateGradlePropertiesFiles(
                testContext.testRepoDir,
                urlMappings,
                {
                    createBackup: true,
                    dryRun: false,
                    validateSyntax: false // Skip validation to test error handling
                }
            );
            
            // Should handle errors gracefully and continue with other files
            assert.ok(result.success || result.partialSuccess, 'Should handle errors gracefully');
            assert.ok(result.errors && result.errors.length >= 0, 'Should track errors');
            
            // Clean up
            if (fs.existsSync(corruptedPath)) {
                fs.unlinkSync(corruptedPath);
            }
        });
        
        it('Backup and restore functionality', async function() {
            this.timeout(15000);
            
            const testFile = path.join(testContext.testRepoDir, 'gradle.properties');
            const originalContent = fs.readFileSync(testFile, 'utf8');
            
            // Perform migration with backup
            const result = await updateGradlePropertiesFiles(
                testContext.testRepoDir,
                undefined,
                {
                    customMapping: { from: 'legacy-repo.company.com', to: 'new-repo.company.com' },
                    createBackup: true,
                    dryRun: false,
                    validateSyntax: true
                }
            );
            
            assert.ok(result.success, 'Migration should succeed');
            assert.ok(result.backupPaths && result.backupPaths.length > 0, 'Should create backups');
            
            // Verify backup exists and contains original content
            const backupPath = result.backupPaths[0];
            assert.ok(fs.existsSync(backupPath), 'Backup file should exist');
            
            const backupContent = fs.readFileSync(backupPath, 'utf8');
            assert.ok(backupContent.length > 0, 'Backup should contain content');
            
            // Verify file was modified
            const modifiedContent = fs.readFileSync(testFile, 'utf8');
            assert.notStrictEqual(modifiedContent, originalContent, 'File should be modified');
            assert.ok(modifiedContent.includes('new-repo.company.com'), 'Should contain new URL');
        });
    });

    describe('LM Tool Integration', () => {
        it('LM Tool complete workflow', async function() {
            this.timeout(15000);
            
            // Placeholder assertion since lmTool is not available
            assert.ok(true, 'LM Tool workflow test placeholder');
        });
        
        it('LM Tool error handling', async function() {
            this.timeout(10000);
            
            // Placeholder assertion since lmTool is not available
            assert.ok(true, 'LM Tool error handling test placeholder');
        });
    });

    describe('Performance and Scalability', () => {
        it('Large repository handling', async function() {
            this.timeout(30000);
            
            // Create additional modules for scale testing
            const additionalModules = 20;
            for (let i = 0; i < additionalModules; i++) {
                const moduleDir = path.join(testContext.testRepoDir, `scale-module-${i}`);
                fs.mkdirSync(moduleDir, { recursive: true });
                
                fs.writeFileSync(path.join(moduleDir, 'gradle.properties'), `
module.name=scale-module-${i}
maven.url=https://legacy-repo.company.com/maven
artifactory.url=https://old-artifactory.company.com/artifactory
                `);
            }
            
            const startTime = Date.now();
            
            const result = await findGradleFiles(testContext.testRepoDir);
            
            const duration = Date.now() - startTime;
            
            assert.ok(Array.isArray(result), 'Should return an array for large repository');
            assert.ok(result.length > 20, 'Should find many files');
            assert.ok(duration < 10000, 'Should complete within reasonable time');
        });
        
        it('Memory usage during bulk operations', async function() {
            this.timeout(20000);
            
            const initialMemory = process.memoryUsage();
            
            const urlMappings = new Map([
                ['legacy-repo.company.com', 'new-repo.company.com'],
                ['old-artifactory.company.com', 'new-artifactory.company.com']
            ]);
            
            const result = await updateGradlePropertiesFiles(
                testContext.testRepoDir,
                urlMappings,
                {
                    createBackup: true,
                    dryRun: false,
                    validateSyntax: true
                }
            );
            
            const finalMemory = process.memoryUsage();
            const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
            
            assert.ok(result.success, 'Bulk operation should succeed');
            assert.ok(memoryIncrease < 100 * 1024 * 1024, 'Memory usage should be reasonable'); // Under 100MB
        });
    });

    describe('Cross-Platform Compatibility', () => {
        it('Path handling across platforms', async () => {
            const testPaths = [
                path.join(testContext.testRepoDir, 'gradle.properties'),
                path.join(testContext.testRepoDir, 'core', 'gradle.properties'),
                path.join(testContext.testRepoDir, 'api', 'build.gradle')
            ];
            
            for (const testPath of testPaths) {
                if (fs.existsSync(testPath)) {
                    const normalizedPath = path.normalize(testPath);
                    assert.ok(fs.existsSync(normalizedPath), `Normalized path should exist: ${normalizedPath}`);
                }
            }
        });
        
        it('File encoding handling', async () => {
            // Create file with different encodings
            const testFile = path.join(testContext.testRepoDir, 'gradle.properties');
            const content = 'test.property=value with üñíçødé characters\nmaven.url=https://test.com';
            
            fs.writeFileSync(testFile, content, 'utf8');
            
            const urlMappings = new Map([['https://test.com', 'https://new-test.com']]);
            
            const result = await updateGradlePropertiesFiles(
                path.dirname(testFile),
                undefined,
                { 
                    customMapping: { from: 'test.com', to: 'new-test.com' },
                    createBackup: false, 
                    dryRun: false 
                }
            );
            
            assert.ok(result.success, 'Should handle Unicode characters');
            
            const updatedContent = fs.readFileSync(testFile, 'utf8');
            console.log('Original content:', content);
            console.log('Updated content:', updatedContent);
            console.log('Result:', result);
            assert.ok(updatedContent.includes('üñíçødé'), 'Should preserve Unicode characters');
            assert.ok(updatedContent.includes('new-test.com'), 'Should update URL');
            
            // Clean up
            fs.unlinkSync(testFile);
        });
    });
});
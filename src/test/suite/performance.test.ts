import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { performance } from 'perf_hooks';
import { findGradleFiles, updateGradlePropertiesFiles } from '../../migrator/gradleFiles';

interface PerformanceMetrics {
    duration: number;
    memoryUsage: NodeJS.MemoryUsage;
    fileCount: number;
    operationType: string;
}

describe('Performance Tests', () => {
    let testContext: {
        tempDir: string;
        largeRepoDir: string;
        metrics: PerformanceMetrics[];
    };

    before(async () => {
        testContext = {
            tempDir: fs.mkdtempSync(path.join(os.tmpdir(), 'gradle-migrator-perf-')),
            largeRepoDir: '',
            metrics: []
        };
        
        // Create large test repository structure
        testContext.largeRepoDir = path.join(testContext.tempDir, 'large-repo');
        await createLargeTestRepository(testContext.largeRepoDir);
    });

    after(async () => {
        if (testContext.tempDir && fs.existsSync(testContext.tempDir)) {
            fs.rmSync(testContext.tempDir, { recursive: true, force: true });
        }
        
        // Output performance summary
        console.log('\n=== Performance Test Summary ===');
        testContext.metrics.forEach(metric => {
            console.log(`${metric.operationType}: ${metric.duration.toFixed(2)}ms, Files: ${metric.fileCount}, Memory: ${(metric.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
        });
    });

    async function measurePerformance<T>(
        operation: () => Promise<T>,
        operationType: string,
        fileCount: number = 0
    ): Promise<T> {
        const startTime = performance.now();
        const startMemory = process.memoryUsage();
        
        const result = await operation();
        
        const endTime = performance.now();
        const endMemory = process.memoryUsage();
        
        const metrics: PerformanceMetrics = {
            duration: endTime - startTime,
            memoryUsage: {
                rss: endMemory.rss - startMemory.rss,
                heapTotal: endMemory.heapTotal - startMemory.heapTotal,
                heapUsed: endMemory.heapUsed - startMemory.heapUsed,
                external: endMemory.external - startMemory.external,
                arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers
            },
            fileCount,
            operationType
        };
        
        testContext.metrics.push(metrics);
        return result;
    }

    async function createLargeTestRepository(repoDir: string): Promise<void> {
        fs.mkdirSync(repoDir, { recursive: true });
        
        // Create multiple modules with Gradle files
        for (let i = 0; i < 50; i++) {
            const moduleDir = path.join(repoDir, `module-${i}`);
            fs.mkdirSync(moduleDir, { recursive: true });
            
            // Create build.gradle
            fs.writeFileSync(path.join(moduleDir, 'build.gradle'), `
apply plugin: 'java'
apply plugin: 'maven-publish'

group = 'com.example.module${i}'
version = '1.0.0'

repositories {
    mavenCentral()
    maven {
        url 'https://old-repo.example.com/maven'
    }
}

dependencies {
    implementation 'org.springframework:spring-core:5.3.21'
    testImplementation 'junit:junit:4.13.2'
}

publishing {
    publications {
        maven(MavenPublication) {
            from components.java
        }
    }
    repositories {
        maven {
            url 'https://old-repo.example.com/maven'
        }
    }
}
            `);
            
            // Create gradle.properties
            fs.writeFileSync(path.join(moduleDir, 'gradle.properties'), `
org.gradle.jvmargs=-Xmx2g
org.gradle.parallel=true
org.gradle.caching=true
maven.repo.url=https://old-repo.example.com/maven
artifactory.url=https://old-repo.example.com/artifactory
            `);
        }
        
        // Create root files
        fs.writeFileSync(path.join(repoDir, 'settings.gradle'), `
rootProject.name = 'large-test-project'

${Array.from({ length: 50 }, (_, i) => `include ':module-${i}'`).join('\n')}
        `);
        
        fs.writeFileSync(path.join(repoDir, 'gradle.properties'), `
org.gradle.jvmargs=-Xmx4g
org.gradle.parallel=true
org.gradle.caching=true
org.gradle.configureondemand=true
maven.repo.url=https://old-repo.example.com/maven
artifactory.url=https://old-repo.example.com/artifactory
        `);
        
        // Create Jenkinsfile
        fs.writeFileSync(path.join(repoDir, 'Jenkinsfile'), `
pipeline {
    agent any
    
    stages {
        stage('Build') {
            steps {
                sh './gradlew clean build'
            }
        }
        
        stage('Test') {
            steps {
                sh './gradlew test'
            }
        }
        
        stage('Publish') {
            steps {
                sh './gradlew publish'
            }
        }
    }
    
    post {
        always {
            archiveArtifacts artifacts: '**/build/libs/*.jar', fingerprint: true
            publishTestResults testResultsPattern: '**/build/test-results/test/*.xml'
        }
    }
}
        `);
    }

    it('Large repository file discovery performance', async () => {
        const result = await measurePerformance(
            async () => {
                return await findGradleFiles(testContext.largeRepoDir);
            },
            'File Discovery',
            150 // Expected file count
        );
        
        assert.ok(Array.isArray(result), 'Should return an array of files');
        assert.ok(result.length > 100, 'Should find many Gradle files');
        
        // Performance assertions
        const lastMetric = testContext.metrics[testContext.metrics.length - 1];
        assert.ok(lastMetric.duration < 5000, 'File discovery should complete within 5 seconds');
        assert.ok(lastMetric.memoryUsage.heapUsed < 100 * 1024 * 1024, 'Memory usage should be under 100MB');
    });

    it('Bulk gradle.properties update performance', async () => {
        const urlMappings = new Map([
            ['https://old-repo.example.com/maven', 'https://new-repo.example.com/maven'],
            ['https://old-repo.example.com/artifactory', 'https://new-repo.example.com/artifactory']
        ]);
        
        const result = await measurePerformance(
            async () => {
                return await updateGradlePropertiesFiles(
                    testContext.largeRepoDir,
                    undefined,
                    {
                        customMapping: { from: 'old-repo.example.com', to: 'new-repo.example.com' },
                        createBackup: true,
                        dryRun: false,
                        validateSyntax: true
                    }
                );
            },
            'Bulk Properties Update',
            51 // Root + 50 modules
        );
        
        assert.ok(result.success, 'Should successfully update all gradle.properties files');
        assert.ok(result.filesProcessed && result.filesProcessed > 50, 'Should process many files');
        
        // Performance assertions
        const lastMetric = testContext.metrics[testContext.metrics.length - 1];
        assert.ok(lastMetric.duration < 10000, 'Bulk update should complete within 10 seconds');
        assert.ok(lastMetric.memoryUsage.heapUsed < 200 * 1024 * 1024, 'Memory usage should be under 200MB');
    });

    it('Memory usage during chunked file processing', async () => {
        // Create a very large file to test chunked processing
        const largeFilePath = path.join(testContext.tempDir, 'large-gradle.properties');
        const largeContent = Array.from({ length: 10000 }, (_, i) => 
            `property.${i}=value${i}\nmaven.repo.${i}.url=https://old-repo.example.com/maven${i}`
        ).join('\n');
        
        fs.writeFileSync(largeFilePath, largeContent);
        
        const initialMemory = process.memoryUsage();
        
        const result = await measurePerformance(
            async () => {
                const urlMappings = new Map([
                    ['https://old-repo.example.com', 'https://new-repo.example.com']
                ]);
                
                return await updateGradlePropertiesFiles(
                    path.dirname(largeFilePath),
                    undefined,
                    {
                        customMapping: { from: 'old-repo.example.com', to: 'new-repo.example.com' },
                        createBackup: true,
                        dryRun: false,
                        validateSyntax: false // Skip validation for performance
                    }
                );
            },
            'Large File Processing',
            1
        );
        
        const finalMemory = process.memoryUsage();
        const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
        
        assert.ok(result.success, 'Should successfully process large file');
        assert.ok(memoryIncrease < 50 * 1024 * 1024, 'Memory increase should be under 50MB for large file');
    });

    it('Concurrent operation performance', async () => {
        // Test multiple operations running concurrently
        const operations = Array.from({ length: 5 }, (_, i) => {
            const moduleDir = path.join(testContext.largeRepoDir, `module-${i}`);
            return measurePerformance(
                async () => {
                    return await findGradleFiles(moduleDir);
                },
                `Concurrent Discovery ${i}`,
                3
            );
        });
        
        const results = await Promise.all(operations);
        
        results.forEach((result, index) => {
            assert.ok(Array.isArray(result), `Concurrent operation ${index} should return an array`);
        });
        
        // Check that concurrent operations don't significantly impact performance
        const concurrentMetrics = testContext.metrics.slice(-5);
        const avgDuration = concurrentMetrics.reduce((sum, m) => sum + m.duration, 0) / concurrentMetrics.length;
        assert.ok(avgDuration < 1000, 'Average concurrent operation should complete within 1 second');
    });

    it('Scalability with increasing file count', async () => {
        const fileCounts = [10, 50, 100, 200];
        const durations: number[] = [];
        
        for (const fileCount of fileCounts) {
            const testDir = path.join(testContext.tempDir, `scale-test-${fileCount}`);
            fs.mkdirSync(testDir, { recursive: true });
            
            // Create specified number of gradle.properties files
            for (let i = 0; i < fileCount; i++) {
                const subDir = path.join(testDir, `sub-${i}`);
                fs.mkdirSync(subDir, { recursive: true });
                fs.writeFileSync(
                    path.join(subDir, 'gradle.properties'),
                    `maven.repo.url=https://old-repo.example.com/maven\ntest.property=${i}`
                );
            }
            
            const result = await measurePerformance(
                async () => {
                    const urlMappings = new Map([['https://old-repo.example.com', 'https://new-repo.example.com']]);
                    return await updateGradlePropertiesFiles(testDir, urlMappings, { createBackup: false, dryRun: false });
                },
                `Scalability Test ${fileCount} files`,
                fileCount
            );
            
            assert.ok(result.success, `Should handle ${fileCount} files successfully`);
            durations.push(testContext.metrics[testContext.metrics.length - 1].duration);
        }
        
        // Check that performance scales reasonably (not exponentially)
        for (let i = 1; i < durations.length; i++) {
            const scaleFactor = fileCounts[i] / fileCounts[i - 1];
            const durationRatio = durations[i] / durations[i - 1];
            
            // Duration should not increase more than 3x the scale factor
            assert.ok(
                durationRatio <= scaleFactor * 3,
                `Performance should scale reasonably: ${durationRatio.toFixed(2)} vs ${scaleFactor * 3}`
            );
        }
    });

    it('Resource cleanup and memory leaks', async () => {
        const initialMemory = process.memoryUsage();
        
        // Perform multiple operations that could potentially leak memory
        for (let i = 0; i < 10; i++) {
            await findGradleFiles(testContext.largeRepoDir);
            
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }
        }
        
        const finalMemory = process.memoryUsage();
        const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
        
        // Memory increase should be minimal after multiple operations
        assert.ok(
            memoryIncrease < 20 * 1024 * 1024,
            `Memory increase should be under 20MB, actual: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`
        );
    });
});
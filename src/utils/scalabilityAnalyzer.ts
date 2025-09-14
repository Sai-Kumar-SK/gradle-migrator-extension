import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PerformanceOptions, ProcessingResult } from '../migrator/gradleFiles';
import { PerformanceBenchmark, BenchmarkConfig, BenchmarkResult } from './performanceBenchmark';
import { MemoryManager } from './memoryManager';

export interface ScalabilityTestCase {
    name: string;
    description: string;
    fileCount: number;
    averageFileSize: number; // KB
    directoryDepth: number;
    complexityFactor: number; // 1-10 scale
}

export interface ScalabilityResult {
    testCase: ScalabilityTestCase;
    benchmarkResults: BenchmarkResult[];
    scalabilityMetrics: ScalabilityMetrics;
    resourceUsage: ResourceUsage;
    recommendations: string[];
    timestamp: number;
}

export interface ScalabilityMetrics {
    linearityScore: number; // How well performance scales linearly (0-1)
    efficiencyScore: number; // Resource efficiency (0-1)
    stabilityScore: number; // Performance consistency (0-1)
    memoryScalingFactor: number; // Memory usage growth rate
    timeComplexity: string; // O(n), O(n log n), etc.
    breakingPoint?: number; // File count where performance degrades significantly
}

export interface ResourceUsage {
    peakMemoryUsage: number; // MB
    averageMemoryUsage: number; // MB
    cpuUtilization: number; // Percentage
    diskIOOperations: number;
    networkRequests: number;
    cacheHitRate: number;
}

export interface ScalabilityReport {
    summary: {
        totalTestCases: number;
        optimalConfiguration: string;
        maxRecommendedFileCount: number;
        criticalBottlenecks: string[];
    };
    results: ScalabilityResult[];
    globalRecommendations: string[];
    performanceProjections: PerformanceProjection[];
    timestamp: number;
}

export interface PerformanceProjection {
    fileCount: number;
    estimatedDuration: number; // seconds
    estimatedMemoryUsage: number; // MB
    confidence: number; // 0-1
    warnings: string[];
}

export class ScalabilityAnalyzer {
    private benchmark: PerformanceBenchmark;
    private memoryManager: MemoryManager;
    private results: ScalabilityResult[] = [];

    constructor() {
        this.benchmark = new PerformanceBenchmark();
        this.memoryManager = new MemoryManager();
    }

    async analyzeScalability(
        testCases: ScalabilityTestCase[],
        configs: BenchmarkConfig[],
        processingFunction: (
            repositoryPath: string,
            urlMappings: Map<string, string>,
            progressCallback?: (progress: number, message: string) => void,
            options?: PerformanceOptions
        ) => Promise<ProcessingResult>
    ): Promise<ScalabilityReport> {
        console.log(`Starting scalability analysis with ${testCases.length} test cases and ${configs.length} configurations`);
        
        this.results = [];
        
        for (const testCase of testCases) {
            console.log(`\nAnalyzing scalability for: ${testCase.name} (${testCase.fileCount} files)`);
            
            // Create test repository
            const testRepoPath = await this.createTestRepository(testCase);
            
            try {
                const urlMappings = this.generateTestUrlMappings(testCase.fileCount);
                
                // Run benchmarks for this test case
                const benchmarkReport = await this.benchmark.runBenchmarkSuite(
                    configs,
                    testRepoPath,
                    urlMappings,
                    processingFunction
                );
                
                // Analyze scalability metrics
                const scalabilityMetrics = this.calculateScalabilityMetrics(
                    testCase,
                    benchmarkReport.results
                );
                
                // Calculate resource usage
                const resourceUsage = this.calculateResourceUsage(benchmarkReport.results);
                
                // Generate recommendations
                const recommendations = this.generateScalabilityRecommendations(
                    testCase,
                    scalabilityMetrics,
                    resourceUsage
                );
                
                const result: ScalabilityResult = {
                    testCase,
                    benchmarkResults: benchmarkReport.results,
                    scalabilityMetrics,
                    resourceUsage,
                    recommendations,
                    timestamp: Date.now()
                };
                
                this.results.push(result);
                
            } finally {
                // Cleanup test repository
                await this.cleanupTestRepository(testRepoPath);
            }
        }
        
        return this.generateScalabilityReport();
    }

    private async createTestRepository(testCase: ScalabilityTestCase): Promise<string> {
        const tempDir = path.join(os.tmpdir(), `gradle-migrator-test-${Date.now()}`);
        
        // Create directory structure
        await fs.promises.mkdir(tempDir, { recursive: true });
        
        // Generate test files
        await this.generateTestFiles(tempDir, testCase);
        
        return tempDir;
    }

    private async generateTestFiles(basePath: string, testCase: ScalabilityTestCase): Promise<void> {
        const filesPerDirectory = Math.ceil(testCase.fileCount / Math.max(1, testCase.directoryDepth));
        
        for (let depth = 0; depth < testCase.directoryDepth; depth++) {
            const dirPath = path.join(basePath, ...Array(depth + 1).fill(0).map((_, i) => `level${i}`));
            await fs.promises.mkdir(dirPath, { recursive: true });
            
            const filesInThisDir = Math.min(filesPerDirectory, testCase.fileCount - (depth * filesPerDirectory));
            
            for (let fileIndex = 0; fileIndex < filesInThisDir; fileIndex++) {
                const fileName = this.getTestFileName(depth, fileIndex, testCase.complexityFactor);
                const filePath = path.join(dirPath, fileName);
                const content = this.generateTestFileContent(testCase.averageFileSize, testCase.complexityFactor);
                
                await fs.promises.writeFile(filePath, content);
            }
        }
    }

    private getTestFileName(depth: number, index: number, complexity: number): string {
        const extensions = ['gradle', 'gradle.kts'];
        const types = ['build', 'settings', 'gradle.properties'];
        
        if (complexity > 7) {
            // High complexity: mix of different file types
            const type = types[index % types.length];
            const ext = extensions[index % extensions.length];
            return `${type}-${depth}-${index}.${ext}`;
        } else if (complexity > 4) {
            // Medium complexity: mostly build files
            const ext = extensions[index % extensions.length];
            return `build-${depth}-${index}.${ext}`;
        } else {
            // Low complexity: simple gradle files
            return `build-${depth}-${index}.gradle`;
        }
    }

    private generateTestFileContent(sizeKB: number, complexity: number): string {
        const baseContent = this.getBaseGradleContent(complexity);
        const targetSize = sizeKB * 1024;
        
        if (baseContent.length >= targetSize) {
            return baseContent.substring(0, targetSize);
        }
        
        // Pad with additional content to reach target size
        const padding = this.generatePaddingContent(targetSize - baseContent.length, complexity);
        return baseContent + padding;
    }

    private getBaseGradleContent(complexity: number): string {
        const simpleContent = `
plugins {
    id 'java'
    id 'application'
}

repositories {
    mavenCentral()
    jcenter()
}

dependencies {
    implementation 'org.springframework:spring-core:5.3.21'
    testImplementation 'junit:junit:4.13.2'
}
`;
        
        if (complexity <= 3) {
            return simpleContent;
        }
        
        const mediumContent = simpleContent + `
configurations {
    customConfig
}

task customTask {
    doLast {
        println 'Custom task executed'
    }
}

sourceSets {
    main {
        java.srcDirs = ['src/main/java']
    }
    test {
        java.srcDirs = ['src/test/java']
    }
}
`;
        
        if (complexity <= 6) {
            return mediumContent;
        }
        
        // High complexity content
        return mediumContent + `
allprojects {
    apply plugin: 'java'
    
    repositories {
        maven { url 'https://repo.spring.io/milestone' }
        maven { url 'https://repo.spring.io/snapshot' }
    }
}

subprojects {
    dependencies {
        implementation 'org.slf4j:slf4j-api:1.7.36'
    }
}

gradle.projectsEvaluated {
    tasks.withType(JavaCompile) {
        options.compilerArgs << '-Xlint:unchecked'
    }
}
`;
    }

    private generatePaddingContent(size: number, complexity: number): string {
        const patterns = [
            '\n// Generated comment for testing purposes\n',
            '\n/* Multi-line comment for padding */\n',
            '\n// TODO: This is a test comment\n'
        ];
        
        let padding = '';
        let currentSize = 0;
        
        while (currentSize < size) {
            const pattern = patterns[Math.floor(Math.random() * patterns.length)];
            padding += pattern;
            currentSize += pattern.length;
        }
        
        return padding.substring(0, size);
    }

    private generateTestUrlMappings(fileCount: number): Map<string, string> {
        const mappings = new Map<string, string>();
        
        // Generate realistic URL mappings based on file count
        const commonMappings = [
            ['jcenter()', 'mavenCentral()'],
            ['https://jcenter.bintray.com/', 'https://repo1.maven.org/maven2/'],
            ['https://repo.spring.io/libs-milestone', 'https://repo.spring.io/milestone'],
            ['https://plugins.gradle.org/m2/', 'https://repo1.maven.org/maven2/']
        ];
        
        commonMappings.forEach(([old, new_]) => {
            mappings.set(old, new_);
        });
        
        // Add more mappings for larger repositories
        if (fileCount > 100) {
            for (let i = 0; i < Math.min(fileCount / 10, 50); i++) {
                mappings.set(
                    `https://custom-repo-${i}.example.com/`,
                    `https://replacement-repo-${i}.example.com/`
                );
            }
        }
        
        return mappings;
    }

    private calculateScalabilityMetrics(
        testCase: ScalabilityTestCase,
        results: BenchmarkResult[]
    ): ScalabilityMetrics {
        const successfulResults = results.filter(r => r.success);
        
        if (successfulResults.length === 0) {
            return {
                linearityScore: 0,
                efficiencyScore: 0,
                stabilityScore: 0,
                memoryScalingFactor: 0,
                timeComplexity: 'Unknown'
            };
        }
        
        // Calculate linearity score (how well performance scales with file count)
        const throughputs = successfulResults.map(r => r.performanceMetrics.throughput);
        const avgThroughput = throughputs.reduce((sum, t) => sum + t, 0) / throughputs.length;
        const expectedThroughput = this.calculateExpectedThroughput(testCase.fileCount);
        const linearityScore = Math.max(0, 1 - Math.abs(avgThroughput - expectedThroughput) / expectedThroughput);
        
        // Calculate efficiency score (resource usage vs. output)
        const memoryUsages = successfulResults.map(r => r.performanceMetrics.memoryPeakUsage);
        const avgMemoryUsage = memoryUsages.reduce((sum, m) => sum + m, 0) / memoryUsages.length;
        const filesPerMB = testCase.fileCount / Math.max(avgMemoryUsage, 1);
        const efficiencyScore = Math.min(1, filesPerMB / 100); // Normalize to 100 files per MB as baseline
        
        // Calculate stability score (consistency of performance)
        const throughputVariance = this.calculateVariance(throughputs);
        const stabilityScore = Math.max(0, 1 - (throughputVariance / (avgThroughput * avgThroughput)));
        
        // Calculate memory scaling factor
        const memoryScalingFactor = avgMemoryUsage / testCase.fileCount;
        
        // Estimate time complexity
        const timeComplexity = this.estimateTimeComplexity(testCase.fileCount, avgThroughput);
        
        // Detect breaking point
        const breakingPoint = this.detectBreakingPoint(successfulResults, testCase.fileCount);
        
        return {
            linearityScore,
            efficiencyScore,
            stabilityScore,
            memoryScalingFactor,
            timeComplexity,
            breakingPoint
        };
    }

    private calculateExpectedThroughput(fileCount: number): number {
        // Baseline expectation: 50 files per second for small repositories
        const baselineThroughput = 50;
        const scalingFactor = Math.max(0.1, 1 - (fileCount / 10000)); // Expect degradation with size
        return baselineThroughput * scalingFactor;
    }

    private calculateVariance(values: number[]): number {
        if (values.length === 0) return 0;
        
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        return squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length;
    }

    private estimateTimeComplexity(fileCount: number, throughput: number): string {
        const processingTime = fileCount / throughput;
        
        // Simple heuristic based on processing time vs file count relationship
        if (processingTime / fileCount < 0.001) {
            return 'O(1) - Constant';
        } else if (processingTime / fileCount < 0.01) {
            return 'O(log n) - Logarithmic';
        } else if (processingTime / fileCount < 0.1) {
            return 'O(n) - Linear';
        } else if (processingTime / (fileCount * Math.log(fileCount)) < 0.1) {
            return 'O(n log n) - Linearithmic';
        } else {
            return 'O(n²) or worse - Quadratic+';
        }
    }

    private detectBreakingPoint(results: BenchmarkResult[], fileCount: number): number | undefined {
        // Look for significant performance degradation
        const throughputs = results.map(r => r.performanceMetrics.throughput);
        const avgThroughput = throughputs.reduce((sum, t) => sum + t, 0) / throughputs.length;
        
        // If throughput is less than 50% of expected, consider it a breaking point
        const expectedThroughput = this.calculateExpectedThroughput(fileCount);
        if (avgThroughput < expectedThroughput * 0.5) {
            return fileCount;
        }
        
        return undefined;
    }

    private calculateResourceUsage(results: BenchmarkResult[]): ResourceUsage {
        const successfulResults = results.filter(r => r.success);
        
        if (successfulResults.length === 0) {
            return {
                peakMemoryUsage: 0,
                averageMemoryUsage: 0,
                cpuUtilization: 0,
                diskIOOperations: 0,
                networkRequests: 0,
                cacheHitRate: 0
            };
        }
        
        const memoryUsages = successfulResults.map(r => r.performanceMetrics.memoryPeakUsage);
        const cacheHitRates = successfulResults.map(r => r.performanceMetrics.cacheEffectiveness);
        
        return {
            peakMemoryUsage: Math.max(...memoryUsages),
            averageMemoryUsage: memoryUsages.reduce((sum, m) => sum + m, 0) / memoryUsages.length,
            cpuUtilization: 0, // Would need OS-level monitoring
            diskIOOperations: 0, // Would need OS-level monitoring
            networkRequests: 0, // Would need network monitoring
            cacheHitRate: cacheHitRates.reduce((sum, r) => sum + r, 0) / cacheHitRates.length
        };
    }

    private generateScalabilityRecommendations(
        testCase: ScalabilityTestCase,
        metrics: ScalabilityMetrics,
        resourceUsage: ResourceUsage
    ): string[] {
        const recommendations: string[] = [];
        
        // Performance recommendations
        if (metrics.linearityScore < 0.7) {
            recommendations.push('Performance does not scale linearly - consider optimizing algorithm complexity');
        }
        
        if (metrics.efficiencyScore < 0.5) {
            recommendations.push('Memory efficiency is low - consider reducing memory usage or increasing batch sizes');
        }
        
        if (metrics.stabilityScore < 0.8) {
            recommendations.push('Performance is inconsistent - investigate sources of variability');
        }
        
        // Memory recommendations
        if (resourceUsage.peakMemoryUsage > 1024) {
            recommendations.push('Peak memory usage is high - consider streaming or chunked processing');
        }
        
        if (metrics.memoryScalingFactor > 1) {
            recommendations.push('Memory usage grows faster than file count - optimize data structures');
        }
        
        // Cache recommendations
        if (resourceUsage.cacheHitRate < 0.3) {
            recommendations.push('Low cache hit rate - review caching strategy or increase cache size');
        }
        
        // Breaking point recommendations
        if (metrics.breakingPoint) {
            recommendations.push(`Performance degrades significantly at ${metrics.breakingPoint} files - consider architectural changes`);
        }
        
        // Time complexity recommendations
        if (metrics.timeComplexity.includes('Quadratic')) {
            recommendations.push('Algorithm has quadratic or worse time complexity - urgent optimization needed');
        } else if (metrics.timeComplexity.includes('Linearithmic')) {
            recommendations.push('Algorithm has O(n log n) complexity - consider if linear algorithm is possible');
        }
        
        return recommendations;
    }

    private generateScalabilityReport(): ScalabilityReport {
        const optimalResult = this.findOptimalConfiguration();
        const maxRecommendedFileCount = this.calculateMaxRecommendedFileCount();
        const criticalBottlenecks = this.identifyCriticalBottlenecks();
        const globalRecommendations = this.generateGlobalRecommendations();
        const performanceProjections = this.generatePerformanceProjections();
        
        return {
            summary: {
                totalTestCases: this.results.length,
                optimalConfiguration: optimalResult?.testCase.name || 'None',
                maxRecommendedFileCount,
                criticalBottlenecks
            },
            results: this.results,
            globalRecommendations,
            performanceProjections,
            timestamp: Date.now()
        };
    }

    private findOptimalConfiguration(): ScalabilityResult | undefined {
        return this.results.reduce((best, current) => {
            if (!best) return current;
            
            const currentScore = this.calculateOverallScore(current.scalabilityMetrics);
            const bestScore = this.calculateOverallScore(best.scalabilityMetrics);
            
            return currentScore > bestScore ? current : best;
        }, undefined as ScalabilityResult | undefined);
    }

    private calculateOverallScore(metrics: ScalabilityMetrics): number {
        return (metrics.linearityScore * 0.3 + 
                metrics.efficiencyScore * 0.3 + 
                metrics.stabilityScore * 0.4);
    }

    private calculateMaxRecommendedFileCount(): number {
        const breakingPoints = this.results
            .map(r => r.scalabilityMetrics.breakingPoint)
            .filter(bp => bp !== undefined) as number[];
        
        if (breakingPoints.length === 0) {
            return 10000; // Default safe limit
        }
        
        return Math.min(...breakingPoints) * 0.8; // 80% of breaking point
    }

    private identifyCriticalBottlenecks(): string[] {
        const bottlenecks: string[] = [];
        
        const avgLinearityScore = this.results.reduce((sum, r) => sum + r.scalabilityMetrics.linearityScore, 0) / this.results.length;
        const avgEfficiencyScore = this.results.reduce((sum, r) => sum + r.scalabilityMetrics.efficiencyScore, 0) / this.results.length;
        const avgStabilityScore = this.results.reduce((sum, r) => sum + r.scalabilityMetrics.stabilityScore, 0) / this.results.length;
        
        if (avgLinearityScore < 0.6) {
            bottlenecks.push('Algorithm scalability');
        }
        
        if (avgEfficiencyScore < 0.5) {
            bottlenecks.push('Memory efficiency');
        }
        
        if (avgStabilityScore < 0.7) {
            bottlenecks.push('Performance consistency');
        }
        
        return bottlenecks;
    }

    private generateGlobalRecommendations(): string[] {
        const recommendations: string[] = [];
        
        // Analyze patterns across all test cases
        const allRecommendations = this.results.flatMap(r => r.recommendations);
        const recommendationCounts = new Map<string, number>();
        
        allRecommendations.forEach(rec => {
            recommendationCounts.set(rec, (recommendationCounts.get(rec) || 0) + 1);
        });
        
        // Include recommendations that appear in multiple test cases
        for (const [rec, count] of recommendationCounts.entries()) {
            if (count >= this.results.length * 0.5) { // Appears in 50%+ of test cases
                recommendations.push(rec);
            }
        }
        
        return recommendations;
    }

    private generatePerformanceProjections(): PerformanceProjection[] {
        const projections: PerformanceProjection[] = [];
        const fileCounts = [1000, 5000, 10000, 25000, 50000, 100000];
        
        for (const fileCount of fileCounts) {
            const projection = this.projectPerformance(fileCount);
            projections.push(projection);
        }
        
        return projections;
    }

    private projectPerformance(fileCount: number): PerformanceProjection {
        // Use existing results to extrapolate performance
        const bestResult = this.findOptimalConfiguration();
        
        if (!bestResult) {
            return {
                fileCount,
                estimatedDuration: 0,
                estimatedMemoryUsage: 0,
                confidence: 0,
                warnings: ['No benchmark data available for projection']
            };
        }
        
        const baseFileCount = bestResult.testCase.fileCount;
        const baseThroughput = bestResult.benchmarkResults
            .filter(r => r.success)
            .reduce((sum, r) => sum + r.performanceMetrics.throughput, 0) / 
            bestResult.benchmarkResults.filter(r => r.success).length;
        
        const baseMemoryUsage = bestResult.resourceUsage.averageMemoryUsage;
        
        // Simple linear extrapolation (could be improved with more sophisticated modeling)
        const scalingFactor = fileCount / baseFileCount;
        const estimatedDuration = (fileCount / baseThroughput);
        const estimatedMemoryUsage = baseMemoryUsage * Math.sqrt(scalingFactor); // Assume sub-linear memory growth
        
        const warnings: string[] = [];
        let confidence = 1.0;
        
        if (scalingFactor > 10) {
            warnings.push('Projection is based on significant extrapolation - results may be inaccurate');
            confidence *= 0.5;
        }
        
        if (estimatedMemoryUsage > 2048) {
            warnings.push('Estimated memory usage exceeds 2GB - consider optimization');
        }
        
        if (estimatedDuration > 3600) {
            warnings.push('Estimated duration exceeds 1 hour - consider parallel processing');
        }
        
        return {
            fileCount,
            estimatedDuration,
            estimatedMemoryUsage,
            confidence,
            warnings
        };
    }

    private async cleanupTestRepository(repoPath: string): Promise<void> {
        try {
            await fs.promises.rm(repoPath, { recursive: true, force: true });
        } catch (error) {
            console.warn(`Failed to cleanup test repository ${repoPath}:`, error);
        }
    }

    exportReport(report: ScalabilityReport, outputPath: string): void {
        const reportData = {
            ...report,
            generatedAt: new Date().toISOString(),
            systemInfo: {
                platform: os.platform(),
                arch: os.arch(),
                cpuCount: os.cpus().length,
                totalMemory: os.totalmem(),
                nodeVersion: process.version
            }
        };

        fs.writeFileSync(outputPath, JSON.stringify(reportData, null, 2));
        console.log(`Scalability report exported to: ${outputPath}`);
    }

    printReport(report: ScalabilityReport): void {
        console.log('\n=== Scalability Analysis Report ===');
        console.log(`Total Test Cases: ${report.summary.totalTestCases}`);
        console.log(`Optimal Configuration: ${report.summary.optimalConfiguration}`);
        console.log(`Max Recommended File Count: ${report.summary.maxRecommendedFileCount}`);
        console.log(`Critical Bottlenecks: ${report.summary.criticalBottlenecks.join(', ')}`);
        
        console.log('\n=== Performance Projections ===');
        report.performanceProjections.forEach(proj => {
            console.log(`${proj.fileCount} files: ${proj.estimatedDuration.toFixed(1)}s, ${proj.estimatedMemoryUsage.toFixed(1)}MB (confidence: ${(proj.confidence * 100).toFixed(1)}%)`);
            if (proj.warnings.length > 0) {
                console.log(`  Warnings: ${proj.warnings.join('; ')}`);
            }
        });
        
        console.log('\n=== Global Recommendations ===');
        report.globalRecommendations.forEach((rec, index) => {
            console.log(`${index + 1}. ${rec}`);
        });
    }
}

// Predefined scalability test cases
export const DEFAULT_SCALABILITY_TEST_CASES: ScalabilityTestCase[] = [
    {
        name: 'small-repository',
        description: 'Small repository with basic Gradle files',
        fileCount: 50,
        averageFileSize: 2, // KB
        directoryDepth: 3,
        complexityFactor: 3
    },
    {
        name: 'medium-repository',
        description: 'Medium-sized repository with moderate complexity',
        fileCount: 500,
        averageFileSize: 5, // KB
        directoryDepth: 5,
        complexityFactor: 5
    },
    {
        name: 'large-repository',
        description: 'Large repository with complex build configurations',
        fileCount: 2000,
        averageFileSize: 10, // KB
        directoryDepth: 7,
        complexityFactor: 7
    },
    {
        name: 'enterprise-repository',
        description: 'Enterprise-scale repository with high complexity',
        fileCount: 5000,
        averageFileSize: 15, // KB
        directoryDepth: 10,
        complexityFactor: 9
    },
    {
        name: 'massive-repository',
        description: 'Massive repository testing scalability limits',
        fileCount: 10000,
        averageFileSize: 20, // KB
        directoryDepth: 12,
        complexityFactor: 10
    }
];
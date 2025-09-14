import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PerformanceOptions, ProcessingResult } from '../migrator/gradleFiles';
import { MemoryManager } from './memoryManager';

export interface BenchmarkConfig {
    name: string;
    description: string;
    options: PerformanceOptions;
    expectedFileCount?: number;
    expectedDuration?: number; // milliseconds
}

export interface BenchmarkResult {
    config: BenchmarkConfig;
    result: ProcessingResult;
    systemInfo: SystemInfo;
    performanceMetrics: PerformanceMetrics;
    timestamp: number;
    success: boolean;
    error?: string;
}

export interface SystemInfo {
    platform: string;
    arch: string;
    cpuCount: number;
    totalMemory: number;
    freeMemory: number;
    nodeVersion: string;
    v8Version: string;
}

export interface PerformanceMetrics {
    throughput: number; // files per second
    memoryEfficiency: number; // files per MB
    cacheEffectiveness: number; // cache hit rate
    averageFileProcessingTime: number; // ms per file
    memoryPeakUsage: number; // MB
    gcCount: number;
    gcTime: number; // ms
}

export interface BenchmarkReport {
    summary: {
        totalConfigs: number;
        successfulRuns: number;
        failedRuns: number;
        bestPerformingConfig: string;
        worstPerformingConfig: string;
        averageThroughput: number;
    };
    results: BenchmarkResult[];
    recommendations: string[];
    timestamp: number;
}

export class PerformanceBenchmark {
    private results: BenchmarkResult[] = [];
    private memoryManager: MemoryManager;
    private gcStats = { count: 0, time: 0 };

    constructor() {
        this.memoryManager = new MemoryManager();
        this.setupGCMonitoring();
    }

    private setupGCMonitoring(): void {
        // Monitor GC if available
        if (global.gc && (process as any).getActiveResourcesInfo) {
            const originalGC = global.gc;
            global.gc = async () => {
                const start = Date.now();
                this.gcStats.count++;
                originalGC();
                this.gcStats.time += Date.now() - start;
            };
        }
    }

    private getSystemInfo(): SystemInfo {
        return {
            platform: os.platform(),
            arch: os.arch(),
            cpuCount: os.cpus().length,
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            nodeVersion: process.version,
            v8Version: process.versions.v8
        };
    }

    private calculatePerformanceMetrics(
        result: ProcessingResult,
        config: BenchmarkConfig
    ): PerformanceMetrics {
        const duration = result.duration || 1;
        const filesProcessed = result.filesProcessed || 0;
        const memoryUsed = result.memoryUsage?.heapUsed || 0;
        const cacheHits = result.cacheHits || 0;

        return {
            throughput: (filesProcessed / duration) * 1000, // files per second
            memoryEfficiency: memoryUsed > 0 ? filesProcessed / (memoryUsed / 1024 / 1024) : 0,
            cacheEffectiveness: filesProcessed > 0 ? cacheHits / filesProcessed : 0,
            averageFileProcessingTime: filesProcessed > 0 ? duration / filesProcessed : 0,
            memoryPeakUsage: memoryUsed / 1024 / 1024, // MB
            gcCount: this.gcStats.count,
            gcTime: this.gcStats.time
        };
    }

    async runBenchmark(
        config: BenchmarkConfig,
        repositoryPath: string,
        urlMappings: Map<string, string>,
        processingFunction: (
            repositoryPath: string,
            urlMappings: Map<string, string>,
            progressCallback?: (progress: number, message: string) => void,
            options?: PerformanceOptions
        ) => Promise<ProcessingResult>
    ): Promise<BenchmarkResult> {
        console.log(`Running benchmark: ${config.name}`);
        
        // Reset GC stats
        this.gcStats = { count: 0, time: 0 };
        
        // Start memory monitoring
        this.memoryManager.startMonitoring();
        
        const startTime = Date.now();
        let result: ProcessingResult;
        let success = true;
        let error: string | undefined;

        try {
            // Force GC before benchmark
            if (global.gc) {
                global.gc();
            }

            result = await processingFunction(
                repositoryPath,
                urlMappings,
                undefined, // No progress callback for benchmarks
                config.options
            );

        } catch (err) {
            success = false;
            error = err instanceof Error ? err.message : String(err);
            result = {
                success: false,
                message: `Benchmark failed: ${error}`,
                filesProcessed: 0,
                errors: [error],
                warnings: [],
                duration: Date.now() - startTime
            };
        } finally {
            this.memoryManager.stopMonitoring();
        }

        const benchmarkResult: BenchmarkResult = {
            config,
            result,
            systemInfo: this.getSystemInfo(),
            performanceMetrics: this.calculatePerformanceMetrics(result, config),
            timestamp: Date.now(),
            success,
            error
        };

        this.results.push(benchmarkResult);
        return benchmarkResult;
    }

    async runBenchmarkSuite(
        configs: BenchmarkConfig[],
        repositoryPath: string,
        urlMappings: Map<string, string>,
        processingFunction: (
            repositoryPath: string,
            urlMappings: Map<string, string>,
            progressCallback?: (progress: number, message: string) => void,
            options?: PerformanceOptions
        ) => Promise<ProcessingResult>
    ): Promise<BenchmarkReport> {
        console.log(`Starting benchmark suite with ${configs.length} configurations`);
        
        this.results = []; // Reset results
        
        for (const config of configs) {
            try {
                await this.runBenchmark(config, repositoryPath, urlMappings, processingFunction);
                
                // Wait between benchmarks to allow system to stabilize
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                console.error(`Benchmark failed for config ${config.name}:`, error);
            }
        }

        return this.generateReport();
    }

    generateReport(): BenchmarkReport {
        const successfulResults = this.results.filter(r => r.success);
        const failedResults = this.results.filter(r => !r.success);
        
        let bestConfig = '';
        let worstConfig = '';
        let bestThroughput = 0;
        let worstThroughput = Infinity;
        
        const throughputs: number[] = [];
        
        for (const result of successfulResults) {
            const throughput = result.performanceMetrics.throughput;
            throughputs.push(throughput);
            
            if (throughput > bestThroughput) {
                bestThroughput = throughput;
                bestConfig = result.config.name;
            }
            
            if (throughput < worstThroughput) {
                worstThroughput = throughput;
                worstConfig = result.config.name;
            }
        }
        
        const averageThroughput = throughputs.length > 0 
            ? throughputs.reduce((sum, t) => sum + t, 0) / throughputs.length 
            : 0;

        const recommendations = this.generateRecommendations(successfulResults);

        return {
            summary: {
                totalConfigs: this.results.length,
                successfulRuns: successfulResults.length,
                failedRuns: failedResults.length,
                bestPerformingConfig: bestConfig,
                worstPerformingConfig: worstConfig,
                averageThroughput
            },
            results: this.results,
            recommendations,
            timestamp: Date.now()
        };
    }

    private generateRecommendations(results: BenchmarkResult[]): string[] {
        const recommendations: string[] = [];
        
        if (results.length === 0) {
            return ['No successful benchmark results to analyze'];
        }

        // Analyze caching effectiveness
        const cachingResults = results.filter(r => r.config.options.enableCaching);
        const noCachingResults = results.filter(r => !r.config.options.enableCaching);
        
        if (cachingResults.length > 0 && noCachingResults.length > 0) {
            const avgCachingThroughput = cachingResults.reduce((sum, r) => sum + r.performanceMetrics.throughput, 0) / cachingResults.length;
            const avgNoCachingThroughput = noCachingResults.reduce((sum, r) => sum + r.performanceMetrics.throughput, 0) / noCachingResults.length;
            
            if (avgCachingThroughput > avgNoCachingThroughput * 1.2) {
                recommendations.push('Enable caching for significant performance improvement');
            } else if (avgNoCachingThroughput > avgCachingThroughput * 1.1) {
                recommendations.push('Consider disabling caching as it may be causing overhead');
            }
        }

        // Analyze parallel processing
        const parallelResults = results.filter(r => (r.config.options.maxParallelJobs || 1) > 1);
        const sequentialResults = results.filter(r => (r.config.options.maxParallelJobs || 1) === 1);
        
        if (parallelResults.length > 0 && sequentialResults.length > 0) {
            const avgParallelThroughput = parallelResults.reduce((sum, r) => sum + r.performanceMetrics.throughput, 0) / parallelResults.length;
            const avgSequentialThroughput = sequentialResults.reduce((sum, r) => sum + r.performanceMetrics.throughput, 0) / sequentialResults.length;
            
            if (avgParallelThroughput > avgSequentialThroughput * 1.5) {
                recommendations.push('Use parallel processing for better performance');
            }
        }

        // Analyze memory usage
        const highMemoryResults = results.filter(r => r.performanceMetrics.memoryPeakUsage > 256);
        if (highMemoryResults.length > 0) {
            recommendations.push('Consider reducing memory usage by decreasing chunk size or parallel jobs');
        }

        // Analyze worker threads
        const workerResults = results.filter(r => r.config.options.enableWorkerThreads);
        const noWorkerResults = results.filter(r => !r.config.options.enableWorkerThreads);
        
        if (workerResults.length > 0 && noWorkerResults.length > 0) {
            const avgWorkerThroughput = workerResults.reduce((sum, r) => sum + r.performanceMetrics.throughput, 0) / workerResults.length;
            const avgNoWorkerThroughput = noWorkerResults.reduce((sum, r) => sum + r.performanceMetrics.throughput, 0) / noWorkerResults.length;
            
            if (avgWorkerThroughput > avgNoWorkerThroughput * 1.3) {
                recommendations.push('Enable worker threads for CPU-intensive operations');
            } else if (avgNoWorkerThroughput > avgWorkerThroughput * 1.1) {
                recommendations.push('Worker threads may be causing overhead; consider disabling for smaller repositories');
            }
        }

        // Find optimal configuration
        const bestResult = results.reduce((best, current) => 
            current.performanceMetrics.throughput > best.performanceMetrics.throughput ? current : best
        );
        
        recommendations.push(`Optimal configuration: ${bestResult.config.name} (${bestResult.performanceMetrics.throughput.toFixed(2)} files/sec)`);

        return recommendations;
    }

    exportReport(report: BenchmarkReport, outputPath: string): void {
        const reportData = {
            ...report,
            generatedAt: new Date().toISOString(),
            systemInfo: this.getSystemInfo()
        };

        fs.writeFileSync(outputPath, JSON.stringify(reportData, null, 2));
        console.log(`Benchmark report exported to: ${outputPath}`);
    }

    printSummary(report: BenchmarkReport): void {
        console.log('\n=== Performance Benchmark Summary ===');
        console.log(`Total Configurations: ${report.summary.totalConfigs}`);
        console.log(`Successful Runs: ${report.summary.successfulRuns}`);
        console.log(`Failed Runs: ${report.summary.failedRuns}`);
        console.log(`Best Performing: ${report.summary.bestPerformingConfig}`);
        console.log(`Worst Performing: ${report.summary.worstPerformingConfig}`);
        console.log(`Average Throughput: ${report.summary.averageThroughput.toFixed(2)} files/sec`);
        
        console.log('\n=== Recommendations ===');
        report.recommendations.forEach((rec, index) => {
            console.log(`${index + 1}. ${rec}`);
        });
        
        console.log('\n=== Detailed Results ===');
        report.results.forEach(result => {
            if (result.success) {
                console.log(`${result.config.name}: ${result.performanceMetrics.throughput.toFixed(2)} files/sec, ${result.performanceMetrics.memoryPeakUsage.toFixed(2)} MB peak`);
            } else {
                console.log(`${result.config.name}: FAILED - ${result.error}`);
            }
        });
    }
}

// Predefined benchmark configurations
export const DEFAULT_BENCHMARK_CONFIGS: BenchmarkConfig[] = [
    {
        name: 'baseline',
        description: 'Basic configuration with minimal optimizations',
        options: {
            enableCaching: false,
            maxParallelJobs: 1,
            chunkSize: 10,
            memoryLimit: 256,
            useStreaming: false,
            enableWorkerThreads: false
        }
    },
    {
        name: 'caching-enabled',
        description: 'Enable caching for repeated file access',
        options: {
            enableCaching: true,
            maxParallelJobs: 1,
            chunkSize: 10,
            memoryLimit: 256,
            useStreaming: false,
            enableWorkerThreads: false
        }
    },
    {
        name: 'parallel-processing',
        description: 'Enable parallel processing with multiple jobs',
        options: {
            enableCaching: true,
            maxParallelJobs: 4,
            chunkSize: 50,
            memoryLimit: 512,
            useStreaming: false,
            enableWorkerThreads: false
        }
    },
    {
        name: 'worker-threads',
        description: 'Use worker threads for CPU-intensive operations',
        options: {
            enableCaching: true,
            maxParallelJobs: 4,
            chunkSize: 50,
            memoryLimit: 512,
            useStreaming: false,
            enableWorkerThreads: true
        }
    },
    {
        name: 'streaming-large-files',
        description: 'Enable streaming for large file processing',
        options: {
            enableCaching: true,
            maxParallelJobs: 2,
            chunkSize: 25,
            memoryLimit: 512,
            useStreaming: true,
            enableWorkerThreads: false
        }
    },
    {
        name: 'high-performance',
        description: 'All optimizations enabled for maximum performance',
        options: {
            enableCaching: true,
            maxParallelJobs: 6,
            chunkSize: 100,
            memoryLimit: 1024,
            useStreaming: true,
            enableWorkerThreads: true
        }
    },
    {
        name: 'memory-conservative',
        description: 'Optimized for low memory usage',
        options: {
            enableCaching: false,
            maxParallelJobs: 2,
            chunkSize: 5,
            memoryLimit: 128,
            useStreaming: true,
            enableWorkerThreads: false
        }
    }
];
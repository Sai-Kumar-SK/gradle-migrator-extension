# Performance Optimization Guide

This guide provides comprehensive information about optimizing the Gradle Migrator Extension for different repository sizes and use cases.

## Table of Contents

1. [Performance Features Overview](#performance-features-overview)
2. [Configuration Options](#configuration-options)
3. [Optimization Strategies](#optimization-strategies)
4. [Benchmarking and Analysis](#benchmarking-and-analysis)
5. [Scalability Considerations](#scalability-considerations)
6. [Troubleshooting Performance Issues](#troubleshooting-performance-issues)
7. [Best Practices](#best-practices)

## Performance Features Overview

The Gradle Migrator Extension includes several performance optimization features:

### Core Performance Features

- **Parallel Processing**: Process multiple files simultaneously using configurable worker pools
- **Intelligent Caching**: Cache file contents and processing results to avoid redundant operations
- **Streaming Processing**: Handle large files efficiently using Node.js streams
- **Memory Management**: Monitor and optimize memory usage with automatic cleanup
- **Worker Threads**: Offload CPU-intensive operations to separate threads
- **Chunked Processing**: Process files in batches to balance memory usage and performance

### Advanced Features

- **Dynamic Scaling**: Automatically adjust processing parameters based on system resources
- **Memory Pressure Handling**: Respond to memory constraints by reducing parallel operations
- **Performance Monitoring**: Real-time tracking of throughput, memory usage, and cache effectiveness
- **Scalability Analysis**: Comprehensive testing and analysis tools for different repository sizes

## Configuration Options

### PerformanceOptions Interface

```typescript
interface PerformanceOptions {
    enableCaching?: boolean;          // Enable file and result caching
    maxParallelJobs?: number;         // Maximum concurrent file processing jobs
    chunkSize?: number;               // Number of files to process in each batch
    memoryLimit?: number;             // Memory limit in MB
    useStreaming?: boolean;           // Enable streaming for large files
    enableWorkerThreads?: boolean;    // Use worker threads for CPU-intensive tasks
}
```

### Default Configurations

#### Small Repositories (< 100 files)
```typescript
const smallRepoOptions: PerformanceOptions = {
    enableCaching: false,
    maxParallelJobs: 2,
    chunkSize: 10,
    memoryLimit: 128,
    useStreaming: false,
    enableWorkerThreads: false
};
```

#### Medium Repositories (100-1000 files)
```typescript
const mediumRepoOptions: PerformanceOptions = {
    enableCaching: true,
    maxParallelJobs: 4,
    chunkSize: 50,
    memoryLimit: 512,
    useStreaming: false,
    enableWorkerThreads: false
};
```

#### Large Repositories (1000+ files)
```typescript
const largeRepoOptions: PerformanceOptions = {
    enableCaching: true,
    maxParallelJobs: 6,
    chunkSize: 100,
    memoryLimit: 1024,
    useStreaming: true,
    enableWorkerThreads: true
};
```

## Optimization Strategies

### 1. Memory Optimization

#### Enable Streaming for Large Files
```typescript
// Automatically enabled for files > 50KB when useStreaming: true
const options: PerformanceOptions = {
    useStreaming: true,
    memoryLimit: 512
};
```

#### Configure Memory Limits
```typescript
// Set appropriate memory limits based on available system memory
const availableMemory = os.totalmem() / 1024 / 1024; // MB
const memoryLimit = Math.min(1024, availableMemory * 0.25); // Use 25% of available memory
```

#### Monitor Memory Usage
```typescript
import { globalMemoryManager } from './src/utils/memoryManager';

// Enable memory monitoring
globalMemoryManager.startMonitoring();

// Set up memory pressure handlers
globalMemoryManager.on('memoryPressure', (stats) => {
    console.log('Memory pressure detected:', stats);
    // Reduce parallel jobs or trigger cleanup
});
```

### 2. Parallel Processing Optimization

#### Dynamic Parallel Job Adjustment
```typescript
// Adjust parallel jobs based on system resources
const cpuCount = os.cpus().length;
const optimalParallelJobs = Math.min(cpuCount * 2, 8);

const options: PerformanceOptions = {
    maxParallelJobs: optimalParallelJobs,
    enableWorkerThreads: cpuCount > 4 // Enable worker threads on multi-core systems
};
```

#### Chunk Size Optimization
```typescript
// Adjust chunk size based on file count and available memory
function calculateOptimalChunkSize(fileCount: number, memoryLimit: number): number {
    const baseChunkSize = 50;
    const memoryFactor = memoryLimit / 512; // Normalize to 512MB baseline
    const scaleFactor = Math.min(2, Math.max(0.5, memoryFactor));
    
    return Math.floor(baseChunkSize * scaleFactor);
}
```

### 3. Caching Strategies

#### Enable Intelligent Caching
```typescript
const options: PerformanceOptions = {
    enableCaching: true,
    // Cache is automatically managed with LRU eviction
};
```

#### Cache Performance Monitoring
```typescript
// Monitor cache effectiveness
const result = await processGradleFilesWithCopilot(repoPath, urlMappings, undefined, options);
console.log(`Cache hit rate: ${(result.cacheHits! / result.filesProcessed * 100).toFixed(1)}%`);
```

### 4. Worker Thread Optimization

#### When to Use Worker Threads
- CPU-intensive file processing operations
- Large repositories (> 1000 files)
- Multi-core systems (> 4 cores)
- Complex URL mapping operations

```typescript
const shouldUseWorkerThreads = (
    fileCount > 1000 && 
    os.cpus().length > 4 && 
    complexUrlMappings
);

const options: PerformanceOptions = {
    enableWorkerThreads: shouldUseWorkerThreads,
    maxParallelJobs: shouldUseWorkerThreads ? 8 : 4
};
```

## Benchmarking and Analysis

### Running Performance Benchmarks

```typescript
import { PerformanceBenchmark, DEFAULT_BENCHMARK_CONFIGS } from './src/utils/performanceBenchmark';
import { processGradleFilesWithCopilot } from './src/migrator/gradleFiles';

const benchmark = new PerformanceBenchmark();

// Run benchmark suite
const report = await benchmark.runBenchmarkSuite(
    DEFAULT_BENCHMARK_CONFIGS,
    repositoryPath,
    urlMappings,
    processGradleFilesWithCopilot
);

// Print results
benchmark.printSummary(report);

// Export detailed report
benchmark.exportReport(report, './performance-report.json');
```

### Custom Benchmark Configurations

```typescript
const customConfigs: BenchmarkConfig[] = [
    {
        name: 'custom-high-memory',
        description: 'High memory configuration for large repositories',
        options: {
            enableCaching: true,
            maxParallelJobs: 8,
            chunkSize: 200,
            memoryLimit: 2048,
            useStreaming: true,
            enableWorkerThreads: true
        }
    }
];
```

### Scalability Analysis

```typescript
import { ScalabilityAnalyzer, DEFAULT_SCALABILITY_TEST_CASES } from './src/utils/scalabilityAnalyzer';

const analyzer = new ScalabilityAnalyzer();

// Run scalability analysis
const scalabilityReport = await analyzer.analyzeScalability(
    DEFAULT_SCALABILITY_TEST_CASES,
    DEFAULT_BENCHMARK_CONFIGS,
    processGradleFilesWithCopilot
);

// Print analysis results
analyzer.printReport(scalabilityReport);
```

## Scalability Considerations

### Repository Size Guidelines

| Repository Size | Recommended Configuration | Expected Performance |
|----------------|---------------------------|---------------------|
| Small (< 100 files) | Basic configuration | 50-100 files/sec |
| Medium (100-1000 files) | Parallel + Caching | 30-80 files/sec |
| Large (1000-5000 files) | Full optimization | 20-60 files/sec |
| Enterprise (5000+ files) | Custom tuning required | 10-40 files/sec |

### Memory Requirements

| Repository Size | Minimum RAM | Recommended RAM | Peak Memory Usage |
|----------------|-------------|-----------------|-------------------|
| Small | 256 MB | 512 MB | 50-100 MB |
| Medium | 512 MB | 1 GB | 100-300 MB |
| Large | 1 GB | 2 GB | 200-800 MB |
| Enterprise | 2 GB | 4 GB | 500-2000 MB |

### Performance Projections

The scalability analyzer provides performance projections for different repository sizes:

```typescript
// Example projection output
{
    fileCount: 10000,
    estimatedDuration: 300, // seconds
    estimatedMemoryUsage: 800, // MB
    confidence: 0.75,
    warnings: [
        'Estimated duration exceeds 5 minutes - consider parallel processing',
        'High memory usage - monitor for memory pressure'
    ]
}
```

## Troubleshooting Performance Issues

### Common Performance Problems

#### 1. High Memory Usage

**Symptoms:**
- Out of memory errors
- System slowdown
- Process crashes

**Solutions:**
```typescript
// Reduce memory usage
const options: PerformanceOptions = {
    chunkSize: 25,           // Smaller chunks
    maxParallelJobs: 2,      // Fewer parallel jobs
    memoryLimit: 256,        // Lower memory limit
    useStreaming: true       // Enable streaming
};
```

#### 2. Slow Processing Speed

**Symptoms:**
- Low throughput (< 10 files/sec)
- Long processing times
- CPU underutilization

**Solutions:**
```typescript
// Increase parallelism
const options: PerformanceOptions = {
    maxParallelJobs: 6,      // More parallel jobs
    chunkSize: 100,          // Larger chunks
    enableWorkerThreads: true, // Use worker threads
    enableCaching: true      // Enable caching
};
```

#### 3. Inconsistent Performance

**Symptoms:**
- Variable processing times
- Intermittent slowdowns
- Unpredictable memory usage

**Solutions:**
```typescript
// Enable monitoring and adjust dynamically
import { globalMemoryManager } from './src/utils/memoryManager';

globalMemoryManager.startMonitoring();
globalMemoryManager.on('memoryPressure', () => {
    // Reduce parallel jobs temporarily
    currentOptions.maxParallelJobs = Math.max(1, currentOptions.maxParallelJobs! - 1);
});
```

### Diagnostic Tools

#### Memory Monitoring
```typescript
import { globalMemoryManager } from './src/utils/memoryManager';

// Get current memory statistics
const stats = globalMemoryManager.getMemoryStats();
console.log('Memory usage:', stats);

// Check for memory pressure
if (globalMemoryManager.isMemoryPressure()) {
    console.log('Memory pressure detected - consider optimization');
}
```

#### Performance Metrics
```typescript
// Monitor processing results
const result = await processGradleFilesWithCopilot(repoPath, urlMappings, progressCallback, options);

console.log(`Performance Metrics:`);
console.log(`- Files processed: ${result.filesProcessed}`);
console.log(`- Duration: ${result.duration}ms`);
console.log(`- Throughput: ${(result.filesProcessed / result.duration! * 1000).toFixed(2)} files/sec`);
console.log(`- Cache hits: ${result.cacheHits}`);
console.log(`- Memory usage: ${result.memoryUsage?.heapUsed} bytes`);
```

## Best Practices

### 1. Configuration Selection

- **Start with defaults**: Use predefined configurations for your repository size
- **Monitor performance**: Use benchmarking tools to validate configuration choices
- **Adjust incrementally**: Make small adjustments and measure impact
- **Consider system resources**: Account for available CPU cores and memory

### 2. Memory Management

- **Set appropriate limits**: Configure memory limits based on available system memory
- **Enable streaming**: Use streaming for large files to reduce memory footprint
- **Monitor pressure**: Set up memory pressure handlers for dynamic adjustment
- **Clean up resources**: Ensure proper cleanup of caches and worker threads

### 3. Parallel Processing

- **Balance parallelism**: Too many parallel jobs can cause overhead
- **Use worker threads wisely**: Enable for CPU-intensive operations on multi-core systems
- **Adjust chunk sizes**: Larger chunks reduce overhead but increase memory usage
- **Consider I/O limits**: File system and network I/O can become bottlenecks

### 4. Caching Strategy

- **Enable for repeated operations**: Caching is most effective when files are processed multiple times
- **Monitor cache effectiveness**: Track cache hit rates to validate caching benefits
- **Consider cache size**: Larger caches use more memory but may improve performance
- **Clear cache when needed**: Reset cache for different migration sessions

### 5. Testing and Validation

- **Benchmark regularly**: Run performance tests with different configurations
- **Test with realistic data**: Use representative repository sizes and structures
- **Monitor in production**: Track performance metrics during actual migrations
- **Document findings**: Keep records of optimal configurations for different scenarios

### 6. Scalability Planning

- **Plan for growth**: Consider future repository size increases
- **Test breaking points**: Identify limits where performance degrades significantly
- **Prepare fallback strategies**: Have alternative configurations for edge cases
- **Monitor trends**: Track performance changes over time

## Example Usage Scenarios

### Scenario 1: Small Team Repository

```typescript
// Configuration for small repositories (< 100 files)
const smallTeamOptions: PerformanceOptions = {
    enableCaching: false,
    maxParallelJobs: 2,
    chunkSize: 10,
    memoryLimit: 128,
    useStreaming: false,
    enableWorkerThreads: false
};

// Expected performance: 50-100 files/sec, 50-100 MB memory usage
```

### Scenario 2: Enterprise Monorepo

```typescript
// Configuration for large enterprise repositories (5000+ files)
const enterpriseOptions: PerformanceOptions = {
    enableCaching: true,
    maxParallelJobs: 8,
    chunkSize: 200,
    memoryLimit: 2048,
    useStreaming: true,
    enableWorkerThreads: true
};

// Enable memory monitoring for large repositories
globalMemoryManager.startMonitoring();
globalMemoryManager.on('memoryPressure', (stats) => {
    // Reduce parallel jobs if memory pressure is detected
    enterpriseOptions.maxParallelJobs = Math.max(2, enterpriseOptions.maxParallelJobs! - 2);
});
```

### Scenario 3: CI/CD Pipeline

```typescript
// Configuration optimized for CI/CD environments
const ciOptions: PerformanceOptions = {
    enableCaching: false,        // Fresh environment each time
    maxParallelJobs: 4,          // Moderate parallelism
    chunkSize: 50,
    memoryLimit: 512,            // Conservative memory usage
    useStreaming: true,          // Handle large files efficiently
    enableWorkerThreads: false   // Avoid worker thread overhead in short-lived processes
};
```

## Conclusion

Optimal performance configuration depends on:

1. **Repository characteristics**: Size, file complexity, directory structure
2. **System resources**: Available CPU cores, memory, I/O capacity
3. **Usage patterns**: Frequency of migrations, batch vs. interactive processing
4. **Quality requirements**: Speed vs. reliability trade-offs

Use the benchmarking and scalability analysis tools to find the optimal configuration for your specific use case. Start with the recommended defaults and adjust based on measured performance and resource usage.

For additional support or questions about performance optimization, refer to the main documentation or create an issue in the project repository.
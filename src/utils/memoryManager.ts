import * as os from 'os';
import { EventEmitter } from 'events';

export interface MemoryStats {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    arrayBuffers: number;
    timestamp: number;
}

export interface MemoryThresholds {
    warning: number; // MB
    critical: number; // MB
    cleanup: number; // MB
}

export interface MemoryManagerOptions {
    thresholds?: MemoryThresholds;
    monitoringInterval?: number; // ms
    enableGC?: boolean;
    maxHistorySize?: number;
}

export class MemoryManager extends EventEmitter {
    private options: Required<MemoryManagerOptions>;
    private monitoringTimer?: NodeJS.Timeout;
    private memoryHistory: MemoryStats[] = [];
    private isMonitoring = false;
    private lastCleanupTime = 0;
    private cleanupCooldown = 5000; // 5 seconds

    constructor(options: MemoryManagerOptions = {}) {
        super();
        
        this.options = {
            thresholds: {
                warning: 256, // 256MB
                critical: 512, // 512MB
                cleanup: 384, // 384MB
                ...options.thresholds
            },
            monitoringInterval: 1000, // 1 second
            enableGC: true,
            maxHistorySize: 100,
            ...options
        };
    }

    startMonitoring(): void {
        if (this.isMonitoring) {
            return;
        }

        this.isMonitoring = true;
        this.monitoringTimer = setInterval(() => {
            this.checkMemoryUsage();
        }, this.options.monitoringInterval);

        this.emit('monitoring-started');
    }

    stopMonitoring(): void {
        if (!this.isMonitoring) {
            return;
        }

        this.isMonitoring = false;
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
            this.monitoringTimer = undefined;
        }

        this.emit('monitoring-stopped');
    }

    private checkMemoryUsage(): void {
        const memoryUsage = process.memoryUsage();
        const stats: MemoryStats = {
            heapUsed: memoryUsage.heapUsed,
            heapTotal: memoryUsage.heapTotal,
            external: memoryUsage.external,
            rss: memoryUsage.rss,
            arrayBuffers: memoryUsage.arrayBuffers,
            timestamp: Date.now()
        };

        this.addToHistory(stats);
        this.evaluateMemoryPressure(stats);
    }

    private addToHistory(stats: MemoryStats): void {
        this.memoryHistory.push(stats);
        
        if (this.memoryHistory.length > this.options.maxHistorySize) {
            this.memoryHistory.shift();
        }
    }

    private evaluateMemoryPressure(stats: MemoryStats): void {
        const heapUsedMB = stats.heapUsed / 1024 / 1024;
        const rssMB = stats.rss / 1024 / 1024;
        const maxUsedMB = Math.max(heapUsedMB, rssMB);

        if (maxUsedMB >= this.options.thresholds.critical) {
            this.emit('memory-critical', { stats, usedMB: maxUsedMB });
            this.performEmergencyCleanup();
        } else if (maxUsedMB >= this.options.thresholds.cleanup) {
            this.emit('memory-cleanup', { stats, usedMB: maxUsedMB });
            this.performCleanup();
        } else if (maxUsedMB >= this.options.thresholds.warning) {
            this.emit('memory-warning', { stats, usedMB: maxUsedMB });
        }
    }

    private performCleanup(): void {
        const now = Date.now();
        if (now - this.lastCleanupTime < this.cleanupCooldown) {
            return; // Too soon since last cleanup
        }

        this.lastCleanupTime = now;
        
        if (this.options.enableGC && global.gc) {
            global.gc();
            this.emit('gc-triggered', 'cleanup');
        }

        // Clear some memory history to free up space
        if (this.memoryHistory.length > 50) {
            this.memoryHistory.splice(0, this.memoryHistory.length - 50);
        }
    }

    private performEmergencyCleanup(): void {
        this.lastCleanupTime = Date.now();
        
        if (this.options.enableGC && global.gc) {
            // Force multiple GC cycles for emergency cleanup
            global.gc();
            setTimeout(() => global.gc && global.gc(), 100);
            this.emit('gc-triggered', 'emergency');
        }

        // Clear most of the memory history
        this.memoryHistory.splice(0, this.memoryHistory.length - 10);
        
        this.emit('emergency-cleanup-performed');
    }

    getCurrentStats(): MemoryStats {
        const memoryUsage = process.memoryUsage();
        return {
            heapUsed: memoryUsage.heapUsed,
            heapTotal: memoryUsage.heapTotal,
            external: memoryUsage.external,
            rss: memoryUsage.rss,
            arrayBuffers: memoryUsage.arrayBuffers,
            timestamp: Date.now()
        };
    }

    getMemoryHistory(): MemoryStats[] {
        return [...this.memoryHistory];
    }

    getMemoryTrend(windowSize: number = 10): 'increasing' | 'decreasing' | 'stable' {
        if (this.memoryHistory.length < windowSize) {
            return 'stable';
        }

        const recent = this.memoryHistory.slice(-windowSize);
        const first = recent[0].heapUsed;
        const last = recent[recent.length - 1].heapUsed;
        const threshold = first * 0.1; // 10% threshold

        if (last > first + threshold) {
            return 'increasing';
        } else if (last < first - threshold) {
            return 'decreasing';
        } else {
            return 'stable';
        }
    }

    getPeakMemoryUsage(): MemoryStats | null {
        if (this.memoryHistory.length === 0) {
            return null;
        }

        return this.memoryHistory.reduce((peak, current) => 
            current.heapUsed > peak.heapUsed ? current : peak
        );
    }

    getAverageMemoryUsage(): number {
        if (this.memoryHistory.length === 0) {
            return 0;
        }

        const total = this.memoryHistory.reduce((sum, stats) => sum + stats.heapUsed, 0);
        return total / this.memoryHistory.length;
    }

    getSystemMemoryInfo() {
        return {
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            usedMemory: os.totalmem() - os.freemem(),
            memoryUsagePercent: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100,
            processMemory: process.memoryUsage(),
            cpuCount: os.cpus().length,
            platform: os.platform(),
            arch: os.arch()
        };
    }

    isMemoryPressureHigh(): boolean {
        const current = this.getCurrentStats();
        const heapUsedMB = current.heapUsed / 1024 / 1024;
        return heapUsedMB >= this.options.thresholds.warning;
    }

    shouldReduceParallelism(): boolean {
        const current = this.getCurrentStats();
        const heapUsedMB = current.heapUsed / 1024 / 1024;
        return heapUsedMB >= this.options.thresholds.cleanup;
    }

    getRecommendedChunkSize(baseChunkSize: number): number {
        const current = this.getCurrentStats();
        const heapUsedMB = current.heapUsed / 1024 / 1024;
        
        if (heapUsedMB >= this.options.thresholds.critical) {
            return Math.max(1, Math.floor(baseChunkSize * 0.25)); // Reduce to 25%
        } else if (heapUsedMB >= this.options.thresholds.cleanup) {
            return Math.max(1, Math.floor(baseChunkSize * 0.5)); // Reduce to 50%
        } else if (heapUsedMB >= this.options.thresholds.warning) {
            return Math.max(1, Math.floor(baseChunkSize * 0.75)); // Reduce to 75%
        }
        
        return baseChunkSize;
    }

    getRecommendedParallelJobs(baseJobs: number): number {
        const current = this.getCurrentStats();
        const heapUsedMB = current.heapUsed / 1024 / 1024;
        
        if (heapUsedMB >= this.options.thresholds.critical) {
            return Math.max(1, Math.floor(baseJobs * 0.25)); // Reduce to 25%
        } else if (heapUsedMB >= this.options.thresholds.cleanup) {
            return Math.max(1, Math.floor(baseJobs * 0.5)); // Reduce to 50%
        } else if (heapUsedMB >= this.options.thresholds.warning) {
            return Math.max(1, Math.floor(baseJobs * 0.75)); // Reduce to 75%
        }
        
        return baseJobs;
    }

    generateReport(): string {
        const current = this.getCurrentStats();
        const peak = this.getPeakMemoryUsage();
        const average = this.getAverageMemoryUsage();
        const trend = this.getMemoryTrend();
        const system = this.getSystemMemoryInfo();

        return `
=== Memory Manager Report ===
Current Usage:
  Heap Used: ${(current.heapUsed / 1024 / 1024).toFixed(2)} MB
  Heap Total: ${(current.heapTotal / 1024 / 1024).toFixed(2)} MB
  RSS: ${(current.rss / 1024 / 1024).toFixed(2)} MB
  External: ${(current.external / 1024 / 1024).toFixed(2)} MB

Statistics:
  Peak Usage: ${peak ? (peak.heapUsed / 1024 / 1024).toFixed(2) : 'N/A'} MB
  Average Usage: ${(average / 1024 / 1024).toFixed(2)} MB
  Memory Trend: ${trend}
  History Size: ${this.memoryHistory.length}

Thresholds:
  Warning: ${this.options.thresholds.warning} MB
  Cleanup: ${this.options.thresholds.cleanup} MB
  Critical: ${this.options.thresholds.critical} MB

System Info:
  Total Memory: ${(system.totalMemory / 1024 / 1024 / 1024).toFixed(2)} GB
  Free Memory: ${(system.freeMemory / 1024 / 1024 / 1024).toFixed(2)} GB
  Memory Usage: ${system.memoryUsagePercent.toFixed(2)}%
  CPU Count: ${system.cpuCount}
  Platform: ${system.platform}
`;
    }

    cleanup(): void {
        this.stopMonitoring();
        this.memoryHistory = [];
        this.removeAllListeners();
    }
}

// Global memory manager instance
export const globalMemoryManager = new MemoryManager();

// Convenience functions
export function startMemoryMonitoring(options?: MemoryManagerOptions): MemoryManager {
    const manager = new MemoryManager(options);
    manager.startMonitoring();
    return manager;
}

export function getCurrentMemoryUsage(): MemoryStats {
    return globalMemoryManager.getCurrentStats();
}

export function isMemoryPressureHigh(): boolean {
    return globalMemoryManager.isMemoryPressureHigh();
}

export function forceGarbageCollection(): boolean {
    if (global.gc) {
        global.gc();
        return true;
    }
    return false;
}
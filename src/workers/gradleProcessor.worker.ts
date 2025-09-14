import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import * as fs from 'fs';
import * as path from 'path';

interface WorkerTask {
    type: 'PROCESS_FILE' | 'VALIDATE_GRADLE' | 'APPLY_MAPPINGS';
    filePath: string;
    content?: string;
    urlMappings?: Map<string, string>;
    options?: any;
}

interface WorkerResult {
    success: boolean;
    filePath: string;
    modifiedContent?: string;
    validationResult?: any;
    error?: string;
    processingTime: number;
}

if (!isMainThread && parentPort) {
    parentPort.on('message', async (task: WorkerTask) => {
        const startTime = Date.now();
        let result: WorkerResult = {
            success: false,
            filePath: task.filePath,
            processingTime: 0
        };

        try {
            switch (task.type) {
                case 'PROCESS_FILE':
                    result = await processFile(task);
                    break;
                case 'VALIDATE_GRADLE':
                    result = await validateGradleFile(task);
                    break;
                case 'APPLY_MAPPINGS':
                    result = await applyUrlMappings(task);
                    break;
                default:
                    throw new Error(`Unknown task type: ${task.type}`);
            }
        } catch (error) {
            result.error = error instanceof Error ? error.message : String(error);
        }

        result.processingTime = Date.now() - startTime;
        parentPort!.postMessage(result);
    });
}

async function processFile(task: WorkerTask): Promise<WorkerResult> {
    const { filePath, urlMappings } = task;
    
    // Read file content
    const content = await fs.promises.readFile(filePath, 'utf8');
    let modifiedContent = content;
    
    // Apply URL mappings if provided
    if (urlMappings) {
        for (const [oldUrl, newUrl] of urlMappings) {
            const regex = new RegExp(oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            modifiedContent = modifiedContent.replace(regex, newUrl);
        }
    }
    
    return {
        success: true,
        filePath,
        modifiedContent,
        processingTime: 0 // Will be set by caller
    };
}

async function validateGradleFile(task: WorkerTask): Promise<WorkerResult> {
    const { filePath, content } = task;
    const fileContent = content || await fs.promises.readFile(filePath, 'utf8');
    
    const validationResult = {
        isValid: true,
        errors: [] as string[],
        warnings: [] as string[],
        suggestions: [] as string[]
    };
    
    // Basic Gradle syntax validation
    const lines = fileContent.split('\n');
    let braceCount = 0;
    let inString = false;
    let stringChar = '';
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Skip comments and empty lines
        if (line.startsWith('//') || line.startsWith('/*') || line === '') {
            continue;
        }
        
        // Check for common Gradle patterns
        if (line.includes('compile ') && !line.includes('compileOnly')) {
            validationResult.warnings.push(`Line ${i + 1}: 'compile' is deprecated, use 'implementation' instead`);
        }
        
        if (line.includes('testCompile ')) {
            validationResult.warnings.push(`Line ${i + 1}: 'testCompile' is deprecated, use 'testImplementation' instead`);
        }
        
        // Check for missing quotes in version strings
        const versionMatch = line.match(/version\s*=\s*([^'"\s]+)/);
        if (versionMatch && !versionMatch[1].match(/^['"].*['"]$/)) {
            validationResult.warnings.push(`Line ${i + 1}: Version should be quoted: ${versionMatch[1]}`);
        }
        
        // Basic brace matching
        for (const char of line) {
            if (!inString) {
                if (char === '"' || char === "'") {
                    inString = true;
                    stringChar = char;
                } else if (char === '{') {
                    braceCount++;
                } else if (char === '}') {
                    braceCount--;
                }
            } else if (char === stringChar && line[line.indexOf(char) - 1] !== '\\') {
                inString = false;
                stringChar = '';
            }
        }
    }
    
    if (braceCount !== 0) {
        validationResult.errors.push('Mismatched braces in Gradle file');
        validationResult.isValid = false;
    }
    
    return {
        success: true,
        filePath,
        validationResult,
        processingTime: 0
    };
}

async function applyUrlMappings(task: WorkerTask): Promise<WorkerResult> {
    const { content, urlMappings } = task;
    
    if (!content || !urlMappings) {
        throw new Error('Content and URL mappings are required for this operation');
    }
    
    let modifiedContent = content;
    
    // Apply URL mappings with performance optimizations
    for (const [oldUrl, newUrl] of urlMappings) {
        // Use more efficient string replacement for large content
        if (modifiedContent.length > 10000) {
            // For large files, use split/join which can be faster than regex
            modifiedContent = modifiedContent.split(oldUrl).join(newUrl);
        } else {
            // For smaller files, use regex for more precise matching
            const regex = new RegExp(oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            modifiedContent = modifiedContent.replace(regex, newUrl);
        }
    }
    
    return {
        success: true,
        filePath: task.filePath,
        modifiedContent,
        processingTime: 0
    };
}

// Export worker pool manager for main thread
export class GradleWorkerPool {
    private workers: Worker[] = [];
    private availableWorkers: Worker[] = [];
    private taskQueue: Array<{ task: WorkerTask; resolve: (value: WorkerResult) => void; reject: (reason: any) => void }> = [];
    private maxWorkers: number;
    
    constructor(maxWorkers: number = require('os').cpus().length) {
        this.maxWorkers = Math.min(maxWorkers, 8); // Cap at 8 workers
    }
    
    private createWorker(): Worker {
        const worker = new Worker(__filename);
        this.workers.push(worker);
        this.availableWorkers.push(worker);
        
        worker.on('error', (error) => {
            console.error('Worker error:', error);
            this.removeWorker(worker);
        });
        
        worker.on('exit', (code) => {
            if (code !== 0) {
                console.error(`Worker stopped with exit code ${code}`);
            }
            this.removeWorker(worker);
        });
        
        return worker;
    }
    
    private removeWorker(worker: Worker): void {
        const workerIndex = this.workers.indexOf(worker);
        if (workerIndex > -1) {
            this.workers.splice(workerIndex, 1);
        }
        
        const availableIndex = this.availableWorkers.indexOf(worker);
        if (availableIndex > -1) {
            this.availableWorkers.splice(availableIndex, 1);
        }
    }
    
    private getAvailableWorker(): Worker {
        if (this.availableWorkers.length > 0) {
            return this.availableWorkers.pop()!;
        }
        
        if (this.workers.length < this.maxWorkers) {
            return this.createWorker();
        }
        
        throw new Error('No available workers');
    }
    
    private processQueue(): void {
        while (this.taskQueue.length > 0 && this.availableWorkers.length > 0) {
            const { task, resolve, reject } = this.taskQueue.shift()!;
            this.executeTask(task).then(resolve).catch(reject);
        }
    }
    
    async executeTask(task: WorkerTask): Promise<WorkerResult> {
        return new Promise((resolve, reject) => {
            try {
                const worker = this.getAvailableWorker();
                
                const timeout = setTimeout(() => {
                    reject(new Error('Worker task timeout'));
                }, 30000); // 30 second timeout
                
                worker.once('message', (result: WorkerResult) => {
                    clearTimeout(timeout);
                    this.availableWorkers.push(worker);
                    this.processQueue();
                    resolve(result);
                });
                
                worker.postMessage(task);
                
            } catch (error) {
                if (error instanceof Error && error.message === 'No available workers') {
                    // Queue the task
                    this.taskQueue.push({ task, resolve, reject });
                } else {
                    reject(error);
                }
            }
        });
    }
    
    async terminate(): Promise<void> {
        const terminationPromises = this.workers.map(worker => worker.terminate());
        await Promise.all(terminationPromises);
        this.workers = [];
        this.availableWorkers = [];
        this.taskQueue = [];
    }
    
    getStats() {
        return {
            totalWorkers: this.workers.length,
            availableWorkers: this.availableWorkers.length,
            queuedTasks: this.taskQueue.length,
            maxWorkers: this.maxWorkers
        };
    }
}
const ProcessingJob = require('../models/ProcessingJob');
const File = require('../models/File');
const imageProcessor = require('./imageProcessor');
const path = require('path');
const fs = require('fs').promises;

class BackgroundProcessor {
    constructor() {
        this.isRunning = false;
        this.processingInterval = null;
        this.maxConcurrentJobs = 3;
        this.currentJobs = new Set();
        this.pollInterval = 5000; // Check for new jobs every 5 seconds
    }

    // Start the background processing system
    start() {
        if (this.isRunning) {
            console.log('Background processor is already running');
            return;
        }

        this.isRunning = true;
        console.log('Starting background processor...');

        // Set up recurring job processing
        this.processingInterval = setInterval(() => {
            this.processNextJobs();
        }, this.pollInterval);

        // Process any existing jobs immediately
        this.processNextJobs();

        // Handle graceful shutdown
        process.on('SIGINT', () => this.stop());
        process.on('SIGTERM', () => this.stop());
    }

    // Stop the background processing system gracefully
    async stop() {
        if (!this.isRunning) {
            console.log('Background processor is not running');
            return;
        }

        console.log('Stopping background processor...');
        this.isRunning = false;

        // Clear the processing interval
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }

        // Wait for current jobs to complete
        console.log(`Waiting for ${this.currentJobs.size} jobs to complete...`);
        while (this.currentJobs.size > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log('Background processor stopped');
    }

    // Process the next available jobs up to the concurrency limit
    async processNextJobs() {
        if (!this.isRunning) return;

        try {
            // Don't start new jobs if we're at capacity
            const availableSlots = this.maxConcurrentJobs - this.currentJobs.size;
            if (availableSlots <= 0) return;

            // Get next jobs to process
            for (let i = 0; i < availableSlots; i++) {
                const job = await ProcessingJob.getNextJob();
                if (!job) break; // No more jobs available

                // Process job asynchronously without blocking other jobs
                this.processJob(job);
            }
        } catch (error) {
            console.error('Error in processNextJobs:', error);
        }
    }

    // Process a single job
    async processJob(job) {
        const jobId = job.id;
        this.currentJobs.add(jobId);

        try {
            console.log(`Starting job ${jobId}: ${job.job_type} for file ${job.file_id}`);

            // Mark job as started
            await job.start();

            // Execute the appropriate processing function based on job type
            switch (job.job_type) {
                case 'thumbnail_generation':
                    await this.processThumbnailGeneration(job);
                    break;
                case 'image_optimization':
                    await this.processImageOptimization(job);
                    break;
                case 'metadata_extraction':
                    await this.processMetadataExtraction(job);
                    break;
                case 'virus_scan':
                    await this.processVirusScan(job);
                    break;
                default:
                    throw new Error(`Unknown job type: ${job.job_type}`);
            }

            // Mark job as completed
            await job.complete();
            console.log(`Completed job ${jobId}: ${job.job_type}`);

        } catch (error) {
            console.error(`Error processing job ${jobId}:`, error);

            // Mark job as failed
            await job.fail(error.message);

            // Update file status if this was a critical job
            try {
                const file = await File.findByIdAndUserId(job.file_id, null, { skipUserCheck: true });
                if (file) {
                    await file.update({
                        processing_status: 'failed',
                        processing_error: error.message
                    });
                }
            } catch (updateError) {
                console.error(`Error updating file status for job ${jobId}:`, updateError);
            }
        } finally {
            this.currentJobs.delete(jobId);
        }
    }

    // Generate thumbnails for an image file
    async processThumbnailGeneration(job) {
        const file = await File.findByIdAndUserId(job.file_id, null, { skipUserCheck: true });
        if (!file) {
            throw new Error('File not found');
        }

        if (file.file_category !== 'image') {
            throw new Error('Thumbnail generation is only available for images');
        }

        // Check if file exists on disk
        try {
            await fs.access(file.file_path);
        } catch (error) {
            throw new Error('File not found on disk');
        }

        // Generate thumbnails using our image processor
        const processingResults = await imageProcessor.processImage(file.file_path, {
            generateThumbnails: true,
            optimizeOriginal: false,
            extractMetadata: false
        });

        // Update file record with thumbnail information
        await file.update({
            has_thumbnail: true,
            thumbnail_path: processingResults.thumbnails.medium?.path || null
        });

        console.log(`Generated thumbnails for file ${file.id}`);
    }

    // Optimize an image for web delivery
    async processImageOptimization(job) {
        const file = await File.findByIdAndUserId(job.file_id, null, { skipUserCheck: true });
        if (!file) {
            throw new Error('File not found');
        }

        if (file.file_category !== 'image') {
            throw new Error('Image optimization is only available for images');
        }

        // Check if file exists on disk
        try {
            await fs.access(file.file_path);
        } catch (error) {
            throw new Error('File not found on disk');
        }

        // Optimize the image
        const processingResults = await imageProcessor.processImage(file.file_path, {
            generateThumbnails: false,
            optimizeOriginal: true,
            extractMetadata: false
        });

        console.log(`Optimized image for file ${file.id}`);
    }

    // Extract metadata from various file types
    async processMetadataExtraction(job) {
        const file = await File.findByIdAndUserId(job.file_id, null, { skipUserCheck: true });
        if (!file) {
            throw new Error('File not found');
        }

        // Check if file exists on disk
        try {
            await fs.access(file.file_path);
        } catch (error) {
            throw new Error('File not found on disk');
        }

        let extractedMetadata = {};

        switch (file.file_category) {
            case 'image':
                extractedMetadata = await this.extractImageMetadata(file.file_path);
                await file.update({
                    image_width: extractedMetadata.width,
                    image_height: extractedMetadata.height
                });
                break;

            case 'document':
                extractedMetadata = await this.extractDocumentMetadata(file.file_path);
                await file.update({
                    document_pages: extractedMetadata.pages,
                    document_text_content: extractedMetadata.textContent?.substring(0, 5000) // Limit text content
                });
                break;

            default:
                extractedMetadata = await this.extractBasicMetadata(file.file_path);
                break;
        }

        console.log(`Extracted metadata for file ${file.id}:`, Object.keys(extractedMetadata));
    }

    // Basic virus scanning (placeholder implementation)
    async processVirusScan(job) {
        const file = await File.findByIdAndUserId(job.file_id, null, { skipUserCheck: true });
        if (!file) {
            throw new Error('File not found');
        }

        // Check if file exists on disk
        try {
            await fs.access(file.file_path);
        } catch (error) {
            throw new Error('File not found on disk');
        }

        // Placeholder for virus scanning
        // In a real implementation, you would integrate with antivirus software
        console.log(`Virus scan completed for file ${file.id} - Clean`);

        // Update file processing status to completed if this was the last processing step
        const pendingJobs = await ProcessingJob.getJobsForFile(file.id);
        const hasPendingJobs = pendingJobs.some(j =>
            j.id !== job.id && ['queued', 'processing'].includes(j.status)
        );

        if (!hasPendingJobs) {
            await file.update({
                processing_status: 'completed'
            });
        }
    }

    // Extract metadata from image files
    async extractImageMetadata(filePath) {
        try {
            return await imageProcessor.getImageMetadata(filePath);
        } catch (error) {
            console.error('Error extracting image metadata:', error);
            return {};
        }
    }

    // Extract metadata from document files
    async extractDocumentMetadata(filePath) {
        try {
            const stats = await fs.stat(filePath);
            const metadata = {
                fileSize: stats.size,
                lastModified: stats.mtime,
                pages: null,
                textContent: null
            };

            // Basic PDF metadata extraction (placeholder)
            if (path.extname(filePath).toLowerCase() === '.pdf') {
                // In a real implementation, you would use a PDF parsing library
                metadata.pages = 1; // Placeholder
                metadata.textContent = 'PDF text content extraction would go here';
            }

            return metadata;
        } catch (error) {
            console.error('Error extracting document metadata:', error);
            return {};
        }
    }

    // Extract basic file metadata
    async extractBasicMetadata(filePath) {
        try {
            const stats = await fs.stat(filePath);
            return {
                fileSize: stats.size,
                lastModified: stats.mtime,
                created: stats.birthtime
            };
        } catch (error) {
            console.error('Error extracting basic metadata:', error);
            return {};
        }
    }

    // Get processing statistics
    getStats() {
        return {
            isRunning: this.isRunning,
            currentJobs: this.currentJobs.size,
            maxConcurrentJobs: this.maxConcurrentJobs,
            pollInterval: this.pollInterval
        };
    }
}

// Create and export a singleton instance
const backgroundProcessor = new BackgroundProcessor();

module.exports = backgroundProcessor;

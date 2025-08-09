const File = require('../models/File');
const ProcessingJob = require('../models/ProcessingJob');
const imageProcessor = require('../services/imageProcessor');
const path = require('path');
const fs = require('fs').promises;

class FileController {
    // Handle file upload with immediate processing job creation
    static async uploadFiles(req, res) {
        try {
            if (!req.files && !req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'No files provided for upload'
                });
            }

            const files = req.files || [req.file];
            const uploadedFiles = [];
            const processingJobs = [];

            // Process each uploaded file
            for (const uploadedFile of files) {
                try {
                    // Extract image dimensions if it's an image file
                    let imageWidth = null;
                    let imageHeight = null;

                    if (uploadedFile.mimetype.startsWith('image/')) {
                        try {
                            const metadata = await imageProcessor.getImageMetadata(uploadedFile.path);
                            imageWidth = metadata.width;
                            imageHeight = metadata.height;
                        } catch (error) {
                            console.warn('Could not extract image metadata:', error.message);
                        }
                    }

                    // Create file record in database
                    const fileRecord = await File.create({
                        filename: uploadedFile.filename,
                        original_filename: uploadedFile.originalname,
                        mime_type: uploadedFile.mimetype,
                        file_size: uploadedFile.size,
                        file_path: uploadedFile.path,
                        image_width: imageWidth,
                        image_height: imageHeight
                    }, req.user.id);

                    uploadedFiles.push(fileRecord);

                    // Create appropriate processing jobs based on file type
                    if (uploadedFile.mimetype.startsWith('image/')) {
                        // Create thumbnail generation job for images
                        const thumbnailJob = await ProcessingJob.create({
                            file_id: fileRecord.id,
                            job_type: 'thumbnail_generation',
                            priority: 3 // Higher priority for user-visible features
                        });
                        processingJobs.push(thumbnailJob);

                        // Create image optimization job
                        const optimizationJob = await ProcessingJob.create({
                            file_id: fileRecord.id,
                            job_type: 'image_optimization',
                            priority: 5 // Lower priority for background optimizations
                        });
                        processingJobs.push(optimizationJob);
                    }

                    // Create metadata extraction job for all files
                    const metadataJob = await ProcessingJob.create({
                        file_id: fileRecord.id,
                        job_type: 'metadata_extraction',
                        priority: 4
                    });
                    processingJobs.push(metadataJob);

                } catch (error) {
                    console.error('Error processing uploaded file:', error);

                    // Clean up the uploaded file if database operations fail
                    await fs.unlink(uploadedFile.path).catch(console.error);

                    return res.status(500).json({
                        success: false,
                        error: 'Failed to process uploaded file',
                        details: error.message
                    });
                }
            }

            res.status(201).json({
                success: true,
                message: `Successfully uploaded ${uploadedFiles.length} file(s)`,
                data: {
                    files: uploadedFiles.map(file => file.toJSON()),
                    processing_jobs: processingJobs.map(job => ({
                        id: job.id,
                        type: job.job_type,
                        status: job.status
                    }))
                }
            });

        } catch (error) {
            console.error('Error in file upload:', error);
            res.status(500).json({
                success: false,
                error: 'File upload failed',
                details: error.message
            });
        }
    }

    // Get files for the authenticated user with filtering and pagination
    static async getUserFiles(req, res) {
        try {
            const {
                category,
                processing_status,
                search,
                page = 1,
                limit = 20,
                sort_by = 'created_at',
                sort_order = 'DESC'
            } = req.query;

            const options = {
                category,
                processing_status,
                search,
                page: parseInt(page),
                limit: Math.min(parseInt(limit), 100), // Cap at 100 files per request
                sort_by,
                sort_order
            };

            const files = await File.findByUserId(req.user.id, options);

            // Get storage statistics for the user
            const storageStats = await File.getStorageStats(req.user.id);

            res.json({
                success: true,
                data: {
                    files: files.map(file => file.toJSON()),
                    pagination: {
                        page: options.page,
                        limit: options.limit,
                        total_files: parseInt(storageStats.total_files)
                    },
                    storage_stats: {
                        used_bytes: parseInt(storageStats.storage_used_bytes),
                        quota_bytes: parseInt(storageStats.storage_quota_bytes),
                        used_percentage: Math.round((storageStats.storage_used_bytes / storageStats.storage_quota_bytes) * 100),
                        file_counts: {
                            images: parseInt(storageStats.image_count),
                            documents: parseInt(storageStats.document_count),
                            videos: parseInt(storageStats.video_count),
                            audio: parseInt(storageStats.audio_count),
                            other: parseInt(storageStats.other_count)
                        }
                    }
                }
            });

        } catch (error) {
            console.error('Error getting user files:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve files'
            });
        }
    }

    // Get details for a specific file
    static async getFileDetails(req, res) {
        try {
            const fileId = parseInt(req.params.fileId);

            if (isNaN(fileId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid file ID'
                });
            }

            const file = await File.findByIdAndUserId(fileId, req.user.id);

            if (!file) {
                return res.status(404).json({
                    success: false,
                    error: 'File not found'
                });
            }

            // Get processing jobs for this file
            const processingJobs = await ProcessingJob.getJobsForFile(fileId);

            res.json({
                success: true,
                data: {
                    file: file.toJSON(),
                    processing_jobs: processingJobs.map(job => ({
                        id: job.id,
                        type: job.job_type,
                        status: job.status,
                        created_at: job.created_at,
                        started_at: job.started_at,
                        completed_at: job.completed_at,
                        attempts: job.attempts,
                        error_message: job.error_message
                    }))
                }
            });

        } catch (error) {
            console.error('Error getting file details:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve file details'
            });
        }
    }

    // Serve file content with proper headers and access control
    static async serveFile(req, res) {
        try {
            const fileId = parseInt(req.params.fileId);
            const { size = 'original' } = req.query;

            if (isNaN(fileId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid file ID'
                });
            }

            const file = await File.findByIdAndUserId(fileId, req.user.id);

            if (!file) {
                return res.status(404).json({
                    success: false,
                    error: 'File not found'
                });
            }

            let filePath = file.file_path;

            // Handle thumbnail requests for images
            if (size !== 'original' && file.file_category === 'image' && file.has_thumbnail) {
                const thumbnailSizes = ['small', 'medium', 'large'];
                if (thumbnailSizes.includes(size)) {
                    const thumbnailDir = path.join(path.dirname(file.file_path), '..', '..', 'thumbnails');
                    const baseName = path.parse(file.file_path).name;
                    const thumbnailPath = path.join(thumbnailDir, `${baseName}_${size}.webp`);

                    try {
                        await fs.access(thumbnailPath);
                        filePath = thumbnailPath;
                    } catch (error) {
                        // Thumbnail doesn't exist, serve original file
                        console.warn(`Thumbnail ${size} not found for file ${fileId}, serving original`);
                    }
                }
            }

            // Check if file exists on disk
            try {
                await fs.access(filePath);
            } catch (error) {
                return res.status(404).json({
                    success: false,
                    error: 'File not found on disk'
                });
            }

            // Set appropriate headers for file serving
            res.setHeader('Content-Type', file.mime_type);
            res.setHeader('Content-Disposition', `inline; filename="${file.original_filename}"`);
            res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
            res.setHeader('ETag', `"${file.id}-${file.updated_at}"`);

            // Handle conditional requests for better performance
            const ifNoneMatch = req.headers['if-none-match'];
            const etag = `"${file.id}-${file.updated_at}"`;

            if (ifNoneMatch === etag) {
                return res.status(304).end(); // Not modified
            }

            // Stream the file to the response
            const fileStream = require('fs').createReadStream(filePath);

            fileStream.on('error', (error) => {
                console.error('Error streaming file:', error);
                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        error: 'Error serving file'
                    });
                }
            });

            fileStream.pipe(res);

        } catch (error) {
            console.error('Error serving file:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to serve file'
            });
        }
    }

    // Update file metadata
    static async updateFile(req, res) {
        try {
            const fileId = parseInt(req.params.fileId);

            if (isNaN(fileId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid file ID'
                });
            }

            const file = await File.findByIdAndUserId(fileId, req.user.id);

            if (!file) {
                return res.status(404).json({
                    success: false,
                    error: 'File not found'
                });
            }

            // Extract allowed update fields from request body
            const { tags, description, is_public } = req.body;

            const updateData = {};
            if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags : [];
            if (description !== undefined) updateData.description = description;
            if (is_public !== undefined) updateData.is_public = Boolean(is_public);

            // Update the file
            const updatedFile = await file.update(updateData);

            res.json({
                success: true,
                message: 'File updated successfully',
                data: {
                    file: updatedFile.toJSON()
                }
            });

        } catch (error) {
            console.error('Error updating file:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update file',
                details: error.message
            });
        }
    }

    // Delete a file and its associated data
    static async deleteFile(req, res) {
        try {
            const fileId = parseInt(req.params.fileId);

            if (isNaN(fileId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid file ID'
                });
            }

            const file = await File.findByIdAndUserId(fileId, req.user.id);

            if (!file) {
                return res.status(404).json({
                    success: false,
                    error: 'File not found'
                });
            }

            // Delete physical files from disk
            try {
                // Delete original file
                await fs.unlink(file.file_path);

                // Delete thumbnails if they exist
                if (file.has_thumbnail && file.file_category === 'image') {
                    const thumbnailDir = path.join(path.dirname(file.file_path), '..', '..', 'thumbnails');
                    const baseName = path.parse(file.file_path).name;
                    const thumbnailSizes = ['small', 'medium', 'large'];

                    for (const size of thumbnailSizes) {
                        const thumbnailPath = path.join(thumbnailDir, `${baseName}_${size}.webp`);
                        await fs.unlink(thumbnailPath).catch(() => {
                            // Ignore errors if thumbnail doesn't exist
                        });
                    }
                }

                // Delete optimized version if it exists
                const optimizedDir = path.join(path.dirname(file.file_path), '..', '..', 'optimized');
                const parsedPath = path.parse(file.file_path);
                const optimizedPath = path.join(optimizedDir, `${parsedPath.name}_optimized${parsedPath.ext}`);
                await fs.unlink(optimizedPath).catch(() => {
                    // Ignore errors if optimized file doesn't exist
                });

            } catch (error) {
                console.warn('Error deleting physical files:', error.message);
                // Continue with database deletion even if file cleanup fails
            }

            // Delete database record (this will also update storage quota automatically)
            const deleted = await file.delete();

            if (!deleted) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to delete file record'
                });
            }

            res.json({
                success: true,
                message: 'File deleted successfully'
            });

        } catch (error) {
            console.error('Error deleting file:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete file',
                details: error.message
            });
        }
    }

    // Get user's storage statistics
    static async getStorageStats(req, res) {
        try {
            const storageStats = await File.getStorageStats(req.user.id);

            res.json({
                success: true,
                data: {
                    storage_used_bytes: parseInt(storageStats.storage_used_bytes),
                    storage_quota_bytes: parseInt(storageStats.storage_quota_bytes),
                    storage_used_human: File.prototype.formatFileSize(storageStats.storage_used_bytes),
                    storage_quota_human: File.prototype.formatFileSize(storageStats.storage_quota_bytes),
                    usage_percentage: Math.round((storageStats.storage_used_bytes / storageStats.storage_quota_bytes) * 100),
                    file_statistics: {
                        total_files: parseInt(storageStats.total_files),
                        by_category: {
                            images: parseInt(storageStats.image_count),
                            documents: parseInt(storageStats.document_count),
                            videos: parseInt(storageStats.video_count),
                            audio: parseInt(storageStats.audio_count),
                            other: parseInt(storageStats.other_count)
                        },
                        average_file_size: parseInt(storageStats.average_file_size || 0),
                        largest_file_size: parseInt(storageStats.largest_file_size || 0)
                    }
                }
            });

        } catch (error) {
            console.error('Error getting storage statistics:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve storage statistics'
            });
        }
    }
}

module.exports = FileController;

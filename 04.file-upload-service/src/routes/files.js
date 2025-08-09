const express = require('express');
const FileController = require('../controllers/fileController');
const { authenticateToken } = require('../middleware/auth');
const {
    upload,
    checkStorageQuota,
    validateUploadedFiles,
    handleUploadErrors
} = require('../middleware/uploadMiddleware');

const router = express.Router();

// All file routes require authentication
router.use(authenticateToken);

// File upload endpoint with comprehensive middleware chain
router.post('/upload', upload.array('files', 10), // Accept up to 10 files
    handleUploadErrors,
    checkStorageQuota,
    validateUploadedFiles,
    FileController.uploadFiles
);

// File management endpoints
router.get('/', FileController.getUserFiles);
router.get('/stats', FileController.getStorageStats);
router.get('/:fileId', FileController.getFileDetails);
router.get('/:fileId/download', FileController.serveFile);
router.put('/:fileId', FileController.updateFile);
router.delete('/:fileId', FileController.deleteFile);

module.exports = router;

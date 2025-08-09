const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const File = require('../models/File');

// Limits and rules (keep in sync with docs in `app.js`)
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB per file
const MAX_FILES_PER_REQUEST = 10;

// Allowed MIME types
const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  // Documents / text
  'application/pdf', 'text/plain', 'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

const uploadsBaseDir = path.join(__dirname, '..', '..', 'uploads');

async function ensureDirectoryExists(directoryPath) {
  await fs.mkdir(directoryPath, { recursive: true }).catch(() => {});
}

function resolveSubdirectoryForMimeType(mimeType) {
  if (mimeType.startsWith('image/')) return 'images';
  // Treat all supported non-image types as documents for now
  return 'documents';
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const subdir = resolveSubdirectoryForMimeType(file.mimetype);
      const destDir = path.join(uploadsBaseDir, subdir);
      await ensureDirectoryExists(destDir);
      cb(null, destDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const safeExt = ext.length <= 10 ? ext : ext.slice(0, 10); // guard against absurd extensions
    const unique = uuidv4();
    cb(null, `${unique}${safeExt}`);
  }
});

// Multer file filter for MIME type validation
function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    const err = new Error(`Unsupported file type: ${file.mimetype}`);
    err.code = 'UNSUPPORTED_FILE_TYPE';
    return cb(err);
  }
  cb(null, true);
}

// Exported multer instance
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_FILES_PER_REQUEST
  }
});

// Helper: cleanup uploaded files from disk
async function cleanupUploadedFiles(files) {
  if (!files || files.length === 0) return;
  await Promise.all(
    files.map(f => fs.unlink(f.path).catch(() => {}))
  );
}

// Error handler for upload errors (to be used right after the multer middleware)
function handleUploadErrors(err, req, res, next) {
  if (!err) return next();

  // Multer-specific errors
  if (err.name === 'MulterError') {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(413).json({ success: false, error: `File too large. Max ${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB per file.` });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({ success: false, error: `Too many files. Max ${MAX_FILES_PER_REQUEST} files per upload.` });
      default:
        return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
    }
  }

  if (err.code === 'UNSUPPORTED_FILE_TYPE') {
    return res.status(400).json({ success: false, error: err.message });
  }

  // Generic
  return res.status(500).json({ success: false, error: 'Unexpected upload error' });
}

// Check user's storage quota against the uploaded files
async function checkStorageQuota(req, res, next) {
  try {
    const files = req.files || (req.file ? [req.file] : []);
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files provided for upload' });
    }

    const totalUploadBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);

    // Get current usage and quota
    const stats = await File.getStorageStats(req.user.id);
    const usedBytes = parseInt(stats?.storage_used_bytes || 0);
    const quotaBytes = parseInt(stats?.storage_quota_bytes || 0);

    if (quotaBytes && usedBytes + totalUploadBytes > quotaBytes) {
      await cleanupUploadedFiles(files);
      const overBy = usedBytes + totalUploadBytes - quotaBytes;
      return res.status(413).json({
        success: false,
        error: 'Storage quota exceeded',
        details: `Upload exceeds your quota by ${overBy} bytes`
      });
    }

    return next();
  } catch (error) {
    console.error('Error checking storage quota:', error);
    return res.status(500).json({ success: false, error: 'Failed to validate storage quota' });
  }
}

// Additional validation for uploaded files after they are saved to disk
async function validateUploadedFiles(req, res, next) {
  try {
    const files = req.files || (req.file ? [req.file] : []);
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files provided for upload' });
    }

    // Defensive checks in case upstream configuration changes
    if (files.length > MAX_FILES_PER_REQUEST) {
      await cleanupUploadedFiles(files);
      return res.status(400).json({ success: false, error: `Too many files. Max ${MAX_FILES_PER_REQUEST} files per upload.` });
    }

    for (const file of files) {
      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        await cleanupUploadedFiles(files);
        return res.status(400).json({ success: false, error: `Unsupported file type: ${file.mimetype}` });
      }
      if ((file.size || 0) > MAX_FILE_SIZE_BYTES) {
        await cleanupUploadedFiles(files);
        return res.status(413).json({ success: false, error: `File too large. Max ${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB per file.` });
      }
    }

    return next();
  } catch (error) {
    console.error('Error validating uploaded files:', error);
    return res.status(500).json({ success: false, error: 'Failed to validate uploaded files' });
  }
}

module.exports = {
  upload,
  handleUploadErrors,
  checkStorageQuota,
  validateUploadedFiles
};


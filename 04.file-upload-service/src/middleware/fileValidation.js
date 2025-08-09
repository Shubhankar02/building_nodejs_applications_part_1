const Joi = require('joi');

function respondValidationError(res, message, details) {
  return res.status(400).json({
    success: false,
    error: message,
    details
  });
}

// Validate query parameters for listing files
function validateGetFilesQuery(req, res, next) {
  const schema = Joi.object({
    category: Joi.string().valid('image', 'document', 'video', 'audio', 'other').optional(),
    processing_status: Joi.string().valid('queued', 'processing', 'completed', 'failed').optional(),
    search: Joi.string().max(200).allow('', null).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort_by: Joi.string().valid('created_at', 'original_filename', 'file_size', 'last_accessed').default('created_at'),
    sort_order: Joi.string().valid('ASC', 'DESC', 'asc', 'desc').default('DESC')
  }).unknown(false);

  const { value, error } = schema.validate(req.query, { abortEarly: false, convert: true, stripUnknown: true });
  if (error) {
    return respondValidationError(res, 'Invalid query parameters', error.details.map(d => d.message));
  }

  // Normalize
  value.sort_order = String(value.sort_order).toUpperCase();
  req.query = value;
  return next();
}

// Validate params with :fileId
function validateFileIdParam(req, res, next) {
  const schema = Joi.object({
    fileId: Joi.number().integer().positive().required()
  }).unknown(true);

  const { value, error } = schema.validate(req.params, { abortEarly: false, convert: true });
  if (error) {
    return respondValidationError(res, 'Invalid file ID', error.details.map(d => d.message));
  }
  req.params = value;
  return next();
}

// Validate query for serving file variants (e.g., thumbnails)
function validateServeFileQuery(req, res, next) {
  const schema = Joi.object({
    size: Joi.string().valid('original', 'small', 'medium', 'large').default('original')
  }).unknown(false);

  const { value, error } = schema.validate(req.query, { abortEarly: false, convert: true, stripUnknown: true });
  if (error) {
    return respondValidationError(res, 'Invalid query parameters', error.details.map(d => d.message));
  }
  req.query = value;
  return next();
}

// Validate body for updating file metadata
function validateUpdateFileBody(req, res, next) {
  const schema = Joi.object({
    tags: Joi.array().items(Joi.string().trim().max(50)).max(50).optional(),
    description: Joi.string().trim().max(1000).allow('', null).optional(),
    is_public: Joi.boolean().optional()
  }).unknown(false);

  const { value, error } = schema.validate(req.body, { abortEarly: false, convert: true, stripUnknown: true });
  if (error) {
    return respondValidationError(res, 'Invalid request body', error.details.map(d => d.message));
  }
  req.body = value;
  return next();
}

module.exports = {
  validateGetFilesQuery,
  validateFileIdParam,
  validateServeFileQuery,
  validateUpdateFileBody
};


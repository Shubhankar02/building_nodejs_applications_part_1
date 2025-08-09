const db = require('../config/database');

class ProcessingJob {
  constructor(row) {
    this.id = row.id;
    this.file_id = row.file_id;
    this.job_type = row.job_type;
    this.status = row.status;
    this.priority = row.priority;
    this.attempts = row.attempts;
    this.max_attempts = row.max_attempts;
    this.error_message = row.error_message;
    this.processing_data = row.processing_data;
    this.started_at = row.started_at;
    this.completed_at = row.completed_at;
    this.created_at = row.created_at;
  }

  static async create(jobData) {
    const {
      file_id,
      job_type,
      priority = 5,
      processing_data = null
    } = jobData;

    const result = await db.query(
      `INSERT INTO processing_jobs (file_id, job_type, priority, processing_data)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [file_id, job_type, priority, processing_data]
    );

    return new ProcessingJob(result.rows[0]);
  }

  static async getNextJob() {
    // Fetch next queued job by priority, avoiding jobs that exceeded max attempts
    const result = await db.query(
      `SELECT *
       FROM processing_jobs
       WHERE status = 'queued' AND attempts < max_attempts
       ORDER BY priority ASC, created_at ASC
       LIMIT 1`
    );

    if (result.rows.length === 0) return null;
    return new ProcessingJob(result.rows[0]);
  }

  static async getJobsForFile(fileId) {
    const result = await db.query(
      `SELECT * FROM processing_jobs
       WHERE file_id = $1
       ORDER BY created_at DESC`,
      [fileId]
    );
    return result.rows.map(row => new ProcessingJob(row));
  }

  async start() {
    const result = await db.query(
      `UPDATE processing_jobs
       SET status = 'processing', attempts = attempts + 1, started_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [this.id]
    );
    Object.assign(this, result.rows[0]);
    return this;
  }

  async complete() {
    const result = await db.query(
      `UPDATE processing_jobs
       SET status = 'completed', completed_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [this.id]
    );
    Object.assign(this, result.rows[0]);
    return this;
  }

  async fail(errorMessage) {
    const result = await db.query(
      `UPDATE processing_jobs
       SET status = 'failed', error_message = $2, completed_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [this.id, errorMessage || null]
    );
    Object.assign(this, result.rows[0]);
    return this;
  }
}

module.exports = ProcessingJob;



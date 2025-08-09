const db = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  constructor(row) {
    this.id = row.id;
    this.email = row.email;
    this.name = row.name;
    this.password_hash = row.password_hash;
    this.storage_quota_bytes = row.storage_quota_bytes;
    this.storage_used_bytes = row.storage_used_bytes;
    this.created_at = row.created_at;
    this.updated_at = row.updated_at;
  }

  static async create({ email, name, password }) {
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      throw new Error('Email already exists');
    }

    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const result = await db.query(
      `INSERT INTO users (email, name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [email, name, passwordHash]
    );
    return new User(result.rows[0]);
  }

  static async findByEmail(email) {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return null;
    return new User(result.rows[0]);
  }

  static async findById(id) {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    return new User(result.rows[0]);
  }

  async verifyPassword(password) {
    return bcrypt.compare(password, this.password_hash);
  }

  async update(updateData) {
    const allowed = ['name', 'password_hash', 'storage_quota_bytes'];
    const fields = [];
    const values = [];
    let i = 0;
    for (const [key, val] of Object.entries(updateData)) {
      if (allowed.includes(key) && val !== undefined) {
        i += 1;
        fields.push(`${key} = $${i}`);
        values.push(val);
      }
    }
    if (fields.length === 0) return this;

    i += 1;
    values.push(this.id);

    const result = await db.query(
      `UPDATE users
       SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${i}
       RETURNING *`,
      values
    );

    Object.assign(this, result.rows[0]);
    return this;
  }

  toJSON() {
    return {
      id: this.id,
      email: this.email,
      name: this.name,
      storage_quota_bytes: this.storage_quota_bytes,
      storage_used_bytes: this.storage_used_bytes,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }
}

module.exports = User;


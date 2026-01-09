const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class DB {
  constructor() {
    // Determine the correct database path
    let dbPath;
    let schemaPath;

    // Check if we're running in Electron
    const isElectron = typeof process !== 'undefined' &&
      process.versions &&
      process.versions.electron;

    if (isElectron) {
      try {
        const { app } = require('electron');

        // Use app's user data directory for the database (writable)
        const userDataPath = app.getPath('userData');
        dbPath = path.join(userDataPath, 'ixl-data.db');

        // Schema is in the asar archive (readable) or local in dev
        if (app.isPackaged) {
          schemaPath = path.join(app.getAppPath(), 'backend', 'database', 'schema.sql');
        } else {
          schemaPath = path.join(__dirname, 'schema.sql');
        }

        console.log('Electron mode - Database path:', dbPath);
        console.log('Schema path:', schemaPath);
      } catch (e) {
        // Electron require failed, fall back to local
        console.log('Electron import failed, using local paths');
        dbPath = path.join(__dirname, 'ixl-data.db');
        schemaPath = path.join(__dirname, 'schema.sql');
      }
    } else {
      // Development/standalone Node.js
      console.log('Node.js mode - using local database');
      dbPath = path.join(__dirname, 'ixl-data.db');
      schemaPath = path.join(__dirname, 'schema.sql');
    }

    this.db = new Database(dbPath);
    this.initializeSchema(schemaPath);
  }

  initializeSchema(schemaPath) {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    this.db.exec(schema);

    try {
      this.db.exec('ALTER TABLE skills ADD COLUMN skill_code TEXT');
    } catch (e) {
    }

    try {
      this.db.exec('ALTER TABLE students ADD COLUMN default_grade TEXT');
    } catch (e) {
    }

    try {
      this.db.exec('ALTER TABLE students ADD COLUMN default_subject TEXT');
    } catch (e) {
    }

    try {
      this.db.exec('ALTER TABLE skills ADD COLUMN subject TEXT DEFAULT \'math\'');
    } catch (e) {
    }
  }

  getStudents() {
    return this.db.prepare('SELECT * FROM students ORDER BY name').all();
  }

  getStudent(id) {
    return this.db.prepare('SELECT * FROM students WHERE id = ?').get(id);
  }

  addStudent(ixlId, name, className) {
    const stmt = this.db.prepare(
      'INSERT INTO students (ixl_id, name, class_name) VALUES (?, ?, ?)'
    );
    return stmt.run(ixlId, name, className);
  }

  updateStudents(students) {
    const stmt = this.db.prepare(
      `INSERT INTO students (ixl_id, name, class_name, last_synced) VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(ixl_id) DO UPDATE SET
         name=excluded.name,
         class_name=excluded.class_name,
         last_synced=excluded.last_synced`
    );
    const transaction = this.db.transaction((students) => {
      for (const student of students) {
        stmt.run(student.ixlId, student.name, student.className);
      }
    });
    transaction(students);
  }

  updateStudentDefaults(studentId, gradeLevel, subject) {
    const stmt = this.db.prepare(
      'UPDATE students SET default_grade = ?, default_subject = ? WHERE id = ?'
    );
    return stmt.run(gradeLevel, subject, studentId);
  }

  updateStudentDefaultGrade(studentId, gradeLevel) {
    const stmt = this.db.prepare(
      'UPDATE students SET default_grade = ? WHERE id = ?'
    );
    return stmt.run(gradeLevel, studentId);
  }

  getSkills(gradeLevel = null, subject = 'math') {
    if (gradeLevel) {
      return this.db.prepare(
        'SELECT * FROM skills WHERE grade_level = ? AND (subject = ? OR subject IS NULL) ORDER BY category, display_order'
      ).all(gradeLevel, subject);
    }
    return this.db.prepare(
      'SELECT * FROM skills WHERE (subject = ? OR subject IS NULL) ORDER BY category, display_order'
    ).all(subject);
  }

  getSkillsByIds(ids) {
    const placeholders = ids.map(() => '?').join(',');
    return this.db.prepare(
      `SELECT * FROM skills WHERE id IN (${placeholders})`
    ).all(...ids);
  }

  getSkillsByRange(category, startNum, endNum) {
    return this.db.prepare(
      'SELECT * FROM skills WHERE category = ? AND display_order >= ? AND display_order <= ? ORDER BY display_order'
    ).all(category, startNum, endNum);
  }

  addSkill(ixlId, name, category, gradeLevel, url, displayOrder) {
    const stmt = this.db.prepare(
      'INSERT INTO skills (ixl_id, name, category, grade_level, url, display_order) VALUES (?, ?, ?, ?, ?, ?)'
    );
    return stmt.run(ixlId, name, category, gradeLevel, url, displayOrder);
  }

  updateSkills(skills) {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO skills (ixl_id, skill_code, name, category, grade_level, url, display_order, subject) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const transaction = this.db.transaction((skills) => {
      for (const skill of skills) {
        stmt.run(
          skill.ixlId,
          skill.skillCode,
          skill.name,
          skill.category,
          skill.gradeLevel,
          skill.url,
          skill.displayOrder,
          skill.subject || 'math'
        );
      }
    });
    transaction(skills);
  }

  recordAssignment(studentId, skillId, status, errorMessage = null) {
    const stmt = this.db.prepare(
      'INSERT INTO assignment_history (student_id, skill_id, status, error_message) VALUES (?, ?, ?, ?)'
    );
    return stmt.run(studentId, skillId, status, errorMessage);
  }

  getAssignmentHistory(studentId = null, limit = 100) {
    if (studentId) {
      return this.db.prepare(
        `SELECT ah.*, s.name as student_name, sk.name as skill_name 
         FROM assignment_history ah 
         JOIN students s ON ah.student_id = s.id 
         JOIN skills sk ON ah.skill_id = sk.id 
         WHERE ah.student_id = ? 
         ORDER BY ah.assigned_at DESC 
         LIMIT ?`
      ).all(studentId, limit);
    }
    return this.db.prepare(
      `SELECT ah.*, s.name as student_name, sk.name as skill_name 
       FROM assignment_history ah 
       JOIN students s ON ah.student_id = s.id 
       JOIN skills sk ON ah.skill_id = sk.id 
       ORDER BY ah.assigned_at DESC 
       LIMIT ?`
    ).all(limit);
  }

  getSetting(key) {
    const result = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return result ? result.value : null;
  }

  setSetting(key, value) {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
    );
    return stmt.run(key, value);
  }

  close() {
    this.db.close();
  }
}

module.exports = new DB();

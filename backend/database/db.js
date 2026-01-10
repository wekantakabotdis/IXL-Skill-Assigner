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

    // Ensure groups and group_members exist (in case schema.sql wasn't run)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS group_members (
        group_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        PRIMARY KEY (group_id, student_id),
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ixl_username TEXT UNIQUE NOT NULL,
        ixl_password TEXT NOT NULL,
        label TEXT,
        last_used TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
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

  getLastCommonSkill(studentIds) {
    if (!studentIds || studentIds.length === 0) return null;

    const placeholders = studentIds.map(() => '?').join(',');

    // Find the last skill assigned to any of these students
    // The requirement says: "the default should be whatever the last skill was assigned to all of these selected students at once"
    // This implies we look for a skill that was assigned in the same batch (or close timestamp) to all of them.
    // However, if no such "all at once" assignment exists, we could fall back to most recent.
    // Let's try to find a skill that has recent entries for all selected student IDs.

    // Step 1: Find the most recent skill assigned to ONE of the students
    // Step 2: Check if that same skill was assigned to ALL of them around the same time

    const recentSkill = this.db.prepare(`
      SELECT skill_id, assigned_at 
      FROM assignment_history 
      WHERE student_id IN (${placeholders}) 
      ORDER BY assigned_at DESC 
      LIMIT 1
    `).get(...studentIds);

    if (!recentSkill) return null;

    // Check if others have this skill assigned within 5 minutes of each other
    const matchingCount = this.db.prepare(`
      SELECT COUNT(DISTINCT student_id) as count
      FROM assignment_history
      WHERE skill_id = ? 
      AND student_id IN (${placeholders})
      AND ABS(STRFTIME('%s', assigned_at) - STRFTIME('%s', ?)) < 300
    `).get(recentSkill.skill_id, ...studentIds, recentSkill.assigned_at);

    if (matchingCount.count === studentIds.length) {
      const skill = this.db.prepare('SELECT * FROM skills WHERE id = ?').get(recentSkill.skill_id);
      const student = this.db.prepare('SELECT default_grade, default_subject FROM students WHERE id = ?').get(studentIds[0]);

      return {
        subject: skill?.subject || student?.default_subject,
        gradeLevel: skill?.grade_level || student?.default_grade,
        lastSkillId: recentSkill.skill_id
      };
    }

    // Fallback: Just return the first student's defaults if no common recent skill
    const firstStudent = this.db.prepare('SELECT default_grade, default_subject FROM students WHERE id = ?').get(studentIds[0]);
    return {
      subject: firstStudent?.default_subject,
      gradeLevel: firstStudent?.default_grade,
      lastSkillId: null
    };
  }

  // Group methods
  getGroups() {
    const groups = this.db.prepare('SELECT * FROM groups ORDER BY name').all();
    return groups.map(group => {
      const studentIds = this.db.prepare('SELECT student_id FROM group_members WHERE group_id = ?')
        .all(group.id)
        .map(m => m.student_id);
      return { ...group, studentIds };
    });
  }

  createGroup(name, studentIds) {
    const transaction = this.db.transaction((name, studentIds) => {
      const info = this.db.prepare('INSERT INTO groups (name) VALUES (?)').run(name);
      const groupId = info.lastInsertRowid;
      const stmt = this.db.prepare('INSERT INTO group_members (group_id, student_id) VALUES (?, ?)');
      for (const studentId of studentIds) {
        stmt.run(groupId, studentId);
      }
      return groupId;
    });
    return transaction(name, studentIds);
  }

  deleteGroup(id) {
    return this.db.prepare('DELETE FROM groups WHERE id = ?').run(id);
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

  deleteSkillsByGrade(gradeLevel, subject) {
    const stmt = this.db.prepare(
      'DELETE FROM skills WHERE grade_level = ? AND subject = ?'
    );
    return stmt.run(gradeLevel, subject);
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

  // Account methods
  getAccounts() {
    return this.db.prepare('SELECT * FROM accounts ORDER BY last_used DESC, created_at DESC').all();
  }

  saveAccount(username, password, label) {
    const stmt = this.db.prepare(`
      INSERT INTO accounts (ixl_username, ixl_password, label) 
      VALUES (?, ?, ?)
      ON CONFLICT(ixl_username) DO UPDATE SET
        ixl_password=excluded.ixl_password,
        label=excluded.label
    `);
    return stmt.run(username, password, label || username);
  }

  deleteAccount(id) {
    return this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  }

  updateAccountLastUsed(id) {
    return this.db.prepare('UPDATE accounts SET last_used = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  }

  close() {
    this.db.close();
  }
}

module.exports = new DB();

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class DB {
  constructor() {
    this.sharedDb = null;
    this.userDb = null;
    this.userDataPath = null;
    this.schemaPath = null;
    this.currentUsername = null;

    // Determine the correct database path
    // Check if we're running in Electron
    const isElectron = typeof process !== 'undefined' &&
      process.versions &&
      process.versions.electron;

    if (isElectron) {
      try {
        const { app } = require('electron');
        this.userDataPath = app.getPath('userData');
        if (app.isPackaged) {
          this.schemaPath = path.join(app.getAppPath(), 'backend', 'database', 'schema.sql');
        } else {
          this.schemaPath = path.join(__dirname, 'schema.sql');
        }
      } catch (e) {
        this.userDataPath = __dirname;
        this.schemaPath = path.join(__dirname, 'schema.sql');
      }
    } else {
      this.userDataPath = __dirname;
      this.schemaPath = path.join(__dirname, 'schema.sql');
    }

    const sharedDbPath = path.join(this.userDataPath, 'ixl-shared.db');

    // Migration: if old ixl-data.db exists and shared doesn't, rename it
    const oldDbPath = path.join(this.userDataPath, 'ixl-data.db');
    if (fs.existsSync(oldDbPath) && !fs.existsSync(sharedDbPath)) {
      try {
        fs.renameSync(oldDbPath, sharedDbPath);
        console.log('Migrated old database to ixl-shared.db');
      } catch (e) {
        console.error('Failed to migrate old database:', e);
      }
    }

    this.sharedDb = new Database(sharedDbPath);
    this.initializeSharedSchema();
  }

  initializeSharedSchema() {
    this.sharedDb.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ixl_username TEXT UNIQUE NOT NULL,
        ixl_password TEXT NOT NULL,
        label TEXT,
        last_used TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  initializeUserSchema() {
    if (!this.userDb) return;

    const schema = fs.readFileSync(this.schemaPath, 'utf8');
    this.userDb.exec(schema);

    // Ensure user-specific tables exist (some might be added in schema.sql but we double check)
    this.userDb.exec(`
      CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ixl_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        class_name TEXT,
        default_grade TEXT,
        default_subject TEXT,
        last_synced TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS skills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ixl_id TEXT UNIQUE NOT NULL,
        skill_code TEXT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        grade_level TEXT NOT NULL,
        url TEXT NOT NULL,
        display_order INTEGER,
        subject TEXT DEFAULT 'math'
      );
      CREATE TABLE IF NOT EXISTS assignment_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT,
        group_name TEXT,
        student_id INTEGER NOT NULL,
        skill_id INTEGER NOT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status TEXT NOT NULL,
        error_message TEXT,
        FOREIGN KEY (student_id) REFERENCES students(id),
        FOREIGN KEY (skill_id) REFERENCES skills(id)
      );
      CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        is_ixl_class INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS group_members (
        group_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        PRIMARY KEY (group_id, student_id),
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
      );
    `);

    // Run migrations for user tables if needed
    try {
      this.userDb.exec('ALTER TABLE students ADD COLUMN default_subject TEXT');
    } catch (e) { }
    try {
      this.userDb.exec('ALTER TABLE skills ADD COLUMN subject TEXT DEFAULT \'math\'');
    } catch (e) { }
    try {
      this.userDb.exec('ALTER TABLE groups ADD COLUMN is_ixl_class INTEGER DEFAULT 0');
    } catch (e) { }
    try {
      this.userDb.exec('ALTER TABLE assignment_history ADD COLUMN batch_id TEXT');
    } catch (e) { }
    try {
      this.userDb.exec('ALTER TABLE assignment_history ADD COLUMN group_name TEXT');
    } catch (e) { }
  }

  switchUser(username) {
    if (this.currentUsername === username && this.userDb) return;

    if (this.userDb) {
      this.userDb.close();
      this.userDb = null;
    }

    this.currentUsername = username;
    const userHash = crypto.createHash('md5').update(username).digest('hex');
    const userDbPath = path.join(this.userDataPath, `user_${userHash}.db`);

    console.log(`Switching to database for user: ${username} (${userDbPath})`);
    this.userDb = new Database(userDbPath);
    this.initializeUserSchema();
  }

  logout() {
    if (this.userDb) {
      this.userDb.close();
      this.userDb = null;
    }
    this.currentUsername = null;
  }

  ensureUserDb() {
    if (!this.userDb) {
      throw new Error('No user database active. Please log in first.');
    }
  }

  getAssignmentHistory(studentId = null, limit = 100) {
    this.ensureUserDb();
    if (studentId) {
      return this.userDb.prepare(
        `SELECT ah.*, s.name as student_name, sk.name as skill_name, ah.batch_id, ah.group_name
         FROM assignment_history ah
         JOIN students s ON ah.student_id = s.id
         JOIN skills sk ON ah.skill_id = sk.id
         WHERE ah.student_id = ?
         ORDER BY ah.assigned_at DESC
         LIMIT ?`
      ).all(studentId, limit);
    }
    return this.userDb.prepare(
      `SELECT ah.*, s.name as student_name, sk.name as skill_name, ah.batch_id, ah.group_name
       FROM assignment_history ah
       JOIN students s ON ah.student_id = s.id
       JOIN skills sk ON ah.skill_id = sk.id
       ORDER BY ah.assigned_at DESC
       LIMIT ?`
    ).all(limit);
  }

  recordAssignment(studentId, skillId, status, errorMessage = null, batchId = null, groupName = null) {
    this.ensureUserDb();
    const stmt = this.userDb.prepare(
      'INSERT INTO assignment_history (student_id, skill_id, status, error_message, batch_id, group_name) VALUES (?, ?, ?, ?, ?, ?)'
    );
    return stmt.run(studentId, skillId, status, errorMessage, batchId, groupName);
  }

  // User-specific data methods
  getStudents() {
    this.ensureUserDb();
    return this.userDb.prepare('SELECT * FROM students ORDER BY name').all();
  }

  getStudent(id) {
    this.ensureUserDb();
    return this.userDb.prepare('SELECT * FROM students WHERE id = ?').get(id);
  }

  addStudent(ixlId, name, className) {
    this.ensureUserDb();
    const stmt = this.userDb.prepare(
      'INSERT INTO students (ixl_id, name, class_name) VALUES (?, ?, ?)'
    );
    return stmt.run(ixlId, name, className);
  }

  updateStudents(students) {
    this.ensureUserDb();
    const stmt = this.userDb.prepare(
      `INSERT INTO students (ixl_id, name, class_name, last_synced) VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(ixl_id) DO UPDATE SET
         name=excluded.name,
         class_name=excluded.class_name,
         last_synced=excluded.last_synced`
    );
    const transaction = this.userDb.transaction((students) => {
      for (const student of students) {
        stmt.run(student.ixlId, student.name, student.className);
      }
    });
    transaction(students);
  }

  updateStudentDefaults(studentId, gradeLevel, subject) {
    this.ensureUserDb();
    const stmt = this.userDb.prepare(
      'UPDATE students SET default_grade = ?, default_subject = ? WHERE id = ?'
    );
    return stmt.run(gradeLevel, subject, studentId);
  }

  getLastCommonSkill(studentIds) {
    this.ensureUserDb();
    if (!studentIds || studentIds.length === 0) return null;

    const placeholders = studentIds.map(() => '?').join(',');

    const recentSkill = this.userDb.prepare(`
      SELECT skill_id, assigned_at 
      FROM assignment_history 
      WHERE student_id IN (${placeholders}) 
      ORDER BY assigned_at DESC 
      LIMIT 1
    `).get(...studentIds);

    if (!recentSkill) return null;

    const matchingCount = this.userDb.prepare(`
      SELECT COUNT(DISTINCT student_id) as count
      FROM assignment_history
      WHERE skill_id = ? 
      AND student_id IN (${placeholders})
      AND ABS(STRFTIME('%s', assigned_at) - STRFTIME('%s', ?)) < 300
    `).get(recentSkill.skill_id, ...studentIds, recentSkill.assigned_at);

    if (matchingCount.count === studentIds.length) {
      const skill = this.userDb.prepare('SELECT * FROM skills WHERE id = ?').get(recentSkill.skill_id);
      const student = this.userDb.prepare('SELECT default_grade, default_subject FROM students WHERE id = ?').get(studentIds[0]);

      return {
        subject: skill?.subject || student?.default_subject,
        gradeLevel: skill?.grade_level || student?.default_grade,
        lastSkillId: recentSkill.skill_id
      };
    }

    const firstStudent = this.userDb.prepare('SELECT default_grade, default_subject FROM students WHERE id = ?').get(studentIds[0]);
    return {
      subject: firstStudent?.default_subject,
      gradeLevel: firstStudent?.default_grade,
      lastSkillId: null
    };
  }

  getGroups() {
    this.ensureUserDb();
    const groups = this.userDb.prepare('SELECT * FROM groups ORDER BY is_ixl_class DESC, name').all();
    return groups.map(group => {
      const studentIds = this.userDb.prepare('SELECT student_id FROM group_members WHERE group_id = ?')
        .all(group.id)
        .map(m => m.student_id);
      return { ...group, isIxlClass: !!group.is_ixl_class, studentIds };
    });
  }

  createGroup(name, studentIds) {
    this.ensureUserDb();
    const transaction = this.userDb.transaction((name, studentIds) => {
      const info = this.userDb.prepare('INSERT INTO groups (name) VALUES (?)').run(name);
      const groupId = info.lastInsertRowid;
      const stmt = this.userDb.prepare('INSERT INTO group_members (group_id, student_id) VALUES (?, ?)');
      for (const studentId of studentIds) {
        stmt.run(groupId, studentId);
      }
      return groupId;
    });
    return transaction(name, studentIds);
  }

  deleteGroup(id) {
    this.ensureUserDb();
    return this.userDb.prepare('DELETE FROM groups WHERE id = ?').run(id);
  }

  saveIxlClasses(classNames, studentsByClass) {
    this.ensureUserDb();

    // First, delete existing IXL class groups
    this.userDb.prepare('DELETE FROM groups WHERE is_ixl_class = 1').run();

    const transaction = this.userDb.transaction(() => {
      for (const className of classNames) {
        // Create the group
        const info = this.userDb.prepare('INSERT INTO groups (name, is_ixl_class) VALUES (?, 1)').run(className);
        const groupId = info.lastInsertRowid;

        // Add students to the group
        const students = studentsByClass[className] || [];
        const stmt = this.userDb.prepare('INSERT OR IGNORE INTO group_members (group_id, student_id) VALUES (?, ?)');
        for (const studentId of students) {
          stmt.run(groupId, studentId);
        }
      }
    });

    transaction();
    console.log(`Saved ${classNames.length} IXL classes as groups`);
  }

  updateStudentDefaultGrade(studentId, gradeLevel) {
    this.ensureUserDb();
    const stmt = this.userDb.prepare(
      'UPDATE students SET default_grade = ? WHERE id = ?'
    );
    return stmt.run(gradeLevel, studentId);
  }

  getSkills(gradeLevel = null, subject = 'math') {
    this.ensureUserDb();
    if (gradeLevel) {
      return this.userDb.prepare(
        'SELECT * FROM skills WHERE grade_level = ? AND (subject = ? OR subject IS NULL) ORDER BY category, display_order'
      ).all(gradeLevel, subject);
    }
    return this.userDb.prepare(
      'SELECT * FROM skills WHERE (subject = ? OR subject IS NULL) ORDER BY category, display_order'
    ).all(subject);
  }

  deleteSkillsByGrade(gradeLevel, subject) {
    this.ensureUserDb();
    const stmt = this.userDb.prepare(
      'DELETE FROM skills WHERE grade_level = ? AND subject = ?'
    );
    return stmt.run(gradeLevel, subject);
  }

  getSkillsByIds(ids) {
    this.ensureUserDb();
    const placeholders = ids.map(() => '?').join(',');
    return this.userDb.prepare(
      `SELECT * FROM skills WHERE id IN (${placeholders})`
    ).all(...ids);
  }

  getSkillsByRange(category, startNum, endNum) {
    this.ensureUserDb();
    return this.userDb.prepare(
      'SELECT * FROM skills WHERE category = ? AND display_order >= ? AND display_order <= ? ORDER BY display_order'
    ).all(category, startNum, endNum);
  }

  addSkill(ixlId, name, category, gradeLevel, url, displayOrder) {
    this.ensureUserDb();
    const stmt = this.userDb.prepare(
      'INSERT INTO skills (ixl_id, name, category, grade_level, url, display_order) VALUES (?, ?, ?, ?, ?, ?)'
    );
    return stmt.run(ixlId, name, category, gradeLevel, url, displayOrder);
  }

  updateSkills(skills) {
    this.ensureUserDb();
    const stmt = this.userDb.prepare(
      'INSERT OR REPLACE INTO skills (ixl_id, skill_code, name, category, grade_level, url, display_order, subject) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const transaction = this.userDb.transaction((skills) => {
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
    this.ensureUserDb();
    const stmt = this.userDb.prepare(
      'INSERT INTO assignment_history (student_id, skill_id, status, error_message) VALUES (?, ?, ?, ?)'
    );
    return stmt.run(studentId, skillId, status, errorMessage);
  }

  getAssignmentHistory(studentId = null, limit = 100) {
    this.ensureUserDb();
    if (studentId) {
      return this.userDb.prepare(
        `SELECT ah.*, s.name as student_name, sk.name as skill_name 
         FROM assignment_history ah 
         JOIN students s ON ah.student_id = s.id 
         JOIN skills sk ON ah.skill_id = sk.id 
         WHERE ah.student_id = ? 
         ORDER BY ah.assigned_at DESC 
         LIMIT ?`
      ).all(studentId, limit);
    }
    return this.userDb.prepare(
      `SELECT ah.*, s.name as student_name, sk.name as skill_name 
       FROM assignment_history ah 
       JOIN students s ON ah.student_id = s.id 
       JOIN skills sk ON ah.skill_id = sk.id 
       ORDER BY ah.assigned_at DESC 
       LIMIT ?`
    ).all(limit);
  }

  // Shared data methods
  getSetting(key) {
    const result = this.sharedDb.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return result ? result.value : null;
  }

  setSetting(key, value) {
    const stmt = this.sharedDb.prepare(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
    );
    return stmt.run(key, value);
  }

  getAccounts() {
    return this.sharedDb.prepare('SELECT * FROM accounts ORDER BY last_used DESC, created_at DESC').all();
  }

  saveAccount(username, password, label) {
    const stmt = this.sharedDb.prepare(`
      INSERT INTO accounts (ixl_username, ixl_password, label) 
      VALUES (?, ?, ?)
      ON CONFLICT(ixl_username) DO UPDATE SET
        ixl_password=excluded.ixl_password,
        label=excluded.label
    `);
    return stmt.run(username, password, label || username);
  }

  deleteAccount(id) {
    return this.sharedDb.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  }

  updateAccountLastUsed(id) {
    return this.sharedDb.prepare('UPDATE accounts SET last_used = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  }

  close() {
    if (this.sharedDb) this.sharedDb.close();
    if (this.userDb) this.userDb.close();
  }
}

module.exports = new DB();

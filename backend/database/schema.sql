-- Students table
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ixl_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  class_name TEXT,
  default_grade TEXT,
  last_synced TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Skills table
CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ixl_id TEXT NOT NULL,
  skill_code TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  url TEXT NOT NULL,
  display_order INTEGER,
  subject TEXT DEFAULT 'math',
  UNIQUE(ixl_id, subject)
);

-- Assignment history table
CREATE TABLE IF NOT EXISTS assignment_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  skill_id INTEGER NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL,
  error_message TEXT,
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_grade ON skills(grade_level);
CREATE INDEX IF NOT EXISTS idx_assignment_student ON assignment_history(student_id);
CREATE INDEX IF NOT EXISTS idx_assignment_date ON assignment_history(assigned_at);

-- Groups table
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Group members table
CREATE TABLE IF NOT EXISTS group_members (
  group_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  PRIMARY KEY (group_id, student_id),
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ixl_username TEXT UNIQUE NOT NULL,
  ixl_password TEXT NOT NULL,
  label TEXT,
  last_used TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const db = require('./database/db');
const IXLBrowser = require('./automation/browser');
const { scrapeStudents, scrapeSkills, scrapeNJSLASkills } = require('./automation/scraper');
const { assignMultipleSkills } = require('./automation/assigner');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const browser = new IXLBrowser();
const assignmentQueue = [];
const taskStatuses = new Map();
let isProcessingQueue = false;

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, headless, saveAccount, organization } = req.body;
    console.log('Login API called', { username, headless, saveAccount, organization });

    // Fallback chain: request body → saved setting → empty string (generic IXL login)
    const org = organization !== undefined ? organization : (db.getSetting('ixl_organization') || '');

    const result = await browser.login(username, password, headless, org);

    console.log('Browser login returned:', result);

    if (result.success) {
      db.switchUser(username);
      const cookies = await browser.saveCookies();

      if (saveAccount && username && password) {
        console.log(`Saving account for ${username}...`);
        try {
          db.saveAccount(username, password);
          console.log('Account saved successfully.');
        } catch (dbError) {
          console.error('Error saving account to DB:', dbError);
        }
      }

      // Update last used if it was a saved account
      try {
        const accounts = db.getAccounts();
        const matchedAccount = accounts.find(a => a.ixl_username === username);
        if (matchedAccount) {
          db.updateAccountLastUsed(matchedAccount.id);
          console.log(`Updated last_used for account ${username}`);
        }
      } catch (updateError) {
        console.error('Error updating last_used:', updateError);
      }

      console.log('Sending success response to frontend');
      res.json({
        success: true,
        message: 'Logged in successfully',
        cookies
      });
    } else {
      console.log('Sending failure response to frontend');
      res.status(401).json({
        success: false,
        error: result.error || 'Login failed. Please check your credentials.'
      });
    }
  } catch (error) {
    console.error('Login API error:', error);
    const isAuthError = error.message.includes('Invalid username or password') ||
      error.message.includes('Login failed');
    res.status(isAuthError ? 401 : 500).json({
      success: false,
      error: isAuthError ? error.message : error.message
    });
  }
});

// Account management endpoints
app.get('/api/accounts', (req, res) => {
  try {
    const accounts = db.getAccounts();
    // Don't send passwords to frontend unless strictly necessary, 
    // but here we need them to pass back for automated login.
    // In a real app, we'd encrypt or handle this differently.
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/accounts', (req, res) => {
  try {
    const { username, password, label } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    db.saveAccount(username, password, label);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/accounts/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.deleteAccount(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Settings endpoints
app.get('/api/settings/:key', (req, res) => {
  try {
    const { key } = req.params;
    const value = db.getSetting(key);
    res.json({ key, value });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) {
      return res.status(400).json({ error: 'Key is required' });
    }
    db.setSetting(key, String(value));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/status', (req, res) => {
  res.json({
    isAuthenticated: browser.isAuthenticated()
  });
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    console.log('Logout API called');

    // 1. Abort any active tasks first
    abortRequested = true;
    assignmentQueue.length = 0;
    for (const [taskId, task] of taskStatuses.entries()) {
      if (task.status === 'processing' || task.status === 'queued') {
        task.status = 'aborted';
      }
    }

    // 2. Close browser safely
    await browser.close();

    // 3. Close database entry
    db.logout();

    // 4. Reset abort flag
    setTimeout(() => { abortRequested = false; }, 500);

    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/sync/students', async (req, res) => {
  try {
    if (!browser.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const page = browser.getPage();
    const result = await scrapeStudents(page);

    console.log('Scraped students:', result.students.length);
    console.log('Has classes:', result.hasClasses);

    if (result.students.length > 0) {
      db.updateStudents(result.students);
      console.log('Students saved to database');

      // Save hasClasses setting for this account
      db.setSetting('has_ixl_classes', result.hasClasses ? 'true' : 'false');

      // If the account has classes, save them as groups
      if (result.hasClasses && result.classes.length > 0) {
        // Get the student IDs from the database (they now have proper IDs)
        const dbStudents = db.getStudents();

        // Build a map of class name -> student IDs
        const studentsByClass = {};
        result.classes.forEach(className => {
          studentsByClass[className] = [];
        });

        // Match students by name to get their DB IDs
        result.students.forEach(scrapedStudent => {
          const dbStudent = dbStudents.find(s => s.name === scrapedStudent.name);
          if (dbStudent && scrapedStudent.className && scrapedStudent.className !== 'Default Class') {
            if (!studentsByClass[scrapedStudent.className]) {
              studentsByClass[scrapedStudent.className] = [];
            }
            studentsByClass[scrapedStudent.className].push(dbStudent.id);
          }
        });

        db.saveIxlClasses(result.classes, studentsByClass);
        console.log('Saved IXL classes as groups:', result.classes);
      }
    }

    // Return the updated list of students from the database (with IDs)
    const updatedStudents = db.getStudents();
    const groups = db.getGroups();

    res.json({
      success: true,
      count: updatedStudents.length,
      students: updatedStudents,
      hasClasses: result.hasClasses,
      groups: groups
    });
  } catch (error) {
    console.error('Sync students error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update student defaults (subject and grade)
app.post('/api/students/:id/defaults', async (req, res) => {
  try {
    const { id } = req.params;
    const { gradeLevel, subject } = req.body;

    db.updateStudentDefaults(id, gradeLevel, subject);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating student defaults:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get common defaults for a group of students
app.get('/api/students/common-defaults', async (req, res) => {
  try {
    const { ids } = req.query;
    if (!ids) return res.status(400).json({ error: 'ids query param is required' });

    const studentIds = ids.split(',').map(id => parseInt(id));
    const defaults = db.getLastCommonSkill(studentIds);

    res.json(defaults || { subject: null, gradeLevel: null, lastSkillId: null });
  } catch (error) {
    console.error('Error fetching common defaults:', error);
    res.status(500).json({ error: error.message });
  }
});

// Groups endpoints
app.get('/api/groups', (req, res) => {
  try {
    const groups = db.getGroups();
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/groups', (req, res) => {
  try {
    const { name, studentIds } = req.body;
    if (!name || !studentIds) {
      return res.status(400).json({ error: 'Name and studentIds are required' });
    }
    const groupId = db.createGroup(name, studentIds);
    res.json({ success: true, id: groupId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/groups/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.deleteGroup(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sync/skills', async (req, res) => {
  try {
    const { gradeLevel = '8', subject = 'math' } = req.body;

    if (!browser.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const page = browser.getPage();

    // Use skill plan scraper for NJSLA and NJGPA subjects, regular scraper otherwise
    let skills;
    if (subject.startsWith('njsla-') || subject.startsWith('njgpa-')) {
      skills = await scrapeNJSLASkills(page, gradeLevel, subject);
    } else {
      skills = await scrapeSkills(page, gradeLevel, subject);
    }

    if (skills.length > 0) {
      db.deleteSkillsByGrade(gradeLevel, subject);
      db.updateSkills(skills);
    }

    // Return the updated list of skills from the database (with IDs)
    const updatedSkills = db.getSkills(gradeLevel, subject);

    res.json({
      success: true,
      count: updatedSkills.length,
      skills: updatedSkills
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/students', (req, res) => {
  try {
    const students = db.getStudents();
    console.log('GET /api/students - Returning:', students.length, 'students');
    console.log('Student list:', students.map(s => s.name));
    res.json(students);
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/skills', (req, res) => {
  try {
    const { gradeLevel, subject = 'math' } = req.query;
    const skills = db.getSkills(gradeLevel, subject);
    res.json(skills);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/assign', async (req, res) => {
  try {
    const { studentIds, skillIds, action = 'suggest', groupName = null, groupNames = [] } = req.body;

    if (!studentIds || studentIds.length === 0 || !skillIds || skillIds.length === 0) {
      return res.status(400).json({
        error: 'studentIds and skillIds are required'
      });
    }

    if (!browser.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const allGroups = db.getGroups();
    const coveredStudentIds = new Set();
    const targetGroups = [];
    const actualGroupNames = groupNames.length > 0 ? groupNames : (groupName ? [groupName] : []);

    actualGroupNames.forEach(name => {
      const group = allGroups.find(g => g.name === name);
      if (group) {
        targetGroups.push({ name, count: group.studentIds.length, isIxlClass: !!group.isIxlClass });
        if (group.isIxlClass) {
          group.studentIds.forEach(id => coveredStudentIds.add(id));
        }
      }
    });

    const individualStudentIds = studentIds.filter(id => !coveredStudentIds.has(id));
    const individualStudents = individualStudentIds.map(id => db.getStudent(id)?.name).filter(Boolean);

    const taskId = uuidv4();
    const task = {
      id: taskId,
      studentIds,
      skillIds,
      action,
      groupName,
      groupNames: actualGroupNames,
      targetGroups,
      individualStudents,
      status: 'queued',
      progress: 0,
      total: skillIds.length,
      results: []
    };

    assignmentQueue.push(task);
    taskStatuses.set(taskId, task);

    if (!isProcessingQueue) {
      processQueue();
    }

    res.json({
      taskId,
      status: 'queued',
      message: 'Assignment task created'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/assign/:taskId/status', (req, res) => {
  const { taskId } = req.params;
  const task = taskStatuses.get(taskId);

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json(task);
});

app.get('/api/history', (req, res) => {
  try {
    const { studentId, limit } = req.query;
    const history = db.getAssignmentHistory(
      studentId ? parseInt(studentId) : null,
      limit ? parseInt(limit) : 100
    );
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/queue', (req, res) => {
  try {
    const queueWithDetails = assignmentQueue.map(task => {
      const skills = db.getSkillsByIds(task.skillIds);
      return {
        ...task,
        skillCodes: skills.map(s => {
          const isPlanSub = (s.subject || '').startsWith('njsla-') || (s.subject || '').startsWith('njgpa-');
          const isBulleted = s.skill_code?.includes('.new') || !(s.skill_code?.match(/\.\d+$/));

          if (isPlanSub || isBulleted) return s.name;
          return s.skill_code || s.skillCode || s.name?.match(/^([A-Z]+\.\d+)/)?.[1];
        }).filter(Boolean)
      };
    });

    const allTasks = Array.from(taskStatuses.values()).map(task => {
      return {
        ...task
      };
    });

    res.json({
      queue: queueWithDetails,
      allTasks: allTasks.filter(t => t.status !== 'queued')
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Abort all tasks
let abortRequested = false;

app.post('/api/abort', (req, res) => {
  try {
    abortRequested = true;

    // Clear the queue
    const queuedCount = assignmentQueue.length;
    assignmentQueue.length = 0;

    // Mark any processing tasks as aborted
    for (const [taskId, task] of taskStatuses.entries()) {
      if (task.status === 'processing' || task.status === 'queued') {
        task.status = 'aborted';
        task.error = 'Aborted by user';
      }
    }

    res.json({
      success: true,
      message: `Aborted. Cleared ${queuedCount} queued tasks.`
    });

    // Reset abort flag after a short delay to allow current operation to complete
    setTimeout(() => {
      abortRequested = false;
    }, 1000);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function processQueue() {
  if (isProcessingQueue || assignmentQueue.length === 0) {
    return;
  }

  isProcessingQueue = true;

  while (assignmentQueue.length > 0 && !abortRequested) {
    const task = assignmentQueue.shift();
    taskStatuses.set(task.id, { ...task, status: 'processing' });

    // Check if abort was requested before starting
    if (abortRequested) {
      taskStatuses.set(task.id, {
        ...task,
        status: 'aborted',
        error: 'Aborted by user'
      });
      break;
    }

    try {
      const students = task.studentIds.map(id => db.getStudent(id)).filter(Boolean);
      if (students.length === 0) {
        throw new Error('No valid students found');
      }

      const skills = db.getSkillsByIds(task.skillIds);
      if (skills.length === 0) {
        throw new Error('No valid skills found');
      }

      const skillsData = skills.map(s => {
        let code = s.skill_code || s.skillCode;
        if (!code) {
          const match = s.name?.match(/^([A-Z]+\.\d+)/);
          code = match ? match[1] : null;
        }

        // For plan-based subjects (NJSLA, NJGPA), if code is still null, 
        // use ID as fallback for code.
        const isPlanSub = (s.subject || '').startsWith('njsla-') || (s.subject || '').startsWith('njgpa-');
        if (!code && isPlanSub) {
          code = s.ixl_id;
        }

        if (!code) return null;

        return {
          skillCode: code,
          dataSkillId: s.ixl_id,
          skillName: s.name || s.skillName || s.skill_name,
          skillNameClean: s.skillName || s.skill_name || s.name
        };
      }).filter(Boolean);

      if (skillsData.length === 0) {
        throw new Error('No skill codes could be extracted');
      }

      const gradeLevel = skills[0].grade_level || skills[0].gradeLevel;
      const subject = skills[0].subject || 'math';
      const page = browser.getPage();

      // Check if this account has IXL classes
      const hasClassesSetting = db.getSetting('has_ixl_classes');
      const hasClasses = hasClassesSetting === 'true';

      // Calculate Targets (Classes vs Individual Students)
      const allGroups = db.getGroups();
      const targets = { classes: [], students: [] };
      const coveredStudentIds = new Set();

      const groupNames = task.groupNames || (task.groupName ? [task.groupName] : []);

      // 1. Identify IXL Classes
      groupNames.forEach(name => {
        const group = allGroups.find(g => g.name === name);
        if (group && group.isIxlClass) {
          targets.classes.push(name);
          group.studentIds.forEach(id => coveredStudentIds.add(id));
        }
      });

      // 2. Identify remaining individual students
      const individualStudentIds = task.studentIds.filter(id => !coveredStudentIds.has(id));
      const individualStudents = individualStudentIds.map(id => db.getStudent(id)).filter(Boolean);
      individualStudents.forEach(s => targets.students.push(s.name));

      const displayName = groupNames.length > 0
        ? `${groupNames.join(', ')} + ${individualStudents.length} individuals`
        : (students.length > 1 ? `${students[0].name} + ${students.length - 1} more` : students[0].name);

      console.log(`${task.action === 'suggest' ? 'Suggesting' : 'Unsuggesting'} ${skillsData.length} skills to:`);
      console.log(`- Classes: ${targets.classes.join(', ') || 'None'}`);
      console.log(`- Individual Students: ${targets.students.join(', ') || 'None'}`);

      const results = await assignMultipleSkills(
        page,
        skillsData,
        gradeLevel,
        task.action,
        (progress) => {
          const currentTask = taskStatuses.get(task.id);
          taskStatuses.set(task.id, {
            ...currentTask,
            progress: progress.current,
            currentSkill: progress.currentSkill
          });
        },
        subject,
        () => abortRequested,
        hasClasses,
        targets
      );

      // Generate a batch ID for this assignment task
      const batchId = uuidv4();

      // Record history
      results.forEach((result) => {
        const skill = skills.find(sk => (sk.skill_code || sk.skillCode) === result.skillCode);

        if (skill) {
          if (result.isClass) {
            // This was a class assignment - record for all students in the class
            const groupName = result.studentName;
            // Find the group to get its members
            const group = allGroups.find(g => g.name === groupName && g.isIxlClass);

            if (group && group.studentIds && group.studentIds.length > 0) {
              group.studentIds.forEach(studentId => {
                db.recordAssignment(
                  studentId,
                  skill.id,
                  result.success ? 'completed' : 'failed',
                  result.error || null,
                  batchId,
                  groupName // Use the actual class name as group name
                );
                if (gradeLevel && subject) {
                  db.updateStudentDefaults(studentId, gradeLevel, subject);
                }
              });
            } else {
              console.warn(`Could not find group "${groupName}" or it has no students for history recording`);
            }
          } else {
            // Individual student assignment
            const student = students.find(s => s.name === result.studentName);
            if (student) {
              // Try to find a non-IXL-class group from selected groups that contains this student
              let assignedGroupName = null;
              for (const gName of groupNames) {
                const g = allGroups.find(grp => grp.name === gName);
                if (g && !g.isIxlClass && g.studentIds.includes(student.id)) {
                  assignedGroupName = gName;
                  break;
                }
              }

              db.recordAssignment(
                student.id,
                skill.id,
                result.success ? 'completed' : 'failed',
                result.error || null,
                batchId,
                assignedGroupName
              );
              if (gradeLevel && subject) {
                db.updateStudentDefaults(student.id, gradeLevel, subject);
              }
            }
          }
        }
      });

      taskStatuses.set(task.id, {
        ...task,
        status: 'completed',
        progress: task.total,
        results
      });

    } catch (error) {
      taskStatuses.set(task.id, {
        ...task,
        status: 'failed',
        error: error.message
      });
    }
  }

  isProcessingQueue = false;
}

const startServer = (port) => {
  const server = app.listen(port, () => {
    const actualPort = server.address().port;
    process.env.BACKEND_PORT = actualPort;
    console.log(`IXL Assignment Server running on http://localhost:${actualPort}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port !== 0) {
      console.log(`Port ${port} is in use, trying an available port...`);
      startServer(0);
    } else {
      console.error('Server error:', err);
    }
  });

  server.timeout = 900000; // 15 minutes
  return server;
};

const server = startServer(PORT);

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await browser.close();
  db.close();
  process.exit(0);
});

module.exports = app;

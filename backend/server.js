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
    console.log('Login API called');
    const success = await browser.login('', '');

    console.log('Browser login returned:', success);

    if (success) {
      const cookies = await browser.saveCookies();
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
        error: 'Login cancelled or timed out'
      });
    }
  } catch (error) {
    console.error('Login API error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/auth/status', (req, res) => {
  res.json({
    isAuthenticated: browser.isAuthenticated()
  });
});

app.post('/api/sync/students', async (req, res) => {
  try {
    if (!browser.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const page = browser.getPage();
    const students = await scrapeStudents(page);

    console.log('Scraped students:', students.length);

    if (students.length > 0) {
      db.updateStudents(students);
      console.log('Students saved to database');
    }

    // Return the updated list of students from the database (with IDs)
    const updatedStudents = db.getStudents();

    res.json({
      success: true,
      count: updatedStudents.length,
      students: updatedStudents
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

    // Use NJSLA scraper for njsla-* subjects, regular scraper otherwise
    let skills;
    if (subject.startsWith('njsla-')) {
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
    const { studentIds, skillIds, action = 'suggest', groupName = null } = req.body;

    if (!studentIds || studentIds.length === 0 || !skillIds || skillIds.length === 0) {
      return res.status(400).json({
        error: 'studentIds and skillIds are required'
      });
    }

    if (!browser.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const taskId = uuidv4();
    const task = {
      id: taskId,
      studentIds,
      skillIds,
      action,
      groupName,
      status: 'queued',
      progress: 0,
      total: skillIds.length, // Always skill-based count now
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
      const firstStudent = db.getStudent(task.studentIds[0]);
      const skills = db.getSkillsByIds(task.skillIds);
      return {
        ...task,
        studentName: task.groupName || (task.studentIds.length > 1
          ? `${firstStudent?.name || 'Unknown'} + ${task.studentIds.length - 1} more`
          : firstStudent?.name || 'Unknown'),
        skillCodes: skills.map(s => {
          const isNJSLA = (s.subject || '').startsWith('njsla-');
          const isBulleted = s.skill_code?.includes('.new') || !(s.skill_code?.match(/\.\d+$/));

          if (isNJSLA || isBulleted) return s.name;
          return s.skill_code || s.skillCode || s.name?.match(/^([A-Z]+\.\d+)/)?.[1];
        }).filter(Boolean)
      };
    });

    const allTasks = Array.from(taskStatuses.values()).map(task => {
      const firstStudent = db.getStudent(task.studentIds[0]);
      return {
        ...task,
        studentName: task.groupName || (task.studentIds.length > 1
          ? `${firstStudent?.name || 'Unknown'} + ${task.studentIds.length - 1} more`
          : firstStudent?.name || 'Unknown')
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

        // For NJSLA, if code is still null, we might be able to use the displayOrder/letter logic
        // But the scraper usually provides it. If not, use ID as fallback for code.
        if (!code && (s.subject || '').startsWith('njsla-')) {
          code = s.ixl_id;
        }

        if (!code) return null;

        return {
          skillCode: code,
          dataSkillId: s.ixl_id,
          skillName: s.name || s.skillName || s.skill_name
        };
      }).filter(Boolean);

      if (skillsData.length === 0) {
        throw new Error('No skill codes could be extracted');
      }

      const gradeLevel = skills[0].grade_level || skills[0].gradeLevel;
      const subject = skills[0].subject || 'math';
      const page = browser.getPage();
      const studentNames = students.map(s => s.name);

      const displayName = task.groupName || (studentNames.length > 1
        ? `${studentNames[0]} + ${studentNames.length - 1} more`
        : studentNames[0]);

      console.log(`${task.action === 'suggest' ? 'Suggesting' : 'Unsugesting'} ${skillsData.length} skills to ${displayName} (${studentNames.join(', ')})`);

      const results = await assignMultipleSkills(
        page,
        skillsData,
        studentNames,
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
        () => abortRequested
      );

      // Record history
      results.forEach((result) => {
        const student = students.find(s => s.name === result.studentName);
        const skill = skills.find(sk => (sk.skill_code || sk.skillCode) === result.skillCode);
        if (student && skill) {
          db.recordAssignment(
            student.id,
            skill.id,
            result.success ? 'completed' : 'failed',
            result.error || null
          );
          if (gradeLevel && subject) {
            db.updateStudentDefaults(student.id, gradeLevel, subject);
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

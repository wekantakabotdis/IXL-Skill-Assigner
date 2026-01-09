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
    const { studentId, skillIds, action = 'suggest' } = req.body;

    if (!studentId || !skillIds || skillIds.length === 0) {
      return res.status(400).json({
        error: 'studentId and skillIds are required'
      });
    }

    if (!browser.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const taskId = uuidv4();
    const task = {
      id: taskId,
      studentId,
      skillIds,
      action,
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
      const student = db.getStudent(task.studentId);
      const skills = db.getSkillsByIds(task.skillIds);
      return {
        ...task,
        studentName: student?.name || 'Unknown',
        skillCodes: skills.map(s => s.skill_code || s.skillCode).filter(Boolean)
      };
    });

    const allTasks = Array.from(taskStatuses.values()).map(task => {
      const student = db.getStudent(task.studentId);
      return {
        ...task,
        studentName: student?.name || 'Unknown'
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
      const student = db.getStudent(task.studentId);
      if (!student) {
        throw new Error('Student not found');
      }

      const skills = db.getSkillsByIds(task.skillIds);
      if (skills.length === 0) {
        throw new Error('No valid skills found');
      }

      console.log('Sample skill from DB:', JSON.stringify(skills[0], null, 2));

      const skillsData = skills.map(s => {
        const code = s.skill_code || s.skillCode;
        if (!code) {
          const match = s.name?.match(/^([A-Z]+\.\d+)/);
          if (!match) {
            console.error('Could not extract skill code from skill:', s);
            return null;
          }
          return {
            skillCode: match[1],
            dataSkillId: s.ixl_id
          };
        }
        return {
          skillCode: code,
          dataSkillId: s.ixl_id
        };
      }).filter(Boolean);

      if (skillsData.length === 0) {
        throw new Error('No skill codes could be extracted from skills');
      }

      const gradeLevel = skills[0].grade_level || skills[0].gradeLevel;
      const subject = skills[0].subject || 'math';
      const page = browser.getPage();

      console.log(`${task.action === 'suggest' ? 'Suggesting' : 'Unsugesting'} ${skillsData.length} ${subject} skills to ${student.name} (Grade ${gradeLevel})`);
      console.log(`Skills: ${skillsData.map(s => s.skillCode).join(', ')}`);

      const results = await assignMultipleSkills(
        page,
        skillsData,
        student.name,
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
        () => abortRequested // Pass abort checker function
      );

      // Check if aborted during assignment
      if (abortRequested) {
        taskStatuses.set(task.id, {
          ...task,
          status: 'aborted',
          error: 'Aborted by user',
          results
        });
        break;
      }

      results.forEach((result, index) => {
        const skill = skills[index];
        db.recordAssignment(
          task.studentId,
          skill.id,
          result.success ? 'completed' : 'failed',
          result.error || null
        );
      });

      if (gradeLevel) {
        db.updateStudentDefaultGrade(task.studentId, gradeLevel);
      }

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

const server = app.listen(PORT, () => {
  console.log(`IXL Assignment Server running on http://localhost:${PORT}`);
});

server.timeout = 900000; // 15 minutes

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await browser.close();
  db.close();
  process.exit(0);
});

module.exports = app;

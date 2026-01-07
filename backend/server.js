const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const db = require('./database/db');
const IXLBrowser = require('./automation/browser');
const { scrapeStudents, scrapeSkills } = require('./automation/scraper');
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

    res.json({ 
      success: true, 
      count: students.length,
      students 
    });
  } catch (error) {
    console.error('Sync students error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.post('/api/sync/skills', async (req, res) => {
  try {
    const { gradeLevel = '8' } = req.body;
    
    if (!browser.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const page = browser.getPage();
    const skills = await scrapeSkills(page, gradeLevel);
    
    if (skills.length > 0) {
      db.updateSkills(skills);
    }

    res.json({ 
      success: true, 
      count: skills.length,
      skills 
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
    const { gradeLevel } = req.query;
    const skills = db.getSkills(gradeLevel);
    res.json(skills);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/assign', async (req, res) => {
  try {
    const { studentId, skillIds } = req.body;

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

async function processQueue() {
  if (isProcessingQueue || assignmentQueue.length === 0) {
    return;
  }

  isProcessingQueue = true;

  while (assignmentQueue.length > 0) {
    const task = assignmentQueue.shift();
    taskStatuses.set(task.id, { ...task, status: 'processing' });

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
      const page = browser.getPage();

      console.log(`Assigning ${skillsData.length} skills to ${student.name} (Grade ${gradeLevel})`);
      console.log(`Skills: ${skillsData.map(s => s.skillCode).join(', ')}`);

      const results = await assignMultipleSkills(
        page, 
        skillsData, 
        student.name,
        gradeLevel,
        (progress) => {
          const currentTask = taskStatuses.get(task.id);
          taskStatuses.set(task.id, {
            ...currentTask,
            progress: progress.current,
            currentSkill: progress.currentSkill
          });
        }
      );

      results.forEach((result, index) => {
        const skill = skills[index];
        db.recordAssignment(
          task.studentId,
          skill.id,
          result.success ? 'completed' : 'failed',
          result.error || null
        );
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

app.listen(PORT, () => {
  console.log(`IXL Assignment Server running on http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await browser.close();
  db.close();
  process.exit(0);
});

module.exports = app;

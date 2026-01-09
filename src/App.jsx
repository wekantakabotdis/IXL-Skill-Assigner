import { useState, useEffect } from 'react';
import { api } from './utils/api';
import { parseRange } from './utils/skillHelpers';
import StudentSelector from './components/StudentSelector';
import SkillsSelector from './components/SkillsSelector';
import ProgressModal from './components/ProgressModal';
import Notification from './components/Notification';
import './index.css';

// Helper function to get available grades based on subject
const getAvailableGrades = (subject) => {
  switch (subject) {
    case 'njsla-math':
      return [
        { value: '3', label: 'Grade 3' },
        { value: '4', label: 'Grade 4' },
        { value: '5', label: 'Grade 5' },
        { value: '6', label: 'Grade 6' },
        { value: '7', label: 'Grade 7' },
        { value: '8', label: 'Grade 8' },
        { value: 'algebra-1', label: 'Algebra 1' },
        { value: 'geometry', label: 'Geometry' },
        { value: 'algebra-2', label: 'Algebra 2' },
      ];
    case 'njsla-ela':
      return [
        { value: '3', label: 'Grade 3' },
        { value: '4', label: 'Grade 4' },
        { value: '5', label: 'Grade 5' },
        { value: '6', label: 'Grade 6' },
        { value: '7', label: 'Grade 7' },
        { value: '8', label: 'Grade 8' },
        { value: '9', label: 'Grade 9' },
        { value: '10', label: 'Grade 10' },
        { value: '11', label: 'Grade 11' },
      ];
    case 'njsla-science':
      return [
        { value: '5', label: 'Grade 5' },
        { value: '8', label: 'Grade 8' },
      ];
    default: // math, ela
      return [
        { value: 'pre-k', label: 'Pre-K' },
        { value: 'kindergarten', label: 'Kindergarten' },
        { value: '1', label: 'Grade 1' },
        { value: '2', label: 'Grade 2' },
        { value: '3', label: 'Grade 3' },
        { value: '4', label: 'Grade 4' },
        { value: '5', label: 'Grade 5' },
        { value: '6', label: 'Grade 6' },
        { value: '7', label: 'Grade 7' },
        { value: '8', label: 'Grade 8' },
        { value: '9', label: 'Grade 9' },
        { value: '10', label: 'Grade 10' },
        { value: '11', label: 'Grade 11' },
        { value: '12', label: 'Grade 12' },
      ];
  }
};

// Helper to get display name for subject
const getSubjectDisplayName = (subject) => {
  switch (subject) {
    case 'math': return 'Math';
    case 'ela': return 'ELA';
    case 'njsla-math': return 'NJSLA Math';
    case 'njsla-ela': return 'NJSLA ELA';
    case 'njsla-science': return 'NJSLA Science';
    default: return subject;
  }
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [students, setStudents] = useState([]);
  const [skills, setSkills] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [rangeInput, setRangeInput] = useState('');
  const [subject, setSubject] = useState('math');
  const [gradeLevel, setGradeLevel] = useState('3');
  const [actionMode, setActionMode] = useState('suggest');

  const [isAssigning, setIsAssigning] = useState(false);
  const [currentTask, setCurrentTask] = useState(null);
  const [taskStatus, setTaskStatus] = useState(null);
  const [queueData, setQueueData] = useState({ queue: [], allTasks: [] });
  const [history, setHistory] = useState([]);
  const [currentView, setCurrentView] = useState('assign');

  const [notification, setNotification] = useState(null);
  const [expandedBatches, setExpandedBatches] = useState(new Set());

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const queue = await api.getQueue();
        setQueueData(queue);
      } catch (error) {
        console.error('Error fetching queue:', error);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const loadHistory = async () => {
    try {
      const historyData = await api.getHistory(null, 1000);
      setHistory(historyData);
    } catch (error) {
      console.error('Error loading history:', error);
    }
  };

  const getGroupedHistory = () => {
    if (!history.length) return [];

    const sortedHistory = [...history].sort((a, b) => new Date(b.assigned_at) - new Date(a.assigned_at));
    const groups = [];
    let currentGroup = null;

    sortedHistory.forEach((item) => {
      const itemTime = new Date(item.assigned_at).getTime();

      if (currentGroup &&
        currentGroup.student_id === item.student_id &&
        Math.abs(currentGroup.timestamp - itemTime) < 60000) {
        currentGroup.items.push(item);
      } else {
        if (currentGroup) groups.push(currentGroup);
        currentGroup = {
          id: `batch-${item.id}`,
          timestamp: itemTime,
          date: new Date(item.assigned_at),
          student_name: item.student_name,
          student_id: item.student_id,
          items: [item]
        };
      }
    });
    if (currentGroup) groups.push(currentGroup);
    return groups;
  };

  const toggleBatch = (batchId) => {
    setExpandedBatches(prev => {
      const next = new Set(prev);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadHistory();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (selectedStudent && students.length > 0) {
      const student = students.find(s => s.id === selectedStudent);
      if (student && student.default_grade && student.default_grade !== gradeLevel) {
        showNotification('info', `Switching to Grade ${student.default_grade} based on student's history`);
        handleGradeChange(student.default_grade);
      }
    }
  }, [selectedStudent, students]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);

    try {
      console.log('Starting login process...');
      showNotification('info', 'Opening browser... Please log in manually in the browser window.');

      const result = await api.login(username, password);
      console.log('Login result received:', result);

      if (result.success) {
        console.log('Login successful, setting authenticated state...');
        setIsAuthenticated(true);
        showNotification('success', 'Logged in successfully!');
        await loadData();
      } else {
        console.error('Login failed:', result.error);
        showNotification('error', result.error || 'Login failed');
        setIsLoggingIn(false);
      }
    } catch (error) {
      console.error('Login error caught:', error);
      showNotification('error', 'Login error: ' + error.message);
      setIsLoggingIn(false);
    }
  };

  const loadData = async () => {
    try {
      console.log('Loading data...');
      const [studentsData, skillsData] = await Promise.all([
        api.getStudents(),
        api.getSkills(gradeLevel, subject)
      ]);

      console.log('Received students data:', studentsData.length);
      console.log('Received skills data:', skillsData.length, 'skills');
      if (skillsData.length > 0) {
        console.log('Sample skill:', skillsData[0]);
      }

      if (studentsData.length === 0) {
        console.log('No students in DB, syncing from IXL...');
        showNotification('info', 'Syncing students from IXL...');
        const syncResult = await api.syncStudents();
        console.log('Sync result:', syncResult);
        setStudents(syncResult.students || []);
      } else {
        console.log('Setting students:', studentsData.length);
        setStudents(studentsData);
      }

      if (skillsData.length === 0) {
        console.log('No skills in DB for grade', gradeLevel, '- syncing from IXL...');
        showNotification('info', 'Syncing skills from IXL... Browser will navigate to grade page.');
        const syncResult = await api.syncSkills(gradeLevel, subject);
        console.log('Skills sync result:', syncResult);
        if (syncResult.skills && syncResult.skills.length > 0) {
          const updatedSkills = await api.getSkills(gradeLevel, subject);
          setSkills(updatedSkills);
          showNotification('success', `Loaded ${updatedSkills.length} skills!`);
        } else {
          showNotification('error', 'No skills found. Try clicking the Sync button.');
        }
      } else {
        setSkills(skillsData);
        showNotification('success', `Loaded ${skillsData.length} skills from cache.`);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      showNotification('error', 'Error loading data: ' + error.message);
    }
  };

  const handleGradeChange = async (newGrade, forceSync = false) => {
    setGradeLevel(newGrade);
    setRangeInput('');

    try {
      showNotification('info', `Loading Grade ${newGrade} skills...`);

      let skillsData = [];
      if (!forceSync) {
        skillsData = await api.getSkills(newGrade, subject);
      }

      if (skillsData.length === 0 || forceSync) {
        showNotification('info', `Syncing Grade ${newGrade} ${subject} skills from IXL... Browser will navigate.`);
        console.log(`Syncing ${subject} skills for grade ${newGrade}...`);
        const syncResult = await api.syncSkills(newGrade, subject);
        console.log('Sync result:', syncResult);

        if (syncResult.skills && syncResult.skills.length > 0) {
          const updatedSkills = await api.getSkills(newGrade, subject);
          setSkills(updatedSkills);
          showNotification('success', `Loaded ${updatedSkills.length} Grade ${newGrade} skills!`);
        } else {
          showNotification('error', `No skills found for Grade ${newGrade}. Check browser console for details.`);
        }
      } else {
        setSkills(skillsData);
        showNotification('success', `Loaded ${skillsData.length} Grade ${newGrade} skills from cache.`);
      }
    } catch (error) {
      console.error('Error loading skills:', error);
      showNotification('error', 'Error loading skills: ' + error.message);
    }
  };

  const handleForceSync = () => {
    handleGradeChange(gradeLevel, true);
  };

  const handleSubjectChange = async (newSubject) => {
    setSubject(newSubject);
    setRangeInput('');
    setSkills([]);

    // Reset grade to first available for this subject
    const availableGrades = getAvailableGrades(newSubject);
    const newGrade = availableGrades[0].value;
    setGradeLevel(newGrade);

    const displayName = getSubjectDisplayName(newSubject);

    try {
      showNotification('info', `Loading ${displayName} skills...`);

      let skillsData = await api.getSkills(newGrade, newSubject);

      if (skillsData.length === 0) {
        showNotification('info', `Syncing ${displayName} skills from IXL...`);
        const syncResult = await api.syncSkills(newGrade, newSubject);

        if (syncResult.skills && syncResult.skills.length > 0) {
          const updatedSkills = await api.getSkills(newGrade, newSubject);
          setSkills(updatedSkills);
          showNotification('success', `Loaded ${updatedSkills.length} ${displayName} skills!`);
        } else {
          showNotification('error', `No skills found for ${displayName}. Try clicking the Sync button.`);
        }
      } else {
        setSkills(skillsData);
        showNotification('success', `Loaded ${skillsData.length} ${displayName} skills from cache.`);
      }
    } catch (error) {
      console.error('Error loading skills:', error);
      showNotification('error', 'Error loading skills: ' + error.message);
    }
  };

  const handleSyncStudents = async () => {
    try {
      showNotification('info', 'Syncing students from IXL...');
      const syncResult = await api.syncStudents();
      console.log('Student sync result:', syncResult);

      if (syncResult.success && syncResult.students) {
        setStudents(syncResult.students);
        showNotification('success', `Synced ${syncResult.students.length} students!`);
      } else {
        showNotification('error', 'Failed to sync students');
      }
    } catch (error) {
      console.error('Error syncing students:', error);
      showNotification('error', 'Error syncing students: ' + error.message);
    }
  };

  const handleAssign = async () => {
    if (!selectedStudent) {
      showNotification('error', 'Please select a student');
      return;
    }

    if (!rangeInput.trim()) {
      showNotification('error', 'Please enter a skill range (e.g., A.1-A.5)');
      return;
    }

    if (skills.length === 0) {
      showNotification('error', 'No skills loaded. Click the Sync button to load skills.');
      return;
    }

    const skillIds = parseRange(rangeInput, skills);

    if (!skillIds || skillIds.length === 0) {
      const categories = [...new Set(skills.map(s => s.category))]
        .sort((a, b) => {
          if (a.length !== b.length) return a.length - b.length;
          return a.localeCompare(b);
        })
        .join(', ');
      showNotification('error', `No skills found for range "${rangeInput}". Available categories: ${categories}`);
      return;
    }

    try {
      const result = await api.assignSkills(selectedStudent, skillIds, actionMode);

      if (result.taskId) {
        showNotification('success', `Task queued! ${skillIds.length} skills for assignment.`);
        setRangeInput('');
        setSelectedStudent(null);
        loadHistory();
      } else {
        showNotification('error', 'Failed to start assignment');
      }
    } catch (error) {
      showNotification('error', 'Assignment error: ' + error.message);
    }
  };

  useEffect(() => {
    if (queueData.allTasks.some(t => t.status === 'completed')) {
      loadHistory();
    }
  }, [queueData]);

  useEffect(() => {
    if (queueData.allTasks.some(t => t.status === 'completed')) {
      loadHistory();
    }
  }, [queueData]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative">
        {/* IXL Header Bar */}
        <div className="fixed top-0 left-0 right-0 h-1 ixl-header-bar"></div>

        <div className="paper-card rounded-2xl p-10 w-full max-w-lg relative z-10 animate-scaleIn">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--ixl-green)' }}>
              IXL Skill Assigner
            </h1>
            <p className="text-base mt-6" style={{ color: 'var(--ixl-gray-dark)' }}>
              Begin by opening your browser to log in to IXL
            </p>
          </div>

          <form onSubmit={handleLogin}>
            <div className="mb-6 p-5 rounded-xl" style={{
              background: 'linear-gradient(135deg, rgba(0, 174, 239, 0.08) 0%, rgba(0, 174, 239, 0.04) 100%)',
              border: '1.5px solid rgba(0, 174, 239, 0.2)'
            }}>
              <p className="text-sm font-semibold mb-3" style={{ color: 'var(--ixl-turquoise-dark)' }}>
                Getting Started
              </p>
              <ol className="text-sm space-y-2 ml-5 list-decimal" style={{ color: 'var(--ixl-gray-dark)' }}>
                <li>Click the button below to launch your browser</li>
                <li>Log in to IXL with your teacher account</li>
                <li>Return here once logged in</li>
                <li>Start assigning skills to your students</li>
              </ol>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="btn-ink w-full py-4 rounded-xl font-semibold text-base tracking-wide"
            >
              {isLoggingIn ? 'Waiting for login...' : 'Open Browser & Login'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--ixl-gray)' }}>
            <p className="text-xs text-center" style={{ color: 'var(--ixl-gray-dark)' }}>
              Your credentials are sent directly to IXL and not stored
            </p>
          </div>
        </div>

        {notification && (
          <Notification
            type={notification.type}
            message={notification.message}
            onClose={() => setNotification(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 relative">
      {/* IXL Header Bar */}
      <div className="fixed top-0 left-0 right-0 h-1 ixl-header-bar"></div>

      <div className="max-w-5xl mx-auto relative z-10 pt-4">
        <header className="mb-10 animate-fadeInUp">
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-5xl font-bold mb-3" style={{ color: 'var(--ixl-green)' }}>
                IXL Skill Assigner
              </h1>
              <p className="text-lg" style={{ color: 'var(--ixl-gray-dark)' }}>
                Assign skills to your students with ease
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (currentView === 'history') {
                    setCurrentView('assign');
                  } else {
                    setCurrentView('history');
                    loadHistory();
                  }
                }}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${currentView === 'history'
                  ? 'text-white shadow-md'
                  : 'hover:opacity-80'
                  }`}
                style={{
                  background: currentView === 'history' ? 'var(--ixl-turquoise)' : 'rgba(0, 174, 239, 0.1)',
                  color: currentView === 'history' ? 'white' : 'var(--ixl-turquoise-dark)'
                }}
              >
                {currentView === 'history' ? '← Back' : 'History'}
              </button>
              <div className="flex items-center gap-3 px-4 py-2 rounded-xl paper-card">
                <span className="w-3 h-3 rounded-full status-dot" style={{ background: 'var(--ixl-green)' }}></span>
                <span className="text-sm font-medium" style={{ color: 'var(--ixl-text)' }}>Connected</span>
              </div>
            </div>
          </div>
        </header>

        {currentView === 'assign' ? (
          <div className="paper-card rounded-2xl p-8 animate-fadeInUp stagger-1">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-semibold" style={{ color: 'var(--ixl-text)' }}>
                Assignment Workspace
              </h2>
            </div>

            <StudentSelector
              students={students}
              selectedStudent={selectedStudent}
              onSelect={setSelectedStudent}
              onSync={handleSyncStudents}
            />

            <div className="mb-6">
              <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--ixl-text)' }}>
                Subject
              </label>
              <select
                value={subject}
                onChange={(e) => handleSubjectChange(e.target.value)}
                className="input-field w-full px-4 py-3 rounded-xl text-base font-medium transition-all"
                style={{ color: 'var(--ixl-text)' }}
              >
                <option value="math">📐 Math</option>
                <option value="ela">📚 ELA (Language Arts)</option>
                <option value="njsla-math">🔢 NJSLA Math</option>
                <option value="njsla-ela">📖 NJSLA ELA</option>
                <option value="njsla-science">🔬 NJSLA Science</option>
              </select>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--ixl-text)' }}>
                Grade Level
              </label>
              <div className="flex gap-3">
                <select
                  value={gradeLevel}
                  onChange={(e) => handleGradeChange(e.target.value)}
                  className="input-field flex-1 px-4 py-3 rounded-xl text-base font-medium transition-all"
                  style={{ color: 'var(--ixl-text)' }}
                >
                  {getAvailableGrades(subject).map(grade => (
                    <option key={grade.value} value={grade.value}>{grade.label}</option>
                  ))}
                </select>
                <button
                  onClick={handleForceSync}
                  className="px-5 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
                  style={{
                    background: 'rgba(0, 174, 239, 0.1)',
                    color: 'var(--ixl-turquoise-dark)',
                    border: '1.5px solid rgba(0, 174, 239, 0.2)'
                  }}
                  title="Force re-sync skills from IXL website"
                >
                  🔄 Sync
                </button>
              </div>
            </div>

            <SkillsSelector
              skills={skills}
              rangeInput={rangeInput}
              onRangeChange={setRangeInput}
            />

            <div className="mb-6">
              <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--ixl-text)' }}>
                Action Mode
              </label>
              <select
                value={actionMode}
                onChange={(e) => setActionMode(e.target.value)}
                className="input-field w-full px-4 py-3 rounded-xl text-base font-medium transition-all"
                style={{ color: 'var(--ixl-text)' }}
              >
                <option value="suggest">⭐ Suggest</option>
                <option value="stop_suggesting">✕ Stop Suggesting</option>
              </select>
              <p className="text-xs mt-2" style={{ color: 'var(--ixl-gray-dark)' }}>
                {actionMode === 'suggest'
                  ? 'Skills will be suggested to the student (star selected)'
                  : 'Skills will be un-suggested from the student (star deselected)'}
              </p>
            </div>

            <button
              onClick={handleAssign}
              disabled={!selectedStudent || !rangeInput.trim()}
              className="btn-ink w-full py-5 rounded-xl font-semibold text-lg tracking-wide"
            >
              Add to Queue
            </button>

            {(queueData.queue.length > 0 || queueData.allTasks.length > 0) && (
              <div className="mt-8 p-6 rounded-xl" style={{
                background: 'linear-gradient(135deg, rgba(139, 197, 63, 0.08) 0%, rgba(139, 197, 63, 0.04) 100%)',
                border: '1.5px solid rgba(139, 197, 63, 0.2)'
              }}>
                <h3 className="font-semibold text-lg mb-4" style={{ color: 'var(--ixl-text)' }}>
                  Assignment Queue
                </h3>

                {queueData.allTasks.filter(t => t.status === 'processing').map(task => (
                  <div key={task.id} className="mb-3 p-4 rounded-xl paper-card">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-semibold" style={{ color: 'var(--ixl-text)' }}>{task.studentName}</span>
                        <span className="text-sm ml-2" style={{ color: 'var(--ixl-gray-dark)' }}>
                          ({task.progress || 0}/{task.total} skills)
                        </span>
                      </div>
                      <span className="badge badge-info">
                        Processing...
                      </span>
                    </div>
                    {task.currentSkill && (
                      <div className="text-xs mt-2" style={{ color: 'var(--ixl-gray-dark)' }}>
                        Current: {task.currentSkill}
                      </div>
                    )}
                  </div>
                ))}

                {queueData.queue.map((task, index) => (
                  <div key={task.id} className="mb-3 p-4 rounded-xl" style={{
                    background: 'var(--ixl-white)',
                    border: '1.5px solid var(--ixl-gray)'
                  }}>
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-semibold" style={{ color: 'var(--ixl-text)' }}>{task.studentName}</span>
                        <span className="text-sm ml-2" style={{ color: 'var(--ixl-gray-dark)' }}>
                          ({task.total} skills)
                        </span>
                      </div>
                      <span className="badge badge-pending">
                        Queued #{index + 1}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="paper-card rounded-2xl p-8 animate-fadeInUp stagger-1">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-semibold" style={{ color: 'var(--ixl-text)' }}>
                Assignment History
              </h2>
              <button
                onClick={loadHistory}
                className="text-sm font-medium hover:opacity-70 transition-opacity"
                style={{ color: 'var(--ixl-turquoise)' }}
              >
                Refresh List
              </button>
            </div>

            <div className="space-y-2">
              {getGroupedHistory().length === 0 ? (
                <div className="p-12 text-center" style={{ color: 'var(--ixl-gray-dark)' }}>
                  <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0h8v12H6V4z" clipRule="evenodd" />
                  </svg>
                  <p className="font-medium text-lg">No history found</p>
                  <p className="text-sm mt-2">Assignments you create will appear here in batches.</p>
                </div>
              ) : (
                getGroupedHistory().map((group) => {
                  const isExpanded = expandedBatches.has(group.id);
                  const successCount = group.items.filter(i => i.status === 'completed').length;
                  const failCount = group.items.length - successCount;
                  const hasFailures = failCount > 0;

                  return (
                    <div key={group.id} className="rounded-lg overflow-hidden border transition-all duration-300" style={{
                      borderColor: hasFailures ? 'rgba(239, 68, 68, 0.3)' : 'rgba(139, 197, 63, 0.3)',
                      background: hasFailures ? 'rgba(254, 242, 242, 0.5)' : 'rgba(240, 253, 244, 0.5)'
                    }}>
                      <div className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ background: hasFailures ? '#ef4444' : 'var(--ixl-green)' }}
                            title={hasFailures ? `${failCount} failed` : 'All successful'}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm" style={{ color: 'var(--ixl-text)' }}>
                                {group.student_name}
                              </span>
                              <span className="text-xs" style={{ color: 'var(--ixl-gray-dark)' }}>
                                • {group.items.length} skills
                              </span>
                            </div>
                            <div className="text-xs" style={{ color: 'var(--ixl-gray-dark)' }}>
                              {group.date.toLocaleDateString()} at {group.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => toggleBatch(group.id)}
                          className="px-3 py-1 rounded-md text-xs font-medium transition-all hover:opacity-80"
                          style={{
                            background: 'rgba(0, 174, 239, 0.1)',
                            color: 'var(--ixl-turquoise-dark)'
                          }}
                        >
                          {isExpanded ? '▲ Hide' : '▼ Show'}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="border-t bg-white" style={{ borderColor: 'var(--ixl-gray)' }}>
                          {group.items.map((item) => (
                            <div key={item.id} className="px-3 py-2 flex items-center gap-2 border-b last:border-0" style={{ borderColor: 'var(--ixl-gray)' }}>
                              <div
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ background: item.status === 'completed' ? 'var(--ixl-green)' : '#ef4444' }}
                              />
                              <span className="text-sm flex-1" style={{ color: 'var(--ixl-text)' }}>
                                {item.skill_name}
                              </span>
                              {item.status !== 'completed' && item.error_message && (
                                <span className="text-xs text-red-500 truncate max-w-[150px]" title={item.error_message}>
                                  {item.error_message}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {notification && (
          <Notification
            type={notification.type}
            message={notification.message}
            onClose={() => setNotification(null)}
          />
        )}
      </div>
    </div>
  );
}
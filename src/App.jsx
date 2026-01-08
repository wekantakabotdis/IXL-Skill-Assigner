import { useState, useEffect } from 'react';
import { api } from './utils/api';
import { parseRange } from './utils/skillHelpers';
import StudentSelector from './components/StudentSelector';
import SkillsSelector from './components/SkillsSelector';
import ProgressModal from './components/ProgressModal';
import Notification from './components/Notification';
import './index.css';

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
  const [gradeLevel, setGradeLevel] = useState('1');
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
          setSkills(syncResult.skills);
          showNotification('success', `Loaded ${syncResult.skills.length} skills!`);
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
          setSkills(syncResult.skills);
          showNotification('success', `Loaded ${syncResult.skills.length} Grade ${newGrade} skills!`);
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

    try {
      showNotification('info', `Loading ${newSubject === 'ela' ? 'ELA' : 'Math'} skills...`);

      let skillsData = await api.getSkills(gradeLevel, newSubject);

      if (skillsData.length === 0) {
        showNotification('info', `Syncing ${newSubject === 'ela' ? 'ELA' : 'Math'} skills from IXL...`);
        const syncResult = await api.syncSkills(gradeLevel, newSubject);

        if (syncResult.skills && syncResult.skills.length > 0) {
          setSkills(syncResult.skills);
          showNotification('success', `Loaded ${syncResult.skills.length} ${newSubject === 'ela' ? 'ELA' : 'Math'} skills!`);
        } else {
          showNotification('error', `No skills found for ${newSubject === 'ela' ? 'ELA' : 'Math'}. Try clicking the Sync button.`);
        }
      } else {
        setSkills(skillsData);
        showNotification('success', `Loaded ${skillsData.length} ${newSubject === 'ela' ? 'ELA' : 'Math'} skills from cache.`);
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
        <div className="paper-card rounded-2xl p-10 w-full max-w-lg relative z-10 animate-scaleIn">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-2 accent-underline inline-block" style={{ fontFamily: "'Crimson Pro', serif", color: '#5a3519' }}>
              IXL Skill Assigner
            </h1>
            <p className="text-base mt-6" style={{ color: '#8b7b6b' }}>
              Begin by opening your browser to log in to IXL
            </p>
          </div>

          <form onSubmit={handleLogin}>
            <div className="mb-6 p-5 rounded-xl" style={{
              background: 'linear-gradient(135deg, rgba(193, 124, 91, 0.08) 0%, rgba(193, 124, 91, 0.04) 100%)',
              border: '1.5px solid rgba(193, 124, 91, 0.15)'
            }}>
              <p className="text-sm font-semibold mb-3" style={{ color: '#6b4423' }}>
                Getting Started
              </p>
              <ol className="text-sm space-y-2 ml-5 list-decimal" style={{ color: '#8b7b6b' }}>
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

          <div className="mt-6 pt-6 border-t border-[rgba(139,69,19,0.08)]">
            <p className="text-xs text-center" style={{ color: '#b5a594' }}>
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
      <div className="max-w-5xl mx-auto relative z-10">
        <header className="mb-10 animate-fadeInUp">
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-5xl font-bold mb-3" style={{ fontFamily: "'Crimson Pro', serif", color: '#5a3519' }}>
                IXL Skill Assigner
              </h1>
              <p className="text-lg" style={{ color: '#8b7b6b' }}>
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
                  ? 'bg-[#5a3519] text-white shadow-md'
                  : 'bg-[rgba(139,69,19,0.08)] text-[#6b4423] hover:bg-[rgba(139,69,19,0.12)]'
                  }`}
              >
                {currentView === 'history' ? '← Back' : 'History'}
              </button>
              <div className="flex items-center gap-3 px-4 py-2 rounded-xl paper-card">
                <span className="w-3 h-3 rounded-full status-dot" style={{ background: '#7d9d7c' }}></span>
                <span className="text-sm font-medium" style={{ color: '#6b4423' }}>Connected</span>
              </div>
            </div>
          </div>
        </header>

        {currentView === 'assign' ? (
          <div className="paper-card rounded-b-2xl rounded-tr-2xl p-8 animate-fadeInUp stagger-1">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-semibold" style={{ fontFamily: "'Crimson Pro', serif", color: '#6b4423' }}>
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
              <label className="block text-sm font-semibold mb-3" style={{ color: '#6b4423' }}>
                Subject
              </label>
              <select
                value={subject}
                onChange={(e) => handleSubjectChange(e.target.value)}
                className="input-field w-full px-4 py-3 rounded-xl text-base font-medium transition-all"
                style={{ color: '#5a3519' }}
              >
                <option value="math">📐 Math</option>
                <option value="ela">📚 ELA (Language Arts)</option>
              </select>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold mb-3" style={{ color: '#6b4423' }}>
                Grade Level
              </label>
              <div className="flex gap-3">
                <select
                  value={gradeLevel}
                  onChange={(e) => handleGradeChange(e.target.value)}
                  className="input-field flex-1 px-4 py-3 rounded-xl text-base font-medium transition-all"
                  style={{ color: '#5a3519' }}
                >
                  <option value="pre-k">Pre-K</option>
                  <option value="kindergarten">Kindergarten</option>
                  <option value="1">Grade 1</option>
                  <option value="2">Grade 2</option>
                  <option value="3">Grade 3</option>
                  <option value="4">Grade 4</option>
                  <option value="5">Grade 5</option>
                  <option value="6">Grade 6</option>
                  <option value="7">Grade 7</option>
                  <option value="8">Grade 8</option>
                  <option value="9">Grade 9</option>
                  <option value="10">Grade 10</option>
                  <option value="11">Grade 11</option>
                  <option value="12">Grade 12</option>
                </select>
                <button
                  onClick={handleForceSync}
                  className="px-5 py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: 'rgba(193, 124, 91, 0.1)',
                    color: '#8b5a3c',
                    border: '1.5px solid rgba(193, 124, 91, 0.2)'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'rgba(193, 124, 91, 0.15)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'rgba(193, 124, 91, 0.1)';
                    e.currentTarget.style.transform = 'translateY(0)';
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
              <label className="block text-sm font-semibold mb-3" style={{ color: '#6b4423' }}>
                Action Mode
              </label>
              <select
                value={actionMode}
                onChange={(e) => setActionMode(e.target.value)}
                className="input-field w-full px-4 py-3 rounded-xl text-base font-medium transition-all"
                style={{ color: '#5a3519' }}
              >
                <option value="suggest">⭐ Suggest</option>
                <option value="stop_suggesting">✕ Stop Suggesting</option>
              </select>
              <p className="text-xs mt-2" style={{ color: '#b5a594' }}>
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
                background: 'linear-gradient(135deg, rgba(125, 157, 124, 0.08) 0%, rgba(125, 157, 124, 0.04) 100%)',
                border: '1.5px solid rgba(125, 157, 124, 0.2)'
              }}>
                <h3 className="font-semibold text-lg mb-4" style={{ fontFamily: "'Crimson Pro', serif", color: '#6b4423' }}>
                  Assignment Queue
                </h3>

                {queueData.allTasks.filter(t => t.status === 'processing').map(task => (
                  <div key={task.id} className="mb-3 p-4 rounded-xl paper-card">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-semibold" style={{ color: '#5a3519' }}>{task.studentName}</span>
                        <span className="text-sm ml-2" style={{ color: '#8b7b6b' }}>
                          ({task.progress || 0}/{task.total} skills)
                        </span>
                      </div>
                      <span className="badge badge-info">
                        Processing...
                      </span>
                    </div>
                    {task.currentSkill && (
                      <div className="text-xs mt-2" style={{ color: '#b5a594' }}>
                        Current: {task.currentSkill}
                      </div>
                    )}
                  </div>
                ))}

                {queueData.queue.map((task, index) => (
                  <div key={task.id} className="mb-3 p-4 rounded-xl" style={{
                    background: 'rgba(255, 250, 245, 0.6)',
                    border: '1.5px solid rgba(139, 69, 19, 0.08)'
                  }}>
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-semibold" style={{ color: '#5a3519' }}>{task.studentName}</span>
                        <span className="text-sm ml-2" style={{ color: '#8b7b6b' }}>
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
          <div className="paper-card rounded-b-2xl rounded-tl-2xl p-8 animate-fadeInUp stagger-1">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-semibold" style={{ fontFamily: "'Crimson Pro', serif", color: '#6b4423' }}>
                Assignment History
              </h2>
              <button
                onClick={loadHistory}
                className="text-sm font-medium hover:opacity-70 transition-opacity"
                style={{ color: '#c17c5b' }}
              >
                Refresh List
              </button>
            </div>

            <div className="space-y-2">
              {getGroupedHistory().length === 0 ? (
                <div className="p-12 text-center" style={{ color: '#b5a594' }}>
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
                      borderColor: hasFailures ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)',
                      background: hasFailures ? 'rgba(254, 242, 242, 0.5)' : 'rgba(240, 253, 244, 0.5)'
                    }}>
                      <div className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ background: hasFailures ? '#ef4444' : '#22c55e' }}
                            title={hasFailures ? `${failCount} failed` : 'All successful'}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm" style={{ color: '#5a3519' }}>
                                {group.student_name}
                              </span>
                              <span className="text-xs" style={{ color: '#8b7b6b' }}>
                                • {group.items.length} skills
                              </span>
                            </div>
                            <div className="text-xs" style={{ color: '#b5a594' }}>
                              {group.date.toLocaleDateString()} at {group.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => toggleBatch(group.id)}
                          className="px-3 py-1 rounded-md text-xs font-medium transition-all hover:opacity-80"
                          style={{
                            background: 'rgba(139, 69, 19, 0.08)',
                            color: '#6b4423'
                          }}
                        >
                          {isExpanded ? '▲ Hide' : '▼ Show'}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-[rgba(139,69,19,0.08)] bg-white">
                          {group.items.map((item) => (
                            <div key={item.id} className="px-3 py-2 flex items-center gap-2 border-b border-[rgba(139,69,19,0.04)] last:border-0">
                              <div
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ background: item.status === 'completed' ? '#22c55e' : '#ef4444' }}
                              />
                              <span className="text-sm flex-1" style={{ color: '#6b4423' }}>
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
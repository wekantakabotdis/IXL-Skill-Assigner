import { useState, useEffect } from 'react';
import { api } from './utils/api';
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
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [gradeLevel, setGradeLevel] = useState('1');

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
        api.getSkills(gradeLevel)
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
        const syncResult = await api.syncSkills(gradeLevel);
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
    setSelectedSkills([]);
    
    try {
      showNotification('info', `Loading Grade ${newGrade} skills...`);
      
      let skillsData = [];
      if (!forceSync) {
        skillsData = await api.getSkills(newGrade);
      }
      
      if (skillsData.length === 0 || forceSync) {
        showNotification('info', `Syncing Grade ${newGrade} skills from IXL... Browser will navigate.`);
        console.log(`Syncing skills for grade ${newGrade}...`);
        const syncResult = await api.syncSkills(newGrade);
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

  const toggleSkill = (skillId) => {
    setSelectedSkills(prev => 
      prev.includes(skillId)
        ? prev.filter(id => id !== skillId)
        : [...prev, skillId]
    );
  };

  const setMultipleSkills = (skillIds) => {
    setSelectedSkills(skillIds);
  };

  const handleAssign = async () => {
    if (!selectedStudent) {
      showNotification('error', 'Please select a student');
      return;
    }

    if (selectedSkills.length === 0) {
      showNotification('error', 'Please select at least one skill');
      return;
    }

    try {
      const result = await api.assignSkills(selectedStudent, selectedSkills);
      
      if (result.taskId) {
        showNotification('success', `Task queued! ${selectedSkills.length} skills for assignment.`);
        setSelectedSkills([]);
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
            <div className="flex items-center gap-3 px-5 py-3 rounded-xl paper-card animate-slideInRight">
              <span className="w-3 h-3 rounded-full status-dot" style={{ background: '#7d9d7c' }}></span>
              <span className="text-sm font-medium" style={{ color: '#6b4423' }}>Connected</span>
            </div>
          </div>

          <div className="flex gap-4 border-b border-[rgba(139,69,19,0.1)] pb-1">
            <button
              onClick={() => setCurrentView('assign')}
              className={`px-6 py-3 rounded-t-xl font-semibold transition-all relative top-[1px] ${
                currentView === 'assign'
                  ? 'text-[#5a3519] bg-[#fffaf5] border-t border-x border-[rgba(139,69,19,0.1)] shadow-[0_-2px_4px_rgba(139,69,19,0.02)]'
                  : 'text-[#8b7b6b] hover:bg-[rgba(139,69,19,0.03)]'
              }`}
            >
              Assign Skills
            </button>
            <button
              onClick={() => {
                setCurrentView('history');
                loadHistory();
              }}
              className={`px-6 py-3 rounded-t-xl font-semibold transition-all relative top-[1px] ${
                currentView === 'history'
                  ? 'text-[#5a3519] bg-[#fffaf5] border-t border-x border-[rgba(139,69,19,0.1)] shadow-[0_-2px_4px_rgba(139,69,19,0.02)]'
                  : 'text-[#8b7b6b] hover:bg-[rgba(139,69,19,0.03)]'
              }`}
            >
              History
            </button>
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
            />

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
              selectedSkills={selectedSkills}
              onToggle={toggleSkill}
              onSelectMultiple={setMultipleSkills}
            />

            <button
              onClick={handleAssign}
              disabled={!selectedStudent || selectedSkills.length === 0}
              className="btn-ink w-full py-5 rounded-xl font-semibold text-lg tracking-wide"
            >
              {`Add to Queue: ${selectedSkills.length} Skill${selectedSkills.length !== 1 ? 's' : ''}`}
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

            <div className="space-y-4">
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

                  return (
                    <div key={group.id} className="rounded-xl overflow-hidden border transition-all duration-300" style={{
                      borderColor: 'rgba(139, 69, 19, 0.1)',
                      background: '#fffaf5'
                    }}>
                      <div 
                        className="p-5 flex items-center justify-between cursor-pointer hover:bg-[rgba(139,69,19,0.03)] transition-colors"
                        onClick={() => toggleBatch(group.id)}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shadow-sm ${
                            failCount > 0 ? 'bg-red-100 text-red-800' : 'bg-[#e6f4ea] text-[#1e4620]'
                          }`}>
                            {group.student_name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-lg" style={{ color: '#5a3519' }}>
                              {group.student_name}
                            </div>
                            <div className="text-sm flex gap-3 mt-1" style={{ color: '#8b7b6b' }}>
                              <span>{group.date.toLocaleDateString()} at {group.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                              <span>•</span>
                              <span>{group.items.length} skills assigned</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="flex flex-col items-end">
                            {failCount > 0 ? (
                              <span className="badge badge-error mb-1">
                                {failCount} Failed
                              </span>
                            ) : (
                              <span className="badge badge-success mb-1">
                                All Success
                              </span>
                            )}
                            <span className="text-xs text-[#b5a594]">
                              Click to {isExpanded ? 'collapse' : 'expand'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-[rgba(139,69,19,0.06)] bg-[rgba(255,250,245,0.5)]">
                          {group.items.map((item) => (
                            <div key={item.id} className="p-3 pl-20 flex justify-between items-center border-b border-[rgba(139,69,19,0.03)] last:border-0 hover:bg-white transition-colors">
                              <span className="font-medium" style={{ color: '#6b4423' }}>
                                {item.skill_name}
                              </span>
                              {item.status === 'completed' ? (
                                <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-1 rounded">
                                  Completed
                                </span>
                              ) : (
                                <span className="text-xs font-bold text-red-700 bg-red-50 px-2 py-1 rounded flex items-center gap-2">
                                  Failed
                                  {item.error_message && (
                                    <span className="font-normal opacity-75 hidden md:inline">
                                      - {item.error_message}
                                    </span>
                                  )}
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
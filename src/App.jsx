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
  const [gradeLevel, setGradeLevel] = useState('8');

  const [isAssigning, setIsAssigning] = useState(false);
  const [currentTask, setCurrentTask] = useState(null);
  const [taskStatus, setTaskStatus] = useState(null);
  const [queueData, setQueueData] = useState({ queue: [], allTasks: [] });
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const [notification, setNotification] = useState(null);

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
      const historyData = await api.getHistory(null, 50);
      setHistory(historyData);
    } catch (error) {
      console.error('Error loading history:', error);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadHistory();
    }
  }, [isAuthenticated]);

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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">
            IXL Skill Assigner
          </h1>
          <p className="text-sm text-gray-600 mb-6 text-center">
            Click "Open Browser" below. You'll log in manually in the browser window.
          </p>
          
          <form onSubmit={handleLogin}>
            <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900 font-medium mb-2">
                📌 How it works:
              </p>
              <ol className="text-xs text-blue-800 space-y-1 ml-4 list-decimal">
                <li>Click the button below to open a browser window</li>
                <li>Log in to IXL manually in that window</li>
                <li>The app will detect when you're logged in</li>
                <li>You can then assign skills!</li>
              </ol>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400"
            >
              {isLoggingIn ? 'Waiting for login...' : 'Open Browser & Login'}
            </button>
          </form>
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
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              IXL Skill Assigner
            </h1>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-green-500 rounded-full"></span>
              <span className="text-sm text-gray-600">Connected</span>
            </div>
          </div>

          <StudentSelector
            students={students}
            selectedStudent={selectedStudent}
            onSelect={setSelectedStudent}
          />

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Grade Level
            </label>
            <div className="flex gap-2">
              <select
                value={gradeLevel}
                onChange={(e) => handleGradeChange(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-medium"
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
            className="w-full bg-blue-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {`Add to Queue: ${selectedSkills.length} Skill${selectedSkills.length !== 1 ? 's' : ''}`}
          </button>

          {/* Queue Status */}
          {(queueData.queue.length > 0 || queueData.allTasks.length > 0) && (
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-3">Assignment Queue</h3>
              
              {queueData.allTasks.filter(t => t.status === 'processing').map(task => (
                <div key={task.id} className="mb-2 p-3 bg-white rounded border border-blue-300">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-medium">{task.studentName}</span>
                      <span className="text-sm text-gray-600 ml-2">
                        ({task.progress || 0}/{task.total} skills)
                      </span>
                    </div>
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      Processing...
                    </span>
                  </div>
                  {task.currentSkill && (
                    <div className="text-xs text-gray-500 mt-1">
                      Current: {task.currentSkill}
                    </div>
                  )}
                </div>
              ))}

              {queueData.queue.map((task, index) => (
                <div key={task.id} className="mb-2 p-3 bg-gray-50 rounded border border-gray-300">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-medium">{task.studentName}</span>
                      <span className="text-sm text-gray-600 ml-2">
                        ({task.total} skills)
                      </span>
                    </div>
                    <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">
                      Queued #{index + 1}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* History Section */}
          <div className="mt-6">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="w-full text-left px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium text-gray-700 flex justify-between items-center"
            >
              <span>Assignment History ({history.length})</span>
              <span>{showHistory ? '▼' : '▶'}</span>
            </button>

            {showHistory && (
              <div className="mt-3 max-h-96 overflow-y-auto border border-gray-300 rounded-lg">
                {history.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    No assignment history yet
                  </div>
                ) : (
                  <div className="divide-y">
                    {history.map((item) => (
                      <div key={item.id} className="p-3 hover:bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">
                              {item.student_name}
                            </div>
                            <div className="text-sm text-gray-600 mt-1">
                              {item.skill_name}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              {new Date(item.assigned_at).toLocaleString()}
                            </div>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded ${
                            item.status === 'completed' 
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {item.status}
                          </span>
                        </div>
                        {item.error_message && (
                          <div className="text-xs text-red-600 mt-2">
                            Error: {item.error_message}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
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

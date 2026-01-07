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

  const [notification, setNotification] = useState(null);

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

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

    setIsAssigning(true);

    try {
      const result = await api.assignSkills(selectedStudent, selectedSkills);
      
      if (result.taskId) {
        setCurrentTask(result.taskId);
        pollTaskStatus(result.taskId);
      } else {
        showNotification('error', 'Failed to start assignment');
        setIsAssigning(false);
      }
    } catch (error) {
      showNotification('error', 'Assignment error: ' + error.message);
      setIsAssigning(false);
    }
  };

  const pollTaskStatus = async (taskId) => {
    const pollInterval = setInterval(async () => {
      try {
        const status = await api.getAssignmentStatus(taskId);
        setTaskStatus(status);

        if (status.status === 'completed') {
          clearInterval(pollInterval);
          setIsAssigning(false);
          showNotification('success', 
            `Successfully assigned ${status.total} skills!`
          );
          setSelectedSkills([]);
          
          setTimeout(() => {
            setCurrentTask(null);
            setTaskStatus(null);
          }, 3000);
        } else if (status.status === 'failed') {
          clearInterval(pollInterval);
          setIsAssigning(false);
          showNotification('error', 
            'Assignment failed: ' + (status.error || 'Unknown error')
          );
        }
      } catch (error) {
        clearInterval(pollInterval);
        setIsAssigning(false);
        showNotification('error', 'Error checking status: ' + error.message);
      }
    }, 1000);
  };

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
            disabled={!selectedStudent || selectedSkills.length === 0 || isAssigning}
            className="w-full bg-blue-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isAssigning 
              ? 'Assigning Skills...' 
              : `Assign ${selectedSkills.length} Skill${selectedSkills.length !== 1 ? 's' : ''} to Student`
            }
          </button>
        </div>
      </div>

      <ProgressModal
        isOpen={isAssigning}
        taskStatus={taskStatus}
        skills={skills}
      />

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

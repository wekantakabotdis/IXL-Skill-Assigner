import { useState, useEffect, useCallback } from 'react';
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
    case 'njgpa-math':
    case 'njgpa-ela':
      return [
        { value: 'njgpa', label: 'NJGPA Plan' },
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
    case 'njgpa-math': return 'NJGPA Math';
    case 'njgpa-ela': return 'NJGPA ELA';
    default: return subject;
  }
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [saveAccount, setSaveAccount] = useState(false);
  const [showBrowser, setShowBrowser] = useState(true);
  const [showHeadlessInfo, setShowHeadlessInfo] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState([]);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [skills, setSkills] = useState([]);
  const [isLoadingSkills, setIsLoadingSkills] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState([]);
  const [subject, setSubject] = useState(null);
  const [gradeLevel, setGradeLevel] = useState(null);
  const [selectedGroupNames, setSelectedGroupNames] = useState([]);
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

  // Helper function to group history by batch
  const groupHistory = (history) => {
    if (!history.length) return [];

    const sortedHistory = [...history].sort((a, b) => new Date(b.assigned_at) - new Date(a.assigned_at));
    const batchesMap = new Map();

    sortedHistory.forEach((item) => {
      // Use batch_id if available, otherwise fallback to 60s time window grouping
      let batchId = item.batch_id;
      if (!batchId) {
        // Legacy grouping by time window
        const timeKey = Math.floor(new Date(item.assigned_at).getTime() / 60000);
        batchId = `legacy-${timeKey}`;
      }

      if (!batchesMap.has(batchId)) {
        batchesMap.set(batchId, {
          id: batchId,
          timestamp: new Date(item.assigned_at).getTime(),
          date: new Date(item.assigned_at.endsWith('Z') ? item.assigned_at : item.assigned_at + 'Z'),
          groups: new Map(), // groupName -> { name, students: Map<studentId, {name, items}> }
          individuals: new Map(), // studentId -> { name, items: [] }
          totalSkills: 0
        });
      }

      const batch = batchesMap.get(batchId);
      batch.totalSkills++;

      if (item.group_name) {
        // It's part of a group assignment
        if (!batch.groups.has(item.group_name)) {
          batch.groups.set(item.group_name, {
            type: 'group',
            name: item.group_name,
            students: new Map()
          });
        }
        const group = batch.groups.get(item.group_name);

        if (!group.students.has(item.student_id)) {
          group.students.set(item.student_id, {
            id: item.student_id,
            name: item.student_name,
            items: []
          });
        }
        group.students.get(item.student_id).items.push(item);
      } else {
        // Individual assignment
        if (!batch.individuals.has(item.student_id)) {
          batch.individuals.set(item.student_id, {
            type: 'student',
            id: item.student_id,
            name: item.student_name,
            items: []
          });
        }
        batch.individuals.get(item.student_id).items.push(item);
      }
    });

    // Convert Maps to Arrays for rendering
    return Array.from(batchesMap.values()).map(batch => ({
      ...batch,
      groups: Array.from(batch.groups.values()).map(g => ({
        ...g,
        students: Array.from(g.students.values())
      })),
      individuals: Array.from(batch.individuals.values())
    }));
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

  const getGroupedHistory = useCallback(() => {
    return groupHistory(history);
  }, [history]);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const accounts = await api.getAccounts();
        setSavedAccounts(accounts);

        // Pre-fill with last used account if available and not already set
        if (accounts.length > 0 && !username) {
          const lastUsed = accounts[0]; // Ordered by last_used DESC in DB
          if (lastUsed.last_used) {
            setUsername(lastUsed.ixl_username);
            setPassword(lastUsed.ixl_password);
          }
        }
      } catch (error) {
        console.error('Error fetching accounts:', error);
      }
    };

    const fetchSettings = async () => {
      try {
        const { value } = await api.getSetting('headless_mode');
        if (value !== null) {
          setShowBrowser(value !== 'true');
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };

    fetchAccounts();
    fetchSettings();
  }, [username]);

  const handleDeleteAccount = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this account?')) return;
    try {
      await api.deleteAccount(id);
      const accounts = await api.getAccounts();
      setSavedAccounts(accounts);
      showNotification('success', 'Account deleted');
    } catch (error) {
      showNotification('error', 'Error deleting account');
    }
  };

  const handleSelectAccount = (account) => {
    setUsername(account.ixl_username);
    setPassword(account.ixl_password);
    setSaveAccount(false); // Already saved
  };

  const loadSkills = async (grade, subj, forceSync = false) => {
    if (!grade || !subj) return;
    setIsLoadingSkills(true);

    try {
      showNotification('info', `Loading ${getSubjectDisplayName(subj)} Grade ${grade} skills...`);

      let skillsData = [];
      if (!forceSync) {
        skillsData = await api.getSkills(grade, subj);
      }

      if (skillsData.length === 0 || forceSync) {
        showNotification('info', `Syncing ${getSubjectDisplayName(subj)} skills from IXL... Browser will navigate.`);
        const syncResult = await api.syncSkills(grade, subj);

        if (syncResult.skills && syncResult.skills.length > 0) {
          const updatedSkills = await api.getSkills(grade, subj);
          setSkills(updatedSkills);
          showNotification('success', `Loaded ${updatedSkills.length} ${getSubjectDisplayName(subj)} skills!`);
        } else {
          showNotification('error', `No skills found for Grade ${grade}. Check browser console for details.`);
          setSkills([]);
        }
      } else {
        setSkills(skillsData);
        showNotification('success', `Loaded ${skillsData.length} ${getSubjectDisplayName(subj)} skills from cache.`);
      }
    } catch (error) {
      console.error('Error loading skills:', error);
      showNotification('error', 'Error loading skills: ' + error.message);
      setSkills([]);
    } finally {
      setIsLoadingSkills(false);
    }
  };

  useEffect(() => {
    const applyGroupDefaults = async () => {
      if (selectedStudentIds.length === 0) {
        setSubject(null);
        setGradeLevel(null);
        setSkills([]);
        return;
      }

      try {
        const commonDefaults = await api.getCommonDefaults(selectedStudentIds);

        // Only apply if this is still the current selection count
        // and we haven't switched to a different task
        if (commonDefaults && commonDefaults.subject && commonDefaults.gradeLevel) {
          setSubject(commonDefaults.subject);
          setGradeLevel(commonDefaults.gradeLevel);
          loadSkills(commonDefaults.gradeLevel, commonDefaults.subject);
        }
      } catch (error) {
        console.error('Error fetching group defaults:', error);
      }
    };
    applyGroupDefaults();
  }, [selectedStudentIds]);

  const handleLogin = async (e) => {
    e?.preventDefault();
    setIsLoggingIn(true);

    try {
      console.log('Starting login process...', { username, showBrowser, saveAccount });
      showNotification('info', !showBrowser ? 'Logging in (headless mode)...' : 'Opening browser...');

      const result = await api.login(username, password, !showBrowser, saveAccount);
      console.log('Login result received:', result);

      if (result.success) {
        console.log('Login successful, setting authenticated state...');
        setIsAuthenticated(true);
        showNotification('success', 'Logged in successfully!');

        // Refresh saved accounts list if we just saved one
        if (saveAccount) {
          const accounts = await api.getAccounts();
          setSavedAccounts(accounts);
        }

        await loadData();
      } else {
        console.error('Login failed:', result.error);
        // Specifically show the error message from the backend
        showNotification('error', result.error || 'Login failed. Please check your credentials.');
      }
    } catch (error) {
      console.error('Login error caught:', error);
      showNotification('error', 'Login error: ' + error.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    if (!window.confirm('Are you sure you want to sign out? This will close any automated browser windows.')) return;

    try {
      showNotification('info', 'Signing out...');
      const result = await api.logout();
      if (result.success) {
        setIsAuthenticated(false);
        setIsLoggingIn(false);
        setSelectedGroupNames([]);
        setSelectedStudentIds([]);
        setSelectedSkillIds([]);
        setSubject(null);
        setGradeLevel(null);
        setSkills([]);
        showNotification('success', 'Signed out successfully');
      } else {
        showNotification('error', 'Logout failed: ' + result.error);
      }
    } catch (error) {
      showNotification('error', 'Logout error: ' + error.message);
    }
  };

  const loadData = async () => {
    try {
      console.log('Loading data...');

      // Load students from database
      const studentsData = await api.getStudents();
      console.log('Received students data:', studentsData.length);

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

      // Load groups
      const groupsData = await api.getGroups();
      setGroups(groupsData || []);

      // Don't try to load skills on initial login - user needs to select subject and grade first
      // Skills will be loaded when user selects a subject/grade
      if (!subject || !gradeLevel) {
        console.log('No subject/grade selected, skipping skills load');
        showNotification('success', 'Ready! Select a student, subject, and grade to begin.');
        return;
      }

      // Only load skills if subject and grade are selected
      const skillsData = await api.getSkills(gradeLevel, subject);
      console.log('Received skills data:', skillsData.length, 'skills');

      if (skillsData.length > 0) {
        setSkills(skillsData);
        showNotification('success', `Loaded ${skillsData.length} skills from cache.`);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      showNotification('error', 'Error loading data: ' + error.message);
    }
  };

  const handleGradeChange = async (newGrade) => {
    setGradeLevel(newGrade);
    setSelectedSkillIds([]); // Reset skills when grade changes
    loadSkills(newGrade, subject);
  };

  const handleForceSync = () => {
    loadSkills(gradeLevel, subject, true);
  };

  const handleSubjectChange = async (newSubject) => {
    setSubject(newSubject);
    setSkills([]);
    setGradeLevel(null);
    setSelectedSkillIds([]); // Reset skills when subject changes

    // For NJGPA, there's only one "grade" (the whole plan), so auto-select it
    if (newSubject.startsWith('njgpa-')) {
      const grades = getAvailableGrades(newSubject);
      if (grades.length === 1) {
        setGradeLevel(grades[0].value);
        loadSkills(grades[0].value, newSubject);
      }
    }
  };

  const handleStudentSelect = (ids, groupNames = []) => {
    setSelectedStudentIds(ids);
    setSelectedGroupNames(groupNames);
  };

  const handleSyncStudents = async () => {
    try {
      showNotification('info', 'Syncing students from IXL...');
      const syncResult = await api.syncStudents();
      console.log('Student sync result:', syncResult);

      if (syncResult.success && syncResult.students) {
        setStudents(syncResult.students);

        // Also update groups if they're included (IXL classes)
        if (syncResult.groups) {
          setGroups(syncResult.groups);
          const ixlClassCount = syncResult.groups.filter(g => g.isIxlClass).length;
          if (ixlClassCount > 0) {
            showNotification('success', `Synced ${syncResult.students.length} students and ${ixlClassCount} IXL classes!`);
          } else {
            showNotification('success', `Synced ${syncResult.students.length} students!`);
          }
        } else {
          showNotification('success', `Synced ${syncResult.students.length} students!`);
        }
      } else {
        showNotification('error', 'Failed to sync students');
      }
    } catch (error) {
      console.error('Error syncing students:', error);
      showNotification('error', 'Error syncing students: ' + error.message);
    }
  };

  const handleCreateGroup = async (name, studentIds) => {
    try {
      const result = await api.createGroup(name, studentIds);
      if (result.success) {
        showNotification('success', `Group "${name}" created!`);
        const groupsData = await api.getGroups();
        setGroups(groupsData);
      }
    } catch (error) {
      showNotification('error', 'Error creating group: ' + error.message);
    }
  };

  const handleDeleteGroup = async (id) => {
    try {
      const result = await api.deleteGroup(id);
      if (result.success) {
        showNotification('success', 'Group deleted');
        const groupsData = await api.getGroups();
        setGroups(groupsData);
      }
    } catch (error) {
      showNotification('error', 'Error deleting group: ' + error.message);
    }
  };

  const handleAssign = async () => {
    if (selectedStudentIds.length === 0) {
      showNotification('error', 'Please select at least one student');
      return;
    }

    if (selectedSkillIds.length === 0) {
      showNotification('error', 'Please select at least one skill');
      return;
    }

    if (skills.length === 0) {
      showNotification('error', 'No skills loaded. Click the Sync button to load skills.');
      return;
    }

    const skillIds = selectedSkillIds;
    const studentIds = selectedStudentIds;

    try {
      const result = await api.assignSkills(studentIds, skillIds, actionMode, selectedGroupNames);

      if (result.taskId) {
        showNotification('success', `Task queued for ${studentIds.length} students and ${skillIds.length} skills.`);

        // Update defaults for all selected students
        try {
          await Promise.all(studentIds.map(id =>
            api.updateStudentDefaults(id, gradeLevel, subject)
          ));
          // Refresh students to get updated defaults
          const updatedStudents = await api.getStudents();
          setStudents(updatedStudents);
        } catch (error) {
          console.error('Error saving student defaults:', error);
        }

        setSelectedGroupNames([]);
        setSelectedSkillIds([]);
        setSelectedStudentIds([]);
        setSubject(null);
        setGradeLevel(null);
        setSkills([]);
        loadHistory();
      } else {
        showNotification('error', 'Failed to start assignment');
      }
    } catch (error) {
      showNotification('error', 'Assignment error: ' + error.message);
    }
  };

  const handleAbort = async () => {
    try {
      const result = await api.abortTasks();
      if (result.success) {
        showNotification('info', result.message);
      } else {
        showNotification('error', 'Failed to abort tasks');
      }
    } catch (error) {
      showNotification('error', 'Abort error: ' + error.message);
    }
  };

  useEffect(() => {
    if (queueData?.allTasks?.some(t => t.status === 'completed')) {
      loadHistory();
    }
  }, [queueData]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative py-12">
        {/* IXL Header Bar */}
        <div className="fixed top-0 left-0 right-0 h-1 ixl-header-bar"></div>

        <div className="paper-card rounded-2xl p-8 w-full max-w-md relative z-10 animate-scaleIn">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--ixl-green)' }}>
              IXL Skill Assigner
            </h1>
            <p className="text-gray-500 text-sm">Sign in to start automating your tasks</p>
          </div>

          <div className="flex flex-col gap-8">
            {/* Saved Accounts Section - Only show if there are accounts */}
            {savedAccounts.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-2">Saved Accounts</h2>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {savedAccounts.map(account => (
                    <div
                      key={account.id}
                      onClick={() => handleSelectAccount(account)}
                      className="group p-3 rounded-xl border-2 cursor-pointer transition-all flex justify-between items-center bg-white hover:border-turquoise-200"
                      style={{
                        borderColor: username === account.ixl_username ? 'var(--ixl-turquoise)' : '#F3F4F6',
                        backgroundColor: username === account.ixl_username ? 'rgba(0, 174, 239, 0.05)' : ''
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm truncate" style={{ color: 'var(--ixl-text)' }}>
                          {account.ixl_username}
                        </div>
                        {account.label && account.label !== account.ixl_username && (
                          <div className="text-xs text-gray-500 truncate">{account.label}</div>
                        )}
                      </div>
                      <button
                        onClick={(e) => handleDeleteAccount(account.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-500 transition-all"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="border-b border-gray-100 pt-2"></div>
              </div>
            )}

            {/* Login Form Section */}
            <form onSubmit={handleLogin} className="space-y-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-2">
                {username ? 'Confirm Credentials' : 'Add New Account'}
              </h2>
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-600">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input-field w-full px-4 py-2 rounded-lg text-sm"
                  placeholder="IXL Username or Email"
                  required
                />
              </div>
              <div className="relative">
                <label className="block text-xs font-semibold mb-1 text-gray-600">Password</label>
                <div className="relative group">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field w-full px-4 py-2 pr-10 rounded-lg text-sm"
                    placeholder="IXL Password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-turquoise-500 rounded-md transition-all"
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a10.05 10.05 0 011.531-2.992m3.676-3.676A10.046 10.046 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.059 10.059 0 01-1.071 2.528M9 9l6 6m-6 0l6-6" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-4 pt-2">
                <label className="flex items-center gap-3 cursor-pointer group select-none">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={saveAccount}
                      onChange={(e) => setSaveAccount(e.target.checked)}
                      className="sr-only"
                    />
                    <div
                      className="w-5 h-5 border-2 rounded-md transition-all flex items-center justify-center"
                      style={{
                        borderColor: saveAccount ? 'var(--ixl-turquoise)' : '#D1D5DB',
                        backgroundColor: saveAccount ? 'var(--ixl-turquoise)' : 'transparent',
                        boxShadow: saveAccount ? '0 0 0 3px rgba(0, 174, 239, 0.1)' : 'none'
                      }}
                    >
                      <svg
                        className={`w-3.5 h-3.5 text-white transition-opacity duration-200 ${saveAccount ? 'opacity-100' : 'opacity-0'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                  <span className="text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">Save credentials for next time</span>
                </label>

                <div className="flex items-center justify-between py-1">
                  <label className="flex items-center gap-3 cursor-pointer group select-none">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={showBrowser}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setShowBrowser(val);
                          api.saveSetting('headless_mode', !val);
                        }}
                        className="sr-only"
                      />
                      <div
                        className="w-11 h-6 rounded-full transition-all relative flex items-center"
                        style={{
                          backgroundColor: showBrowser ? 'var(--ixl-turquoise)' : '#E5E7EB',
                          boxShadow: showBrowser ? '0 0 0 3px rgba(0, 174, 239, 0.1)' : 'none'
                        }}
                      >
                        <div
                          className="absolute bg-white rounded-full h-4.5 w-4.5 transition-all shadow-sm"
                          style={{
                            left: showBrowser ? '22px' : '4px',
                            height: '18px',
                            width: '18px'
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">Show Browser</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowHeadlessInfo(!showHeadlessInfo)}
                    className="p-1 px-2 text-gray-400 hover:text-turquoise-500 hover:bg-turquoise-50 rounded-lg transition-all"
                    title="What does Show Browser do?"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </div>
              </div>

              {showHeadlessInfo && (
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100 animate-fadeIn">
                  <p className="text-[10px] leading-relaxed text-gray-500">
                    <strong>Show Browser</strong> opens the automation in a visible window so you can watch what happens. Uncheck this to run faster in the background (hidden).
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoggingIn}
                className="btn-ink w-full py-3.5 rounded-xl font-bold text-base tracking-wide mt-4 shadow-lg hover:shadow-xl transition-all"
                style={{
                  background: 'linear-gradient(135deg, #8BC53F 0%, #6FA032 100%)',
                }}
              >
                {isLoggingIn ? (
                  <div className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Logging in...</span>
                  </div>
                ) : 'Sign in to IXL'}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => handleLogin()}
                  className="text-xs text-gray-400 hover:text-turquoise-500 transition-colors"
                >
                  Or login manually in browser
                </button>
              </div>
            </form>
          </div>

          <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--ixl-gray)' }}>
            <p className="text-[10px] text-center" style={{ color: 'var(--ixl-gray-dark)' }}>
              Credentials are only stored locally in your database.
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
              <button
                onClick={handleLogout}
                className="px-4 py-2 rounded-lg font-semibold text-sm transition-all hover:bg-red-50 text-red-500 border border-red-100"
              >
                Sign Out
              </button>
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
              groups={groups}
              selectedStudentIds={selectedStudentIds}
              selectedGroupNames={selectedGroupNames}
              onSelect={handleStudentSelect}
              onSync={handleSyncStudents}
              onCreateGroup={handleCreateGroup}
              onDeleteGroup={handleDeleteGroup}
            />

            <div className="mb-6 flex flex-col">
              <div className="space-y-2">
                <label className="block text-sm font-semibold ml-1" style={{ color: 'var(--ixl-text)' }}>Subject</label>
                <select
                  value={subject || ''}
                  onChange={(e) => e.target.value && handleSubjectChange(e.target.value)}
                  className="input-field w-full px-4 py-3 rounded-xl text-base font-medium transition-all"
                  style={{ color: 'var(--ixl-text)' }}
                >
                  <option value="">Select subject...</option>
                  <option value="math">Math</option>
                  <option value="ela">ELA</option>
                  <option value="njsla-math">NJSLA Math</option>
                  <option value="njsla-ela">NJSLA ELA</option>
                  <option value="njsla-science">NJSLA Science</option>
                  <option value="njgpa-math">NJGPA Math</option>
                  <option value="njgpa-ela">NJGPA ELA</option>
                </select>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--ixl-text)' }}>
                Grade Level
              </label>
              <div className="flex gap-3">
                <select
                  value={gradeLevel || ''}
                  onChange={(e) => e.target.value && handleGradeChange(e.target.value)}
                  className="input-field flex-1 px-4 py-3 rounded-xl text-base font-medium transition-all"
                  style={{ color: 'var(--ixl-text)' }}
                  disabled={!subject}
                >
                  <option value="">Select grade...</option>
                  {subject && getAvailableGrades(subject).map(grade => (
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
                  disabled={!subject || !gradeLevel}
                >
                  Sync
                </button>
              </div>
            </div>

            <SkillsSelector
              skills={skills}
              isLoading={isLoadingSkills}
              selectedSkillIds={selectedSkillIds}
              onSelectionChange={setSelectedSkillIds}
            />

            <div className="mb-6 flex flex-col">
              <label className="text-sm font-semibold mb-3" style={{ color: 'var(--ixl-text)' }}>
                Action Mode
              </label>
              <select
                value={actionMode}
                onChange={(e) => setActionMode(e.target.value)}
                className="input-field w-full px-4 py-3 rounded-xl text-base font-medium transition-all"
                style={{ color: 'var(--ixl-text)' }}
              >
                <option value="suggest">Suggest</option>
                <option value="stop_suggesting">Stop Suggesting</option>
              </select>
              <p className="text-xs mt-2" style={{ color: 'var(--ixl-gray-dark)' }}>
                {actionMode === 'suggest'
                  ? 'Skills will be suggested to the student (star selected)'
                  : 'Skills will be un-suggested from the student (star deselected)'}
              </p>
            </div>

            <button
              onClick={handleAssign}
              disabled={selectedStudentIds.length === 0 || selectedSkillIds.length === 0}
              className="btn-ink w-full py-5 rounded-xl font-semibold text-lg tracking-wide"
            >
              Add to Queue
            </button>

            {((queueData?.queue?.length || 0) > 0 || (queueData?.allTasks?.length || 0) > 0) && (
              <div className="mt-8 p-6 rounded-xl" style={{
                background: 'linear-gradient(135deg, rgba(139, 197, 63, 0.08) 0%, rgba(139, 197, 63, 0.04) 100%)',
                border: '1.5px solid rgba(139, 197, 63, 0.2)'
              }}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold text-lg" style={{ color: 'var(--ixl-text)' }}>
                    Assignment Queue
                  </h3>
                  <button
                    onClick={handleAbort}
                    className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-80"
                    style={{
                      background: 'rgba(220, 38, 38, 0.1)',
                      color: '#dc2626',
                      border: '1.5px solid rgba(220, 38, 38, 0.2)'
                    }}
                  >
                    Abort All
                  </button>
                </div>

                {(queueData?.allTasks || []).filter(t => t.status === 'processing').map(task => (
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

                {(queueData?.queue || []).map((task, index) => (
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

            <div className="space-y-4">
              {getGroupedHistory().length === 0 ? (
                <div className="p-12 text-center" style={{ color: 'var(--ixl-gray-dark)' }}>
                  <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0h8v12H6V4z" clipRule="evenodd" />
                  </svg>
                  <p className="font-medium text-lg">No history found</p>
                  <p className="text-sm mt-2">Assignments you create will appear here in batches.</p>
                </div>
              ) : (
                getGroupedHistory().map((batch) => {
                  const isExpanded = expandedBatches.has(batch.id);

                  // Helper to render a Student row (used in both Group and Individual contexts)
                  const renderStudentRow = (student, keyPrefix) => {
                    const successCount = student.items.filter(i => i.status === 'completed').length;
                    const failCount = student.items.length - successCount;
                    const hasFailures = failCount > 0;

                    return (
                      <div key={`${keyPrefix}-${student.id}`} className="ml-4 border-l-2 pl-3 py-1" style={{ borderColor: 'var(--ixl-gray)' }}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ background: hasFailures ? '#ef4444' : 'var(--ixl-green)' }}
                            />
                            <span className="font-medium">{student.name}</span>
                          </div>
                          <span className="text-xs text-gray-500">{student.items.length} skills</span>
                        </div>
                        <div className="space-y-1">
                          {student.items.map(item => (
                            <div key={item.id} className="flex items-center gap-2 text-xs text-gray-600 ml-4">
                              <span style={{ color: item.status === 'completed' ? 'var(--ixl-green-dark)' : '#ef4444' }}>
                                {item.status === 'completed' ? '✓' : '✗'}
                              </span>
                              <span>{item.skill_name}</span>
                              {item.error_message && (
                                <span className="text-red-400" title={item.error_message}>
                                  ({item.error_message})
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  };

                  return (
                    <div key={batch.id} className="rounded-lg border bg-white shadow-sm overflow-hidden" style={{ borderColor: 'var(--ixl-gray)' }}>
                      {/* Batch Header */}
                      <div className="p-3 bg-gray-50 flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => toggleBatch(batch.id)}>
                        <div className="flex items-center gap-3">
                          <div className="bg-blue-100 text-blue-700 p-1.5 rounded-md">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-gray-800">
                              {batch.date.toLocaleDateString()} at {batch.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div className="text-xs text-gray-500">
                              {batch.totalSkills} skills assigned • {batch.groups.length > 0 ? `${batch.groups.length} groups` : ''} {batch.individuals.length > 0 ? `${batch.individuals.length} students` : ''}
                            </div>
                          </div>
                        </div>
                        <button className="text-gray-400 hover:text-gray-600">
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="p-3 space-y-3 bg-white">
                          {/* Groups */}
                          {batch.groups.map(group => (
                            <div key={group.name} className="border rounded-md p-2 border-dashed" style={{ borderColor: 'var(--ixl-green-light)' }}>
                              <div className="flex items-center gap-2 mb-2 font-medium text-sm text-gray-700">
                                <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded">Group</span>
                                {group.name}
                                <span className="text-xs text-gray-400 font-normal">({group.students.length} students)</span>
                              </div>
                              <div className="space-y-2">
                                {group.students.map(student => renderStudentRow(student, `grp-${batch.id}-${group.name}`))}
                              </div>
                            </div>
                          ))}

                          {/* Individual Students */}
                          {batch.individuals.length > 0 && (
                            <div className="space-y-2">
                              {batch.individuals.map(student => renderStudentRow(student, `ind-${batch.id}`))}
                            </div>
                          )}
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
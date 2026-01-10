let apiPort = 3001;

// Initialize port from Electron bridge if available
if (window.electron && window.electron.getApiPort) {
  window.electron.getApiPort().then(port => {
    apiPort = port;
    console.log(`Frontend API using port: ${apiPort}`);
  });
}

const getUrl = (path) => `http://localhost:${apiPort}/api${path}`;

export const api = {
  async login(username, password) {
    const res = await fetch(getUrl('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    return res.json();
  },

  async getAuthStatus() {
    const res = await fetch(getUrl('/auth/status'));
    return res.json();
  },

  async syncStudents() {
    const res = await fetch(getUrl('/sync/students'), {
      method: 'POST'
    });
    return res.json();
  },

  async syncSkills(gradeLevel = '8', subject = 'math') {
    const res = await fetch(getUrl('/sync/skills'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gradeLevel, subject })
    });
    return res.json();
  },

  async getStudents() {
    const res = await fetch(getUrl('/students'));
    return res.json();
  },

  async getSkills(gradeLevel, subject = 'math') {
    let path = `/skills?subject=${subject}`;
    if (gradeLevel) {
      path += `&gradeLevel=${gradeLevel}`;
    }
    const res = await fetch(getUrl(path));
    return res.json();
  },

  async assignSkills(studentId, skillIds, action = 'suggest') {
    const res = await fetch(getUrl('/assign'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, skillIds, action })
    });
    return res.json();
  },

  async getAssignmentStatus(taskId) {
    const res = await fetch(getUrl(`/assign/${taskId}/status`));
    return res.json();
  },

  async getHistory(studentId, limit = 100) {
    const path = studentId
      ? `/history?studentId=${studentId}&limit=${limit}`
      : `/history?limit=${limit}`;
    const res = await fetch(getUrl(path));
    return res.json();
  },

  async getQueue() {
    const res = await fetch(getUrl('/queue'));
    return res.json();
  },

  async updateStudentDefaults(studentId, gradeLevel, subject) {
    const res = await fetch(getUrl(`/students/${studentId}/defaults`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gradeLevel, subject })
    });
    return res.json();
  },

  async abortTasks() {
    const res = await fetch(getUrl('/abort'), {
      method: 'POST'
    });
    return res.json();
  }
};

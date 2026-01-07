const API_URL = 'http://localhost:3001/api';

export const api = {
  async login(username, password) {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    return res.json();
  },

  async getAuthStatus() {
    const res = await fetch(`${API_URL}/auth/status`);
    return res.json();
  },

  async syncStudents() {
    const res = await fetch(`${API_URL}/sync/students`, {
      method: 'POST'
    });
    return res.json();
  },

  async syncSkills(gradeLevel = '8') {
    const res = await fetch(`${API_URL}/sync/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gradeLevel })
    });
    return res.json();
  },

  async getStudents() {
    const res = await fetch(`${API_URL}/students`);
    return res.json();
  },

  async getSkills(gradeLevel) {
    const url = gradeLevel 
      ? `${API_URL}/skills?gradeLevel=${gradeLevel}`
      : `${API_URL}/skills`;
    const res = await fetch(url);
    return res.json();
  },

  async assignSkills(studentId, skillIds) {
    const res = await fetch(`${API_URL}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, skillIds })
    });
    return res.json();
  },

  async getAssignmentStatus(taskId) {
    const res = await fetch(`${API_URL}/assign/${taskId}/status`);
    return res.json();
  },

  async getHistory(studentId, limit = 100) {
    const url = studentId 
      ? `${API_URL}/history?studentId=${studentId}&limit=${limit}`
      : `${API_URL}/history?limit=${limit}`;
    const res = await fetch(url);
    return res.json();
  },

  async getQueue() {
    const res = await fetch(`${API_URL}/queue`);
    return res.json();
  }
};

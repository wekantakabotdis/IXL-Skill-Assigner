const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { g3, g4 } = require('./fixtures.cjs');
const { validateSkill, snapshotSelection, assertCatalogPage } = require('../backend/automation/skillIdentity');
const IXLBrowser = require('../backend/automation/browser');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ixl-safety-'));
process.env.IXL_DATA_DIR = dataDir;
process.env.IXL_NO_LISTEN = '1';
const db = require('../backend/database/db');
const app = require('../backend/server');
after(() => { db.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

function request(route, body = {}, query = {}) {
  const layer = app._router.stack.find(layer => layer.route?.path === route);
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { resolve({ status: this.statusCode, data }); } };
    Promise.resolve(layer.route.stack[0].handle({ body, query, params: {} }, res)).catch(reject);
  });
}

test('cross-grade URLs and unexpected pages are rejected; plan cross-grade links remain valid', () => {
  assert.throws(() => validateSkill({ ...g4[0], gradeLevel: '3' }, '3', 'math'), /URL/);
  assert.throws(() => assertCatalogPage('https://www.ixl.com/math/grade-4', '3', 'math'), /Catalog mismatch/);
  assert.doesNotThrow(() => validateSkill({ ...g4[0], gradeLevel: '5', subject: 'njsla-math' }, '5', 'njsla-math'));
});

test('catalog refresh preserves row IDs and history and retires missing skills', () => {
  db.switchUser('history-fixture');
  db.replaceSkills(g3, '3', 'math');
  const before = db.getSkills('3', 'math');
  const studentId = db.addStudent('fixture', 'Test Student', '').lastInsertRowid;
  db.recordAssignment(studentId, before[1].id, 'completed');
  db.replaceSkills([g3[0]], '3', 'math');
  assert.equal(db.getSkills('3', 'math')[0].id, before[0].id);
  assert.equal(db.getAssignmentHistory().length, 1);
  assert.equal(db.getAssignmentHistory()[0].skill_name, g3[1].name);
  assert.throws(() => snapshotSelection(db.getSkillsByIds([before[1].id]), [before[1].id], '3', 'math'), /outdated/);
  assert.throws(() => db.replaceSkills([{ ...g4[0], gradeLevel: '3' }], '3', 'math'), /URL/);
  assert.equal(db.getSkills('3', 'math')[0].id, before[0].id);
});

test('API refuses missing scope, wrong-grade IDs, inactive IDs, and contaminated cache', async () => {
  db.switchUser('validation-fixture');
  const studentId = Number(db.addStudent('fixture', 'Test Student', '').lastInsertRowid);
  db.replaceSkills(g3, '3', 'math');
  db.replaceSkills(g4, '4', 'math');
  app.browser.isLoggedIn = true;
  const skill = db.getSkills('4', 'math')[0];
  const third = db.getSkills('3', 'math');
  assert.equal((await request('/api/assign', { studentIds: [studentId], skillIds: [skill.id] })).status, 400);
  assert.equal((await request('/api/assign', { studentIds: [studentId], skillIds: [skill.id], gradeLevel: '3', subject: 'math' })).status, 400);
  assert.equal((await request('/api/assign', { studentIds: [studentId], skillIds: [99999], gradeLevel: '3', subject: 'math' })).status, 400);
  assert.equal((await request('/api/assign', { studentIds: [studentId], skillIds: [third[0].id, skill.id], gradeLevel: '3', subject: 'math' })).status, 400);
  db.replaceSkills([g3[0]], '3', 'math');
  assert.equal((await request('/api/assign', { studentIds: [studentId], skillIds: [third[1].id], gradeLevel: '3', subject: 'math' })).status, 400);
  db.userDb.prepare('UPDATE skills SET grade_level = ? WHERE id = ?').run('3', skill.id);
  const cached = await request('/api/skills', {}, { gradeLevel: '3', subject: 'math' });
  assert.equal(cached.status, 409);
  assert.equal(cached.data.code, 'CATALOG_MISMATCH');
});

test('queued selection retains order and identity through refresh, with history matched by identity', async () => {
  db.switchUser('queue-fixture');
  const studentId = Number(db.addStudent('fixture', 'Test Student', '').lastInsertRowid);
  db.replaceSkills(g3, '3', 'math');
  const rows = db.getSkills('3', 'math');
  const ids = rows.map(row => row.id).reverse();
  let release;
  const original = app.browser.withPage;
  app.browser.withPage = () => new Promise(resolve => { release = resolve; });
  const result = await request('/api/assign', { studentIds: [studentId], skillIds: ids, gradeLevel: '3', subject: 'math' });
  assert.equal(result.status, 200);
  const queue = await request('/api/queue');
  const task = queue.data.allTasks.find(task => task.id === result.data.taskId);
  assert.deepEqual(task.skills.map(skill => skill.id), ids);
  db.replaceSkills([g3[0]], '3', 'math');
  assert.equal(task.skills[0].name, g3[1].name);
  release(task.skills.map(skill => ({ studentName: 'Test Student', skillId: skill.id, dataSkillId: skill.ixl_id, skillCode: skill.skill_code, success: true })));
  await new Promise(resolve => setImmediate(resolve));
  app.browser.withPage = original;
  assert.equal(db.getAssignmentHistory().length, 2);
  assert.deepEqual(new Set(db.getAssignmentHistory().map(row => row.skill_id)), new Set(ids));
});

test('abort cancels active and queued tasks without writing late success history', async () => {
  db.switchUser('abort-fixture');
  const studentId = Number(db.addStudent('fixture', 'Test Student', '').lastInsertRowid);
  db.replaceSkills(g3, '3', 'math');
  const skill = db.getSkills('3', 'math')[0];
  const body = { studentIds: [studentId], skillIds: [skill.id], gradeLevel: '3', subject: 'math' };
  app.browser.isLoggedIn = true;
  let release;
  const original = app.browser.withPage;
  app.browser.withPage = () => new Promise(resolve => { release = resolve; });
  const active = await request('/api/assign', body);
  const queued = await request('/api/assign', body);
  await request('/api/abort');
  release([{ studentName: 'Test Student', skillId: skill.id, dataSkillId: skill.ixl_id, success: true }]);
  await new Promise(resolve => setImmediate(resolve));
  app.browser.withPage = original;
  const queue = await request('/api/queue');
  for (const id of [active.data.taskId, queued.data.taskId]) {
    assert.equal(queue.data.allTasks.find(task => task.id === id).status, 'aborted');
  }
  assert.equal(db.getAssignmentHistory().length, 0);
});

test('logout prevents a previous session from recording late assignment results', async () => {
  db.switchUser('logout-fixture');
  const studentId = Number(db.addStudent('fixture', 'Test Student', '').lastInsertRowid);
  db.replaceSkills(g3, '3', 'math');
  const skill = db.getSkills('3', 'math')[0];
  app.browser.isLoggedIn = true;
  let release;
  const original = app.browser.withPage;
  app.browser.withPage = () => new Promise(resolve => { release = resolve; });
  const active = await request('/api/assign', { studentIds: [studentId], skillIds: [skill.id], gradeLevel: '3', subject: 'math' });
  await request('/api/auth/logout');
  release([{ studentName: 'Test Student', skillId: skill.id, dataSkillId: skill.ixl_id, success: true }]);
  await new Promise(resolve => setImmediate(resolve));
  app.browser.withPage = original;
  const queue = await request('/api/queue');
  assert.equal(queue.data.allTasks.find(task => task.id === active.data.taskId).status, 'aborted');
  assert.equal(app.browser.isAuthenticated(), false);
  db.switchUser('logout-fixture');
  assert.equal(db.getAssignmentHistory().length, 0);
});

test('isolated operation pages close on success, failure, and abort', async () => {
  const browser = new IXLBrowser();
  const created = [];
  browser.isLoggedIn = true;
  browser.context = { async newPage() { const page = { closed: false, setDefaultTimeout() {}, async close() { this.closed = true; } }; created.push(page); return page; } };
  let release;
  const running = browser.withPage(page => new Promise(resolve => { release = () => resolve(page); }));
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(browser.withPage(async () => { throw new Error('sync failed'); }), /sync failed/);
  assert.equal(created[0].closed, false);
  assert.equal(created[1].closed, true);
  await browser.closeOperationPages();
  release();
  await running;
  assert.equal(created[0].closed, true);
  assert.equal(browser.operationPages.size, 0);
  await browser.withPage(async () => 'ok');
  assert.equal(created[2].closed, true);
});

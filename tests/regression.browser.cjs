const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { g3, g4, catalogHtml } = require('./fixtures.cjs');
const { assignMultipleSkills } = require('../backend/automation/assigner');
const { scrapeSkills, scrapeNJSLASkills } = require('../backend/automation/scraper');
const IXLBrowser = require('../backend/automation/browser');
let browser, vite, devUrl;

before(async () => {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const { createServer } = await import('vite');
  vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  await vite.listen();
  devUrl = `http://127.0.0.1:${vite.httpServer.address().port}`;
});
after(async () => { await vite?.close(); await browser?.close(); });

function assignmentSkills(skills) {
  return skills.map((skill, index) => ({ ...skill, id: index + 1, dataSkillId: skill.ixlId }));
}
async function catalogContext(transform = value => value) {
  const context = await browser.newContext();
  await context.route('https://www.ixl.com/**', route => {
    const skills = route.request().url().includes('/grade-4') ? g4 : g3;
    return route.fulfill({ contentType: 'text/html', body: transform(catalogHtml(skills)) });
  });
  return context;
}

test('G3 EE.1 and EE.2 select the exact IDs and confirm target suggestion states', async () => {
  const context = await catalogContext();
  try {
    const page = await context.newPage();
    const results = await assignMultipleSkills(page, assignmentSkills(g3), '3', 'suggest', null, 'math', null, false, { students: ['Test Student'], classes: [] });
    assert.equal(results.length, 2);
    assert.ok(results.every(result => result.success));
    assert.deepEqual(results.map(result => result.dataSkillId), g3.map(skill => skill.ixlId));
    // Each skill has an independent target suggestion state.
    assert.equal(await page.evaluate(() => window.clickCount), 2);
  } finally { await context.close(); }
});

test('matching codes with wrong live IDs cause failures without a target click', async () => {
  const context = await catalogContext(html => html.replaceAll('data-skill="200000178', 'data-skill="wrong-'));
  try {
    const page = await context.newPage();
    const results = await assignMultipleSkills(page, assignmentSkills(g3), '3', 'suggest', null, 'math', null, false, { students: ['Test Student'], classes: [] });
    assert.ok(results.every(result => !result.success && /identity mismatch/.test(result.error)));
    assert.equal(await page.evaluate(() => window.clickCount), 0);
  } finally { await context.close(); }
});

test('simultaneous G3 assignment and G3/G4 syncs remain on their own pages', async () => {
  const context = await catalogContext();
  const worker = new IXLBrowser();
  worker.context = context;
  worker.isLoggedIn = true;
  try {
    const [third, fourth, assigned] = await Promise.all([
      worker.withPage(page => scrapeSkills(page, '3', 'math')),
      worker.withPage(page => scrapeSkills(page, '4', 'math')),
      worker.withPage(page => assignMultipleSkills(page, assignmentSkills(g3), '3', 'suggest', null, 'math', null, false, { students: ['Test Student'], classes: [] }))
    ]);
    assert.deepEqual(third.map(skill => skill.ixlId), g3.map(skill => skill.ixlId));
    assert.deepEqual(fourth.map(skill => skill.ixlId), g4.map(skill => skill.ixlId));
    assert.ok(assigned.every(result => result.success));
    assert.equal(worker.operationPages.size, 0);
    assert.equal(context.pages().length, 0);
  } finally { await context.close(); }
});

test('a G4 document scraped as G3 is rejected before cache writes', async () => {
  const context = await catalogContext(() => catalogHtml(g4));
  try {
    const page = await context.newPage();
    await assert.rejects(scrapeSkills(page, '3', 'math'), /Skill URL does not match/);
  } finally { await context.close(); }
});

test('plan assignment permits an exact-ID link to another grade', async () => {
  const context = await catalogContext(() => catalogHtml([g4[0]]));
  try {
    const page = await context.newPage();
    const results = await assignMultipleSkills(page, assignmentSkills([g4[0]]), '5', 'suggest', null, 'njsla-math', null, false, { students: ['Test Student'], classes: [] });
    assert.equal(results[0].success, true);
    assert.equal(results[0].dataSkillId, g4[0].ixlId);
  } finally { await context.close(); }
});

test('current skill-plan layout deduplicates hidden links and assigns the visible cross-grade skill', async () => {
  const context = await catalogContext(() => catalogHtml(g4, { modernPlan: true, hiddenDuplicate: true }));
  try {
    const page = await context.newPage();
    const skills = await scrapeNJSLASkills(page, '5', 'njsla-math');
    assert.deepEqual(skills.map(skill => skill.skillCode), ['A.1', 'A.2']);
    assert.deepEqual(skills.map(skill => skill.ixlId), g4.map(skill => skill.ixlId));
    const results = await assignMultipleSkills(page, assignmentSkills(skills), '5', 'suggest', null, 'njsla-math', null, false, { students: ['Test Student'], classes: [] });
    assert.equal(results.length, 2);
    assert.ok(results.every(result => result.success));
    assert.equal(await page.evaluate(() => window.clickCount), 2);
  } finally { await context.close(); }
});

async function devWorkspace({ holdDefaults = false } = {}) {
  const context = await browser.newContext();
  const data = { hold4: false, held4: [], defaults: [], holdDefaults, posts: [], skillRequests: [] };
  const records = skills => skills.map((skill, index) => ({ ...skill, id: Number(skill.gradeLevel) * 100 + index }));
  await context.route('http://localhost:3001/api/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
    const respond = body => route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return respond({});
    switch (url.pathname) {
      case '/api/accounts': case '/api/groups': case '/api/history': return respond([]);
      case '/api/auth/login': return respond({ success: true });
      case '/api/students': return respond([{ id: 1, name: 'Test Student' }]);
      case '/api/students/common-defaults':
        if (data.holdDefaults) { data.defaults.push(respond); return; }
        return respond({ subject: null, gradeLevel: null });
      case '/api/skills': {
        const grade = url.searchParams.get('gradeLevel');
        data.skillRequests.push(grade);
        if (grade === '4' && data.hold4) {
          data.held4.push(() => respond(records(g4)));
          data.onHeld4?.();
          return;
        }
        return respond(records(grade === '4' ? g4 : g3));
      }
      case '/api/queue': return respond({ queue: [], allTasks: [] });
      case '/api/assign': data.posts.push(req.postDataJSON()); return respond({ error: 'Test intercepted' });
      default: return respond({ value: null, success: true });
    }
  });
  const page = await context.newPage();
  await page.goto(devUrl);
  await page.getByPlaceholder('IXL Username or Email').fill('fixture');
  await page.getByPlaceholder('IXL Password').fill('fixture');
  await page.getByRole('button', { name: 'Sign in to IXL', exact: true }).click();
  await page.getByPlaceholder('Search students or groups...').fill('Test Student');
  await page.getByText('Test Student', { exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('select').nth(0).selectOption('math');
  return { context, page, data };
}

test('late G4 response cannot replace G3 skills or submit G4 IDs', async () => {
  const { context, page, data } = await devWorkspace();
  try {
    await page.locator('select').nth(1).selectOption('3');
    await page.getByText('EE.1 - Identify equations', { exact: true }).waitFor();
    data.hold4 = true;
    const held = new Promise(resolve => { data.onHeld4 = resolve; });
    await page.locator('select').nth(1).selectOption('4');
    await held;
    assert.equal(await page.getByRole('button', { name: 'Add to Queue', exact: true }).isDisabled(), true);
    await page.waitForFunction(() => document.body.innerText.includes('Loading skills'));
    await page.locator('select').nth(1).selectOption('3');
    await page.getByText('EE.1 - Identify equations', { exact: true }).waitFor();
    assert.equal(data.held4.length, 1);
    for (const release of data.held4) await release();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('select').nth(1).inputValue(), '3');
    assert.equal(await page.getByText('EE.1 - Find the mode', { exact: true }).count(), 0);
    await page.getByText('EE.1 - Identify equations', { exact: true }).click();
    await page.getByTitle('Move Selected Right', { exact: true }).click();
    await page.getByRole('button', { name: 'Add to Queue', exact: true }).click();
    await page.waitForTimeout(100);
    assert.deepEqual(data.posts[0].skillIds, [300]);
    assert.equal(data.posts[0].gradeLevel, '3');
    assert.equal(data.posts[0].subject, 'math');
  } finally { await context.close(); }
});

test('late student defaults cannot override a manually chosen grade', async () => {
  const workspace = await devWorkspace({ holdDefaults: true });
  const { page, data } = workspace;
  try {
    await page.locator('select').nth(0).selectOption('math');
    await page.locator('select').nth(1).selectOption('3');
    await page.getByText('EE.1 - Identify equations', { exact: true }).waitFor();
    assert.equal(data.defaults.length, 1);
    for (const respond of data.defaults) await respond({ subject: 'math', gradeLevel: '4' });
    await page.waitForTimeout(100);
    assert.equal(await page.locator('select').nth(1).inputValue(), '3');
    assert.equal(await page.getByText('EE.1 - Find the mode', { exact: true }).count(), 0);
  } finally { await workspace.context.close(); }
});

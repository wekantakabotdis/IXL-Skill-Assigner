const { catalogUrl, canonicalUrl, assertCatalogPage, validateSkill, isPlanSubject } = require('./skillIdentity');

async function waitForSkills(page, isPlanBased) {
  const selector = isPlanBased ? 'a.skill-tree-skill-link, a.skill-link[data-skill]' : 'a.skill-tree-skill-link';
  await page.waitForFunction(selector => [...document.querySelectorAll(selector)]
    .some(link => link.getClientRects().length && getComputedStyle(link).visibility !== 'hidden'), selector, { timeout: 15000 });
}

/**
 * Select a class in the dropdown (for accounts with classes)
 */
async function selectClassInDropdown(page, className, action = 'suggest') {
  console.log(`Searching for class "${className}" in dropdown...`);

  // Escape special regex characters in the class name
  const escapedClassName = className.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

  // Look for the class entry directly (classes appear at the top of the dropdown)
  // Use a more flexible match that looks for the class name anywhere in the row
  const classRow = page.locator('li.entry-row, div.entry-row').filter({
    hasText: new RegExp(escapedClassName, 'i')
  }).first();

  if (await classRow.isVisible()) {
    console.log(`Found class "${className}", checking star state...`);
    const starInRow = classRow.locator('.suggestion-toggle-icon').first();

    if (await starInRow.count() && await starInRow.isVisible()) {
      const state = await getStarState(starInRow);
      console.log(`Star state for class "${className}": ${state}`);

      if (action === 'suggest' && state === 'suggested') {
        console.log(`Class "${className}" already fully suggested — skipping`);
      } else if (action === 'stop_suggesting' && state === 'not-suggested') {
        console.log(`Class "${className}" already not suggested — skipping`);
      } else if (action === 'stop_suggesting' && state === 'half-suggested') {
        // partial→full (click 1), then full→empty (click 2)
        console.log(`Class "${className}" is partially suggested — clicking twice to unsuggest...`);
        await starInRow.click();
        await page.waitForTimeout(300);
        await starInRow.click();
        await page.waitForTimeout(300);
      } else {
        // suggest (empty/partial → full): 1 click
        // stop_suggesting (full → empty): 1 click
        console.log(`Clicking star for class "${className}" to ${action}...`);
        await starInRow.click();
        await page.waitForTimeout(300);
      }
      await verifyStarState(page, starInRow, action);
      return [{ studentName: className, success: true, isClass: true }];
    }
  }

  console.log(`Class "${className}" not found in dropdown`);
  return [{ studentName: className, success: false, error: 'Class not found in dropdown', isClass: true }];
}

/**
 * Get the star state: 'suggested', 'half-suggested', or 'not-suggested'
 */
async function getStarState(starElement) {
  return await starElement.evaluate(el => {
    if (el.classList.contains('suggested')) return 'suggested';
    if (el.classList.contains('half-suggested')) return 'half-suggested';
    return 'not-suggested';
  });
}

async function verifyStarState(page, star, action) {
  const expected = action === 'suggest' ? 'suggested' : 'not-suggested';
  for (let attempt = 0; attempt < 15; attempt++) {
    if (await getStarState(star) === expected) return;
    await page.waitForTimeout(200);
  }
  throw new Error('IXL did not confirm the requested suggestion state');
}

/**
 * Expand "All students" section for accounts with classes
 */
async function expandAllStudents(page) {
  console.log('Looking for "All students" row to expand...');

  // Find the "All students" row with the arrow
  const allStudentsRow = page.locator('li.entry-row, div.entry-row').filter({ hasText: /All students/i }).first();

  if (await allStudentsRow.isVisible()) {
    // Check if it has an arrow indicating it can be expanded
    const hasArrow = await allStudentsRow.locator('.next-icon, .arrow, svg').count() > 0;

    if (hasArrow) {
      console.log('Hovering over "All students" to expand individual students...');
      await allStudentsRow.hover();
      await page.waitForTimeout(500); // Wait for submenu to appear
      return true;
    }
  }

  console.log('"All students" row not found or already expanded');
  return false;
}

/**
 * Select individual students in dropdown
 * @param hasClasses - if true, need to expand "All students" first
 */
async function selectStudentsInDropdown(page, studentNames, action = 'suggest', hasClasses = false) {
  console.log(`Searching for students [${studentNames.join(', ')}] in dropdown... (hasClasses: ${hasClasses})`);

  // If account has classes, we need to hover over "All students" first
  if (hasClasses) {
    await expandAllStudents(page);
  }

  const dropdownContent = page.locator('.suggested-skills-modal ul.entries').first();
  const results = [];
  const foundStudents = new Set();

  // Scroll and find students
  for (let scrollAttempt = 0; scrollAttempt < 25; scrollAttempt++) {
    const remainingStudents = studentNames.filter(name => !foundStudents.has(name));
    if (remainingStudents.length === 0) break;

    for (const name of remainingStudents) {
      const matchingRows = page.locator('li.entry-row').filter({ has: page.getByText(name, { exact: true }) });
      if (await matchingRows.count() > 1) throw new Error(`Multiple students named ${name}; cannot safely select a target`);
      const studentRow = matchingRows.first();
      if (await studentRow.isVisible()) {
        console.log(`Found "${name}", checking star state...`);
        const starInRow = studentRow.locator('.suggestion-toggle-icon').first();

        if (await starInRow.count() && await starInRow.isVisible()) {
          const state = await getStarState(starInRow);
          console.log(`Star state for "${name}": ${state}`);

          if (action === 'suggest' && state === 'suggested') {
            console.log(`"${name}" already suggested — skipping`);
          } else if (action === 'stop_suggesting' && state === 'not-suggested') {
            console.log(`"${name}" already not suggested — skipping`);
          } else if (action === 'stop_suggesting' && state === 'half-suggested') {
            console.log(`"${name}" is partially suggested — clicking twice to unsuggest...`);
            await starInRow.click();
            await page.waitForTimeout(200);
            await starInRow.click();
            await page.waitForTimeout(200);
          } else {
            console.log(`Clicking star for "${name}" to ${action}...`);
            await starInRow.click();
            await page.waitForTimeout(200);
          }
          await verifyStarState(page, starInRow, action);
          results.push({ studentName: name, success: true });
        } else {
          throw new Error(`Suggestion control not found for ${name}`);
        }
        foundStudents.add(name);
      }
    }

    if (foundStudents.size < studentNames.length && await dropdownContent.count()) {
      await dropdownContent.evaluate(el => el.scrollTop += 120);
      await page.waitForTimeout(50);
    }
  }

  // Record failures for students not found
  studentNames.forEach(name => {
    if (!foundStudents.has(name)) {
      results.push({ studentName: name, success: false, error: 'Student not found in dropdown' });
    }
  });

  return results;
}

async function checkDropdownVisible(page) {
  const check = async () => {
    const hasModal = await page.locator('.suggested-skills-modal').isVisible().catch(() => false);
    const hasText = await page.locator('text="Suggest this skill to"').isVisible().catch(() => false);
    return hasModal || hasText;
  };

  let visible = await check();
  if (!visible) {
    await page.waitForTimeout(1200);
    visible = await check();
  }
  return visible;
}

async function getSuggestionIcon(skillNode, dataSkillId) {
  const icons = skillNode.locator('.suggestion-toggle-icon');
  if (await icons.count() === 1) {
    const icon = icons.first();
    const id = await icon.getAttribute('data-skill');
    if (!id || id === dataSkillId) return icon;
  }
  const visible = [];
  for (const icon of await icons.all()) {
    if (!await icon.isVisible()) continue;
    const id = await icon.getAttribute('data-skill');
    if (id === dataSkillId) return icon;
    if (!id) visible.push(icon);
  }
  if (visible.length === 1) return visible[0];
  throw new Error('No unambiguous suggestion control for the requested skill');
}

async function assignSkill(page, skillData, action = 'suggest', isPlanBased = false, hasClasses = false, targets = { classes: [], students: [] }) {
  const { skillCode, dataSkillId } = skillData;
  console.log(`Processing skill ${skillCode}...`);

  try {
    validateSkill(skillData, skillData.gradeLevel, skillData.subject);
    const verifyIdentity = async () => {
      assertCatalogPage(page.url(), skillData.gradeLevel, skillData.subject);
      const links = page.locator(isPlanBased ? 'a.skill-tree-skill-link, a.skill-link[data-skill]' : 'a.skill-tree-skill-link');
      const candidates = await links.evaluateAll((elements, expected) => elements
        .map((el, index) => ({ index, id: el.getAttribute('data-skill'), url: el.href }))
        .filter(link => link.url.split(/[?#]/)[0].replace(/\/$/, '') === expected.url &&
          (expected.synthetic || link.id === expected.id)), {
          id: dataSkillId,
          url: canonicalUrl(skillData.url),
          synthetic: isPlanBased && dataSkillId.startsWith('njsla-')
        });
      if (!candidates.length) throw new Error(`Skill identity mismatch for ${skillCode}. Refresh skills and retry.`);
      let link;
      for (const candidate of candidates) {
        const match = links.nth(candidate.index);
        if (await match.isVisible()) { link = match; break; }
      }
      if (!link) throw new Error(`No visible skill link for ${skillCode}`);
      // The enclosing row owns this skill's suggestion control, including responsive plan rows.
      const skillNode = link.locator('xpath=ancestor::*[self::li or self::tr or contains(concat(" ", normalize-space(@class), " "), " skill-node ")][1]');
      const actual = await link.evaluate(el => ({ id: el.getAttribute('data-skill'), url: el.href }));
      const icon = await getSuggestionIcon(skillNode, actual.id);
      if ((!isPlanBased || !dataSkillId.startsWith('njsla-')) && actual.id !== dataSkillId) {
        throw new Error(`Skill identity changed for ${skillCode}`);
      }
      if (canonicalUrl(actual.url) !== canonicalUrl(skillData.url)) throw new Error(`Skill URL changed for ${skillCode}`);
      return { skillNode, icon };
    };
    await waitForSkills(page, isPlanBased);
    const { skillNode, icon } = await verifyIdentity();
    await skillNode.scrollIntoViewIfNeeded();

    await icon.hover();
    const visible = await checkDropdownVisible(page);
    if (!visible) {
      await icon.evaluate(el => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
      if (!await checkDropdownVisible(page)) throw new Error(`Dropdown failed for ${skillCode}`);
    }

    const results = [];

    // 1. Assign to classes
    if (hasClasses && targets.classes && targets.classes.length > 0) {
      for (const className of targets.classes) {
        console.log(`Assigning to IXL class "${className}"...`);
        await verifyIdentity();
        const res = await selectClassInDropdown(page, className, action);
        results.push(...res);
      }
    }

    // 2. Assign to individual students
    if (targets.students && targets.students.length > 0) {
      console.log(`Assigning to individual students...`);
      await verifyIdentity();
      const res = await selectStudentsInDropdown(page, targets.students, action, hasClasses);
      results.push(...res);
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    return results.map(r => ({ ...r, skillId: skillData.id, dataSkillId, skillUrl: skillData.url, skillCode, success: r.success, error: r.error }));
  } catch (err) {
    console.error(`Error for ${skillCode}: ${err.message}`);
    await page.keyboard.press('Escape').catch(() => { });

    // Create failure results for all targets
    const failedResults = [];
    if (targets.classes) {
      targets.classes.forEach(c => failedResults.push({ studentName: c, isClass: true, skillId: skillData.id, dataSkillId, skillCode, success: false, error: err.message }));
    }
    if (targets.students) {
      targets.students.forEach(s => failedResults.push({ studentName: s, skillId: skillData.id, dataSkillId, skillCode, success: false, error: err.message }));
    }
    return failedResults;
  }
}

async function assignMultipleSkills(page, skillsData, gradeLevel, action = 'suggest', progressCallback, subject = 'math', abortChecker = null, hasClasses = false, targets = { classes: [], students: [] }) {
  const allResults = [];
  const isPlanBased = isPlanSubject(subject);
  const pageUrl = catalogUrl(gradeLevel, subject);
  console.log(`Navigating to ${pageUrl}`);
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForSkills(page, isPlanBased);
  assertCatalogPage(page.url(), gradeLevel, subject);

  for (let i = 0; i < skillsData.length; i++) {
    if (abortChecker && abortChecker()) break;
    const skill = skillsData[i];
    const displayName = isPlanBased ? (skill.skillName || skill.skillCode) : skill.skillCode;
    if (progressCallback) progressCallback({ current: i, total: skillsData.length, currentSkill: displayName });

    const result = await assignSkill(page, { ...skill, gradeLevel, subject }, action, isPlanBased, hasClasses, targets);
    allResults.push(...result);

    if (i < skillsData.length - 1) await page.waitForTimeout(100); // Fixed 100ms instead of humanDelay
  }

  if (progressCallback) progressCallback({ current: skillsData.length, total: skillsData.length, completed: true });
  return allResults;
}

module.exports = { assignMultipleSkills };

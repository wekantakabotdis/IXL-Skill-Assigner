const { humanDelay } = require('./delays');

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
    console.log(`Found class "${className}", clicking star...`);
    const starInRow = classRow.locator('.suggestion-toggle-icon').first();

    if (await starInRow.count() && await starInRow.isVisible()) {
      const isCurrentlySelected = await checkStarState(starInRow);
      const shouldClick = (action === 'suggest' && !isCurrentlySelected) || (action === 'stop_suggesting' && isCurrentlySelected);

      if (shouldClick) {
        console.log(`Clicking star for class "${className}" to ${action}...`);
        await starInRow.click();
        await page.waitForTimeout(300);
      } else {
        console.log(`Star for class "${className}" already in desired state`);
      }
      return [{ studentName: className, success: true, isClass: true }];
    }
  }

  console.log(`Class "${className}" not found in dropdown`);
  return [{ studentName: className, success: false, error: 'Class not found in dropdown', isClass: true }];
}

/**
 * Check if a star icon is currently selected/active
 */
async function checkStarState(starElement) {
  return await starElement.evaluate(el => {
    const hasSelectedClass = el.classList.contains('selected') || el.classList.contains('active') || el.classList.contains('on') || el.classList.contains('suggested');
    const hasAriaPressed = el.getAttribute('aria-pressed') === 'true';
    const parentSelected = el.closest('.entry-row')?.classList.contains('suggested') || el.closest('.entry-row')?.classList.contains('selected');
    const isFilled = el.querySelector('.filled, .active, .on') !== null || el.classList.contains('filled');
    const dataSelected = el.getAttribute('data-selected') === 'true' || el.getAttribute('data-suggested') === 'true';
    return hasSelectedClass || hasAriaPressed || parentSelected || isFilled || dataSelected;
  });
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
      const studentRow = page.locator('li.entry-row').filter({ hasText: name }).first();
      if (await studentRow.isVisible()) {
        console.log(`Found "${name}", checking star state...`);
        const starInRow = studentRow.locator('.suggestion-toggle-icon').first();

        if (await starInRow.count() && await starInRow.isVisible()) {
          const isCurrentlySelected = await checkStarState(starInRow);
          const shouldClick = (action === 'suggest' && !isCurrentlySelected) || (action === 'stop_suggesting' && isCurrentlySelected);

          if (shouldClick) {
            console.log(`Clicking star for "${name}" to ${action}...`);
            await starInRow.click();
            await page.waitForTimeout(200);
          } else {
            console.log(`Star for "${name}" already in desired state (${action})`);
          }
          results.push({ studentName: name, success: true });
        } else {
          console.log(`Star not found for "${name}", clicking row...`);
          await studentRow.click();
          results.push({ studentName: name, success: true });
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

async function getSuggestionIcon(skillNode) {
  let suggestionIcon = skillNode.locator('.suggestion-toggle-icon').first();
  if (!await suggestionIcon.count()) {
    suggestionIcon = skillNode.locator('xpath=ancestor::*[contains(@class, "skill-tree-skill")]//span[contains(@class, "suggestion-toggle-icon")]').first();
  }
  if (!await suggestionIcon.count()) {
    suggestionIcon = skillNode.locator('xpath=ancestor::tr//*[contains(@class, "suggestion")]').first();
  }
  return suggestionIcon;
}

async function assignSkill(page, skillData, studentNames, action = 'suggest', isPlanBased = false, hasClasses = false, groupName = null) {
  const { skillCode, dataSkillId } = skillData;
  console.log(`Processing skill ${skillCode}...`);

  try {
    let skillNode;
    if (isPlanBased) {
      const [sectionLetter, skillNum] = skillCode.split('.');
      let sectionName = sectionLetter === 'R' ? 'Reading' : sectionLetter === 'W' ? 'Writing' : sectionLetter;

      const section = page.locator(`section#section-${sectionName}, section.skill-plan-section`).filter({
        has: page.locator(`.skill-plan-section-description, .skill-plan-section-name, .skill-plan-section-header`).filter({
          hasText: new RegExp(`(Sub-Claim ${sectionLetter}|${sectionName})`, 'i')
        })
      }).first();

      if (dataSkillId && !dataSkillId.startsWith('njsla-')) {
        skillNode = page.locator(`a.skill-tree-skill-link[data-skill="${dataSkillId}"]`).first();
      }

      if (!skillNode || !await skillNode.count()) {
        const nameToFind = skillData.skillName;
        console.log(`Matching NJSLA skill by name "${nameToFind}"...`);
        skillNode = section.locator('a.skill-tree-skill-link').filter({ hasText: nameToFind }).first();
      }

      if (!skillNode || !await skillNode.count()) {
        const allSkillsInSec = await section.locator('a.skill-tree-skill-link').all();
        skillNode = allSkillsInSec[parseInt(skillNum, 10) - 1];
      }
    } else {
      const [cat, num] = skillCode.split('.');
      const isNew = skillCode.includes('new');

      // Wait for skill nodes to appear on the page
      await page.waitForSelector('li.skill-tree-skill-node', { timeout: 10000 });

      // Find the Category Section by looking for the category-code span with "A." etc.
      const categoryCodeSpan = page.locator(`span.category-code`).filter({ hasText: new RegExp(`^\\s*${cat}\\.\\s*$`) }).first();

      if (!await categoryCodeSpan.count()) {
        throw new Error(`Category "${cat}" not found on page`);
      }

      // Navigate to the parent skill-tree-skills-header, then to the sibling ol with skills
      const catSec = categoryCodeSpan.locator('xpath=ancestor::div[contains(@class, "skill-tree-skills-header")]/following-sibling::ol').first();

      if (!await catSec.count()) {
        throw new Error(`Skill list for category "${cat}" not found`);
      }

      console.log(`Found category section for "${cat}"`);

      if (!isNew && !isNaN(parseInt(num, 10))) {
        // Match by skill number
        skillNode = catSec.locator('li.skill-tree-skill-node').filter({
          has: page.locator(`span.skill-tree-skill-number`).filter({ hasText: new RegExp(`^\\s*${num}\\s*$`) })
        }).first();
      } else {
        // For "new" skills: Match by skill name
        const nameToFind = skillData.skillName || skillData.skillNameClean;
        console.log(`Matching skill by name "${nameToFind}" within category "${cat}"...`);
        skillNode = catSec.locator('li.skill-tree-skill-node').filter({
          hasText: new RegExp(`(^|\\s)${nameToFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i')
        }).first();
      }
    }

    if (!skillNode || !await skillNode.count()) throw new Error(`Skill ${skillCode} not found`);

    await skillNode.scrollIntoViewIfNeeded();
    const icon = await getSuggestionIcon(skillNode);
    if (!await icon.count()) throw new Error(`Icon not found for ${skillCode}`);

    await icon.hover();
    const visible = await checkDropdownVisible(page);
    if (!visible) {
      await icon.evaluate(el => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
      if (!await checkDropdownVisible(page)) throw new Error(`Dropdown failed for ${skillCode}`);
    }

    // Determine if we're assigning to a class or individual students
    let dropdownResults;
    if (hasClasses && groupName && groupName !== 'All Students') {
      // Assigning to an IXL class - click the class star directly
      console.log(`Assigning to IXL class "${groupName}"...`);
      dropdownResults = await selectClassInDropdown(page, groupName, action);
    } else {
      // Assigning to individual students
      dropdownResults = await selectStudentsInDropdown(page, studentNames, action, hasClasses);
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    return dropdownResults.map(r => ({ ...r, skillCode, success: r.success, error: r.error }));
  } catch (err) {
    console.error(`Error for ${skillCode}: ${err.message}`);
    await page.keyboard.press('Escape').catch(() => { });
    return studentNames.map(name => ({ studentName: name, skillCode, success: false, error: err.message }));
  }
}

async function assignMultipleSkills(page, skillsData, studentNames, gradeLevel, action = 'suggest', progressCallback, subject = 'math', abortChecker = null, hasClasses = false, groupName = null) {
  const allResults = [];
  const isPlanBased = subject.startsWith('njsla-') || subject.startsWith('njgpa-');

  let pageUrl;
  if (isPlanBased) {
    let baseSub = 'math';
    if (subject.includes('ela')) baseSub = 'ela';
    if (subject.includes('science')) baseSub = 'science';

    if (subject.startsWith('njgpa-')) {
      const urlPath = subject === 'njgpa-ela' ? 'njgpa-english-language-arts' : 'njgpa-math';
      pageUrl = `https://www.ixl.com/${baseSub}/skill-plans/${urlPath}`;
    } else {
      const urlPath = ['algebra-1', 'geometry', 'algebra-2'].includes(gradeLevel) ? `njsla-${gradeLevel}` : `njsla-grade-${gradeLevel}`;
      pageUrl = `https://www.ixl.com/${baseSub}/skill-plans/${urlPath}`;
    }
  } else {
    const gradeUrlMap = { 'pre-k': 'preschool', 'kindergarten': 'kindergarten' };
    pageUrl = `https://www.ixl.com/${subject}/grade-${gradeUrlMap[gradeLevel] || gradeLevel}`;
  }

  console.log(`Navigating to ${pageUrl}`);
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500); // Reduced from 3000

  for (let i = 0; i < skillsData.length; i++) {
    if (abortChecker && abortChecker()) break;
    const skill = skillsData[i];
    const displayName = isPlanBased ? (skill.skillName || skill.skillCode) : skill.skillCode;
    if (progressCallback) progressCallback({ current: i, total: skillsData.length, currentSkill: displayName });

    const skillResults = await assignSkill(page, skill, studentNames, action, isPlanBased, hasClasses, groupName);
    allResults.push(...skillResults);

    if (i < skillsData.length - 1) await page.waitForTimeout(100); // Fixed 100ms instead of humanDelay
  }

  if (progressCallback) progressCallback({ current: skillsData.length, total: skillsData.length, completed: true });
  return allResults;
}

module.exports = { assignMultipleSkills };

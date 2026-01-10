const { humanDelay } = require('./delays');

async function selectStudentsInDropdown(page, studentNames, action = 'suggest') {
  console.log(`Searching for students [${studentNames.join(', ')}] in dropdown...`);

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
          const isCurrentlySelected = await starInRow.evaluate(el => {
            const hasSelectedClass = el.classList.contains('selected') || el.classList.contains('active') || el.classList.contains('on') || el.classList.contains('suggested');
            const hasAriaPressed = el.getAttribute('aria-pressed') === 'true';
            const parentSelected = el.closest('.entry-row')?.classList.contains('suggested') || el.closest('.entry-row')?.classList.contains('selected');
            const isFilled = el.querySelector('.filled, .active, .on') !== null || el.classList.contains('filled');
            const dataSelected = el.getAttribute('data-selected') === 'true' || el.getAttribute('data-suggested') === 'true';
            return hasSelectedClass || hasAriaPressed || parentSelected || isFilled || dataSelected;
          });

          const shouldClick = (action === 'suggest' && !isCurrentlySelected) || (action === 'stop_suggesting' && isCurrentlySelected);

          if (shouldClick) {
            console.log(`Clicking star for "${name}" to ${action}...`);
            await starInRow.click();
            await page.waitForTimeout(200); // Reduced from 500
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
      await dropdownContent.evaluate(el => el.scrollTop += 120); // Increased from 60
      await page.waitForTimeout(50); // Reduced from 100
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

async function assignSkill(page, skillData, studentNames, action = 'suggest', isPlanBased = false) {
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

      // 1. Find the Category Section first
      const headers = await page.locator('.skill-tree-skills-header').all();
      let catSec = null;
      for (const h of headers) {
        const txt = await h.textContent();
        if (txt?.trim().startsWith(`${cat}.`)) {
          catSec = h.locator('xpath=ancestor::div[contains(@class, "skill-tree-category") or @id="category-node"] | ancestor::div[contains(@id, "category")]').first();
          break;
        }
      }

      if (catSec && await catSec.count()) {
        if (!isNew && !isNaN(parseInt(num, 10))) {
          // Try matching by number first for standard skills
          skillNode = catSec.locator('li.skill-tree-skill-node').filter({
            has: page.locator(`span.skill-tree-skill-number:text-is("${num}")`)
          }).first();
        }

        // Fallback or for "new" skills: Try matching by skill name within the category
        if (!skillNode || !await skillNode.count()) {
          const nameToFind = skillData.skillName || skillData.skillNameClean;
          console.log(`Matching skill by name "${nameToFind}" within category "${cat}"...`);
          skillNode = catSec.locator('li.skill-tree-skill-node').filter({ hasText: nameToFind }).first();
        }
      }

      // Final global fallback if section-based search failed
      if (!skillNode || !await skillNode.count()) {
        console.log(`Global fallback for "${skillData.skillName || skillCode}"...`);
        skillNode = page.locator('li.skill-tree-skill-node').filter({ hasText: skillData.skillName }).first();
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

    const dropdownResults = await selectStudentsInDropdown(page, studentNames, action);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100); // Reduced from 500

    return dropdownResults.map(r => ({ ...r, skillCode, success: r.success, error: r.error }));
  } catch (err) {
    console.error(`Error for ${skillCode}: ${err.message}`);
    await page.keyboard.press('Escape').catch(() => { });
    return studentNames.map(name => ({ studentName: name, skillCode, success: false, error: err.message }));
  }
}

async function assignMultipleSkills(page, skillsData, studentNames, gradeLevel, action = 'suggest', progressCallback, subject = 'math', abortChecker = null) {
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

    const skillResults = await assignSkill(page, skill, studentNames, action, isPlanBased);
    allResults.push(...skillResults);

    if (i < skillsData.length - 1) await page.waitForTimeout(100); // Fixed 100ms instead of humanDelay
  }

  if (progressCallback) progressCallback({ current: skillsData.length, total: skillsData.length, completed: true });
  return allResults;
}

module.exports = { assignMultipleSkills };

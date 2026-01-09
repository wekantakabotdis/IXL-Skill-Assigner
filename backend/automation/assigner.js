const { humanDelay } = require('./delays');

async function assignSkillFromNJSLAPage(page, skillData, studentName, action = 'suggest') {
  try {
    const { skillCode, dataSkillId } = skillData;
    const actionVerb = action === 'suggest' ? 'Suggesting' : 'Un-suggesting';
    console.log(`${actionVerb} NJSLA skill ${skillCode} (ID: ${dataSkillId}) to ${studentName}...`);

    const [sectionLetter, skillNum] = skillCode.split('.');

    console.log(`Looking for skill in section "${sectionLetter}", number "${skillNum}"...`);

    // Find the section by ID (e.g., section-A, section-B)
    const section = page.locator(`section#section-${sectionLetter}, section.skill-plan-section`).filter({
      has: page.locator(`.skill-plan-section-description:has-text("Sub-Claim ${sectionLetter}")`)
    }).first();

    if (!await section.count()) {
      // Try alternative: look for section by ID directly
      const altSection = page.locator(`section#section-${sectionLetter}`).first();
      if (!await altSection.count()) {
        throw new Error(`Section "${sectionLetter}" not found on NJSLA page`);
      }
    }

    // Find the skill by number in the section
    // Skills are inside tables as numbered links
    let skillLink = null;

    // First try to find by data-skill attribute if we have a valid ID
    if (dataSkillId && !dataSkillId.startsWith('njsla-')) {
      skillLink = page.locator(`a.skill-tree-skill-link[data-skill="${dataSkillId}"]`).first();
      if (await skillLink.count()) {
        console.log(`Found skill by data-skill attribute`);
      } else {
        skillLink = null;
      }
    }

    // If not found, search within the section
    if (!skillLink) {
      // Look for all skill links in the section and find the one with matching number
      const sectionLocator = page.locator(`section#section-${sectionLetter}`);
      const allSkillsInSection = await sectionLocator.locator('a.skill-tree-skill-link').all();

      // The skills are numbered 1, 2, 3, etc. - find the one at position (skillNum - 1)
      const skillIndex = parseInt(skillNum, 10) - 1;

      if (skillIndex >= 0 && skillIndex < allSkillsInSection.length) {
        skillLink = allSkillsInSection[skillIndex];
        console.log(`Found skill at position ${skillNum} in section ${sectionLetter}`);
      }
    }

    if (!skillLink) {
      throw new Error(`Skill "${skillCode}" not found in section "${sectionLetter}"`);
    }

    // Get the parent li element which contains the suggestion icon
    const skillContainer = skillLink.locator('xpath=ancestor::li').first();

    await skillLink.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    // Look for suggestion icon - it may be inside the li or near the link
    let suggestionIcon = skillContainer.locator('.suggestion-toggle-icon').first();

    if (!await suggestionIcon.count()) {
      // Try finding it near the skill link
      suggestionIcon = skillLink.locator('xpath=ancestor::*[contains(@class, "skill-tree-skill")]//span[contains(@class, "suggestion-toggle-icon")]').first();
    }

    if (!await suggestionIcon.count()) {
      // Last resort - look within the row
      suggestionIcon = skillLink.locator('xpath=ancestor::tr//*[contains(@class, "suggestion")]').first();
    }

    if (!await suggestionIcon.count()) {
      throw new Error(`Suggestion icon not found for NJSLA skill ${skillCode}`);
    }

    console.log(`Hovering over suggestion icon...`);
    await suggestionIcon.hover();
    await page.waitForTimeout(1200);

    const checkDropdown = async () => {
      const hasModal = await page.locator('.suggested-skills-modal').isVisible().catch(() => false);
      const hasText = await page.locator('text="Suggest this skill to"').isVisible().catch(() => false);
      return hasModal || hasText;
    };

    let dropdownVisible = await checkDropdown();

    if (!dropdownVisible) {
      console.log('Dropdown not visible after hover, retrying hover...');
      await page.mouse.move(0, 0);
      await page.waitForTimeout(500);

      await suggestionIcon.hover({ force: true });
      await page.waitForTimeout(1200);
      dropdownVisible = await checkDropdown();
    }

    if (!dropdownVisible) {
      console.log('Still no dropdown, trying JavaScript hover simulation...');
      await suggestionIcon.evaluate(el => {
        const event = new MouseEvent('mouseover', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        el.dispatchEvent(event);
      });
      await page.waitForTimeout(1200);
      dropdownVisible = await checkDropdown();
    }

    if (!dropdownVisible) {
      throw new Error('Dropdown did not appear after multiple hover attempts.');
    }

    console.log('Dropdown detected, searching for student...');
    console.log(`Looking for student "${studentName}" in dropdown...`);

    const dropdownContent = page.locator('.suggested-skills-modal ul.entries').first();

    let studentFound = false;
    for (let scrollAttempt = 0; scrollAttempt < 25; scrollAttempt++) {
      const studentRow = page.locator('li.entry-row').filter({ hasText: studentName }).first();

      if (await studentRow.isVisible()) {
        console.log(`Found "${studentName}", checking star state...`);

        const starInRow = studentRow.locator('.suggestion-toggle-icon').first();

        if (await starInRow.count() && await starInRow.isVisible()) {
          const isCurrentlySelected = await starInRow.evaluate(el => {
            const hasSelectedClass = el.classList.contains('selected') ||
              el.classList.contains('active') ||
              el.classList.contains('on') ||
              el.classList.contains('suggested');
            const hasAriaPressed = el.getAttribute('aria-pressed') === 'true';
            const parentSelected = el.closest('.entry-row')?.classList.contains('suggested') ||
              el.closest('.entry-row')?.classList.contains('selected');
            const isFilled = el.querySelector('.filled, .active, .on') !== null ||
              el.classList.contains('filled');
            const dataSelected = el.getAttribute('data-selected') === 'true' ||
              el.getAttribute('data-suggested') === 'true';
            return hasSelectedClass || hasAriaPressed || parentSelected || isFilled || dataSelected;
          });

          console.log(`Star currently selected: ${isCurrentlySelected}, action: ${action}`);

          const shouldClick = (action === 'suggest' && !isCurrentlySelected) ||
            (action === 'stop_suggesting' && isCurrentlySelected);

          if (shouldClick) {
            console.log(`Clicking star to ${action}...`);
            await starInRow.click();
          } else {
            console.log(`Star already in desired state (${action}), skipping click`);
          }
        } else {
          console.log(`Star not found in row, trying to click student row...`);
          await studentRow.click();
        }

        await page.waitForTimeout(800);
        studentFound = true;
        break;
      }

      if (await dropdownContent.count()) {
        await dropdownContent.evaluate(el => el.scrollTop += 60);
      }
      await page.waitForTimeout(100);
    }

    if (!studentFound) {
      throw new Error(`Student "${studentName}" not found in dropdown`);
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    console.log(`✓ Successfully ${action === 'suggest' ? 'suggested' : 'un-suggested'} NJSLA ${skillCode} for ${studentName}`);
    return { success: true, skillCode, studentName, action };
  } catch (error) {
    console.error(`✗ Failed to assign NJSLA ${skillData.skillCode}: ${error.message}`);

    await page.keyboard.press('Escape').catch(() => { });
    await page.waitForTimeout(300);

    return {
      success: false,
      skillCode: skillData.skillCode,
      studentName,
      error: error.message
    };
  }
}

async function assignSkillFromGradePage(page, skillData, studentName, action = 'suggest') {
  try {
    const { skillCode, dataSkillId } = skillData;
    const actionVerb = action === 'suggest' ? 'Suggesting' : 'Un-suggesting';
    console.log(`${actionVerb} skill ${skillCode} (ID: ${dataSkillId}) to ${studentName}...`);

    let skillNode;

    if (dataSkillId && dataSkillId.startsWith('20')) {
      skillNode = page.locator(`li.skill-tree-skill-node:has(a[data-skill="${dataSkillId}"])`).first();

      if (await skillNode.count()) {
        console.log(`Found skill by data-skill attribute`);
      } else {
        console.log(`data-skill not found, trying text search...`);
        skillNode = null;
      }
    }

    if (!skillNode || !await skillNode.count()) {
      const [category, num] = skillCode.split('.');

      console.log(`Looking for skill by category "${category}" and number "${num}"...`);

      const allCategories = await page.locator('.skill-tree-skills-header').all();
      let targetCategorySection = null;

      for (const header of allCategories) {
        const text = await header.textContent();
        if (text && text.trim().startsWith(`${category}.`)) {
          targetCategorySection = header.locator('xpath=ancestor::div[contains(@class, "skill-tree-category") or contains(@id, "category")]').first();
          console.log(`Found category section with header: ${text.trim().substring(0, 20)}...`);
          break;
        }
      }

      if (!targetCategorySection || !await targetCategorySection.count()) {
        throw new Error(`Category "${category}" not found on page`);
      }

      skillNode = targetCategorySection.locator('li.skill-tree-skill-node').filter({
        has: page.locator(`span.skill-tree-skill-number:text-is("${num}")`)
      }).first();

      if (!await skillNode.count()) {
        throw new Error(`Skill number "${num}" not found in category "${category}"`);
      }
    }

    await skillNode.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    const suggestionIcon = skillNode.locator('.suggestion-toggle-icon').first();

    if (!await suggestionIcon.count()) {
      throw new Error(`Suggestion icon not found for skill ${skillCode}`);
    }

    console.log(`Hovering over suggestion icon...`);
    await suggestionIcon.hover();
    await page.waitForTimeout(1200);

    const checkDropdown = async () => {
      const hasModal = await page.locator('.suggested-skills-modal').isVisible().catch(() => false);
      const hasText = await page.locator('text="Suggest this skill to"').isVisible().catch(() => false);
      return hasModal || hasText;
    };

    let dropdownVisible = await checkDropdown();

    if (!dropdownVisible) {
      console.log('Dropdown not visible after hover, retrying hover...');
      await page.mouse.move(0, 0);
      await page.waitForTimeout(500);

      await suggestionIcon.hover({ force: true });
      await page.waitForTimeout(1200);
      dropdownVisible = await checkDropdown();
    }

    if (!dropdownVisible) {
      console.log('Still no dropdown, trying JavaScript hover simulation...');
      await suggestionIcon.evaluate(el => {
        const event = new MouseEvent('mouseover', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        el.dispatchEvent(event);
      });
      await page.waitForTimeout(1200);
      dropdownVisible = await checkDropdown();
    }

    if (!dropdownVisible) {
      throw new Error('Dropdown did not appear after multiple hover attempts. Clicking is disabled to prevent accidental "Select All".');
    }

    if (!dropdownVisible) {
      console.log('Still no dropdown, trying JavaScript hover simulation...');
      // Last resort: Trigger mouseover event via JS instead of clicking
      await suggestionIcon.evaluate(el => {
        const event = new MouseEvent('mouseover', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        el.dispatchEvent(event);
      });
      await page.waitForTimeout(1200);
      dropdownVisible = await checkDropdown();
    }

    if (!dropdownVisible) {
      // CRITICAL: Do NOT click the icon as a fallback, as it toggles "Select All"
      throw new Error('Dropdown did not appear after multiple hover attempts. Clicking is disabled to prevent accidental "Select All".');
    }

    if (!dropdownVisible) {
      console.log('Still no dropdown, trying JavaScript hover simulation...');
      // Last resort: Trigger mouseover event via JS instead of clicking
      await suggestionIcon.evaluate(el => {
        const event = new MouseEvent('mouseover', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        el.dispatchEvent(event);
      });
      await page.waitForTimeout(1200);
      dropdownVisible = await checkDropdown();
    }

    if (!dropdownVisible) {
      // CRITICAL: Do NOT click the icon as a fallback, as it toggles "Select All"
      throw new Error('Dropdown did not appear after multiple hover attempts. Clicking is disabled to prevent accidental "Select All".');
    }

    if (!dropdownVisible) {
      console.log('Still no dropdown, trying JavaScript hover simulation...');
      // Last resort: Trigger mouseover event via JS instead of clicking
      await suggestionIcon.evaluate(el => {
        const event = new MouseEvent('mouseover', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        el.dispatchEvent(event);
      });
      await page.waitForTimeout(1200);
      dropdownVisible = await checkDropdown();
    }

    if (!dropdownVisible) {
      // CRITICAL: Do NOT click the icon as a fallback, as it toggles "Select All"
      throw new Error('Dropdown did not appear after multiple hover attempts. Clicking is disabled to prevent accidental "Select All".');
    }

    console.log('Dropdown detected, searching for student...');

    console.log(`Looking for student "${studentName}" in dropdown...`);

    const dropdownContent = page.locator('.suggested-skills-modal ul.entries').first();

    let studentFound = false;
    for (let scrollAttempt = 0; scrollAttempt < 25; scrollAttempt++) {
      const studentRow = page.locator('li.entry-row').filter({ hasText: studentName }).first();

      if (await studentRow.isVisible()) {
        console.log(`Found "${studentName}", checking star state...`);

        const starInRow = studentRow.locator('.suggestion-toggle-icon').first();

        if (await starInRow.count() && await starInRow.isVisible()) {
          // Detect if star is currently selected/active
          const isCurrentlySelected = await starInRow.evaluate(el => {
            // Check various ways the star might indicate it's selected
            const hasSelectedClass = el.classList.contains('selected') ||
              el.classList.contains('active') ||
              el.classList.contains('on') ||
              el.classList.contains('suggested');
            const hasAriaPressed = el.getAttribute('aria-pressed') === 'true';
            const parentSelected = el.closest('.entry-row')?.classList.contains('suggested') ||
              el.closest('.entry-row')?.classList.contains('selected');
            // Also check if the star icon itself is filled (common pattern)
            const isFilled = el.querySelector('.filled, .active, .on') !== null ||
              el.classList.contains('filled');
            // Check data attribute
            const dataSelected = el.getAttribute('data-selected') === 'true' ||
              el.getAttribute('data-suggested') === 'true';
            return hasSelectedClass || hasAriaPressed || parentSelected || isFilled || dataSelected;
          });

          console.log(`Star currently selected: ${isCurrentlySelected}, action: ${action}`);

          // Determine if we should click based on action and current state
          const shouldClick = (action === 'suggest' && !isCurrentlySelected) ||
            (action === 'stop_suggesting' && isCurrentlySelected);

          if (shouldClick) {
            console.log(`Clicking star to ${action}...`);
            await starInRow.click();
          } else {
            console.log(`Star already in desired state (${action}), skipping click`);
          }
        } else {
          console.log(`Star not found in row, trying to click student row...`);
          // Fallback to clicking the row if star not found
          await studentRow.click();
        }

        await page.waitForTimeout(800);
        studentFound = true;
        break;
      }

      if (await dropdownContent.count()) {
        await dropdownContent.evaluate(el => el.scrollTop += 60);
      }
      await page.waitForTimeout(100);
    }

    if (!studentFound) {
      throw new Error(`Student "${studentName}" not found in dropdown`);
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    console.log(`✓ Successfully ${action === 'suggest' ? 'suggested' : 'un-suggested'} ${skillCode} for ${studentName}`);
    return { success: true, skillCode, studentName, action };
  } catch (error) {
    console.error(`✗ Failed to assign ${skillData.skillCode}: ${error.message}`);

    await page.keyboard.press('Escape').catch(() => { });
    await page.waitForTimeout(300);

    return {
      success: false,
      skillCode: skillData.skillCode,
      studentName,
      error: error.message
    };
  }
}

async function assignMultipleSkills(page, skillsData, studentName, gradeLevel, action = 'suggest', progressCallback, subject = 'math') {
  const results = [];
  const isNJSLA = subject.startsWith('njsla-');

  let pageUrl;
  let waitSelector;

  if (isNJSLA) {
    // Build NJSLA skill plan URL
    const baseSubject = subject.replace('njsla-', '');
    let urlPath;
    if (['algebra-1', 'geometry', 'algebra-2'].includes(gradeLevel)) {
      urlPath = `njsla-${gradeLevel}`;
    } else {
      urlPath = `njsla-grade-${gradeLevel}`;
    }
    pageUrl = `https://www.ixl.com/${baseSubject}/skill-plans/${urlPath}`;
    waitSelector = '.skill-plan-section';
  } else {
    // Build standard grade page URL
    const gradeUrlMap = {
      'pre-k': 'preschool',
      'kindergarten': 'kindergarten',
    };
    const urlGrade = gradeUrlMap[gradeLevel] || gradeLevel;
    pageUrl = `https://www.ixl.com/${subject}/grade-${urlGrade}`;
    waitSelector = '.skill-tree-skill-node';
  }

  console.log(`Navigating to ${subject} page: ${pageUrl}`);
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector(waitSelector, { timeout: 15000 });
  await page.waitForTimeout(3000);

  for (let i = 0; i < skillsData.length; i++) {
    const skillData = skillsData[i];

    if (progressCallback) {
      progressCallback({
        current: i,
        total: skillsData.length,
        currentSkill: skillData.skillCode
      });
    }

    // Use appropriate assignment function based on subject type
    const result = isNJSLA
      ? await assignSkillFromNJSLAPage(page, skillData, studentName, action)
      : await assignSkillFromGradePage(page, skillData, studentName, action);
    results.push(result);

    if (i < skillsData.length - 1) {
      await page.waitForTimeout(humanDelay());
    }
  }

  if (progressCallback) {
    progressCallback({
      current: skillsData.length,
      total: skillsData.length,
      completed: true
    });
  }

  console.log(`\n=== Assignment Summary ===`);
  console.log(`Successful: ${results.filter(r => r.success).length}/${results.length}`);
  console.log(`Failed: ${results.filter(r => !r.success).length}/${results.length}`);
  if (results.some(r => !r.success)) {
    console.log(`Failed skills:`, results.filter(r => !r.success).map(r => r.skillCode).join(', '));
  }

  return results;
}

module.exports = {
  assignSkillFromGradePage,
  assignSkillFromNJSLAPage,
  assignMultipleSkills
};

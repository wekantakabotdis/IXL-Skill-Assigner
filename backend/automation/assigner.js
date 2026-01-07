const { humanDelay } = require('./delays');

async function assignSkillFromGradePage(page, skillData, studentName) {
  try {
    const { skillCode, dataSkillId } = skillData;
    console.log(`Assigning skill ${skillCode} (ID: ${dataSkillId}) to ${studentName}...`);
    
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
      console.log('Dropdown not visible after hover, clicking icon...');
      await suggestionIcon.click();
      await page.waitForTimeout(1200);
      dropdownVisible = await checkDropdown();
    }
    
    if (!dropdownVisible) {
      console.log('Still no dropdown, waiting longer...');
      await page.waitForTimeout(1000);
      dropdownVisible = await checkDropdown();
    }
    
    if (!dropdownVisible) {
      throw new Error('Dropdown did not appear after hover and click');
    }
    
    console.log('Dropdown detected, searching for student...');

    console.log(`Looking for student "${studentName}" in dropdown...`);
    
    const dropdownContent = page.locator('.suggested-skills-modal ul.entries').first();
    
    let studentFound = false;
    for (let scrollAttempt = 0; scrollAttempt < 25; scrollAttempt++) {
      const studentRow = page.locator('li.entry-row').filter({ hasText: studentName }).first();
      
      if (await studentRow.isVisible()) {
        console.log(`Found "${studentName}", clicking star...`);
        
        const starInRow = studentRow.locator('.suggestion-toggle-icon').first();
        
        if (await starInRow.count() && await starInRow.isVisible()) {
          console.log(`Clicking star next to student...`);
          await starInRow.click();
        } else {
          console.log(`Star not found, clicking student row...`);
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

    console.log(`✓ Successfully assigned ${skillCode} to ${studentName}`);
    return { success: true, skillCode, studentName };
  } catch (error) {
    console.error(`✗ Failed to assign ${skillData.skillCode}: ${error.message}`);
    
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
    
    return { 
      success: false, 
      skillCode: skillData.skillCode, 
      studentName, 
      error: error.message 
    };
  }
}

async function assignMultipleSkills(page, skillsData, studentName, gradeLevel, progressCallback) {
  const results = [];
  
  const gradeUrlMap = {
    'pre-k': 'preschool',
    'kindergarten': 'kindergarten',
  };
  const urlGrade = gradeUrlMap[gradeLevel] || gradeLevel;
  const gradePageUrl = `https://www.ixl.com/math/grade-${urlGrade}`;
  
  console.log(`Navigating to grade page: ${gradePageUrl}`);
  await page.goto(gradePageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.skill-tree-skill-node', { timeout: 15000 });
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

    const result = await assignSkillFromGradePage(page, skillData, studentName);
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
  assignMultipleSkills
};

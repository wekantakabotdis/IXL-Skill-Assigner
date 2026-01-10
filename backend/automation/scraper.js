const { humanDelay, humanClick } = require('./delays');

async function scrapeStudents(page) {
  try {
    console.log('Navigating to students page...');
    await page.goto('https://www.ixl.com/analytics/students-quickview', {
      waitUntil: 'domcontentloaded'
    });
    await page.waitForTimeout(humanDelay());

    console.log('Waiting for page to fully load...');
    await page.waitForTimeout(1000); // Reduced from 3000

    console.log('Extracting student data from page...');
    const students = await page.evaluate(() => {
      const results = [];
      const seenNames = new Set();

      const studentLinks = document.querySelectorAll('a[href*="/analytics/student-usage"]');
      console.log('Found student links:', studentLinks.length);

      studentLinks.forEach((link) => {
        const name = link.textContent?.trim();
        const href = link.href || '';

        const studentIdMatch = href.match(/student=(\d+)/);
        const studentId = studentIdMatch ? studentIdMatch[1] : null;

        if (name && studentId && !seenNames.has(name)) {
          seenNames.add(name);
          results.push({
            ixlId: studentId,
            name: name,
            className: 'Default Class'
          });
        }
      });

      return results;
    });

    console.log('Found students:', students.length);
    console.log('Student names:', students.map(s => s.name));
    return students;
  } catch (error) {
    console.error('Error scraping students:', error);
    return [];
  }
}

async function scrapeSkills(page, gradeLevel = '8', subject = 'math') {
  try {
    const gradeUrlMap = {
      'pre-k': 'preschool',
      'kindergarten': 'kindergarten',
    };

    const urlGrade = gradeUrlMap[gradeLevel] || gradeLevel;
    const url = `https://www.ixl.com/${subject}/grade-${urlGrade}`;

    console.log(`Navigating to ${subject} grade ${gradeLevel} skills page: ${url}`);

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('Waiting for skills to load...');
    await page.waitForSelector('.skill-tree-skill-node', { timeout: 15000 }).catch(() => {
      console.log('skill-tree-skill-node not found, waiting longer...');
    });
    await page.waitForTimeout(1000); // Reduced from 3000

    console.log('Extracting skill data from page...');
    const skills = await page.evaluate(({ grade, subj }) => {
      const results = [];

      const categoryDivs = document.querySelectorAll('div.skill-tree-category, [id^="category"], div[class*="category"]');
      console.log('Found category divs:', categoryDivs.length);

      if (categoryDivs.length === 0) {
        const allSkillNodes = document.querySelectorAll('li.skill-tree-skill-node');
        console.log('No category divs, trying flat skill list:', allSkillNodes.length);

        allSkillNodes.forEach((node, index) => {
          const link = node.querySelector('a.skill-tree-skill-link');
          if (!link) return;

          const nameSpan = node.querySelector('span.skill-tree-skill-name');
          const skillName = nameSpan?.textContent?.trim() || '';
          const dataSkillId = link.getAttribute('data-skill') || `skill-${grade}-${index}`;
          const skillUrl = link.href;

          const fullText = node.textContent || '';
          const codeMatch = fullText.match(/([A-Z]+)\.(\d+)/);

          if (codeMatch) {
            const category = codeMatch[1];
            const num = parseInt(codeMatch[2], 10);
            results.push({
              ixlId: dataSkillId,
              skillCode: `${category}.${num}`,
              name: `${category}.${num} ${skillName}`,
              skillName: skillName,
              category: category,
              gradeLevel: grade,
              url: skillUrl,
              displayOrder: num,
              subject: subj
            });
          }
        });

        return results;
      }

      categoryDivs.forEach((categoryDiv) => {
        const headerEl = categoryDiv.querySelector('.skill-tree-skills-header, h3, h2, [class*="header"]');
        const headerText = headerEl?.textContent?.trim() || '';

        const categoryMatch = headerText.match(/^([A-Z]+)\./);
        const category = categoryMatch ? categoryMatch[1] : null;

        if (!category) {
          console.log('Could not parse category from header:', headerText);
          return;
        }

        const skillNodes = categoryDiv.querySelectorAll('li.skill-tree-skill-node');

        // Use a continuous index per category to preserve page order
        skillNodes.forEach((node, index) => {
          const link = node.querySelector('a.skill-tree-skill-link');
          if (!link) return;

          const numberSpan = node.querySelector('span.skill-tree-skill-number');
          const numberText = numberSpan?.textContent?.trim() || '';

          // Check for bullet or "New!" label
          const isBulleted = node.querySelector('.skill-tree-skill-dot') !== null ||
            numberText === '•' ||
            numberText === '' ||
            node.textContent.includes('New!');

          const skillNum = isBulleted ? null : parseInt(numberText, 10);

          const nameSpan = node.querySelector('span.skill-tree-skill-name');
          const skillName = nameSpan?.textContent?.trim() || '';

          // Capture "New!" prefix if it exists
          const prefixSpan = node.querySelector('.new-skill-name-prefix');
          const prefixText = prefixSpan?.textContent?.trim() || '';
          const fullDisplayName = prefixText ? `${prefixText} ${skillName}` : skillName;

          const dataSkillId = link.getAttribute('data-skill') || '';
          const skillUrl = link.href;

          if (skillName && skillUrl) {
            const skillCode = (!isNaN(skillNum) && skillNum !== null) ? `${category}.${skillNum}` : `${category}.new${index}`;
            results.push({
              ixlId: dataSkillId,
              skillCode: skillCode,
              // For bulleted skills, include the prefix (e.g. "New!") in the name
              name: isBulleted ? fullDisplayName : `${skillCode} ${skillName}`,
              skillName: skillName,
              category: category,
              gradeLevel: grade,
              url: skillUrl,
              displayOrder: index, // Preserve exact page order within category
              subject: subj
            });
          }
        });
      });

      return results;
    }, { grade: gradeLevel, subj: subject });

    console.log('Found skills:', skills.length);
    if (skills.length > 0) {
      console.log('Sample skills:', skills.slice(0, 5).map(s => `${s.skillCode} - ${s.skillName}`));
      console.log('Categories found:', [...new Set(skills.map(s => s.category))].sort().join(', '));
    }

    if (skills.length === 0) {
      console.warn('No skills found! The page structure might have changed.');
      console.log('Current URL:', page.url());
    }

    return skills;
  } catch (error) {
    console.error('Error scraping skills:', error);
    return [];
  }
}

async function scrapeNJSLASkills(page, gradeLevel = '5', subject = 'njsla-math') {
  try {
    // Build the URL based on subject and grade
    // njsla-math -> math, njsla-ela -> ela, njsla-science -> science
    const baseSubject = subject.replace('njsla-', '');

    // Handle special course names (algebra-1, geometry, algebra-2)
    let urlPath;
    if (['algebra-1', 'geometry', 'algebra-2'].includes(gradeLevel)) {
      urlPath = `njsla-${gradeLevel}`;
    } else {
      urlPath = `njsla-grade-${gradeLevel}`;
    }

    const url = `https://www.ixl.com/${baseSubject}/skill-plans/${urlPath}`;

    console.log(`Navigating to NJSLA ${baseSubject} grade ${gradeLevel} skills page: ${url}`);

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('Waiting for skill plan sections to load...');
    await page.waitForSelector('.skill-plan-section', { timeout: 15000 }).catch(() => {
      console.log('skill-plan-section not found, waiting longer...');
    });
    await page.waitForTimeout(1000); // Reduced from 3000

    console.log('Extracting skill data from NJSLA skill plan page...');
    const skills = await page.evaluate(({ grade, subj }) => {
      const results = [];

      // Find all section containers (A, B, C, D)
      const sections = document.querySelectorAll('section.skill-plan-section');
      console.log('Found sections:', sections.length);

      sections.forEach((section) => {
        // Get the section ID (e.g., "section-A")
        const sectionId = section.id || '';
        const sectionMatch = sectionId.match(/section-([A-Z])/);
        const sectionLetter = sectionMatch ? sectionMatch[1] : null;

        if (!sectionLetter) {
          // Try to get from section description
          const descEl = section.querySelector('.skill-plan-section-description, .skill-plan-section-name, .skill-plan-section-header');
          const descText = descEl?.textContent?.trim() || '';

          const match = descText.match(/Sub-Claim\s+([A-Z])/);
          if (match) {
            section._letter = match[1];
          } else if (descText.toLowerCase().includes('reading')) {
            section._letter = 'R';
          } else if (descText.toLowerCase().includes('writing')) {
            section._letter = 'W';
          } else {
            console.log('Could not determine section letter for:', descText);
            return;
          }
        }

        const letter = sectionLetter || section._letter;
        if (!letter) return;

        // Initialize counter for this section
        let skillCounter = 1;

        // Find all skill rows in this section
        const rows = section.querySelectorAll('tbody tr');

        rows.forEach((row) => {
          // Each row may have one or more skills
          const skillLinks = row.querySelectorAll('a.skill-tree-skill-link');

          skillLinks.forEach((link) => {
            const skillName = link.textContent?.trim() || '';
            const skillUrl = link.href || '';

            // Extract data-skill ID if available
            const dataSkillId = link.getAttribute('data-skill') || `njsla-${letter}-${skillCounter}`;

            const skillCode = `${letter}.${skillCounter}`;

            results.push({
              ixlId: dataSkillId,
              skillCode: skillCode,
              name: skillName, // Just the name, no code prefix
              skillName: skillName,
              category: letter,
              gradeLevel: grade,
              url: skillUrl,
              displayOrder: skillCounter,
              subject: subj
            });

            skillCounter++;
          });
        });
      });

      // If no sections found, try alternative structure
      if (results.length === 0) {
        console.log('No sections found, trying alternative structure...');

        // Try looking for skill links directly
        const allLinks = document.querySelectorAll('a.skill-tree-skill-link');
        let currentSection = 'A';
        let skillNum = 1;

        allLinks.forEach((link) => {
          const skillName = link.textContent?.trim() || '';
          const skillUrl = link.href || '';
          const dataSkillId = link.getAttribute('data-skill') || `njsla-${currentSection}-${skillNum}`;

          // Check if we're in a new section by looking at parent elements
          const sectionEl = link.closest('.skill-plan-section');
          if (sectionEl) {
            const sectionId = sectionEl.id || '';
            const match = sectionId.match(/section-([A-Z])/);
            if (match && match[1] !== currentSection) {
              currentSection = match[1];
              skillNum = 1;
            }
          }

          const skillCode = `${currentSection}.${skillNum}`;

          results.push({
            ixlId: dataSkillId,
            skillCode: skillCode,
            name: `${skillCode} ${skillName}`,
            skillName: skillName,
            category: currentSection,
            gradeLevel: grade,
            url: skillUrl,
            displayOrder: skillNum,
            subject: subj
          });

          skillNum++;
        });
      }

      return results;
    }, { grade: gradeLevel, subj: subject });

    console.log('Found NJSLA skills:', skills.length);
    if (skills.length > 0) {
      console.log('Sample skills:', skills.slice(0, 5).map(s => `${s.skillCode} - ${s.skillName}`));
      console.log('Sections found:', [...new Set(skills.map(s => s.category))].sort().join(', '));
    }

    if (skills.length === 0) {
      console.warn('No NJSLA skills found! The page structure might have changed.');
      console.log('Current URL:', page.url());
    }

    return skills;
  } catch (error) {
    console.error('Error scraping NJSLA skills:', error);
    return [];
  }
}

module.exports = {
  scrapeStudents,
  scrapeSkills,
  scrapeNJSLASkills
};

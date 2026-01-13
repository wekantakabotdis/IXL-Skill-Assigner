const { humanDelay, humanClick } = require('./delays');

async function scrapeStudents(page) {
  try {
    console.log('Navigating to roster page...');
    await page.goto('https://www.ixl.com/roster/view', {
      waitUntil: 'domcontentloaded'
    });
    await page.waitForTimeout(humanDelay());

    console.log('Waiting for roster table to load...');
    await page.waitForSelector('table.ixl-datatable', { timeout: 15000 }).catch(() => {
      console.log('Table not found, waiting longer...');
    });
    await page.waitForTimeout(1000);

    console.log('Extracting student data from roster table...');
    const result = await page.evaluate(() => {
      const students = [];
      const classesSet = new Set();
      const seenStudents = new Set();

      // Check if Class column exists by looking at headers
      const headers = document.querySelectorAll('thead th');
      let hasClasses = false;
      let classColIndex = -1;
      let lastNameColIndex = -1;
      let firstNameColIndex = -1;
      let studentIdColIndex = -1;

      headers.forEach((th, index) => {
        const text = th.textContent?.trim().toLowerCase() || '';
        const dataCy = th.getAttribute('data-cy') || '';

        if (text === 'class' || dataCy.includes('rosterClassId')) {
          hasClasses = true;
          classColIndex = index;
        }
        if (text === 'last name' || dataCy.includes('lastName')) {
          lastNameColIndex = index;
        }
        if (text === 'first name' || dataCy.includes('firstName')) {
          firstNameColIndex = index;
        }
        if (text === 'student id' || dataCy.includes('studentId')) {
          studentIdColIndex = index;
        }
      });

      console.log('Has classes column:', hasClasses, 'at index:', classColIndex);

      // Get all data rows
      const rows = document.querySelectorAll('tbody tr.ixl-datatable-row');
      console.log('Found rows:', rows.length);

      rows.forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length === 0) return;

        // Extract student ID from the studentId column or from data attributes
        let studentId = null;
        if (studentIdColIndex >= 0 && cells[studentIdColIndex]) {
          studentId = cells[studentIdColIndex].textContent?.trim();
        }
        // Also try to get from data-cy attribute
        const studentIdCell = row.querySelector('td[data-cy*="studentId"]');
        if (studentIdCell) {
          studentId = studentIdCell.textContent?.trim();
        }

        // Extract names
        let lastName = '';
        let firstName = '';

        if (lastNameColIndex >= 0 && cells[lastNameColIndex]) {
          // The lastName cell contains a link with the report
          const nameLink = cells[lastNameColIndex].querySelector('a');
          lastName = nameLink?.textContent?.trim() || cells[lastNameColIndex].textContent?.trim() || '';
        }
        if (firstNameColIndex >= 0 && cells[firstNameColIndex]) {
          firstName = cells[firstNameColIndex].textContent?.trim() || '';
        }

        const fullName = `${firstName} ${lastName}`.trim();

        // Extract class name if applicable
        let className = null;
        if (hasClasses && classColIndex >= 0 && cells[classColIndex]) {
          // The class cell may have a link inside, extract from that
          const classLink = cells[classColIndex].querySelector('a');
          if (classLink) {
            className = classLink.textContent?.trim() || null;
          } else {
            // Otherwise get inner text but handle potential duplicates
            const rawText = cells[classColIndex].textContent?.trim() || '';
            // If the text appears to be duplicated (like "F-W-TuesF-W-Tues"), take first half
            if (rawText.length % 2 === 0) {
              const halfLen = rawText.length / 2;
              const firstHalf = rawText.substring(0, halfLen);
              const secondHalf = rawText.substring(halfLen);
              if (firstHalf === secondHalf) {
                className = firstHalf;
              } else {
                className = rawText;
              }
            } else {
              className = rawText;
            }
          }
          if (className) {
            classesSet.add(className);
          }
        }

        // Use studentId as unique identifier, or generate from name
        const uniqueId = studentId || fullName.replace(/\s+/g, '_');

        // Deduplicate using the uniqueId (studentId) NOT fullName
        // This prevents duplicate entries when the same student appears in multiple rows
        if (fullName && uniqueId && !seenStudents.has(uniqueId)) {
          seenStudents.add(uniqueId);
          students.push({
            ixlId: uniqueId,
            name: fullName,
            className: className || 'Default Class'
          });
        }
      });

      return {
        hasClasses,
        students,
        classes: Array.from(classesSet).sort()
      };
    });

    console.log('Found students:', result.students.length);
    console.log('Has classes:', result.hasClasses);
    if (result.hasClasses) {
      console.log('Found classes:', result.classes);
    }
    console.log('Student names:', result.students.map(s => s.name));

    return result;
  } catch (error) {
    console.error('Error scraping students:', error);
    return { hasClasses: false, students: [], classes: [] };
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

            // Clean the name: if it starts with the code, remove it for stored "skillName"
            let skillNameClean = skillName;
            const codePrefixRegex = new RegExp(`^${category}\\.${skillNum}\\s*`);
            if (!isBulleted && !isNaN(skillNum) && skillNum !== null) {
              skillNameClean = skillName.replace(codePrefixRegex, '').trim();
            }

            results.push({
              ixlId: dataSkillId,
              skillCode: skillCode,
              // For bulleted skills, include the prefix (e.g. "New!") in the name
              name: isBulleted ? fullDisplayName : `${skillCode} ${skillNameClean}`,
              skillName: skillNameClean,
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
    const isNJGPA = subject.startsWith('njgpa-');
    const isNJSLA = subject.startsWith('njsla-');

    let baseSubject = 'math';
    if (subject.includes('ela')) baseSubject = 'ela';
    if (subject.includes('science')) baseSubject = 'science';

    let url;
    if (isNJGPA) {
      const urlPath = subject === 'njgpa-ela' ? 'njgpa-english-language-arts' : 'njgpa-math';
      url = `https://www.ixl.com/${baseSubject}/skill-plans/${urlPath}`;
    } else {
      // Handle special course names (algebra-1, geometry, algebra-2)
      let urlPath;
      if (['algebra-1', 'geometry', 'algebra-2'].includes(gradeLevel)) {
        urlPath = `njsla-${gradeLevel}`;
      } else {
        urlPath = `njsla-grade-${gradeLevel}`;
      }
      url = `https://www.ixl.com/${baseSubject}/skill-plans/${urlPath}`;
    }

    console.log(`Navigating to ${subject} grade ${gradeLevel} skills page: ${url}`);

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

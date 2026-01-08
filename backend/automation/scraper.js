const { humanDelay, humanClick } = require('./delays');

async function scrapeStudents(page) {
  try {
    console.log('Navigating to students page...');
    await page.goto('https://www.ixl.com/analytics/students-quickview', {
      waitUntil: 'domcontentloaded'
    });
    await page.waitForTimeout(humanDelay());

    console.log('Waiting for page to fully load...');
    await page.waitForTimeout(3000);

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
    await page.waitForTimeout(3000);

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

        skillNodes.forEach((node) => {
          const link = node.querySelector('a.skill-tree-skill-link');
          if (!link) return;

          const numberSpan = node.querySelector('span.skill-tree-skill-number');
          const numberText = numberSpan?.textContent?.trim() || '';
          const skillNum = parseInt(numberText, 10);

          const nameSpan = node.querySelector('span.skill-tree-skill-name');
          const skillName = nameSpan?.textContent?.trim() || '';

          const dataSkillId = link.getAttribute('data-skill') || '';
          const skillUrl = link.href;

          if (!isNaN(skillNum) && skillName && skillUrl) {
            const skillCode = `${category}.${skillNum}`;
            results.push({
              ixlId: dataSkillId,
              skillCode: skillCode,
              name: `${skillCode} ${skillName}`,
              skillName: skillName,
              category: category,
              gradeLevel: grade,
              url: skillUrl,
              displayOrder: skillNum,
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

module.exports = {
  scrapeStudents,
  scrapeSkills
};

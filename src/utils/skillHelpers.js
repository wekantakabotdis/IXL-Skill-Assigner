function compareCategories(catA, catB) {
  if (catA.length !== catB.length) {
    return catA.length - catB.length;
  }
  return catA.localeCompare(catB);
}

export function parseRange(rangeStr, allSkills) {
  const trimmed = rangeStr.trim().toUpperCase();

  if (allSkills.length === 0) {
    console.log('No skills available to filter');
    return null;
  }

  // Sort skills for consistent processing
  const sortedSkills = [...allSkills].sort((a, b) => {
    const catA = a.category || '';
    const catB = b.category || '';
    if (catA !== catB) {
      if (catA.length !== catB.length) {
        return catA.length - catB.length;
      }
      return catA.localeCompare(catB);
    }
    const orderA = a.display_order ?? a.displayOrder ?? 0;
    const orderB = b.display_order ?? b.displayOrder ?? 0;
    return orderA - orderB;
  });

  const getDisplayOrder = (skill) => skill.display_order ?? skill.displayOrder ?? 0;
  const getCategory = (skill) => skill.category || '';

  // Split by commas (with optional surrounding spaces)
  const parts = trimmed.split(/\s*,\s*/).filter(p => p.length > 0);

  if (parts.length === 0) {
    console.log('No valid parts found in input');
    return null;
  }

  const allSkillIds = new Set();
  const rangePattern = /^([A-Z]+)\.(\d+)-([A-Z]+)\.(\d+)$/;
  const singlePattern = /^([A-Z]+)\.(\d+)$/;

  for (const part of parts) {
    // Check if it's a range (e.g., "A.5-A.7")
    const rangeMatch = part.match(rangePattern);
    if (rangeMatch) {
      const [, startCategory, startNum, endCategory, endNum] = rangeMatch;
      const start = parseInt(startNum, 10);
      const end = parseInt(endNum, 10);

      console.log(`Parsing range: ${startCategory}.${start} to ${endCategory}.${end}`);

      if (startCategory === endCategory) {
        // Same category range
        const skillsInRange = sortedSkills.filter(skill => {
          if (getCategory(skill) !== startCategory) return false;
          const order = getDisplayOrder(skill);
          return order >= start && order <= end;
        });
        skillsInRange.forEach(s => allSkillIds.add(s.id));
        console.log(`Found ${skillsInRange.length} skills in same-category range`);
      } else {
        // Cross-category range
        const skillsInRange = sortedSkills.filter(skill => {
          const cat = getCategory(skill);
          const order = getDisplayOrder(skill);

          if (cat === startCategory && order >= start) {
            return true;
          }
          if (cat === endCategory && order <= end) {
            return true;
          }
          if (compareCategories(cat, startCategory) > 0 && compareCategories(cat, endCategory) < 0) {
            return true;
          }
          return false;
        });
        skillsInRange.forEach(s => allSkillIds.add(s.id));
        console.log(`Found ${skillsInRange.length} skills in cross-category range`);
      }
      continue;
    }

    // Check if it's a single skill (e.g., "A.1")
    const singleMatch = part.match(singlePattern);
    if (singleMatch) {
      const [, category, num] = singleMatch;
      const order = parseInt(num, 10);

      console.log(`Parsing single skill: ${category}.${order}`);

      const skill = sortedSkills.find(s =>
        getCategory(s) === category && getDisplayOrder(s) === order
      );

      if (skill) {
        allSkillIds.add(skill.id);
        console.log(`Found skill: ${skill.id}`);
      } else {
        console.log(`Skill not found: ${category}.${order}`);
      }
      continue;
    }

    console.log(`Invalid format: ${part}`);
  }

  if (allSkillIds.size === 0) {
    console.log('No skills matched');
    return null;
  }

  console.log(`Total skills found: ${allSkillIds.size}`);
  return Array.from(allSkillIds);
}

export function groupSkillsByCategory(skills) {
  const grouped = {};

  skills.forEach(skill => {
    if (!grouped[skill.category]) {
      grouped[skill.category] = [];
    }
    grouped[skill.category].push(skill);
  });

  Object.keys(grouped).forEach(category => {
    grouped[category].sort((a, b) => a.display_order - b.display_order);
  });

  return grouped;
}

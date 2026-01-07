function compareCategories(catA, catB) {
  if (catA.length !== catB.length) {
    return catA.length - catB.length;
  }
  return catA.localeCompare(catB);
}

export function parseRange(rangeStr, allSkills) {
  const trimmed = rangeStr.trim().toUpperCase();
  
  const rangePattern = /^([A-Z]+)\.(\d+)-([A-Z]+)\.(\d+)$/;
  const match = trimmed.match(rangePattern);
  
  if (!match) {
    console.log('Range pattern did not match:', trimmed);
    return null;
  }
  
  const [, startCategory, startNum, endCategory, endNum] = match;
  const start = parseInt(startNum, 10);
  const end = parseInt(endNum, 10);
  
  console.log(`Parsing range: ${startCategory}.${start} to ${endCategory}.${end}`);
  console.log('Available skills:', allSkills.length);
  
  if (allSkills.length === 0) {
    console.log('No skills available to filter');
    return null;
  }
  
  console.log('Sample skill:', allSkills[0]);
  
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
  
  if (startCategory === endCategory) {
    const skillsInRange = sortedSkills.filter(skill => {
      if (getCategory(skill) !== startCategory) return false;
      const order = getDisplayOrder(skill);
      return order >= start && order <= end;
    });
    
    console.log(`Found ${skillsInRange.length} skills in same-category range`);
    return skillsInRange.map(s => s.id);
  }
  
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
  
  console.log(`Found ${skillsInRange.length} skills in cross-category range`);
  return skillsInRange.map(s => s.id);
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

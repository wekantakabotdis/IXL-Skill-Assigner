function isPlanSubject(subject = '') {
  return subject.startsWith('njsla-') || subject.startsWith('njgpa-');
}

function catalogUrl(gradeLevel, subject = 'math') {
  if (!gradeLevel || !subject) throw new Error('Grade and subject are required');
  if (isPlanSubject(subject)) {
    const base = subject.includes('ela') ? 'ela' : subject.includes('science') ? 'science' : 'math';
    const plan = subject.startsWith('njgpa-')
      ? (subject === 'njgpa-ela' ? 'njgpa-english-language-arts' : 'njgpa-math')
      : (['algebra-1', 'geometry', 'algebra-2'].includes(gradeLevel) ? `njsla-${gradeLevel}` : `njsla-grade-${gradeLevel}`);
    return `https://www.ixl.com/${base}/skill-plans/${plan}`;
  }
  const grade = { 'pre-k': 'preschool', kindergarten: 'kindergarten' }[gradeLevel] || gradeLevel;
  return `https://www.ixl.com/${subject}/grade-${grade}`;
}

function canonicalUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'www.ixl.com') throw new Error('Unexpected IXL skill URL');
  return url.origin + url.pathname.replace(/\/$/, '');
}

function assertCatalogPage(actualUrl, gradeLevel, subject) {
  if (canonicalUrl(actualUrl) !== catalogUrl(gradeLevel, subject)) {
    throw new Error(`Catalog mismatch: expected ${subject} grade ${gradeLevel}. Refresh skills and retry.`);
  }
}

function validateSkill(skill, gradeLevel, subject) {
  const grade = skill.grade_level ?? skill.gradeLevel;
  const id = skill.ixl_id ?? skill.ixlId ?? skill.dataSkillId;
  if (String(grade) !== String(gradeLevel) || (skill.subject || 'math') !== subject || !id) {
    throw new Error('Skill grade, subject, or IXL identity does not match the selected catalog. Refresh skills.');
  }
  const url = canonicalUrl(skill.url);
  if (!isPlanSubject(subject) && !url.startsWith(catalogUrl(gradeLevel, subject) + '/')) {
    throw new Error(`Skill URL does not match ${subject} grade ${gradeLevel}. Refresh skills.`);
  }
  return skill;
}

function snapshotSelection(skills, skillIds, gradeLevel, subject) {
  if (!gradeLevel || !subject || !Array.isArray(skillIds) || !skillIds.length || new Set(skillIds).size !== skillIds.length) {
    throw new Error('A grade, subject, and unique skill IDs are required');
  }
  const byId = new Map(skills.map(skill => [skill.id, skill]));
  return skillIds.map(id => {
    const skill = byId.get(id);
    if (!skill || skill.is_active === 0) throw new Error('Selected skill is missing or outdated. Refresh skills.');
    validateSkill(skill, gradeLevel, subject);
    return Object.freeze({ ...skill });
  });
}

module.exports = { isPlanSubject, catalogUrl, canonicalUrl, assertCatalogPage, validateSkill, snapshotSelection };

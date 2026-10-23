const g3 = [
  { ixlId: '2000001780', skillCode: 'EE.1', name: 'EE.1 Identify equations', skillName: 'Identify equations', category: 'EE', gradeLevel: '3', url: 'https://www.ixl.com/math/grade-3/identify-equations', displayOrder: 0, subject: 'math' },
  { ixlId: '2000001781', skillCode: 'EE.2', name: 'EE.2 Solve for the unknown number: addition and subtraction only', skillName: 'Solve for the unknown number: addition and subtraction only', category: 'EE', gradeLevel: '3', url: 'https://www.ixl.com/math/grade-3/solve-for-the-unknown-number-addition-and-subtraction-only', displayOrder: 1, subject: 'math' }
];
const g4 = [
  { ...g3[0], ixlId: '2020034420', gradeLevel: '4', name: 'EE.1 Find the mode', skillName: 'Find the mode', url: 'https://www.ixl.com/math/grade-4/find-the-mode' },
  { ...g3[1], ixlId: '2020034421', gradeLevel: '4', name: 'EE.2 Find the median', skillName: 'Find the median', url: 'https://www.ixl.com/math/grade-4/find-the-median' }
];

function catalogHtml(skills, { modernPlan = false, hiddenDuplicate = false, wrongId = false } = {}) {
  const tag = modernPlan ? 'div' : 'li';
  const nodes = skills.map((s, i) => `<${tag} class="${modernPlan ? 'skill-node' : 'skill-tree-skill-node'}">
    <span class="skill-tree-skill-number">${i + 1}</span>
    <a class="${modernPlan ? 'skill-link' : 'skill-tree-skill-link'}" href="${s.url}" data-skill="${wrongId ? 'wrong-id' : s.ixlId}"><span class="skill-tree-skill-name">${s.skillName}</span></a>
    <span class="suggestion-toggle-icon" data-skill="${s.ixlId}" onmouseover="openSkill('${s.ixlId}')">star</span>
    </${tag}>`);
  const contents = (hiddenDuplicate ? `<div style="display:none">${nodes[0]}</div>` : '') + nodes.join('');
  const catalog = modernPlan ? `<div class="main-section" id="section-A">${contents}</div>`
    : `<div class="skill-tree-category"><div class="skill-tree-skills-header"><h2><span class="category-code">EE.</span> Equations</h2></div><ol>${contents}</ol></div>`;
  return `<!doctype html><html><body>${catalog}
    <div class="suggested-skills-modal" hidden>Suggest this skill to<ul class="entries"><li class="entry-row"><span>Test Student</span><span class="suggestion-toggle-icon" onclick="window.clickCount++;this.classList.toggle('suggested');window.states[window.currentSkill]=this.classList.contains('suggested')">star</span></li></ul></div>
    <script>window.clickCount=0;window.states={};function openSkill(id){window.currentSkill=id;const modal=document.querySelector('.suggested-skills-modal');modal.hidden=false;modal.querySelector('.suggestion-toggle-icon').classList.toggle('suggested',!!window.states[id]);}</script></body></html>`;
}
module.exports = { g3, g4, catalogHtml };

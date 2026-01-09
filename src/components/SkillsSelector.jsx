import { useState, useMemo, useEffect } from 'react';

export default function SkillsSelector({ skills, selectedSkillIds, onSelectionChange }) {
  const [searchAvailable, setSearchAvailable] = useState('');
  const [searchSelected, setSearchSelected] = useState('');

  // Track highlighted items for transfer (left list and right list)
  const [highlightedAvailable, setHighlightedAvailable] = useState([]);
  const [highlightedSelected, setHighlightedSelected] = useState([]);

  // Track last clicked item for Shift-click range selection
  const [lastClickedAvailable, setLastClickedAvailable] = useState(null);
  const [lastClickedSelected, setLastClickedSelected] = useState(null);

  // Track highlighted item for reordering (right list only)
  const [reorderSelectedId, setReorderSelectedId] = useState(null);

  // Clear selections when skills change
  useEffect(() => {
    setHighlightedAvailable([]);
    setHighlightedSelected([]);
    setLastClickedAvailable(null);
    setLastClickedSelected(null);
    setReorderSelectedId(null);
  }, [skills]);

  // Get skill display label
  const getSkillLabel = (skill) => {
    const code = skill.skill_code || skill.skillCode || '';
    const skillName = skill.skillName || skill.name?.replace(/^[A-Z]+\.\d+\s*/, '') || '';
    const subj = skill.subject || '';

    // For NJSLA, don't include the A.1 - prefix
    if (subj.startsWith('njsla-')) {
      return skillName || skill.name || 'Unknown Skill';
    }

    if (code && skillName) {
      return `${code} - ${skillName}`;
    }
    return skill.name || code || 'Unknown Skill';
  };

  // Sort available skills (category -> order)
  const sortedSkills = useMemo(() => {
    return [...skills].sort((a, b) => {
      const catA = a.category || '';
      const catB = b.category || '';
      if (catA !== catB) {
        if (catA.length !== catB.length) return catA.length - catB.length;
        return catA.localeCompare(catB);
      }
      const orderA = a.display_order ?? a.displayOrder ?? 0;
      const orderB = b.display_order ?? b.displayOrder ?? 0;
      return orderA - orderB;
    });
  }, [skills]);

  // Available skills
  const availableList = useMemo(() => {
    let list = sortedSkills.filter(s => !selectedSkillIds.includes(s.id));
    if (searchAvailable.trim()) {
      const term = searchAvailable.toLowerCase();
      list = list.filter(s => {
        const label = getSkillLabel(s).toLowerCase();
        const code = (s.skill_code || s.skillCode || '').toLowerCase();
        return label.includes(term) || code.includes(term);
      });
    }
    return list;
  }, [sortedSkills, selectedSkillIds, searchAvailable, getSkillLabel]);

  // Selected skills
  const selectedList = useMemo(() => {
    const list = selectedSkillIds
      .map(id => skills.find(s => s.id === id))
      .filter(Boolean);

    if (searchSelected.trim()) {
      const term = searchSelected.toLowerCase();
      return list.filter(s => {
        const label = getSkillLabel(s).toLowerCase();
        const code = (s.skill_code || s.skillCode || '').toLowerCase();
        return label.includes(term) || code.includes(term);
      });
    }
    return list;
  }, [skills, selectedSkillIds, searchSelected, getSkillLabel]);

  // Handle highlighting for Available list
  const toggleHighlightAvailable = (id, multi, shift) => {
    if (shift && lastClickedAvailable) {
      // Range selection
      const lastIndex = availableList.findIndex(s => s.id === lastClickedAvailable);
      const currentIndex = availableList.findIndex(s => s.id === id);

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);

        const rangeIds = availableList.slice(start, end + 1).map(s => s.id);

        // Merge with existing if multi (command) was held before, otherwise replace
        // But typical Shift-click behavior extends selection from anchor
        // Here we'll just check if we should add to existing or not.
        // Usually shift-click adds to selection.

        // Simple logic: Add range to current highlights
        setHighlightedAvailable(prev => {
          const newSet = new Set([...prev, ...rangeIds]);
          return Array.from(newSet);
        });
        return; // Success, skip updating lastClicked
      }
    }

    // Normal selection
    if (multi) {
      setHighlightedAvailable(prev =>
        prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
    } else {
      setHighlightedAvailable([id]);
    }
    setLastClickedAvailable(id);
  };

  // Handle highlighting for Selected list
  const toggleHighlightSelected = (id, multi, shift) => {
    if (shift && lastClickedSelected) {
      // Range selection
      const lastIndex = selectedList.findIndex(s => s.id === lastClickedSelected);
      const currentIndex = selectedList.findIndex(s => s.id === id);

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);

        const rangeIds = selectedList.slice(start, end + 1).map(s => s.id);

        setHighlightedSelected(prev => {
          const newSet = new Set([...prev, ...rangeIds]);
          return Array.from(newSet);
        });
        setReorderSelectedId(null);
        return;
      }
    }

    if (multi) {
      setHighlightedSelected(prev =>
        prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
      setReorderSelectedId(null);
    } else {
      setHighlightedSelected([id]);
      setReorderSelectedId(id);
    }
    setLastClickedSelected(id);
  };

  // Operations
  const moveRight = () => {
    if (highlightedAvailable.length === 0) return;
    onSelectionChange([...selectedSkillIds, ...highlightedAvailable]);
    setHighlightedAvailable([]);
    setLastClickedAvailable(null);
  };

  const moveAllRight = () => {
    const idsToAdd = availableList.map(s => s.id);
    onSelectionChange([...selectedSkillIds, ...idsToAdd]);
    setHighlightedAvailable([]);
    setLastClickedAvailable(null);
  };

  const moveLeft = () => {
    if (highlightedSelected.length === 0) return;
    const newSelection = selectedSkillIds.filter(id => !highlightedSelected.includes(id));
    onSelectionChange(newSelection);
    setHighlightedSelected([]);
    setLastClickedSelected(null);
    setReorderSelectedId(null);
  };

  const moveAllLeft = () => {
    const visibleIds = new Set(selectedList.map(s => s.id));
    const newSelection = selectedSkillIds.filter(id => !visibleIds.has(id));
    onSelectionChange(newSelection);
    setHighlightedSelected([]);
    setLastClickedSelected(null);
    setReorderSelectedId(null);
  };

  const moveUp = () => {
    if (!reorderSelectedId) return;
    const index = selectedSkillIds.indexOf(reorderSelectedId);
    if (index <= 0) return;
    const newIds = [...selectedSkillIds];
    [newIds[index - 1], newIds[index]] = [newIds[index], newIds[index - 1]];
    onSelectionChange(newIds);
  };

  const moveDown = () => {
    if (!reorderSelectedId) return;
    const index = selectedSkillIds.indexOf(reorderSelectedId);
    if (index === -1 || index >= selectedSkillIds.length - 1) return;
    const newIds = [...selectedSkillIds];
    [newIds[index + 1], newIds[index]] = [newIds[index], newIds[index + 1]];
    onSelectionChange(newIds);
  };

  // Styles
  const containerStyle = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: '16px',
    width: '100%'
  };

  const columnStyle = {
    flex: '1',
    minWidth: '0'
  };

  const centerColumnStyle = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    paddingTop: '64px'
  };

  const listContainerStyle = {
    height: '350px',
    overflowY: 'auto',
    background: 'var(--ixl-white)',
    border: '1px solid #ccc',
    borderRadius: '4px',
    borderTopLeftRadius: '0',
    borderTopRightRadius: '0'
  };

  const itemStyle = (isHighlighted) => ({
    padding: '6px 10px',
    cursor: 'pointer',
    backgroundColor: isHighlighted ? '#e5e7eb' : 'transparent',
    color: isHighlighted ? '#000' : 'inherit',
    fontSize: '13px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    userSelect: 'none'
  });

  const buttonStyle = {
    minWidth: '40px',
    height: '32px',
    marginBottom: '8px',
    background: 'linear-gradient(to bottom, #f9fafb, #e5e7eb)',
    border: '1px solid #9ca3af',
    borderRadius: '16px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#374151',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
  };

  return (
    <div className="mb-6">
      <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--ixl-text)' }}>
        Select Skills
        <span className="ml-2 font-normal" style={{ color: 'var(--ixl-gray-dark)' }}>
          ({selectedSkillIds.length} selected)
        </span>
      </label>

      {/* Main Layout Grid */}
      <div style={containerStyle}>

        {/* Left Column: Available */}
        <div style={columnStyle}>
          <div className="bg-gray-200 px-3 py-2 border border-gray-300 border-b-0 rounded-t font-semibold text-sm">
            Available Skills
          </div>
          <input
            type="text"
            placeholder="Filter available..."
            value={searchAvailable}
            onChange={(e) => setSearchAvailable(e.target.value)}
            className="w-full px-2 py-1 text-sm border-x border-gray-300 focus:outline-none"
            style={{ borderBottom: '1px solid #eee' }}
          />
          <div style={listContainerStyle}>
            {availableList.length === 0 ? (
              <div className="p-3 text-center text-gray-400 text-xs italic">
                No skills found
              </div>
            ) : (
              availableList.map(skill => (
                <div
                  key={skill.id}
                  style={itemStyle(highlightedAvailable.includes(skill.id))}
                  onClick={(e) => toggleHighlightAvailable(skill.id, e.metaKey || e.ctrlKey, e.shiftKey)}
                  onDoubleClick={moveRight}
                >
                  {getSkillLabel(skill)}
                </div>
              ))
            )}
          </div>
          <div className="text-xs text-gray-500 mt-1 pl-1">
            {availableList.length} items
          </div>
        </div>

        {/* Center Column: Transfer Buttons */}
        <div style={centerColumnStyle}>
          <button
            style={buttonStyle}
            onClick={moveAllRight}
            title="Move All Right"
            disabled={availableList.length === 0}
          >
            &gt;&gt;
          </button>
          <button
            style={buttonStyle}
            onClick={moveRight}
            title="Move Selected Right"
            disabled={highlightedAvailable.length === 0}
          >
            &gt;
          </button>
          <button
            style={buttonStyle}
            onClick={moveLeft}
            title="Move Selected Left"
            disabled={highlightedSelected.length === 0}
          >
            &lt;
          </button>
          <button
            style={buttonStyle}
            onClick={moveAllLeft}
            title="Move All Left"
            disabled={selectedList.length === 0}
          >
            &lt;&lt;
          </button>
        </div>

        {/* Right Column: Selected */}
        <div style={columnStyle}>
          <div className="bg-gray-200 px-3 py-2 border border-gray-300 border-b-0 rounded-t font-semibold text-sm">
            Selected Skills
          </div>
          <input
            type="text"
            placeholder="Filter selected..."
            value={searchSelected}
            onChange={(e) => setSearchSelected(e.target.value)}
            className="w-full px-2 py-1 text-sm border-x border-gray-300 focus:outline-none"
            style={{ borderBottom: '1px solid #eee' }}
          />
          <div style={listContainerStyle}>
            {selectedList.length === 0 ? (
              <div className="p-3 text-center text-gray-400 text-xs italic">
                No skills selected
              </div>
            ) : (
              selectedList.map(skill => (
                <div
                  key={skill.id}
                  style={itemStyle(highlightedSelected.includes(skill.id))}
                  onClick={(e) => toggleHighlightSelected(skill.id, e.metaKey || e.ctrlKey, e.shiftKey)}
                  onDoubleClick={moveLeft}
                >
                  {getSkillLabel(skill)}
                </div>
              ))
            )}
          </div>
          <div className="text-xs text-gray-500 mt-1 pl-1">
            {selectedList.length} items
          </div>
        </div>

        {/* Far Right Column: Reorder Buttons */}
        <div style={centerColumnStyle}>
          <button
            style={buttonStyle}
            onClick={moveUp}
            title="Move Up"
            disabled={!reorderSelectedId || selectedSkillIds.indexOf(reorderSelectedId) === 0}
          >
            Up
          </button>
          <button
            style={buttonStyle}
            onClick={moveDown}
            title="Move Down"
            disabled={!reorderSelectedId || selectedSkillIds.indexOf(reorderSelectedId) === selectedSkillIds.length - 1}
          >
            Down
          </button>
        </div>

      </div>
    </div>
  );
}

import { useState } from 'react';
import { parseRange } from '../utils/skillHelpers';

export default function SkillsSelector({ skills, selectedSkills, onToggle, onSelectMultiple }) {
  const [rangeInput, setRangeInput] = useState('');
  const [rangeError, setRangeError] = useState('');

  const handleRangeSelect = () => {
    setRangeError('');
    
    if (!rangeInput.trim()) {
      setRangeError('Please enter a range');
      return;
    }

    console.log('Skills available for range parsing:', skills.length);
    if (skills.length > 0) {
      console.log('First skill:', skills[0]);
    }

    if (skills.length === 0) {
      setRangeError('No skills loaded. Click the Sync button to load skills.');
      return;
    }

    const skillIds = parseRange(rangeInput, skills);
    
    if (!skillIds || skillIds.length === 0) {
      const categories = [...new Set(skills.map(s => s.category))]
        .sort((a, b) => {
          if (a.length !== b.length) return a.length - b.length;
          return a.localeCompare(b);
        })
        .join(', ');
      setRangeError(`No skills found for range "${rangeInput}". Available categories: ${categories}`);
      return;
    }

    onSelectMultiple(skillIds);
    setRangeInput('');
  };

  return (
    <div className="mb-6">
      <label className="block text-sm font-semibold mb-3" style={{ color: '#6b4423' }}>
        Skill Range
        <span className="ml-2 font-normal" style={{ color: '#b5a594' }}>
          ({skills.length} skills available)
        </span>
      </label>

      <div className="p-5 rounded-xl mb-4" style={{ 
        background: 'linear-gradient(135deg, rgba(193, 124, 91, 0.08) 0%, rgba(193, 124, 91, 0.04) 100%)',
        border: '1.5px solid rgba(193, 124, 91, 0.15)'
      }}>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="e.g., A.1-A.5"
            value={rangeInput}
            onChange={(e) => setRangeInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleRangeSelect()}
            className="input-field flex-1 px-4 py-3 rounded-xl text-base font-medium transition-all"
            style={{ color: '#5a3519' }}
          />
          <button
            onClick={handleRangeSelect}
            disabled={skills.length === 0}
            className="btn-ink px-6 py-3 rounded-xl font-semibold"
          >
            Add Range
          </button>
        </div>
        {rangeError && (
          <p className="mt-3 text-sm font-medium" style={{ color: '#c17c5b' }}>{rangeError}</p>
        )}
        {skills.length > 0 && (
          <p className="mt-3 text-xs" style={{ color: '#8b7b6b' }}>
            Categories: {[...new Set(skills.map(s => s.category))]
              .sort((a, b) => {
                if (a.length !== b.length) return a.length - b.length;
                return a.localeCompare(b);
              })
              .join(', ')}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between p-4 rounded-xl" style={{
        background: 'rgba(255, 250, 245, 0.6)',
        border: '1.5px solid rgba(139, 69, 19, 0.08)'
      }}>
        <span className="text-sm" style={{ color: '#8b7b6b' }}>
          Selected: <strong style={{ color: '#6b4423', fontSize: '1.1em' }}>{selectedSkills.length}</strong> skills
        </span>
        {selectedSkills.length > 0 && (
          <button
            onClick={() => onSelectMultiple([])}
            className="text-sm font-semibold transition-colors"
            style={{ color: '#c17c5b' }}
            onMouseOver={(e) => e.currentTarget.style.color = '#a66a50'}
            onMouseOut={(e) => e.currentTarget.style.color = '#c17c5b'}
          >
            Clear All
          </button>
        )}
      </div>
    </div>
  );
}

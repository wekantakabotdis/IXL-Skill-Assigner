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
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Skill Range ({skills.length} skills available)
      </label>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g., A.1-A.5"
            value={rangeInput}
            onChange={(e) => setRangeInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleRangeSelect()}
            className="flex-1 px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={handleRangeSelect}
            disabled={skills.length === 0}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-gray-400"
          >
            Add Range
          </button>
        </div>
        {rangeError && (
          <p className="mt-2 text-sm text-red-600">{rangeError}</p>
        )}
        {skills.length > 0 && (
          <p className="mt-2 text-xs text-gray-500">
            Categories: {[...new Set(skills.map(s => s.category))]
              .sort((a, b) => {
                if (a.length !== b.length) return a.length - b.length;
                return a.localeCompare(b);
              })
              .join(', ')}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm text-gray-600">
          Selected: <strong>{selectedSkills.length}</strong> skills
        </span>
        {selectedSkills.length > 0 && (
          <button
            onClick={() => onSelectMultiple([])}
            className="text-sm text-red-600 hover:text-red-700"
          >
            Clear All
          </button>
        )}
      </div>
    </div>
  );
}

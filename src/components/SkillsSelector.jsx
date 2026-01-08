export default function SkillsSelector({ skills, rangeInput, onRangeChange }) {
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
        <input
          type="text"
          placeholder="e.g., A.1-A.5"
          value={rangeInput}
          onChange={(e) => onRangeChange(e.target.value)}
          className="input-field w-full px-4 py-3 rounded-xl text-base font-medium transition-all"
          style={{ color: '#5a3519' }}
        />
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
    </div>
  );
}

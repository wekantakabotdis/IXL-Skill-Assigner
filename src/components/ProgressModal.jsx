export default function ProgressModal({ isOpen, taskStatus, skills }) {
  if (!isOpen || !taskStatus) return null;

  const progress = taskStatus.total > 0 
    ? Math.round((taskStatus.progress / taskStatus.total) * 100)
    : 0;

  const getSkillName = (skillId) => {
    const skill = skills.find(s => s.id === skillId);
    return skill ? skill.name : `Skill #${skillId}`;
  };

  return (
    <div className="fixed inset-0 bg-[#5a3519] bg-opacity-20 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
      <div className="paper-card rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 animate-scaleIn">
        <h2 className="text-2xl font-bold mb-6 text-center" style={{ fontFamily: "'Crimson Pro', serif", color: '#5a3519' }}>
          {taskStatus.status === 'completed' ? 'Assignment Complete!' : 'Assigning Skills...'}
        </h2>

        <div className="mb-8">
          <div className="w-full bg-[#f0e6dd] rounded-full h-4 mb-3 overflow-hidden border border-[#d4c4b4]">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out relative overflow-hidden"
              style={{ 
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #c17c5b 0%, #a66a50 100%)'
              }}
            >
              <div className="absolute inset-0 bg-white opacity-20" style={{ 
                backgroundImage: 'linear-gradient(45deg,rgba(255,255,255,.15) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.15) 50%,rgba(255,255,255,.15) 75%,transparent 75%,transparent)', 
                backgroundSize: '1rem 1rem' 
              }}></div>
            </div>
          </div>
          <p className="text-base font-medium text-center" style={{ color: '#8b7b6b' }}>
            {taskStatus.progress} / {taskStatus.total} ({progress}%)
          </p>
        </div>

        <div className="max-h-64 overflow-y-auto mb-6 space-y-2 pr-2 custom-scrollbar">
          {taskStatus.skillIds?.map((skillId, index) => {
            const isCompleted = index < taskStatus.progress;
            const isCurrent = index === taskStatus.progress;
            const isPending = index > taskStatus.progress;

            return (
              <div
                key={skillId}
                className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-300 ${
                  isCompleted ? 'bg-[#f0fdf4] border border-[#dcfce7]' :
                  isCurrent ? 'bg-[#fffaf5] border border-[#fde68a] shadow-sm transform scale-[1.02]' :
                  'bg-transparent border border-transparent opacity-60'
                }`}
              >
                <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full"
                  style={{
                    background: isCompleted ? '#86efac' : isCurrent ? '#fcd34d' : '#e5e7eb',
                    color: isCompleted ? '#14532d' : isCurrent ? '#78350f' : '#9ca3af'
                  }}
                >
                  {isCompleted && <span className="text-xs font-bold">✓</span>}
                  {isCurrent && <span className="text-xs font-bold animate-spin">⟳</span>}
                  {isPending && <span className="text-xs font-bold">○</span>}
                </div>
                <span className={`text-sm font-medium ${
                  isCompleted ? 'text-[#166534]' :
                  isCurrent ? 'text-[#92400e]' :
                  'text-[#6b7280]'
                }`}>
                  {getSkillName(skillId)}
                </span>
              </div>
            );
          })}
        </div>

        {taskStatus.status === 'failed' && (
          <div className="bg-[#fef2f2] border border-[#fecaca] rounded-xl p-4 mb-4">
            <p className="text-sm text-[#991b1b] font-medium flex items-center gap-2">
              <span className="text-lg">⚠</span> Error: {taskStatus.error || 'Assignment failed'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

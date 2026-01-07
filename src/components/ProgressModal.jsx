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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h2 className="text-xl font-semibold mb-4">
          {taskStatus.status === 'completed' ? 'Assignment Complete!' : 'Assigning Skills...'}
        </h2>

        <div className="mb-4">
          <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
            <div
              className="bg-blue-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-gray-600 text-center">
            {taskStatus.progress} / {taskStatus.total} ({progress}%)
          </p>
        </div>

        <div className="max-h-64 overflow-y-auto mb-4 space-y-2">
          {taskStatus.skillIds?.map((skillId, index) => {
            const isCompleted = index < taskStatus.progress;
            const isCurrent = index === taskStatus.progress;
            const isPending = index > taskStatus.progress;

            return (
              <div
                key={skillId}
                className={`flex items-center gap-2 p-2 rounded ${
                  isCompleted ? 'bg-green-50' :
                  isCurrent ? 'bg-blue-50' :
                  'bg-gray-50'
                }`}
              >
                <span className="text-lg">
                  {isCompleted && '✓'}
                  {isCurrent && '⏳'}
                  {isPending && '○'}
                </span>
                <span className={`text-sm ${
                  isCompleted ? 'text-green-700' :
                  isCurrent ? 'text-blue-700' :
                  'text-gray-500'
                }`}>
                  {getSkillName(skillId)}
                </span>
              </div>
            );
          })}
        </div>

        {taskStatus.status === 'failed' && (
          <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
            <p className="text-sm text-red-700">
              Error: {taskStatus.error || 'Assignment failed'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function StudentSelector({ students, selectedStudent, onSelect, onSync }) {
  console.log('StudentSelector rendering with students:', students);

  return (
    <div className="mb-6 flex flex-col">
      <label className="block text-sm font-semibold mb-3" style={{ color: '#6b4423' }}>
        Select Student
        <span className="ml-2 font-normal" style={{ color: '#b5a594' }}>
          ({students?.length || 0} students)
        </span>
      </label>
      <div className="flex gap-3">
        <select
          value={selectedStudent || ''}
          onChange={(e) => onSelect(e.target.value ? parseInt(e.target.value) : null)}
          className="input-field flex-1 px-4 py-3 rounded-xl text-base font-medium transition-all"
          style={{ color: '#5a3519' }}
        >
          <option value="">Choose a student...</option>
          {students && students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.name}
            </option>
          ))}
        </select>
        <button
          onClick={onSync}
          className="px-5 py-3 rounded-xl text-sm font-semibold transition-all"
          style={{
            background: 'rgba(193, 124, 91, 0.1)',
            color: '#8b5a3c',
            border: '1.5px solid rgba(193, 124, 91, 0.2)'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(193, 124, 91, 0.15)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(193, 124, 91, 0.1)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          title="Sync students from IXL website"
        >
          Sync
        </button>
      </div>
    </div>
  );
}

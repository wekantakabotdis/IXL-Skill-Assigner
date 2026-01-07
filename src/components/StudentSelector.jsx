export default function StudentSelector({ students, selectedStudent, onSelect }) {
  console.log('StudentSelector rendering with students:', students);
  
  return (
    <div className="mb-6">
      <label className="block text-sm font-semibold mb-3" style={{ color: '#6b4423' }}>
        Select Student
        <span className="ml-2 font-normal" style={{ color: '#b5a594' }}>
          ({students?.length || 0} students)
        </span>
      </label>
      <select
        value={selectedStudent || ''}
        onChange={(e) => onSelect(e.target.value ? parseInt(e.target.value) : null)}
        className="input-field w-full px-4 py-3 rounded-xl text-base font-medium transition-all"
        style={{ color: '#5a3519' }}
      >
        <option value="">Choose a student...</option>
        {students && students.map((student) => (
          <option key={student.id} value={student.id}>
            {student.name} {student.class_name && `(${student.class_name})`}
          </option>
        ))}
      </select>
    </div>
  );
}

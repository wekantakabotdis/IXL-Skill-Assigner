export default function StudentSelector({ students, selectedStudent, onSelect }) {
  console.log('StudentSelector rendering with students:', students);
  
  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Select Student ({students?.length || 0} students)
      </label>
      <select
        value={selectedStudent || ''}
        onChange={(e) => onSelect(e.target.value ? parseInt(e.target.value) : null)}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        <option value="">Select a student...</option>
        {students && students.map((student) => (
          <option key={student.id} value={student.id}>
            {student.name} {student.class_name && `(${student.class_name})`}
          </option>
        ))}
      </select>
    </div>
  );
}

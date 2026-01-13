import { useState, useRef, useEffect } from 'react';

export default function StudentSelector({ students, groups, selectedStudentIds, onSelect, onSync, onCreateGroup, onDeleteGroup }) {
  const [isOpen, setIsOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setIsCreatingGroup(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleStudent = (id) => {
    const newSelection = selectedStudentIds.includes(id)
      ? selectedStudentIds.filter(sid => sid !== id)
      : [...selectedStudentIds, id];
    onSelect(newSelection, null);
    setSearchQuery('');
  };

  const handleSelectAll = (e) => {
    e.stopPropagation();
    onSelect(students.map(s => s.id), "All Students");
  };

  const handleClearAll = (e) => {
    e.stopPropagation();
    onSelect([], null);
  };

  const handleSelectGroup = (studentIds, name) => {
    onSelect(studentIds, name);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleSaveGroup = async () => {
    if (!groupName.trim()) return;
    await onCreateGroup(groupName, selectedStudentIds);
    setGroupName('');
    setIsCreatingGroup(false);
  };

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedCount = selectedStudentIds.length;

  return (
    <div className="mb-6 flex flex-col relative" ref={dropdownRef}>
      <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--ixl-text)' }}>
        Select Students or Groups
        <span className="ml-2 font-normal" style={{ color: 'var(--ixl-gray-dark)' }}>
          ({students?.length || 0} students available)
        </span>
      </label>

      <div className="flex gap-3">
        <div className="relative flex-1">
          {/* Gmail-style searchable input with chips */}
          <div
            className={`input-field min-h-[48px] w-full px-3 py-2 rounded-xl text-sm transition-all flex flex-wrap gap-2 items-center bg-white cursor-text ${isOpen ? 'ring-2 ring-turquoise-500 border-turquoise-500' : ''}`}
            onClick={() => {
              setIsOpen(true);
              inputRef.current?.focus();
            }}
            style={{
              borderColor: isOpen ? 'var(--ixl-turquoise)' : 'var(--ixl-gray)'
            }}
          >
            {selectedStudentIds.map(id => {
              const student = students.find(s => s.id === id);
              if (!student) return null;
              return (
                <div
                  key={id}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-turquoise-50 text-turquoise-700 rounded-full border border-turquoise-100 text-xs font-semibold animate-scaleIn"
                >
                  <span>{student.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleStudent(id);
                    }}
                    className="hover:text-turquoise-900 focus:outline-none"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
            <input
              ref={inputRef}
              type="text"
              className="flex-1 min-w-[120px] bg-transparent outline-none border-none py-1 h-7"
              placeholder={selectedCount === 0 ? "Search students or groups..." : ""}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
            />
          </div>

          {isOpen && (
            <div className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-xl max-h-80 overflow-hidden flex flex-col animate-fadeIn">
              <div className="p-2 border-b flex gap-2 bg-gray-50 flex-wrap">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="flex-1 min-w-[80px] py-1.5 text-xs font-semibold rounded-lg bg-white border border-gray-200 hover:bg-gray-100 transition-colors"
                  style={{ color: 'var(--ixl-turquoise-dark)' }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="flex-1 min-w-[80px] py-1.5 text-xs font-semibold rounded-lg bg-white border border-gray-200 hover:bg-gray-100 transition-colors"
                  style={{ color: 'var(--ixl-gray-dark)' }}
                >
                  Clear All
                </button>
                {selectedCount > 1 && (
                  <button
                    type="button"
                    onClick={() => setIsCreatingGroup(!isCreatingGroup)}
                    className="flex-1 min-w-[120px] py-1.5 text-xs font-semibold rounded-lg bg-ixl-green border border-transparent text-white hover:opacity-90 transition-opacity"
                    style={{ background: 'var(--ixl-green)' }}
                  >
                    Save as Group
                  </button>
                )}
              </div>

              {isCreatingGroup && (
                <div className="p-3 border-b bg-green-50 animate-fadeIn">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"
                      placeholder="Group name (e.g. English Class)"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveGroup()}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleSaveGroup}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-green-600 rounded-lg hover:bg-green-700"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-y-auto flex-1 custom-scrollbar">
                {filteredGroups.length > 0 && (
                  <>
                    <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50">
                      Groups
                    </div>
                    {filteredGroups.map((group) => (
                      <div
                        key={`group-${group.id}`}
                        className="px-4 py-2.5 hover:bg-gray-50 cursor-pointer flex items-center justify-between group transition-colors"
                        onClick={() => handleSelectGroup(group.studentIds, group.name)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-5 h-5 rounded-full bg-ixl-turquoise-light flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 174, 239, 0.1)' }}>
                            <svg className="w-3 h-3 text-ixl-turquoise-dark" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                            </svg>
                          </div>
                          <span className="text-sm font-bold" style={{ color: 'var(--ixl-turquoise-dark)' }}>
                            {group.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteGroup(group.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all text-gray-400"
                          title="Delete group"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </>
                )}

                {filteredStudents.length > 0 && (
                  <>
                    <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50 border-t">
                      All Students
                    </div>
                    {filteredStudents.map((student) => {
                      const isSelected = selectedStudentIds.includes(student.id);
                      return (
                        <div
                          key={student.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStudent(student.id);
                            inputRef.current?.focus();
                          }}
                          className="px-4 py-2.5 hover:bg-gray-50 cursor-pointer flex items-center gap-3 transition-colors"
                        >
                          <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-ixl-turquoise border-ixl-turquoise' : 'border-gray-300'}`}
                            style={{
                              backgroundColor: isSelected ? 'var(--ixl-turquoise)' : 'transparent',
                              borderColor: isSelected ? 'var(--ixl-turquoise)' : '#d1d5db'
                            }}
                          >
                            {isSelected && (
                              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <span className="text-sm font-medium" style={{ color: 'var(--ixl-text)' }}>
                            {student.name}
                          </span>
                        </div>
                      );
                    })}
                  </>
                )}

                {filteredStudents.length === 0 && filteredGroups.length === 0 && (
                  <div className="p-8 text-center text-gray-400 text-sm">
                    No results found for "{searchQuery}"
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <button
          onClick={onSync}
          type="button"
          className="px-5 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-80 flex-shrink-0 align-top h-[48px]"
          style={{
            background: 'rgba(0, 174, 239, 0.1)',
            color: 'var(--ixl-turquoise-dark)',
            border: '1.5px solid rgba(0, 174, 239, 0.2)'
          }}
          title="Sync students from IXL website"
        >
          Sync
        </button>
      </div>
    </div>
  );
}

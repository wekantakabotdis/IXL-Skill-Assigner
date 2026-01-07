export default function Notification({ type, message, onClose }) {
  if (!message) return null;

  const styles = type === 'success' ? {
    bg: '#f0fdf4',
    border: '#bbf7d0',
    text: '#166534',
    icon: '✓'
  } : type === 'error' ? {
    bg: '#fef2f2',
    border: '#fecaca',
    text: '#991b1b',
    icon: '✕'
  } : {
    bg: '#fffaf5',
    border: '#fed7aa',
    text: '#9a3412',
    icon: 'ℹ'
  };

  return (
    <div className="fixed top-6 right-6 max-w-sm z-50 animate-slideInRight">
      <div 
        className="paper-card rounded-xl p-4 shadow-xl flex items-start gap-4"
        style={{ 
          background: styles.bg,
          borderColor: styles.border
        }}
      >
        <div 
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-sm"
          style={{ 
            background: type === 'success' ? '#dcfce7' : type === 'error' ? '#fee2e2' : '#ffedd5',
            color: styles.text
          }}
        >
          {styles.icon}
        </div>
        
        <div className="flex-1 pt-1">
          <p className="font-semibold text-sm mb-1" style={{ color: styles.text }}>
            {type === 'success' ? 'Success' : type === 'error' ? 'Error' : 'Note'}
          </p>
          <p className="text-sm leading-relaxed opacity-90" style={{ color: styles.text }}>
            {message}
          </p>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

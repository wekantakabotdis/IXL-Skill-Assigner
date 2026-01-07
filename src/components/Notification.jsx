export default function Notification({ type, message, onClose }) {
  if (!message) return null;

  const bgColor = type === 'success' ? 'bg-green-50 border-green-200' :
                  type === 'error' ? 'bg-red-50 border-red-200' :
                  'bg-blue-50 border-blue-200';

  const textColor = type === 'success' ? 'text-green-800' :
                    type === 'error' ? 'text-red-800' :
                    'text-blue-800';

  return (
    <div className={`fixed top-4 right-4 max-w-md ${bgColor} border rounded-lg shadow-lg p-4 z-50`}>
      <div className="flex items-start justify-between">
        <div className={`flex-1 ${textColor}`}>
          <p className="font-medium">
            {type === 'success' && '✓ Success'}
            {type === 'error' && '✗ Error'}
            {type === 'info' && 'ℹ Info'}
          </p>
          <p className="text-sm mt-1">{message}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className={`ml-4 ${textColor} hover:opacity-70`}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

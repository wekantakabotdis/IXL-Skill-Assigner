import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('React Error Boundary caught:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100vh',
                    background: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)',
                    fontFamily: 'Inter, sans-serif',
                    color: '#333'
                }}>
                    <div style={{
                        background: 'white',
                        padding: '40px',
                        borderRadius: '16px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                        textAlign: 'center',
                        maxWidth: '500px'
                    }}>
                        <h1 style={{ color: '#e53e3e', marginBottom: '16px' }}>Something went wrong</h1>
                        <p style={{ color: '#666', marginBottom: '20px' }}>
                            The app encountered an error. Try refreshing the page.
                        </p>
                        <pre style={{
                            background: '#f5f5f5',
                            padding: '12px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            overflowX: 'auto',
                            textAlign: 'left',
                            marginBottom: '20px'
                        }}>
                            {this.state.error?.message || 'Unknown error'}
                        </pre>
                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                background: '#00aeef',
                                color: 'white',
                                border: 'none',
                                padding: '12px 24px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: 'bold'
                            }}
                        >
                            Refresh Page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;

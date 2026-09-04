import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px',
          padding: '2rem',
          textAlign: 'center',
          backgroundColor: 'var(--color-bg)',
          color: 'var(--color-text)'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.25rem',
            color: 'var(--color-danger)'
          }}>
            <AlertTriangle size={32} />
          </div>

          <h2 style={{ fontSize: '1.35rem', fontWeight: '700', marginBottom: '0.5rem' }}>
            Ocurrió un error al cargar este módulo
          </h2>
          <p style={{ color: 'var(--color-text-light)', maxWidth: '480px', marginBottom: '1.5rem', fontSize: '0.9rem', lineHeight: '1.5' }}>
            {this.state.error?.message || 'Se produjo un fallo inesperado durante la ejecución. Puedes intentar recargar el módulo o volver al Dashboard.'}
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={this.handleReset}
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <RefreshCw size={16} />
              <span>Reintentar</span>
            </button>
            {this.props.onGoHome && (
              <button
                onClick={this.props.onGoHome}
                className="btn btn-outline"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <Home size={16} />
                <span>Ir al Dashboard</span>
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

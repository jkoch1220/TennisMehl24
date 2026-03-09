import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

/**
 * ErrorBoundary - Fängt React-Render-Fehler ab und zeigt eine Fehlerseite.
 *
 * Funktioniert auch wenn:
 * - Lazy-geladene Chunks nicht geladen werden können
 * - Komponenten während des Renderns crashen
 * - Netzwerkfehler beim dynamischen Import auftreten
 *
 * @example
 * <ErrorBoundary>
 *   <App />
 * </ErrorBoundary>
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Fehler-State setzen, damit nächstes Render die Fallback-UI zeigt
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Fehler-Info speichern für Debug-Ansicht
    this.setState({ errorInfo });

    // Logge den Fehler (könnte auch an einen Error-Tracking-Service gesendet werden)
    console.error('[ErrorBoundary] Fehler abgefangen:', error, errorInfo);
  }

  handleReload = (): void => {
    // Session-Storage Flag löschen um frischen Reload zu erlauben
    sessionStorage.removeItem('chunk_reload_attempted');
    window.location.reload();
  };

  toggleDetails = (): void => {
    this.setState(prev => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      // Wenn ein custom fallback übergeben wurde, nutze dieses
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Standard-Fehlerseite mit Dark Mode Support
      return (
        <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 dark:from-dark-bg dark:via-dark-bg dark:to-dark-surface flex items-center justify-center p-4 transition-colors duration-300">
          <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-2xl p-8 md:p-12 max-w-lg w-full text-center border border-gray-100 dark:border-dark-border">
            {/* Icon */}
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full mb-6">
              <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>

            {/* Überschrift */}
            <h1 className="text-2xl font-bold text-gray-800 dark:text-dark-text mb-3">
              Etwas ist schiefgelaufen
            </h1>

            {/* Beschreibung */}
            <p className="text-gray-600 dark:text-dark-textMuted mb-8 leading-relaxed">
              Ein unerwarteter Fehler ist aufgetreten.
              Bitte laden Sie die Seite neu, um fortzufahren.
            </p>

            {/* Reload Button */}
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2.5 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white py-3.5 px-7 rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
            >
              <RefreshCw className="w-5 h-5" />
              Seite neu laden
            </button>

            {/* Fehlerdetails (nur in Entwicklung) */}
            {import.meta.env.DEV && this.state.error && (
              <div className="mt-8 text-left">
                <button
                  onClick={this.toggleDetails}
                  className="flex items-center gap-2 text-sm text-gray-500 dark:text-dark-textMuted hover:text-gray-700 dark:hover:text-dark-text transition-colors w-full justify-center"
                >
                  {this.state.showDetails ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                  Fehlerdetails {this.state.showDetails ? 'ausblenden' : 'anzeigen'}
                </button>

                {this.state.showDetails && (
                  <div className="mt-4 p-4 bg-gray-100 dark:bg-dark-bg rounded-xl overflow-auto max-h-64 border border-gray-200 dark:border-dark-border">
                    <p className="text-sm font-mono text-red-600 dark:text-red-400 mb-3 font-medium">
                      {this.state.error.name}: {this.state.error.message}
                    </p>
                    {this.state.errorInfo?.componentStack && (
                      <pre className="text-xs text-gray-600 dark:text-dark-textMuted whitespace-pre-wrap font-mono leading-relaxed">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    // Kein Fehler: Kinder normal rendern
    return this.props.children;
  }
}

export default ErrorBoundary;

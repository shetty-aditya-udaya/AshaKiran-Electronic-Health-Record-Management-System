import React from 'react';
import { AlertTriangle, RefreshCw, Trash2, HelpCircle } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, showDetails: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary] Uncaught React exception:', error, errorInfo);

    // Call Sentry dynamically if initialized on window/global
    if (window.Sentry) {
      window.Sentry.captureException(error, { extra: errorInfo });
    }
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleEmergencyReset = async () => {
    if (window.confirm('This will unregister the service worker and clear the static cache to resolve update issues. Your offline database will NOT be lost. Proceed?')) {
      try {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const r of registrations) {
            await r.unregister();
          }
        }
        if (typeof caches !== 'undefined') {
          const keys = await caches.keys();
          for (const key of keys) {
            await caches.delete(key);
          }
        }
        sessionStorage.clear();
        alert('Caches and service workers successfully reset. Reloading now...');
        window.location.reload();
      } catch (err) {
        console.error('Failed to perform emergency reset:', err);
        alert('Reset failed: ' + err.message);
      }
    }
  };

  render() {
    if (this.state.hasError) {
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      const appVersion = '1.3';

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 md:p-8">
          <div className="w-full max-w-xl bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-xl shadow-slate-100 flex flex-col gap-6">
            
            {/* Header Icon & Title */}
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 animate-bounce">
                <AlertTriangle size={28} />
              </div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">
                Something went wrong
              </h1>
              <p className="text-sm text-slate-500 max-w-sm">
                An unexpected error occurred in the AshaKiran client interface. Our automated diagnostics system has flagged this session.
              </p>
            </div>

            {/* Diagnostics Snapshot */}
            <div className="bg-slate-50 rounded-2xl p-4 flex flex-col gap-2.5 text-xs text-slate-600 border border-slate-100">
              <p className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Diagnostics Snapshot</p>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div>
                  <span className="text-slate-400">Connection:</span>{' '}
                  <span className={`font-semibold ${isOnline ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">App Version:</span>{' '}
                  <span className="font-semibold text-slate-800">{appVersion}</span>
                </div>
                <div>
                  <span className="text-slate-400">Time:</span>{' '}
                  <span className="font-semibold text-slate-800">{new Date().toLocaleTimeString()}</span>
                </div>
                <div>
                  <span className="text-slate-400">Environment:</span>{' '}
                  <span className="font-semibold text-slate-800">Production</span>
                </div>
              </div>
            </div>

            {/* Error Details Accordion */}
            <div className="border border-slate-100 rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => this.setState((prev) => ({ showDetails: !prev }))}
                className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left flex items-center justify-between text-xs font-semibold text-slate-700"
              >
                <span>Error details ({this.state.error?.name || 'Error'})</span>
                <span className="text-[10px] text-teal-600 uppercase tracking-wider">
                  {this.state.showDetails ? 'Hide' : 'Show'}
                </span>
              </button>
              {this.state.showDetails && (
                <div className="p-4 bg-slate-900 text-slate-200 text-[10px] font-mono whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed border-t border-slate-100">
                  <p className="font-bold text-rose-400 mb-1">{this.state.error?.toString()}</p>
                  {this.state.errorInfo?.componentStack}
                </div>
              )}
            </div>

            {/* Resolution Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-teal-100"
              >
                <RefreshCw size={15} />
                Try Again
              </button>
              <button
                onClick={this.handleEmergencyReset}
                className="flex-1 bg-white hover:bg-slate-50 text-rose-600 border border-slate-200 font-semibold text-sm py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 size={15} />
                Emergency Reset
              </button>
            </div>

            <p className="text-[10px] text-center text-slate-400">
              Need technical support? Contact AshaKiran Dev Operations or visit the Diagnostics page if accessible.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

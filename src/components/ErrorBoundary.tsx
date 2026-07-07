import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] caught render error:', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleClearAndReload = () => {
    localStorage.clear();
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-cyan-200 p-8">
        <div className="max-w-lg space-y-4 text-center">
          <h1 className="text-xl font-bold text-pink-400">Something went wrong.</h1>
          <p className="text-sm text-cyan-300">
            PIXEL.PAL hit an unexpected error and can't continue rendering.
            Reloading usually fixes it. If it keeps happening, a saved
            palette or setting may be corrupted; clearing local data will
            reset the app (this deletes saved palettes stored in this
            browser).
          </p>
          <p className="text-xs font-mono text-cyan-500 break-all">
            {this.state.error.message}
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <button
              onClick={this.handleReload}
              className="px-4 py-2 rounded font-bold bg-cyan-300 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-200"
            >
              Reload
            </button>
            <button
              onClick={this.handleClearAndReload}
              className="px-4 py-2 rounded font-bold bg-pink-500 text-white border-2 border-pink-300 hover:bg-pink-400"
            >
              Clear local data &amp; reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorState } from './ui'

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Workspace rendering failed', error, info.componentStack)
  }
  render() {
    if (this.state.failed)
      return (
        <main className="boundary-state">
          <h1>We couldn’t display this workspace</h1>
          <ErrorState
            message="Reload the page to restore your session and try again."
            onRetry={() => window.location.reload()}
          />
        </main>
      )
    return this.props.children
  }
}

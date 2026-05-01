import * as React from 'react';
import type { ReactNode } from 'react';

interface Props {
  name: string;
  children: ReactNode;
}

interface State {
  error: string | null;
}

export default class SectionBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(e: Error) {
    return { error: `${e.message}\n${e.stack}` };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 8, fontFamily: 'monospace', fontSize: 10, color: '#c00', background: '#fee', border: '1px solid #c00', margin: 4, borderRadius: 4 }}>
          <strong>Error in {this.props.name}:</strong>
          <pre style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{this.state.error}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

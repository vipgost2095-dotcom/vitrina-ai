import React from 'react';

// Без этого компонента любая ошибка рендера (например, TonConnect не смог
// загрузить манифест, или где-то undefined) приводит к полностью пустому
// экрану без единой подсказки, что случилось. С ним — видно текст ошибки
// прямо в приложении, что сильно ускоряет диагностику.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Ошибка рендера приложения:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, fontFamily: 'monospace', color: '#ef4444', whiteSpace: 'pre-wrap' }}>
          <h2 style={{ color: '#ef4444' }}>Ошибка в приложении</h2>
          <p>{String(this.state.error?.message || this.state.error)}</p>
          <pre style={{ fontSize: 11, opacity: 0.7 }}>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

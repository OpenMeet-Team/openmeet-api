export function getStyles(theme: 'light' | 'dark'): string {
  const colors =
    theme === 'dark'
      ? {
          bg: '#1a1a2e',
          cardBg: '#16213e',
          text: '#e0e0e0',
          textSecondary: '#a0a0b0',
          accent: '#4fc3f7',
          border: '#2a2a4a',
          hoverBg: '#1e2d4d',
        }
      : {
          bg: '#ffffff',
          cardBg: '#ffffff',
          text: '#1a1a1a',
          textSecondary: '#666666',
          accent: '#1976d2',
          border: '#e0e0e0',
          hoverBg: '#f5f5f5',
        };

  return `
    :host {
      display: block;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: ${colors.text};
      background: ${colors.bg};
      border: 1px solid ${colors.border};
      border-radius: 8px;
      overflow: hidden;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    a { color: ${colors.accent}; text-decoration: none; }
    a:hover { text-decoration: underline; }

    .om-header {
      padding: 16px;
      border-bottom: 1px solid ${colors.border};
    }

    .om-header h2 {
      font-size: 18px;
      font-weight: 600;
      margin: 0;
    }

    .om-header h2 a { color: ${colors.text}; }

    .om-events { padding: 0; }

    .om-event-item {
      display: flex;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid ${colors.border};
      transition: background 0.15s;
    }
    .om-event-item:last-child { border-bottom: none; }
    .om-event-item:hover { background: ${colors.hoverBg}; }

    .om-event-image {
      flex-shrink: 0;
      width: 80px;
      height: 60px;
      border-radius: 6px;
      object-fit: cover;
      background: ${colors.border};
    }

    .om-event-content {
      flex: 1;
      min-width: 0;
    }

    .om-event-name {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .om-event-name a { color: ${colors.text}; }

    .om-event-date {
      font-size: 12px;
      color: ${colors.accent};
      margin-bottom: 2px;
    }

    .om-event-meta {
      font-size: 12px;
      color: ${colors.textSecondary};
    }

    /* Card layout */
    .om-events--cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 12px;
      padding: 12px;
    }

    .om-events--cards .om-event-item {
      flex-direction: column;
      border: 1px solid ${colors.border};
      border-radius: 8px;
      padding: 0;
      overflow: hidden;
    }

    .om-events--cards .om-event-image {
      width: 100%;
      height: 140px;
      border-radius: 0;
    }

    .om-events--cards .om-event-content {
      padding: 12px;
    }

    .om-empty {
      padding: 24px 16px;
      text-align: center;
      color: ${colors.textSecondary};
      font-size: 14px;
    }

    .om-footer {
      padding: 10px 16px;
      border-top: 1px solid ${colors.border};
      text-align: center;
      font-size: 11px;
      color: ${colors.textSecondary};
    }

    .om-loading {
      padding: 16px;
    }

    .om-skeleton {
      background: ${colors.border};
      border-radius: 4px;
      margin-bottom: 12px;
      animation: om-pulse 1.5s ease-in-out infinite;
    }

    .om-skeleton--title { height: 20px; width: 60%; }
    .om-skeleton--row { height: 48px; width: 100%; }

    @keyframes om-pulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 0.8; }
    }

    .om-error {
      padding: 24px 16px;
      text-align: center;
      color: ${colors.textSecondary};
      font-size: 14px;
    }
  `;
}

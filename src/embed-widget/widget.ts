import { WidgetConfig, EmbedResponse, EmbedEvent } from './types';
import { getStyles } from './styles';
import { escapeHtml, formatEventDate, truncate } from './utils';

(function () {
  function parseConfig(script: HTMLScriptElement): WidgetConfig | null {
    const group = script.getAttribute('data-openmeet-group');
    const tenant = script.getAttribute('data-openmeet-tenant');
    if (!group || !tenant) return null;

    const limitRaw = parseInt(
      script.getAttribute('data-openmeet-limit') || '5',
      10,
    );

    return {
      group,
      tenant,
      theme:
        (script.getAttribute('data-openmeet-theme') as 'light' | 'dark') ||
        'light',
      limit: Math.max(1, Math.min(20, isNaN(limitRaw) ? 5 : limitRaw)),
      layout:
        (script.getAttribute('data-openmeet-layout') as 'list' | 'cards') ||
        'list',
      api:
        script.getAttribute('data-openmeet-api') || 'https://api.openmeet.net',
    };
  }

  function renderLoading(): string {
    return `
      <div class="om-loading">
        <div class="om-skeleton om-skeleton--title"></div>
        <div class="om-skeleton om-skeleton--row"></div>
        <div class="om-skeleton om-skeleton--row"></div>
        <div class="om-skeleton om-skeleton--row"></div>
      </div>
    `;
  }

  function renderError(): string {
    return `<div class="om-error">Unable to load events. Please try again later.</div>`;
  }

  function renderEvent(event: EmbedEvent, layout: 'list' | 'cards'): string {
    const imageHtml = event.imageUrl
      ? `<img class="om-event-image" src="${escapeHtml(event.imageUrl)}" alt="" loading="lazy" />`
      : layout === 'cards'
        ? `<div class="om-event-image"></div>`
        : '';

    const locationParts: string[] = [];
    if (event.location) locationParts.push(escapeHtml(event.location));
    if (event.attendeesCount > 0)
      locationParts.push(
        `${event.attendeesCount} attendee${event.attendeesCount !== 1 ? 's' : ''}`,
      );

    return `
      <div class="om-event-item">
        ${imageHtml}
        <div class="om-event-content">
          <div class="om-event-name">
            <a href="${escapeHtml(event.url)}" target="_blank" rel="noopener">${escapeHtml(event.name)}</a>
          </div>
          <div class="om-event-date">${escapeHtml(formatEventDate(event.startDate, event.timeZone))}</div>
          ${locationParts.length ? `<div class="om-event-meta">${escapeHtml(locationParts.join(' \u00B7 '))}</div>` : ''}
        </div>
      </div>
    `;
  }

  function renderWidget(data: EmbedResponse, config: WidgetConfig): string {
    const eventsClass =
      config.layout === 'cards' ? 'om-events om-events--cards' : 'om-events';

    const eventsHtml =
      data.events.length > 0
        ? data.events
            .map((e) => renderEvent(e, config.layout))
            .join('')
        : `<div class="om-empty">No upcoming events</div>`;

    return `
      <div class="om-header">
        <h2><a href="${escapeHtml(data.group.url)}" target="_blank" rel="noopener">${escapeHtml(data.group.name)}</a></h2>
      </div>
      <div class="${eventsClass}">
        ${eventsHtml}
      </div>
      <div class="om-footer">
        Powered by <a href="${escapeHtml(data.meta.platformUrl)}" target="_blank" rel="noopener">OpenMeet</a>
      </div>
    `;
  }

  async function initWidget(script: HTMLScriptElement): Promise<void> {
    const config = parseConfig(script);
    if (!config) return;

    // Create container after the script tag
    const container = document.createElement('div');
    script.parentNode!.insertBefore(container, script.nextSibling);

    // Attach shadow DOM
    const shadow = container.attachShadow({ mode: 'open' });

    // Add styles
    const styleEl = document.createElement('style');
    styleEl.textContent = getStyles(config.theme);
    shadow.appendChild(styleEl);

    // Add loading skeleton
    const root = document.createElement('div');
    root.innerHTML = renderLoading();
    shadow.appendChild(root);

    try {
      const url = `${config.api}/api/embed/groups/${encodeURIComponent(config.group)}/events?limit=${config.limit}`;
      const response = await fetch(url, {
        headers: { 'X-Tenant-ID': config.tenant },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: EmbedResponse = await response.json();
      root.innerHTML = renderWidget(data, config);
    } catch {
      root.innerHTML = renderError();
    }
  }

  // Find all widget script tags and initialize
  function init(): void {
    const scripts = document.querySelectorAll<HTMLScriptElement>(
      'script[data-openmeet-group]',
    );
    scripts.forEach((script) => initWidget(script));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

const OVERLAY_ID = 'fd-ampliar-overlay';

const applyButtonStyles = (buttonEl) => {
  buttonEl.type = 'button';
  buttonEl.textContent = '⤢';
  buttonEl.style.position = 'absolute';
  buttonEl.style.top = '8px';
  buttonEl.style.right = '8px';
  buttonEl.style.zIndex = '10';
  buttonEl.style.border = '1px solid rgba(255,255,255,0.1)';
  buttonEl.style.borderRadius = '8px';
  buttonEl.style.background = 'rgba(17,20,26,0.6)';
  buttonEl.style.color = 'rgba(255,255,255,0.7)';
  buttonEl.style.padding = '4px 8px';
  buttonEl.style.fontSize = '12px';
  buttonEl.style.lineHeight = '1';
  buttonEl.style.cursor = 'pointer';
  buttonEl.style.opacity = '0.8';
  buttonEl.style.transition = 'opacity 0.2s ease, background 0.2s ease, color 0.2s ease';
  buttonEl.setAttribute('aria-label', 'Ampliar');

  buttonEl.addEventListener('mouseenter', () => {
    buttonEl.style.opacity = '1';
    buttonEl.style.background = 'rgba(17,20,26,0.9)';
    buttonEl.style.color = 'rgba(255,255,255,1)';
  });

  buttonEl.addEventListener('mouseleave', () => {
    buttonEl.style.opacity = '0.8';
    buttonEl.style.background = 'rgba(17,20,26,0.6)';
    buttonEl.style.color = 'rgba(255,255,255,0.7)';
  });
};

const closeExistingOverlay = () => {
  const current = document.getElementById(OVERLAY_ID);
  if (current) {
    current.remove();
  }
};

const createFrame = ({ htmlContent, src, type = 'html' }) => {
  const iframeEl = document.createElement('iframe');
  iframeEl.title = type === 'pdf' ? 'PDF Preview' : 'HTML Preview';
  if (type !== 'pdf') {
    iframeEl.sandbox = 'allow-scripts allow-same-origin allow-forms allow-modals';
  }
  iframeEl.style.width = '100%';
  iframeEl.style.height = '100%';
  iframeEl.style.border = 'none';
  iframeEl.style.background = 'white';

  if (src) {
    iframeEl.src = src;
  } else {
    iframeEl.srcdoc = htmlContent ?? '';
  }

  return iframeEl;
};

const createTextContent = ({ textContent }) => {
  const contentEl = document.createElement('div');
  contentEl.style.width = '100%';
  contentEl.style.height = '100%';
  contentEl.style.overflow = 'auto';
  contentEl.style.padding = '24px';
  contentEl.style.boxSizing = 'border-box';
  contentEl.style.whiteSpace = 'pre-wrap';
  contentEl.style.wordBreak = 'break-word';
  contentEl.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace';
  contentEl.style.fontSize = '13px';
  contentEl.style.lineHeight = '1.6';
  contentEl.style.color = '#e4e4e7';
  contentEl.style.background = '#0f1115';
  contentEl.textContent = textContent ?? '';
  return contentEl;
};

const openExpandOverlay = (descriptor) => {
  closeExistingOverlay();

  const overlayEl = document.createElement('div');
  overlayEl.id = OVERLAY_ID;
  overlayEl.style.position = 'fixed';
  overlayEl.style.inset = '0';
  overlayEl.style.zIndex = '9999';
  overlayEl.style.display = 'flex';
  overlayEl.style.alignItems = 'center';
  overlayEl.style.justifyContent = 'center';
  overlayEl.style.padding = '24px';
  overlayEl.style.background = 'rgba(0,0,0,0.8)';
  overlayEl.style.backdropFilter = 'blur(4px)';

  const boxEl = document.createElement('div');
  boxEl.id = 'fd-ampliar-box';
  boxEl.style.position = 'relative';
  boxEl.style.width = '85vw';
  boxEl.style.height = '88vh';
  boxEl.style.overflow = 'hidden';
  boxEl.style.borderRadius = '28px';
  boxEl.style.border = '1px solid rgba(255,255,255,0.1)';
  boxEl.style.background = '#11141a';
  boxEl.style.boxShadow = '0 24px 80px rgba(0,0,0,0.45)';

  const closeButtonEl = document.createElement('button');
  closeButtonEl.id = 'fd-ampliar-close';
  closeButtonEl.type = 'button';
  closeButtonEl.textContent = '✕';
  closeButtonEl.style.position = 'absolute';
  closeButtonEl.style.top = '12px';
  closeButtonEl.style.right = '12px';
  closeButtonEl.style.zIndex = '1';
  closeButtonEl.style.border = '1px solid rgba(255,255,255,0.1)';
  closeButtonEl.style.borderRadius = '10px';
  closeButtonEl.style.background = 'rgba(17,20,26,0.72)';
  closeButtonEl.style.color = 'rgba(255,255,255,0.8)';
  closeButtonEl.style.padding = '6px 10px';
  closeButtonEl.style.cursor = 'pointer';

  const closeOverlay = () => {
    document.removeEventListener('keydown', handleEscape);
    overlayEl.remove();
  };

  const handleEscape = (event) => {
    if (event.key === 'Escape') {
      closeOverlay();
    }
  };

  closeButtonEl.addEventListener('click', closeOverlay);
  overlayEl.addEventListener('click', (event) => {
    if (event.target === overlayEl) {
      closeOverlay();
    }
  });

  const contentEl =
    descriptor.type === 'text'
      ? createTextContent(descriptor)
      : createFrame({
          type: descriptor.type,
          htmlContent: descriptor.htmlContent,
          src: descriptor.src,
        });

  boxEl.appendChild(closeButtonEl);
  boxEl.appendChild(contentEl);
  overlayEl.appendChild(boxEl);
  document.body.appendChild(overlayEl);
  document.addEventListener('keydown', handleEscape);
};

export function attachExpandButton(containerEl, getContentFn) {
  if (!containerEl || typeof getContentFn !== 'function') {
    return () => {};
  }

  if (containerEl.dataset.expandAttached === 'true') {
    return () => {};
  }

  if (getComputedStyle(containerEl).position === 'static') {
    containerEl.style.position = 'relative';
  }

  const buttonEl = document.createElement('button');
  applyButtonStyles(buttonEl);

  const handleClick = () => {
    const descriptor = getContentFn();
    if (!descriptor) return;
    openExpandOverlay(descriptor);
  };

  buttonEl.addEventListener('click', handleClick);
  containerEl.appendChild(buttonEl);
  containerEl.dataset.expandAttached = 'true';

  return () => {
    buttonEl.removeEventListener('click', handleClick);
    if (buttonEl.parentNode === containerEl) {
      containerEl.removeChild(buttonEl);
    }
    delete containerEl.dataset.expandAttached;
  };
}

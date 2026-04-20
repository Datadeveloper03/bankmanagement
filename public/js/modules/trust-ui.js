/**
 * trust-ui.js — Trust-Driven Motion UI Module
 * Bank Management System
 *
 * Exports:
 *   - class ToastManager
 *   - function setButtonState(el, state)
 *   - function animateCurrencyCount(el, startVal, endVal, duration)
 *   - class SkeletonManager
 *   - class ConfirmModal
 */

// ============================================================
// Reduced Motion Detection
// ============================================================
const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============================================================
// Toast Manager
// ============================================================

const TOAST_ICONS = {
  success: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13.5 4.5L6.5 11.5L2.5 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  error: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  info: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 5.5V5m0 6V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  warning: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L14.5 13H1.5L8 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6.5v3M8 11.5v-.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
};

class ToastManager {
  constructor() {
    this.container = null;
    this.toasts = [];
    this._init();
  }

  _init() {
    if (document.querySelector('.toast-container')) {
      this.container = document.querySelector('.toast-container');
      return;
    }
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    this.container.setAttribute('role', 'status');
    this.container.setAttribute('aria-live', 'polite');
    this.container.setAttribute('aria-label', 'Notifications');
    document.body.appendChild(this.container);
  }

  /**
   * Show a toast notification
   * @param {Object} options
   * @param {'success'|'error'|'info'|'warning'} options.type
   * @param {string} options.title
   * @param {string} options.message
   * @param {number} [options.duration=2500] - ms before auto-dismiss
   * @returns {HTMLElement} toast element
   */
  show({ type = 'info', title = '', message = '', duration = 2500 } = {}) {
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.setAttribute('role', 'alert');

    toast.innerHTML = `
      <span class="toast__icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</span>
      <div class="toast__content">
        ${title ? `<div class="toast__title">${this._escapeHTML(title)}</div>` : ''}
        ${message ? `<div class="toast__message">${this._escapeHTML(message)}</div>` : ''}
      </div>
      <button class="toast__close" aria-label="Dismiss notification">&times;</button>
      <div class="toast__progress" style="--motion-duration-reading: ${duration}ms"></div>
    `;

    // Close button handler
    const closeBtn = toast.querySelector('.toast__close');
    closeBtn.addEventListener('click', () => this._dismiss(toast));

    this.container.appendChild(toast);
    this.toasts.push(toast);

    // Auto-dismiss
    const timeoutId = setTimeout(() => this._dismiss(toast), duration);
    toast._timeoutId = timeoutId;

    return toast;
  }

  /** Convenience methods */
  success(title, message, duration) {
    return this.show({ type: 'success', title, message, duration });
  }

  error(title, message, duration) {
    return this.show({ type: 'error', title, message, duration });
  }

  info(title, message, duration) {
    return this.show({ type: 'info', title, message, duration });
  }

  warning(title, message, duration) {
    return this.show({ type: 'warning', title, message, duration });
  }

  _dismiss(toast) {
    if (toast._dismissed) return;
    toast._dismissed = true;

    clearTimeout(toast._timeoutId);

    if (prefersReducedMotion()) {
      toast.remove();
      this.toasts = this.toasts.filter((t) => t !== toast);
      return;
    }

    toast.classList.add('toast--exiting');
    toast.addEventListener(
      'animationend',
      () => {
        toast.remove();
        this.toasts = this.toasts.filter((t) => t !== toast);
      },
      { once: true }
    );
  }

  dismissAll() {
    [...this.toasts].forEach((t) => this._dismiss(t));
  }

  _escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

// ============================================================
// Button State Machine
// ============================================================

/**
 * Set a button's visual and ARIA state
 * @param {HTMLElement} el - The button element (should have .btn-trust class)
 * @param {'idle'|'loading'|'success'|'error'} state
 * @param {Object} [options]
 * @param {string} [options.loadingText='Processing...']
 * @param {string} [options.successText='Done!']
 * @param {string} [options.errorText='Failed']
 * @param {number} [options.resetDelay=1500] - ms before returning to idle
 */
function setButtonState(el, state, options = {}) {
  const {
    loadingText = 'Processing...',
    successText = 'Done!',
    errorText = 'Failed',
    resetDelay = 1500,
  } = options;

  // Clear any existing reset timeout
  if (el._resetTimeout) {
    clearTimeout(el._resetTimeout);
    el._resetTimeout = null;
  }

  // Store original text if not already stored
  if (!el._originalHTML) {
    el._originalHTML = el.innerHTML;
  }

  // Remove all state classes
  el.classList.remove('btn-trust--loading', 'btn-trust--success', 'btn-trust--error');

  switch (state) {
    case 'loading':
      el.setAttribute('aria-disabled', 'true');
      el.disabled = true;
      el.classList.add('btn-trust--loading');
      el.innerHTML = `
        <span class="btn-text" style="opacity:0">${el._originalHTML}</span>
        <span class="btn-spinner"><span class="spinner" role="status"><span class="sr-only">Loading...</span></span></span>
      `;
      el.setAttribute('aria-label', loadingText);
      break;

    case 'success':
      el.setAttribute('aria-disabled', 'true');
      el.disabled = true;
      el.classList.add('btn-trust--success');
      el.innerHTML = `<span>✓ ${successText}</span>`;
      el.setAttribute('aria-label', successText);

      el._resetTimeout = setTimeout(() => {
        setButtonState(el, 'idle');
      }, resetDelay);
      break;

    case 'error':
      el.setAttribute('aria-disabled', 'true');
      el.disabled = true;
      el.classList.add('btn-trust--error');
      el.innerHTML = `<span>✕ ${errorText}</span>`;
      el.setAttribute('aria-label', errorText);

      el._resetTimeout = setTimeout(() => {
        setButtonState(el, 'idle');
      }, resetDelay);
      break;

    case 'idle':
    default:
      el.removeAttribute('aria-disabled');
      el.disabled = false;
      el.innerHTML = el._originalHTML;
      el.removeAttribute('aria-label');
      el._originalHTML = null;
      break;
  }
}

// ============================================================
// Currency Counter Animation
// ============================================================

/**
 * Animate a currency element from startVal to endVal
 * @param {HTMLElement} el - Element to animate
 * @param {number} startVal - Starting value (e.g., 1000)
 * @param {number} endVal - Ending value (e.g., 1500)
 * @param {number} [duration=300] - Animation duration in ms
 * @param {string} [prefix='$'] - Currency prefix
 */
function animateCurrencyCount(el, startVal, endVal, duration = 300, prefix = '$') {
  if (prefersReducedMotion()) {
    el.textContent = `${prefix}${formatNumber(endVal)}`;
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const startTime = performance.now();
    const diff = endVal - startVal;
    el.classList.add('currency-value--updating');

    function tick(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out quad for natural deceleration
      const eased = 1 - (1 - progress) * (1 - progress);
      const currentVal = startVal + diff * eased;

      el.textContent = `${prefix}${formatNumber(currentVal)}`;

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = `${prefix}${formatNumber(endVal)}`;
        el.classList.remove('currency-value--updating');
        resolve();
      }
    }

    requestAnimationFrame(tick);
  });
}

function formatNumber(num) {
  return Number(num)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ============================================================
// Shake Animation (for error inputs)
// ============================================================

/**
 * Apply shake animation to an element
 * @param {HTMLElement} el
 * @returns {Promise} resolves when animation completes
 */
function shakeElement(el) {
  return new Promise((resolve) => {
    el.classList.remove('shake');
    // Force reflow to restart animation
    void el.offsetWidth;
    el.classList.add('shake');
    el.classList.add('form-input--error');

    el.addEventListener(
      'animationend',
      () => {
        el.classList.remove('shake');
        resolve();
      },
      { once: true }
    );

    // Fallback for reduced motion
    if (prefersReducedMotion()) {
      setTimeout(resolve, 50);
    }
  });
}

// ============================================================
// Skeleton Manager
// ============================================================

class SkeletonManager {
  /**
   * Replace skeleton placeholders with real content
   * @param {HTMLElement} skeletonContainer - The skeleton wrapper
   * @param {HTMLElement} realContent - The real content element
   * @param {number} [duration=300] - Cross-fade duration
   */
  static crossFade(skeletonContainer, realContent, duration = 300) {
    if (prefersReducedMotion()) {
      skeletonContainer.style.display = 'none';
      realContent.style.display = '';
      realContent.style.opacity = '1';
      return;
    }

    skeletonContainer.classList.add('skeleton-fade-out');
    realContent.style.opacity = '0';
    realContent.style.display = '';

    skeletonContainer.addEventListener(
      'animationend',
      () => {
        skeletonContainer.style.display = 'none';
        realContent.classList.add('content-fade-in');
      },
      { once: true }
    );
  }

  /**
   * Generate skeleton HTML for a stat card
   * @returns {string}
   */
  static statCardSkeleton() {
    return `
      <div class="stat-card">
        <div class="skeleton skeleton--text-short"></div>
        <div class="skeleton skeleton--balance"></div>
        <div class="skeleton skeleton--text-short" style="width:30%;height:10px;"></div>
      </div>
    `;
  }

  /**
   * Generate skeleton HTML for a table row
   * @param {number} cols - Number of columns
   * @returns {string}
   */
  static tableRowSkeleton(cols = 5) {
    let cells = '';
    for (let i = 0; i < cols; i++) {
      const width = 40 + Math.random() * 40;
      cells += `<td><div class="skeleton skeleton--text" style="width:${width}%"></div></td>`;
    }
    return `<tr class="skeleton-row">${cells}</tr>`;
  }

  /**
   * Highlight a newly added row
   * @param {HTMLElement} row
   */
  static highlightNewRow(row) {
    row.classList.add('row-highlight-new');
    row.addEventListener(
      'animationend',
      () => {
        row.classList.remove('row-highlight-new');
      },
      { once: true }
    );
  }
}

// ============================================================
// Confirm Modal
// ============================================================

class ConfirmModal {
  /**
   * Show a confirmation modal for destructive actions
   * @param {Object} options
   * @param {string} options.title
   * @param {string} options.message
   * @param {string} [options.confirmText='Confirm']
   * @param {string} [options.cancelText='Cancel']
   * @param {boolean} [options.danger=true]
   * @returns {Promise<boolean>} - Resolves true if confirmed
   */
  static show({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = true }) {
    return new Promise((resolve) => {
      // Backdrop
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.setAttribute('role', 'presentation');

      // Dialog
      const dialog = document.createElement('div');
      dialog.className = 'modal-dialog';
      dialog.setAttribute('role', 'alertdialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', 'modal-title');
      dialog.setAttribute('aria-describedby', 'modal-body');

      dialog.innerHTML = `
        <div class="modal-content">
          <h2 class="modal-content__title" id="modal-title">${title}</h2>
          <p class="modal-content__body" id="modal-body">${message}</p>
          <div class="modal-content__actions">
            <button class="btn btn--secondary btn-trust" id="modal-cancel">${cancelText}</button>
            <button class="btn ${danger ? 'btn--danger' : 'btn--primary'} btn-trust" id="modal-confirm">${confirmText}</button>
          </div>
        </div>
      `;

      document.body.appendChild(backdrop);
      document.body.appendChild(dialog);

      // Focus trap
      const confirmBtn = dialog.querySelector('#modal-confirm');
      const cancelBtn = dialog.querySelector('#modal-cancel');
      confirmBtn.focus();

      const close = (result) => {
        if (prefersReducedMotion()) {
          backdrop.remove();
          dialog.remove();
          resolve(result);
          return;
        }

        backdrop.classList.add('modal-backdrop--exiting');
        dialog.classList.add('modal-dialog--exiting');

        dialog.addEventListener(
          'animationend',
          () => {
            backdrop.remove();
            dialog.remove();
            resolve(result);
          },
          { once: true }
        );
      };

      confirmBtn.addEventListener('click', () => close(true));
      cancelBtn.addEventListener('click', () => close(false));
      backdrop.addEventListener('click', () => close(false));

      // ESC key
      const onKeyDown = (e) => {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', onKeyDown);
          close(false);
        }
        // Trap tab focus within modal
        if (e.key === 'Tab') {
          const focusable = dialog.querySelectorAll('button');
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };
      document.addEventListener('keydown', onKeyDown);
    });
  }
}

// ============================================================
// Row Deletion Animation
// ============================================================

/**
 * Animate a table row being deleted
 * @param {HTMLElement} row - The <tr> element
 * @returns {Promise} resolves when animation completes
 */
function animateRowDeletion(row) {
  return new Promise((resolve) => {
    if (prefersReducedMotion()) {
      row.remove();
      resolve();
      return;
    }

    row.classList.add('row-slide-out');
    row.addEventListener(
      'animationend',
      () => {
        row.remove();
        resolve();
      },
      { once: true }
    );
  });
}

// ============================================================
// Screen-reader only utility
// ============================================================
const srOnlyStyle = `
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

// Add sr-only style globally
if (!document.querySelector('#sr-only-style')) {
  const style = document.createElement('style');
  style.id = 'sr-only-style';
  style.textContent = `.sr-only { ${srOnlyStyle} }`;
  document.head.appendChild(style);
}

// ============================================================
// Exports
// ============================================================
export {
  ToastManager,
  setButtonState,
  animateCurrencyCount,
  shakeElement,
  SkeletonManager,
  ConfirmModal,
  animateRowDeletion,
  formatNumber,
  prefersReducedMotion,
};

/**
 * Plugin-owned stylesheet for the Save Idea surface, injected as one tagged
 * style element at bundle materialization (the factory-execution side effect
 * the client module model documents). Tagged with data-plugin so HMR
 * bookkeeping can claim it.
 * @module @dsh-external/dsh-idea/client/styles
 */

const PLUGIN_ID = '@dsh-external/dsh-idea'
const CSS_ID = `${PLUGIN_ID}/client.css`

const CSS = `
.dsh-idea-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* Rides the Settings font-size axis like the host row's own actions. */
  width: calc(28px + var(--dsh-content-font-delta, 0px));
  height: calc(28px + var(--dsh-content-font-delta, 0px));
  padding: 6px;
  border: none;
  border-radius: 28px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font-size: calc(15px + var(--dsh-content-font-delta, 0px));
  line-height: 1;
  cursor: pointer;
}
.dsh-idea-action:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
.dsh-idea-action:disabled {
  cursor: default;
  opacity: 0.4;
}
.dsh-idea-action-text {
  width: auto;
  padding: 0 10px;
  font-size: calc(13px + var(--dsh-content-font-delta, 0px));
}
.dsh-idea-related {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dsh-idea-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-primary, rgba(127, 127, 127, 0.35));
  border-radius: 10px;
}
.dsh-idea-card .dsh-idea-detail-text {
  margin: 0;
}
.dsh-idea-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dsh-idea-source {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.dsh-idea-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
}
.dsh-idea-field > input,
.dsh-idea-field > textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border: 1px solid var(--dsw-alias-border-primary, rgba(127, 127, 127, 0.35));
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
}
.dsh-idea-field > textarea {
  min-height: 56px;
  resize: vertical;
}
.dsh-idea-field > input:disabled,
.dsh-idea-field > textarea:disabled {
  opacity: 0.6;
}
.dsh-idea-library {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dsh-idea-state {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
}
.dsh-idea-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.dsh-idea-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-primary, rgba(127, 127, 127, 0.35));
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dsh-idea-row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-idea-row-title {
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}
.dsh-idea-row-core {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  /* The index row is deliberately lightweight: one core line only. */
  -webkit-line-clamp: 1;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
}
.dsh-idea-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsh-idea-library-search {
  box-sizing: border-box;
  width: 100%;
  padding: 6px 10px;
  /* T9R2 R3: the idle state carries a visible border (the former token
     resolved to transparent); focus only deepens it. */
  border: 1px solid var(--dsw-alias-border-l3, rgba(127, 127, 127, 0.35));
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font-size: 13px;
  line-height: 20px;
}
.dsh-idea-library-search:focus {
  border-color: var(--dsw-alias-border-l4, rgba(127, 127, 127, 0.55));
}
.dsh-idea-back-row {
  display: flex;
  justify-content: flex-start;
}
.dsh-idea-search-scope-current,
.dsh-idea-search-scope-archived {
  color: var(--dsw-alias-label-tertiary);
}
.dsh-idea-search-scope-archived {
  color: var(--dsw-alias-label-warning, var(--dsw-alias-label-secondary));
}
.dsh-idea-preview {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 320px;
  padding: 2px;
}
/* The feature-owned hover card rides above the settings modal layer (its
   full-viewport mask, z-index 1000, blocked the primitive's z-100 card from
   receiving clicks). T9R2 R4: the surface follows the theme — light alias
   (white) plus a hairline border in the light theme, the original dark
   surface preserved under the dark theme — so the card's dark label-alias
   text stays readable. */
.dsh-idea-hover-root {
  position: relative;
  display: block;
}
.dsh-idea-hover-card {
  position: fixed;
  z-index: 1001;
  box-sizing: border-box;
  width: 244px;
  padding: 12px 16px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1, #fff);
  box-shadow: var(--dsw-shadow-lv3);
}
body[data-ds-dark-theme] .dsh-idea-hover-card {
  border-color: transparent;
  background: #2C2C2E;
}
.dsh-idea-preview-title {
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}
.dsh-idea-preview-core {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
}
.dsh-idea-preview-line {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dsh-idea-preview-text {
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 13px;
  line-height: 20px;
}
.dsh-idea-preview-meta {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.dsh-idea-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.dsh-idea-actions .dsh-idea-state {
  flex-basis: 100%;
}
.dsh-idea-row-meta {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.dsh-idea-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dsh-idea-detail-title {
  margin: 0;
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}
/* T9R2 R8: each detail field reads as one lightweight bordered card —
   restrained border, small radius, steady padding; the detail column's own
   12px gap supplies the spacing between cards. Detail-only: the preview
   card never uses this class. */
.dsh-idea-detail-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l3, rgba(127, 127, 127, 0.35));
  border-radius: 10px;
}
.dsh-idea-detail-label {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.dsh-idea-detail-text {
  margin: 0;
  white-space: pre-wrap;
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 13px;
  line-height: 20px;
}
.dsh-idea-detail-list {
  margin: 0;
  padding-left: 18px;
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 13px;
  line-height: 20px;
}
.dsh-idea-history {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dsh-idea-history-current {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
}
.dsh-idea-history-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.dsh-idea-history-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
}
.dsh-idea-history-version,
.dsh-idea-history-reason {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  white-space: nowrap;
}
.dsh-idea-history-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-idea-evolution {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dsh-idea-evolution-actions {
  display: flex;
  gap: 8px;
}
.dsh-idea-card-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
/* The conversation search card rides on the composer's overlay seat: the
   transparent backdrop catches outside clicks (close, zero side effects),
   the card floats above the composer. */
.dsh-idea-search-layer {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  pointer-events: none;
}
.dsh-idea-search-backdrop {
  position: absolute;
  inset: 0;
  pointer-events: auto;
}
.dsh-idea-search {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
  width: min(480px, calc(100vw - 48px));
  max-height: min(420px, calc(100vh - 160px));
  margin-bottom: 84px;
  padding: 12px 16px;
  border-radius: 12px;
  background: #2C2C2E;
  box-shadow: var(--dsw-shadow-lv3);
  pointer-events: auto;
}
.dsh-idea-search-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.dsh-idea-search-title {
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}
.dsh-idea-search-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.dsh-idea-search-close:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
.dsh-idea-search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border: 1px solid var(--dsw-alias-border-primary, rgba(127, 127, 127, 0.35));
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
}
.dsh-idea-search-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  min-height: 48px;
}
.dsh-idea-search-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dsh-idea-search-row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-idea-search-row-selected,
.dsh-idea-search-row-selected:hover {
  border-color: var(--dsw-alias-border-primary, rgba(127, 127, 127, 0.35));
  background: var(--dsw-alias-interactive-bg-selected, var(--dsw-alias-interactive-bg-hover));
}
.dsh-idea-search-foot {
  display: flex;
  justify-content: flex-end;
}
`

if (typeof document !== 'undefined' && document.querySelector(`style[data-plugin-css='${CSS_ID}']`) === null) {
  const tag = document.createElement('style')
  tag.dataset.plugin = PLUGIN_ID
  tag.dataset.pluginCss = CSS_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

export {}

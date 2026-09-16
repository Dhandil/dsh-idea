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
  -webkit-line-clamp: 2;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
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
.dsh-idea-detail-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
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
`

if (typeof document !== 'undefined' && document.querySelector(`style[data-plugin-css='${CSS_ID}']`) === null) {
  const tag = document.createElement('style')
  tag.dataset.plugin = PLUGIN_ID
  tag.dataset.pluginCss = CSS_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

export {}

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
`

if (typeof document !== 'undefined' && document.querySelector(`style[data-plugin-css='${CSS_ID}']`) === null) {
  const tag = document.createElement('style')
  tag.dataset.plugin = PLUGIN_ID
  tag.dataset.pluginCss = CSS_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

export {}

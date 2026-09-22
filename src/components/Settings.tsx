import { useEffect, useMemo, useState } from 'react';
import { Check, DatabaseBackup, Download, Plus, RefreshCw, Server, SlidersHorizontal, Trash2, Upload, X } from 'lucide-react';
import type { AppSettings, DetectedModel, RuntimeConfig } from '../types';

export function SettingsPanel({
  open,
  settings,
  runtimes,
  models,
  scanning,
  onClose,
  onScan,
  onSave,
  onExportBackup,
  onImportBackup,
}: {
  open: boolean;
  settings: AppSettings;
  runtimes: RuntimeConfig[];
  models: DetectedModel[];
  scanning: boolean;
  onClose: () => void;
  onScan: (runtimes?: RuntimeConfig[]) => void;
  onSave: (settings: AppSettings, runtimes: RuntimeConfig[]) => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
}) {
  const [draftSettings, setDraftSettings] = useState(settings);
  const [draftRuntimes, setDraftRuntimes] = useState(runtimes);
  const [section, setSection] = useState<'models' | 'preferences' | 'data'>('models');

  const modelCounts = useMemo(() => new Map(runtimes.map((runtime) => [
    runtime.id,
    models.filter((model) => model.runtimeId === runtime.id).length,
  ])), [models, runtimes]);

  useEffect(() => {
    if (!open) return;
    setDraftSettings(settings);
    setDraftRuntimes(runtimes);
  }, [open, settings, runtimes]);

  if (!open) return null;

  const addRuntime = () => setDraftRuntimes((current) => [...current, {
    id: `custom-${crypto.randomUUID()}`,
    name: 'Custom server',
    type: 'openai',
    baseUrl: 'http://127.0.0.1:8000/v1',
    enabled: true,
    custom: true,
  }]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
        <header className="settings-header">
          <div><span className="eyebrow">LOCAL ROOM</span><h2>Settings</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close settings"><X size={20} /></button>
        </header>
        <div className="settings-layout">
          <nav className="settings-nav">
            <button className={section === 'models' ? 'active' : ''} onClick={() => setSection('models')}><Server size={17} /> Models & servers</button>
            <button className={section === 'preferences' ? 'active' : ''} onClick={() => setSection('preferences')}><SlidersHorizontal size={17} /> Preferences</button>
            <button className={section === 'data' ? 'active' : ''} onClick={() => setSection('data')}><DatabaseBackup size={17} /> Data & backup</button>
          </nav>
          <main className="settings-content">
            {section === 'models' ? (
              <>
                <div className="section-heading">
                  <div><h3>Local connections</h3><p>Only localhost addresses are contacted.</p></div>
                  <button className="secondary-button" onClick={() => onScan(draftRuntimes)} disabled={scanning}><RefreshCw className={scanning ? 'spin' : ''} size={15} /> Scan now</button>
                </div>
                <div className="runtime-list">
                  {draftRuntimes.map((runtime, index) => {
                    const online = (modelCounts.get(runtime.id) ?? 0) > 0;
                    return (
                      <div className="runtime-card" key={runtime.id}>
                        <div className={`runtime-icon ${online ? 'online' : ''}`}><Server size={18} /></div>
                        <div className="runtime-fields">
                          <div className="runtime-name-row">
                            <input value={runtime.name} aria-label="Server name" onChange={(event) => setDraftRuntimes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} />
                            <span className={`status-pill ${online ? 'online' : ''}`}>{online ? `${modelCounts.get(runtime.id)} found` : 'Offline'}</span>
                          </div>
                          <input className="endpoint-input" value={runtime.baseUrl} aria-label="Server URL" spellCheck={false} onChange={(event) => setDraftRuntimes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, baseUrl: event.target.value } : item))} />
                        </div>
                        <label className="switch" title="Enable server"><input type="checkbox" checked={runtime.enabled} onChange={(event) => setDraftRuntimes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: event.target.checked } : item))} /><span /></label>
                        {runtime.custom && <button className="bare-delete" onClick={() => setDraftRuntimes((current) => current.filter((item) => item.id !== runtime.id))} aria-label="Remove server"><Trash2 size={16} /></button>}
                      </div>
                    );
                  })}
                </div>
                <button className="add-server" onClick={addRuntime}><Plus size={16} /> Add OpenAI-compatible server</button>
                <div className="privacy-note"><Check size={16} /><span><strong>Private by design.</strong> Prompts and conversations stay on this computer.</span></div>
              </>
            ) : section === 'preferences' ? (
              <>
                <div className="section-heading"><div><h3>Chat preferences</h3><p>Defaults used for all new responses.</p></div></div>
                <label className="field-label">System prompt<textarea rows={6} value={draftSettings.systemPrompt} onChange={(event) => setDraftSettings({ ...draftSettings, systemPrompt: event.target.value })} /></label>
                <label className="field-label range-label"><span>Creativity <b>{draftSettings.temperature.toFixed(1)}</b></span><input type="range" min="0" max="2" step="0.1" value={draftSettings.temperature} onChange={(event) => setDraftSettings({ ...draftSettings, temperature: Number(event.target.value) })} /><small>Lower is focused; higher is more exploratory.</small></label>
                <div className="settings-shortcut-row"><div><b>Interface zoom</b><small>Resize the entire workspace without changing message content.</small></div><span><kbd>Ctrl</kbd><kbd>+</kbd><em>or</em><kbd>Ctrl</kbd><kbd>-</kbd><em>· reset with</em><kbd>Ctrl</kbd><kbd>0</kbd></span></div>
              </>
            ) : <>
              <div className="section-heading"><div><h3>Data and backups</h3><p>Portable, local copies of your conversation history.</p></div></div>
              <div className="data-management-card">
                <div><span className="data-action-icon"><Download size={18} /></span><span><b>Create full backup</b><small>Save conversations, settings and server configuration as JSON.</small></span></div>
                <button className="secondary-button" onClick={onExportBackup}>Export backup</button>
              </div>
              <div className="data-management-card">
                <div><span className="data-action-icon"><Upload size={18} /></span><span><b>Restore conversations</b><small>Merge chats from a Local Room backup without deleting newer chats.</small></span></div>
                <button className="secondary-button" onClick={onImportBackup}>Import backup</button>
              </div>
              <div className="privacy-note"><Check size={16} /><span>Backup files are written only to the location you select.</span></div>
            </>}
          </main>
        </div>
        <footer className="settings-footer">
          <span>Changes are saved locally</span>
          <button className="primary-button" onClick={() => onSave(draftSettings, draftRuntimes)}>Save changes</button>
        </footer>
      </section>
    </div>
  );
}

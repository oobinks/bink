// Settings → Booking form: add, remove, reorder and edit the questions on your enquiry form.
import { useState } from 'react';
import { ChevronUp, ChevronDown, Trash2, Pencil, Plus, ExternalLink, Lock } from 'lucide-react';
import { api } from '../api.js';

const OPTION_TYPES = ['choice', 'checkboxes', 'dropdown'];
const newId = () => 'q_' + Math.random().toString(36).slice(2, 10);

export default function FormBuilder({ settings, reload }) {
  const { formTypes, coreQuestions } = settings.meta;
  const coreById = Object.fromEntries(coreQuestions.map((q) => [q.id, q]));
  const [fields, setFields] = useState(settings.bookingForm.fields.map((f) => ({
    ...f, optionsText: (f.options || []).join('\n'),
  })));
  const [open, setOpen] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const update = (next) => { setFields(next); setDirty(true); setMsg(null); };
  const change = (i, k, val) => update(fields.map((f, j) => (j === i ? { ...f, [k]: val } : f)));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
    if (open === fields[i].id) setOpen(fields[i].id);
  };
  const remove = (i) => {
    if (!confirm(`Remove "${fields[i].label}" from the form?`)) return;
    update(fields.filter((_, j) => j !== i));
  };
  const add = () => {
    const f = { id: newId(), label: '', hint: '', type: 'short', required: false, optionsText: '' };
    update([...fields, f]);
    setOpen(f.id);
  };
  const addBack = (id) => {
    if (!id) return;
    const q = coreById[id];
    update([...fields, { id, label: q.label, hint: q.hint, required: false }]);
  };
  const missingCore = coreQuestions.filter((q) => !fields.some((f) => f.id === q.id));

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const out = fields.map(({ optionsText, ...f }) => (coreById[f.id] ? { id: f.id, label: f.label, hint: f.hint, required: f.required }
        : { ...f, options: OPTION_TYPES.includes(f.type) ? optionsText.split('\n').map((o) => o.trim()).filter(Boolean) : undefined }));
      await api('/settings/bookingForm', { method: 'PUT', body: { fields: out } });
      setDirty(false);
      setMsg({ ok: true, text: 'Saved. Your form is updated.' });
      reload();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
    setBusy(false);
  };

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row-head">
        <h3>Questions</h3>
        <a className="btn small" href="/book" target="_blank" rel="noreferrer"><ExternalLink size={14} /> Preview</a>
      </div>
      <p className="lead">Tap a question to edit it. Use the arrows to reorder. Questions marked 🔒 are needed for quotes and invoices.</p>

      <div className="qlist">
        {fields.map((f, i) => {
          const core = coreById[f.id];
          const type = core ? core.type : f.type;
          const isOpen = open === f.id;
          return (
            <div key={f.id} className={`q${isOpen ? ' open' : ''}`}>
              <div className="q-head">
                <button type="button" className="q-title" onClick={() => setOpen(isOpen ? null : f.id)}>
                  <span className="q-label">{f.label || <i style={{ color: 'var(--faint)' }}>New question</i>}{f.required || core?.essential ? <span className="req"> *</span> : ''}</span>
                  <span className="q-type">{core?.essential && <Lock size={11} />} {formTypes[type]}{core ? ' · fills in the booking' : ''}</span>
                </button>
                <div className="q-tools">
                  <button type="button" className="icon-btn sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ChevronUp size={16} /></button>
                  <button type="button" className="icon-btn sm" aria-label="Move down" disabled={i === fields.length - 1} onClick={() => move(i, 1)}><ChevronDown size={16} /></button>
                </div>
              </div>
              {isOpen && (
                <div className="q-body">
                  <div className="field"><label htmlFor={`${f.id}-label`}>Question</label>
                    <input id={`${f.id}-label`} className="input" value={f.label} autoFocus={!f.label} onChange={(e) => change(i, 'label', e.target.value)} /></div>
                  <div className="field"><label htmlFor={`${f.id}-hint`}>Hint under the question (optional)</label>
                    <input id={`${f.id}-hint`} className="input" value={f.hint || ''} onChange={(e) => change(i, 'hint', e.target.value)} /></div>
                  {core ? (
                    <p className="hint">Type: {formTypes[type]}{core.options ? ` (${core.options.map((o) => o.label).join(' / ')})` : ''}. This can't be changed because the answer fills in the booking.</p>
                  ) : (
                    <>
                      <div className="field"><label htmlFor={`${f.id}-type`}>Type of answer</label>
                        <select id={`${f.id}-type`} className="input" value={f.type} onChange={(e) => change(i, 'type', e.target.value)}>
                          {Object.entries(formTypes).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                        </select></div>
                      {OPTION_TYPES.includes(f.type) && (
                        <div className="field"><label htmlFor={`${f.id}-opts`}>Options (one per line)</label>
                          <textarea id={`${f.id}-opts`} className="input" rows={4} value={f.optionsText} placeholder={'e.g.\nDisco\nHouse\nOld school'}
                            onChange={(e) => change(i, 'optionsText', e.target.value)} /></div>
                      )}
                    </>
                  )}
                  <div className="btn-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="switch">
                      <input type="checkbox" checked={Boolean(f.required || core?.essential)} disabled={core?.essential}
                        onChange={(e) => change(i, 'required', e.target.checked)} /> Required
                    </label>
                    {!core?.essential && <button type="button" className="btn small danger" onClick={() => remove(i)}><Trash2 size={14} /> Remove</button>}
                  </div>
                  {f.id === 'instagram' && <p className="hint">Only shown when someone picks Instagram as their contact method.</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button type="button" className="btn block" style={{ marginTop: 12 }} onClick={add}><Plus size={18} /> Add a question</button>
      {missingCore.length > 0 && (
        <select className="input" style={{ marginTop: 10 }} value="" onChange={(e) => addBack(e.target.value)} aria-label="Add back a standard question">
          <option value="">Add back a standard question…</option>
          {missingCore.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
        </select>
      )}

      <div className={`save-bar${dirty ? ' show' : ''}`}>
        <button type="button" className="btn primary block" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
        {msg && <div className={`msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      </div>
    </div>
  );
}

// What a client sees when you send them an invoice link (/i/<secret>).
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Download, Copy } from 'lucide-react';
import { api } from '../api.js';
import { money, longDate } from '../format.js';
import { invoicePdf, downloadBlob } from '../pdf.js';

function CopyRow({ label, value }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button type="button" className="kv copy-row" onClick={async () => {
      try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
    }}>
      <span>{label}</span>
      <span><b>{value}</b> {copied ? <span className="copied">Copied</span> : <Copy size={13} />}</span>
    </button>
  );
}

export default function InvoicePage() {
  const { token } = useParams();
  const [inv, setInv] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api(`/public/invoice/${token}`).then(setInv).catch((e) => setError(e.message)); }, [token]);
  useEffect(() => { if (inv) document.title = `Invoice ${inv.number} from ${inv.business.djName}`; }, [inv]);

  if (error) return <div className="public"><div className="card"><h3>Sorry</h3><p className="lead">{error}</p></div></div>;
  if (!inv) return null;
  const paid = inv.state === 'paid';
  const pdf = async () => downloadBlob(await invoicePdf(inv, window.location.href), `${inv.business.djName}-invoice-${inv.number}.pdf`);

  return (
    <div className="public">
      <header className="public-head">
        <div className="wordmark"><span>{inv.business.djName}</span></div>
        <h1>Invoice {inv.number}</h1>
        <p className="intro">For {inv.client} · issued {longDate(inv.issueDate)}</p>
      </header>

      <div className="card invoice-hero">
        {paid ? (
          <>
            <CheckCircle2 size={36} color="var(--green)" />
            <h3 style={{ marginTop: 6 }}>Paid. Thank you!</h3>
            <p className="lead" style={{ margin: 0 }}>{money(inv.totalPence)} received on {longDate(inv.paidOn)}.</p>
          </>
        ) : (
          <>
            <div className="stat-label">Amount due</div>
            <div className="invoice-amount">{money(inv.totalPence)}</div>
            <div className={inv.state === 'overdue' ? 'msg err' : 'row-sub'} style={{ marginTop: 2 }}>
              {inv.state === 'overdue' ? `Was due ${longDate(inv.dueDate)}` : `Due by ${longDate(inv.dueDate)}`}
            </div>
          </>
        )}
      </div>

      {!paid && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>How to pay</h3>
          <p className="lead">Bank transfer, please. Tap any detail to copy it.</p>
          <CopyRow label="Account name" value={inv.bank.accountName} />
          <CopyRow label="Bank" value={inv.bank.bankName} />
          <CopyRow label="Sort code" value={inv.bank.sortCode} />
          <CopyRow label="Account number" value={inv.bank.accountNumber} />
          <CopyRow label="Reference" value={inv.reference} />
          {!inv.bank.sortCode && <p className="lead">Please contact {inv.business.email} for payment details.</p>}
        </div>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        {inv.items.map((i, n) => <div className="kv" key={n}><span>{i.description}</span><span className="row-amount">{money(i.pence)}</span></div>)}
        <div className="quote-total"><span>Total</span><b>{money(inv.totalPence)}</b></div>
        {inv.vatNote && <p className="hint" style={{ textAlign: 'right', margin: 0 }}>{inv.vatNote}</p>}
        {inv.notes && <p style={{ whiteSpace: 'pre-line', marginBottom: 0 }}>{inv.notes}</p>}
      </div>

      <button className="btn block" style={{ marginTop: 14 }} onClick={pdf}><Download size={18} /> Download PDF</button>
      <p className="hint" style={{ textAlign: 'center', marginTop: 24 }}>
        Questions? <a style={{ color: 'var(--gold)' }} href={`mailto:${inv.business.email}`}>{inv.business.email}</a> · {inv.business.phone}
      </p>
    </div>
  );
}

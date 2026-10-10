export default function ComingSoon({ icon: Icon, tone, title, text, phase }) {
  return (
    <>
      <div className="page-head"><h1>{title}</h1></div>
      <div className="card placeholder">
        <div className={`alert-icon ${tone}`}><Icon size={26} /></div>
        <span className="pill muted">Coming in phase {phase}</span>
        <p>{text}</p>
      </div>
    </>
  );
}

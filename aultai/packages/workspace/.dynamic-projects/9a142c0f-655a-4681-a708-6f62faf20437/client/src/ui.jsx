export const RM = (n) => 'RM ' + (+n).toFixed(2);
export const Field = ({ label, ...r }) => (
  <div className="f"><label>{label}<input {...r} /></label></div>
);
export const Modal = ({ title, onClose, children }) => (
  <div className="modal" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
      <div className="row sb"><h2 style={{ margin: 0 }}>{title}</h2><button className="btn ghost sm" onClick={onClose}>Close</button></div>
      {children}
    </div>
  </div>
);
// Run an API call, refresh the store, then show a message or the error.
export const useAct = (reload, notify) => async (fn, msg) => {
  try { await fn(); await reload(); if (msg) notify(msg); } catch (e) { notify(e.message); }
};

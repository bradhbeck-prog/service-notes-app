export default function NoteActions({ preview = false, busy = false, canClear = false,
  onSubmit, onSave, onClear, onBack }) {
  return (
    <div className="dn-note-actions">
      <button type="button" disabled={preview || busy} onClick={onSubmit}>
        {busy ? "Saving..." : "Submit Note"}
      </button>
      <button type="button" disabled={preview || busy} onClick={onSave}>Save Note</button>
      <button type="button" disabled={preview || busy || !canClear} onClick={onClear}>Clear Note</button>
      {onBack && <button className="dn-note-back" type="button" disabled={busy} onClick={onBack}>Choose Another Person</button>}
    </div>
  );
}

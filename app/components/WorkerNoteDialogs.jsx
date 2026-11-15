"use client";

import { useEffect, useId, useRef, useState } from "react";

export function NoteHelp() {
  const dialog = useRef(null);
  const titleId = useId();

  return (
    <>
      <button type="button" className="dn-note-help" aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}>Note Help</button>
      <dialog ref={dialog} className="dn-note-dialog" aria-labelledby={titleId}>
        <h2 id={titleId}>Writing a Service Note</h2>
        <p><strong>Start with the person.</strong> Describe what they chose, did, or communicated. Write what they said or what you observed.</p>
        <p><strong>Be specific about the support you provided.</strong> “Jordan chose a meal and read the recipe. I gave one verbal prompt to turn off the stove, and Jordan turned it off.” Give enough detail for someone who wasn’t there to understand what happened across the shift and how you supported the person. For a longer shift, cover the main activities and support you provided. You don’t need to repeat details already in the goal checklist.</p>
        <p><strong>Name the places you visited.</strong> If you went into the community, write “AMC Marple” instead of “the movies” or “Game on State” instead of “the arcade.” This makes it clear where services took place and can help when reviewing a separate mileage submission.</p>
        <p><strong>Submit on the day your shift ends.</strong> If your shift ends after midnight, submit by the end of that calendar day. If you submit on a later date, DreamNote will ask what prevented you from submitting that day.</p>
        <p><strong>Need to correct a submitted note?</strong> Ask your common-law employer (CLE) to request a correction for that note. You can review the original and submit a signed correction. The original stays unchanged.</p>
        <p><strong>Looking for Dark Mode?</strong> Tap the “D” in the upper-left corner.</p>
        <form method="dialog" className="dn-note-dialog-actions">
          <button type="submit">Close</button>
        </form>
      </dialog>
    </>
  );
}

export function LateSubmissionDialog({ open, busy, message, onClose, onSubmit }) {
  const dialog = useRef(null);
  const titleId = useId();
  const fieldId = useId();
  const [reason, setReason] = useState("");

  useEffect(() => {
    const element = dialog.current;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
    if (!open) setReason("");
  }, [open]);

  return (
    <dialog ref={dialog} className="dn-note-dialog" aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}>
      <h2 id={titleId}>Late submission</h2>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (!busy && reason.trim()) onSubmit(reason.trim());
      }}>
        <label htmlFor={fieldId}>What prevented you from submitting this note on the day your shift ended?</label>
        <textarea id={fieldId} required maxLength={500} rows={4} value={reason}
          disabled={busy} onChange={(event) => setReason(event.target.value)} />
        {message && <p role="status">{message}</p>}
        <div className="dn-note-dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>Back to note</button>
          <button type="submit" className="dn-note-dialog-primary" disabled={busy || !reason.trim()}>
            {busy ? "Submitting…" : "Submit Note"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

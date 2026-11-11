"use client";

import { useEffect, useRef, useState } from "react";
import {
  createDemoPdf, goals, goalsForService, outcomes, participant, prompts, sampleNotes,
  services, validatePracticeNote, workers,
} from "../../lib/dreamnote-demo.mjs";
import "./demo.css";

const serviceEntries = Object.entries(services);
const deliveryOptions = ["Email each note when submitted", "Weekly digest", "Monthly archive"];
function dateLabel(date) {
  const [year, month, day] = date.split("-");
  return `${Number(month)}-${Number(day)}-${year.slice(-2)}`;
}

function PdfLinks({ note }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true, objectUrl;
    createDemoPdf(note).then(bytes => {
      if (!active) return;
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      setUrl(objectUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [note]);
  if (failed) return <p role="status">The PDF could not be prepared. Close and reopen this note to retry.</p>;
  if (!url) return <p role="status">Preparing PDF…</p>;
  return <div className="dn-demo-actions">
    <a className="dn-demo-button" href={url} target="_blank" rel="noopener noreferrer">View PDF</a>
    <a className="dn-demo-button" href={url} download={`DreamNote Demo - ${note.date} - ${services[note.service]}.pdf`}>Download PDF</a>
  </div>;
}

function NoteDetails({ note, initiallyOpen = false }) {
  const [open, setOpen] = useState(initiallyOpen);
  return <details className="dn-demo-note" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><strong>{dateLabel(note.date)} · {services[note.service]}</strong><span>{note.worker}</span></summary>
    {open && <div className="dn-demo-note-body">
      <p>{note.start}–{note.end} · {note.location}</p>
      <ul>{note.responses.map((goal, i) => <li key={i}><strong>{goal.label}</strong>{goal.prompt && <span> · {goal.prompt}</span>}{goal.detail && <div>{goal.detail}</div>}</li>)}</ul>
      <p>{note.narrative}</p>
      <p>Sample signature: {note.signed}<br />Completed: {note.completed}</p>
      <PdfLinks note={note} />
    </div>}
  </details>;
}

function Portal({ notes, openTemplate, openPractice, recentLimit, setRecentLimit, delivery, setDelivery }) {
  const [date, setDate] = useState("");
  const [worker, setWorker] = useState("");
  const [service, setService] = useState("");
  const shown = notes.filter(note => (!date || note.date === date) && (!worker || note.worker === worker) && (!service || note.service === service));
  return <>
    <header className="dn-demo-heading"><h1>CLE Portal</h1><p>{participant} · Fictional participant</p></header>
    <div className="dn-demo-actions">
      <button className="dn-demo-button" onClick={openTemplate}>View blank note template</button>
      <button className="dn-demo-button dn-demo-primary" onClick={openPractice}>Try a practice note</button>
    </div>
    <section className="dn-demo-section">
      <h2>Submitted Service Notes <span className="dn-demo-count">{notes.length}</span></h2>
      <details className="dn-demo-filter"><summary>Filter notes</summary>
        <div className="dn-demo-fields">
          <label>Date of service<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label>Worker<select value={worker} onChange={e => setWorker(e.target.value)}><option value="">All workers</option>{workers.map(name => <option key={name}>{name}</option>)}</select></label>
          <label>Service<select value={service} onChange={e => setService(e.target.value)}><option value="">All services</option>{serviceEntries.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        </div>
        <button className="dn-demo-button" onClick={() => { setDate(""); setWorker(""); setService(""); }}>Clear filters</button>
      </details>
      <div className="dn-demo-note-list">{shown.map(note => <NoteDetails key={note.id} note={note} initiallyOpen={note.id.startsWith("practice-")} />)}</div>
      {!shown.length && <p>No notes match these filters.</p>}
    </section>
    <details className="dn-demo-section"><summary>Note Delivery Preferences</summary>
      <p>These choices are for demonstration only. No email is sent.</p>
      {deliveryOptions.map(option => <label className="dn-demo-choice" key={option}><input type="checkbox" checked={delivery.includes(option)} disabled={delivery.length === 1 && delivery.includes(option)} onChange={e => setDelivery(e.target.checked ? [...delivery, option] : delivery.filter(value => value !== option))} />{option}</label>)}
    </details>
    <details className="dn-demo-section"><summary>Goals</summary>
      {goals.map(goal => <div className="dn-demo-row" key={goal.id}><strong>{goal.label}</strong><small>{goal.services.map(id => services[id]).join(" · ")}{goal.prompt ? " · Prompt level required" : ""}</small></div>)}
    </details>
    <details className="dn-demo-section"><summary>Prompt Levels</summary>
      <p>Only goals that require a prompt level show this choice on the note.</p>
      <ul>{prompts.map(prompt => <li key={prompt}>{prompt}</li>)}</ul>
    </details>
    <details className="dn-demo-section"><summary>Assigned Workers</summary>
      <ul>{workers.map(name => <li key={name}>{name}</li>)}</ul>
      <label>Worker access to recent notes<select value={recentLimit} onChange={e => setRecentLimit(Number(e.target.value))}><option value={0}>Off</option><option value={5}>Last 5 notes</option><option value={10}>Last 10 notes</option></select></label>
    </details>
    <details className="dn-demo-section"><summary>Outcomes</summary>
      {outcomes.map(outcome => <div className="dn-demo-row" key={outcome.title}><strong>{outcome.title}</strong><small>{outcome.services.map(id => services[id]).join(" · ")}</small><p>{outcome.text}</p></div>)}
    </details>
  </>;
}

const blankDraft = { service: "ihcs", date: "", start: "", end: "", location: "Home", narrative: "", signed: "", attested: false };
function WorkerForm({ template, onPractice, onComplete, recentNotes, onBack }) {
  const [draft, setDraft] = useState(() => ({ ...blankDraft, date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()) }));
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState("");
  const visible = goalsForService(draft.service);
  const categories = [...new Set(visible.map(goal => goal.category))];
  function field(key, value) { setDraft(current => ({ ...current, [key]: value })); setError(""); }
  function toggle(goal) {
    setAnswers(current => {
      const next = { ...current };
      if (next[goal.id]) delete next[goal.id];
      else next[goal.id] = { id: goal.id, label: goal.label, detail: "", prompt: "" };
      return next;
    });
    setError("");
  }
  function answer(id, key, value) { setAnswers(current => ({ ...current, [id]: { ...current[id], [key]: value } })); }
  function fillExample() {
    const example = sampleNotes.find(note => note.service === draft.service);
    setDraft(current => ({ ...current, start: example.start, end: example.end, location: example.location, narrative: example.narrative, signed: workers[0], attested: true }));
    setAnswers(Object.fromEntries(example.responses.map(response => {
      const goal = visible.find(item => item.label === response.label);
      return [goal.id, { id: goal.id, ...response }];
    })));
    setError("");
  }
  function submit(event) {
    event.preventDefault();
    if (template) return;
    const note = { ...draft, responses: visible.filter(goal => answers[goal.id]).map(goal => answers[goal.id]) };
    const problem = validatePracticeNote(note);
    if (problem) { setError(problem); return; }
    onComplete({
      ...note, narrative: note.narrative.trim(), signed: note.signed.trim(),
      id: `practice-${crypto.randomUUID()}`, worker: workers[0],
      completed: new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }).format(new Date()) + " ET",
    });
  }
  return <>
    <button type="button" className="dn-demo-button" onClick={onBack}>← Back to CLE Portal</button>
    <header className="dn-demo-heading"><h1>{template ? "Blank Service Note" : "Practice Service Note"}</h1><p>{participant} · {workers[0]}</p></header>
    {template ? <p>Switch services and check a goal to see its response fields. The blank template cannot be submitted.</p> : <div className="dn-demo-actions"><button type="button" className="dn-demo-button" onClick={fillExample}>Fill with sample answers</button></div>}
    <form className="dn-demo-form" onSubmit={submit} autoComplete="off">
      <div className="dn-demo-fields">
        <label>Service<select value={draft.service} onChange={e => { field("service", e.target.value); setAnswers({}); }}>{serviceEntries.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>Date of service<input type="date" value={template ? "" : draft.date} disabled={template} required={!template} onChange={e => field("date", e.target.value)} /></label>
        <label>Start time<input type="time" value={draft.start} disabled={template} required={!template} onChange={e => field("start", e.target.value)} /></label>
        <label>End time<input type="time" value={draft.end} disabled={template} required={!template} onChange={e => field("end", e.target.value)} /></label>
      </div>
      <fieldset disabled={template}><legend>Service location</legend><div className="dn-demo-actions">{["Home", "Community"].map(location => <label key={location} className="dn-demo-choice"><input type="radio" name="location" value={location} checked={!template && draft.location === location} onChange={() => field("location", location)} />{location}</label>)}</div></fieldset>
      <section className="dn-demo-section"><h2>Goals worked on</h2>
        {categories.map(category => <div className="dn-demo-category" key={category}><h3>{category}</h3>
          <div>{visible.filter(goal => goal.category === category).map(goal => <div className="dn-note-goal dn-demo-goal" key={goal.id}>
            <label className="dn-demo-choice"><input type="checkbox" checked={Boolean(answers[goal.id])} onChange={() => toggle(goal)} />{goal.label}</label>
            {answers[goal.id] && (goal.prompt || goal.question) && <div className="dn-demo-response">
              {goal.prompt && <label>Prompt level<select required={!template} disabled={template} value={answers[goal.id].prompt || ""} onChange={e => answer(goal.id, "prompt", e.target.value)}><option value="">Choose a prompt level</option>{prompts.map(prompt => <option key={prompt}>{prompt}</option>)}</select></label>}
              {goal.question && <label>{goal.question}<textarea rows={2} required={!template} disabled={template} maxLength={1200} value={answers[goal.id].detail || ""} onChange={e => answer(goal.id, "detail", e.target.value)} /></label>}
            </div>}
          </div>)}</div>
        </div>)}
      </section>
      <label>Activities and support<textarea rows={4} required={!template} disabled={template} maxLength={4000} value={draft.narrative} onChange={e => field("narrative", e.target.value)} /></label>
      <label>Sample signature<input type="text" required={!template} disabled={template} maxLength={100} placeholder="Use a fictional name" value={draft.signed} onChange={e => field("signed", e.target.value)} /></label>
      <label className="dn-demo-choice"><input type="checkbox" required={!template} disabled={template} checked={draft.attested} onChange={e => field("attested", e.target.checked)} />I certify this sample note for the demonstration.</label>
      {error && <p className="dn-demo-error" role="alert">{error}</p>}
      {!template && <button type="submit" className="dn-demo-button dn-demo-primary">Complete practice note</button>}
    </form>
    {template && <button className="dn-demo-button dn-demo-primary" onClick={onPractice}>Try filling out a practice note</button>}
    {!template && recentNotes.length > 0 && <details className="dn-demo-section"><summary>Recent service notes</summary><p>Read-only examples for this fictional participant.</p>{recentNotes.map(note => <div className="dn-demo-row" key={note.id}><strong>{dateLabel(note.date)} · {services[note.service]}</strong><p>{note.narrative}</p></div>)}</details>}
  </>;
}

export default function DemoPage() {
  const [screen, setScreen] = useState("portal");
  const [notes, setNotes] = useState(sampleNotes);
  const [recentLimit, setRecentLimit] = useState(0);
  const [delivery, setDelivery] = useState([deliveryOptions[0]]);
  const [message, setMessage] = useState("");
  const [resetId, setResetId] = useState(0);
  const top = useRef(null);
  function go(next, status = "") {
    setScreen(next); setMessage(status);
    top.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  function reset() {
    setNotes(sampleNotes); setRecentLimit(0); setDelivery([deliveryOptions[0]]);
    setResetId(id => id + 1); go("portal", "Demo reset.");
  }
  function complete(note) {
    setNotes(current => [note, ...current]);
    go("portal", "Practice note completed. Nothing was emailed or saved to DreamNote.");
  }
  return <main className="dn-demo" ref={top} tabIndex={-1}>
    <div className="dn-demo-banner"><div><strong>Demonstration only</strong><span>Fictional data. Please don’t enter real participant information.</span></div><button className="dn-demo-button" onClick={reset}>Reset demo</button></div>
    {message && <p className="dn-demo-status" role="status">{message}</p>}
    {screen === "portal" ?
      <Portal key={resetId} notes={notes} openTemplate={() => go("template")} openPractice={() => go("practice")} recentLimit={recentLimit} setRecentLimit={setRecentLimit} delivery={delivery} setDelivery={setDelivery} /> :
      <WorkerForm key={screen} template={screen === "template"} onPractice={() => go("practice")} onComplete={complete} recentNotes={notes.slice(0, recentLimit)} onBack={() => go("portal")} />}
  </main>;
}

"use client";

import { useId } from "react";
import { suggestedEndDate } from "../../lib/shift-dates.mjs";

export default function ShiftDates({ startDate, endDate, startTime, endTime, setStartDate, setEndDate,
  setStartTime, setEndTime, disabled = false }) {
  const id = useId();
  const automaticEnd = suggestedEndDate(startDate, startTime, endTime);
  const displayedEnd = endDate ?? automaticEnd;
  return (
    <div className="dn-shift-dates">
      <label htmlFor={id + "-start-date"}>Start Date
        <input id={id + "-start-date"} type="date" value={startDate} disabled={disabled}
          onChange={(e) => setStartDate(e.target.value)} />
      </label>
      <label htmlFor={id + "-start-time"}>Start Time
        <input id={id + "-start-time"} type="time" value={startTime} disabled={disabled}
          onChange={(e) => setStartTime(e.target.value)} />
      </label>
      <label htmlFor={id + "-end-date"}>End Date
        <input id={id + "-end-date"} type="date" value={displayedEnd} min={startDate || undefined}
          disabled={disabled} onChange={(e) => setEndDate(e.target.value || null)} />
      </label>
      <label htmlFor={id + "-end-time"}>End Time
        <input id={id + "-end-time"} type="time" value={endTime} disabled={disabled}
          onChange={(e) => setEndTime(e.target.value)} />
      </label>
      {displayedEnd && displayedEnd !== startDate && <small className="dn-shift-hint" role="status">
        {endDate == null ? "End Date moved to the next day. Check both dates before submitting." : "This shift starts and ends on different dates."}
      </small>}
    </div>
  );
}

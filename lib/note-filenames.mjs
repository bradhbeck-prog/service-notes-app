// Header-safe initials: a nickname's opening quote is not an initial.
export function getParticipantInitials(name) {
  return String(name || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .trim().split(/\s+/).map(part => part.match(/[a-z0-9]/i)?.[0] || "")
    .filter(Boolean).slice(0, 3).join("").toUpperCase() || "PR";
}

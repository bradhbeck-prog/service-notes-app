export function buildProtectedAuthLink(origin, generated) {
  const tokenHash = generated?.properties?.hashed_token;
  const type = generated?.properties?.verification_type;
  if (!tokenHash || !type) return "";

  const landingPage = new URL("/reset-password", origin);
  const fragment = new URLSearchParams({ token_hash: tokenHash, type });
  return `${landingPage.toString()}#${fragment.toString()}`;
}

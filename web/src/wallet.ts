import { deriveCardanoAddress } from "./session";

// Until a patient row carries the creator's wallet address from the backend,
// derive one from the patient's id. Deterministic so the same patient always
// shows the same address.
export function walletForPatient(patientId: string): string {
  return deriveCardanoAddress(`patient:${patientId}`);
}

// Shorten an address for compact display ("addr1q…abc123"). Real Cardano
// addresses are ~58–103 chars long.
export function shortAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 9)}…${addr.slice(-6)}`;
}

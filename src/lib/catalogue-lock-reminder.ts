/**
 * When the secretary's catalogue download asks "Lock the numbers now?" —
 * Mandy, 30 Sept 2026: yes, a gentle reminder when downloading a catalogue to
 * print; never a block (catalogue lock decision, 22 Sept: never block
 * printing). Only once entries have closed — before that the numbers are
 * still settling — and only while they are unlocked.
 */
export function shouldRemindToLock(state: { entriesClosed: boolean; locked: boolean }): boolean {
  return state.entriesClosed && !state.locked;
}

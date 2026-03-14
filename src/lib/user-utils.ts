export function getInitials(name?: string | null, email?: string | null) {
  if (name) {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  }
  if (email) return email[0].toUpperCase();
  return '?';
}

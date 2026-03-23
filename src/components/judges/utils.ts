export function sexLabel(sex: string | null): string {
  if (sex === 'dog') return 'Dogs';
  if (sex === 'bitch') return 'Bitches';
  return 'All';
}

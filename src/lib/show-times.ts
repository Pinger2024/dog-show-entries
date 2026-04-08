/** Half-hour time slots from 07:00 to 18:30 for show timing dropdowns */
export const SHOW_TIMES = Array.from({ length: 23 }, (_, i) => {
  const hour = 7 + Math.floor(i / 2);
  const min = i % 2 === 0 ? '00' : '30';
  const value = `${String(hour).padStart(2, '0')}:${min}`;
  return { value, label: value };
});

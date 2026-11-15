// Physical quantity here is the measured diesel being issued, not a tank closing.
export function validateDieselBatch(lines, physicalLitres) {
  const selected = lines.filter(row => row.selected);
  if (!selected.length) throw new Error('Select at least one dozer.');
  if (!Number.isFinite(Number(physicalLitres)) || Number(physicalLitres) <= 0) throw new Error('Enter the physical litres to distribute.');
  const names = new Set();
  for (const row of selected) {
    if (!row.equipment || names.has(row.equipment)) throw new Error('Each dozer must appear once.');
    names.add(row.equipment);
    if (!Number.isFinite(Number(row.litres)) || Number(row.litres) <= 0) throw new Error('Enter positive litres for every selected dozer.');
  }
  const total = selected.reduce((sum, row) => sum + Math.round(Number(row.litres) * 100), 0);
  if (total !== Math.round(Number(physicalLitres) * 100)) throw new Error('Distributed total must match the physical litres to distribute.');
  return selected.map(row => ({ equipment: row.equipment, litres: Number(row.litres) }));
}


const MONTHLY_STAFF_NAMES = new Set(['Agrimo Gideon', 'Atabo Victoria', 'Gladness Oghenekome', 'Hussein Godstime', 'Oki Christopher', 'Olumide Davidson', 'Sodunke Ola', 'Salifu Job', 'Dauzigha Joseph']);
const EXTERNAL_STAFF_NAMES = new Set(['Ewanchia Collins', 'Ogbebor (Pastor)']);

export function employmentCategory(employee) {
  if (MONTHLY_STAFF_NAMES.has(employee.name)) return 'Monthly Staff';
  if (EXTERNAL_STAFF_NAMES.has(employee.name)) return 'External Staff';
  return 'Daily Allowance Staff';
}

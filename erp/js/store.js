const STORAGE_KEY = 'emagrims_erp_v1';

const COLLECTIONS = [
  'employees', 'inventory', 'customers', 'suppliers',
  'invoices', 'purchaseOrders', 'expenses', 'operations',
];

function seedData() {
  const today = new Date();
  const iso = (daysAgo) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  };

  return {
    meta: { counter: 1000 },
    employees: [
      { id: 'EMP-1', name: 'Adewale Ogundimu', role: 'Site Supervisor', department: 'Operations', phone: '+234 803 555 0110', email: 'adewale.o@emagrims.com', salary: 220000, dateHired: '2022-03-14', status: 'Active' },
      { id: 'EMP-2', name: 'Chinedu Eze', role: 'Excavator Operator', department: 'Operations', phone: '+234 806 555 0142', email: 'chinedu.e@emagrims.com', salary: 180000, dateHired: '2022-07-01', status: 'Active' },
      { id: 'EMP-3', name: 'Ngozi Balogun', role: 'Accountant', department: 'Finance', phone: '+234 802 555 0187', email: 'ngozi.b@emagrims.com', salary: 250000, dateHired: '2021-11-20', status: 'Active' },
      { id: 'EMP-4', name: 'Tunde Afolabi', role: 'Bulldozer Operator', department: 'Operations', phone: '+234 705 555 0199', email: 'tunde.a@emagrims.com', salary: 175000, dateHired: '2023-01-09', status: 'Active' },
      { id: 'EMP-5', name: 'Grace Okonkwo', role: 'HR Manager', department: 'Human Resources', phone: '+234 810 555 0165', email: 'grace.o@emagrims.com', salary: 260000, dateHired: '2020-06-15', status: 'Active' },
      { id: 'EMP-6', name: 'Musa Ibrahim', role: 'Equipment Mechanic', department: 'Maintenance', phone: '+234 813 555 0173', email: 'musa.i@emagrims.com', salary: 160000, dateHired: '2023-05-22', status: 'On Leave' },
    ],
    inventory: [
      { id: 'INV-1', name: 'Bulldozer - EMG 003', category: 'Heavy Equipment', sku: 'EMG-003', quantity: 1, unit: 'unit', unitCost: 45000000, reorderLevel: 1, location: 'Main Yard' },
      { id: 'INV-2', name: 'Bulldozer - EMG 004', category: 'Heavy Equipment', sku: 'EMG-004', quantity: 1, unit: 'unit', unitCost: 45000000, reorderLevel: 1, location: 'Main Yard' },
      { id: 'INV-3', name: 'Bulldozer - EMG 006', category: 'Heavy Equipment', sku: 'EMG-006', quantity: 1, unit: 'unit', unitCost: 45000000, reorderLevel: 1, location: 'Main Yard' },
      { id: 'INV-4', name: 'Bulldozer - EMG 007', category: 'Heavy Equipment', sku: 'EMG-007', quantity: 1, unit: 'unit', unitCost: 45000000, reorderLevel: 1, location: 'Main Yard' },
      { id: 'INV-5', name: 'Toyota Tacoma', category: 'Vehicles', sku: 'VEH-TACOMA-01', quantity: 1, unit: 'unit', unitCost: 20000000, reorderLevel: 1, location: 'Main Yard' },
      { id: 'INV-6', name: 'Diesel (AGO)', category: 'Consumables', sku: 'FUEL-001', quantity: 1200, unit: 'litres', unitCost: 1150, reorderLevel: 2000, location: 'Fuel Depot' },
      { id: 'INV-7', name: 'Chainsaw - Stihl MS 660', category: 'Tools', sku: 'TL-CHS-05', quantity: 8, unit: 'unit', unitCost: 320000, reorderLevel: 3, location: 'Tool Store' },
      { id: 'INV-8', name: 'Hydraulic Oil', category: 'Consumables', sku: 'LUB-011', quantity: 40, unit: 'drums', unitCost: 65000, reorderLevel: 15, location: 'Fuel Depot' },
      { id: 'INV-9', name: 'Safety Helmets', category: 'Safety Gear', sku: 'PPE-HLM-01', quantity: 25, unit: 'unit', unitCost: 4500, reorderLevel: 10, location: 'Tool Store' },
    ],
    customers: [
      { id: 'CUS-1', name: 'Greenview Estates Ltd', contact: 'Femi Adeyemi', phone: '+234 802 111 2233', email: 'femi@greenviewestates.ng', address: 'Lekki, Lagos' },
      { id: 'CUS-2', name: 'Sunrise Agro Farms', contact: 'Blessing Nwachukwu', phone: '+234 803 222 3344', email: 'blessing@sunriseagro.ng', address: 'Ogun State' },
      { id: 'CUS-3', name: 'Federal Housing Authority', contact: 'Eng. Sani Bello', phone: '+234 806 333 4455', email: 'sbello@fha.gov.ng', address: 'Abuja, FCT' },
      { id: 'CUS-4', name: 'Delta Oil Services', contact: 'Kelechi Obi', phone: '+234 807 444 5566', email: 'kelechi@deltaoil.ng', address: 'Warri, Delta' },
    ],
    suppliers: [
      { id: 'SUP-1', name: 'Ascon Fuel Distributors', contact: 'Ahmed Yusuf', phone: '+234 809 555 1010', email: 'sales@asconfuel.ng', address: 'Apapa, Lagos' },
      { id: 'SUP-2', name: 'Heavy Machinery Parts Nigeria', contact: 'Ifeanyi Okafor', phone: '+234 802 555 2020', email: 'parts@hmpn.ng', address: 'Ikeja, Lagos' },
      { id: 'SUP-3', name: 'SafeGuard PPE Supplies', contact: 'Halima Sule', phone: '+234 813 555 3030', email: 'orders@safeguardppe.ng', address: 'Kano' },
    ],
    invoices: [
      { id: 'INV-2024-101', customerId: 'CUS-1', date: iso(48), dueDate: iso(18), items: [{ description: 'Land clearing - 12 hectares', qty: 12, price: 350000 }], status: 'Paid' },
      { id: 'INV-2024-102', customerId: 'CUS-2', date: iso(35), dueDate: iso(5), items: [{ description: 'Bush clearing - 8 hectares', qty: 8, price: 320000 }], status: 'Paid' },
      { id: 'INV-2024-103', customerId: 'CUS-3', date: iso(20), dueDate: iso(-10), items: [{ description: 'Site grading - 20 hectares', qty: 20, price: 400000 }], status: 'Unpaid' },
      { id: 'INV-2024-104', customerId: 'CUS-4', date: iso(9), dueDate: iso(-21), items: [{ description: 'Land clearing - 15 hectares', qty: 15, price: 375000 }], status: 'Unpaid' },
      { id: 'INV-2024-105', customerId: 'CUS-1', date: iso(3), dueDate: iso(-27), items: [{ description: 'Debris removal - 5 hectares', qty: 5, price: 300000 }], status: 'Unpaid' },
    ],
    purchaseOrders: [
      { id: 'PO-2024-51', supplierId: 'SUP-1', date: iso(40), items: [{ description: 'Diesel (AGO)', qty: 3000, price: 1150 }], status: 'Received' },
      { id: 'PO-2024-52', supplierId: 'SUP-2', date: iso(22), items: [{ description: 'Excavator hydraulic hose set', qty: 4, price: 185000 }], status: 'Received' },
      { id: 'PO-2024-53', supplierId: 'SUP-3', date: iso(6), items: [{ description: 'Safety helmets', qty: 30, price: 4500 }], status: 'Pending' },
    ],
    expenses: [
      { id: 'EXP-1', date: iso(44), category: 'Fuel', description: 'Diesel refill - Lekki site', amount: 850000, paidBy: 'Ngozi Balogun' },
      { id: 'EXP-2', date: iso(37), category: 'Maintenance', description: 'Excavator hydraulic repair', amount: 420000, paidBy: 'Musa Ibrahim' },
      { id: 'EXP-3', date: iso(26), category: 'Payroll', description: 'Site crew wages - March', amount: 1850000, paidBy: 'Grace Okonkwo' },
      { id: 'EXP-4', date: iso(17), category: 'Logistics', description: 'Equipment haulage to Abuja site', amount: 310000, paidBy: 'Adewale Ogundimu' },
      { id: 'EXP-5', date: iso(8), category: 'Fuel', description: 'Diesel refill - Abuja site', amount: 690000, paidBy: 'Ngozi Balogun' },
      { id: 'EXP-6', date: iso(2), category: 'Maintenance', description: 'Chainsaw blade replacement', amount: 95000, paidBy: 'Musa Ibrahim' },
    ],
    operations: [
      { id: 'OPS-1', date: iso(6), siteName: 'Enugu Palm Project', customerId: '', equipment: 'Bulldozer - EMG 003', operatorId: 'EMP-4', supervisorId: 'EMP-1', hoursWorked: 8, areaCleared: 2.5, fuelUsed: 220, status: 'Completed', notes: 'Cleared northern block, no incidents.' },
      { id: 'OPS-2', date: iso(5), siteName: 'REX Forestry Project - Kangidi Site', customerId: '', equipment: 'Bulldozer - EMG 004', operatorId: 'EMP-2', supervisorId: 'EMP-1', hoursWorked: 9, areaCleared: 3.1, fuelUsed: 260, status: 'Completed', notes: 'Encountered rocky terrain, slight delay.' },
      { id: 'OPS-3', date: iso(4), siteName: 'REX Forestry Project - Kajola Site', customerId: '', equipment: 'Bulldozer - EMG 006', operatorId: 'EMP-4', supervisorId: 'EMP-1', hoursWorked: 7, areaCleared: 2.0, fuelUsed: 195, status: 'Completed', notes: '' },
      { id: 'OPS-4', date: iso(2), siteName: 'FAYUS Project', customerId: '', equipment: 'Bulldozer - EMG 007', operatorId: 'EMP-2', supervisorId: 'EMP-5', hoursWorked: 6, areaCleared: 1.6, fuelUsed: 150, status: 'Ongoing', notes: 'Continuing tomorrow.' },
      { id: 'OPS-5', date: iso(1), siteName: 'Enugu Palm Project', customerId: '', equipment: 'Toyota Tacoma', operatorId: 'EMP-4', supervisorId: 'EMP-1', hoursWorked: 5, areaCleared: 1.2, fuelUsed: 110, status: 'Halted', notes: 'Halted due to rainfall.' },
    ],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to read ERP data, reseeding.', e);
  }
  const data = seedData();
  save(data);
  return data;
}

function save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let state = load();

export const store = {
  get(collection) {
    return state[collection] || [];
  },
  find(collection, id) {
    return (state[collection] || []).find((r) => r.id === id) || null;
  },
  add(collection, record) {
    const prefixMap = {
      employees: 'EMP', inventory: 'INV', customers: 'CUS', suppliers: 'SUP',
      invoices: 'INV-2024', purchaseOrders: 'PO-2024', expenses: 'EXP', operations: 'OPS',
    };
    state.meta.counter += 1;
    const id = record.id || `${prefixMap[collection] || 'REC'}-${state.meta.counter}`;
    const full = { ...record, id };
    state[collection] = [...(state[collection] || []), full];
    save(state);
    return full;
  },
  update(collection, id, patch) {
    state[collection] = (state[collection] || []).map((r) => (r.id === id ? { ...r, ...patch, id } : r));
    save(state);
  },
  remove(collection, id) {
    state[collection] = (state[collection] || []).filter((r) => r.id !== id);
    save(state);
  },
  resetSeed() {
    state = seedData();
    save(state);
  },
  all() {
    return state;
  },
};

export { COLLECTIONS };

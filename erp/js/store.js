const STORAGE_KEY = 'emagrims_erp_v1';

const COLLECTIONS = [
  'employees', 'inventory', 'customers', 'suppliers',
  'invoices', 'purchaseOrders', 'expenses', 'operations',
  'maintenanceLogs', 'dieselReceipts', 'dieselStockCounts',
  'leaveRequests', 'attendanceLogs', 'fuelingVouchers', 'fundRequests',
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
      { id: 'EMP-1', name: 'Oki Christopher', role: 'General Manager/Site manager', department: 'Administration', phone: '', email: '', salary: null, dateHired: '', status: 'Active' },
      { id: 'EMP-2', name: 'Edewor Monday', role: 'Maintenance Manager/Site Manager', department: 'Maintenance', phone: '', email: '', salary: null, dateHired: '', status: 'Suspended' },
      { id: 'EMP-3', name: 'Amadi Vincent', role: 'Site Manager', department: 'Operations', phone: '', email: '', salary: null, dateHired: '', status: 'Suspended' },
      { id: 'EMP-4', name: 'James Geisibi', role: 'Diesel Manager/Site Manager', department: 'Operations', phone: '', email: '', salary: null, dateHired: '', status: 'Suspended' },
      { id: 'EMP-5', name: 'Okpowe Nathaniel', role: 'Site Manager', department: 'Operations', phone: '', email: '', salary: null, dateHired: '', status: 'Active' },
      { id: 'EMP-6', name: 'Hussein Godstime', role: 'Site Manager', department: 'Operations', phone: '', email: '', salary: null, dateHired: '', status: 'Active' },
      { id: 'EMP-7', name: 'Omuno John Okezi (Marcelo)', role: 'Site Manager', department: 'Operations', phone: '', email: '', salary: null, dateHired: '', status: 'Active' },
      { id: 'EMP-8', name: 'Sodunke Ola', role: 'Mechanic 1', department: 'Maintenance', phone: '', email: '', salary: null, dateHired: '', status: 'Active' },
      { id: 'EMP-9', name: 'Fakolujo Adewale', role: 'Mechanic 2', department: 'Maintenance', phone: '', email: '', salary: null, dateHired: '', status: 'Disengaged' },
      { id: 'EMP-10', name: 'Olawale Waliu', role: 'Mechanic 3', department: 'Maintenance', phone: '', email: '', salary: null, dateHired: '', status: 'Disengaged' },
      { id: 'EMP-11', name: 'Adebayo Tope', role: 'Operator/EMG007', department: 'Operations', phone: '', email: '', salary: null, dateHired: '', status: 'Active' },
      { id: 'EMP-12', name: 'Paul Joshua', role: 'Operator/EMG006', department: 'Operations', phone: '', email: '', salary: null, dateHired: '', status: 'Active' },
      { id: 'EMP-13', name: 'Olawale Idris', role: 'Operator/EMG004', department: 'Operations', phone: '', email: '', salary: null, dateHired: '', status: 'Active' },
      { id: 'EMP-14', name: 'Olayiwola Sulieman', role: 'Operator', department: 'Operations', phone: '', email: '', salary: null, dateHired: '', status: 'Disengaged' },
      { id: 'EMP-15', name: 'Olawale Sodiq', role: 'Operator/Big Fish', department: 'Operations', phone: '', email: '', salary: null, dateHired: '', status: 'Disengaged' },
      { id: 'EMP-16', name: 'Onigbinde Jide', role: 'Operator/C1', department: 'Operations', phone: '', email: '', salary: null, dateHired: '', status: 'Active' },
      { id: 'EMP-17', name: 'Asibeluo Isaac', role: 'Operator/C2', department: 'Operations', phone: '', email: '', salary: null, dateHired: '', status: 'Disengaged' },
      { id: 'EMP-18', name: 'Sodiq Bello', role: 'Operator/C3', department: 'Operations', phone: '', email: '', salary: null, dateHired: '', status: 'Active' },
      { id: 'EMP-19', name: 'Ayo Justice', role: 'Operator/EMA001', department: 'Operations', phone: '', email: '', salary: null, dateHired: '', status: 'Disengaged' },
      { id: 'EMP-20', name: "Joshua's Boy (Jessi)", role: 'Trainee/Motor Boy', department: 'Operations', phone: '', email: '', salary: null, dateHired: '', status: 'Active' },
      { id: 'EMP-21', name: "Tope's Boy", role: 'Trainee/Motor Boy', department: 'Operations', phone: '', email: '', salary: null, dateHired: '', status: 'Active' },
      { id: 'EMP-22', name: 'Salifu Job', role: "Transporter/CEO's Field Driver", department: 'Operations', phone: '', email: '', salary: null, dateHired: '', status: 'Active' },
      { id: 'EMP-23', name: 'Tukur Torgo', role: 'Transporter/Site Assistant', department: 'Operations', phone: '', email: '', salary: null, dateHired: '', status: 'Disengaged' },
      { id: 'EMP-24', name: 'Vincent', role: 'Transporter/Site Assistant', department: 'Operations', phone: '', email: '', salary: null, dateHired: '', status: 'Suspended' },
      { id: 'EMP-25', name: 'Ewoma Ascet', role: 'Maintenance Manager', department: 'Maintenance', phone: '', email: '', salary: null, dateHired: '', status: 'Suspended' },
      { id: 'EMP-26', name: 'Olumide Davidson', role: 'Chief Operations Officer', department: 'Administration', phone: '', email: '', salary: null, dateHired: '', status: 'Suspended' },
      { id: 'EMP-27', name: 'Atabo Victoria', role: 'Executive Director/HR', department: 'Human Resources', phone: '', email: '', salary: null, dateHired: '', status: 'Suspended' },
      { id: 'EMP-28', name: 'Agrimo Gideon', role: 'Chief Executive Officer', department: 'Administration', phone: '', email: '', salary: null, dateHired: '', status: 'Suspended' },
      { id: 'EMP-29', name: 'Alabi Emmanuel', role: 'Managing Director', department: 'Administration', phone: '', email: '', salary: null, dateHired: '', status: 'Suspended' },
      { id: 'EMP-30', name: 'Haruna Divine', role: 'Procurement Officer', department: 'Administration', phone: '', email: '', salary: null, dateHired: '', status: 'Suspended' },
      { id: 'EMP-31', name: 'Elyakub Fadeelat', role: 'Admin Assistant/Social Media Manager', department: 'Administration', phone: '', email: '', salary: null, dateHired: '', status: 'Suspended' },
      { id: 'EMP-32', name: 'Uko Elizabeth', role: 'Executive Assistant', department: 'Administration', phone: '', email: '', salary: null, dateHired: '', status: 'Suspended' },
    ],
    inventory: [
      { id: 'INV-1', name: 'Bulldozer - EMG 003', category: 'Heavy Equipment', sku: 'EMG-003', quantity: 1, unit: 'unit', unitCost: 45000000, reorderLevel: 1, location: 'Main Yard', currentProject: '', ownership: 'Company', ownerName: '', fleetStatus: 'Idle', hourlyRate: 25000 },
      { id: 'INV-2', name: 'Bulldozer - EMG 004', category: 'Heavy Equipment', sku: 'EMG-004', quantity: 1, unit: 'unit', unitCost: 45000000, reorderLevel: 1, location: 'Main Yard', currentProject: 'REX Forestry Project - Kajola Site', ownership: 'Company', ownerName: '', fleetStatus: 'Active', hourlyRate: 25000 },
      { id: 'INV-3', name: 'Bulldozer - EMG 006', category: 'Heavy Equipment', sku: 'EMG-006', quantity: 1, unit: 'unit', unitCost: 45000000, reorderLevel: 1, location: 'Main Yard', currentProject: 'Enugu Palm Project', ownership: 'Company', ownerName: '', fleetStatus: 'Active', hourlyRate: 25000 },
      { id: 'INV-4', name: 'Bulldozer - EMG 007', category: 'Heavy Equipment', sku: 'EMG-007', quantity: 1, unit: 'unit', unitCost: 45000000, reorderLevel: 1, location: 'Main Yard', currentProject: 'REX Forestry Project - Kajola Site', ownership: 'Company', ownerName: '', fleetStatus: 'Active', hourlyRate: 25000 },
      { id: 'INV-5', name: 'Bulldozer - D8K Collins', category: 'Heavy Equipment', sku: 'D8K-COLLINS', quantity: 1, unit: 'unit', unitCost: 45000000, reorderLevel: 1, location: 'Main Yard', currentProject: 'REX Forestry Project - Kajola Site', ownership: 'Company', ownerName: '', fleetStatus: 'Active', hourlyRate: 25000 },
      { id: 'INV-6', name: 'Bulldozer - CHI 05', category: 'Heavy Equipment', sku: 'CHI-05', quantity: 1, unit: 'unit', unitCost: 45000000, reorderLevel: 1, location: 'Main Yard', currentProject: 'REX Forestry Project - Kajola Site', ownership: 'Company', ownerName: '', fleetStatus: 'Active', hourlyRate: 25000 },
      { id: 'INV-7', name: 'Bulldozer - CHI 01', category: 'Heavy Equipment', sku: 'CHI-01', quantity: 1, unit: 'unit', unitCost: 45000000, reorderLevel: 1, location: 'Main Yard', currentProject: 'REX Forestry Project - Kangidi Site', ownership: 'Company', ownerName: '', fleetStatus: 'Active', hourlyRate: 25000 },
      { id: 'INV-8', name: 'Bulldozer - CHI 02', category: 'Heavy Equipment', sku: 'CHI-02', quantity: 1, unit: 'unit', unitCost: 45000000, reorderLevel: 1, location: 'Main Yard', currentProject: 'REX Forestry Project - Kangidi Site', ownership: 'Company', ownerName: '', fleetStatus: 'Active', hourlyRate: 25000 },
      { id: 'INV-9', name: 'Toyota Tacoma', category: 'Vehicles', sku: 'VEH-TACOMA-01', quantity: 1, unit: 'unit', unitCost: 20000000, reorderLevel: 1, location: 'Main Yard', currentProject: '', ownership: 'Company', ownerName: '', fleetStatus: 'Active', hourlyRate: 8000 },
      { id: 'INV-10', name: 'Diesel (AGO)', category: 'Consumables', sku: 'FUEL-001', quantity: 1200, unit: 'litres', unitCost: 1150, reorderLevel: 2000, location: 'Fuel Depot', currentProject: '' },
      { id: 'INV-11', name: 'Chainsaw - Stihl MS 660', category: 'Tools', sku: 'TL-CHS-05', quantity: 8, unit: 'unit', unitCost: 320000, reorderLevel: 3, location: 'Tool Store', currentProject: '' },
      { id: 'INV-12', name: 'Hydraulic Oil', category: 'Consumables', sku: 'LUB-011', quantity: 40, unit: 'drums', unitCost: 65000, reorderLevel: 15, location: 'Fuel Depot', currentProject: '' },
      { id: 'INV-13', name: 'Safety Helmets', category: 'Safety Gear', sku: 'PPE-HLM-01', quantity: 25, unit: 'unit', unitCost: 4500, reorderLevel: 10, location: 'Tool Store', currentProject: '' },
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
      { id: 'INV-2024-101', customerId: 'CUS-1', date: iso(48), dueDate: iso(18), items: [{ description: 'Land clearing - 12 hectares', qty: 12, price: 350000 }], status: 'Paid', project: '' },
      { id: 'INV-2024-102', customerId: 'CUS-2', date: iso(35), dueDate: iso(5), items: [{ description: 'Bush clearing - 8 hectares', qty: 8, price: 320000 }], status: 'Paid', project: '' },
      { id: 'INV-2024-103', customerId: 'CUS-3', date: iso(20), dueDate: iso(-10), items: [{ description: 'Site grading - 20 hectares', qty: 20, price: 400000 }], status: 'Unpaid', project: '' },
      { id: 'INV-2024-104', customerId: 'CUS-4', date: iso(9), dueDate: iso(-21), items: [{ description: 'Land clearing - 15 hectares', qty: 15, price: 375000 }], status: 'Unpaid', project: '' },
      { id: 'INV-2024-105', customerId: 'CUS-1', date: iso(3), dueDate: iso(-27), items: [{ description: 'Debris removal - 5 hectares', qty: 5, price: 300000 }], status: 'Unpaid', project: '' },
    ],
    purchaseOrders: [
      { id: 'PO-2024-51', supplierId: 'SUP-1', date: iso(40), items: [{ description: 'Diesel (AGO)', qty: 3000, price: 1150 }], status: 'Received' },
      { id: 'PO-2024-52', supplierId: 'SUP-2', date: iso(22), items: [{ description: 'Excavator hydraulic hose set', qty: 4, price: 185000 }], status: 'Received' },
      { id: 'PO-2024-53', supplierId: 'SUP-3', date: iso(6), items: [{ description: 'Safety helmets', qty: 30, price: 4500 }], status: 'Pending' },
    ],
    expenses: [
      { id: 'EXP-1', date: iso(44), category: 'Fuel', description: 'Diesel refill - Lekki site', amount: 850000, paidBy: 'Ngozi Balogun', project: '' },
      { id: 'EXP-2', date: iso(37), category: 'Maintenance', description: 'Excavator hydraulic repair', amount: 420000, paidBy: 'Musa Ibrahim', project: '' },
      { id: 'EXP-3', date: iso(26), category: 'Payroll', description: 'Site crew wages - March', amount: 1850000, paidBy: 'Grace Okonkwo', project: '' },
      { id: 'EXP-4', date: iso(17), category: 'Logistics', description: 'Equipment haulage to Kajola site', amount: 310000, paidBy: 'Adewale Ogundimu', project: 'REX Forestry Project - Kajola Site' },
      { id: 'EXP-5', date: iso(8), category: 'Fuel', description: 'Diesel refill - Enugu Palm site', amount: 690000, paidBy: 'Ngozi Balogun', project: 'Enugu Palm Project' },
      { id: 'EXP-6', date: iso(2), category: 'Maintenance', description: 'Chainsaw blade replacement', amount: 95000, paidBy: 'Musa Ibrahim', project: '' },
      { id: 'EXP-7', date: iso(5), category: 'Logistics', description: 'Fuel delivery haulage to Kangidi site', amount: 145000, paidBy: 'James Geisibi', project: 'REX Forestry Project - Kangidi Site' },
    ],
    operations: [
      { id: 'OPS-1', date: iso(6), siteName: 'Enugu Palm Project', customerId: '', equipment: 'Bulldozer - EMG 003', operatorId: 'EMP-16', supervisorId: 'EMP-5', hoursWorked: 8, areaCleared: 2.5, fuelUsed: 220, status: 'Completed', notes: 'Cleared northern block, no incidents.' },
      { id: 'OPS-2', date: iso(5), siteName: 'REX Forestry Project - Kangidi Site', customerId: '', equipment: 'Bulldozer - EMG 004', operatorId: 'EMP-13', supervisorId: 'EMP-6', hoursWorked: 9, areaCleared: 3.1, fuelUsed: 260, status: 'Completed', notes: 'Encountered rocky terrain, slight delay.' },
      { id: 'OPS-3', date: iso(4), siteName: 'REX Forestry Project - Kajola Site', customerId: '', equipment: 'Bulldozer - EMG 006', operatorId: 'EMP-12', supervisorId: 'EMP-7', hoursWorked: 7, areaCleared: 2.0, fuelUsed: 195, status: 'Completed', notes: '' },
      { id: 'OPS-4', date: iso(2), siteName: 'FAYUS Project', customerId: '', equipment: 'Bulldozer - EMG 007', operatorId: 'EMP-11', supervisorId: 'EMP-5', hoursWorked: 6, areaCleared: 1.6, fuelUsed: 150, status: 'Ongoing', notes: 'Continuing tomorrow.' },
      { id: 'OPS-5', date: iso(1), siteName: 'Enugu Palm Project', customerId: '', equipment: 'Toyota Tacoma', operatorId: 'EMP-22', supervisorId: 'EMP-6', hoursWorked: 5, areaCleared: 1.2, fuelUsed: 110, status: 'Halted', notes: 'Halted due to rainfall.' },
    ],
    maintenanceLogs: [
      { id: 'MNT-1', date: iso(20), equipment: 'Bulldozer - EMG 003', type: 'Repair', description: 'Track chain replacement', cost: 850000, performedBy: 'EMP-8', status: 'Completed' },
      { id: 'MNT-2', date: iso(10), equipment: 'Bulldozer - CHI 05', type: 'Service', description: 'Routine 250hr service', cost: 180000, performedBy: 'EMP-9', status: 'Completed' },
      { id: 'MNT-3', date: iso(1), equipment: 'Bulldozer - EMG 006', type: 'Inspection', description: 'Pre-deployment inspection', cost: 0, performedBy: 'EMP-10', status: 'Completed' },
      { id: 'MNT-4', date: iso(-3), equipment: 'Bulldozer - EMG 003', type: 'Service', description: 'Post-repair service before redeployment', cost: 60000, performedBy: 'EMP-8', status: 'Scheduled' },
    ],
    dieselReceipts: [
      { id: 'DR-1', date: iso(40), litres: 3000, unitCost: 1150, supplier: 'Ascon Fuel Distributors', reference: 'PO-2024-51', notes: '' },
      { id: 'DR-2', date: iso(12), litres: 1500, unitCost: 1180, supplier: 'Ascon Fuel Distributors', reference: '', notes: '' },
    ],
    dieselStockCounts: [
      { id: 'SC-1', date: iso(1), countedLitres: 3420, countedBy: 'EMP-4', notes: 'Manual tank dip reading' },
    ],
    leaveRequests: [
      { id: 'LV-1', employeeId: 'EMP-9', leaveType: 'Sick', startDate: iso(20), endDate: iso(16), reason: 'Recovering from malaria treatment.', status: 'Approved', appliedDate: iso(22) },
      { id: 'LV-2', employeeId: 'EMP-20', leaveType: 'Casual', startDate: iso(-2), endDate: iso(-3), reason: 'Family event.', status: 'Pending', appliedDate: iso(1) },
    ],
    attendanceLogs: [],
    fuelingVouchers: [
      { id: 'FV-1', date: iso(3), station: 'Midejab Ltd', project: 'REX Forestry Project - Kajola Site', equipment: 'Bulldozer - EMG 004', litresRequested: 200, estimatedCost: 230000, requestedBy: 'EMP-6', status: 'Approved', approvedBy: 'EMP-1', notes: '' },
    ],
    fundRequests: [],
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
      maintenanceLogs: 'MNT', dieselReceipts: 'DR', dieselStockCounts: 'SC',
      leaveRequests: 'LV', attendanceLogs: 'ATT', fuelingVouchers: 'FV', fundRequests: 'FR',
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

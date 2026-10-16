// The diesel receipts the diesel tabs work from: saved receipts plus Fuel Credit
// collections since (see dieselSupply.js).
import { store } from './store.js';
import { mergeDieselReceipts } from './dieselSupply.js';

export function allDieselReceipts() {
  return mergeDieselReceipts({
    receipts: store.get('dieselReceipts'),
    collections: store.get('fuelCreditCollections'),
    operations: store.get('operations'),
  });
}

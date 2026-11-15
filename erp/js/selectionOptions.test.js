import test from 'node:test';
import assert from 'node:assert/strict';
import { selectableProjects, selectableEmployees, selectableMachines } from './selectionOptions.js';

test('new-record project choices contain only currently active Kangidi and Blue Sky', () => {
  const projects = [
    { name: 'REX Forestry Project - Kangidi', status: 'Active' },
    { name: 'Blue Sky Project - Ajue-Ore', status: 'Active' },
    { name: 'Kajola', status: 'Active' },
    { name: 'REX Forestry Project - Kangidi', status: 'Completed' },
  ];
  assert.deepEqual(selectableProjects(projects).map((row) => row.name),
    ['REX Forestry Project - Kangidi', 'Blue Sky Project - Ajue-Ore']);
});

test('new-record staff choices exclude suspended, disengaged and archived people', () => {
  const staff = [
    { id: 'A', status: 'Active' },
    { id: 'B', status: 'Suspended' },
    { id: 'C', status: 'Disengaged' },
    { id: 'D', status: 'Active', archivedAt: '2026-11-14' },
  ];
  assert.deepEqual(selectableEmployees(staff).map((row) => row.id), ['A']);
});

test('new-record machine choices exclude withdrawn and archived assets', () => {
  const machines = [
    { name: 'EMG-005', fleetStatus: 'Active' },
    { name: 'CHI-005', fleetStatus: 'Idle' },
    { name: 'Retired', withdrawnAt: '2026-11-14' },
    { name: 'Archived', archivedAt: '2026-11-14' },
  ];
  assert.deepEqual(selectableMachines(machines).map((row) => row.name), ['EMG-005']);
});

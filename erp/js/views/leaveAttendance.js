import { store } from '../store.js';
import { formatDate, el } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openModal, confirmDelete, statCard } from '../ui.js';
import { LEAVE_TYPES } from '../constants.js';
import { getCurrentUserId, filterLeaveRequests, getCurrentTier, getAssignedProject } from '../session.js';
import { notifyNewLeaveRequest } from '../notifications.js';

function projectOptions() {
  return store.get('projects').map((p) => p.name);
}

function employeeOptions() {
  return store.get('employees').map((e) => ({ value: e.id, label: `${e.name} (${e.role})` }));
}

function employeeName(id) {
  return store.get('employees').find((e) => e.id === id)?.name || 'Unknown';
}

function daysBetween(start, end) {
  if (!start || !end) return 0;
  const ms = new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00');
  return Math.max(0, Math.round(ms / 86400000) + 1);
}

function usedLeaveDaysThisYear(leaveRows, employeeId) {
  const year = String(new Date().getFullYear());
  return leaveRows
    .filter((r) => r.employeeId === employeeId && r.status === 'Approved' && r.startDate?.slice(0, 4) === year)
    .reduce((sum, r) => sum + daysBetween(r.startDate, r.endDate), 0);
}

function leaveBalanceRows(leaveRows) {
  const tier = getCurrentTier();
  let employees = store.get('employees').filter((e) => e.status !== 'Disengaged');
  if (tier === 'Supervisor') {
    const project = getAssignedProject();
    if (project) employees = employees.filter((e) => e.assignedProject === project);
  }
  return employees.map((e) => {
    const entitlement = e.leaveEntitlement ?? 21;
    const used = usedLeaveDaysThisYear(leaveRows, e.id);
    return { employee: e, entitlement, used, remaining: entitlement - used };
  });
}

function leaveFields() {
  return [
    { name: 'employeeId', label: 'Employee', type: 'select', required: true, options: employeeOptions() },
    { name: 'leaveType', label: 'Leave Type', type: 'select', required: true, options: LEAVE_TYPES.map((t) => ({ value: t, label: t })) },
    { name: 'startDate', label: 'Start Date', type: 'date', required: true },
    { name: 'endDate', label: 'End Date', type: 'date', required: true },
    { name: 'reason', label: 'Reason', type: 'textarea', required: true },
    { name: 'status', label: 'Status', type: 'select', required: true, options: [
      { value: 'Pending', label: 'Pending' },
      { value: 'Approved', label: 'Approved' },
      { value: 'Rejected', label: 'Rejected' },
    ] },
    { name: 'approvedBy', label: 'Approved By', type: 'select', options: [
      { value: '', label: '— Not yet approved —' },
      ...employeeOptions(),
    ] },
  ];
}

function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 60000 },
    );
  });
}

function mapLink(lat, lng) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
  return el('a', { href: `https://www.google.com/maps?q=${lat},${lng}`, target: '_blank', rel: 'noopener', class: 'map-link', title: 'View location on map' }, '📍');
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

export function renderLeaveAttendance(container) {
  container.innerHTML = '';

  let tab = 'leave';

  const tabBar = el('div', { class: 'tab-bar' });
  const leaveTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('leave') }, 'Leave Requests');
  const attendanceTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('attendance') }, 'Attendance');
  tabBar.appendChild(leaveTabBtn);
  tabBar.appendChild(attendanceTabBtn);

  const actionSlot = el('div');
  container.appendChild(sectionHeader('Leave & Attendance', 'Staff leave applications and daily clock-in/out with location', actionSlot));
  container.appendChild(tabBar);

  const summarySlot = el('div');
  container.appendChild(summarySlot);
  const body = el('div');
  container.appendChild(body);

  function setTab(next) {
    tab = next;
    leaveTabBtn.classList.toggle('active', tab === 'leave');
    attendanceTabBtn.classList.toggle('active', tab === 'attendance');
    summarySlot.innerHTML = '';
    if (tab === 'leave') renderLeaveTab();
    else renderAttendanceTab();
  }

  function renderLeaveTab() {
    actionSlot.innerHTML = '';
    actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openLeaveForm() }, '+ Apply for Leave'));

    function refresh() {
      const allRows = store.get('leaveRequests');
      const rows = filterLeaveRequests(allRows).slice().sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
      const pending = rows.filter((r) => r.status === 'Pending').length;

      const currentUserId = getCurrentUserId();
      const myEntitlement = store.find('employees', currentUserId)?.leaveEntitlement ?? 21;
      const myUsed = currentUserId ? usedLeaveDaysThisYear(allRows, currentUserId) : 0;
      const myRemaining = myEntitlement - myUsed;

      summarySlot.innerHTML = '';
      summarySlot.appendChild(el('div', { class: 'stats-grid' }, [
        statCard({ label: 'Your Leave Balance', value: `${myRemaining} day(s)`, hint: `${myUsed} used of ${myEntitlement} this year`, tone: myRemaining <= 0 ? 'critical' : (myRemaining <= 5 ? 'warning' : 'good') }),
        statCard({ label: 'Total Requests', value: String(rows.length) }),
        statCard({ label: 'Pending Approval', value: String(pending), tone: pending ? 'warning' : 'good' }),
      ]));

      body.innerHTML = '';
      const tier = getCurrentTier();
      if (tier === 'Admin' || tier === 'Supervisor') {
        body.appendChild(el('h3', { class: 'subsection-title' }, 'Leave Balances'));
        const balanceContainer = el('div');
        body.appendChild(balanceContainer);
        renderTable(balanceContainer, {
          columns: [
            { key: 'name', label: 'Employee', render: (r) => r.employee.name },
            { key: 'entitlement', label: 'Entitlement', render: (r) => `${r.entitlement} days` },
            { key: 'used', label: 'Used (this year)', render: (r) => `${r.used} days` },
            { key: 'remaining', label: 'Remaining', render: (r) => `${r.remaining} days` },
          ],
          rows: leaveBalanceRows(allRows),
          emptyText: 'No employees to show.',
          rowClass: (r) => (r.remaining <= 0 ? 'row-critical' : (r.remaining <= 5 ? 'row-warning' : undefined)),
        });
        body.appendChild(el('h3', { class: 'subsection-title' }, 'Leave Requests'));
      }
      const tableContainer = el('div');
      body.appendChild(tableContainer);

      renderTable(tableContainer, {
        columns: [
          { key: 'employee', label: 'Employee', render: (r) => employeeName(r.employeeId) },
          { key: 'leaveType', label: 'Type' },
          { key: 'startDate', label: 'Start', render: (r) => formatDate(r.startDate) },
          { key: 'endDate', label: 'End', render: (r) => formatDate(r.endDate) },
          { key: 'days', label: 'Days', render: (r) => `${daysBetween(r.startDate, r.endDate)}` },
          { key: 'reason', label: 'Reason' },
          { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
          { key: 'approvedBy', label: 'Approved By', render: (r) => (r.approvedBy ? employeeName(r.approvedBy) : '—') },
          {
            key: 'actions',
            label: '',
            render: (r) => actionButtons({
              onEdit: () => openLeaveForm(r),
              onDelete: async () => {
                if (!confirmDelete(`${employeeName(r.employeeId)}'s leave request`)) return;
                try {
                  await store.remove('leaveRequests', r.id);
                  refresh();
                } catch (err) {
                  window.alert(err.message || 'Could not delete the leave request.');
                }
              },
            }),
          },
        ],
        rows,
        emptyText: 'No leave requests yet.',
      });
    }

    function openLeaveForm(record) {
      if (!employeeOptions().length) {
        window.alert('Add employees first before applying for leave.');
        return;
      }
      openModal({
        title: record ? 'Edit Leave Request' : 'Apply for Leave',
        fields: leaveFields(),
        initial: record || { status: 'Pending', startDate: todayIso(), endDate: todayIso(), employeeId: getCurrentUserId() },
        submitLabel: record ? 'Save Changes' : 'Submit Request',
        onSubmit: async (data) => {
          const payload = { ...data, appliedDate: record?.appliedDate || todayIso() };
          if (record) {
            await store.update('leaveRequests', record.id, payload);
          } else {
            const saved = await store.add('leaveRequests', payload);
            notifyNewLeaveRequest(saved).catch((err) => console.warn('Leave request notification failed:', err));
          }
          refresh();
        },
      });
    }

    refresh();
  }

  function renderAttendanceTab() {
    actionSlot.innerHTML = '';

    const currentUserId = getCurrentUserId();
    const clockEmployee = el('select', { name: 'clockEmployee' }, employeeOptions().map((o) => {
      const opt = el('option', { value: o.value }, o.label);
      if (o.value === currentUserId) opt.setAttribute('selected', 'selected');
      return opt;
    }));
    const clockProject = el('select', { name: 'clockProject' }, [
      el('option', { value: '' }, '— Not site-specific —'),
      ...projectOptions().map((p) => el('option', { value: p }, p)),
    ]);
    const statusNote = el('span', { class: 'clock-status' });

    const panel = el('div', { class: 'filter-bar' }, [
      el('label', { class: 'filter-field' }, [el('span', {}, 'Employee'), clockEmployee]),
      el('label', { class: 'filter-field' }, [el('span', {}, 'Project / Site'), clockProject]),
      el('button', { class: 'btn btn-primary', type: 'button', onClick: () => clockIn() }, 'Clock In'),
      el('button', { class: 'btn btn-ghost', type: 'button', onClick: () => clockOut() }, 'Clock Out'),
      statusNote,
    ]);
    body.innerHTML = '';
    body.appendChild(panel);

    const tableContainer = el('div');
    body.appendChild(tableContainer);

    function refresh() {
      const rows = store.get('attendanceLogs').slice().sort((a, b) => (a.date < b.date ? 1 : -1));

      summarySlot.innerHTML = '';
      summarySlot.appendChild(el('div', { class: 'stats-grid' }, [
        statCard({ label: 'Logged Today', value: String(rows.filter((r) => r.date === todayIso()).length) }),
        statCard({ label: 'Total Entries', value: String(rows.length) }),
      ]));

      renderTable(tableContainer, {
        columns: [
          { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
          { key: 'employee', label: 'Employee', render: (r) => employeeName(r.employeeId) },
          { key: 'project', label: 'Project / Site', render: (r) => r.project || '—' },
          { key: 'clockIn', label: 'Clock In', render: (r) => el('span', {}, [r.clockIn || '—', ' ', mapLink(r.clockInLat, r.clockInLng)]) },
          { key: 'clockOut', label: 'Clock Out', render: (r) => el('span', {}, [r.clockOut || '—', ' ', mapLink(r.clockOutLat, r.clockOutLng)]) },
          {
            key: 'actions',
            label: '',
            render: (r) => actionButtons({
              onEdit: () => window.alert('Edit attendance times directly with the site supervisor if a correction is needed.'),
              onDelete: async () => {
                if (!confirmDelete(`${employeeName(r.employeeId)}'s attendance on ${formatDate(r.date)}`)) return;
                try {
                  await store.remove('attendanceLogs', r.id);
                  refresh();
                } catch (err) {
                  window.alert(err.message || 'Could not delete this attendance record.');
                }
              },
            }),
          },
        ],
        rows,
        emptyText: 'No attendance logged yet. Use Clock In above to get started.',
      });
    }

    async function clockIn() {
      const employeeId = clockEmployee.value;
      if (!employeeId) { window.alert('Select an employee first.'); return; }
      const today = todayIso();
      try {
        await store.refreshCollection('attendanceLogs');
        const existing = store.get('attendanceLogs').find((a) => a.employeeId === employeeId && a.date === today);
        if (existing && existing.clockIn) {
          window.alert(`${employeeName(employeeId)} already clocked in today at ${existing.clockIn}.`);
          return;
        }
        statusNote.textContent = 'Capturing location…';
        const loc = await getLocation();
        statusNote.textContent = loc ? 'Location captured.' : 'Clocked in without location.';
        const payload = {
          employeeId, date: today, project: clockProject.value,
          clockIn: nowTime(), clockInLat: loc?.lat ?? null, clockInLng: loc?.lng ?? null,
          clockOut: existing?.clockOut || '', clockOutLat: existing?.clockOutLat ?? null, clockOutLng: existing?.clockOutLng ?? null,
        };
        if (existing) await store.update('attendanceLogs', existing.id, payload);
        else await store.add('attendanceLogs', payload);
        refresh();
      } catch (err) {
        statusNote.textContent = '';
        window.alert(err.message || 'Could not clock in. Please try again.');
      }
    }

    async function clockOut() {
      const employeeId = clockEmployee.value;
      if (!employeeId) { window.alert('Select an employee first.'); return; }
      const today = todayIso();
      try {
        await store.refreshCollection('attendanceLogs');
        const existing = store.get('attendanceLogs').find((a) => a.employeeId === employeeId && a.date === today);
        if (!existing || !existing.clockIn) {
          window.alert(`${employeeName(employeeId)} has not clocked in today yet.`);
          return;
        }
        statusNote.textContent = 'Capturing location…';
        const loc = await getLocation();
        statusNote.textContent = loc ? 'Location captured.' : 'Clocked out without location.';
        await store.update('attendanceLogs', existing.id, {
          clockOut: nowTime(), clockOutLat: loc?.lat ?? null, clockOutLng: loc?.lng ?? null,
        });
        refresh();
      } catch (err) {
        statusNote.textContent = '';
        window.alert(err.message || 'Could not clock out. Please try again.');
      }
    }

    refresh();
  }

  setTab('leave');
}

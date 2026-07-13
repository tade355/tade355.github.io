import { store } from '../store.js';
import { formatDate, el } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openModal, confirmDelete, statCard } from '../ui.js';
import { PROJECTS, LEAVE_TYPES } from '../constants.js';
import { getCurrentUserId, filterLeaveRequests } from '../session.js';

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
      const rows = filterLeaveRequests(store.get('leaveRequests')).slice().sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
      const pending = rows.filter((r) => r.status === 'Pending').length;

      summarySlot.innerHTML = '';
      summarySlot.appendChild(el('div', { class: 'stats-grid' }, [
        statCard({ label: 'Total Requests', value: String(rows.length) }),
        statCard({ label: 'Pending Approval', value: String(pending), tone: pending ? 'warning' : 'good' }),
      ]));

      renderTable(body, {
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
              onDelete: () => {
                if (confirmDelete(`${employeeName(r.employeeId)}'s leave request`)) {
                  store.remove('leaveRequests', r.id);
                  refresh();
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
        onSubmit: (data) => {
          const payload = { ...data, appliedDate: record?.appliedDate || todayIso() };
          if (record) store.update('leaveRequests', record.id, payload);
          else store.add('leaveRequests', payload);
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
      ...PROJECTS.map((p) => el('option', { value: p }, p)),
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
              onDelete: () => {
                if (confirmDelete(`${employeeName(r.employeeId)}'s attendance on ${formatDate(r.date)}`)) {
                  store.remove('attendanceLogs', r.id);
                  refresh();
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
      if (existing) store.update('attendanceLogs', existing.id, payload);
      else store.add('attendanceLogs', payload);
      refresh();
    }

    async function clockOut() {
      const employeeId = clockEmployee.value;
      if (!employeeId) { window.alert('Select an employee first.'); return; }
      const today = todayIso();
      const existing = store.get('attendanceLogs').find((a) => a.employeeId === employeeId && a.date === today);
      if (!existing || !existing.clockIn) {
        window.alert(`${employeeName(employeeId)} has not clocked in today yet.`);
        return;
      }
      statusNote.textContent = 'Capturing location…';
      const loc = await getLocation();
      statusNote.textContent = loc ? 'Location captured.' : 'Clocked out without location.';
      store.update('attendanceLogs', existing.id, {
        clockOut: nowTime(), clockOutLat: loc?.lat ?? null, clockOutLng: loc?.lng ?? null,
      });
      refresh();
    }

    refresh();
  }

  setTab('leave');
}

import { supabase } from './supabaseClient.js';

// Fund Requests and Leave Requests are the first two modules migrated off
// localStorage onto Supabase, to prove out real shared data across
// devices before converting the rest of the app. Everything else still
// reads/writes through store.js.

async function nextId(prefix) {
  const { data, error } = await supabase.rpc('next_record_id', { p_prefix: prefix });
  if (error) throw new Error(`Could not generate an ID (${error.message}).`);
  return data;
}

// ---------------------------------------------------------------------
// Fund Requests
// ---------------------------------------------------------------------

function mapFundRequestFromDb(row) {
  return {
    id: row.id,
    date: row.date,
    project: row.project || '',
    submittedBy: row.submitted_by || '',
    description: row.description || '',
    status: row.status,
    approvedBy: row.approved_by || '',
    attachments: row.attachments || [],
    items: (row.fund_request_items || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((it) => ({
        description: it.description || '',
        amount: Number(it.amount) || 0,
        accountName: it.account_name || '',
        accountNumber: it.account_number || '',
        bankName: it.bank_name || '',
      })),
  };
}

export async function fetchFundRequests() {
  const { data, error } = await supabase
    .from('fund_requests')
    .select('*, fund_request_items(*)')
    .order('date', { ascending: false });
  if (error) throw new Error(`Could not load fund requests (${error.message}).`);
  return (data || []).map(mapFundRequestFromDb);
}

export async function saveFundRequest(record, existingId) {
  const id = existingId || (await nextId('FR'));
  const payload = {
    id,
    date: record.date,
    project: record.project || null,
    submitted_by: record.submittedBy || null,
    description: record.description || null,
    status: record.status,
    approved_by: record.approvedBy || null,
    attachments: record.attachments || [],
  };
  const { error: upsertError } = await supabase.from('fund_requests').upsert(payload);
  if (upsertError) throw new Error(`Could not save the fund request (${upsertError.message}).`);

  const { error: deleteError } = await supabase.from('fund_request_items').delete().eq('fund_request_id', id);
  if (deleteError) throw new Error(`Could not save the line items (${deleteError.message}).`);

  const items = (record.items || []).filter((it) => it.description || it.amount);
  if (items.length) {
    const itemRows = items.map((it, idx) => ({
      fund_request_id: id,
      description: it.description || null,
      amount: it.amount || 0,
      account_name: it.accountName || null,
      account_number: it.accountNumber || null,
      bank_name: it.bankName || null,
      sort_order: idx,
    }));
    const { error: itemError } = await supabase.from('fund_request_items').insert(itemRows);
    if (itemError) throw new Error(`Could not save the line items (${itemError.message}).`);
  }
  return id;
}

export async function deleteFundRequest(id) {
  const { error } = await supabase.from('fund_requests').delete().eq('id', id);
  if (error) throw new Error(`Could not delete the fund request (${error.message}).`);
}

export async function updateFundRequestStatus(id, status, approvedBy) {
  const { error } = await supabase.from('fund_requests').update({ status, approved_by: approvedBy || null }).eq('id', id);
  if (error) throw new Error(`Could not update the fund request (${error.message}).`);
}

// ---------------------------------------------------------------------
// Leave Requests
// ---------------------------------------------------------------------

function mapLeaveRequestFromDb(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    leaveType: row.leave_type,
    startDate: row.start_date,
    endDate: row.end_date,
    reason: row.reason || '',
    status: row.status,
    appliedDate: row.applied_date,
    approvedBy: row.approved_by || '',
  };
}

export async function fetchLeaveRequests() {
  const { data, error } = await supabase
    .from('leave_requests')
    .select('*')
    .order('start_date', { ascending: false });
  if (error) throw new Error(`Could not load leave requests (${error.message}).`);
  return (data || []).map(mapLeaveRequestFromDb);
}

export async function saveLeaveRequest(record, existingId) {
  const id = existingId || (await nextId('LV'));
  const payload = {
    id,
    employee_id: record.employeeId,
    leave_type: record.leaveType,
    start_date: record.startDate,
    end_date: record.endDate,
    reason: record.reason || null,
    status: record.status,
    applied_date: record.appliedDate,
    approved_by: record.approvedBy || null,
  };
  const { error } = await supabase.from('leave_requests').upsert(payload);
  if (error) throw new Error(`Could not save the leave request (${error.message}).`);
  return id;
}

export async function deleteLeaveRequest(id) {
  const { error } = await supabase.from('leave_requests').delete().eq('id', id);
  if (error) throw new Error(`Could not delete the leave request (${error.message}).`);
}

export async function updateLeaveRequestStatus(id, status, approvedBy) {
  const { error } = await supabase.from('leave_requests').update({ status, approved_by: approvedBy || null }).eq('id', id);
  if (error) throw new Error(`Could not update the leave request (${error.message}).`);
}

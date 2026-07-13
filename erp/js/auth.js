import { supabase } from './supabaseClient.js';
import { store } from './store.js';
import { setCurrentEmployeeId } from './session.js';

// Staff log in with a plain username, but Supabase Auth needs an email
// format under the hood — this constructs a synthetic one nobody ever
// sees or types. The domain has no real inbox; it only needs to satisfy
// email format validation.
const EMAIL_DOMAIN = 'emagrims-erp.app';

function emailFor(username) {
  return `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}

function employeeForAuthUser(userId) {
  return store.get('employees').find((e) => e.authUserId === userId) || null;
}

export async function restoreSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const employee = employeeForAuthUser(session.user.id);
  if (!employee) return null;
  setCurrentEmployeeId(employee.id);
  return employee;
}

export async function login(username, password) {
  if (!username || !password) throw new Error('Enter your username and password.');
  const { data, error } = await supabase.auth.signInWithPassword({
    email: emailFor(username),
    password: password.trim(),
  });
  if (error) {
    console.error('Login failed:', error.message);
    throw new Error('Incorrect username or password.');
  }
  const employee = employeeForAuthUser(data.user.id);
  if (!employee) {
    await supabase.auth.signOut();
    throw new Error('This account is not linked to a staff record. Contact an admin.');
  }
  setCurrentEmployeeId(employee.id);
  return employee;
}

export async function logout() {
  await supabase.auth.signOut();
  setCurrentEmployeeId(null);
}

export async function changePassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters.');
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

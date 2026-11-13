import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './session.js';

const VAPID_PUBLIC_KEY = 'BIXbjrJicL8nc1_e096weUAPuto0hCzfOofy58K9jgcRp9jfa2gM47kZ_o6Qz4lEG4Da5WVHmP7a6b8uCd9Josc';
const STORAGE_KEY = 'emagrims_push_prompt_dismissed';
const BANNER_ID = 'pushOptInBanner';

function applicationKey() {
  const base64 = VAPID_PUBLIC_KEY.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function isIphoneBrowser() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.navigator.standalone && !window.matchMedia('(display-mode: standalone)').matches;
}

function supportsPush() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function ensureBanner() {
  let banner = document.getElementById(BANNER_ID);
  if (banner) return banner;
  banner = document.createElement('section');
  banner.id = BANNER_ID;
  banner.className = 'push-opt-in';
  banner.setAttribute('aria-label', 'Website notifications');
  document.getElementById('view').before(banner);
  return banner;
}

function showPrompt(message = '') {
  const banner = ensureBanner();
  const hint = isIphoneBrowser()
    ? 'On iPhone, add the ERP to your Home Screen, then open it from there to enable notifications.'
    : 'Get an alert when an Action Center task is assigned to you or due today.';
  banner.innerHTML = `<div class="push-opt-in-copy"><strong>Enable ERP notifications</strong><span></span></div><div class="push-opt-in-actions"><button type="button" class="btn btn-primary" data-push-enable>Enable notifications</button><button type="button" class="btn btn-ghost" data-push-later>Later</button></div>`;
  banner.querySelector(".push-opt-in-copy span").textContent = message || hint;
  banner.querySelector('[data-push-enable]').addEventListener('click', () => enablePushNotifications());
  banner.querySelector('[data-push-later]').addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString().slice(0, 10));
    banner.remove();
  });
}

export async function enablePushNotifications({ silent = false } = {}) {
  if (!supportsPush()) {
    showPrompt('This browser does not support website notifications. Try Chrome or Edge on Android, or add the ERP to your iPhone Home Screen.');
    return;
  }
  if (isIphoneBrowser()) {
    showPrompt('On iPhone, use Share → Add to Home Screen, then open the ERP from its Home Screen icon and select Enable notifications.');
    return;
  }
  if (Notification.permission === 'denied') {
    showPrompt('Notifications are blocked in this browser. Allow them in the browser settings for tade355.github.io, then try again.');
    return;
  }
  const banner = ensureBanner();
  const button = banner.querySelector('[data-push-enable]');
  if (button) { button.disabled = true; button.textContent = 'Enabling…'; }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showPrompt('Notification permission was not granted. You can enable it later from your browser settings.');
      return;
    }
    const registration = await navigator.serviceWorker.register('/erp/sw.js', { scope: '/erp/' });
    const subscription = await registration.pushManager.getSubscription()
      || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey() });
    const details = subscription.toJSON();
    const employee = getCurrentUser();
    if (!employee?.id || !details.endpoint || !details.keys?.p256dh || !details.keys?.auth) {
      throw new Error('A signed-in staff account and a valid browser subscription are required.');
    }
    const { error } = await supabase.from('erp_push_subscriptions').upsert({
      endpoint: details.endpoint,
      employee_id: employee.id,
      p256dh: details.keys.p256dh,
      auth_secret: details.keys.auth,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' });
    if (error) throw error;
    banner.remove();
    localStorage.removeItem(STORAGE_KEY);
    if (!silent) window.alert('ERP notifications are enabled on this device.');
  } catch (error) {
    showPrompt(`Could not enable notifications: ${String(error?.message || error)}`);
  }
}

export async function disablePushForCurrentDevice() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/erp/');
    const subscription = await registration?.pushManager?.getSubscription();
    if (!subscription) return;
    await supabase.from('erp_push_subscriptions').delete().eq('endpoint', subscription.endpoint);
    await subscription.unsubscribe();
  } catch (error) {
    console.warn('Could not remove this device subscription', error);
  }
}

export function initPushOptIn() {
  if (!getCurrentUser()) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'user-badge-switch';
  button.textContent = 'Notifications';
  button.addEventListener('click', () => showPrompt());
  document.querySelector('.user-badge-actions')?.prepend(button);
  if (!supportsPush() || Notification.permission === 'denied') return;
  if (Notification.permission === 'granted') {
    // Reconnect an already consented browser to the current staff account.
    enablePushNotifications({ silent: true }).catch(console.warn);
    return;
  }
  if (localStorage.getItem(STORAGE_KEY) !== new Date().toISOString().slice(0, 10)) showPrompt();
}

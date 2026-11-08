export function activeSeconds(previous, now, lastInput, visible, focused) {
 if (!visible || !focused || now <= previous) return 0;
 return Math.max(0, Math.min(5, (Math.min(now,lastInput+60000)-previous)/1000));
}
export function deviceInfo(ua) {
 return {device:/iPad|Tablet/i.test(ua)?'Tablet':/Mobile|Android|iPhone/i.test(ua)?'Phone':'Computer',
 browser:/Edg\//.test(ua)?'Edge':/OPR\//.test(ua)?'Opera':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Other'};
}
export function moduleInfo(hash) {
 const [path,query='']=hash.replace(/^#\/?/,'').split('?');
 const params=new URLSearchParams(query);
 return {module:path.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80),section:params.getAll('tab').join(' / ').slice(0,80)};
}

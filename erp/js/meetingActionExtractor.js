const ACTION_VERBS = /\b(?:will|shall|must|needs? to|is to|are to|follow[ -]?up|ensure|submit|provide|prepare|contact|arrange|complete|send|purchase|repair|report|confirm|mobilise|mobilize|organise|organize|review|share|deliver|coordinate|attend|resolve|investigate|update|check|maintain|record|pay|approve|collect|inspect|visit|schedule|present|train|assign|obtain|replace|install|remove|bring|discuss|develop|implement|monitor|track|respond|draft|compile|submit|process|reconcile|verify|support|meet)\b/i;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLine(line) {
  return line.replace(/^\s*(?:[-*•▪◦]+|\d+[.)])\s*/, '').replace(/\s+/g, ' ').trim();
}

function matchOwner(line, employees) {
  const active = employees.filter((employee) => employee.status !== 'Disengaged' && !employee.archivedAt && employee.name);
  active.sort((a, b) => b.name.length - a.name.length);
  for (const employee of active) {
    const name = escapeRegExp(employee.name.trim());
    const prefix = new RegExp('^(?:action\\s*[:—–-]\\s*)?(?:mr\\.?|mrs\\.?|ms\\.?|engr\\.?|dr\\.?)?\\s*' + name + '\\s*(?::|—|–|-|,|\\bto\\b|\\bwill\\b|\\bshall\\b)\\s*(.+)$', 'i');
    const match = line.match(prefix);
    if (match && match[1].trim()) return { employee, action: match[1].trim() };
  }
  return { employee: null, action: line };
}

export function extractMeetingActions(text, employees = []) {
  const seen = new Set();
  const actions = [];
  const lines = String(text || '').replace(/\r/g, '\n').split(/\n+/g).map(normalizeLine).filter(Boolean);
  for (const line of lines) {
    if (line.length < 12 || line.length > 500 || !ACTION_VERBS.test(line)) continue;
    if (/^(?:agenda|present|attendees|minutes of meeting|meeting minutes|date|venue|opening prayer|closing prayer)\b/i.test(line)) continue;
    const owner = matchOwner(line, employees);
    const title = owner.action.replace(/^(?:to\s+|will\s+|shall\s+)/i, '').replace(/[.;,\s]+$/, '').trim();
    if (title.length < 8) continue;
    const key = (owner.employee?.id || '') + '|' + title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    actions.push({
      title: title.length > 140 ? title.slice(0, 137).trimEnd() + '…' : title,
      description: line,
      assigneeId: owner.employee?.id || '',
      assigneeName: owner.employee?.name || '',
      sourceLine: line,
    });
  }
  return actions;
}



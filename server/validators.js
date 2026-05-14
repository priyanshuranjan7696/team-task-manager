export function requireString(value, field, min = 1, max = 120) {
  if (typeof value !== 'string' || value.trim().length < min) {
    return `${field} is required.`;
  }
  if (value.trim().length > max) {
    return `${field} must be ${max} characters or fewer.`;
  }
  return null;
}

export function validateEmail(email) {
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return 'A valid email is required.';
  }
  return null;
}

export function validateStatus(status) {
  return ['Todo', 'In Progress', 'Done'].includes(status) ? null : 'Status must be Todo, In Progress, or Done.';
}

export function validateRole(role) {
  return ['Admin', 'Member'].includes(role) ? null : 'Role must be Admin or Member.';
}

export function validateDate(value) {
  if (value === null || value === undefined || value === '') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? null : 'Due date must use YYYY-MM-DD format.';
}

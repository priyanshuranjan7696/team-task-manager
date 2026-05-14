import jwt from 'jsonwebtoken';
import db from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'Invalid session.' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
}

export function projectRole(projectId, userId) {
  return db
    .prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?')
    .get(projectId, userId)?.role;
}

export function requireProjectRole(roles) {
  return (req, res, next) => {
    const projectId = Number(req.params.projectId || req.body.projectId);
    if (!Number.isInteger(projectId)) {
      return res.status(400).json({ error: 'Valid projectId is required.' });
    }

    const role = projectRole(projectId, req.user.id);
    if (!role) return res.status(403).json({ error: 'You are not a member of this project.' });
    if (!roles.includes(role)) return res.status(403).json({ error: 'Insufficient project permissions.' });

    req.projectRole = role;
    req.projectId = projectId;
    next();
  };
}

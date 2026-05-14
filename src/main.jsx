import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  FolderKanban,
  LogOut,
  Plus,
  Shield,
  Trash2,
  UserPlus,
  Users
} from 'lucide-react';
import { format, isBefore, parseISO } from 'date-fns';
import './styles.css';

const API = '/api';
const statuses = ['Todo', 'In Progress', 'Done'];

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [projectDetail, setProjectDetail] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');

  const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  async function request(path, options = {}) {
    setError('');
    const res = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? auth : {}),
        ...(options.headers || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Something went wrong.');
    }
    return data;
  }

  async function refresh() {
    if (!token) return;
    try {
      const [projectData, dashboardData, userData] = await Promise.all([
        request('/projects'),
        request('/dashboard'),
        request('/users')
      ]);
      setProjects(projectData.projects);
      setDashboard(dashboardData);
      setUsers(userData.users);
      const nextId = activeProjectId || projectData.projects[0]?.id || null;
      setActiveProjectId(nextId);
      if (nextId) {
        const detail = await request(`/projects/${nextId}`);
        setProjectDetail(detail);
      } else {
        setProjectDetail(null);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    refresh();
  }, [token]);

  useEffect(() => {
    if (!activeProjectId || !token) return;
    request(`/projects/${activeProjectId}`)
      .then(setProjectDetail)
      .catch((err) => setError(err.message));
  }, [activeProjectId]);

  function persistSession(payload) {
    setToken(payload.token);
    setUser(payload.user);
    localStorage.setItem('token', payload.token);
    localStorage.setItem('user', JSON.stringify(payload.user));
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setUser(null);
    setProjects([]);
    setProjectDetail(null);
    setDashboard(null);
  }

  if (!token) {
    return <AuthScreen onAuth={persistSession} setError={setError} error={error} />;
  }

  const activeRole = projectDetail?.project?.role;
  const isAdmin = activeRole === 'Admin';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <FolderKanban size={26} />
          <div>
            <strong>ProjectFlow</strong>
            <span>RBAC workspace</span>
          </div>
        </div>

        <button className="primary-button" onClick={() => document.querySelector('[name="projectName"]')?.focus()}>
          <Plus size={17} /> Project
        </button>

        <nav className="project-list" aria-label="Projects">
          {projects.map((project) => (
            <button
              key={project.id}
              className={project.id === activeProjectId ? 'project-item active' : 'project-item'}
              onClick={() => setActiveProjectId(project.id)}
            >
              <span>{project.name}</span>
              <small>{project.role}</small>
            </button>
          ))}
        </nav>

        <div className="profile">
          <div>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <button className="icon-button" onClick={logout} title="Log out" aria-label="Log out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <main className="workspace">
        {error && <div className="notice">{error}</div>}
        <Dashboard dashboard={dashboard} />
        <section className="work-grid">
          <ProjectPanel
            detail={projectDetail}
            users={users}
            isAdmin={isAdmin}
            request={request}
            refresh={refresh}
            setError={setError}
            setActiveProjectId={setActiveProjectId}
          />
          <TaskBoard detail={projectDetail} isAdmin={isAdmin} request={request} refresh={refresh} setError={setError} />
        </section>
      </main>
    </div>
  );
}

function AuthScreen({ onAuth, setError, error }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: 'admin@example.com', password: 'password123' });

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      const res = await fetch(`${API}/auth/${mode === 'login' ? 'login' : 'signup'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onAuth(data);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-panel" onSubmit={submit}>
        <div className="brand auth-brand">
          <FolderKanban size={30} />
          <div>
            <strong>ProjectFlow</strong>
            <span>Projects, tasks, teams</span>
          </div>
        </div>
        <div className="mode-tabs">
          <button type="button" className={mode === 'login' ? 'selected' : ''} onClick={() => setMode('login')}>
            Login
          </button>
          <button type="button" className={mode === 'signup' ? 'selected' : ''} onClick={() => setMode('signup')}>
            Signup
          </button>
        </div>
        {mode === 'signup' && (
          <label>
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} minLength={2} required />
          </label>
        )}
        <label>
          Email
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            minLength={8}
            required
          />
        </label>
        {error && <div className="notice">{error}</div>}
        <button className="primary-button" type="submit">
          {mode === 'login' ? 'Login' : 'Create account'}
        </button>
        <p className="hint">Seed login: admin@example.com / password123</p>
      </form>
    </main>
  );
}

function Dashboard({ dashboard }) {
  const stats = dashboard?.stats || {};
  return (
    <section className="dashboard">
      <Metric icon={<BarChart3 />} label="Total" value={stats.total || 0} />
      <Metric icon={<Clock3 />} label="In progress" value={stats.inProgress || 0} />
      <Metric icon={<CheckCircle2 />} label="Done" value={stats.done || 0} />
      <Metric icon={<Shield />} label="Overdue" value={stats.overdue || 0} tone="danger" />
    </section>
  );
}

function Metric({ icon, label, value, tone }) {
  return (
    <div className={`metric ${tone || ''}`}>
      {icon}
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function ProjectPanel({ detail, users, isAdmin, request, refresh, setError, setActiveProjectId }) {
  const [projectForm, setProjectForm] = useState({ name: '', description: '' });
  const [memberForm, setMemberForm] = useState({ userId: '', role: 'Member' });

  async function createProject(event) {
    event.preventDefault();
    try {
      const data = await request('/projects', { method: 'POST', body: JSON.stringify(projectForm) });
      setProjectForm({ name: '', description: '' });
      setActiveProjectId(data.project.id);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addMember(event) {
    event.preventDefault();
    try {
      await request(`/projects/${detail.project.id}/members`, { method: 'POST', body: JSON.stringify(memberForm) });
      setMemberForm({ userId: '', role: 'Member' });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeMember(userId) {
    try {
      await request(`/projects/${detail.project.id}/members/${userId}`, { method: 'DELETE' });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h1>{detail?.project?.name || 'Create your first project'}</h1>
          <p>{detail?.project?.description || 'Set up a workspace, invite members, and start assigning tasks.'}</p>
        </div>
        {detail?.project?.role && <span className="role-pill">{detail.project.role}</span>}
      </div>

      <form className="compact-form" onSubmit={createProject}>
        <input
          name="projectName"
          placeholder="New project name"
          value={projectForm.name}
          onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
          required
        />
        <input
          placeholder="Description"
          value={projectForm.description}
          onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
        />
        <button className="icon-button filled" title="Create project" aria-label="Create project">
          <Plus size={18} />
        </button>
      </form>

      <div className="subheading">
        <Users size={18} />
        <h2>Team</h2>
      </div>
      <div className="member-list">
        {(detail?.members || []).map((member) => (
          <div className="member-row" key={member.id}>
            <div>
              <strong>{member.name}</strong>
              <span>{member.email}</span>
            </div>
            <span className="role-pill">{member.role}</span>
            {isAdmin && member.id !== detail.project.created_by && (
              <button type="button" className="icon-button" title="Remove member" aria-label="Remove member" onClick={() => removeMember(member.id)}>
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      {isAdmin && (
        <form className="compact-form" onSubmit={addMember}>
          <select value={memberForm.userId} onChange={(e) => setMemberForm({ ...memberForm, userId: e.target.value })} required>
            <option value="">Add user</option>
            {users.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} ({person.email})
              </option>
            ))}
          </select>
          <select value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })}>
            <option>Member</option>
            <option>Admin</option>
          </select>
          <button className="icon-button filled" title="Add member" aria-label="Add member">
            <UserPlus size={18} />
          </button>
        </form>
      )}
    </section>
  );
}

function TaskBoard({ detail, isAdmin, request, refresh, setError }) {
  const [taskForm, setTaskForm] = useState({ title: '', description: '', assigneeId: '', dueDate: '', status: 'Todo' });
  const tasks = detail?.tasks || [];

  async function createTask(event) {
    event.preventDefault();
    try {
      await request(`/projects/${detail.project.id}/tasks`, { method: 'POST', body: JSON.stringify(taskForm) });
      setTaskForm({ title: '', description: '', assigneeId: '', dueDate: '', status: 'Todo' });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function patchTask(task, changes) {
    try {
      await request(`/projects/${detail.project.id}/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...task, assigneeId: task.assignee_id, dueDate: task.due_date, ...changes })
      });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteTask(task) {
    try {
      await request(`/projects/${detail.project.id}/tasks/${task.id}`, { method: 'DELETE' });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="panel task-panel">
      <div className="panel-heading">
        <div>
          <h2>Tasks</h2>
          <p>{tasks.length} tracked across status, owner, and due date.</p>
        </div>
      </div>

      {detail?.project && (
        <form className="task-form" onSubmit={createTask}>
          <input placeholder="Task title" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} required />
          <input
            placeholder="Description"
            value={taskForm.description}
            onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
          />
          <select value={taskForm.assigneeId} onChange={(e) => setTaskForm({ ...taskForm, assigneeId: e.target.value })}>
            <option value="">Unassigned</option>
            {detail.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
          <input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} />
          <select value={taskForm.status} onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}>
            {statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
          <button className="primary-button">
            <Plus size={17} /> Task
          </button>
        </form>
      )}

      <div className="board">
        {statuses.map((status) => (
          <div className="column" key={status}>
            <div className="column-title">
              <strong>{status}</strong>
              <span>{tasks.filter((task) => task.status === status).length}</span>
            </div>
            {tasks
              .filter((task) => task.status === status)
              .map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  members={detail.members}
                  isAdmin={isAdmin}
                  patchTask={patchTask}
                  deleteTask={deleteTask}
                />
              ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function TaskCard({ task, members, isAdmin, patchTask, deleteTask }) {
  const overdue = task.due_date && task.status !== 'Done' && isBefore(parseISO(task.due_date), new Date());

  return (
    <article className={`task-card ${overdue ? 'overdue' : ''}`}>
      <div className="task-card-top">
        <h3>{task.title}</h3>
        {isAdmin && (
          <button type="button" className="icon-button" title="Delete task" aria-label="Delete task" onClick={() => deleteTask(task)}>
            <Trash2 size={15} />
          </button>
        )}
      </div>
      {task.description && <p>{task.description}</p>}
      <div className="task-controls">
        <select value={task.status} onChange={(e) => patchTask(task, { status: e.target.value })}>
          {statuses.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
        <select value={task.assignee_id || ''} onChange={(e) => patchTask(task, { assigneeId: e.target.value })}>
          <option value="">Unassigned</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </div>
      <footer>
        <span>{task.assigneeName || 'Unassigned'}</span>
        <span>{task.due_date ? format(parseISO(task.due_date), 'MMM d, yyyy') : 'No due date'}</span>
      </footer>
    </article>
  );
}

createRoot(document.getElementById('root')).render(<App />);

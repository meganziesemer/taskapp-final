import React, { useState, useEffect, useRef } from 'react';
import { Project, Task, ViewType, ChatMessage } from './types';
import { PROJECT_COLORS } from './constants';
import { Button } from './components/Button';
import { TaskItem } from './components/TaskItem';
import { Calendar } from './components/Calendar';
import { supabase } from './services/supabaseClient';

interface Habit {
  id: string;
  name: string;
  color: string;
  completed_dates: string[];
}

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [activeView, setActiveView] = useState<ViewType | 'habits'>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [newHabitName, setNewHabitName] = useState('');
  
  const getTodayString = () => new Date().toISOString().split('T')[0];
  const today = getTodayString();
  const [newTaskDate, setNewTaskDate] = useState(today);
  const [newProject, setNewProject] = useState({ name: '', description: '', color: PROJECT_COLORS[0].hex });
  const [isAddingProject, setIsAddingProject] = useState(false);

  // --- STATS LOGIC ---
  const daysInYear = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31);
    const total = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const passed = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return { left: total - passed, total };
  };

  const calculateStreak = (dates: string[]) => {
    if (!dates || dates.length === 0) return 0;
    let streak = 0;
    let checkDate = new Date();
    const dateSet = new Set(dates);
    while (dateSet.has(checkDate.toISOString().split('T')[0])) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
    return streak;
  };

  // --- DATA LOADING ---
  const loadData = async () => {
    const { data: pData } = await supabase.from('projects').select('*');
    if (pData) setProjects([...pData].sort((a, b) => a.name.localeCompare(b.name)));
    
    const { data: hData } = await supabase.from('habits').select('*');
    if (hData) setHabits(hData || []);
  };

  useEffect(() => {
    loadData();
    const sub = supabase.channel('db-all').on('postgres_changes', { event: '*', schema: 'public' }, () => loadData()).subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  // --- TASK ACTIONS ---
  const addTask = async (pid: string) => {
    if (!newTaskTitle.trim()) return;
    const p = projects.find(proj => proj.id === pid);
    if (!p) return;
    const newTask = { id: crypto.randomUUID(), projectId: pid, title: newTaskTitle, isCompleted: false, dueDate: newTaskDate };
    const updatedTasks = [...p.tasks, newTask];
    await supabase.from('projects').update({ tasks: updatedTasks }).eq('id', pid);
    setNewTaskTitle('');
    loadData();
  };

  const toggleTask = async (pid: string, tid: string) => {
    const p = projects.find(proj => proj.id === pid);
    if (!p) return;
    const updated = p.tasks.map(t => t.id === tid ? { ...t, isCompleted: !t.isCompleted } : t);
    await supabase.from('projects').update({ tasks: updated }).eq('id', pid);
    loadData();
  };

  // --- HABIT ACTIONS ---
  const addHabit = async () => {
    if (!newHabitName.trim()) return;
    const color = PROJECT_COLORS[habits.length % PROJECT_COLORS.length].hex;
    const { error } = await supabase.from('habits').insert([{ 
        name: newHabitName, 
        color: color, 
        completed_dates: [] 
    }]);
    if (!error) {
      setNewHabitName('');
      loadData();
    }
  };

  const toggleHabitToday = async (habit: Habit) => {
    let updatedDates = habit.completed_dates || [];
    updatedDates = updatedDates.includes(today) ? updatedDates.filter(d => d !== today) : [...updatedDates, today];
    await supabase.from('habits').update({ completed_dates: updatedDates }).eq('id', habit.id);
    loadData();
  };

  const addProject = async () => {
    if (!newProject.name) return;
    const project = { id: crypto.randomUUID(), name: newProject.name, description: '', color: newProject.color, createdAt: new Date().toISOString(), tasks: [] };
    await supabase.from('projects').insert([project]);
    setIsAddingProject(false);
    setNewProject({ name: '', description: '', color: PROJECT_COLORS[0].hex });
    loadData();
  };

  const activeP = projects.find(p => p.id === selectedProjectId);

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#0f172a] text-white font-sans pb-20 lg:pb-0">
      {/* SIDEBAR */}
      <aside className="hidden lg:flex w-72 bg-black/20 p-6 flex-col gap-8 border-r border-white/5">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent">Z's Flow</h1>
        <nav className="flex flex-col gap-2">
          {['dashboard', 'projects', 'habits', 'calendar'].map((v) => (
            <Button key={v} variant="ghost" onClick={() => {setActiveView(v as any); setSelectedProjectId(null);}} className={`justify-start capitalize ${activeView === v ? 'bg-orange-600' : ''}`}>
              {v === 'dashboard' ? '🏠 Dashboard' : v === 'projects' ? '📁 Projects' : v === 'habits' ? '⚡ Habits' : '📅 Calendar'}
            </Button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-4 lg:p-10 overflow-y-auto">
        {activeView === 'dashboard' && (
          <div className="space-y-8">
            {/* STATS ROW */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white/5 p-5 rounded-2xl border border-white/10 text-center">
                <h4 className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Projects</h4>
                <p className="text-3xl font-bold mt-1">{projects.length}</p>
              </div>
              <div className="bg-white/5 p-5 rounded-2xl border border-white/10 text-center text-emerald-400">
                <h4 className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Tasks Done</h4>
                <p className="text-3xl font-bold mt-1">{projects.reduce((acc, p) => acc + p.tasks.filter(t => t.isCompleted).length, 0)}</p>
              </div>
              <div className="bg-white/5 p-5 rounded-2xl border border-white/10 text-center text-orange-400">
                <h4 className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Max Streak</h4>
                <p className="text-3xl font-bold mt-1">{habits.length > 0 ? Math.max(...habits.map(h => calculateStreak(h.completed_dates)), 0) : 0} 🔥</p>
              </div>
              <div className="bg-white/5 p-5 rounded-2xl border border-white/10 text-center text-slate-300">
                <h4 className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Days Left</h4>
                <p className="text-3xl font-bold mt-1">{daysInYear().left}</p>
              </div>
            </div>

            {/* DASHBOARD HABITS */}
            <div className="bg-white/5 p-6 rounded-3xl border border-white/10">
              <h3 className="font-bold mb-4 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Today's Habits</h3>
              <div className="flex flex-wrap gap-3">
                {habits.map(h => (
                  <button key={h.id} onClick={() => toggleHabitToday(h)} className={`px-4 py-2 rounded-xl border transition-all flex items-center gap-2 ${h.completed_dates?.includes(today) ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-white/5 border-white/10 text-slate-400'}`}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: h.color }}></span>
                    <span className="text-xs font-bold">{h.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* DASHBOARD PROJECTS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {projects.map(p => (
                <div key={p.id} className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                  <div className="p-5 flex items-center justify-between border-b border-white/5 hover:bg-white/5 cursor-pointer" onClick={() => {setSelectedProjectId(p.id); setActiveView('projects');}}>
                    <div className="flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }}></span>
                      <h3 className="font-bold text-sm tracking-tight">{p.name}</h3>
                    </div>
                    <span className="text-slate-500 text-xs">View →</span>
                  </div>
                  <div className="p-4 space-y-2">
                    {p.tasks.filter(t => !t.isCompleted).length > 0 ? (
                      p.tasks.filter(t => !t.isCompleted).slice(0, 3).map(t => (
                        <TaskItem key={t.id} task={t} projectColor={p.color} onToggle={() => toggleTask(p.id, t.id)} onDelete={() => loadData()} />
                      ))
                    ) : (
                      <p className="text-[10px] text-slate-500 italic">No pending tasks.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === 'projects' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {activeP ? (
              <>
                <Button variant="ghost" onClick={() => setSelectedProjectId(null)} className="p-0 text-orange-400">← Back to Grid</Button>
                <h2 className="text-3xl font-bold">{activeP.name}</h2>
                <div className="space-y-2">
                  {activeP.tasks.map(t => (
                    <TaskItem key={t.id} task={t} projectColor={activeP.color} onToggle={() => toggleTask(activeP.id, t.id)} onDelete={() => loadData()} />
                  ))}
                </div>
                {/* TASK INPUT FOR PROJECTS */}
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10 flex flex-col sm:flex-row gap-2 mt-8">
                  <input className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none" placeholder="Task name..." value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} onKeyPress={e => e.key === 'Enter' && addTask(activeP.id)} />
                  <input type="date" className="bg-black/40 border border-white/10 rounded-xl px-4 py-3" value={newTaskDate} onChange={e => setNewTaskDate(e.target.value)} />
                  <Button className="bg-orange-600 px-8" onClick={() => addTask(activeP.id)}>Add Task</Button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {projects.map(p => (
                  <button key={p.id} onClick={() => setSelectedProjectId(p.id)} className="bg-white/5 h-24 rounded-2xl border border-white/10 flex flex-col items-center justify-center hover:border-orange-500 transition-all">
                    <span className="w-2 h-2 rounded-full mb-2" style={{ backgroundColor: p.color }}></span>
                    <span className="font-bold">{p.name}</span>
                  </button>
                ))}
                <button onClick={() => setIsAddingProject(true)} className="border-2 border-dashed border-white/10 h-24 rounded-2xl text-slate-500 flex items-center justify-center">+ New Project</button>
              </div>
            )}
          </div>
        )}

        {activeView === 'habits' && (
          <div className="max-w-xl mx-auto space-y-8">
            <h2 className="text-3xl font-bold">Micro-Habits</h2>
            <div className="flex gap-2">
              <input className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-orange-500" placeholder="New habit name..." value={newHabitName} onChange={e => setNewHabitName(e.target.value)} onKeyPress={e => e.key === 'Enter' && addHabit()} />
              <Button className="bg-orange-600 px-8 rounded-2xl" onClick={addHabit}>Add Habit</Button>
            </div>
            <div className="space-y-3">
              {habits.map(h => (
                <div key={h.id} className="bg-white/5 p-5 rounded-2xl border border-white/10 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold">{h.name}</h4>
                    <p className="text-[10px] text-orange-400 uppercase font-bold tracking-widest">{calculateStreak(h.completed_dates || [])} Day Streak 🔥</p>
                  </div>
                  <button onClick={() => toggleHabitToday(h)} className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all ${h.completed_dates?.includes(today) ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-white/10 text-transparent hover:border-white/30'}`}>✓</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === 'calendar' && <Calendar projects={projects} />}
      </main>

      {/* MOBILE NAV */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#0f172a]/95 backdrop-blur-xl border-t border-white/10 px-8 py-3 flex justify-between z-50">
        <button onClick={() => setActiveView('dashboard')} className={activeView === 'dashboard' ? 'text-orange-400' : 'text-slate-500'}>🏠</button>
        <button onClick={() => setActiveView('projects')} className={activeView === 'projects' ? 'text-orange-400' : 'text-slate-500'}>📁</button>
        <button onClick={() => setActiveView('habits')} className={activeView === 'habits' ? 'text-orange-400' : 'text-slate-500'}>⚡</button>
        <button onClick={() => setActiveView('calendar')} className={activeView === 'calendar' ? 'text-orange-400' : 'text-slate-500'}>📅</button>
      </nav>

      {/* MODAL FOR NEW PROJECT */}
      {isAddingProject && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-6 z-[100]">
          <div className="bg-slate-900 p-8 rounded-[2.5rem] w-full max-w-sm border border-white/10">
            <h3 className="text-2xl font-bold mb-4">New Project</h3>
            <input className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 mb-4 outline-none" placeholder="Project Name" value={newProject.name} onChange={e => setNewProject({...newProject, name: e.target.value})} />
            <Button className="w-full bg-orange-600 py-4 font-bold" onClick={addProject}>Create Project</Button>
            <Button variant="ghost" className="w-full mt-2" onClick={() => setIsAddingProject(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

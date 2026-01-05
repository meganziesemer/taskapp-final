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
  const [newHabitName, setNewHabitName] = useState('');
  const [taskTab, setTaskTab] = useState<'pending' | 'completed'>('pending');
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  const today = new Date().toISOString().split('T')[0];
  const [newTaskDate, setNewTaskDate] = useState(today);

  // --- REVERTED STATS LOGIC ---
  const getDaysLeft = () => {
    const now = new Date();
    const end = new Date(now.getFullYear(), 11, 31);
    return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const loadData = async () => {
    const { data: pData } = await supabase.from('projects').select('*');
    if (pData) setProjects([...pData].sort((a, b) => a.name.localeCompare(b.name)));
    const { data: hData } = await supabase.from('habits').select('*');
    if (hData) setHabits(hData);
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
    const { error } = await supabase.from('habits').insert([{ name: newHabitName, color: '#f97316', completed_dates: [] }]);
    if (!error) { setNewHabitName(''); loadData(); }
  };

  const toggleHabitToday = async (habit: Habit) => {
    let dates = habit.completed_dates || [];
    dates = dates.includes(today) ? dates.filter(d => d !== today) : [...dates, today];
    await supabase.from('habits').update({ completed_dates: dates }).eq('id', habit.id);
    loadData();
  };

  const calculateStreak = (dates: string[]) => {
    if (!dates) return 0;
    let streak = 0; let d = new Date();
    while (dates.includes(d.toISOString().split('T')[0])) {
      streak++; d.setDate(d.getDate() - 1);
    }
    return streak;
  };

  const activeP = projects.find(p => p.id === selectedProjectId);

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#0f172a] text-white font-sans">
      {/* SIDEBAR */}
      <aside className="hidden lg:flex w-72 bg-black/20 p-6 flex-col gap-8 border-r border-white/5">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent">Z's Flow</h1>
        <nav className="flex flex-col gap-2">
          {['dashboard', 'projects', 'habits', 'calendar'].map((v) => (
            <Button key={v} variant="ghost" onClick={() => setActiveView(v as any)} className={`justify-start capitalize ${activeView === v ? 'bg-orange-600' : ''}`}>
              {v}
            </Button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-4 lg:p-10 overflow-y-auto">
        {activeView === 'dashboard' && (
          <div className="space-y-8">
            {/* STATS CARDS */}
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
                <h4 className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Top Streak</h4>
                <p className="text-3xl font-bold mt-1">{habits.length > 0 ? Math.max(...habits.map(h => calculateStreak(h.completed_dates)), 0) : 0} 🔥</p>
              </div>
              <div className="bg-white/5 p-5 rounded-2xl border border-white/10 text-center text-slate-300">
                <h4 className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Days Left</h4>
                <p className="text-3xl font-bold mt-1">{getDaysLeft()}</p>
              </div>
            </div>

            {/* DAILY HABITS LIST */}
            <div className="bg-white/5 p-6 rounded-3xl border border-white/10">
              <h3 className="font-bold mb-4 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Daily Consistency</h3>
              <div className="flex flex-wrap gap-3">
                {habits.map(h => (
                  <button key={h.id} onClick={() => toggleHabitToday(h)} className={`px-4 py-2 rounded-xl border transition-all flex items-center gap-2 ${h.completed_dates?.includes(today) ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-white/5 border-white/10 text-slate-400'}`}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: h.color }}></span>
                    <span className="text-xs font-bold">{h.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* PROJECT GRID WITH EXPANDABLE TASK LISTS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {projects.map(p => {
                const pending = p.tasks.filter(t => !t.isCompleted);
                const isExpanded = expandedProjects[p.id] ?? true;
                return (
                  <div key={p.id} className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                    <button onClick={() => setExpandedProjects({...expandedProjects, [p.id]: !isExpanded})} className="w-full p-5 flex items-center justify-between hover:bg-white/5">
                      <div className="flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }}></span>
                        <h3 className="font-bold text-sm">{p.name}</h3>
                      </div>
                      <span className="text-slate-500 text-xs">{isExpanded ? '▲' : '▼'}</span>
                    </button>
                    {isExpanded && (
                      <div className="p-4 pt-0 space-y-2">
                        {pending.map(t => (
                          <TaskItem key={t.id} task={t} projectColor={p.color} onToggle={() => toggleTask(p.id, t.id)} onDelete={() => loadData()} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeView === 'projects' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {activeP ? (
              <>
                <div className="flex justify-between items-center">
                  <Button variant="ghost" onClick={() => setSelectedProjectId(null)} className="text-orange-400">← Back</Button>
                  <div className="flex bg-black/40 p-1 rounded-lg">
                    <button onClick={() => setTaskTab('pending')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${taskTab === 'pending' ? 'bg-orange-600 text-white' : 'text-slate-400'}`}>Pending</button>
                    <button onClick={() => setTaskTab('completed')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${taskTab === 'completed' ? 'bg-orange-600 text-white' : 'text-slate-400'}`}>Completed</button>
                  </div>
                </div>
                <h2 className="text-4xl font-bold">{activeP.name}</h2>
                <div className="space-y-2">
                  {activeP.tasks.filter(t => taskTab === 'pending' ? !t.isCompleted : t.isCompleted).map(t => (
                    <TaskItem key={t.id} task={t} projectColor={activeP.color} onToggle={() => toggleTask(activeP.id, t.id)} onDelete={() => loadData()} />
                  ))}
                </div>
                {taskTab === 'pending' && (
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/10 flex gap-2 mt-8">
                    <input className="flex-1 bg-transparent px-2 outline-none" placeholder="Add a new task..." value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} onKeyPress={e => e.key === 'Enter' && addTask(activeP.id)} />
                    <Button className="bg-orange-600 px-6" onClick={() => addTask(activeP.id)}>Add</Button>
                  </div>
                )}
              </>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map(p => (
                  <button key={p.id} onClick={() => setSelectedProjectId(p.id)} className="bg-white/5 p-8 rounded-[2rem] border border-white/10 flex flex-col items-center gap-3 hover:border-orange-500 transition-all group">
                    <div className="w-3 h-3 rounded-full group-hover:scale-150 transition-transform" style={{ backgroundColor: p.color }}></div>
                    <span className="font-bold text-lg">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {activeView === 'habits' && (
          <div className="max-w-xl mx-auto space-y-8">
            <h2 className="text-3xl font-bold">Habits</h2>
            <div className="flex gap-2">
              <input className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-orange-500" placeholder="New habit..." value={newHabitName} onChange={e => setNewHabitName(e.target.value)} onKeyPress={e => e.key === 'Enter' && addHabit()} />
              <Button className="bg-orange-600 px-8 rounded-2xl" onClick={addHabit}>Add</Button>
            </div>
            <div className="space-y-3">
              {habits.map(h => (
                <div key={h.id} className="bg-white/5 p-5 rounded-2xl border border-white/10 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-lg">{h.name}</h4>
                    <p className="text-[10px] text-orange-400 uppercase font-bold tracking-widest">{calculateStreak(h.completed_dates || [])} Day Streak 🔥</p>
                  </div>
                  <button onClick={() => toggleHabitToday(h)} className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all ${h.completed_dates?.includes(today) ? 'bg-emerald-500 border-emerald-500' : 'border-white/10'}`}>✓</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* MOBILE NAV */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#0f172a]/95 backdrop-blur-xl border-t border-white/10 px-8 py-3 flex justify-between z-50">
        <button onClick={() => setActiveView('dashboard')}>🏠</button>
        <button onClick={() => setActiveView('projects')}>📁</button>
        <button onClick={() => setActiveView('habits')}>⚡</button>
      </nav>
    </div>
  );
};

export default App;

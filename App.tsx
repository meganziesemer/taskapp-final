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
  const [isAddingProject, setIsAddingProject] = useState(false);
  
  const getTodayString = () => new Date().toISOString().split('T')[0];
  const today = getTodayString();
  const [newTaskDate, setNewTaskDate] = useState(today);
  const [newProject, setNewProject] = useState({ name: '', description: '', color: PROJECT_COLORS[0].hex });

  // --- HEATMAP LOGIC ---
  const getHeatmapData = () => {
    const days = [];
    const end = new Date();
    for (let i = 83; i >= 0; i--) {
      const d = new Date();
      d.setDate(end.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = habits.filter(h => h.completed_dates?.includes(dateStr)).length;
      days.push({ date: dateStr, count });
    }
    return days;
  };

  const loadData = async () => {
    const { data: pData } = await supabase.from('projects').select('*');
    if (pData) setProjects([...pData].sort((a, b) => a.name.localeCompare(b.name)));
    
    const { data: hData } = await supabase.from('habits').select('*');
    if (hData) setHabits(hData);
  };

  useEffect(() => {
    loadData();
    const sub = supabase.channel('schema-db-changes').on('postgres_changes', { event: '*', schema: 'public' }, () => loadData()).subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  // --- ACTIONS ---
  const addHabit = async () => {
    if (!newHabitName.trim()) return;
    const { error } = await supabase.from('habits').insert([
      { name: newHabitName, color: '#f97316', completed_dates: [] }
    ]);
    if (error) console.error(error);
    setNewHabitName('');
    loadData();
  };

  const toggleHabitToday = async (habit: Habit) => {
    let dates = habit.completed_dates || [];
    dates = dates.includes(today) ? dates.filter(d => d !== today) : [...dates, today];
    await supabase.from('habits').update({ completed_dates: dates }).eq('id', habit.id);
    loadData();
  };

  const addTask = async (pid: string) => {
    if (!newTaskTitle.trim()) return;
    const p = projects.find(proj => proj.id === pid);
    if (!p) return;
    const updated = [...p.tasks, { id: crypto.randomUUID(), projectId: pid, title: newTaskTitle, isCompleted: false, dueDate: newTaskDate }];
    await supabase.from('projects').update({ tasks: updated }).eq('id', pid);
    setNewTaskTitle('');
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

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#0f172a] text-white">
      <aside className="hidden lg:flex w-64 bg-black/20 p-6 flex-col gap-4 border-r border-white/5">
        <h1 className="text-xl font-bold text-orange-500 mb-4">Z's Flow</h1>
        {['dashboard', 'projects', 'habits', 'calendar'].map(v => (
          <Button key={v} variant="ghost" onClick={() => setActiveView(v as any)} className={`justify-start capitalize ${activeView === v ? 'bg-orange-600' : ''}`}>{v}</Button>
        ))}
      </aside>

      <main className="flex-1 p-6 lg:p-10 overflow-y-auto pb-24">
        {activeView === 'dashboard' && (
          <div className="max-w-5xl mx-auto space-y-8">
            {/* HEATMAP SECTION */}
            <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
              <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-4">Consistency Heatmap</h3>
              <div className="flex flex-wrap gap-1">
                {getHeatmapData().map((day, i) => (
                  <div 
                    key={i} 
                    className={`w-3 h-3 rounded-sm ${day.count > 0 ? 'bg-orange-500' : 'bg-white/5'}`} 
                    title={`${day.date}: ${day.count} habits`}
                    style={{ opacity: day.count > 0 ? Math.min(day.count * 0.4, 1) : 1 }}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white/5 p-4 rounded-xl border border-white/10 text-center">
                <span className="text-slate-500 text-[10px] font-bold uppercase">Streak</span>
                <p className="text-2xl font-bold text-orange-400">{habits.length > 0 ? Math.max(...habits.map(h => calculateStreak(h.completed_dates)), 0) : 0} 🔥</p>
              </div>
              <div className="bg-white/5 p-4 rounded-xl border border-white/10 text-center">
                <span className="text-slate-500 text-[10px] font-bold uppercase">Days Left</span>
                <p className="text-2xl font-bold text-slate-300">{365 - Math.floor((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86400000)}</p>
              </div>
            </div>

            <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
              <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-4">Today's Habits</h3>
              <div className="flex flex-wrap gap-2">
                {habits.map(h => (
                  <button key={h.id} onClick={() => toggleHabitToday(h)} className={`px-4 py-2 rounded-lg border text-xs font-bold transition-all ${h.completed_dates?.includes(today) ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-white/5 border-white/10 text-slate-400'}`}>
                    {h.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projects.map(p => (
                <div key={p.id} className="bg-white/5 p-5 rounded-2xl border border-white/10">
                  <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }}></span> {p.name}
                  </h4>
                  {p.tasks.filter(t => !t.isCompleted).slice(0, 3).map(t => (
                    <div key={t.id} className="text-xs text-slate-400 py-1 flex items-center gap-2">
                      <div className="w-1 h-1 bg-slate-600 rounded-full"></div> {t.title}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === 'habits' && (
          <div className="max-w-md mx-auto space-y-6">
            <h2 className="text-2xl font-bold">Manage Habits</h2>
            <div className="flex gap-2">
              <input className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 outline-none focus:border-orange-500" placeholder="New Habit..." value={newHabitName} onChange={e => setNewHabitName(e.target.value)} onKeyPress={e => e.key === 'Enter' && addHabit()} />
              <Button className="bg-orange-600" onClick={addHabit}>Add</Button>
            </div>
            <div className="space-y-2">
              {habits.map(h => (
                <div key={h.id} className="bg-white/5 p-4 rounded-xl border border-white/10 flex justify-between items-center">
                  <span className="font-bold">{h.name}</span>
                  <span className="text-orange-400 text-xs font-bold">{calculateStreak(h.completed_dates)}d 🔥</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === 'projects' && (
           <div className="max-w-4xl mx-auto space-y-6">
             {selectedProjectId ? (
               <div className="space-y-4">
                 <Button variant="ghost" onClick={() => setSelectedProjectId(null)}>← Back</Button>
                 <h2 className="text-3xl font-bold">{projects.find(p => p.id === selectedProjectId)?.name}</h2>
                 <div className="bg-white/5 p-4 rounded-xl flex gap-2">
                   <input className="flex-1 bg-transparent outline-none" placeholder="Add Task..." value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} />
                   <Button onClick={() => addTask(selectedProjectId)}>Add</Button>
                 </div>
                 {projects.find(p => p.id === selectedProjectId)?.tasks.map(t => (
                   <TaskItem key={t.id} task={t} projectColor="#f97316" onToggle={() => loadData()} onDelete={() => loadData()} />
                 ))}
               </div>
             ) : (
               <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                 {projects.map(p => (
                   <button key={p.id} onClick={() => setSelectedProjectId(p.id)} className="bg-white/5 p-6 rounded-2xl border border-white/10 font-bold">{p.name}</button>
                 ))}
               </div>
             )}
           </div>
        )}
      </main>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-white/10 p-4 flex justify-around">
        <button onClick={() => setActiveView('dashboard')}>🏠</button>
        <button onClick={() => setActiveView('projects')}>📁</button>
        <button onClick={() => setActiveView('habits')}>⚡</button>
      </nav>
    </div>
  );
};

export default App;

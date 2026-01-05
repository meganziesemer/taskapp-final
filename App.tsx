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
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [activeView, setActiveView] = useState<ViewType | 'habits'>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [taskTab, setTaskTab] = useState<'pending' | 'completed'>('pending');
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [newHabitName, setNewHabitName] = useState('');

  const getTodayString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const today = getTodayString();
  const [newTaskDate, setNewTaskDate] = useState(today);
  const [newProject, setNewProject] = useState({ name: '', description: '', color: PROJECT_COLORS[0].hex });
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    const { data: pData } = await supabase.from('projects').select('*');
    if (pData) setProjects([...pData].sort((a, b) => a.name.localeCompare(b.name)));
    const { data: hData } = await supabase.from('habits').select('*');
    if (hData) setHabits(hData);
  };

  useEffect(() => {
    loadData();
    const sub = supabase.channel('db-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => loadData()).subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory, isChatLoading]);

  const addHabit = async () => {
    if (!newHabitName.trim()) return;
    const newH = { name: newHabitName, color: PROJECT_COLORS[habits.length % PROJECT_COLORS.length].hex, completed_dates: [] };
    await supabase.from('habits').insert([newH]);
    setNewHabitName('');
    loadData();
  };

  const toggleHabitToday = async (habit: Habit) => {
    let updatedDates = [...habit.completed_dates];
    updatedDates = updatedDates.includes(today) ? updatedDates.filter(d => d !== today) : [...updatedDates, today];
    await supabase.from('habits').update({ completed_dates: updatedDates }).eq('id', habit.id);
    loadData();
  };

  const calculateStreak = (dates: string[]) => {
    let streak = 0;
    let checkDate = new Date();
    const dateSet = new Set(dates);
    while (dateSet.has(checkDate.toISOString().split('T')[0])) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
    return streak;
  };

  const deleteProject = async (pid: string) => {
    if (!window.confirm("Delete this project?")) return;
    await supabase.from('projects').delete().eq('id', pid);
    setSelectedProjectId(null);
    loadData();
  };

  const addTask = async (pid: string) => {
    const p = projects.find(proj => proj.id === pid);
    if (!p || !newTaskTitle) return;
    const updated = [...p.tasks, { id: crypto.randomUUID(), projectId: pid, title: newTaskTitle, isCompleted: false, dueDate: newTaskDate }];
    await supabase.from('projects').update({ tasks: updated }).eq('id', pid);
    setNewTaskTitle('');
    loadData();
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    const userMsg = { id: crypto.randomUUID(), role: 'user', text: chatInput, timestamp: new Date().toISOString() };
    setChatHistory(prev => [...prev, userMsg as ChatMessage]);
    setChatInput('');
    setIsChatLoading(true);
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const systemInstruction = `Assistant for Z's Flow. Projects: ${JSON.stringify(projects)}. Habits: ${JSON.stringify(habits)}.`;
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: systemInstruction + "\n\nUser: " + userMsg.text }] }] }) });
      const data = await response.json();
      setChatHistory(prev => [...prev, { id: crypto.randomUUID(), role: 'model', text: data.candidates[0].content.parts[0].text, timestamp: new Date().toISOString() } as ChatMessage]);
    } catch (e) { console.error(e); } finally { setIsChatLoading(false); }
  };

  const activeP = projects.find(p => p.id === selectedProjectId);

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#0f172a] text-white font-sans pb-20 lg:pb-0">
      <aside className="hidden lg:flex w-72 bg-black/20 p-6 flex-col gap-8 border-r border-white/5">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent">Z's Flow</h1>
        <nav className="flex flex-col gap-2">
          {['dashboard', 'projects', 'habits', 'calendar', 'chat'].map((v) => (
            <Button key={v} variant="ghost" onClick={() => {setActiveView(v as any); setSelectedProjectId(null);}} className={`justify-start capitalize ${activeView === v ? 'bg-orange-600' : ''}`}>
              {v}
            </Button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-4 lg:p-10 overflow-y-auto">
        {activeView === 'dashboard' && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white/5 p-5 rounded-2xl border border-white/10 text-center">
                <h4 className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Top Streak</h4>
                <p className="text-3xl font-bold mt-1 text-orange-400">{Math.max(...habits.map(h => calculateStreak(h.completed_dates)), 0)} 🔥</p>
              </div>
            </div>

            <div className="bg-white/5 p-6 rounded-3xl border border-white/10">
              <h3 className="font-bold mb-4 text-[10px] uppercase tracking-widest text-slate-500">Today's Habits</h3>
              <div className="flex flex-wrap gap-3">
                {habits.map(h => (
                  <button key={h.id} onClick={() => toggleHabitToday(h)} className={`px-4 py-2 rounded-xl border transition-all flex items-center gap-2 ${h.completed_dates.includes(today) ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-white/5 border-white/10 text-slate-400'}`}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: h.color }}></span>
                    <span className="text-xs font-bold">{h.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {projects.map(p => {
                const pending = p.tasks.filter(t => !t.isCompleted);
                if (pending.length === 0) return null;
                const isExpanded = expandedProjects[p.id];
                return (
                  <div key={p.id} className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                    <button onClick={() => setExpandedProjects({...expandedProjects, [p.id]: !isExpanded})} className="w-full p-5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }}></span>
                        <h3 className="font-bold text-sm tracking-tight">{p.name}</h3>
                      </div>
                      <span className="text-slate-500 transition-transform">{isExpanded ? '▲' : '▼'}</span>
                    </button>
                    {isExpanded && (
                      <div className="p-4 pt-0 space-y-2">
                        {pending.map(t => <TaskItem key={t.id} task={t} projectColor={p.color} onToggle={() => loadData()} onDelete={() => loadData()} />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeView === 'habits' && (
          <div className="max-w-xl mx-auto space-y-8">
            <h2 className="text-3xl font-bold">Micro-Habits</h2>
            <div className="flex gap-2">
              <input className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-orange-500" placeholder="New habit..." value={newHabitName} onChange={e => setNewHabitName(e.target.value)} onKeyPress={e => e.key === 'Enter' && addHabit()} />
              <Button className="bg-orange-600 px-8" onClick={addHabit}>Add</Button>
            </div>
            <div className="space-y-3">
              {habits.map(h => (
                <div key={h.id} className="bg-white/5 p-5 rounded-2xl border border-white/10 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold">{h.name}</h4>
                    <p className="text-[10px] text-orange-400 uppercase font-bold tracking-widest">{calculateStreak(h.completed_dates)} Day Streak 🔥</p>
                  </div>
                  <button onClick={() => toggleHabitToday(h)} className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all ${h.completed_dates.includes(today) ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-white/10 text-transparent'}`}>✓</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === 'projects' && (
           <div className="max-w-4xl mx-auto">
             {activeP ? (
                <div className="space-y-6">
                   <div className="flex justify-between items-center">
                    <Button variant="ghost" onClick={() => setSelectedProjectId(null)} className="text-orange-400">← Back</Button>
                    <button onClick={() => deleteProject(activeP.id)} className="text-[10px] text-slate-600 uppercase tracking-widest hover:text-rose-500">Delete Project</button>
                   </div>
                   <h2 className="text-3xl font-bold">{activeP.name}</h2>
                   <div className="space-y-2">
                      {activeP.tasks.map(t => <TaskItem key={t.id} task={t} projectColor={activeP.color} onToggle={() => loadData()} onDelete={() => loadData()} />)}
                   </div>
                </div>
             ) : (
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {projects.map(p => (
                    <button key={p.id} onClick={() => setSelectedProjectId(p.id)} className="bg-white/5 h-16 rounded-2xl border border-white/10 flex items-center px-4 hover:border-orange-500 transition-all">
                      <span className="w-2 h-2 rounded-full mr-3" style={{ backgroundColor: p.color }}></span>
                      <span className="font-bold truncate">{p.name}</span>
                    </button>
                  ))}
                  <button onClick={() => setIsAddingProject(true)} className="border-2 border-dashed border-white/5 h-16 rounded-2xl text-slate-500">+ New Project</button>
               </div>
             )}
           </div>
        )}
        
        {activeView === 'calendar' && <Calendar projects={projects} />}
        {activeView === 'chat' && (
          <div className="max-w-3xl mx-auto flex flex-col h-[70vh] bg-black/20 rounded-3xl border border-white/10 p-4">
            <div className="flex-1 overflow-y-auto space-y-4 mb-4">
              {chatHistory.map(m => <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`p-4 rounded-2xl max-w-[85%] text-sm ${m.role === 'user' ? 'bg-orange-600' : 'bg-white/5 border border-white/10'}`}>{m.text}</div></div>)}
              <div ref={chatEndRef} />
            </div>
            <div className="flex gap-2">
              <input className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSendMessage()} placeholder="Ask Z's Flow AI..." />
              <Button className="bg-orange-600 px-6" onClick={handleSendMessage} disabled={isChatLoading}>Send</Button>
            </div>
          </div>
        )}
      </main>

      {/* MOBILE NAV */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#0f172a]/95 backdrop-blur-xl border-t border-white/10 px-8 py-3 flex justify-between items-center z-50">
        <button onClick={() => setActiveView('dashboard')} className={activeView === 'dashboard' ? 'text-orange-400' : 'text-slate-500'}>🏠</button>
        <button onClick={() => setActiveView('projects')} className={activeView === 'projects' ? 'text-orange-400' : 'text-slate-500'}>📁</button>
        <button onClick={() => setActiveView('habits')} className={activeView === 'habits' ? 'text-orange-400' : 'text-slate-500'}>⚡</button>
        <button onClick={() => setActiveView('calendar')} className={activeView === 'calendar' ? 'text-orange-400' : 'text-slate-500'}>📅</button>
        <button onClick={() => setActiveView('chat')} className={activeView === 'chat' ? 'text-orange-400' : 'text-slate-500'}>🤖</button>
      </nav>

      {/* NEW PROJECT MODAL */}
      {isAddingProject && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-6 z-[100]">
          <div className="bg-slate-900 p-8 rounded-[2.5rem] w-full max-w-sm border border-white/10 text-center">
            <h3 className="text-2xl font-bold mb-4">New Project</h3>
            <input className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 mb-4 outline-none" placeholder="Name" value={newProject.name} onChange={e => setNewProject({...newProject, name: e.target.value})} />
            <Button className="w-full bg-orange-600 py-4 font-bold" onClick={addProject}>Create</Button>
            <Button variant="ghost" className="w-full mt-2" onClick={() => setIsAddingProject(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

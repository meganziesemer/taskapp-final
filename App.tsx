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
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newHabitName, setNewHabitName] = useState(''); 
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [taskTab, setTaskTab] = useState<'pending' | 'completed'>('pending');
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  const getTodayString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const today = getTodayString();
  const [newTaskDate, setNewTaskDate] = useState(today);
  const [newProject, setNewProject] = useState({ name: '', description: '', color: PROJECT_COLORS[0].hex });
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const activeP = projects.find(p => p.id === selectedProjectId);

  const daysInYear = () => {
    const now = new Date();
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 11, 31);
    const total = 365;
    const diffTime = now.getTime() - start.getTime();
    const passed = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return { left: Math.max(0, total - passed), passed: Math.max(0, passed) };
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

  const getHeatmapColor = (count: number) => {
    if (count === 0) return 'bg-white/5';
    if (count === 1) return 'bg-rose-500';
    if (count >= 2 && count <= 3) return 'bg-orange-500';
    if (count >= 4 && count <= 5) return 'bg-yellow-400';
    return 'bg-emerald-500';
  };

  const getHeatmapData = () => {
    const days = [];
    const start = new Date(2026, 0, 1); 
    for (let i = 0; i < 365; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const count = (habits || []).filter(h => h.completed_dates?.includes(dateStr)).length;
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
    const sub = supabase.channel('db-changes').on('postgres_changes', { event: '*', schema: 'public' }, () => loadData()).subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory, isChatLoading]);

  const addHabit = async () => {
    if (!newHabitName.trim()) return;
    const { error } = await supabase.from('habits').insert([
      { name: newHabitName, color: PROJECT_COLORS[habits.length % PROJECT_COLORS.length].hex, completed_dates: [] }
    ]);
    if (!error) { setNewHabitName(''); loadData(); }
  };

  const toggleHabitDate = async (habit: Habit, dateStr: string) => {
    let dates = habit.completed_dates || [];
    dates = dates.includes(dateStr) ? dates.filter(d => d !== dateStr) : [...dates, dateStr];
    await supabase.from('habits').update({ completed_dates: dates }).eq('id', habit.id);
    loadData();
  };

  const deleteHabit = async (id: string) => {
    if (window.confirm("Delete this habit?")) {
      const { error } = await supabase.from('habits').delete().eq('id', id);
      if (!error) loadData();
    }
  };

  const deleteProject = async (pid: string) => {
    if (window.confirm("Delete project?")) {
      const { error } = await supabase.from('projects').delete().eq('id', pid);
      if (!error) { setSelectedProjectId(null); loadData(); }
    }
  };

const setProjectStatus = async (pid: string, newStatus: 'needs_action' | 'caught_up') => {
    // 1. Update UI immediately (Optimistic Update)
    setProjects(currentProjects => 
      currentProjects.map(p => p.id === pid ? { ...p, status: newStatus } : p)
    );

    // 2. Update Database
    const { error } = await supabase
      .from('projects')
      .update({ status: newStatus })
      .eq('id', pid);

    if (error) {
      console.error("Error updating status:", error);
      // Revert if database fails
      loadData();
    }
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
      const systemInstruction = `Assistant for Z's Flow. Data: ${JSON.stringify(projects)}. User is in 2026.`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: systemInstruction + "\n\nUser: " + userMsg.text }] }] })
      });
      const data = await response.json();
      setChatHistory(prev => [...prev, { id: crypto.randomUUID(), role: 'model', text: data.candidates[0].content.parts[0].text, timestamp: new Date().toISOString() } as ChatMessage]);
    } catch (e) { console.error(e); } finally { setIsChatLoading(false); }
  };

  const updateProjectName = async (pid: string) => {
    if (!editedName.trim()) { setIsEditingName(false); return; }
    await supabase.from('projects').update({ name: editedName }).eq('id', pid);
    setIsEditingName(false); loadData();
  };

  const addTask = async (pid: string) => {
    const p = projects.find(proj => proj.id === pid);
    if (!p || !newTaskTitle) return;
    const updated = [...p.tasks, { id: crypto.randomUUID(), projectId: pid, title: newTaskTitle, isCompleted: false, dueDate: newTaskDate }];
    await supabase.from('projects').update({ tasks: updated }).eq('id', pid);
    setNewTaskTitle(''); loadData();
  };

  const toggleTask = async (pid: string, tid: string) => {
    const p = projects.find(proj => proj.id === pid);
    if (!p) return;
    const updated = p.tasks.map(t => t.id === tid ? { ...t, isCompleted: !t.isCompleted } : t);
    await supabase.from('projects').update({ tasks: updated }).eq('id', pid);
    loadData();
  };

  const deleteTask = async (pid: string, tid: string) => {
    const p = projects.find(proj => proj.id === pid);
    if (!p) return;
    const updated = p.tasks.filter(t => t.id !== tid);
    await supabase.from('projects').update({ tasks: updated }).eq('id', pid);
    loadData();
  };

  const addProject = async () => {
    if (!newProject.name) return;
    const project = { id: crypto.randomUUID(), name: newProject.name, description: '', color: newProject.color, createdAt: new Date().toISOString(), tasks: [], status: 'caught_up' };
    await supabase.from('projects').insert([project]);
    setIsAddingProject(false); setNewProject({ name: '', description: '', color: PROJECT_COLORS[0].hex }); loadData();
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#0f172a] text-white font-sans pb-20 lg:pb-0">
      <aside className="hidden lg:flex w-72 bg-black/20 p-6 flex-col gap-8 border-r border-white/5">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent">Z's Flow</h1>
          <p className="text-[10px] text-slate-500 font-medium italic">make every day count</p>
        </div>
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
                <h4 className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Projects</h4>
                <p className="text-3xl font-bold mt-1">{projects.length}</p>
              </div>
              <div className="bg-white/5 p-5 rounded-2xl border border-white/10 text-center text-emerald-400">
                <h4 className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Done</h4>
                <p className="text-3xl font-bold mt-1">{projects.reduce((acc, p) => acc + (p.tasks || []).filter(t => t.isCompleted).length, 0)}</p>
              </div>
              <div className="bg-white/5 p-5 rounded-2xl border border-white/10 text-center text-rose-400">
                <h4 className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">To Do</h4>
                <p className="text-3xl font-bold mt-1">{projects.reduce((acc, p) => acc + (p.tasks || []).filter(t => !t.isCompleted).length, 0)}</p>
              </div>
              <div className="bg-white/5 p-5 rounded-2xl border border-white/10 text-center text-orange-400">
                <h4 className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Days in 2026</h4>
                <p className="text-3xl font-bold mt-1">{daysInYear().passed}</p>
                <p className="text-[10px] text-slate-500 mt-1">({daysInYear().left} remaining)</p>
              </div>
            </div>

            <div className="bg-white/5 p-6 rounded-3xl border border-white/10">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-[10px] uppercase tracking-widest text-slate-500">2026 Habit Grid</h3>
                <div className="flex gap-2 items-center text-[8px] uppercase tracking-tighter text-slate-600 font-bold">
                  <span>Less</span>
                  <div className="w-2 h-2 rounded-sm bg-rose-500"></div>
                  <div className="w-2 h-2 rounded-sm bg-orange-500"></div>
                  <div className="w-2 h-2 rounded-sm bg-yellow-400"></div>
                  <div className="w-2 h-2 rounded-sm bg-emerald-500"></div>
                  <span>More</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 content-start">
                {getHeatmapData().map((day, i) => (
                  <div key={i} 
                    className={`w-2.5 h-2.5 rounded-sm transition-colors duration-500 ${getHeatmapColor(day.count)}`} 
                    title={`${day.date}: ${day.count} habits`} />
                ))}
              </div>
            </div>

            <div className="bg-white/5 p-6 rounded-3xl border border-white/10">
              <h3 className="font-bold mb-4 text-[10px] uppercase tracking-widest text-slate-500">Today's Habits</h3>
              <div className="flex flex-wrap gap-3">
                {habits.map(h => (
                  <button key={h.id} onClick={() => toggleHabitDate(h, today)} className={`px-4 py-2 rounded-xl border transition-all flex items-center gap-2 ${h.completed_dates?.includes(today) ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-white/5 border-white/10 text-slate-400'}`}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: h.color }}></span>
                    <span className="text-xs font-bold">{h.name}</span>
                  </button>
                ))}
              </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {projects.map(p => {
                const pendingTasks = (p.tasks || []).filter(t => !t.isCompleted);
                if (pendingTasks.length === 0) return null;
                const isExpanded = expandedProjects[p.id];
                return (
                  <div key={p.id} className={`rounded-2xl border overflow-hidden transition-all ${
                    (p as any).status === 'needs_action' 
                      ? 'bg-rose-950/30 border-rose-500/30' 
                      : (p as any).status === 'caught_up' 
                        ? 'bg-emerald-950/30 border-emerald-500/30'
                        : 'bg-white/5 border-white/10'
                  }`}>
                    <button onClick={() => { setActiveView('projects'); setSelectedProjectId(p.id); }} className="w-full p-5 flex items-center justify-between hover:bg-white/[0.02] text-left">
                      <div className="flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }}></span>
                        <div>
                          <h3 className="font-bold text-sm">{p.name}</h3>
                          <p className={`text-[9px] font-bold uppercase tracking-tighter ${(p as any).status === 'needs_action' ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {(p as any).status === 'needs_action' ? 'Needs Action' : 'Caught Up'}
                          </p>
                        </div>
                      </div>
                      <span className={`text-slate-500 text-xs`}>→</span>
                    </button>
                    <div className="p-4 pt-0 space-y-2">
                        {pendingTasks.slice(0, 5).map(t => (
                          <TaskItem key={t.id} task={t} projectColor={p.color} onToggle={() => toggleTask(p.id, t.id)} onDelete={() => deleteTask(p.id, t.id)} />
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeView === 'projects' && (
          <div className="max-w-4xl mx-auto">
            {activeP ? (
              <div className="space-y-6 pb-24 lg:pb-0">
                <div className="flex justify-between items-center">
                  <Button variant="ghost" onClick={() => setSelectedProjectId(null)} className="p-0 text-orange-400">← Back</Button>
                  <div className="flex items-center gap-2">
                    {/* Updated Status Toggles */}
                    <div className="flex bg-white/5 p-1 rounded-full border border-white/5">
                      <button 
                        onClick={() => setProjectStatus(activeP.id, 'needs_action')}
                        className={`text-[9px] font-black px-3 py-1.5 rounded-full transition-all uppercase tracking-tighter ${
                          (activeP as any).status === 'needs_action' 
                          ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' 
                          : 'text-slate-500 hover:text-rose-400'
                        }`}
                      >
                        Needs Action
                      </button>
                      <button 
                        onClick={() => setProjectStatus(activeP.id, 'caught_up')}
                        className={`text-[9px] font-black px-3 py-1.5 rounded-full transition-all uppercase tracking-tighter ${
                          (activeP as any).status === 'caught_up' 
                          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                          : 'text-slate-500 hover:text-emerald-400'
                        }`}
                      >
                        Caught Up
                      </button>
                    </div>
                    <button onClick={() => deleteProject(activeP.id)} className="text-[10px] text-slate-600 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 uppercase font-bold">Delete Project</button>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="w-3 h-10 rounded-full" style={{ backgroundColor: activeP.color }}></div>
                    {isEditingName ? (
                        <input autoFocus className="bg-transparent border-b-2 border-orange-500 text-3xl font-bold outline-none w-full" value={editedName} onChange={(e) => setEditedName(e.target.value)} onBlur={() => updateProjectName(activeP.id)} onKeyDown={(e) => e.key === 'Enter' && updateProjectName(activeP.id)} />
                    ) : (
                        <h2 className="text-3xl font-bold cursor-pointer" onClick={() => { setIsEditingName(true); setEditedName(activeP.name); }}>{activeP.name}</h2>
                    )}
                </div>
                <div className="flex gap-4 border-b border-white/10">
                    <button onClick={() => setTaskTab('pending')} className={`pb-2 text-sm font-bold ${taskTab === 'pending' ? 'text-orange-400 border-b-2 border-orange-400' : 'text-slate-500'}`}>To Do</button>
                    <button onClick={() => setTaskTab('completed')} className={`pb-2 text-sm font-bold ${taskTab === 'completed' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-slate-500'}`}>Done</button>
                </div>
                <div className="space-y-2">
                  {(activeP.tasks || []).filter(t => taskTab === 'pending' ? !t.isCompleted : t.isCompleted).map(t => (
                      <TaskItem key={t.id} task={t} projectColor={activeP.color} onToggle={(id) => toggleTask(activeP.id, id)} onDelete={(id) => deleteTask(activeP.id, id)} />
                  ))}
                </div>
                <div className="fixed bottom-[4.5rem] left-4 right-4 lg:relative lg:bottom-0 bg-slate-900 lg:bg-white/5 p-4 rounded-2xl border border-white/10 shadow-2xl">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none text-white" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="New task..." />
                    <div className="flex gap-2">
                      <input type="date" className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white" value={newTaskDate} onChange={e => setNewTaskDate(e.target.value)} />
                      <Button className="bg-orange-600 px-8" onClick={() => addTask(activeP.id)}>Add</Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {projects.map(p => (
                  <button 
                    key={p.id} 
                    onClick={() => setSelectedProjectId(p.id)} 
                    className={`h-20 rounded-2xl border flex items-center overflow-hidden transition-all text-left ${
                      (p as any).status === 'needs_action' 
                      ? 'bg-rose-950/30 border-rose-500/30 hover:border-rose-500' 
                      : (p as any).status === 'caught_up' 
                        ? 'bg-emerald-950/30 border-emerald-500/30 hover:border-emerald-500'
                        : 'bg-white/5 border-white/10 hover:border-orange-500/30'
                    }`}
                  >
                    <div className="w-2 h-full" style={{ backgroundColor: p.color }}></div>
                    <div className="px-4 flex flex-1 justify-between items-center truncate">
                      <div>
                        <h3 className="font-bold text-base truncate pr-2">{p.name}</h3>
                        <p className={`text-[10px] font-bold uppercase tracking-tight ${(p as any).status === 'needs_action' ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {(p as any).status === 'needs_action' ? 'Needs Action' : 'Caught Up'}
                        </p>
                      </div>
                      <p className="text-slate-500 text-[10px]">{(p.tasks || []).filter(t => !t.isCompleted).length} left</p>
                    </div>
                  </button>
                ))}
                <button onClick={() => setIsAddingProject(true)} className="border-2 border-dashed border-white/5 h-20 rounded-2xl text-slate-500 flex items-center justify-center gap-2 text-sm">+ New Project</button>
              </div>
            )}
          </div>
        )}

        {activeView === 'habits' && (
          <div className="max-w-xl mx-auto space-y-8">
            <h2 className="text-3xl font-bold">Micro-Habits</h2>
            <div className="flex gap-2">
              <input className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-orange-500" placeholder="New habit..." value={newHabitName} onChange={e => setNewHabitName(e.target.value)} onKeyPress={e => e.key === 'Enter' && addHabit()} />
              <Button className="bg-orange-600 px-8 rounded-2xl" onClick={addHabit}>Add</Button>
            </div>
            <div className="space-y-3">
              {habits.map(h => (
                <div key={h.id} className="bg-white/5 p-5 rounded-2xl border border-white/10 flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <button onClick={() => deleteHabit(h.id)} className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-rose-500 text-xs font-bold transition-all">DELETE</button>
                    <div>
                      <h4 className="font-bold">{h.name}</h4>
                      <p className="text-[10px] text-orange-400 font-bold uppercase">{calculateStreak(h.completed_dates || [])} Day Streak 🔥</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="date" className="bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] opacity-0 group-hover:opacity-100 transition-all cursor-pointer" onChange={(e) => toggleHabitDate(h, e.target.value)} title="Log for past date" />
                    <button onClick={() => toggleHabitDate(h, today)} className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all ${h.completed_dates?.includes(today) ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-white/10 text-transparent'}`}>✓</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === 'calendar' && <Calendar projects={projects} />}
        {activeView === 'chat' && (
          <div className="max-w-3xl mx-auto flex flex-col h-[70vh] bg-black/20 rounded-3xl border border-white/10 p-4 relative">
            <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
              {chatHistory.map(m => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`p-4 rounded-2xl max-w-[85%] text-sm ${m.role === 'user' ? 'bg-orange-600' : 'bg-white/5 border border-white/10'}`}>{m.text}</div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="flex gap-2">
              <input className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSendMessage()} placeholder="Ask AI..." />
              <Button className="bg-orange-600 px-6" onClick={handleSendMessage} disabled={isChatLoading}>Send</Button>
            </div>
          </div>
        )}
      </main>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#0f172a]/95 backdrop-blur-xl border-t border-white/10 px-6 py-3 flex justify-between items-center z-50">
        <button onClick={() => {setActiveView('dashboard'); setSelectedProjectId(null);}} className={`flex flex-col items-center gap-1 ${activeView === 'dashboard' ? 'text-orange-400' : 'text-slate-500'}`}>🏠<span className="text-[10px]">Dash</span></button>
        <button onClick={() => setActiveView('projects')} className={`flex flex-col items-center gap-1 ${activeView === 'projects' ? 'text-orange-400' : 'text-slate-500'}`}>📁<span className="text-[10px]">Proj</span></button>
        <button onClick={() => setActiveView('habits')} className={`flex flex-col items-center gap-1 ${activeView === 'habits' ? 'text-orange-400' : 'text-slate-500'}`}>⚡<span className="text-[10px]">Habit</span></button>
        <button onClick={() => setActiveView('calendar')} className={`flex flex-col items-center gap-1 ${activeView === 'calendar' ? 'text-orange-400' : 'text-slate-500'}`}>📅<span className="text-[10px]">Cal</span></button>
        <button onClick={() => setActiveView('chat')} className={`flex flex-col items-center gap-1 ${activeView === 'chat' ? 'text-orange-400' : 'text-slate-500'}`}>🤖<span className="text-[10px]">AI</span></button>
      </nav>

      {isAddingProject && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-6 z-[100]">
          <div className="bg-slate-900 p-8 rounded-[2.5rem] w-full max-w-sm border border-white/10">
            <h3 className="text-2xl font-bold mb-4">New Project</h3>
            <input className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 mb-4 outline-none text-white" placeholder="Project Name" value={newProject.name} onChange={e => setNewProject({...newProject, name: e.target.value})} />
            <div className="flex justify-between mb-8 px-2">
                {PROJECT_COLORS.map(c => <button key={c.hex} onClick={() => setNewProject({...newProject, color: c.hex})} className={`w-8 h-8 rounded-full ${newProject.color === c.hex ? 'ring-4 ring-white' : 'opacity-40'}`} style={{ backgroundColor: c.hex }} />)}
            </div>
            <Button className="w-full bg-orange-600 py-4 font-bold" onClick={addProject}>Create</Button>
            <Button variant="ghost" className="w-full mt-2" onClick={() => setIsAddingProject(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

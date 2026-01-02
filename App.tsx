import React, { useState, useEffect } from 'react';
import { Project, Task, ViewType, ChatMessage } from './types';
import { PROJECT_COLORS } from './constants';
import { Button } from './components/Button';
import { TaskItem } from './components/TaskItem';
import { Calendar } from './components/Calendar';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from './services/supabaseClient';

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [activeView, setActiveView] = useState<ViewType>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDate, setNewTaskDate] = useState(new Date().toISOString().split('T')[0]);
  const [newProject, setNewProject] = useState({ name: '', description: '', color: PROJECT_COLORS[0].hex });
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date>(new Date());

  const daysRemainingInYear = () => {
    const today = new Date();
    const endOfYear = new Date(today.getFullYear(), 11, 31);
    return Math.ceil((endOfYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const loadData = async () => {
    const { data, error } = await supabase.from('projects').select('*').order('createdAt', { ascending: false });
    if (!error && data) { setProjects(data); setLastSynced(new Date()); }
  };

  useEffect(() => {
    loadData();
    const sub = supabase.channel('db-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => loadData()).subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    const userMsg = { id: crypto.randomUUID(), role: 'user', text: chatInput, timestamp: new Date().toISOString() };
    setChatHistory(prev => [...prev, userMsg as ChatMessage]);
    setChatInput('');
    setIsChatLoading(true);
    try {
      const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(`Context: ${JSON.stringify(projects)}. User: ${userMsg.text}`);
      const response = await result.response;
      setChatHistory(prev => [...prev, { id: crypto.randomUUID(), role: 'model', text: response.text(), timestamp: new Date().toISOString() } as ChatMessage]);
    } catch (e) { console.error(e); } finally { setIsChatLoading(false); }
  };

  const addProject = async () => {
    if (!newProject.name) return;
    const project = { id: crypto.randomUUID(), name: newProject.name, description: '', color: newProject.color, createdAt: new Date().toISOString(), tasks: [] };
    const { error } = await supabase.from('projects').insert([project]);
    if (!error) { setProjects(prev => [project, ...prev]); setIsAddingProject(false); setNewProject({ name: '', description: '', color: PROJECT_COLORS[0].hex }); }
  };

  const addTask = async (pid: string) => {
    const p = projects.find(p => p.id === pid);
    if (!p || !newTaskTitle) return;
    const updated = [...p.tasks, { id: crypto.randomUUID(), projectId: pid, title: newTaskTitle, isCompleted: false, dueDate: newTaskDate }];
    const { error } = await supabase.from('projects').update({ tasks: updated }).eq('id', pid);
    if (!error) { setProjects(prev => prev.map(proj => proj.id === pid ? { ...proj, tasks: updated } : proj)); setNewTaskTitle(''); }
  };

  const toggleTask = async (pid: string, tid: string) => {
    const p = projects.find(p => p.id === pid);
    if (!p) return;
    const updated = p.tasks.map(t => t.id === tid ? { ...t, isCompleted: !t.isCompleted } : t);
    const { error } = await supabase.from('projects').update({ tasks: updated }).eq('id', pid);
    if (!error) setProjects(prev => prev.map(proj => proj.id === pid ? { ...proj, tasks: updated } : proj));
  };

  const deleteTask = async (pid: string, tid: string) => {
    const p = projects.find(p => p.id === pid);
    if (!p) return;
    const updated = p.tasks.filter(t => t.id !== tid);
    const { error } = await supabase.from('projects').update({ tasks: updated }).eq('id', pid);
    if (!error) setProjects(prev => prev.map(proj => proj.id === pid ? { ...proj, tasks: updated } : proj));
  };

  const totalPendingTasks = projects.reduce((acc, p) => acc + p.tasks.filter(t => !t.isCompleted).length, 0);
  const completedProjects = projects.filter(p => p.tasks.length > 0 && p.tasks.every(t => t.isCompleted)).length;
  const activeP = projects.find(p => p.id === selectedProjectId);

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#0f172a] text-white font-sans pb-20 lg:pb-0">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-72 bg-black/20 p-6 flex-col gap-8 border-r border-white/5">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent">Z's Flow</h1>
        <nav className="flex flex-col gap-2">
          {['dashboard', 'projects', 'calendar', 'chat'].map((v) => (
            <Button key={v} variant="ghost" onClick={() => setActiveView(v as ViewType)} className={`justify-start capitalize ${activeView === v ? 'bg-orange-600' : ''}`}>{v}</Button>
          ))}
        </nav>
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden p-4 border-b border-white/5 flex justify-between items-center bg-[#0f172a]/80 backdrop-blur-md sticky top-0 z-40">
        <h1 className="text-xl font-bold bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent">Z's Flow</h1>
        <div className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> SYNCED
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 lg:p-10 overflow-y-auto">
        {activeView === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                <h4 className="text-slate-500 text-[9px] font-bold uppercase tracking-wider">Pending</h4>
                <p className="text-2xl font-bold">{totalPendingTasks}</p>
              </div>
              <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                <h4 className="text-slate-500 text-[9px] font-bold uppercase tracking-wider">Days Left</h4>
                <p className="text-2xl font-bold text-orange-400">{daysRemainingInYear()}</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-400 px-1">Current Focus</h3>
              {projects.map(p => p.tasks.filter(t => !t.isCompleted).length > 0 && (
                <div key={p.id} className="bg-white/5 p-4 rounded-2xl border border-white/10">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold text-sm flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }}></span> {p.name}
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {p.tasks.filter(t => !t.isCompleted).slice(0, 2).map(t => (
                      <TaskItem key={t.id} task={t} projectColor={p.color} onToggle={() => toggleTask(p.id, t.id)} onDelete={() => deleteTask(p.id, t.id)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === 'projects' && (
          <div className="max-w-4xl mx-auto">
            {activeP ? (
              <div className="space-y-4 pb-12">
                <Button variant="ghost" onClick={() => setSelectedProjectId(null)} className="p-0 text-orange-400">← Back</Button>
                <h2 className="text-2xl font-bold">{activeP.name}</h2>
                <div className="space-y-2">
                  {activeP.tasks.map(t => <TaskItem key={t.id} task={t} projectColor={activeP.color} onToggle={(id) => toggleTask(activeP.id, id)} onDelete={(id) => deleteTask(activeP.id, id)} />)}
                </div>
                <div className="fixed bottom-20 left-4 right-4 lg:relative lg:bottom-0 lg:left-0 lg:right-0 bg-slate-900 lg:bg-white/5 p-4 rounded-2xl border border-white/10 shadow-2xl">
                  <div className="flex flex-col gap-2">
                    <input className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="New task..." />
                    <div className="flex gap-2">
                        <input type="date" className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm" value={newTaskDate} onChange={e => setNewTaskDate(e.target.value)} />
                        <Button className="bg-orange-600 px-6" onClick={() => addTask(activeP.id)}>Add</Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {projects.map(p => (
                  <button key={p.id} onClick={() => setSelectedProjectId(p.id)} className="bg-white/5 p-5 rounded-2xl border border-white/10 text-left flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl flex-shrink-0" style={{ backgroundColor: p.color }}></div>
                    <div>
                        <h3 className="font-bold text-base leading-tight">{p.name}</h3>
                        <p className="text-slate-500 text-xs">{p.tasks.filter(t => !t.isCompleted).length} pending</p>
                    </div>
                  </button>
                ))}
                <button onClick={() => setIsAddingProject(true)} className="border-2 border-dashed border-white/5 p-5 rounded-2xl text-slate-500 flex items-center justify-center gap-2">
                  <span>+ New Project</span>
                </button>
              </div>
            )}
          </div>
        )}

        {activeView === 'calendar' && <div className="p-2"><Calendar projects={projects} /></div>}
        {activeView === 'chat' && (
          <div className="flex flex-col h-[70vh] bg-black/20 rounded-2xl border border-white/10 p-4">
            <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
              {chatHistory.map(m => <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`p-3 rounded-2xl max-w-[85%] text-sm ${m.role === 'user' ? 'bg-orange-600' : 'bg-white/10 border border-white/5'}`}>{m.text}</div></div>)}
            </div>
            <div className="flex gap-2">
              <input className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 text-sm" placeholder="Ask AI..." value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSendMessage()} />
              <Button className="bg-orange-600" onClick={handleSendMessage}>Send</Button>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#0f172a]/90 backdrop-blur-lg border-t border-white/10 px-6 py-3 flex justify-between items-center z-50">
        <button onClick={() => {setActiveView('dashboard'); setSelectedProjectId(null);}} className={`flex flex-col items-center gap-1 ${activeView === 'dashboard' ? 'text-orange-400' : 'text-slate-500'}`}>
            <span className="text-lg">🏠</span><span className="text-[10px] font-bold">Home</span>
        </button>
        <button onClick={() => setActiveView('projects')} className={`flex flex-col items-center gap-1 ${activeView === 'projects' ? 'text-orange-400' : 'text-slate-500'}`}>
            <span className="text-lg">📁</span><span className="text-[10px] font-bold">Projects</span>
        </button>
        <button onClick={() => setActiveView('calendar')} className={`flex flex-col items-center gap-1 ${activeView === 'calendar' ? 'text-orange-400' : 'text-slate-500'}`}>
            <span className="text-lg">📅</span><span className="text-[10px] font-bold">Cal</span>
        </button>
        <button onClick={() => setActiveView('chat')} className={`flex flex-col items-center gap-1 ${activeView === 'chat' ? 'text-orange-400' : 'text-slate-500'}`}>
            <span className="text-lg">🤖</span><span className="text-[10px] font-bold">AI</span>
        </button>
      </nav>

      {/* Project Modal */}
      {isAddingProject && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 z-[60]">
          <div className="bg-slate-900 p-6 rounded-[2rem] w-full max-w-sm border border-white/10">
            <h3 className="text-xl font-bold mb-4">New Project</h3>
            <input className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 mb-4 outline-none focus:border-orange-500" placeholder="Name" value={newProject.name} onChange={e => setNewProject({...newProject, name: e.target.value})} />
            <div className="flex justify-between mb-8 px-2">
              {PROJECT_COLORS.map(c => <button key={c.hex} onClick={() => setNewProject({...newProject, color: c.hex})} className={`w-8 h-8 rounded-full transition-all ${newProject.color === c.hex ? 'ring-4 ring-white scale-110' : 'opacity-40'}`} style={{ backgroundColor: c.hex }} />)}
            </div>
            <div className="flex flex-col gap-2">
                <Button className="w-full bg-orange-600 py-4" onClick={addProject}>Create</Button>
                <Button variant="ghost" onClick={() => setIsAddingProject(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

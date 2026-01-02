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
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: chatInput, timestamp: new Date().toISOString() };
    setChatHistory(prev => [...prev, userMsg]);
    setChatInput('');
    setIsChatLoading(true);
    try {
      const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(`Context: ${JSON.stringify(projects)}. User: ${userMsg.text}`);
      const response = await result.response;
      setChatHistory(prev => [...prev, { id: crypto.randomUUID(), role: 'model', text: response.text(), timestamp: new Date().toISOString() }]);
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

  const activeP = projects.find(p => p.id === selectedProjectId);

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#0f172a] text-white font-sans">
      <aside className="hidden lg:flex w-72 bg-black/20 p-6 flex-col gap-8 border-r border-white/5">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent">Z's Flow</h1>
        <nav className="flex flex-col gap-2">
          {['dashboard', 'projects', 'calendar', 'chat'].map((v) => (
            <Button key={v} variant="ghost" onClick={() => setActiveView(v as ViewType)} className={`justify-start capitalize ${activeView === v ? 'bg-orange-600' : ''}`}>{v}</Button>
          ))}
        </nav>
        <div className="mt-4 overflow-y-auto">
          <h3 className="text-xs font-bold text-slate-500 uppercase mb-4 px-2">Shortcut</h3>
          {projects.map(p => (
            <button key={p.id} onClick={() => { setSelectedProjectId(p.id); setActiveView('projects'); }} className="block w-full text-left p-2 text-sm text-slate-400 hover:text-white truncate">
              <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: p.color }}></span>{p.name}
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 p-6 lg:p-10">
        {activeView === 'dashboard' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                <h4 className="text-slate-400 text-xs font-bold uppercase">Pending Tasks</h4>
                <p className="text-4xl font-bold mt-2">{projects.reduce((acc, p) => acc + p.tasks.filter(t => !t.isCompleted).length, 0)}</p>
              </div>
              <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                <h4 className="text-slate-400 text-xs font-bold uppercase">Year Countdown</h4>
                <p className="text-4xl font-bold mt-2 text-orange-400">{daysRemainingInYear()} Days</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {projects.map(p => p.tasks.filter(t => !t.isCompleted).length > 0 && (
                <div key={p.id} className="bg-white/5 p-6 rounded-2xl border border-white/10">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }}></div>
                    <h3 className="font-bold">{p.name}</h3>
                  </div>
                  <div className="space-y-2">
                    {p.tasks.filter(t => !t.isCompleted).slice(0, 3).map(t => (
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
              <div className="space-y-6">
                <Button variant="ghost" onClick={() => setSelectedProjectId(null)}>← Back</Button>
                <h2 className="text-3xl font-bold">{activeP.name}</h2>
                <div className="space-y-2">
                  {activeP.tasks.map(t => <TaskItem key={t.id} task={t} projectColor={activeP.color} onToggle={(id) => toggleTask(activeP.id, id)} onDelete={(id) => deleteTask(activeP.id, id)} />)}
                </div>
                <div className="bg-white/5 p-4 rounded-xl border border-white/10 mt-8">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-3">Add New Task</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input className="flex-1 bg-black/20 border border-white/10 rounded-lg px-4 py-2" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="What needs to be done?" />
                    <input type="date" className="bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-sm" value={newTaskDate} onChange={e => setNewTaskDate(e.target.value)} />
                    <Button onClick={() => addTask(activeP.id)}>Add Task</Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map(p => (
                  <button key={p.id} onClick={() => setSelectedProjectId(p.id)} className="bg-white/5 p-6 rounded-2xl border border-white/10 text-left hover:bg-white/10 transition-all">
                    <div className="w-8 h-8 rounded-lg mb-4" style={{ backgroundColor: p.color }}></div>
                    <h3 className="font-bold text-lg">{p.name}</h3>
                    <p className="text-slate-400 text-sm mt-1">{p.tasks.length} tasks</p>
                  </button>
                ))}
                <button onClick={() => setIsAddingProject(true)} className="border-2 border-dashed border-white/10 p-6 rounded-2xl text-slate-500 hover:text-white transition-all">+ New Project</button>
              </div>
            )}
          </div>
        )}

        {activeView === 'calendar' && <Calendar projects={projects} />}
        {activeView === 'chat' && (
          <div className="max-w-2xl mx-auto flex flex-col h-[60vh] bg-black/20 rounded-2xl border border-white/10 p-4">
            <div className="flex-1 overflow-y-auto space-y-4 mb-4">
              {chatHistory.map(m => <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`p-3 rounded-xl max-w-[80%] ${m.role === 'user' ? 'bg-orange-600' : 'bg-white/10'}`}>{m.text}</div></div>)}
            </div>
            <div className="flex gap-2">
              <input className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSendMessage()} />
              <Button onClick={handleSendMessage}>Send</Button>
            </div>
          </div>
        )}
      </main>

      {isAddingProject && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 p-8 rounded-3xl w-full max-w-md border border-white/10 shadow-2xl">
            <h3 className="text-xl font-bold mb-4">New Project</h3>
            <input className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 mb-4" placeholder="Name" value={newProject.name} onChange={e => setNewProject({...newProject, name: e.target.value})} />
            <div className="flex gap-2 mb-6">
              {PROJECT_COLORS.map(c => <button key={c.hex} onClick={() => setNewProject({...newProject, color: c.hex})} className={`w-8 h-8 rounded-full ${newProject.color === c.hex ? 'ring-2 ring-white' : ''}`} style={{ backgroundColor: c.hex }} />)}
            </div>
            <Button className="w-full bg-orange-600" onClick={addProject}>Create</Button>
            <Button variant="ghost" className="w-full mt-2" onClick={() => setIsAddingProject(false)}>Cancel</Button>
          </div>
        </div>
      )}
      <div className="fixed bottom-4 right-4 bg-slate-900/80 px-4 py-2 rounded-full border border-white/10 text-[10px] font-bold text-emerald-400">
        ● CLOUD SYNCED: {lastSynced.toLocaleTimeString()}
      </div>
    </div>
  );
};

export default App;

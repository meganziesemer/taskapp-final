import React, { useState, useEffect, useRef } from 'react';
import { Project, Task, ViewType, ChatMessage } from './types';
import { PROJECT_COLORS } from './constants';
import { Button } from './components/Button';
import { TaskItem } from './components/TaskItem';
import { Calendar } from './components/Calendar';
import { supabase } from './services/supabaseClient';

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [activeView, setActiveView] = useState<ViewType>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  
  // Local date fix for the initial state
  const [newTaskDate, setNewTaskDate] = useState(new Date().toLocaleDateString('en-CA')); 
  
  const [newProject, setNewProject] = useState({ name: '', description: '', color: PROJECT_COLORS[0].hex });
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date>(new Date());
  const [taskTab, setTaskTab] = useState<'pending' | 'completed'>('pending');

  const chatEndRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isChatLoading]);

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    
    const userMsg = { 
      id: crypto.randomUUID(), 
      role: 'user', 
      text: chatInput, 
      timestamp: new Date().toISOString() 
    };

    setChatHistory(prev => [...prev, userMsg as ChatMessage]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;

      const systemInstruction = `You are the AI assistant for "Z's Flow," a task manager. 
      Today's Date: ${new Date().toLocaleDateString()}.
      Project Data: ${JSON.stringify(projects)}.
      Instruction: Help the user manage tasks. Be concise and use bullet points for lists.`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ 
            parts: [{ text: systemInstruction + "\n\nUser Question: " + userMsg.text }] 
          }]
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);

      const responseText = data.candidates[0].content.parts[0].text;

      setChatHistory(prev => [...prev, { 
        id: crypto.randomUUID(), 
        role: 'model', 
        text: responseText, 
        timestamp: new Date().toISOString() 
      } as ChatMessage]);

    } catch (e: any) { 
      console.error("Gemini Error:", e);
      setChatHistory(prev => [...prev, { 
        id: crypto.randomUUID(), 
        role: 'model', 
        text: `Error: ${e.message || "Connection issue."}`, 
        timestamp: new Date().toISOString() 
      } as ChatMessage]);
    } finally { 
      setIsChatLoading(false); 
    }
  };

  const addProject = async () => {
    if (!newProject.name) return;
    const project = { id: crypto.randomUUID(), name: newProject.name, description: '', color: newProject.color, createdAt: new Date().toISOString(), tasks: [] };
    const { error } = await supabase.from('projects').insert([project]);
    if (!error) { setProjects(prev => [project, ...prev]); setIsAddingProject(false); setNewProject({ name: '', description: '', color: PROJECT_COLORS[0].hex }); }
  };

  const deleteProject = async (pid: string) => {
    if (!window.confirm("Delete this entire project and all tasks?")) return;
    const { error } = await supabase.from('projects').delete().eq('id', pid);
    if (!error) {
      setProjects(prev => prev.filter(p => p.id !== pid));
      setSelectedProjectId(null);
    }
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

  const tasksCompletedCount = projects.reduce((acc, p) => acc + p.tasks.filter(t => t.isCompleted).length, 0);
  const tasksIncompleteCount = projects.reduce((acc, p) => acc + p.tasks.filter(t => !t.isCompleted).length, 0);
  const activeP = projects.find(p => p.id === selectedProjectId);

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#0f172a] text-white font-sans pb-20 lg:pb-0">
      <aside className="hidden lg:flex w-72 bg-black/20 p-6 flex-col gap-8 border-r border-white/5">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent">Z's Flow</h1>
        <nav className="flex flex-col gap-2">
          {['dashboard', 'projects', 'calendar', 'chat'].map((v) => (
            <Button key={v} variant="ghost" onClick={() => {setActiveView(v as ViewType); setSelectedProjectId(null);}} className={`justify-start capitalize ${activeView === v ? 'bg-orange-600' : ''}`}>{v}</Button>
          ))}
        </nav>
      </aside>

      <header className="lg:hidden p-4 border-b border-white/5 bg-[#0f172a]/80 backdrop-blur-md sticky top-0 z-40 flex justify-between items-center">
        <h1 className="text-xl font-bold bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent">Z's Flow</h1>
        <div className="text-[10px] text-emerald-400">SYNCED</div>
      </header>

      <main className="flex-1 p-4 lg:p-10 overflow-y-auto">
        {activeView === 'dashboard' && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                <h4 className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Total Projects</h4>
                <p className="text-3xl font-bold mt-1">{projects.length}</p>
              </div>
              <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                <h4 className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Tasks Done</h4>
                <p className="text-3xl font-bold mt-1 text-emerald-400">{tasksCompletedCount}</p>
              </div>
              <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                <h4 className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Tasks To Do</h4>
                <p className="text-3xl font-bold mt-1 text-rose-400">{tasksIncompleteCount}</p>
              </div>
              <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                <h4 className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Days Left</h4>
                <p className="text-3xl font-bold mt-1 text-orange-400">{daysRemainingInYear()}</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {projects.map(p => p.tasks.filter(t => !t.isCompleted).length > 0 && (
                <div key={p.id} className="bg-white/5 p-6 rounded-2xl border border-white/10">
                  <h3 className="font-bold mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }}></span> {p.name}
                  </h3>
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
              <div className="space-y-6 pb-24 lg:pb-0">
                <div className="flex justify-between items-start">
                    <Button variant="ghost" onClick={() => setSelectedProjectId(null)} className="p-0 text-orange-400">← Back</Button>
                    <button onClick={() => deleteProject(activeP.id)} className="text-slate-600 hover:text-rose-500 transition-colors text-sm">Delete Project</button>
                </div>
                <div className="flex items-center gap-4">
                    <div className="w-3 h-10 rounded-full" style={{ backgroundColor: activeP.color }}></div>
                    <h2 className="text-3xl font-bold">{activeP.name}</h2>
                </div>

                <div className="flex gap-4 border-b border-white/10">
                    <button onClick={() => setTaskTab('pending')} className={`pb-2 text-sm font-bold transition-colors ${taskTab === 'pending' ? 'text-orange-400 border-b-2 border-orange-400' : 'text-slate-500'}`}>To Do ({activeP.tasks.filter(t => !t.isCompleted).length})</button>
                    <button onClick={() => setTaskTab('completed')} className={`pb-2 text-sm font-bold transition-colors ${taskTab === 'completed' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-slate-500'}`}>Done ({activeP.tasks.filter(t => t.isCompleted).length})</button>
                </div>

                <div className="space-y-2 mt-4 min-h-[100px]">
                  {activeP.tasks.filter(t => taskTab === 'pending' ? !t.isCompleted : t.isCompleted).length > 0 ? (
                    activeP.tasks.filter(t => taskTab === 'pending' ? !t.isCompleted : t.isCompleted).map(t => (
                        <TaskItem key={t.id} task={t} projectColor={activeP.color} onToggle={(id) => toggleTask(activeP.id, id)} onDelete={(id) => deleteTask(activeP.id, id)} />
                    ))
                  ) : (
                    <p className="text-slate-600 text-sm italic py-8 text-center">No tasks found here.</p>
                  )}
                </div>

                <div className="fixed bottom-[4.5rem] left-4 right-4 lg:relative lg:bottom-0 lg:left-0 lg:right-0 bg-slate-900 lg:bg-white/5 p-4 rounded-2xl border border-white/10 shadow-2xl">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="New task..." />
                    <div className="flex gap-2">
                      {/* FIXED DATE SELECTOR */}
                      <input type="date" className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm" value={newTaskDate} onChange={e => setNewTaskDate(e.target.value)} />
                      <Button className="bg-orange-600 px-8" onClick={() => addTask(activeP.id)}>Add</Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* CONDENSED MOBILE PROJECT VIEW */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {projects.map(p => (
                  <button key={p.id} onClick={() => setSelectedProjectId(p.id)} className="bg-white/5 h-16 rounded-2xl border border-white/10 text-left hover:border-orange-500/30 transition-all flex items-center overflow-hidden">
                    <div className="w-2 h-full" style={{ backgroundColor: p.color }}></div>
                    <div className="px-4 flex flex-1 justify-between items-center">
                      <h3 className="font-bold text-base truncate pr-2">{p.name}</h3>
                      <p className="text-slate-500 text-[10px] whitespace-nowrap bg-white/5 px-2 py-1 rounded-md">{p.tasks.filter(t => !t.isCompleted).length} pending</p>
                    </div>
                  </button>
                ))}
                <button onClick={() => setIsAddingProject(true)} className="border-2 border-dashed border-white/5 h-16 rounded-2xl text-slate-500 flex items-center justify-center gap-2 text-sm">+ New Project</button>
              </div>
            )}
          </div>
        )}

        {activeView === 'calendar' && <Calendar projects={projects} />}
        
        {activeView === 'chat' && (
          <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-180px)] lg:h-[75vh] bg-black/20 rounded-3xl border border-white/10 p-4 relative">
            <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
              {chatHistory.length === 0 && (
                <div className="text-center py-20 text-slate-500 text-sm">
                  <p>Ask me about your tasks or projects!</p>
                </div>
              )}
              {chatHistory.map(m => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`p-4 rounded-2xl max-w-[85%] text-sm ${m.role === 'user' ? 'bg-orange-600 shadow-lg' : 'bg-white/5 border border-white/10'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex justify-start">
                  <div className="bg-white/5 border border-white/10 p-4 rounded-2xl animate-pulse text-slate-400 text-xs">
                    Thinking...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="flex gap-2">
              <input 
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-orange-500 transition-colors" 
                placeholder="Message AI assistant..." 
                value={chatInput} 
                onChange={e => setChatInput(e.target.value)} 
                onKeyPress={e => e.key === 'Enter' && handleSendMessage()} 
              />
              <Button className="bg-orange-600 px-6" onClick={handleSendMessage} disabled={isChatLoading}>
                {isChatLoading ? "..." : "Send"}
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* UPDATED MOBILE MENU LABELS */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#0f172a]/95 backdrop-blur-xl border-t border-white/10 px-8 py-3 flex justify-between items-center z-50">
        <button onClick={() => {setActiveView('dashboard'); setSelectedProjectId(null);}} className={`flex flex-col items-center gap-1 ${activeView === 'dashboard' ? 'text-orange-400' : 'text-slate-500'}`}>
            <span className="text-xl">🏠</span><span className="text-[10px] font-bold">Dash</span>
        </button>
        <button onClick={() => setActiveView('projects')} className={`flex flex-col items-center gap-1 ${activeView === 'projects' ? 'text-orange-400' : 'text-slate-500'}`}>
            <span className="text-xl">📁</span><span className="text-[10px] font-bold">Projects</span>
        </button>
        <button onClick={() => setActiveView('calendar')} className={`flex flex-col items-center gap-1 ${activeView === 'calendar' ? 'text-orange-400' : 'text-slate-500'}`}>
            <span className="text-xl">📅</span><span className="text-[10px] font-bold">Cal</span>
        </button>
        <button onClick={() => setActiveView('chat')} className={`flex flex-col items-center gap-1 ${activeView === 'chat' ? 'text-orange-400' : 'text-slate-500'}`}>
            <span className="text-xl">🤖</span><span className="text-[10px] font-bold">AI</span>
        </button>
      </nav>

      {isAddingProject && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-6 z-[100]">
          <div className="bg-slate-900 p-8 rounded-[2.5rem] w-full max-w-sm border border-white/10">
            <h3 className="text-2xl font-bold mb-4">New Project</h3>
            <input className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 mb-4 outline-none" placeholder="Project Name" value={newProject.name} onChange={e => setNewProject({...newProject, name: e.target.value})} />
            <div className="flex justify-between mb-8 px-2">
                {PROJECT_COLORS.map(c => <button key={c.hex} onClick={() => setNewProject({...newProject, color: c.hex})} className={`w-8 h-8 rounded-full ${newProject.color === c.hex ? 'ring-4 ring-white scale-110' : 'opacity-40'}`} style={{ backgroundColor: c.hex }} />)}
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

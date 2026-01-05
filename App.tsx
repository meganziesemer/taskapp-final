import React, { useState, useEffect, useRef } from 'react';
import { Project, Task, ViewType, ChatMessage } from './types';
import { PROJECT_COLORS } from './constants';
import { Button } from './components/Button';
import { TaskItem } from './components/TaskItem';
import { Calendar } from './components/Calendar';
import { supabase } from './services/supabaseClient';

const App: React.FC = () => {
  // 1. All State Definitions
  const [projects, setProjects] = useState<Project[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [activeView, setActiveView] = useState<ViewType>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [taskTab, setTaskTab] = useState<'pending' | 'completed'>('pending');

  // 2. Date Helpers (Fixed for Timezones)
  const getTodayString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const [newTaskDate, setNewTaskDate] = useState(getTodayString());

  const daysInYear = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31);
    const total = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const passed = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return { left: total - passed, passed };
  };

  const [newProject, setNewProject] = useState({ name: '', description: '', color: PROJECT_COLORS[0].hex });

  // 3. CRITICAL: Define activeP here so it's available to the render logic
  const activeP = projects.find(p => p.id === selectedProjectId);

  // 4. Data Loading
  const loadData = async () => {
    const { data, error } = await supabase.from('projects').select('*');
    if (!error && data) { 
      const sortedData = [...data].sort((a, b) => a.name.localeCompare(b.name));
      setProjects(sortedData); 
    }
  };

  useEffect(() => {
    loadData();
    const sub = supabase.channel('db-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => loadData()).subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory]);

  // 5. Actions
  const updateProjectName = async (pid: string) => {
    if (!editedName.trim()) { setIsEditingName(false); return; }
    const { error } = await supabase.from('projects').update({ name: editedName }).eq('id', pid);
    if (!error) {
        setIsEditingName(false);
        loadData();
    }
  };

  const addTask = async (pid: string) => {
    const p = projects.find(proj => proj.id === pid);
    if (!p || !newTaskTitle) return;
    // We store the date exactly as selected
    const updated = [...p.tasks, { id: crypto.randomUUID(), projectId: pid, title: newTaskTitle, isCompleted: false, dueDate: newTaskDate }];
    const { error } = await supabase.from('projects').update({ tasks: updated }).eq('id', pid);
    if (!error) { setNewTaskTitle(''); loadData(); }
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

  const handleSendMessage = async () => { /* AI logic omitted for brevity, keep your current one */ };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#0f172a] text-white font-sans pb-20 lg:pb-0">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-72 bg-black/20 p-6 flex-col gap-8 border-r border-white/5">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent">Z's Flow</h1>
          <p className="text-[10px] text-slate-500 font-medium italic">make every day count</p>
        </div>
        <nav className="flex flex-col gap-2">
          {['dashboard', 'projects', 'calendar', 'chat'].map((v) => (
            <Button key={v} variant="ghost" onClick={() => {setActiveView(v as ViewType); setSelectedProjectId(null);}} className={`justify-start capitalize ${activeView === v ? 'bg-orange-600' : ''}`}>
              {v}
            </Button>
          ))}
        </nav>
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden p-4 border-b border-white/5 bg-[#0f172a]/80 backdrop-blur-md sticky top-0 z-40 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent leading-tight">Z's Flow</h1>
          <p className="text-[8px] text-slate-500 italic">make every day count</p>
        </div>
        <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-tighter">Synced</div>
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
                <p className="text-3xl font-bold mt-1 text-emerald-400">{projects.reduce((acc, p) => acc + p.tasks.filter(t => t.isCompleted).length, 0)}</p>
              </div>
              <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                <h4 className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Tasks To Do</h4>
                <p className="text-3xl font-bold mt-1 text-rose-400">{projects.reduce((acc, p) => acc + p.tasks.filter(t => !t.isCompleted).length, 0)}</p>
              </div>
              <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                <h4 className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Days Left</h4>
                <p className="text-3xl font-bold mt-1 text-orange-400">{daysInYear().left}</p>
                <p className="text-[10px] text-slate-500 mt-1 font-bold">({daysInYear().passed} days complete)</p>
              </div>
            </div>
            {/* Project Quick View... */}
          </div>
        )}

        {activeView === 'projects' && (
          <div className="max-w-4xl mx-auto">
            {activeP ? (
              <div className="space-y-6 pb-24 lg:pb-0">
                <Button variant="ghost" onClick={() => {setSelectedProjectId(null); setIsEditingName(false);}} className="p-0 text-orange-400">← Back</Button>
                
                <div className="flex items-center gap-4 group">
                    <div className="w-3 h-10 rounded-full" style={{ backgroundColor: activeP.color }}></div>
                    {isEditingName ? (
                        <input autoFocus className="bg-white/5 border-b-2 border-orange-500 text-3xl font-bold outline-none px-2 py-1 w-full" value={editedName} onChange={(e) => setEditedName(e.target.value)} onBlur={() => updateProjectName(activeP.id)} onKeyDown={(e) => e.key === 'Enter' && updateProjectName(activeP.id)} />
                    ) : (
                        <h2 className="text-3xl font-bold cursor-pointer hover:text-orange-400 transition-colors flex items-center gap-3" onClick={() => { setIsEditingName(true); setEditedName(activeP.name); }}>
                            {activeP.name} <span className="text-[10px] text-slate-600 opacity-50">(edit)</span>
                        </h2>
                    )}
                </div>

                <div className="flex gap-4 border-b border-white/10">
                    <button onClick={() => setTaskTab('pending')} className={`pb-2 text-sm font-bold transition-colors ${taskTab === 'pending' ? 'text-orange-400 border-b-2 border-orange-400' : 'text-slate-500'}`}>To Do ({activeP.tasks.filter(t => !t.isCompleted).length})</button>
                    <button onClick={() => setTaskTab('completed')} className={`pb-2 text-sm font-bold transition-colors ${taskTab === 'completed' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-slate-500'}`}>Done ({activeP.tasks.filter(t => t.isCompleted).length})</button>
                </div>

                <div className="space-y-2 mt-4 min-h-[100px]">
                  {activeP.tasks.filter(t => taskTab === 'pending' ? !t.isCompleted : t.isCompleted).map(t => (
                      <TaskItem key={t.id} task={t} projectColor={activeP.color} onToggle={(id) => toggleTask(activeP.id, id)} onDelete={(id) => deleteTask(activeP.id, id)} />
                  ))}
                </div>

                <div className="fixed bottom-[4.5rem] left-4 right-4 lg:relative lg:bottom-0 lg:left-0 lg:right-0 bg-slate-900 lg:bg-white/5 p-4 rounded-2xl border border-white/10 shadow-2xl">
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
        {/* Other views (Calendar/Chat) stay the same */}
      </main>
      
      {/* Mobile Nav and Modals... */}
    </div>
  );
};

export default App;

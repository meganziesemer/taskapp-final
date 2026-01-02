
import React, { useState, useEffect, useRef } from 'react';
import { Project, Task, ViewType, ChatMessage } from './types';
import { PROJECT_COLORS } from './constants';
import { Button } from './components/Button';
import { TaskItem } from './components/TaskItem';
import { Calendar } from './components/Calendar';
import { GoogleGenAI } from "@google/genai";

const App: React.FC = () => {
  // --- Data Persistence ---
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const saved = localStorage.getItem('project_flow_data');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('project_flow_chat');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [activeView, setActiveView] = useState<ViewType>(() => {
    const saved = localStorage.getItem('project_flow_view');
    return (saved as ViewType) || 'dashboard';
  });

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => {
    return localStorage.getItem('project_flow_selected_id');
  });

  const [taskFilter, setTaskFilter] = useState<'active' | 'completed'>(() => {
    return (localStorage.getItem('project_flow_filter') as 'active' | 'completed') || 'active';
  });

  // --- Draft Persistence (Saving as you type) ---
  const [chatInput, setChatInput] = useState(() => localStorage.getItem('project_flow_draft_chat') || '');
  const [newTaskTitle, setNewTaskTitle] = useState(() => localStorage.getItem('project_flow_draft_task_title') || '');
  const [newProject, setNewProject] = useState(() => {
    const saved = localStorage.getItem('project_flow_draft_project');
    return saved ? JSON.parse(saved) : { name: '', description: '', color: PROJECT_COLORS[0].hex };
  });

  // --- UI State ---
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskDueDate, setNewTaskDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date>(new Date());
  const chatEndRef = useRef<HTMLDivElement>(null);

  // --- Persistence Sync Hooks ---
  useEffect(() => { 
    localStorage.setItem('project_flow_data', JSON.stringify(projects)); 
    setLastSynced(new Date());
  }, [projects]);

  useEffect(() => { 
    localStorage.setItem('project_flow_chat', JSON.stringify(chatHistory)); 
    setLastSynced(new Date());
  }, [chatHistory]);

  useEffect(() => { localStorage.setItem('project_flow_view', activeView); }, [activeView]);
  useEffect(() => { localStorage.setItem('project_flow_filter', taskFilter); }, [taskFilter]);
  
  useEffect(() => {
    if (selectedProjectId) localStorage.setItem('project_flow_selected_id', selectedProjectId);
    else localStorage.removeItem('project_flow_selected_id');
  }, [selectedProjectId]);

  // Saving drafts as you type
  useEffect(() => { localStorage.setItem('project_flow_draft_chat', chatInput); }, [chatInput]);
  useEffect(() => { localStorage.setItem('project_flow_draft_task_title', newTaskTitle); }, [newTaskTitle]);
  useEffect(() => { localStorage.setItem('project_flow_draft_project', JSON.stringify(newProject)); }, [newProject]);

  // Scroll chat to bottom
  useEffect(() => {
    if (activeView === 'chat') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, activeView]);

  // --- AI Handlers ---
  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: chatInput,
      timestamp: new Date().toISOString()
    };

    setChatHistory(prev => [...prev, userMsg]);
    setChatInput(''); // Draft cleared after send
    setIsChatLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: chatHistory.map(m => ({ role: m.role, parts: [{ text: m.text }] })).concat({ role: 'user', parts: [{ text: userMsg.text }] }),
        config: {
          systemInstruction: "You are Z's AI Project Assistant. You help organize tasks, brainstorm project names, and provide productivity tips. Keep responses concise and encouraging."
        }
      });

      const modelMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'model',
        text: response.text || "I'm sorry, I couldn't process that.",
        timestamp: new Date().toISOString()
      };
      setChatHistory(prev => [...prev, modelMsg]);
    } catch (error) {
      console.error("AI Error:", error);
    } finally {
      setIsChatLoading(false);
    }
  };

  // --- Project/Task Handlers ---
  const daysRemainingInYear = () => {
    const today = new Date();
    const endOfYear = new Date(today.getFullYear(), 11, 31);
    const diff = endOfYear.getTime() - today.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const addProject = () => {
    if (!newProject.name) return;
    const projectId = crypto.randomUUID();
    const project: Project = {
      id: projectId,
      name: newProject.name,
      description: newProject.description,
      color: newProject.color,
      createdAt: new Date().toISOString(),
      tasks: []
    };
    setProjects(prev => [...prev, project]);
    setNewProject({ name: '', description: '', color: PROJECT_COLORS[0].hex });
    setIsAddingProject(false);
    setSelectedProjectId(projectId);
    setActiveView('projects');
  };

  const addTask = (projectId: string) => {
    if (!newTaskTitle) return;
    const task: Task = {
      id: crypto.randomUUID(),
      projectId,
      title: newTaskTitle,
      isCompleted: false,
      dueDate: newTaskDueDate,
    };
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, tasks: [...p.tasks, task] } : p));
    setNewTaskTitle('');
    setIsAddingTask(false);
  };

  const toggleTask = (projectId: string, taskId: string) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      return {
        ...p,
        tasks: p.tasks.map(t => {
          if (t.id !== taskId) return t;
          const isCompleted = !t.isCompleted;
          return { ...t, isCompleted, completedDate: isCompleted ? new Date().toISOString() : undefined };
        })
      };
    }));
  };

  const deleteTask = (projectId: string, taskId: string) => {
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, tasks: p.tasks.filter(t => t.id !== taskId) } : p));
  };

  const activeProject = projects.find(p => p.id === selectedProjectId);
  const filteredTasks = activeProject 
    ? activeProject.tasks.filter(t => taskFilter === 'active' ? !t.isCompleted : t.isCompleted)
    : [];

  const handleStatClick = (view: ViewType) => {
    setActiveView(view);
    if (view !== 'projects') setSelectedProjectId(null);
    setIsMobileMenuOpen(false);
  };

  const NavContent = () => (
    <>
      <nav className="flex flex-col gap-2">
        <Button 
          variant="ghost" 
          onClick={() => handleStatClick('dashboard')}
          className={`justify-start gap-3 transition-all duration-300 ${activeView === 'dashboard' ? 'bg-gradient-to-r from-orange-600 to-rose-600 text-white shadow-lg shadow-orange-900/20' : 'text-slate-300 hover:bg-orange-500/10 hover:text-orange-400'}`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" /></svg>
          Dashboard
        </Button>
        <Button 
          variant="ghost" 
          onClick={() => handleStatClick('projects')}
          className={`justify-start gap-3 transition-all duration-300 ${activeView === 'projects' ? 'bg-gradient-to-r from-orange-600 to-rose-600 text-white shadow-lg shadow-orange-900/20' : 'text-slate-300 hover:bg-orange-500/10 hover:text-orange-400'}`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
          Projects
        </Button>
        <Button 
          variant="ghost" 
          onClick={() => handleStatClick('calendar')}
          className={`justify-start gap-3 transition-all duration-300 ${activeView === 'calendar' ? 'bg-gradient-to-r from-orange-600 to-rose-600 text-white shadow-lg shadow-orange-900/20' : 'text-slate-300 hover:bg-orange-500/10 hover:text-orange-400'}`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          Calendar
        </Button>
        <Button 
          variant="ghost" 
          onClick={() => handleStatClick('chat')}
          className={`justify-start gap-3 transition-all duration-300 ${activeView === 'chat' ? 'bg-gradient-to-r from-orange-600 to-rose-600 text-white shadow-lg shadow-orange-900/20' : 'text-slate-300 hover:bg-orange-500/10 hover:text-orange-400'}`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
          AI Assistant
        </Button>
      </nav>

      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">My Projects</h3>
          <button onClick={() => setIsAddingProject(true)} className="p-1 hover:bg-white/10 rounded-lg text-blue-400 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 4v16m8-8H4" /></svg>
          </button>
        </div>
        <div className="space-y-1 max-h-[300px] overflow-y-auto pr-2">
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => { setSelectedProjectId(p.id); setActiveView('projects'); setIsMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 p-2 rounded-lg text-sm transition-all ${selectedProjectId === p.id && activeView === 'projects' ? 'bg-white/20 text-blue-300 font-bold' : 'text-slate-400 hover:bg-white/5'}`}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }}></span>
              <span className="truncate">{p.name}</span>
            </button>
          ))}
          {projects.length === 0 && <p className="text-xs text-slate-500 italic px-2">No projects yet</p>}
        </div>
      </div>
    </>
  );

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      {/* Sidebar (Desktop) */}
      <aside className="hidden lg:flex w-72 bg-black/20 backdrop-blur-md border-r border-white/5 p-6 flex-col gap-8 h-screen sticky top-0">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-2">
          Z's Projects
        </h1>
        <NavContent />
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 lg:p-10 overflow-y-auto pb-20 lg:pb-10">
        <header className="mb-8 flex justify-between items-center">
          <h2 className="text-3xl font-bold text-white capitalize">
            {activeView.replace('-', ' ')}
          </h2>
          <Button variant="ghost" className="lg:hidden" onClick={() => setIsMobileMenuOpen(true)}>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 6h16M4 12h16m-7 6h7" /></svg>
          </Button>
        </header>

        {/* --- Views --- */}
        {activeView === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <button onClick={() => handleStatClick('all-tasks')} className="bg-white/10 p-6 rounded-2xl border border-white/10 hover:bg-white/20 text-left transition-all">
              <h3 className="text-slate-300 text-xs font-bold uppercase mb-2">Tasks</h3>
              <div className="text-4xl font-bold text-blue-400">{projects.reduce((acc, p) => acc + p.tasks.filter(t => !t.isCompleted).length, 0)}</div>
            </button>
            <button onClick={() => handleStatClick('completed-tasks')} className="bg-white/10 p-6 rounded-2xl border border-white/10 hover:bg-white/20 text-left transition-all">
              <h3 className="text-slate-300 text-xs font-bold uppercase mb-2">Completed</h3>
              <div className="text-4xl font-bold text-emerald-400">{projects.reduce((acc, p) => acc + p.tasks.filter(t => t.isCompleted).length, 0)}</div>
            </button>
            <button onClick={() => handleStatClick('projects')} className="bg-white/10 p-6 rounded-2xl border border-white/10 hover:bg-white/20 text-left transition-all">
              <h3 className="text-slate-300 text-xs font-bold uppercase mb-2">Projects</h3>
              <div className="text-4xl font-bold text-indigo-400">{projects.length}</div>
            </button>
            <div className="bg-gradient-to-br from-orange-600/20 to-rose-600/20 p-6 rounded-2xl border border-white/10">
              <h3 className="text-slate-300 text-xs font-bold uppercase mb-2">Days Left</h3>
              <div className="text-4xl font-black text-white">{daysRemainingInYear()}</div>
            </div>
          </div>
        )}

        {activeView === 'chat' && (
          <div className="max-w-4xl mx-auto flex flex-col h-[70vh] bg-black/20 rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {chatHistory.length === 0 && (
                <div className="text-center py-20 text-slate-500 italic">Ask me anything about your projects!</div>
              )}
              {chatHistory.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-4 rounded-2xl ${msg.role === 'user' ? 'bg-orange-600 text-white shadow-lg' : 'bg-white/10 text-slate-100'}`}>
                    <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                  </div>
                </div>
              ))}
              {isChatLoading && <div className="text-slate-500 text-xs animate-pulse">AI is typing...</div>}
              <div ref={chatEndRef} />
            </div>
            <div className="p-4 bg-white/5 border-t border-white/10 flex gap-2">
              <input 
                id="ai-chat-input"
                type="text" 
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                placeholder="Type your message..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleSendMessage()}
              />
              <Button onClick={handleSendMessage} className="bg-orange-600 hover:bg-orange-700">Send</Button>
            </div>
          </div>
        )}

        {activeView === 'all-tasks' && (
           <div className="max-w-4xl mx-auto space-y-3">
             {projects.flatMap(p => p.tasks.filter(t => !t.isCompleted).map(t => ({ ...t, color: p.color, projectName: p.name })))
                .map(task => (
                  <div key={task.id} className="bg-white/5 p-4 rounded-xl border border-white/5 shadow-sm">
                    <TaskItem task={task} projectColor={task.color} onToggle={(tid) => toggleTask(task.projectId, tid)} onDelete={(tid) => deleteTask(task.projectId, tid)} />
                  </div>
                ))}
             {projects.reduce((acc, p) => acc + p.tasks.filter(t => !t.isCompleted).length, 0) === 0 && (
               <div className="text-center py-20 text-slate-500">No active tasks.</div>
             )}
           </div>
        )}

        {activeView === 'completed-tasks' && (
           <div className="max-w-4xl mx-auto space-y-3">
             {projects.flatMap(p => p.tasks.filter(t => t.isCompleted).map(t => ({ ...t, color: p.color, projectName: p.name })))
                .map(task => (
                  <div key={task.id} className="bg-white/5 p-4 rounded-xl border border-white/5 shadow-sm opacity-75">
                    <TaskItem task={task} projectColor={task.color} onToggle={(tid) => toggleTask(task.projectId, tid)} onDelete={(tid) => deleteTask(task.projectId, tid)} />
                  </div>
                ))}
             {projects.reduce((acc, p) => acc + p.tasks.filter(t => t.isCompleted).length, 0) === 0 && (
               <div className="text-center py-20 text-slate-500">No completed tasks yet.</div>
             )}
           </div>
        )}

        {activeView === 'calendar' && <Calendar projects={projects} />}

        {activeView === 'projects' && (
          <div className="max-w-4xl mx-auto">
            {activeProject ? (
              <div className="space-y-6">
                <Button variant="ghost" onClick={() => setSelectedProjectId(null)} className="text-slate-400">Back to Projects</Button>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                   <h3 className="text-2xl font-bold flex items-center gap-3">
                     <span className="w-3 h-8 rounded-full" style={{ backgroundColor: activeProject.color }}></span>
                     {activeProject.name}
                   </h3>
                   <div className="flex gap-2 bg-black/20 p-1 rounded-xl">
                     <button onClick={() => setTaskFilter('active')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${taskFilter === 'active' ? 'bg-blue-600 shadow-lg' : 'text-slate-400 hover:text-white'}`}>Active</button>
                     <button onClick={() => setTaskFilter('completed')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${taskFilter === 'completed' ? 'bg-emerald-600 shadow-lg' : 'text-slate-400 hover:text-white'}`}>Done</button>
                   </div>
                </div>
                <div className="space-y-3">
                  {filteredTasks.map(t => (
                    <div key={t.id} className="bg-white/5 rounded-xl border border-white/5 shadow-sm">
                      <TaskItem task={t} projectColor={activeProject.color} onToggle={(tid) => toggleTask(activeProject.id, tid)} onDelete={(tid) => deleteTask(activeProject.id, tid)} />
                    </div>
                  ))}
                  
                  {taskFilter === 'active' && (
                    <div className="flex gap-2 mt-6 p-4 bg-white/5 rounded-2xl border border-white/5">
                      <input 
                        id={`new-task-input-${activeProject.id}`}
                        type="text" 
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" 
                        placeholder="What's next?" 
                        value={newTaskTitle} 
                        onChange={e => setNewTaskTitle(e.target.value)} 
                        onKeyPress={e => e.key === 'Enter' && addTask(activeProject.id)}
                      />
                      <Button onClick={() => addTask(activeProject.id)}>Add Task</Button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {projects.map(p => (
                  <button key={p.id} onClick={() => setSelectedProjectId(p.id)} className="bg-white/10 p-8 rounded-3xl border border-white/10 hover:bg-white/20 transition-all text-left shadow-xl hover:-translate-y-1">
                    <div className="w-12 h-12 rounded-2xl mb-4 shadow-lg" style={{ backgroundColor: p.color }}></div>
                    <h4 className="text-xl font-bold">{p.name}</h4>
                    <p className="text-slate-400 text-sm mt-1">{p.tasks.length} {p.tasks.length === 1 ? 'task' : 'tasks'}</p>
                  </button>
                ))}
                <button onClick={() => setIsAddingProject(true)} className="border-2 border-dashed border-white/10 p-8 rounded-3xl hover:bg-white/5 flex flex-col items-center justify-center text-slate-500 font-bold transition-all group">
                  <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 4v16m8-8H4" /></svg>
                  </div>
                  New Project
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Sync Indicator */}
      <div className="fixed bottom-4 right-4 z-50 pointer-events-none">
        <div className="bg-slate-900/80 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full flex items-center gap-2 shadow-2xl animate-in slide-in-from-bottom-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
            Data Synced {lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      </div>

      {/* --- Modals --- */}
      {isAddingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-slate-900 p-8 rounded-3xl border border-white/10 w-full max-w-md shadow-2xl animate-in zoom-in duration-200">
            <h3 className="text-2xl font-bold mb-6 text-white">Create New Project</h3>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 ml-1">Project Name</label>
            <input 
              id="new-project-name-input"
              type="text" 
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 mb-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" 
              placeholder="e.g. Dream House" 
              value={newProject.name} 
              onChange={e => setNewProject({...newProject, name: e.target.value})} 
            />
            
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Theme Color</label>
            <div className="flex flex-wrap gap-2.5 mb-8">
              {PROJECT_COLORS.map(c => (
                <button 
                  key={c.hex} 
                  onClick={() => setNewProject({...newProject, color: c.hex})} 
                  className={`w-9 h-9 rounded-full transition-all ${newProject.color === c.hex ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110' : 'opacity-60 hover:opacity-100 hover:scale-105'}`} 
                  style={{ backgroundColor: c.hex }} 
                />
              ))}
            </div>
            
            <div className="flex flex-col gap-3">
              <Button onClick={addProject} className="bg-orange-600 py-3 shadow-lg shadow-orange-900/20">Create Project</Button>
              <Button variant="ghost" onClick={() => setIsAddingProject(false)} className="text-slate-400">Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden bg-slate-950/95 backdrop-blur-xl p-6 flex flex-col gap-8 animate-in slide-in-from-top">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold text-white">Menu</h1>
            <Button variant="ghost" onClick={() => setIsMobileMenuOpen(false)}>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" /></svg>
            </Button>
          </div>
          <NavContent />
        </div>
      )}
    </div>
  );
};

export default App;

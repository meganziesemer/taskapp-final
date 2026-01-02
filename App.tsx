import React, { useState, useEffect, useRef } from 'react';
import { Project, Task, ViewType, ChatMessage } from './types';
import { PROJECT_COLORS } from './constants';
import { Button } from './components/Button';
import { TaskItem } from './components/TaskItem';
import { Calendar } from './components/Calendar';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from './services/supabaseClient';

const App: React.FC = () => {
  // --- Data State ---
  const [projects, setProjects] = useState<Project[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  
  // --- UI State ---
  const [activeView, setActiveView] = useState<ViewType>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [taskFilter] = useState<'active' | 'completed'>('active');
  const [chatInput, setChatInput] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newProject, setNewProject] = useState({ name: '', description: '', color: PROJECT_COLORS[0].hex });
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date>(new Date());

  // --- Fetch Data from Supabase ---
  const loadData = async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('createdAt', { ascending: false });

    if (!error && data) {
      setProjects(data);
      setLastSynced(new Date());
    }
  };

  useEffect(() => {
    loadData();
    const subscription = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        loadData();
      })
      .subscribe();

    return () => { supabase.removeChannel(subscription); };
  }, []);

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
    setChatInput('');
    setIsChatLoading(true);

    try {
      const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = `System: You are Z's Assistant. Context: ${JSON.stringify(projects)}. User: ${userMsg.text}`;
      const result = await model.generateContent(prompt);
      const response = await result.response;

      const modelMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'model',
        text: response.text(),
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
  const addProject = async () => {
    if (!newProject.name) return;
    const project: Project = {
      id: crypto.randomUUID(),
      name: newProject.name,
      description: newProject.description,
      color: newProject.color,
      createdAt: new Date().toISOString(),
      tasks: []
    };

    const { error } = await supabase.from('projects').insert([project]);

    if (!error) {
      setProjects(prev => [project, ...prev]);
      setNewProject({ name: '', description: '', color: PROJECT_COLORS[0].hex });
      setIsAddingProject(false);
    }
  };

  const addTask = async (projectId: string) => {
    if (!newTaskTitle) return;
    const targetProject = projects.find(p => p.id === projectId);
    if (!targetProject) return;

    const newTask: Task = {
      id: crypto.randomUUID(),
      projectId,
      title: newTaskTitle,
      isCompleted: false,
      dueDate: new Date().toISOString().split('T')[0]
    };

    const updatedTasks = [...targetProject.tasks, newTask];
    const { error } = await supabase
      .from('projects')
      .update({ tasks: updatedTasks })
      .eq('id', projectId);

    if (!error) {
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, tasks: updatedTasks } : p));
      setNewTaskTitle('');
    }
  };

  const toggleTask = async (projectId: string, taskId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const updatedTasks = project.tasks.map(t => 
      t.id === taskId ? { ...t, isCompleted: !t.isCompleted } : t
    );
    const { error } = await supabase.from('projects').update({ tasks: updatedTasks }).eq('id', projectId);
    if (!error) setProjects(prev => prev.map(p => p.id === projectId ? { ...p, tasks: updatedTasks } : p));
  };

  const deleteTask = async (projectId: string, taskId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const updatedTasks = project.tasks.filter(t => t.id !== taskId);
    const { error } = await supabase.from('projects').update({ tasks: updatedTasks }).eq('id', projectId);
    if (!error) setProjects(prev => prev.map(p => p.id === projectId ? { ...p, tasks: updatedTasks } : p));
  };

  const activeProject = projects.find(p => p.id === selectedProjectId);
  const filteredTasks = activeProject 
    ? activeProject.tasks.filter(t => taskFilter === 'active' ? !t.isCompleted : t.isCompleted)
    : [];

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#0f172a] text-white">
      <aside className="hidden lg:flex w-72 bg-black/20 p-6 flex-col gap-8 border-r border-white/5">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent">Z's Flow</h1>
        <nav className="flex flex-col gap-2">
          <Button variant="ghost" onClick={() => setActiveView('dashboard')}>Dashboard</Button>
          <Button variant="ghost" onClick={() => setActiveView('projects')}>Projects</Button>
          <Button variant="ghost" onClick={() => setActiveView('calendar')}>Calendar</Button>
          <Button variant="ghost" onClick={() => setActiveView('chat')}>AI Assistant</Button>
        </nav>
      </aside>

      <main className="flex-1 p-6 lg:p-10">
        {activeView === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
              <h4 className="text-slate-400 text-xs font-bold uppercase">Active Projects</h4>
              <p className="text-4xl font-bold mt-2">{projects.length}</p>
            </div>
          </div>
        )}

        {activeView === 'projects' && (
          <div className="max-w-4xl mx-auto">
            {activeProject ? (
              <div className="space-y-6">
                <Button variant="ghost" onClick={() => setSelectedProjectId(null)}>← Back</Button>
                <h2 className="text-3xl font-bold">{activeProject.name}</h2>
                <div className="space-y-2">
                  {filteredTasks.map(t => (
                    <TaskItem key={t.id} task={t} projectColor={activeProject.color} 
                      onToggle={(tid) => toggleTask(activeProject.id, tid)} 
                      onDelete={(tid) => deleteTask(activeProject.id, tid)} />
                  ))}
                  <div className="flex gap-2 mt-4">
                    <input className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2" 
                      placeholder="Add task..." value={newTaskTitle} 
                      onChange={e => setNewTaskTitle(e.target.value)} />
                    <Button onClick={() => addTask(activeProject.id)}>Add</Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {projects.map(p => (
                  <button key={p.id} onClick={() => setSelectedProjectId(p.id)} 
                    className="bg-white/5 p-6 rounded-2xl border border-white/10 text-left">
                    <div className="w-8 h-8 rounded-lg mb-4" style={{ backgroundColor: p.color }}></div>
                    <h3 className="font-bold text-lg">{p.name}</h3>
                  </button>
                ))}
                <button onClick={() => setIsAddingProject(true)} 
                  className="border-2 border-dashed border-white/10 p-6 rounded-2xl">+ New Project</button>
              </div>
            )}
          </div>
        )}

        {activeView === 'calendar' && <Calendar projects={projects} />}

        {activeView === 'chat' && (
          <div className="max-w-2xl mx-auto flex flex-col h-[60vh] bg-black/20 rounded-2xl border border-white/10 p-4">
            <div className="flex-1 overflow-y-auto space-y-4 mb-4">
              {chatHistory.map(m => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`p-3 rounded-xl max-w-[80%] ${m.role === 'user' ? 'bg-orange-600' : 'bg-white/10'}`}>{m.text}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4" 
                value={chatInput} onChange={e => setChatInput(e.target.value)} 
                onKeyPress={e => e.key === 'Enter' && handleSendMessage()} />
              <Button onClick={handleSendMessage}>Send</Button>
            </div>
          </div>
        )}
      </main>

      {isAddingProject && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 p-8 rounded-3xl w-full max-w-md border border-white/10">
            <h3 className="text-xl font-bold mb-4">New Project</h3>
            <input className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 mb-4" 
              placeholder="Name" value={newProject.name} 
              onChange={e => setNewProject({...newProject, name: e.target.value})} />
            <div className="flex gap-2 mb-6">
              {PROJECT_COLORS.map(c => (
                <button key={c.hex} onClick={() => setNewProject({...newProject, color: c.hex})} 
                  className={`w-8 h-8 rounded-full ${newProject.color === c.hex ? 'ring-2 ring-white' : ''}`} 
                  style={{ backgroundColor: c.hex }} />
              ))}
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

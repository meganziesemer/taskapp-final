import React, { useState, useEffect, useRef } from 'react';
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
  const [newProject, setNewProject] = useState({ name: '', description: '', color: PROJECT_COLORS[0].hex });
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date>(new Date());

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
      const modelMsg: ChatMessage = { id: crypto.randomUUID(), role: 'model', text: response.text(), timestamp: new Date().toISOString() };
      setChatHistory(prev => [...prev, modelMsg]);
    } catch (e) { console.error(e); } finally { setIsChatLoading(false); }
  };

  const addProject = async () => {
    if (!newProject.name) return;
    const project: Project = { id: crypto.randomUUID(), name: newProject.name, description: '', color: newProject.color, createdAt: new Date().toISOString(), tasks: [] };
    const { error } = await supabase.from('projects').insert([project]);
    if (!error) { setProjects(prev => [project, ...prev]); setIsAddingProject(false); }
  };

  const addTask = async (projectId: string) => {
    const target = projects.find(p => p.id === projectId);
    if (!target || !newTaskTitle) return;
    const updatedTasks = [...target.tasks, { id: crypto.randomUUID(), projectId, title: newTaskTitle, isCompleted: false, dueDate: new Date().toISOString().split('T')[0] }];
    const { error } = await supabase.from('projects').update({ tasks: updatedTasks }).eq('id', projectId);
    if (!error) { setProjects(prev => prev.map(p => p.id === projectId ? { ...p, tasks: updatedTasks } : p)); setNewTaskTitle(''); }
  };

  const activeProject = projects.find(p => p.id === selectedProjectId);

  return (
    <div className="flex min-h-screen bg-[#0f172a] text-white">
      <aside className="w-64 bg-black/20 p-6 border-r border-white/5 flex flex-col gap-4">
        <h1 className="text-xl font-bold">Z's Flow</h1>
        <Button onClick={() => setActiveView('dashboard')}>Dashboard</Button>
        <Button onClick={() => setActiveView('projects')}>Projects</Button>
        <Button onClick={() => setActiveView('chat')}>AI Assistant</Button>
      </aside>
      <main className="flex-1 p-10">
        {activeView === 'dashboard' && <h2 className="text-2xl font-bold">Welcome Back</h2>}
        {activeView === 'projects' && (
          <div>
            {activeProject ? (
              <div>
                <Button onClick={() => setSelectedProjectId(null)}>Back</Button>
                <h2 className="text-2xl mt-4">{activeProject.name}</h2>
                <div className="mt-4 flex gap-2">
                  <input className="bg-white/5 p-2 rounded" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} />
                  <Button onClick={() => addTask(activeProject.id)}>Add Task</Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {projects.map(p => <button key={p.id} onClick={() => setSelectedProjectId(p.id)} className="bg-white/5 p-4 rounded border border-white/10">{p.name}</button>)}
                <button onClick={() => setIsAddingProject(true)} className="border border-dashed p-4">+ New Project</button>
              </div>
            )}
          </div>
        )}
        {activeView === 'chat' && (
          <div className="h-[500px] flex flex-col bg-black/20 p-4 rounded">
            <div className="flex-1 overflow-y-auto">{chatHistory.map(m => <div key={m.id} className="mb-2">{m.text}</div>)}</div>
            <input className="bg-white/5 p-2 mt-2" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} />
          </div>
        )}
      </main>
      {isAddingProject && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center">
          <div className="bg-slate-900 p-8 rounded-xl border border-white/10">
            <input className="bg-white/5 p-2 mb-4 block w-full" placeholder="Project Name" value={newProject.name} onChange={e => setNewProject({...newProject, name: e.target.value})} />
            <Button onClick={addProject}>Create</Button>
            <Button onClick={() => setIsAddingProject(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;


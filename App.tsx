import React, { useState, useEffect } from 'react';
import { Project, Task, ViewType, ChatMessage } from './types';
import { PROJECT_COLORS } from './constants';
import { Button } from './components/Button';
import { TaskItem } from './components/TaskItem';
import { Calendar } from './components/Calendar';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from './services/supabaseClient';

const App: React.FC = () => {
  // --- State ---
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

  // --- Helpers ---
  const daysRemainingInYear = () => {
    const today = new Date();
    const endOfYear = new Date(today.getFullYear(), 11, 31);
    return Math.ceil((endOfYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  // --- Sync Logic ---
  const loadData = async () => {
    const { data, error } = await supabase.from('projects').select('*').order('createdAt', { ascending: false });
    if (!error && data) { 
      setProjects(data); 
      setLastSynced(new Date()); 
    }
  };

  useEffect(() => {
    loadData();
    const sub = supabase.channel('db-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => loadData()).subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  // --- Handlers ---
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
    const project: Project = { 
        id: crypto.randomUUID(), 
        name: newProject.name, 
        description: newProject.description || '', 
        color: newProject.color, 
        createdAt: new Date().toISOString(), 
        tasks: [] 
    };
    const { error } = await supabase.from('projects').insert([project]);
    if (error) {
        console.error("Error adding project:", error);
    } else {
        setProjects(prev => [project, ...prev]);
        setIsAddingProject(false);
        setNewProject({ name: '', description: '', color: PROJECT_COLORS[0].hex });
    }
  };

  const addTask = async (projectId: string) => {
    const target = projects.find(p => p.id === projectId);
    if (!target || !newTaskTitle) return;
    const updatedTasks = [...target.tasks, { id: crypto.randomUUID(), projectId, title: newTaskTitle, isCompleted: false, dueDate: new Date().toISOString().split('T')[0] }];
    const { error } = await supabase.from('projects').update({ tasks: updatedTasks }).eq('id', projectId);
    if (!error) { setProjects(prev => prev.map(p => p.id === projectId ? { ...p, tasks: updatedTasks } : p)); setNewTaskTitle(''); }
  };

  const toggleTask = async (projectId: string, taskId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const updatedTasks = project.tasks.map(t => t.id === taskId ? { ...t, isCompleted: !t.isCompleted } : t);
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

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#0f172a] text-white">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-72 bg-black/20 p-6 flex-col gap-8 border-r border-white/5">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent">Z's Flow</h1>
        <nav className="flex flex-col gap-2">
          <Button variant="ghost" onClick={() => setActiveView('dashboard')} className={`justify-start ${activeView === 'dashboard' ? 'bg-orange-600' : ''}`}>Dashboard</Button>
          <Button variant="ghost" onClick={() => setActiveView('projects')} className={`justify-start ${activeView === 'projects' ? 'bg-orange-600' : ''}`}>Projects</Button>
          <Button variant="ghost" onClick={() => setActiveView('calendar')} className={`justify-start ${activeView === 'calendar' ? 'bg-orange-600' : ''}`}>Calendar</Button>
          <Button variant="ghost" onClick={() => setActiveView('chat')} className={`justify-start ${activeView === 'chat' ? 'bg-orange-600' : ''}`}>AI Assistant</Button>
        </nav>
        
        <div className="mt-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase mb-4 px-2">Quick Access</h3>
          {projects.map(p => (
            <button key={p.id} onClick={() => { setSelectedProjectId(p.id); setActiveView('projects'); }} className="block w-full text-left p-2 text-sm text-slate-400 hover:text-white truncate">
              <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: p.color }}></span>
              {p.name}
            </button>
          ))}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 lg:p-10">
        {activeView === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
              <h4 className="text-slate-400 text-xs font-bold uppercase">Pending Tasks</h4>
              <p className="text-4xl font-bold mt-2">{projects.reduce((acc, p) => acc + p.tasks.filter(t => !t.isCompleted).length, 0)}</p>
            </div>
            <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
              <h4 className="text-slate-400 text-xs font-bold uppercase">Active Projects</h4>
              <p className="text-4xl font-bold mt-2">{projects.length}</p>
            </div>
            <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
              <h4 className="text-slate-400 text-xs font-bold uppercase">Year Countdown</h4>
              <p className="text-4xl font-bold mt-2 text-orange-400">{daysRemainingInYear()} Days</p>
            </div>
          </div>
        )}

        {activeView === 'projects' && (
          <div className="max-w-4xl mx-auto">
            {activeProject ? (
              <div className="space-y-6">
                <Button variant="ghost" onClick={() => setSelectedProjectId(null)}>← All Projects</Button>
                <h2 className="text-3xl font-bold">{activeProject.name}</h2>
                <div className="space-y-2">
                  {activeProject.tasks.map(t => (
                    <TaskItem key={t.id} task={t} projectColor={activeProject.color} 
                      onToggle={(id) => toggleTask(activeProject.id, id)} 
                      onDelete={(id) => deleteTask(activeProject.id, id)} />
                  ))}
                  <div className="flex gap-2 mt-6">
                    <input className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} onKeyPress={e => e.key === 'Enter' && addTask(activeProject.id)} placeholder="New task title..." />
                    <Button onClick={() => addTask(activeProject.id)}>Add Task</Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map(p => (
                  <button key={p.

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
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newHabitName, setNewHabitName] = useState('');
  const [taskTab, setTaskTab] = useState<'pending' | 'completed'>('pending');
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  const today = new Date().toISOString().split('T')[0];
  const [newTaskDate, setNewTaskDate] = useState(today);

  // --- STATS LOGIC ---
  const getDaysLeft = () => {
    const now = new Date();
    const end = new Date(now.getFullYear(), 11, 31);
    return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getHeatmapData = () => {
    const days = [];
    for (let i = 83; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = habits.filter(h => h.completed_dates?.includes(dateStr)).length;
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
    const sub = supabase.channel('db-all').on('postgres_changes', { event: '*', schema: 'public' }, () => loadData()).subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  // --- TASK ACTIONS ---
  const addTask = async (pid: string) => {
    if (!newTaskTitle.trim()) return;
    const p = projects.find(proj => proj.id === pid);
    if (!p) return;
    const newTask = { id: crypto.randomUUID(), projectId: pid, title: newTaskTitle, isCompleted: false, dueDate: newTaskDate };
    const updatedTasks = [...p.tasks, newTask];
    await supabase.from('projects').update({ tasks: updatedTasks }).eq('id', pid);
    setNewTaskTitle('');
    loadData();
  };

  const toggleTask = async (pid: string, tid: string) => {
    const p = projects.find(proj => proj.id === pid);
    if (!p) return;
    const updated = p.tasks.map(t => t.id === tid ? { ...t, isCompleted: !t.isCompleted } : t);
    await supabase.from('projects').update({ tasks: updated }).eq('id', pid);
    loadData();
  };

  // --- HABIT ACTIONS ---
  const addHabit = async () => {
    if (!newHabitName.trim()) return;
    const { error } = await supabase.from('habits').insert([{ name: newHabitName, color: '#f97316', completed_dates: [] }]);
    if (!error) { setNewHabitName(''); loadData(); }
  };

  const toggleHabitToday = async (habit: Habit) => {
    let dates = habit.completed_dates || [];
    dates = dates.includes(today) ? dates.filter(d => d !== today) : [...dates, today];
    await supabase.from('habits').update({ completed_dates: dates }).eq('id', habit.id);
    loadData();
  };

  const calculateStreak = (dates: string[]) => {
    if (!dates) return 0;
    let streak = 0; let d = new Date();
    while (dates.includes(d.toISOString().split('T')[0])) {
      streak++; d.setDate(d.getDate() - 1);
    }
    return streak;
  };

  const activeP = projects.find(p => p.id === selectedProjectId);

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#0f172a] text-white font-sans">
      {/* SIDEBAR */}
      <aside className="hidden lg:flex w-72 bg-black/20 p-6 flex-col gap-8 border-r border-white/5">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent">Z's Flow</h1>
        <nav className="flex flex-col gap-2">
          {['dashboard', 'projects', 'habits', 'calendar'].map((v) => (
            <Button key={v} variant="ghost" onClick={() => {setActiveView(v as any); setSelectedProjectId(null);}} className={`justify-start capitalize ${activeView === v ? 'bg-orange-600 shadow-lg shadow-orange-900/20' : 'text-slate-400'}`}>
              {v}
            </Button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-4 lg:p-10 overflow-y-auto pb-32 lg:pb-10">
        {activeView === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* TOP STATS COMMAND CENTER */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white/5

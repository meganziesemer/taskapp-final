import React, { useState, useEffect, useRef } from 'react';
import { Project, Task, ViewType, ChatMessage } from './types';
import { PROJECT_COLORS } from './constants';
import { Button } from './components/Button';
import { TaskItem } from './components/TaskItem';
import { Calendar } from './components/Calendar';
import { GoogleGenerativeAI } from "@google/generative-ai"; // Fixed import
import { supabase } from './services/supabaseClient';

const App: React.FC = () => {
  // --- Data State ---
  const [projects, setProjects] = useState<Project[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  
  // --- UI State ---
  const [activeView, setActiveView] = useState<ViewType>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [taskFilter, setTaskFilter] = useState<'active' | 'completed'>('active');
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

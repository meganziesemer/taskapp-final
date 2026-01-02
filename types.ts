
export interface Task {
  id: string;
  projectId: string;
  title: string;
  isCompleted: boolean;
  dueDate: string;
  completedDate?: string;
  description?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  tasks: Task[];
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

export type ViewType = 'dashboard' | 'projects' | 'calendar' | 'all-tasks' | 'completed-tasks' | 'chat';

export interface AIProjectSuggestion {
  title: string;
  description: string;
  dueDateOffsetDays: number;
}

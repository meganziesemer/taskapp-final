export interface Task {
  id: string;
  projectId: string;
  title: string;
  isCompleted: boolean;
  dueDate: string;
  completedDate?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
  tasks: Task[];
}

export type ViewType = 'dashboard' | 'projects' | 'calendar' | 'chat';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

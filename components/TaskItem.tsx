
import React from 'react';
import { Task } from '../types';
import { PROJECT_COLORS } from '../constants';

interface TaskItemProps {
  task: Task;
  projectColor: string;
  onToggle: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}

export const TaskItem: React.FC<TaskItemProps> = ({ task, projectColor, onToggle, onDelete }) => {
  const colorObj = PROJECT_COLORS.find(c => c.hex === projectColor) || PROJECT_COLORS[0];
  const uniqueId = `task-${task.id}`;

  return (
    <div className="group flex items-center justify-between p-4 bg-transparent transition-all duration-200">
      <div className="flex items-center gap-4 flex-1">
        <button 
          id={uniqueId}
          aria-label={task.isCompleted ? `Mark ${task.title} as incomplete` : `Mark ${task.title} as complete`}
          onClick={() => onToggle(task.id)}
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${
            task.isCompleted 
              ? `${colorObj.bg} border-transparent shadow-sm shadow-black/20` 
              : `border-slate-500 hover:border-slate-300 bg-white/5`
          }`}
        >
          {task.isCompleted && (
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
        
        <div className="flex-1 min-w-0">
          <label htmlFor={uniqueId} className={`block text-sm font-medium transition-all truncate cursor-pointer ${task.isCompleted ? 'text-slate-500 line-through' : 'text-slate-100'}`}>
            {task.title}
          </label>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {new Date(task.dueDate).toLocaleDateString()}
            </span>
            {task.isCompleted && task.completedDate && (
              <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-500 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {new Date(task.completedDate).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>
      
      <button 
        onClick={() => onDelete(task.id)}
        className="opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-rose-400 transition-all rounded-lg ml-2"
        title="Delete Task"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
};

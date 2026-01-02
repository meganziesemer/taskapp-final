import React, { useState } from 'react';
import { Project, Task } from '../types';
import { PROJECT_COLORS } from '../constants';

interface CalendarProps {
  projects: Project[];
}

export const Calendar: React.FC<CalendarProps> = ({ projects }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const days = [];
  const totalDays = daysInMonth(year, month);
  const startDay = firstDayOfMonth(year, month);

  for (let i = 0; i < startDay; i++) {
    days.push(null);
  }

  for (let i = 1; i <= totalDays; i++) {
    days.push(new Date(year, month, i));
  }

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const getTasksForDate = (date: Date) => {
    const tasks: { task: Task; color: string }[] = [];
    projects.forEach(project => {
      project.tasks.forEach(task => {
        const taskDate = new Date(task.dueDate);
        if (
          taskDate.getDate() === date.getDate() &&
          taskDate.getMonth() === date.getMonth() &&
          taskDate.getFullYear() === date.getFullYear()
        ) {
          tasks.push({ task, color: project.color });
        }
      });
    });
    return tasks;
  };

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl sm:rounded-3xl shadow-2xl border border-white/10 overflow-hidden w-full">
      <div className="p-4 sm:p-6 flex items-center justify-between border-b border-white/5 bg-white/5">
        <h2 className="text-lg sm:text-xl font-bold text-white truncate mr-2">
          {monthNames[month]} {year}
        </h2>
        <div className="flex gap-1 sm:gap-2">
          <button onClick={prevMonth} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-lg border border-white/10 text-slate-300 transition-colors">
            <svg className="w-4 h-4 sm:w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={nextMonth} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-lg border border-white/10 text-slate-300 transition-colors">
            <svg className="w-4 h-4 sm:w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-white/5">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
          <div key={`${day}-${idx}`} className="bg-white/5 py-2 sm:py-4 text-center text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest">
            <span className="hidden sm:inline">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][idx]}</span>
            <span className="sm:hidden">{day}</span>
          </div>
        ))}
        {days.map((date, idx) => {
          if (!date) return <div key={`empty-${idx}`} className="bg-white/5 min-h-[60px] sm:min-h-[120px] p-1 sm:p-2 opacity-30" />;
          
          const tasks = getTasksForDate(date);
          const isToday = new Date().toDateString() === date.toDateString();

          return (
            <div key={date.toISOString()} className={`bg-white/5 min-h-[60px] sm:min-h-[120px] p-1 sm:p-2 hover:bg-white/10 transition-colors border-r border-b border-white/5 last:border-r-0`}>
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className={`text-[10px] sm:text-xs font-bold w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-300'}`}>
                  {date.getDate()}
                </span>
              </div>
              <div className="space-y-0.5 sm:space-y-1 overflow-hidden">
                {tasks.slice(0, 3).map(({ task, color }) => (
                  <div 
                    key={task.id} 
                    className={`text-[7px] sm:text-[9px] px-1 py-0.5 rounded border border-white/10 truncate leading-tight shadow-sm font-medium transition-transform hover:scale-105 cursor-default`}
                    style={{ backgroundColor: `${color}cc`, color: '#fff' }}
                    title={task.title}
                  >
                    {task.title}
                  </div>
                ))}
                {tasks.length > 3 && (
                  <div className="text-[6px] sm:text-[8px] text-slate-400 font-bold px-1">
                    +{tasks.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
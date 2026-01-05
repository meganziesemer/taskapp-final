import React, { useState } from 'react';
import { Project, Task } from '../types';
import { Button } from './Button';

interface CalendarProps {
  projects: Project[];
}

export const Calendar: React.FC<CalendarProps> = ({ projects }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);

  const getTasksForDate = (day: number) => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return projects.flatMap(p => 
      p.tasks
        .filter(t => t.dueDate === dateStr)
        .map(t => ({ ...t, color: p.color, projectName: p.name }))
    );
  };

  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));

  // Day View Logic
  if (selectedDate) {
    const dayTasks = projects.flatMap(p => 
      p.tasks
        .filter(t => t.dueDate === selectedDate)
        .map(t => ({ ...t, color: p.color, projectName: p.name }))
    );

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => setSelectedDate(null)} className="text-orange-400 p-0">← Back to Month</Button>
        <div className="bg-white/5 rounded-3xl border border-white/10 p-8">
          <h2 className="text-3xl font-bold mb-6">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </h2>
          
          <div className="space-y-4">
            {dayTasks.length > 0 ? (
              dayTasks.map(t => (
                <div key={t.id} className={`flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/5 ${t.isCompleted ? 'opacity-40' : ''}`}>
                  <div className="w-1 h-8 rounded-full" style={{ backgroundColor: t.color }}></div>
                  <div className="flex-1">
                    <p className={`font-bold ${t.isCompleted ? 'line-through' : ''}`}>{t.title}</p>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{t.projectName}</p>
                  </div>
                  {t.isCompleted && <span className="text-emerald-400 text-xs font-bold">✓ DONE</span>}
                </div>
              ))
            ) : (
              <p className="text-slate-500 italic text-center py-10">No tasks scheduled for this day.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-bold">
          {currentDate.toLocaleString('default', { month: 'long' })} {currentDate.getFullYear()}
        </h2>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={prevMonth}>←</Button>
          <Button variant="ghost" onClick={nextMonth}>→</Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-white/10 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="bg-slate-900/50 p-4 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-white/5">
            {d}
          </div>
        ))}
        
        {blanks.map(b => <div key={`b-${b}`} className="bg-[#0f172a]/50 h-32 lg:h-40" />)}
        
        {days.map(d => {
          const dayTasks = getTasksForDate(d);
          const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          
          return (
            <div 
              key={d} 
              onClick={() => setSelectedDate(dateStr)}
              className="bg-[#0f172a] h-32 lg:h-40 p-2 border-r border-b border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer group"
            >
              <span className="text-sm font-medium text-slate-500 group-hover:text-white transition-colors">{d}</span>
              <div className="mt-2 space-y-1 overflow-hidden">
                {dayTasks.slice(0, 3).map(t => (
                  <div 
                    key={t.id} 
                    className={`text-[9px] px-1.5 py-0.5 rounded-sm truncate border-l-2 flex items-center gap-1
                      ${t.isCompleted ? 'opacity-30 line-through' : ''}`}
                    style={{ backgroundColor: `${t.color}20`, borderColor: t.color, color: t.color }}
                  >
                    {t.title}
                  </div>
                ))}
                {dayTasks.length > 3 && (
                  <div className="text-[8px] text-slate-600 font-bold pl-1">
                    + {dayTasks.length - 3} more
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

// ... (imports remain the same)

  const loadData = async () => {
    const { data: pData } = await supabase.from('projects').select('*');
    if (pData) {
      const sorted = [...pData].sort((a, b) => {
        // Primary sort: Status (Needs Action first)
        const statusSort = (b.status || '').localeCompare(a.status || '');
        if (statusSort !== 0) return statusSort;
        // Secondary sort: Name alphabetical
        return a.name.localeCompare(b.name);
      });
      setProjects(sorted);
    }
    const { data: hData } = await supabase.from('habits').select('*');
    if (hData) setHabits(hData);
  };

// ... (middle logic remains the same)

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {projects.map((p, index) => {
                const pendingTasks = (p.tasks || []).filter(t => !t.isCompleted);
                if (pendingTasks.length === 0) return null;
                
                const isExpanded = expandedProjects[p.id];
                const currentStatus = (p as any).status;
                const prevProject = projects[index - 1];
                const showDivider = prevProject && (prevProject as any).status === 'needs_action' && currentStatus === 'caught_up';

                return (
                  <React.Fragment key={p.id}>
                    {/* Divider line when transitioning from Needs Action to Caught Up */}
                    {showDivider && (
                      <div className="col-span-1 lg:col-span-2 flex items-center gap-4 py-4">
                        <div className="h-[1px] flex-1 bg-white/10"></div>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">Caught Up</span>
                        <div className="h-[1px] flex-1 bg-white/10"></div>
                      </div>
                    )}

                    <div className={`rounded-2xl border overflow-hidden transition-all ${
                      currentStatus === 'needs_action' 
                        ? 'bg-rose-950/30 border-rose-500/30' 
                        : currentStatus === 'caught_up' 
                          ? 'bg-emerald-950/30 border-emerald-500/30'
                          : 'bg-white/5 border-white/10'
                    }`}>
                      <div className="w-full flex items-center justify-between hover:bg-white/[0.02]">
                        <button onClick={() => { setActiveView('projects'); setSelectedProjectId(p.id); }} className="flex-1 p-5 flex items-center gap-3 text-left">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }}></span>
                          <div>
                            <h3 className="font-bold text-sm">{p.name}</h3>
                            <p className={`text-[9px] font-bold uppercase tracking-tighter ${currentStatus === 'needs_action' ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {currentStatus === 'needs_action' ? 'Needs Action' : 'Caught Up'}
                            </p>
                          </div>
                        </button>
                        
                        {/* Expand/Collapse Toggle */}
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedProjects(prev => ({ ...prev, [p.id]: !prev[p.id] }));
                          }}
                          className="p-5 text-slate-500 hover:text-white transition-transform"
                          style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                        >
                          ▼
                        </button>
                      </div>

                      {/* Collapsible Task Area */}
                      {isExpanded && (
                        <div className="p-4 pt-0 space-y-2 border-t border-white/5 bg-black/20">
                            {pendingTasks.slice(0, 10).map(t => (
                              <TaskItem key={t.id} task={t} projectColor={p.color} onToggle={() => toggleTask(p.id, t.id)} onDelete={() => deleteTask(p.id, t.id)} />
                            ))}
                            {pendingTasks.length > 10 && (
                              <p className="text-[10px] text-center text-slate-500 py-2">+{pendingTasks.length - 10} more tasks in project view</p>
                            )}
                        </div>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

// ... (rest of the file remains exactly as provided)

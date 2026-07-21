import React, { useState, useEffect } from 'react';
import { MantineProvider, createTheme, Stack } from '@mantine/core';
import type { User, Project, Allocation } from './types';
import { DesignerHeader } from './components/DesignerHeader';
import { CalendarGrid } from './components/CalendarGrid';
import { AddProjectRow } from './components/AddProjectRow';
import { ManageUsersDrawer } from './components/ManageUsersDrawer';

// Custom theme mapping
const theme = createTheme({
  fontFamily: 'var(--font-family)',
  primaryColor: 'indigo',
});

export const App: React.FC = () => {
  // --- Admin Authentication State ---
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    return sessionStorage.getItem('isAdmin_planner') === 'true';
  });

  const handleLogin = async (email: string, pass: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success) {
          setIsAdmin(true);
          sessionStorage.setItem('isAdmin_planner', 'true');
          return true;
        }
      }
    } catch (err) {
      console.warn('Backend login query failed, trying frontend validation:', err);
    }

    // Frontend validation fallback
    if (email === 'radvancor@gmail.com' && pass === '80938093r') {
      setIsAdmin(true);
      sessionStorage.setItem('isAdmin_planner', 'true');
      return true;
    }
    return false;
  };

  const handleLogout = () => {
    setIsAdmin(false);
    sessionStorage.removeItem('isAdmin_planner');
  };

  // --- Persistent States synced with SQLite ---
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [designerCapacities, setDesignerCapacities] = useState<Record<string, number>>({});
  const [isSticky, setIsSticky] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const sy = window.scrollY;
      setIsSticky((prev) => {
        if (!prev && sy > 140) return true;
        if (prev && sy < 40) return false;
        return prev;
      });
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Fetch initial data from SQLite Express Backend
  useEffect(() => {
    fetch('/api/data')
      .then((res) => res.json())
      .then((data) => {
        setUsers(data.users || []);
        setProjects(data.projects || []);
        setAllocations(data.allocations || []);
        setDesignerCapacities(data.capacities || {});
      })
      .catch((err) => console.error('Error fetching data from SQLite API:', err));
  }, []);

  // --- Calendar Navigation ---
  // Default current week starts on Monday, July 20, 2026
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const defaultDate = new Date('2026-07-20T00:00:00');
    return defaultDate;
  });

  const getWeekDays = (start: Date) => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const weekDays = getWeekDays(weekStart);

  const handlePrevWeek = () => {
    const prev = new Date(weekStart);
    prev.setDate(weekStart.getDate() - 7);
    setWeekStart(prev);
  };

  const handleNextWeek = () => {
    const next = new Date(weekStart);
    next.setDate(weekStart.getDate() + 7);
    setWeekStart(next);
  };

  // Format month and year in Ukrainian (based on the Tuesday of the week to align with July 21 standard)
  const getMonthYearLabel = (daysList: Date[]) => {
    const targetDate = daysList[1] || daysList[0]; // Tuesday or Monday
    const monthIndex = targetDate.getMonth();
    const year = targetDate.getFullYear();
    const monthsUa = [
      'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
      'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
    ];
    return `${monthsUa[monthIndex]} ${year}`;
  };

  // --- User Management Handlers (SQLite Synced) ---
  const [drawerOpened, setDrawerOpened] = useState(false);

  const handleAddUser = (newUserData: Omit<User, 'id'>) => {
    if (!isAdmin) return;
    const newId = String(users.length > 0 ? Math.max(...users.map((u) => parseInt(u.id) || 0)) + 1 : 1);
    const newUser: User = { id: newId, ...newUserData };
    
    setUsers((prev) => [...prev, newUser]);
    
    fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser),
    }).catch((err) => console.error('Error adding user to SQLite:', err));
  };

  const handleEditUser = (updatedUser: User) => {
    if (!isAdmin) return;
    setUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
    
    fetch(`/api/users/${updatedUser.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedUser),
    }).catch((err) => console.error('Error updating user in SQLite:', err));

    // Also if capacity doesn't exist for designer, initialize it
    if (updatedUser.isDesigner && designerCapacities[updatedUser.id] === undefined) {
      handleCapacityChange(updatedUser.id, 8);
    }
  };

  const handleDeleteUser = (userId: string) => {
    if (!isAdmin) return;
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    // Also remove user from all projects
    setProjects((prev) =>
      prev.map((proj) => ({
        ...proj,
        memberIds: proj.memberIds.filter((id) => id !== userId),
      }))
    );
    // Remove their allocations locally
    setAllocations((prev) => prev.filter((a) => a.designerId !== userId));

    fetch(`/api/users/${userId}`, {
      method: 'DELETE',
    }).catch((err) => console.error('Error deleting user from SQLite:', err));
  };

  // --- Project Row Action Handlers (SQLite Synced) ---
  const handleUpdateProjectName = (projectId: string, newName: string) => {
    if (!isAdmin) return;
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, name: newName } : p))
    );
    
    fetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    }).catch((err) => console.error('Error updating project name in SQLite:', err));
  };

  const handleDeleteProject = (projectId: string) => {
    if (!isAdmin) return;
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    setAllocations((prev) => prev.filter((a) => a.projectId !== projectId));

    fetch(`/api/projects/${projectId}`, {
      method: 'DELETE',
    }).catch((err) => console.error('Error deleting project from SQLite:', err));
  };

  const handleAddProjectMember = (projectId: string, userId: string) => {
    if (!isAdmin) return;
    setProjects((prev) => {
      return prev.map((p) => {
        if (p.id === projectId) {
          const newList = p.memberIds.includes(userId) ? p.memberIds : [...p.memberIds, userId];
          
          fetch(`/api/projects/${projectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberIds: newList }),
          }).catch((err) => console.error('Error adding project member in SQLite:', err));
          
          return { ...p, memberIds: newList };
        }
        return p;
      });
    });
  };

  const handleRemoveProjectMember = (projectId: string, userId: string) => {
    if (!isAdmin) return;
    setProjects((prev) => {
      return prev.map((p) => {
        if (p.id === projectId) {
          const newList = p.memberIds.filter((id) => id !== userId);
          
          fetch(`/api/projects/${projectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberIds: newList }),
          }).catch((err) => console.error('Error removing project member in SQLite:', err));
          
          return { ...p, memberIds: newList };
        }
        return p;
      });
    });

    // Also clean their allocations for this project
    setAllocations((prev) => {
      const toDelete = prev.filter((a) => a.projectId === projectId && a.designerId === userId);
      toDelete.forEach((a) => {
        fetch(`/api/allocations/${a.id}`, {
          method: 'DELETE',
        }).catch((err) => console.error('Error deleting allocation on project member remove:', err));
      });
      return prev.filter((a) => !(a.projectId === projectId && a.designerId === userId));
    });
  };

  const handleReplaceProjectMember = (projectId: string, oldUserId: string, newUserId: string) => {
    if (!isAdmin) return;
    setProjects((prev) => {
      return prev.map((p) => {
        if (p.id === projectId) {
          const newList = p.memberIds.map((id) => (id === oldUserId ? newUserId : id));
          
          fetch(`/api/projects/${projectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberIds: newList }),
          }).catch((err) => console.error('Error replacing project member in SQLite:', err));
          
          return { ...p, memberIds: newList };
        }
        return p;
      });
    });

    const newUser = users.find((u) => u.id === newUserId);
    setAllocations((prev) => {
      return prev.map((a) => {
        if (a.projectId === projectId && a.designerId === oldUserId) {
          const targetDesignerId = newUser?.isDesigner ? newUserId : a.designerId;
          
          fetch(`/api/allocations/${a.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ designerId: targetDesignerId }),
          }).catch((err) => console.error('Error updating allocation member replacement in SQLite:', err));
          
          return { ...a, designerId: targetDesignerId };
        }
        return a;
      });
    });
  };

  // --- Allocations Event Handlers (SQLite Synced) ---
  const handleAddAllocation = (allocData: Omit<Allocation, 'id'>) => {
    if (!isAdmin) return;
    const newId = `alloc-${Date.now()}`;
    const newAlloc: Allocation = { id: newId, ...allocData };
    setAllocations((prev) => [...prev, newAlloc]);

    fetch('/api/allocations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newAlloc),
    }).catch((err) => console.error('Error adding allocation in SQLite:', err));
  };

  const handleUpdateAllocation = (id: string, updated: Partial<Allocation>) => {
    if (!isAdmin) return;
    setAllocations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...updated } : a))
    );

    fetch(`/api/allocations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch((err) => console.error('Error updating allocation in SQLite:', err));
  };

  const handleDeleteAllocation = (id: string) => {
    if (!isAdmin) return;
    setAllocations((prev) => prev.filter((a) => a.id !== id));

    fetch(`/api/allocations/${id}`, {
      method: 'DELETE',
    }).catch((err) => console.error('Error deleting allocation from SQLite:', err));
  };

  // --- Capacity Change Handler (SQLite Synced) ---
  const handleCapacityChange = (designerId: string, dailyCapacity: number) => {
    if (!isAdmin) return;
    setDesignerCapacities((prev) => ({
      ...prev,
      [designerId]: dailyCapacity,
    }));

    fetch(`/api/capacities/${designerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dailyCapacity }),
    }).catch((err) => console.error('Error updating designer capacity in SQLite:', err));
  };

  // --- Add Project Handler (SQLite Synced) ---
  const handleAddProject = (name: string, color: string, memberIds: string[]) => {
    if (!isAdmin) return;
    const newId = `p-${Date.now()}`;
    const newProj: Project = { id: newId, name, color, memberIds };
    setProjects((prev) => [...prev, newProj]);

    fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProj),
    }).catch((err) => console.error('Error adding project in SQLite:', err));
  };

  return (
    <MantineProvider theme={theme}>
      <div className="app-container">
        <Stack gap="lg">
          {/* Dashboard Header */}
          <div 
            className={`glass-panel ${isSticky ? 'sticky-header' : ''}`}
            style={{
              position: 'sticky',
              top: '12px',
              zIndex: 90,
              transition: 'all 0.3s ease',
              padding: isSticky ? '12px 20px' : '24px',
              boxShadow: isSticky ? '0 10px 30px -10px rgba(0, 0, 0, 0.08)' : 'var(--shadow-md)',
              background: isSticky ? 'rgba(255, 255, 255, 0.85)' : 'var(--panel-bg)',
              backdropFilter: isSticky ? 'blur(12px)' : 'none',
              border: isSticky ? '1px solid rgba(99, 102, 241, 0.15)' : '1px solid var(--border-color)',
            }}
          >
            <DesignerHeader
              users={users}
              allocations={allocations}
              days={weekDays}
              designerCapacities={designerCapacities}
              onCapacityChange={handleCapacityChange}
              currentMonthYear={getMonthYearLabel(weekDays)}
              onPrevWeek={handlePrevWeek}
              onNextWeek={handleNextWeek}
              onOpenManageUsers={() => setDrawerOpened(true)}
              isAdmin={isAdmin}
              onLogin={handleLogin}
              onLogout={handleLogout}
              isSticky={isSticky}
            />
          </div>

          {/* Interactive Planner Grid */}
          <CalendarGrid
            users={users}
            projects={projects}
            allocations={allocations}
            days={weekDays}
            designerCapacities={designerCapacities}
            onUpdateProjectName={handleUpdateProjectName}
            onDeleteProject={handleDeleteProject}
            onAddProjectMember={handleAddProjectMember}
            onRemoveProjectMember={handleRemoveProjectMember}
            onReplaceProjectMember={handleReplaceProjectMember}
            onAddAllocation={handleAddAllocation}
            onUpdateAllocation={handleUpdateAllocation}
            onDeleteAllocation={handleDeleteAllocation}
            isAdmin={isAdmin}
          />

          {/* Add Project Bar - Hidden if not Admin */}
          {isAdmin && (
            <AddProjectRow users={users} onAddProject={handleAddProject} />
          )}
        </Stack>

        {/* Global Team Settings Drawer */}
        <ManageUsersDrawer
          opened={drawerOpened}
          onClose={() => setDrawerOpened(false)}
          users={users}
          onAddUser={handleAddUser}
          onEditUser={handleEditUser}
          onDeleteUser={handleDeleteUser}
          isAdmin={isAdmin}
        />
      </div>
    </MantineProvider>
  );
};

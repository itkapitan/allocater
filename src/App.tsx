import React, { useState, useEffect } from 'react';
import { MantineProvider, createTheme, Stack } from '@mantine/core';
import type { User, Project, Allocation, Space } from './types';
import { DesignerHeader } from './components/DesignerHeader';
import { CalendarGrid } from './components/CalendarGrid';
import { AddProjectRow } from './components/AddProjectRow';
import { ManageUsersDrawer } from './components/ManageUsersDrawer';
import { ManageSpacesDrawer } from './components/ManageSpacesDrawer';

// Custom theme mapping
const theme = createTheme({
  fontFamily: 'var(--font-family)',
  primaryColor: 'indigo',
});

// Ukrainian Transliteration Helper
const transliterate = (text: string): string => {
  const cyrillicToLatin: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'h', 'ґ': 'g', 'д': 'd', 'е': 'e', 'є': 'ye', 'ж': 'zh', 'з': 'z',
    'и': 'y', 'і': 'i', 'ї': 'yi', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p',
    'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ь': '', 'ю': 'yu', 'я': 'ya',
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'H', 'Ґ': 'G', 'Д': 'D', 'Е': 'E', 'Є': 'Ye', 'Ж': 'Zh', 'З': 'Z',
    'И': 'Y', 'І': 'I', 'Ї': 'Yi', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O', 'П': 'P',
    'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch',
    'Ь': '', 'Ю': 'Yu', 'Я': 'Ya'
  };
  return text
    .split('')
    .map((char) => cyrillicToLatin[char] || char)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

// Date to URL slug helper (e.g. 20-24_Lypnia or 31_Serpnia-4_Veresnia)
const getWeekUrlSlug = (start: Date): string => {
  const daysList = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    daysList.push(d);
  }
  const monday = daysList[0];
  const friday = daysList[4];

  const monthsLatin = [
    'Sichnia', 'Liutogo', 'Bereznia', 'Kvitnia', 'Travnia', 'Chervnia',
    'Lypnia', 'Serpnia', 'Veresnia', 'Zhovtnia', 'Lystopada', 'Grudnia'
  ];

  const monDay = monday.getDate();
  const monMonth = monday.getMonth();
  const friDay = friday.getDate();
  const friMonth = friday.getMonth();

  if (monMonth !== friMonth) {
    return `${monDay}_${monthsLatin[monMonth]}-${friDay}_${monthsLatin[friMonth]}`;
  }
  return `${monDay}-${friDay}_${monthsLatin[monMonth]}`;
};

// Parser of URL slugs
const parseUrlState = (pathname: string) => {
  const parts = pathname.split('/').filter(Boolean);
  let parsedSpaceId: string | null = null;
  let parsedWeekStart: Date | null = null;

  if (parts.length >= 1) {
    const spaceSlug = parts[0];
    const match = spaceSlug.match(/^(\d+)/);
    if (match) {
      parsedSpaceId = match[1];
    }
  }

  if (parts.length >= 2) {
    const weekSlug = parts[1];
    let foundDate: Date | null = null;
    for (let y = 2025; y <= 2027; y++) {
      const tempDate = new Date(`${y}-01-01T00:00:00`);
      const day = tempDate.getDay();
      const diff = tempDate.getDate() - day + (day === 0 ? -6 : 1);
      tempDate.setDate(diff);

      for (let w = 0; w < 54; w++) {
        const slug = getWeekUrlSlug(tempDate);
        if (slug.toLowerCase() === weekSlug.toLowerCase()) {
          foundDate = new Date(tempDate);
          break;
        }
        tempDate.setDate(tempDate.getDate() + 7);
      }
      if (foundDate) break;
    }
    if (foundDate) {
      parsedWeekStart = foundDate;
    }
  }

  return { parsedSpaceId, parsedWeekStart };
};

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

  // --- Spaces State ---
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string>('1');
  const [manageSpacesOpened, setManageSpacesOpened] = useState(false);

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
        
        const loadedSpaces = data.spaces || [];
        setSpaces(loadedSpaces);

        // Parse current URL
        const { parsedSpaceId, parsedWeekStart } = parseUrlState(window.location.pathname);

        let targetSpaceId = '1';
        if (parsedSpaceId && loadedSpaces.some((s: Space) => s.id === parsedSpaceId)) {
          targetSpaceId = parsedSpaceId;
        } else if (loadedSpaces.length > 0) {
          targetSpaceId = loadedSpaces[0].id;
        }

        setActiveSpaceId(targetSpaceId);

        if (parsedWeekStart) {
          setWeekStart(parsedWeekStart);
        }

        // Auto format current path cleanly
        const targetSpace = loadedSpaces.find((s: Space) => s.id === targetSpaceId) || loadedSpaces[0];
        if (targetSpace) {
          const start = parsedWeekStart || new Date('2026-07-20T00:00:00');
          const spaceSlug = `${targetSpaceId}-${transliterate(targetSpace.name)}`;
          const weekSlug = getWeekUrlSlug(start);
          const newPath = `/${spaceSlug}/${weekSlug}`;
          window.history.replaceState(null, '', newPath);
        }
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

  // Format week month and year in Ukrainian (showing working days Monday-Friday dates)
  const getMonthYearLabel = (daysList: Date[]) => {
    if (daysList.length < 5) return '';
    const monday = daysList[0];
    const friday = daysList[4];

    const monthsUaGenitive = [
      'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
      'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'
    ];

    const monDay = monday.getDate();
    const monMonth = monday.getMonth();
    const monYear = monday.getFullYear();

    const friDay = friday.getDate();
    const friMonth = friday.getMonth();
    const friYear = friday.getFullYear();

    if (monYear !== friYear) {
      // Case 3: Different years
      return `${monDay} ${monthsUaGenitive[monMonth]} ${monYear} - ${friDay} ${monthsUaGenitive[friMonth]} ${friYear}`;
    }

    if (monMonth !== friMonth) {
      // Case 2: Different months, same year
      return `${monDay} ${monthsUaGenitive[monMonth]} - ${friDay} ${monthsUaGenitive[friMonth]} ${monYear}`;
    }

    // Case 1: Same month, same year
    return `${monDay}-${friDay} ${monthsUaGenitive[monMonth]} ${monYear}`;
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
    // Remove their membership in spaces locally
    setSpaces((prev) =>
      prev.map((space) => ({
        ...space,
        memberIds: space.memberIds.filter((id) => id !== userId),
      }))
    );

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

  const handleUpdateProjectsList = (newList: Project[]) => {
    setProjects((prev) => {
      const otherSpacesProjects = prev.filter((p) => p.spaceId !== activeSpaceId);
      const updatedList = newList.map(p => ({ ...p, spaceId: p.spaceId || activeSpaceId }));
      return [...otherSpacesProjects, ...updatedList];
    });
  };

  const handleSaveProjectsOrder = (orderedIds: string[]) => {
    fetch('/api/projects/order', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: orderedIds }),
    }).catch((err) => console.error('Error saving projects order:', err));
  };

  // --- Spaces CRUD Handlers ---
  const handleAddSpace = (newSpaceData: Omit<Space, "id">) => {
    if (!isAdmin) return;
    const newId = String(Date.now());
    const newSpace: Space = { id: newId, ...newSpaceData };
    setSpaces((prev) => [...prev, newSpace]);

    fetch('/api/spaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSpace),
    }).catch((err) => console.error('Error adding space in SQLite:', err));
  };

  const handleEditSpace = (updatedSpace: Space) => {
    if (!isAdmin) return;
    setSpaces((prev) => prev.map((s) => (s.id === updatedSpace.id ? updatedSpace : s)));

    fetch(`/api/spaces/${updatedSpace.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedSpace),
    }).catch((err) => console.error('Error updating space in SQLite:', err));
  };

  const handleDeleteSpace = (spaceId: string) => {
    if (!isAdmin) return;
    setSpaces((prev) => prev.filter((s) => s.id !== spaceId));
    
    // Clean up projects and allocations locally
    setProjects((prev) => prev.filter((p) => p.spaceId !== spaceId));
    setAllocations((prev) => prev.filter((a) => !projects.some((p) => p.id === a.projectId && p.spaceId === spaceId)));
    
    fetch(`/api/spaces/${spaceId}`, {
      method: 'DELETE',
    }).catch((err) => console.error('Error deleting space in SQLite:', err));

    if (activeSpaceId === spaceId) {
      setActiveSpaceId('1');
    }
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
    const newProj: Project = { id: newId, name, color, memberIds, spaceId: activeSpaceId };
    setProjects((prev) => [...prev, newProj]);

    fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProj),
    }).catch((err) => console.error('Error adding project in SQLite:', err));
  };

  const activeSpace = spaces.find((s) => s.id === activeSpaceId) || spaces[0];
  const spaceUsers = users.filter((u) => activeSpace?.memberIds.includes(u.id));
  const spaceProjects = projects.filter((p) => p.spaceId === activeSpaceId);
  const spaceAllocations = allocations.filter((a) => spaceProjects.some((p) => p.id === a.projectId));

  return (
    <MantineProvider theme={theme}>
      <div className="app-container">
        <Stack gap="lg">
          {/* Compact Sticky Header (Fixed overlay shown only when scrolled down) */}
          {isSticky && (
            <div 
              className="glass-panel sticky-header"
              style={{
                position: 'fixed',
                top: '12px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 'calc(100% - 48px)',
                maxWidth: '1552px',
                zIndex: 90,
                padding: '12px 20px',
                boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.08)',
                background: 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(99, 102, 241, 0.15)',
                animation: 'stickySlideDown 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards'
              }}
            >
              <DesignerHeader
                users={spaceUsers}
                projects={spaceProjects}
                allocations={spaceAllocations}
                days={weekDays}
                designerCapacities={designerCapacities}
                onCapacityChange={handleCapacityChange}
                currentMonthYear={getMonthYearLabel(weekDays)}
                onPrevWeek={handlePrevWeek}
                onNextWeek={handleNextWeek}
                onOpenManageUsers={() => setDrawerOpened(true)}
                onOpenManageSpaces={() => setManageSpacesOpened(true)}
                isAdmin={isAdmin}
                onLogin={handleLogin}
                onLogout={handleLogout}
                isSticky={true}
              />
            </div>
          )}

          {/* Normal Dashboard Header (Always static in the document flow) */}
          <div className="glass-panel">
            <DesignerHeader
              users={spaceUsers}
              projects={spaceProjects}
              allocations={spaceAllocations}
              days={weekDays}
              designerCapacities={designerCapacities}
              onCapacityChange={handleCapacityChange}
              currentMonthYear={getMonthYearLabel(weekDays)}
              onPrevWeek={handlePrevWeek}
              onNextWeek={handleNextWeek}
              onOpenManageUsers={() => setDrawerOpened(true)}
              onOpenManageSpaces={() => setManageSpacesOpened(true)}
              isAdmin={isAdmin}
              onLogin={handleLogin}
              onLogout={handleLogout}
              isSticky={false}
            />
          </div>

          {/* Interactive Planner Grid */}
          <CalendarGrid
            users={spaceUsers}
            projects={spaceProjects}
            allocations={spaceAllocations}
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
            onUpdateProjectsList={handleUpdateProjectsList}
            onSaveProjectsOrder={handleSaveProjectsOrder}
            isAdmin={isAdmin}
          />

          {/* Add Project Bar - Hidden if not Admin */}
          {isAdmin && (
            <AddProjectRow users={spaceUsers} onAddProject={handleAddProject} />
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

        {/* Spaces Management Drawer */}
        <ManageSpacesDrawer
          opened={manageSpacesOpened}
          onClose={() => setManageSpacesOpened(false)}
          users={users}
          spaces={spaces}
          activeSpaceId={activeSpaceId}
          onSelectSpace={(id) => setActiveSpaceId(id)}
          onAddSpace={handleAddSpace}
          onEditSpace={handleEditSpace}
          onDeleteSpace={handleDeleteSpace}
          isAdmin={isAdmin}
        />
      </div>
    </MantineProvider>
  );
};

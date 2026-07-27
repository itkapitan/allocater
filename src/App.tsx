import React, { useState, useEffect } from 'react';
import { MantineProvider, createTheme, Stack, Modal, Text, Button, Group, Avatar, SegmentedControl, Select, Paper, Divider, TextInput, PasswordInput } from '@mantine/core';
import type { User, Project, Allocation, Space } from './types';
import { DesignerHeader } from './components/DesignerHeader';
import { CalendarGrid } from './components/CalendarGrid';
import { AddProjectRow } from './components/AddProjectRow';
import { ManageUsersDrawer } from './components/ManageUsersDrawer';
import { ManageSpacesDrawer } from './components/ManageSpacesDrawer';
import { TaskTracker } from './components/TaskTracker';
import { IconNotebook, IconFolder, IconUsers, IconLogout, IconLogin, IconShield } from '@tabler/icons-react';

// Custom theme mapping
const theme = createTheme({
  fontFamily: 'var(--font-family)',
  primaryColor: 'indigo',
  components: {
    Select: {
      defaultProps: {
        checkIconPosition: 'right',
      },
    },
  },
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
  let section: 'allocator' | 'tasks' = 'allocator';
  let parsedSpaceId: string | null = null;
  let parsedWeekStart: Date | null = null;

  let spaceSlugIdx = 0;
  let weekSlugIdx = 1;

  if (parts.length >= 1) {
    if (parts[0] === 'allocator' || parts[0] === 'tasks') {
      section = parts[0];
      spaceSlugIdx = 1;
      weekSlugIdx = 2;
    }
  }

  if (parts.length > spaceSlugIdx) {
    const spaceSlug = parts[spaceSlugIdx];
    const match = spaceSlug.match(/^(\d+)/);
    if (match) {
      parsedSpaceId = match[1];
    }
  }

  if (parts.length > weekSlugIdx) {
    const weekSlug = parts[weekSlugIdx];
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

  return { section, parsedSpaceId, parsedWeekStart };
};

// Вспомогательный хелпер для форматирования даты в строку YYYY-MM-DD
const formatDateStringHelper = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Расчет временных сегментов аллокации в течение дня
const getAllocationIntervals = (alloc: Omit<Allocation, 'id'>, capacity: number) => {
  const intervals: { date: string; start: number; end: number }[] = [];
  let remainingHours = alloc.hours;
  let currentOffset = alloc.offsetHours || 0;
  let currentDate = new Date(alloc.startDate);

  while (remainingHours > 0) {
    const dateStr = formatDateStringHelper(currentDate);
    const hoursOnThisDay = Math.min(remainingHours, capacity - currentOffset);
    if (hoursOnThisDay <= 0) break;

    intervals.push({
      date: dateStr,
      start: currentOffset,
      end: currentOffset + hoursOnThisDay,
    });

    remainingHours -= hoursOnThisDay;
    currentOffset = 0;
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return intervals;
};

// Валидация наложений по времени и лимита дневной доступности
export const validateAllocation = (
  proposedAlloc: Omit<Allocation, 'id'> & { id?: string },
  allAllocations: Allocation[],
  projects: Project[],
  designerCapacities: Record<string, number>
): { valid: boolean; reason?: 'overlap' | 'exceeds_capacity'; overlappingAlloc?: Allocation; overlappingProject?: Project } => {
  const capacity = designerCapacities[proposedAlloc.designerId] || 8;
  
  // 1. Проверяем сегменты новой/обновленной аллокации
  const proposedSegments = getAllocationIntervals(proposedAlloc, capacity);
  
  // Убеждаемся, что смогли распределить все часы. Если нет — это превышение доступности
  const mappedHours = proposedSegments.reduce((sum, s) => sum + (s.end - s.start), 0);
  if (mappedHours < proposedAlloc.hours) {
    return { valid: false, reason: 'exceeds_capacity' };
  }

  // 2. Проверяем наложение на другие аллокации этого же дизайнера по всем проектам
  const otherAllocations = allAllocations.filter(
    (a) => a.designerId === proposedAlloc.designerId && a.id !== proposedAlloc.id
  );

  for (const otherAlloc of otherAllocations) {
    const otherCapacity = designerCapacities[otherAlloc.designerId] || 8;
    const otherSegments = getAllocationIntervals(otherAlloc, otherCapacity);

    for (const propSeg of proposedSegments) {
      for (const otherSeg of otherSegments) {
        if (propSeg.date === otherSeg.date) {
          const maxStart = Math.max(propSeg.start, otherSeg.start);
          const minEnd = Math.min(propSeg.end, otherSeg.end);
          if (maxStart < minEnd) {
            const proj = projects.find((p) => p.id === otherAlloc.projectId);
            return {
              valid: false,
              reason: 'overlap',
              overlappingAlloc: otherAlloc,
              overlappingProject: proj,
            };
          }
        }
      }
    }
  }

  return { valid: true };
};

// Красивое форматирование времени для украинского интерфейса конфликтов
const formatAllocationTimeLabel = (alloc: Omit<Allocation, 'id'>, capacity: number): string => {
  const dateObj = new Date(alloc.startDate);
  const daysUa = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота'];
  const monthsUa = [
    'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
    'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'
  ];
  
  const dayName = daysUa[dateObj.getDay()];
  const dayNum = dateObj.getDate();
  const monthName = monthsUa[dateObj.getMonth()];
  
  const formattedDate = `${dayName}, ${dayNum} ${monthName}`;
  const offset = alloc.offsetHours || 0;
  const hours = alloc.hours;

  let timeSlot = '';
  if (hours >= capacity) {
    timeSlot = 'весь день';
  } else if (offset === 0 && hours === capacity / 2) {
    timeSlot = 'перша половина дня';
  } else if (offset === capacity / 2 && hours === capacity / 2) {
    timeSlot = 'друга половина дня';
  } else {
    timeSlot = `з ${offset}-ї по ${offset + hours}-ту годину`;
  }
  
  return `${formattedDate} (${timeSlot}, ${hours} год)`;
};

export const App: React.FC = () => {
  // --- Admin Authentication State ---
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    return sessionStorage.getItem('isAdmin_planner') === 'true';
  });

  const [loginOpened, setLoginOpened] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsSubmitting(true);
    const success = await handleLogin(email, password);
    setIsSubmitting(false);
    if (success) {
      setLoginOpened(false);
      setEmail('');
      setPassword('');
    } else {
      setLoginError('Невірний email або пароль');
    }
  };

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
  const [loading, setLoading] = useState(true);

  // --- Разделы и Канбан-трекер задач ---
  const [activeSection, setActiveSection] = useState<'allocator' | 'tasks'>('allocator');
  const [columns, setColumns] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);

  // --- Состояние модального окна конфликтов распределения времени ---
  const [conflictModal, setConflictModal] = useState<{
    opened: boolean;
    designer: User;
    reason: 'overlap' | 'exceeds_capacity';
    conflictingProject?: Project;
    proposedDate: string;
    proposedTimeLabel: string;
  } | null>(null);

  // --- Spaces State ---
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string>('1');
  const [manageSpacesOpened, setManageSpacesOpened] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [deleteProjectModalOpened, setDeleteProjectModalOpened] = useState(false);
  const [projectHasAllocations, setProjectHasAllocations] = useState(false);

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

  // --- Calendar Navigation ---
  // Default current week starts on Monday, July 20, 2026
  const getMonday = (d: Date): Date => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  const [weekStart, setWeekStart] = useState<Date>(() => {
    const saved = sessionStorage.getItem('last_week_start');
    if (saved) return new Date(saved);
    return getMonday(new Date());
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

  // Сохранение текущей недели в sessionStorage
  useEffect(() => {
    if (weekStart) {
      sessionStorage.setItem('last_week_start', weekStart.toISOString());
    }
  }, [weekStart]);

  // Fetch initial data from SQLite Express Backend
  useEffect(() => {
    Promise.all([
      fetch('/api/data').then((res) => res.json()),
      fetch('/api/tasks/data').then((res) => res.json())
    ])
      .then(([data, tasksData]) => {
        setUsers(data.users || []);
        setProjects(data.projects || []);
        setAllocations(data.allocations || []);
        setDesignerCapacities(data.capacities || {});
        
        const loadedSpaces = data.spaces || [];
        setSpaces(loadedSpaces);

        setColumns(tasksData.columns || []);
        setTasks(tasksData.tasks || []);
        setAttachments(tasksData.attachments || []);
        setLinks(tasksData.links || []);

        // Parse current URL
        const { section, parsedSpaceId, parsedWeekStart } = parseUrlState(window.location.pathname);
        setActiveSection(section);

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
          const spaceSlug = `${targetSpaceId}-${transliterate(targetSpace.name)}`;
          let newPath = '';
          if (section === 'tasks') {
            newPath = `/tasks/${spaceSlug}`;
          } else {
            const start = parsedWeekStart || new Date('2026-07-20T00:00:00');
            const weekSlug = getWeekUrlSlug(start);
            newPath = `/allocator/${spaceSlug}/${weekSlug}`;
          }
          window.history.replaceState(null, '', newPath);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching data from SQLite API:', err);
        setLoading(false);
      });
  }, []);

  // Sync state changes to address bar URL
  useEffect(() => {
    if (spaces.length === 0) return;
    const activeSpace = spaces.find((s) => s.id === activeSpaceId) || spaces[0];
    if (!activeSpace) return;

    const spaceSlug = `${activeSpace.id}-${transliterate(activeSpace.name)}`;
    let newPath = '';
    if (activeSection === 'tasks') {
      newPath = `/tasks/${spaceSlug}`;
    } else {
      const weekSlug = getWeekUrlSlug(weekStart);
      newPath = `/allocator/${spaceSlug}/${weekSlug}`;
    }

    if (window.location.pathname !== newPath) {
      window.history.pushState(null, '', newPath);
    }
  }, [activeSection, activeSpaceId, weekStart, spaces]);

  // Sync history state navigation (popstate) back to React states
  useEffect(() => {
    const handlePopState = () => {
      const { section, parsedSpaceId, parsedWeekStart } = parseUrlState(window.location.pathname);
      setActiveSection(section);
      if (parsedSpaceId && spaces.some((s) => s.id === parsedSpaceId)) {
        setActiveSpaceId(parsedSpaceId);
      }
      if (parsedWeekStart) {
        setWeekStart(parsedWeekStart);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [spaces]);

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

  const handleCurrentWeek = () => {
    setWeekStart(getMonday(new Date()));
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
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    const hasAlloc = allocations.some((a) => a.projectId === projectId);
    setProjectToDelete(project);
    setProjectHasAllocations(hasAlloc);
    setDeleteProjectModalOpened(true);
  };

  const confirmDeleteProjectCompletely = () => {
    if (!projectToDelete) return;
    const pid = projectToDelete.id;
    setProjects((prev) => prev.filter((p) => p.id !== pid));
    setAllocations((prev) => prev.filter((a) => a.projectId !== pid));

    fetch(`/api/projects/${pid}`, {
      method: 'DELETE',
    }).catch((err) => console.error('Error deleting project from SQLite:', err));

    setDeleteProjectModalOpened(false);
    setProjectToDelete(null);
  };

  const confirmArchiveProject = () => {
    if (!projectToDelete) return;
    const pid = projectToDelete.id;
    setProjects((prev) =>
      prev.map((p) => (p.id === pid ? { ...p, isArchived: true } : p))
    );

    fetch(`/api/projects/${pid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isArchived: true }),
    }).catch((err) => console.error('Error archiving project in SQLite:', err));

    setDeleteProjectModalOpened(false);
    setProjectToDelete(null);
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

    // Валидация новой аллокации
    const validation = validateAllocation(newAlloc, allocations, projects, designerCapacities);
    if (!validation.valid) {
      const designer = users.find((u) => u.id === newAlloc.designerId);
      if (designer) {
        setConflictModal({
          opened: true,
          designer,
          reason: validation.reason || 'overlap',
          conflictingProject: validation.overlappingProject,
          proposedDate: newAlloc.startDate,
          proposedTimeLabel: formatAllocationTimeLabel(newAlloc, designerCapacities[newAlloc.designerId] || 8),
        });
      }
      return;
    }

    setAllocations((prev) => [...prev, newAlloc]);

    fetch('/api/allocations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newAlloc),
    }).catch((err) => console.error('Error adding allocation in SQLite:', err));
  };

  const handleUpdateAllocation = (
    id: string,
    updated: Partial<Allocation>,
    commit = true,
    revertValues?: Partial<Allocation>
  ) => {
    if (!isAdmin) return;

    if (commit) {
      const currentAlloc = allocations.find((a) => a.id === id);
      if (!currentAlloc) return;
      const proposed = { ...currentAlloc, ...updated };

      // Валидация предлагаемых изменений
      const validation = validateAllocation(proposed, allocations, projects, designerCapacities);
      if (!validation.valid) {
        const designer = users.find((u) => u.id === proposed.designerId);
        if (designer) {
          setConflictModal({
            opened: true,
            designer,
            reason: validation.reason || 'overlap',
            conflictingProject: validation.overlappingProject,
            proposedDate: proposed.startDate,
            proposedTimeLabel: formatAllocationTimeLabel(proposed, designerCapacities[proposed.designerId] || 8),
          });
        }
        
        // Откатываем локальное состояние к исходному, если предоставлено revertValues
        if (revertValues) {
          setAllocations((prev) =>
            prev.map((a) => (a.id === id ? { ...a, ...revertValues } : a))
          );
        } else {
          // Если нет revertValues, форсируем обновление состояния для ререндера
          setAllocations((prev) => [...prev]);
        }
        return;
      }
    }

    setAllocations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...updated } : a))
    );

    if (commit) {
      fetch(`/api/allocations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      }).catch((err) => console.error('Error updating allocation in SQLite:', err));
    }
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

  // --- Add Project Handler (SQLite Synced with unarchive/existing support) ---
  const handleAddProject = (name: string, color: string, memberIds: string[], existingProjectId?: string) => {
    if (!isAdmin) return;

    if (existingProjectId) {
      // Это существующий проект (например, заархивированный или созданный в трекере)
      setProjects((prev) =>
        prev.map((p) =>
          p.id === existingProjectId
            ? { ...p, isArchived: false, color: color || p.color, memberIds: memberIds.length > 0 ? memberIds : p.memberIds }
            : p
        )
      );

      fetch(`/api/projects/${existingProjectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: false, color, memberIds }),
      }).catch((err) => console.error('Error unarchiving project in SQLite:', err));
      
      return;
    }

    // Проверяем, не существует ли уже проект с таким именем в текущем пространстве
    const existing = projects.find(
      (p) => p.name.toLowerCase() === name.toLowerCase() && p.spaceId === activeSpaceId
    );
    if (existing) {
      // Просто разархивируем его
      setProjects((prev) =>
        prev.map((p) => (p.id === existing.id ? { ...p, isArchived: false, color: color || p.color, memberIds } : p))
      );
      fetch(`/api/projects/${existing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: false, color, memberIds }),
      }).catch((err) => console.error('Error unarchiving project in SQLite:', err));
      return;
    }

    // Создаем полностью новый проект
    const newId = `p-${Date.now()}`;
    const newProj: Project = { id: newId, name, color, memberIds, spaceId: activeSpaceId, isArchived: false };
    setProjects((prev) => [...prev, newProj]);

    fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProj),
    }).catch((err) => console.error('Error adding project in SQLite:', err));
  };

  // --- Tasks Handlers ---
  const handleAddColumn = (name: string, isDone: boolean) => {
    if (!isAdmin) return;
    const colId = `col-${Date.now()}`;
    const sortOrder = columns.filter(c => c.spaceId === activeSpaceId).length;
    const newCol = { id: colId, name, spaceId: activeSpaceId, sortOrder, isDone };
    setColumns((prev) => [...prev, newCol]);

    fetch('/api/task-columns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCol),
    }).catch((err) => console.error('Error adding task column:', err));
  };

  const handleUpdateColumn = (colId: string, updated: { name?: string; isDone?: boolean; sortOrder?: number }) => {
    if (!isAdmin) return;
    setColumns((prev) => prev.map((c) => (c.id === colId ? { ...c, ...updated } : c)));

    fetch(`/api/task-columns/${colId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch((err) => console.error('Error updating task column:', err));
  };

  const handleDeleteColumn = (colId: string) => {
    if (!isAdmin) return;
    setColumns((prev) => prev.filter((c) => c.id !== colId));
    setTasks((prev) => prev.filter((t) => t.columnId !== colId));

    fetch(`/api/task-columns/${colId}`, {
      method: 'DELETE',
    }).catch((err) => console.error('Error deleting task column:', err));
  };

  const handleAddCard = (cardData: { title: string; description: string; projectId: string; designerId: string | null; columnId: string }) => {
    const cardId = `task-${Date.now()}`;
    const sortOrder = tasks.filter(t => t.columnId === cardData.columnId).length;
    const newCard = {
      id: cardId,
      ...cardData,
      sortOrder,
      createdAt: new Date().toISOString(),
    };
    setTasks((prev) => [...prev, newCard]);

    fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCard),
    }).catch((err) => console.error('Error adding task:', err));
  };

  const handleUpdateCard = (cardId: string, updated: { title?: string; description?: string; projectId?: string; designerId?: string | null; columnId?: string; sortOrder?: number }) => {
    setTasks((prev) => prev.map((t) => (t.id === cardId ? { ...t, ...updated } : t)));

    fetch(`/api/tasks/${cardId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch((err) => console.error('Error updating task:', err));
  };

  const handleDeleteCard = (cardId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== cardId));
    setAttachments((prev) => prev.filter((a) => a.taskId !== cardId));
    setLinks((prev) => prev.filter((l) => l.taskId !== cardId));

    fetch(`/api/tasks/${cardId}`, {
      method: 'DELETE',
    }).catch((err) => console.error('Error deleting task:', err));
  };

  const handleAddAttachment = (taskId: string, fileName: string, fileUrl: string) => {
    fetch(`/api/tasks/${taskId}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, fileUrl }),
    })
      .then((res) => res.json())
      .then((newAttach) => {
        setAttachments((prev) => [...prev, newAttach]);
      })
      .catch((err) => console.error('Error adding attachment:', err));
  };

  const handleDeleteAttachment = (attachId: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== attachId));
    fetch(`/api/attachments/${attachId}`, {
      method: 'DELETE',
    }).catch((err) => console.error('Error deleting attachment:', err));
  };

  const handleAddLink = (taskId: string, url: string, title: string) => {
    fetch(`/api/tasks/${taskId}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title }),
    })
      .then((res) => res.json())
      .then((newLink) => {
        setLinks((prev) => [...prev, newLink]);
      })
      .catch((err) => console.error('Error adding link:', err));
  };

  const handleDeleteLink = (linkId: string) => {
    setLinks((prev) => prev.filter((l) => l.id !== linkId));
    fetch(`/api/links/${linkId}`, {
      method: 'DELETE',
    }).catch((err) => console.error('Error deleting link:', err));
  };

  const activeSpace = spaces.find((s) => s.id === activeSpaceId) || spaces[0];
  const spaceUsers = users.filter((u) => activeSpace?.memberIds.includes(u.id));
  const spaceProjects = projects.filter((p) => p.spaceId === activeSpaceId);
  const spaceAllocations = allocations.filter((a) => spaceProjects.some((p) => p.id === a.projectId));

  return (
    <MantineProvider theme={theme}>
      <div className="app-container">
        <Stack gap="lg">
          {/* Global Header Bar */}
          <Paper
            withBorder
            p="md"
            radius="lg"
            className="glass-panel"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#ffffff',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <Group gap="md">
              <Group gap="xs">
                <Avatar size="sm" color="indigo" radius="md">
                  <IconNotebook size={16} />
                </Avatar>
                <div>
                  <Text fw={800} size="sm" style={{ lineHeight: 1.1, letterSpacing: '-0.3px', fontFamily: 'var(--font-family)' }}>Allocater</Text>
                  <Text size="8px" c="dimmed" fw={600} style={{ fontFamily: 'var(--font-family)' }}>TIME & TASK TRACKER</Text>
                </div>
              </Group>

              <Divider orientation="vertical" h={20} mx="xs" />

              <SegmentedControl
                value={activeSection}
                onChange={(val) => setActiveSection(val as 'allocator' | 'tasks')}
                data={[
                  { label: 'Аллокатор', value: 'allocator' },
                  { label: 'Задачи', value: 'tasks' }
                ]}
                color="indigo"
                radius="md"
                size="xs"
              />
            </Group>

            <Group gap="sm">
              <Select
                value={activeSpaceId}
                onChange={(val) => val && setActiveSpaceId(val)}
                data={spaces.map(s => ({ value: s.id, label: s.name }))}
                radius="md"
                size="xs"
                style={{ width: '160px' }}
                leftSection={<IconFolder size={14} color="var(--primary-color)" />}
              />

              <Button
                leftSection={<IconFolder size={14} />}
                color="indigo"
                variant="subtle"
                radius="md"
                size="xs"
                onClick={() => setManageSpacesOpened(true)}
              >
                Простір
              </Button>

              <Button
                leftSection={<IconUsers size={14} />}
                color="indigo"
                variant="subtle"
                radius="md"
                size="xs"
                onClick={() => setDrawerOpened(true)}
              >
                Команда
              </Button>

              {isAdmin ? (
                <Button
                  leftSection={<IconLogout size={14} />}
                  color="red"
                  variant="light"
                  radius="md"
                  size="xs"
                  onClick={handleLogout}
                >
                  Вийти
                </Button>
              ) : (
                <Button
                  leftSection={<IconLogin size={14} />}
                  color="indigo"
                  variant="filled"
                  radius="md"
                  size="xs"
                  onClick={() => setLoginOpened(true)}
                >
                  Вхід для Адміна
                </Button>
              )}
            </Group>
          </Paper>

          {/* Compact Sticky Header (Fixed overlay shown only when scrolled down) - Only for Allocator section */}
          {isSticky && activeSection === 'allocator' && (
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
                onCurrentWeek={handleCurrentWeek}
                onOpenManageUsers={() => setDrawerOpened(true)}
                onOpenManageSpaces={() => setManageSpacesOpened(true)}
                isAdmin={isAdmin}
                onLogin={handleLogin}
                onLogout={handleLogout}
                isSticky={true}
                loading={loading}
              />
            </div>
          )}

          {/* Render based on active section */}
          {activeSection === 'allocator' ? (
            <>
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
                  onCurrentWeek={handleCurrentWeek}
                  onOpenManageUsers={() => setDrawerOpened(true)}
                  onOpenManageSpaces={() => setManageSpacesOpened(true)}
                  isAdmin={isAdmin}
                  onLogin={handleLogin}
                  onLogout={handleLogout}
                  isSticky={false}
                  loading={loading}
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
                loading={loading}
                columns={columns}
                tasks={tasks}
              />

              {/* Add Project Bar - Hidden if not Admin */}
              {isAdmin && (
                <AddProjectRow users={spaceUsers} projects={spaceProjects} onAddProject={handleAddProject} />
              )}
            </>
          ) : (
            <TaskTracker
              isAdmin={isAdmin}
              activeSpaceId={activeSpaceId}
              users={users}
              projects={projects}
              allocations={allocations}
              columns={columns}
              tasks={tasks}
              attachments={attachments}
              links={links}
              onAddColumn={handleAddColumn}
              onUpdateColumn={handleUpdateColumn}
              onDeleteColumn={handleDeleteColumn}
              onAddCard={handleAddCard}
              onUpdateCard={handleUpdateCard}
              onDeleteCard={handleDeleteCard}
              onAddAttachment={handleAddAttachment}
              onDeleteAttachment={handleDeleteAttachment}
              onAddLink={handleAddLink}
              onDeleteLink={handleDeleteLink}
              onAddProject={handleAddProject}
              weekDays={weekDays}
            />
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
        {/* Project Deletion Confirmation Modal */}
        <Modal
          opened={deleteProjectModalOpened}
          onClose={() => {
            setDeleteProjectModalOpened(false);
            setProjectToDelete(null);
          }}
          title={<strong>Видалення проєкту</strong>}
          centered
          size="lg"
        >
          {projectToDelete && (
            <Stack gap="md">
              {projectHasAllocations ? (
                <>
                  <Text size="sm" style={{ lineHeight: 1.5 }}>
                    Проєкт <strong>{projectToDelete.name}</strong> містить зафіксовані години в історії. Як ви хочете його видалити?
                  </Text>
                  <Group justify="flex-end" mt="md" gap="xs">
                    <Button variant="subtle" color="gray" onClick={() => {
                      setDeleteProjectModalOpened(false);
                      setProjectToDelete(null);
                    }}>
                      Скасувати
                    </Button>
                    <Button color="indigo" onClick={confirmArchiveProject}>
                      Видалити з пустих тижнів
                    </Button>
                    <Button color="red" onClick={confirmDeleteProjectCompletely}>
                      Видалити повністю
                    </Button>
                  </Group>
                </>
              ) : (
                <>
                  <Text size="sm">
                    Ви впевнені, що хочете видалити проєкт <strong>{projectToDelete.name}</strong>?
                  </Text>
                  <Group justify="flex-end" mt="md">
                    <Button variant="subtle" color="gray" onClick={() => {
                      setDeleteProjectModalOpened(false);
                      setProjectToDelete(null);
                    }}>
                      Скасувати
                    </Button>
                    <Button color="red" onClick={confirmDeleteProjectCompletely}>
                      Видалити
                    </Button>
                  </Group>
                </>
              )}
            </Stack>
          )}
        </Modal>

        {/* Модальне вікно попередження про конфлікт */}
        <Modal
          opened={!!conflictModal?.opened}
          onClose={() => setConflictModal(null)}
          title={<span style={{ fontWeight: 800, fontSize: '16px', color: '#e03131', fontFamily: 'var(--font-family)' }}>Увага: Конфлікт розподілу часу</span>}
          centered
          radius="md"
          size="md"
          zIndex={99999}
        >
          {conflictModal && (
            <Stack gap="md">
              <Group gap="sm" style={{ padding: '12px', backgroundColor: '#fff5f5', borderRadius: '8px', border: '1px solid #ffe3e3' }}>
                {(() => {
                  const isBase64 = conflictModal.designer.avatar && (conflictModal.designer.avatar.startsWith('data:image/') || conflictModal.designer.avatar.startsWith('http') || conflictModal.designer.avatar.startsWith('/'));
                  return (
                    <Avatar
                      size="md"
                      radius="xl"
                      src={isBase64 ? conflictModal.designer.avatar : undefined}
                      color="indigo"
                    >
                      {!isBase64 && conflictModal.designer.avatar}
                    </Avatar>
                  );
                })()}
                <div>
                  <Text fw={700} size="sm" style={{ fontFamily: 'var(--font-family)' }}>{conflictModal.designer.name}</Text>
                  <Text size="xs" c="dimmed" style={{ fontFamily: 'var(--font-family)' }}>{conflictModal.designer.role}</Text>
                </div>
              </Group>

              {conflictModal.reason === 'overlap' ? (
                <Text size="sm" style={{ lineHeight: 1.6, fontFamily: 'var(--font-family)' }}>
                  Цей час уже зарезервовано на іншому проєкті:{' '}
                  <strong style={{ color: '#4c6ef5' }}>
                    {conflictModal.conflictingProject?.name}
                  </strong>.
                  <br />
                  <span style={{ color: 'var(--text-muted)' }}>Заплановано: {conflictModal.proposedTimeLabel}</span>
                </Text>
              ) : (
                <Text size="sm" style={{ lineHeight: 1.6, fontFamily: 'var(--font-family)' }}>
                  Заплановані години перевищують денну доступність цього дизайнера ({designerCapacities[conflictModal.designer.id] || 8} год).
                  <br />
                  <span style={{ color: 'var(--text-muted)' }}>Спробуйте зменшити години або змінити зміщення.</span>
                </Text>
              )}

              <Group justify="flex-end" mt="xs">
                <Button color="red" onClick={() => setConflictModal(null)}>
                  Зрозуміло
                </Button>
              </Group>
            </Stack>
          )}
        </Modal>

        {/* Global Admin Login Modal */}
        <Modal
          opened={loginOpened}
          onClose={() => {
            setLoginOpened(false);
            setLoginError('');
            setEmail('');
            setPassword('');
          }}
          title={
            <Group gap="xs">
              <IconShield size={20} color="var(--primary-color)" />
              <Text fw={800} size="md" style={{ fontFamily: 'var(--font-family)' }}>
                Авторизація адміністратора
              </Text>
            </Group>
          }
          centered
          radius="md"
        >
          <form onSubmit={handleLoginSubmit}>
            <Stack gap="md">
              <TextInput
                label="Email"
                placeholder="Введіть email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                required
              />
              <PasswordInput
                label="Пароль"
                placeholder="Введіть пароль"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                required
              />

              {loginError && (
                <Text size="xs" c="red" fw={600}>
                  {loginError}
                </Text>
              )}

              <Button
                type="submit"
                color="indigo"
                fullWidth
                loading={isSubmitting}
                leftSection={<IconLogin size={16} />}
                mt="xs"
              >
                Увійти
              </Button>
            </Stack>
          </form>
        </Modal>
      </div>
    </MantineProvider>
  );
};

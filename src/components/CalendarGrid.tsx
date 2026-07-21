import React, { useState, useEffect, useRef } from 'react';
import { Menu, ActionIcon, Button, Text, Avatar } from '@mantine/core';
import { IconUserPlus, IconTrash, IconDotsVertical, IconExchange } from '@tabler/icons-react';
import type { User, Project, Allocation } from '../types';
import { AllocationBar } from './AllocationBar';

// Helper to compute lanes for a project's allocations
const computeLanes = (projectAllocations: Allocation[]): Allocation[][] => {
  // Sort allocations by startDate, then endDate
  const sorted = [...projectAllocations].sort((a, b) => {
    if (a.startDate !== b.startDate) {
      return a.startDate.localeCompare(b.startDate);
    }
    return a.id.localeCompare(b.id);
  });

  const lanes: Allocation[][] = [];
  sorted.forEach((allocation) => {
    let assignedLane = -1;
    for (let i = 0; i < lanes.length; i++) {
      const hasOverlap = lanes[i].some((other) => {
        return !(allocation.endDate < other.startDate || allocation.startDate > other.endDate);
      });
      if (!hasOverlap) {
        assignedLane = i;
        lanes[i].push(allocation);
        break;
      }
    }
    if (assignedLane === -1) {
      lanes.push([allocation]);
    }
  });

  return lanes;
};


interface CalendarGridProps {
  users: User[];
  projects: Project[];
  allocations: Allocation[];
  days: Date[];
  designerCapacities: Record<string, number>;
  onUpdateProjectName: (projectId: string, name: string) => void;
  onDeleteProject: (projectId: string) => void;
  onAddProjectMember: (projectId: string, userId: string) => void;
  onRemoveProjectMember: (projectId: string, userId: string) => void;
  onReplaceProjectMember: (projectId: string, oldUserId: string, newUserId: string) => void;
  onAddAllocation: (allocation: Omit<Allocation, 'id'>) => void;
  onUpdateAllocation: (id: string, updated: Partial<Allocation>) => void;
  onDeleteAllocation: (id: string) => void;
  isAdmin: boolean;
}

export const CalendarGrid: React.FC<CalendarGridProps> = ({
  users,
  projects,
  allocations,
  days,
  designerCapacities,
  onUpdateProjectName,
  onDeleteProject,
  onAddProjectMember,
  onRemoveProjectMember,
  onReplaceProjectMember,
  onAddAllocation,
  onUpdateAllocation,
  onDeleteAllocation,
  isAdmin,
}) => {
  // Drag creation state
  const [dragStartIdx, setDragStartIdx] = useState<number | null>(null);
  const [dragCurrentIdx, setDragCurrentIdx] = useState<number | null>(null);
  const [activeDragProjectId, setActiveDragProjectId] = useState<string | null>(null);

  const dragStartIdxRef = useRef<number | null>(null);
  const dragCurrentIdxRef = useRef<number | null>(null);

  // Formatter helper
  const formatDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Check if today is in the current week to show the red line
  const [redLinePos, setRedLinePos] = useState<number | null>(null);

  useEffect(() => {
    const updateLine = () => {
      const today = new Date();
      const todayStr = formatDateString(today);
      const todayIdx = days.findIndex((d) => formatDateString(d) === todayStr);
      
      if (todayIdx !== -1) {
        const hours = today.getHours();
        const minutes = today.getMinutes();
        const fractionalDay = todayIdx + (hours + minutes / 60) / 24;
        setRedLinePos(fractionalDay);
      } else {
        setRedLinePos(null);
      }
    };

    updateLine();
    const interval = setInterval(updateLine, 60000); // update every minute
    return () => clearInterval(interval);
  }, [days]);

  // Handle Drag to Create Allocation
  const handleCellMouseDown = (projectId: string, dayIdx: number) => {
    if (!isAdmin) return; // Read-only mode

    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const projectDesigners = users.filter((u) => u.isDesigner && project.memberIds.includes(u.id));
    if (projectDesigners.length === 0) return;

    // Check which designers are occupied on this specific dayIdx
    const targetDay = days[dayIdx];
    const occupiedDesigners = new Set<string>();
    allocations
      .filter((a) => a.projectId === projectId)
      .forEach((alloc) => {
        const start = new Date(alloc.startDate);
        const end = new Date(alloc.endDate);
        if (targetDay >= start && targetDay <= end) {
          occupiedDesigners.add(alloc.designerId);
        }
      });

    // If all designers of this project are occupied on this day, block creation
    if (occupiedDesigners.size >= projectDesigners.length) {
      return;
    }

    dragStartIdxRef.current = dayIdx;
    dragCurrentIdxRef.current = dayIdx;
    setDragStartIdx(dayIdx);
    setDragCurrentIdx(dayIdx);
    setActiveDragProjectId(projectId);

    const handleMouseUp = () => {
      const start = dragStartIdxRef.current;
      const current = dragCurrentIdxRef.current;

      if (start !== null && current !== null) {
        const minIdx = Math.min(start, current);
        const maxIdx = Math.max(start, current);
        
        const startDateStr = formatDateString(days[minIdx]);
        const endDateStr = formatDateString(days[maxIdx]);
        const startDateObj = new Date(startDateStr);
        const endDateObj = new Date(endDateStr);

        // Find all designers in the project
        const designers = users.filter((u) => u.isDesigner && project.memberIds.includes(u.id));

        // Find which designers are occupied in this range
        const occupiedInNewRange = new Set<string>();
        allocations
          .filter((a) => a.projectId === projectId)
          .forEach((alloc) => {
            const aStart = new Date(alloc.startDate);
            const aEnd = new Date(alloc.endDate);
            if (!(endDateObj < aStart || startDateObj > aEnd)) {
              occupiedInNewRange.add(alloc.designerId);
            }
          });

        // Find first designer who is NOT occupied
        let targetDesigner = designers.find((d) => !occupiedInNewRange.has(d.id));
        if (!targetDesigner) {
          targetDesigner = designers[0]; // fallback
        }

        if (targetDesigner) {
          const capacity = designerCapacities[targetDesigner.id] || 8;
          const durationDays = maxIdx - minIdx + 1;
          const totalHours = durationDays * capacity;

          onAddAllocation({
            projectId,
            designerId: targetDesigner.id,
            startDate: startDateStr,
            endDate: endDateStr,
            hours: totalHours,
          });
        }
      }

      dragStartIdxRef.current = null;
      dragCurrentIdxRef.current = null;
      setDragStartIdx(null);
      setDragCurrentIdx(null);
      setActiveDragProjectId(null);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleCellMouseEnter = (projectId: string, dayIdx: number) => {
    if (!isAdmin) return;
    if (activeDragProjectId === projectId && dragStartIdx !== null) {
      const project = projects.find((p) => p.id === projectId);
      const projectDesigners = users.filter((u) => u.isDesigner && project?.memberIds.includes(u.id));
      
      const occupied = new Set<number>();
      if (projectDesigners.length > 0) {
        days.forEach((day, index) => {
          const occupiedDesigners = new Set<string>();
          allocations
            .filter((a) => a.projectId === projectId)
            .forEach((alloc) => {
              const start = new Date(alloc.startDate);
              const end = new Date(alloc.endDate);
              if (day >= start && day <= end) {
                occupiedDesigners.add(alloc.designerId);
              }
            });
          if (occupiedDesigners.size >= projectDesigners.length) {
            occupied.add(index);
          }
        });
      }

      // Clamp target index so drag selection cannot span across occupied cells
      let targetIdx = dayIdx;
      if (dayIdx > dragStartIdx) {
        for (let i = dragStartIdx + 1; i <= dayIdx; i++) {
          if (occupied.has(i)) {
            targetIdx = i - 1;
            break;
          }
        }
      } else if (dayIdx < dragStartIdx) {
        for (let i = dragStartIdx - 1; i >= dayIdx; i--) {
          if (occupied.has(i)) {
            targetIdx = i + 1;
            break;
          }
        }
      }
      dragCurrentIdxRef.current = targetIdx;
      setDragCurrentIdx(targetIdx);
    }
  };

  // Helper to format short date label (e.g. "20.07")
  const getDayLabel = (date: Date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}.${month}`;
  };

  // Helper to get day name in Ukrainian
  const getDayNameUa = (dayIndex: number) => {
    const names = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    return names[dayIndex];
  };

  // Helper to generate consistent colors for initials avatar
  const getAvatarColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 60%, 45%)`;
  };

  return (
    <div className="calendar-grid-container">
      {/* Red line for today marker */}
      {redLinePos !== null && (
        <div
          className="current-day-indicator"
          style={{
            left: `calc(320px + (${redLinePos} * ((100% - 320px) / 7)))`,
          }}
        />
      )}

      {/* Grid Headers Row */}
      <div className="project-column-header">Проєкт / Команда</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderLeft: '1px solid var(--border-color)' }}>
        {days.map((day) => {
          return (
            <div className="calendar-header-cell" key={day.toISOString()}>
              <span className="calendar-day-header">{getDayLabel(day)}</span>
              <span className="calendar-day-name">{getDayNameUa(day.getDay())}</span>
            </div>
          );
        })}
      </div>

      {/* Grid Rows for each project */}
      {projects.map((project) => {
        const projectMembers = users.filter((u) => project.memberIds.includes(u.id));
        const projectDesigners = projectMembers.filter((u) => u.isDesigner);
        const nonProjectUsers = users.filter((u) => !project.memberIds.includes(u.id));

        // Compute lanes for this project
        const projectAllocations = allocations.filter((a) => a.projectId === project.id);
        const lanes = computeLanes(projectAllocations);

        return (
          <div className="project-row" key={project.id}>
            {/* Left Cell: Project Name & Members */}
            <div className="project-info-cell">
              <div className="project-title-container">
                <input
                  type="text"
                  className="project-name-input"
                  value={project.name}
                  onChange={(e) => onUpdateProjectName(project.id, e.target.value)}
                  placeholder="Введіть назву проєкту"
                  readOnly={!isAdmin}
                  style={{
                    cursor: isAdmin ? 'text' : 'default',
                    background: 'transparent',
                  }}
                />
                
                {isAdmin && (
                  <Menu shadow="md" width={200} position="right-start">
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray" size="sm">
                        <IconDotsVertical size={16} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Label>Керування проєктом</Menu.Label>
                      <Menu.Item
                        color="red"
                        leftSection={<IconTrash size={14} />}
                        onClick={() => onDeleteProject(project.id)}
                      >
                        Видалити проєкт
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                )}
              </div>

              {/* Members list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {projectMembers.map((member) => (
                  <Menu key={member.id} shadow="md" width={220} position="bottom-start" disabled={!isAdmin}>
                    <Menu.Target>
                      <div
                        className="project-member-item"
                        title={isAdmin ? "Натисніть для зміни виконавця" : undefined}
                        style={{ cursor: isAdmin ? 'pointer' : 'default' }}
                      >
                        {(() => {
                          const isBase64Image = member.avatar && (member.avatar.startsWith('data:image/') || member.avatar.startsWith('http'));
                          return (
                            <div
                              className="project-member-avatar"
                              style={{
                                backgroundColor: isBase64Image ? 'transparent' : getAvatarColor(member.name),
                                backgroundImage: isBase64Image ? `url(${member.avatar})` : undefined,
                              }}
                            >
                              {!isBase64Image && member.avatar}
                            </div>
                          );
                        })()}
                        <div className="project-member-info">
                          <span className="project-member-name">{member.name}</span>
                          <span className="project-member-role">{member.role}</span>
                        </div>
                        
                        {isAdmin && (
                          <ActionIcon
                            className="project-member-delete"
                            size="xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveProjectMember(project.id, member.id);
                            }}
                            title="Видалити учасника"
                          >
                            <IconTrash size={12} />
                          </ActionIcon>
                        )}
                      </div>
                    </Menu.Target>
                    
                    <Menu.Dropdown>
                      <Menu.Label>Замінити виконавця "{member.name}"</Menu.Label>
                      {users
                        .filter((u) => u.id !== member.id)
                        .map((u) => (
                          <Menu.Item
                            key={u.id}
                            leftSection={<IconExchange size={14} />}
                            onClick={() => onReplaceProjectMember(project.id, member.id, u.id)}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {(() => {
                                const isBase64Image = u.avatar && (u.avatar.startsWith('data:image/') || u.avatar.startsWith('http'));
                                return (
                                  <Avatar size="xs" color="blue" radius="xl" src={isBase64Image ? u.avatar : undefined}>
                                    {!isBase64Image && u.avatar}
                                  </Avatar>
                                );
                              })()}
                              <div>
                                <Text size="xs" fw={600}>{u.name}</Text>
                                <Text size="10px" c="dimmed">{u.role}</Text>
                              </div>
                            </div>
                          </Menu.Item>
                        ))}
                    </Menu.Dropdown>
                  </Menu>
                ))}

                {/* Add member button - Hidden if not Admin */}
                {isAdmin && (
                  <Menu shadow="md" width={220} position="right-start">
                    <Menu.Target>
                      <Button
                        variant="subtle"
                        color="indigo"
                        size="xs"
                        leftSection={<IconUserPlus size={14} />}
                        styles={{ inner: { justifyContent: 'flex-start' } }}
                        fullWidth
                        mt="xs"
                      >
                        Додати учасника
                      </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Label>Виберіть колегу</Menu.Label>
                      {nonProjectUsers.length === 0 ? (
                        <Menu.Item disabled>Всі колеги вже додані</Menu.Item>
                      ) : (
                        nonProjectUsers.map((u) => (
                          <Menu.Item
                            key={u.id}
                            onClick={() => onAddProjectMember(project.id, u.id)}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {(() => {
                                const isBase64Image = u.avatar && (u.avatar.startsWith('data:image/') || u.avatar.startsWith('http'));
                                return (
                                  <Avatar size="xs" color="indigo" radius="xl" src={isBase64Image ? u.avatar : undefined}>
                                    {!isBase64Image && u.avatar}
                                  </Avatar>
                                );
                              })()}
                              <div>
                                <Text size="xs" fw={600}>{u.name}</Text>
                                <Text size="10px" c="dimmed">{u.role}</Text>
                              </div>
                            </div>
                          </Menu.Item>
                        ))
                      )}
                    </Menu.Dropdown>
                  </Menu>
                )}
              </div>
            </div>

            {/* Right Cell: Days Grid & Allocations overlay */}
            <div 
              className="calendar-days-cell"
              style={{ minHeight: `${Math.max(140, lanes.length * 56 + 24)}px` }}
            >
              {days.map((day, idx) => {
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                
                let isDraggingOver = false;
                if (
                  activeDragProjectId === project.id &&
                  dragStartIdx !== null &&
                  dragCurrentIdx !== null
                ) {
                  const min = Math.min(dragStartIdx, dragCurrentIdx);
                  const max = Math.max(dragStartIdx, dragCurrentIdx);
                  isDraggingOver = idx >= min && idx <= max;
                }

                const colorConfigMap: Record<string, string> = {
                  indigo: 'rgba(99, 102, 241, 0.08)',
                  blue: 'rgba(59, 130, 246, 0.08)',
                  teal: 'rgba(13, 148, 136, 0.08)',
                  emerald: 'rgba(16, 185, 129, 0.08)',
                  orange: 'rgba(245, 158, 11, 0.08)',
                  rose: 'rgba(244, 63, 94, 0.08)',
                };

                return (
                  <div
                    key={day.toISOString()}
                    className={`day-grid-column ${isWeekend ? 'is-weekend' : ''}`}
                    onMouseDown={() => handleCellMouseDown(project.id, idx)}
                    onMouseEnter={() => handleCellMouseEnter(project.id, idx)}
                    style={{
                      backgroundColor: isDraggingOver
                        ? colorConfigMap[projectDesigners[0]?.color || 'indigo'] || colorConfigMap.indigo
                        : undefined,
                      cursor: isAdmin ? 'crosshair' : 'default',
                    }}
                  />
                );
              })}

              {/* Allocations layer */}
              <div className="allocations-overlay">
                {lanes.map((lane, laneIdx) => (
                  <div key={laneIdx} className="allocation-lane">
                    {lane.map((allocation) => (
                      <AllocationBar
                        key={allocation.id}
                        allocation={allocation}
                        project={project}
                        designers={projectDesigners}
                        days={days}
                        allocations={allocations}
                        designerCapacities={designerCapacities}
                        onUpdateAllocation={onUpdateAllocation}
                        onDeleteAllocation={onDeleteAllocation}
                        isAdmin={isAdmin}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { Menu, ActionIcon, Button, Text, Avatar, Modal, Stack, Group, Tooltip, Skeleton } from '@mantine/core';
import { IconUserPlus, IconTrash, IconDotsVertical } from '@tabler/icons-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { User, Project, Allocation } from '../types';
import { AllocationBar } from './AllocationBar';

// Helper to compute lanes for a project's allocations
const computeLanes = (projectAllocations: Allocation[]): Allocation[][] => {
  // Group allocations by designerId to ensure each designer gets their own stable horizontal track/lane
  const groups: Record<string, Allocation[]> = {};
  projectAllocations.forEach((alloc) => {
    if (!groups[alloc.designerId]) {
      groups[alloc.designerId] = [];
    }
    groups[alloc.designerId].push(alloc);
  });

  // Sort designer IDs stably (numerically or alphabetically) to keep the vertical order consistent
  const sortedDesignerIds = Object.keys(groups).sort((a, b) => {
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    return a.localeCompare(b);
  });

  const finalLanes: Allocation[][] = [];

  sortedDesignerIds.forEach((designerId) => {
    const designerAllocations = groups[designerId];
    
    // Sort by startDate
    designerAllocations.sort((a, b) => a.startDate.localeCompare(b.startDate));
    
    // Pack overlapping allocations for this designer into sub-lanes
    const subLanes: Allocation[][] = [];
    
    designerAllocations.forEach((alloc) => {
      let placed = false;
      for (const lane of subLanes) {
        // Check if alloc overlaps with any item in this lane
        const hasOverlap = lane.some((item) => {
          return alloc.startDate <= item.endDate && alloc.endDate >= item.startDate;
        });
        if (!hasOverlap) {
          lane.push(alloc);
          placed = true;
          break;
        }
      }
      if (!placed) {
        subLanes.push([alloc]);
      }
    });
    
    // Add all sub-lanes to final lanes
    finalLanes.push(...subLanes);
  });

  return finalLanes;
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
  onUpdateProjectsList: (newList: Project[]) => void;
  onSaveProjectsOrder: (orderedIds: string[]) => void;
  isAdmin: boolean;
  loading?: boolean;
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
  onUpdateProjectsList,
  onSaveProjectsOrder,
  isAdmin,
  loading = false,
}) => {
  // Drag selection state
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const [selectedAllocationIds, setSelectedAllocationIds] = useState<string[]>([]);
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);
  const selectionStartRef = useRef<{ x: number; y: number; projectId: string; dayIdx: number } | null>(null);

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

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (selectedAllocationIds.length === 0) return;
      const target = e.target as HTMLElement;

      // Do not clear selection if clicking inside capsules, actions bar, modals, popovers or dropdowns
      if (
        target.closest('.allocation-capsule') ||
        target.closest('.selection-actions-bar') ||
        target.closest('.mantine-Popover-dropdown') ||
        target.closest('.mantine-Menu-dropdown') ||
        target.closest('.mantine-Modal-content')
      ) {
        return;
      }

      setSelectedAllocationIds([]);
    };

    window.addEventListener('mousedown', handleOutsideClick);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [selectedAllocationIds]);

  // Handle drag-selection and click-to-create
  const handleCellMouseDown = (e: React.MouseEvent, projectId: string, dayIdx: number) => {
    if (e.button !== 0 || !isAdmin) return;

    const target = e.target as HTMLElement;
    if (target.closest('.allocation-capsule') || target.closest('.mantine-Popover-dropdown')) {
      return;
    }

    e.preventDefault();
    document.body.classList.add('is-selecting');

    const gridContainer = document.querySelector('.calendar-grid-container');
    const headerEl = document.querySelector('.project-column-header');
    if (!gridContainer || !headerEl) return;

    const gridRect = gridContainer.getBoundingClientRect();
    const headerRect = headerEl.getBoundingClientRect();

    const minX = headerRect.right;
    const maxX = gridRect.right;

    // Viewport-based coordinates (safe for scrolling)
    const startX = Math.max(minX, Math.min(maxX, e.clientX));
    const startY = e.clientY;
    const initialScrollY = window.scrollY; // Track page scroll at click time

    selectionStartRef.current = {
      x: startX,
      y: startY,
      projectId,
      dayIdx,
    };

    // Grid-relative starting point (for rendering inside position:relative grid)
    const gridStartX = startX - gridRect.left;
    const gridStartY = startY - gridRect.top;

    setSelectionBox({
      startX: gridStartX,
      startY: gridStartY,
      currentX: gridStartX,
      currentY: gridStartY,
    });

    setSelectedAllocationIds([]);

    const currentMouseXRef = { current: startX };
    const currentMouseYRef = { current: startY };

    const updateSelection = () => {
      const currentGridRect = gridContainer.getBoundingClientRect();
      const scrollDelta = window.scrollY - initialScrollY;

      // Viewport-relative current coordinates
      const vpCurrentX = Math.max(minX, Math.min(maxX, currentMouseXRef.current));
      const vpCurrentY = Math.max(0, Math.min(window.innerHeight, currentMouseYRef.current));

      // Grid-relative current coordinates (for rendering styles)
      const gridCurrentX = vpCurrentX - currentGridRect.left;
      const gridCurrentY = vpCurrentY - currentGridRect.top;

      // Adjust the startY viewport coordinate by the scroll delta
      const vpStartY = startY - scrollDelta;

      setSelectionBox((box) => {
        if (!box) return null;
        return { ...box, currentX: gridCurrentX, currentY: gridCurrentY };
      });

      // Viewport-relative boundary rect for intersection check
      const boxRect = {
        left: Math.min(startX, vpCurrentX),
        top: Math.min(vpStartY, vpCurrentY),
        right: Math.max(startX, vpCurrentX),
        bottom: Math.max(vpStartY, vpCurrentY),
      };

      const selectedIds: string[] = [];
      const capsules = document.querySelectorAll('.allocation-capsule');
      capsules.forEach((capsule) => {
        const id = capsule.getAttribute('data-allocation-id');
        if (id) {
          const rect = capsule.getBoundingClientRect();
          const intersects = !(
            rect.right < boxRect.left ||
            rect.left > boxRect.right ||
            rect.bottom < boxRect.top ||
            rect.top > boxRect.bottom
          );
          if (intersects) {
            selectedIds.push(id);
          }
        }
      });
      setSelectedAllocationIds(selectedIds);
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      currentMouseXRef.current = moveEvent.clientX;
      currentMouseYRef.current = moveEvent.clientY;
      updateSelection();
    };

    // Auto-scroll loop (60fps) during drag-selection
    const scrollInterval = setInterval(() => {
      const mouseY = currentMouseYRef.current;
      if (mouseY === null) return;

      const threshold = 80;
      const speed = 15;

      if (mouseY > window.innerHeight - threshold) {
        window.scrollBy(0, speed);
        updateSelection();
      } else if (mouseY < 120) {
        window.scrollBy(0, -speed);
        updateSelection();
      }
    }, 16);

    const handleMouseUp = (upEvent: MouseEvent) => {
      clearInterval(scrollInterval);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.classList.remove('is-selecting');

      const start = selectionStartRef.current;
      if (start) {
        const currentX = Math.max(minX, Math.min(maxX, upEvent.clientX));
        const currentY = upEvent.clientY;

        const deltaX = Math.abs(currentX - start.x);
        const deltaY = Math.abs(currentY - start.y);

        if (deltaX < 5 && deltaY < 5) {
          handleSingleClickCreate(projectId, dayIdx);
        }
      }

      setSelectionBox(null);
      selectionStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleDragEnd = (result: any) => {
    if (!result.destination) return;
    const fromIdx = result.source.index;
    const toIdx = result.destination.index;
    if (fromIdx === toIdx) return;

    const list = [...projects];
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);

    // 1. Update React state immediately
    onUpdateProjectsList(list);

    // 2. Persist the final order to the backend DB
    const orderedIds = list.map((p) => p.id);
    onSaveProjectsOrder(orderedIds);

    // 3. Force browser repaint after drop animation finishes (approx 200-250ms)
    // This resolves browser rendering bug in Chrome/Safari where elements stay stuck in promoted rendering layers
    setTimeout(() => {
      const grid = document.querySelector('.calendar-grid-container') as HTMLElement;
      if (grid) {
        grid.offsetHeight; // triggers reflow
        grid.style.transform = 'translateZ(0)'; // forces composite layer redraw
        requestAnimationFrame(() => {
          grid.style.transform = '';
        });
      }
    }, 250);
  };


  const handleSingleClickCreate = (projectId: string, dayIdx: number) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const designers = users.filter((u) => u.isDesigner && project.memberIds.includes(u.id));
    if (designers.length === 0) return;

    const startDateStr = formatDateString(days[dayIdx]);
    const endDateStr = formatDateString(days[dayIdx]); // 1 day duration
    const startDateObj = new Date(startDateStr);
    const endDateObj = new Date(endDateStr);

    // Find which designers are occupied on this day
    const occupiedOnDay = new Set<string>();
    allocations
      .filter((a) => a.projectId === projectId)
      .forEach((alloc) => {
        const aStart = new Date(alloc.startDate);
        const aEnd = new Date(alloc.endDate);
        if (!(endDateObj < aStart || startDateObj > aEnd)) {
          occupiedOnDay.add(alloc.designerId);
        }
      });

    // Find first designer who is NOT occupied
    let targetDesigner = designers.find((d) => !occupiedOnDay.has(d.id));
    // If all are occupied, fallback to first
    if (!targetDesigner) {
      targetDesigner = designers[0];
    }

    if (targetDesigner) {
      const capacity = designerCapacities[targetDesigner.id] || 8;
      onAddAllocation({
        projectId,
        designerId: targetDesigner.id,
        startDate: startDateStr,
        endDate: endDateStr,
        hours: capacity, // 1 day capacity
      });
    }
  };

  // Keyboard shortcut listener for deletion and deselect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAllocationIds.length > 0) {
        const activeEl = document.activeElement;
        if (
          activeEl &&
          (activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            activeEl.hasAttribute('contenteditable'))
        ) {
          return;
        }
        setDeleteModalOpened(true);
      }
      if (e.key === 'Escape') {
        setSelectedAllocationIds([]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAllocationIds]);

  const handleConfirmDelete = () => {
    selectedAllocationIds.forEach((id) => {
      onDeleteAllocation(id);
    });
    setSelectedAllocationIds([]);
    setDeleteModalOpened(false);
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
      <div className="project-column-header">Проєкти ({projects.length}) / Виконавці</div>
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
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="projects-list">
          {(provided) => {
            const startOfWeekStrVal = formatDateString(days[0]);
            const endOfWeekStrVal = formatDateString(days[days.length - 1]);
            const visibleProjects = projects.filter((project) => {
              if (!project.isArchived) return true;
              return allocations.some((a) => {
                return a.projectId === project.id &&
                       a.startDate <= endOfWeekStrVal &&
                       a.endDate >= startOfWeekStrVal;
              });
            });

            return (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="projects-rows-container"
              >
                {loading ? (
                  Array.from({ length: 4 }).map((_, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border-color)', height: '80px' }}>
                      <Skeleton height={50} width={180} radius="md" animate />
                      <Skeleton height={50} style={{ flexGrow: 1 }} radius="md" animate />
                    </div>
                  ))
                ) : (
                  visibleProjects.map((project, idx) => {
                    const projectMembers = users.filter((u) => project.memberIds.includes(u.id));
                  const projectDesigners = projectMembers.filter((u) => u.isDesigner);
                  const nonProjectUsers = users.filter((u) => !project.memberIds.includes(u.id));
                  const startOfWeekStr = formatDateString(days[0]);
                const endOfWeekStr = formatDateString(days[days.length - 1]);

                // Compute lanes for this project
                const projectAllocations = allocations.filter((a) => {
                  return a.projectId === project.id &&
                         a.startDate <= endOfWeekStr &&
                         a.endDate >= startOfWeekStr;
                });
                const lanes = computeLanes(projectAllocations);

                return (
                  <Draggable key={project.id} draggableId={project.id} index={idx} isDragDisabled={!isAdmin}>
                    {(draggableProvided, snapshot) => (
                      <div
                        ref={draggableProvided.innerRef}
                        {...draggableProvided.draggableProps}
                        className={`project-row ${snapshot.isDragging ? 'is-dragging' : ''}`}
                      >
                        {/* Left Cell: Project Name & Members */}
                        <div className="project-info-cell">
                          <div className="project-title-container" style={{ display: 'flex', alignItems: 'center' }}>
                            <span
                              {...draggableProvided.dragHandleProps}
                              className="project-drag-number"
                              title={isAdmin ? 'Перетягніть для зміни приоритету' : undefined}
                              style={{
                                cursor: isAdmin ? 'ns-resize' : 'default',
                                fontWeight: 700,
                                fontSize: '12px',
                                color: 'var(--text-muted)',
                                marginRight: '8px',
                                userSelect: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(99, 102, 241, 0.08)',
                                border: '1px solid rgba(99, 102, 241, 0.15)',
                                transition: 'all 0.2s',
                              }}
                            >
                              {idx + 1}
                            </span>

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
                                flexGrow: 1,
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
                                    onClick={() => {
                                      onDeleteProject(project.id);
                                    }}
                                  >
                                    Видалити проєкт
                                  </Menu.Item>
                                </Menu.Dropdown>
                              </Menu>
                            )}
                          </div>

                          {/* Member List */}
                          <div className="project-members" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '8px' }}>
                            {projectMembers.map((member) => {
                              const isBase64Image = member.avatar && (member.avatar.startsWith('data:image/') || member.avatar.startsWith('http') || member.avatar.startsWith('/'));
                              return (
                                <Menu key={member.id} shadow="md" width={220} trigger="click" disabled={!isAdmin}>
                                  <Menu.Target>
                                    <Tooltip
                                      label={
                                        <div style={{ padding: '2px 4px' }}>
                                          <Text size="xs" fw={700} c="white">{member.name}</Text>
                                          <Text size="10px" style={{ color: '#cbd5e1' }}>{member.role}</Text>
                                        </div>
                                      }
                                      position="top"
                                      withArrow
                                      multiline
                                    >
                                      <div
                                        className="member-avatar-wrapper"
                                        style={{
                                          cursor: isAdmin ? 'pointer' : 'default',
                                          position: 'relative'
                                        }}
                                      >
                                        <Avatar
                                          size="sm"
                                          radius="xl"
                                          color={member.isDesigner ? 'indigo' : 'gray'}
                                          src={isBase64Image ? member.avatar : undefined}
                                          title={member.name}
                                        >
                                          {!isBase64Image && member.avatar}
                                        </Avatar>
                                      </div>
                                    </Tooltip>
                                  </Menu.Target>
                                  <Menu.Dropdown style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                    <Menu.Label>Замінити виконавця</Menu.Label>
                                    {nonProjectUsers.length === 0 ? (
                                      <Menu.Item disabled>Немає інших користувачів</Menu.Item>
                                    ) : (
                                      nonProjectUsers.map((u) => (
                                        <Menu.Item
                                          key={u.id}
                                          onClick={() => onReplaceProjectMember(project.id, member.id, u.id)}
                                        >
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {(() => {
                                              const isBase64 = u.avatar && (u.avatar.startsWith('data:image/') || u.avatar.startsWith('http') || u.avatar.startsWith('/'));
                                              return (
                                                <Avatar
                                                  size="xs"
                                                  radius="xl"
                                                  src={isBase64 ? u.avatar : undefined}
                                                >
                                                  {!isBase64 && u.avatar}
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
                                    <Menu.Divider />
                                    <Menu.Item
                                      color="red"
                                      leftSection={<IconTrash size={14} />}
                                      onClick={() => onRemoveProjectMember(project.id, member.id)}
                                    >
                                      Видалити з проєкту
                                    </Menu.Item>
                                  </Menu.Dropdown>
                                </Menu>
                              );
                            })}

                            {isAdmin && (
                              <Menu shadow="md" width={220}>
                                <Menu.Target>
                                  <ActionIcon 
                                    variant="light" 
                                    color="indigo" 
                                    radius="xl"
                                    style={{
                                      width: '26px',
                                      height: '26px',
                                      minWidth: '26px',
                                      minHeight: '26px',
                                      borderRadius: '50%',
                                    }}
                                  >
                                    <IconUserPlus size={14} />
                                  </ActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                  <Menu.Label>Додати виконавця</Menu.Label>
                                  {users.filter(u => !project.memberIds.includes(u.id)).length === 0 ? (
                                    <Menu.Item disabled>Усі вже додані</Menu.Item>
                                  ) : (
                                    users
                                      .filter(u => !project.memberIds.includes(u.id))
                                      .map(u => (
                                        <Menu.Item
                                          key={u.id}
                                          onClick={() => onAddProjectMember(project.id, u.id)}
                                        >
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {(() => {
                                              const isBase64 = u.avatar && (u.avatar.startsWith('data:image/') || u.avatar.startsWith('http') || u.avatar.startsWith('/'));
                                              return (
                                                <Avatar
                                                  size="xs"
                                                  radius="xl"
                                                  src={isBase64 ? u.avatar : undefined}
                                                >
                                                  {!isBase64 && u.avatar}
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
                          style={{ 
                            minHeight: `${Math.max(140, lanes.length * 56 + 24)}px`,
                          }}
                        >
                          {days.map((day, dIdx) => {
                            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                            return (
                              <div
                                key={day.toISOString()}
                                className={`day-grid-column ${isWeekend ? 'is-weekend' : ''}`}
                                onMouseDown={(e) => handleCellMouseDown(e, project.id, dIdx)}
                                style={{
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
                                    isSelected={selectedAllocationIds.includes(allocation.id)}
                                  />
                                ))}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </Draggable>
                );
              })
            )}
              {provided.placeholder}
            </div>
          );
        }}
        </Droppable>
      </DragDropContext>

      {/* Floating Selection Box */}
      {selectionBox && (
        <div
          className="selection-box"
          style={{
            position: 'absolute',
            left: Math.min(selectionBox.startX, selectionBox.currentX),
            top: Math.min(selectionBox.startY, selectionBox.currentY),
            width: Math.abs(selectionBox.startX - selectionBox.currentX),
            height: Math.abs(selectionBox.startY - selectionBox.currentY),
            border: '1px dashed #6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.12)',
            zIndex: 9999,
            pointerEvents: 'none',
            borderRadius: '4px',
          }}
        />
      )}

      {/* Floating Selection Actions Bar */}
      {selectedAllocationIds.length > 0 && (
        <div className="selection-actions-bar">
          <Text size="sm" fw={600}>Вибрано елементів: {selectedAllocationIds.length}</Text>
          <Group gap="xs">
            <Button
              color="red"
              size="xs"
              leftSection={<IconTrash size={14} />}
              onClick={() => setDeleteModalOpened(true)}
            >
              Видалити
            </Button>
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              onClick={() => setSelectedAllocationIds([])}
            >
              Скасувати
            </Button>
          </Group>
        </div>
      )}

      {/* Confirmation Modal */}
      <Modal
        opened={deleteModalOpened}
        onClose={() => setDeleteModalOpened(false)}
        title="Підтвердження видалення"
        centered
      >
        <Stack>
          <Text size="sm">Ви впевнені, що хочете видалити {selectedAllocationIds.length} вибраних прогресс-барів?</Text>
          <Group justify="flex-end" mt="md">
            <Button variant="subtle" color="gray" onClick={() => setDeleteModalOpened(false)}>
              Скасувати
            </Button>
            <Button color="red" onClick={handleConfirmDelete}>
              Видалити
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
};

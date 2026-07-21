import React, { useState, useEffect, useRef } from 'react';
import { Menu, ActionIcon, Button, Text, Avatar, Modal, Stack, Group } from '@mantine/core';
import { IconUserPlus, IconTrash, IconDotsVertical, IconExchange } from '@tabler/icons-react';
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

  return sortedDesignerIds.map((designerId) => groups[designerId]);
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

  // Handle drag-selection and click-to-create
  const handleCellMouseDown = (e: React.MouseEvent, projectId: string, dayIdx: number) => {
    // If it's a right click or not admin, ignore
    if (e.button !== 0 || !isAdmin) return;

    // Check if target is a capsule or handle (should not start selection box here)
    const target = e.target as HTMLElement;
    if (target.closest('.allocation-capsule') || target.closest('.mantine-Popover-dropdown')) {
      return;
    }

    selectionStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      projectId,
      dayIdx,
    };

    setSelectionBox({
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
    });

    // Clear previous selection on new click
    setSelectedAllocationIds([]);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      setSelectionBox((box) => {
        if (!box) return null;
        const currentX = moveEvent.clientX;
        const currentY = moveEvent.clientY;

        // Perform selection check on move
        const boxRect = {
          left: Math.min(box.startX, currentX),
          top: Math.min(box.startY, currentY),
          right: Math.max(box.startX, currentX),
          bottom: Math.max(box.startY, currentY),
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

        return { ...box, currentX, currentY };
      });
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      const start = selectionStartRef.current;
      if (start) {
        const deltaX = Math.abs(upEvent.clientX - start.x);
        const deltaY = Math.abs(upEvent.clientY - start.y);

        // If it was a small click (no drag), treat as click-to-create!
        if (deltaX < 5 && deltaY < 5) {
          handleSingleClickCreate(start.projectId, start.dayIdx);
        }
      }

      setSelectionBox(null);
      selectionStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
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
                return (
                  <div
                    key={day.toISOString()}
                    className={`day-grid-column ${isWeekend ? 'is-weekend' : ''}`}
                    onMouseDown={(e) => handleCellMouseDown(e, project.id, idx)}
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
        );
      })}

      {/* Floating Selection Box */}
      {selectionBox && (
        <div
          className="selection-box"
          style={{
            position: 'fixed',
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

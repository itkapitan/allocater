import React, { useRef, useState } from 'react';
import { Popover, NumberInput, Select, Button, Group, Stack, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import type { Allocation, Project, User } from '../types';

const getAvatarColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 60%, 45%)`;
};

interface AllocationBarProps {
  allocation: Allocation;
  project: Project;
  designers: User[];
  days: Date[];
  allocations: Allocation[];
  designerCapacities: Record<string, number>;
  onUpdateAllocation: (id: string, updated: Partial<Allocation>) => void;
  onDeleteAllocation: (id: string) => void;
  isAdmin: boolean;
}

export const AllocationBar: React.FC<AllocationBarProps> = ({
  allocation,
  project,
  designers,
  days,
  allocations,
  designerCapacities,
  onUpdateAllocation,
  onDeleteAllocation,
  isAdmin,
}) => {
  const [popoverOpened, setPopoverOpened] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse dates
  const allocStart = new Date(allocation.startDate);
  const allocEnd = new Date(allocation.endDate);
  const weekStart = days[0];
  const weekEnd = days[6];

  // Helper to format Date to YYYY-MM-DD local string
  const formatDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper to clamp dates
  const clampDate = (date: Date, min: Date, max: Date) => {
    if (date < min) return min;
    if (date > max) return max;
    return date;
  };

  // Check if allocation overlaps current week
  const startClamped = clampDate(allocStart, weekStart, weekEnd);
  const endClamped = clampDate(allocEnd, weekStart, weekEnd);

  if (startClamped > weekEnd || endClamped < weekStart) {
    return null; // Not in this week
  }

  // Find index in the 7 days array
  const findDayIndex = (date: Date) => {
    const dateStr = formatDateString(date);
    return days.findIndex((d) => formatDateString(d) === dateStr);
  };

  const startIdx = findDayIndex(startClamped);
  const endIdx = findDayIndex(endClamped);

  if (startIdx === -1 || endIdx === -1) return null;

  // Percentage positioning
  const leftPercent = (startIdx / 7) * 100;

  // Color Mapping
  const colorMap: Record<string, { track: string; fill: string; border: string }> = {
    indigo: { track: 'rgba(99, 102, 241, 0.08)', fill: '#6366f1', border: '#818cf8' },
    blue: { track: 'rgba(59, 130, 246, 0.08)', fill: '#3b82f6', border: '#60a5fa' },
    teal: { track: 'rgba(13, 148, 136, 0.08)', fill: '#0d9488', border: '#2dd4bf' },
    emerald: { track: 'rgba(16, 185, 129, 0.08)', fill: '#10b981', border: '#34d399' },
    orange: { track: 'rgba(245, 158, 11, 0.08)', fill: '#f59e0b', border: '#fbbf24' },
    rose: { track: 'rgba(244, 63, 94, 0.08)', fill: '#f43f5e', border: '#fb7185' },
  };

  const designer = designers.find((d) => d.id === allocation.designerId);
  const designerColor = designer?.color || 'indigo';
  const colors = colorMap[designerColor] || colorMap.indigo;

  // Real-time Visual hours scaling based on designer capacity
  const designerId = allocation.designerId;
  const capacity = designerCapacities[designerId] || 8;

  const maxWeeklyHours = 7 * capacity; // Max hours represented by the full week width

  // Width is percentage of hours allocated divided by max week hours (7 * capacity)
  const widthPercent = (allocation.hours / maxWeeklyHours) * 100;

  // --- Move & Resize Event Handlers ---
  const handleDragStart = (
    e: React.MouseEvent,
    mode: 'move' | 'resize-left' | 'resize-right'
  ) => {
    if (!isAdmin) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const initialHours = allocation.hours;
    const initialStart = new Date(allocation.startDate);
    const initialEnd = new Date(allocation.endDate);

    // Compute pixel width of 1 day in the grid cell
    const parentWidth = containerRef.current?.parentElement?.getBoundingClientRect().width || 0;
    const colWidth = parentWidth / 7;
    const pixelsPerHour = colWidth / capacity;

    // Boundary constraints: list all allocations of this designer in this project to avoid overlapping them
    const projectAllocations = allocations.filter(
      (a) => a.projectId === project.id && a.designerId === allocation.designerId && a.id !== allocation.id
    );
    const occupiedDayIndices = new Set<number>();
    
    projectAllocations.forEach((a) => {
      const aStart = new Date(a.startDate);
      const aEnd = new Date(a.endDate);
      days.forEach((day, idx) => {
        if (day >= aStart && day <= aEnd) {
          occupiedDayIndices.add(idx);
        }
      });
    });

    // Find nearest left/right busy boundaries relative to current range
    const originalStartIdx = findDayIndex(allocStart);
    const originalEndIdx = findDayIndex(allocEnd);

    let leftBoundaryIdx = -1;
    for (let i = originalStartIdx - 1; i >= 0; i--) {
      if (occupiedDayIndices.has(i)) {
        leftBoundaryIdx = i;
        break;
      }
    }

    let rightBoundaryIdx = 7;
    for (let i = originalEndIdx + 1; i < 7; i++) {
      if (occupiedDayIndices.has(i)) {
        rightBoundaryIdx = i;
        break;
      }
    }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      
      if (mode === 'resize-right') {
        const deltaHours = Math.round(deltaX / pixelsPerHour);
        const newHours = Math.max(1, initialHours + deltaHours);

        // Convert new hours back to days duration
        const durationDays = Math.ceil(newHours / capacity);
        const targetEndIdx = originalStartIdx + durationDays - 1;

        if (targetEndIdx >= originalStartIdx && targetEndIdx < rightBoundaryIdx) {
          const newEnd = new Date(initialStart);
          newEnd.setDate(initialStart.getDate() + durationDays - 1);
          
          onUpdateAllocation(allocation.id, {
            endDate: formatDateString(newEnd),
            hours: newHours,
          });
        }
      } 
      else if (mode === 'resize-left') {
        const deltaHours = Math.round(deltaX / pixelsPerHour);
        const newHours = Math.max(1, initialHours - deltaHours);

        // Convert to days duration
        const durationDays = Math.ceil(newHours / capacity);
        const targetStartIdx = originalEndIdx - durationDays + 1;

        if (targetStartIdx <= originalEndIdx && targetStartIdx > leftBoundaryIdx) {
          const newStart = new Date(initialEnd);
          newStart.setDate(initialEnd.getDate() - durationDays + 1);
          
          onUpdateAllocation(allocation.id, {
            startDate: formatDateString(newStart),
            hours: newHours,
          });
        }
      } 
      else if (mode === 'move') {
        const deltaDays = Math.round(deltaX / colWidth);
        const durationDays = Math.round((initialEnd.getTime() - initialStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        const targetStartIdx = originalStartIdx + deltaDays;
        const targetEndIdx = targetStartIdx + durationDays - 1;

        if (targetStartIdx > leftBoundaryIdx && targetEndIdx < rightBoundaryIdx) {
          const newStart = new Date(initialStart);
          newStart.setDate(initialStart.getDate() + deltaDays);
          
          const newEnd = new Date(newStart);
          newEnd.setDate(newStart.getDate() + durationDays - 1);

          onUpdateAllocation(allocation.id, {
            startDate: formatDateString(newStart),
            endDate: formatDateString(newEnd),
          });
        }
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div ref={containerRef}>
      <Popover
        opened={isAdmin && popoverOpened}
        onChange={setPopoverOpened}
        width={260}
        position="bottom"
        withArrow
        shadow="md"
        trapFocus
      >
        <Popover.Target>
          <div
            className="allocation-capsule"
            style={{
              left: `${leftPercent}%`,
              width: `calc(max(36px, ${widthPercent}% - 4px))`, // Minimum clickable/readable width of 36px
              backgroundColor: colors.track,
              border: `2px solid ${colors.border}`,
              margin: '0 2px',
              position: 'absolute',
              overflow: 'visible', // Let handles remain accessible
              cursor: isAdmin ? 'grab' : 'default',
            }}
            onClick={isAdmin ? () => setPopoverOpened((o) => !o) : undefined}
          >
            {/* Visual Progress Fill Bar */}
            <div
              className="allocation-progress-fill"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                right: 0,
                backgroundColor: colors.fill,
                opacity: 0.85,
                zIndex: 1,
                borderRadius: 'inherit',
              }}
            />

            {/* Left Resize Handle */}
            {isAdmin && (
              <div
                className="allocation-handle allocation-handle-left"
                style={{ backgroundColor: colors.fill, cursor: 'ew-resize' }}
                onMouseDown={(e) => handleDragStart(e, 'resize-left')}
              />
            )}

            {/* Drag middle to move */}
            <div
              className="allocation-content"
              onMouseDown={isAdmin ? (e) => handleDragStart(e, 'move') : undefined}
              style={{ position: 'relative', zIndex: 2 }}
            >
              {/* Floating Pill Badge for maximum legibility */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#ffffff',
                  color: colors.fill,
                  padding: '3px 8px 3px 4px',
                  borderRadius: '12px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
                  border: `1px solid ${colors.border}`,
                  fontSize: '11px',
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                }}
              >
                {(() => {
                  if (!designer) return null;
                  const isBase64Image = designer.avatar && (designer.avatar.startsWith('data:image/') || designer.avatar.startsWith('http'));
                  return (
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        backgroundColor: isBase64Image ? 'transparent' : getAvatarColor(designer.name),
                        backgroundImage: isBase64Image ? `url(${designer.avatar})` : undefined,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '7px',
                        fontWeight: 800,
                        color: '#ffffff',
                        flexShrink: 0,
                      }}
                    >
                      {!isBase64Image && designer.avatar}
                    </div>
                  );
                })()}
                <span>{allocation.hours} г</span>
              </div>
            </div>

            {/* Right Resize Handle */}
            {isAdmin && (
              <div
                className="allocation-handle allocation-handle-right"
                style={{ backgroundColor: colors.fill, cursor: 'ew-resize' }}
                onMouseDown={(e) => handleDragStart(e, 'resize-right')}
              />
            )}
          </div>
        </Popover.Target>

        <Popover.Dropdown onClick={(e) => e.stopPropagation()}>
          <Stack gap="sm">
            <Text fw={700} size="sm" style={{ fontFamily: 'var(--font-family)' }}>Редагувати години</Text>
            
            <NumberInput
              label="Заплановано годин"
              value={allocation.hours}
              onChange={(val) => onUpdateAllocation(allocation.id, { hours: Number(val) || 0 })}
              min={1}
              max={168}
              required
            />

            <Select
              label="Виконавець (Дизайнер)"
              value={allocation.designerId}
              data={designers.map((d) => ({ value: d.id, label: d.name }))}
              onChange={(val) => val && onUpdateAllocation(allocation.id, { designerId: val })}
            />

            <Group justify="space-between" mt="xs">
              <Button
                color="red"
                variant="light"
                leftSection={<IconTrash size={14} />}
                onClick={() => {
                  onDeleteAllocation(allocation.id);
                  setPopoverOpened(false);
                }}
                size="xs"
              >
                Видалити
              </Button>
              <Button size="xs" color="indigo" onClick={() => setPopoverOpened(false)}>
                Зберегти
              </Button>
            </Group>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </div>
  );
};

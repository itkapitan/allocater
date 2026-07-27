import React, { useState, useRef } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult
} from '@hello-pangea/dnd';
import {
  Paper,
  Text,
  Button,
  Group,
  Stack,
  TextInput,
  Checkbox,
  Select,
  Modal,
  ActionIcon,
  Avatar,
  Tooltip,
  Badge,
  Anchor,
  FileButton,
  Divider,
  ColorInput
} from '@mantine/core';
import {
  IconPlus,
  IconTrash,
  IconPencil,
  IconLink,
  IconPaperclip,
  IconExternalLink,
  IconFile,
  IconFolderPlus,
  IconNotebook
} from '@tabler/icons-react';
import type { User, Project, Allocation } from '../types';

interface TaskTrackerProps {
  isAdmin: boolean;
  activeSpaceId: string;
  users: User[];
  projects: Project[];
  allocations: Allocation[];
  columns: any[];
  tasks: any[];
  attachments: any[];
  links: any[];
  onAddColumn: (name: string, isDone: boolean) => void;
  onUpdateColumn: (colId: string, updated: any) => void;
  onDeleteColumn: (colId: string) => void;
  onAddCard: (cardData: { title: string; description: string; projectId: string; designerId: string | null; columnId: string }) => void;
  onUpdateCard: (cardId: string, updated: any) => void;
  onDeleteCard: (cardId: string) => void;
  onAddAttachment: (taskId: string, fileName: string, fileUrl: string) => void;
  onDeleteAttachment: (attachId: string) => void;
  onAddLink: (taskId: string, url: string, title: string) => void;
  onDeleteLink: (linkId: string) => void;
  onAddProject: (name: string, color: string, memberIds: string[], existingProjectId?: string) => void;
}

export const TaskTracker: React.FC<TaskTrackerProps> = ({
  isAdmin,
  activeSpaceId,
  users,
  projects,
  allocations,
  columns,
  tasks,
  attachments,
  links,
  onAddColumn,
  onUpdateColumn,
  onDeleteColumn,
  onAddCard,
  onUpdateCard,
  onDeleteCard,
  onAddAttachment,
  onDeleteAttachment,
  onAddLink,
  onDeleteLink,
  onAddProject
}) => {
  // Filter columns and tasks for active space
  const spaceColumns = columns
    .filter((col) => col.spaceId === activeSpaceId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const spaceTasks = tasks.filter((t) =>
    spaceColumns.some((col) => col.id === t.columnId)
  );

  // States
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [taskModalOpened, setTaskModalOpened] = useState(false);
  const [newColumnModalOpened, setNewColumnModalOpened] = useState(false);
  const [editColumnModalOpened, setEditColumnModalOpened] = useState(false);
  const [editingColumn, setEditingColumn] = useState<any | null>(null);
  const [newProjectModalOpened, setNewProjectModalOpened] = useState(false);

  // Draft form states
  const [newColName, setNewColName] = useState('');
  const [newColIsDone, setNewColIsDone] = useState(false);
  
  const [newProjName, setNewProjName] = useState('');
  const [newProjColor, setNewProjColor] = useState('#6366f1');
  const [newProjMembers, setNewProjMembers] = useState<string[]>([]);

  // Task details editing draft
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [draftProjectId, setDraftProjectId] = useState('');
  const [draftDesignerId, setDraftDesignerId] = useState<string | null>('');
  
  // Link & File draft forms
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkTitle, setNewLinkTitle] = useState('');
  
  // Custom minimal rich text state helper
  const descriptionEditorRef = useRef<HTMLDivElement>(null);

  // --- Space specific projects ---
  const activeProjects = projects.filter((p) => p.spaceId === activeSpaceId && !p.isArchived);
  const activeDesigners = users.filter((u) => u.isDesigner);

  // Helper avatar color
  const getAvatarColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 60%, 45%)`;
  };

  // Drag & drop handlers
  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId, type } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    if (type === 'COLUMN') {
      // Reorder columns
      const updatedCols = Array.from(spaceColumns);
      const [removed] = updatedCols.splice(source.index, 1);
      updatedCols.splice(destination.index, 0, removed);

      updatedCols.forEach((col, idx) => {
        onUpdateColumn(col.id, { sortOrder: idx });
      });
    } else {
      // Reorder or move tasks
      const sourceColId = source.droppableId;
      const destColId = destination.droppableId;

      const updatedTasks = Array.from(tasks);
      const movingTask = updatedTasks.find(t => t.id === draggableId);
      if (!movingTask) return;

      // Update task column immediately in state
      onUpdateCard(draggableId, {
        columnId: destColId,
        sortOrder: destination.index
      });

      // Update order of other tasks in source column
      const sourceTasks = spaceTasks
        .filter((t) => t.columnId === sourceColId && t.id !== draggableId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      
      sourceTasks.forEach((t, idx) => {
        onUpdateCard(t.id, { sortOrder: idx });
      });

      // Update order of other tasks in destination column
      const destTasks = spaceTasks
        .filter((t) => t.columnId === destColId && t.id !== draggableId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      
      destTasks.splice(destination.index, 0, movingTask);
      destTasks.forEach((t, idx) => {
        onUpdateCard(t.id, { sortOrder: idx });
      });
    }
  };

  // Open Task details modal
  const handleOpenTask = (task: any) => {
    setSelectedTask(task);
    setDraftTitle(task.title);
    setDraftDesc(task.description || '');
    setDraftProjectId(task.projectId);
    setDraftDesignerId(task.designerId);
    setTaskModalOpened(true);
  };

  const handleSaveTaskDetails = () => {
    if (!selectedTask) return;
    onUpdateCard(selectedTask.id, {
      title: draftTitle,
      description: draftDesc,
      projectId: draftProjectId,
      designerId: draftDesignerId || null
    });
    setTaskModalOpened(false);
    setSelectedTask(null);
  };

  const handleCreateTask = (columnId: string) => {
    const defaultProject = activeProjects[0]?.id || '';
    onAddCard({
      title: 'Нова задача',
      description: '',
      projectId: defaultProject,
      designerId: null,
      columnId
    });
  };

  // Format total hours allocated to designer for a project this week
  const getDesignerHoursInfo = (designerId: string | null, projectId: string) => {
    if (!designerId) return '';
    const hours = allocations
      .filter((a) => a.designerId === designerId && a.projectId === projectId)
      .reduce((sum, a) => sum + a.hours, 0);
    return hours > 0 ? `(${hours} год заплановано)` : '(0 год)';
  };

  // Create Project Callback from Tracker Drawer
  const handleCreateProjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim()) return;

    onAddProject(newProjName.trim(), newProjColor, newProjMembers);
    setNewProjectModalOpened(false);
    setNewProjName('');
    setNewProjColor('#6366f1');
    setNewProjMembers([]);
  };

  return (
    <div style={{ paddingBottom: '40px' }}>
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="board" type="COLUMN" direction="horizontal">
          {(provided) => (
            <div
              className="kanban-board-scroll"
              ref={provided.innerRef}
              {...provided.droppableProps}
              style={{
                display: 'flex',
                gap: '16px',
                overflowX: 'auto',
                paddingBottom: '16px',
                minHeight: 'calc(100vh - 280px)',
                alignItems: 'flex-start'
              }}
            >
              {spaceColumns.map((col, index) => {
                const colTasks = spaceTasks
                  .filter((t) => t.columnId === col.id)
                  .sort((a, b) => a.sortOrder - b.sortOrder);

                return (
                  <Draggable key={col.id} draggableId={col.id} index={index} isDragDisabled={!isAdmin}>
                    {(providedCol) => (
                      <Paper
                        ref={providedCol.innerRef}
                        {...providedCol.draggableProps}
                        withBorder
                        className="glass-panel"
                        style={{
                          ...providedCol.draggableProps.style,
                          width: '320px',
                          flexShrink: 0,
                          backgroundColor: '#f8fafc',
                          padding: '16px',
                          borderRadius: '16px',
                          boxShadow: 'var(--shadow-sm)'
                        }}
                      >
                        {/* Column Header */}
                        <Group justify="space-between" mb="md" wrap="nowrap" {...providedCol.dragHandleProps}>
                          <Group gap="xs" style={{ minWidth: 0 }}>
                            <Text fw={800} size="md" truncate style={{ color: 'var(--text-main)' }}>
                              {col.name}
                            </Text>
                            <Badge color="indigo" variant="light" size="sm">
                              {colTasks.length}
                            </Badge>
                            {col.isDone === 1 && (
                              <Tooltip label="Задачі в цій колонці завершені">
                                <Badge color="teal" variant="filled" size="xs">
                                  Виконано
                                </Badge>
                              </Tooltip>
                            )}
                          </Group>

                          {isAdmin && (
                            <Group gap={4} style={{ flexShrink: 0 }}>
                              <ActionIcon
                                variant="subtle"
                                color="indigo"
                                size="sm"
                                onClick={() => {
                                  setEditingColumn(col);
                                  setNewColName(col.name);
                                  setNewColIsDone(col.isDone === 1);
                                  setEditColumnModalOpened(true);
                                }}
                              >
                                <IconPencil size={14} />
                              </ActionIcon>
                              <ActionIcon
                                variant="subtle"
                                color="red"
                                size="sm"
                                onClick={() => onDeleteColumn(col.id)}
                              >
                                <IconTrash size={14} />
                              </ActionIcon>
                            </Group>
                          )}
                        </Group>

                        {/* Tasks Droppable container */}
                        <Droppable droppableId={col.id} type="CARD" direction="vertical">
                          {(providedTasks) => (
                            <Stack
                              ref={providedTasks.innerRef}
                              {...providedTasks.droppableProps}
                              gap="sm"
                              style={{
                                minHeight: '100px',
                                paddingBottom: '8px'
                              }}
                            >
                              {colTasks.map((task, idx) => {
                                const project = projects.find((p) => p.id === task.projectId);
                                const designer = users.find((u) => u.id === task.designerId);
                                const taskAttachs = attachments.filter((a) => a.taskId === task.id);
                                const taskUrls = links.filter((l) => l.taskId === task.id);

                                return (
                                  <Draggable key={task.id} draggableId={task.id} index={idx}>
                                    {(providedTaskCard) => (
                                      <Paper
                                        ref={providedTaskCard.innerRef}
                                        {...providedTaskCard.draggableProps}
                                        {...providedTaskCard.dragHandleProps}
                                        withBorder
                                        onClick={() => handleOpenTask(task)}
                                        style={{
                                          ...providedTaskCard.draggableProps.style,
                                          padding: '12px',
                                          borderRadius: '12px',
                                          backgroundColor: '#ffffff',
                                          cursor: 'pointer',
                                          boxShadow: '0 2px 8px -2px rgba(0,0,0,0.04)',
                                          borderLeft: project ? `4px solid ${project.color}` : '1px solid var(--border-color)',
                                          transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                                        }}
                                        className="kanban-card"
                                      >
                                        <Stack gap="xs">
                                          {project && (
                                            <Badge
                                              size="xs"
                                              variant="light"
                                              style={{
                                                backgroundColor: `${project.color}15`,
                                                color: project.color,
                                                borderColor: `${project.color}30`
                                              }}
                                            >
                                              {project.name}
                                            </Badge>
                                          )}

                                          <Text fw={700} size="sm" style={{ color: 'var(--text-main)', lineHeight: 1.3 }}>
                                            {task.title}
                                          </Text>

                                          {task.description && (
                                            <Text size="xs" c="dimmed" lineClamp={2} style={{ lineHeight: 1.4 }}>
                                              {task.description.replace(/<[^>]*>/g, '')}
                                            </Text>
                                          )}

                                          <Group justify="space-between" mt="xs" align="center">
                                            {/* Icons row */}
                                            <Group gap="xs">
                                              {taskAttachs.length > 0 && (
                                                <Group gap="2px" c="dimmed">
                                                  <IconPaperclip size={12} />
                                                  <Text size="10px" fw={600}>{taskAttachs.length}</Text>
                                                </Group>
                                              )}
                                              {taskUrls.length > 0 && (
                                                <Group gap="2px" c="dimmed">
                                                  <IconLink size={12} />
                                                  <Text size="10px" fw={600}>{taskUrls.length}</Text>
                                                </Group>
                                              )}
                                            </Group>

                                            {/* Assignee Avatar */}
                                            {designer ? (
                                              <Tooltip label={`${designer.name} - ${designer.role}`}>
                                                {(() => {
                                                  const isBase64 = designer.avatar && (designer.avatar.startsWith('data:image/') || designer.avatar.startsWith('http') || designer.avatar.startsWith('/'));
                                                  return (
                                                    <Avatar
                                                      size="sm"
                                                      radius="xl"
                                                      src={isBase64 ? designer.avatar : undefined}
                                                      style={{
                                                        backgroundColor: isBase64 ? 'transparent' : getAvatarColor(designer.name),
                                                        fontSize: '8px',
                                                        fontWeight: 800,
                                                        color: '#fff'
                                                      }}
                                                    >
                                                      {!isBase64 && designer.avatar}
                                                    </Avatar>
                                                  );
                                                })()}
                                              </Tooltip>
                                            ) : (
                                              <Badge color="gray" variant="light" size="xs">
                                                Не призначено
                                              </Badge>
                                            )}
                                          </Group>
                                        </Stack>
                                      </Paper>
                                    )}
                                  </Draggable>
                                );
                              })}
                              {providedTasks.placeholder}
                            </Stack>
                          )}
                        </Droppable>

                        {/* Add Task Button */}
                        <Button
                          variant="subtle"
                          color="indigo"
                          fullWidth
                          mt="sm"
                          leftSection={<IconPlus size={16} />}
                          onClick={() => handleCreateTask(col.id)}
                          radius="md"
                          size="xs"
                        >
                          Додати задачу
                        </Button>
                      </Paper>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}

              {/* Add Column Button */}
              {isAdmin && (
                <Button
                  variant="dashed"
                  color="indigo"
                  onClick={() => {
                    setNewColName('');
                    setNewColIsDone(false);
                    setNewColumnModalOpened(true);
                  }}
                  style={{
                    width: '320px',
                    height: '56px',
                    flexShrink: 0,
                    borderRadius: '16px',
                    border: '2px dashed var(--border-color)',
                    background: 'rgba(255,255,255,0.4)',
                    color: 'var(--primary-color)'
                  }}
                  leftSection={<IconPlus size={18} />}
                >
                  Створити нову колонку
                </Button>
              )}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* 1. Modal: Column Creation */}
      <Modal
        opened={newColumnModalOpened}
        onClose={() => setNewColumnModalOpened(false)}
        title={<Text fw={800} size="md">Нова колонка канбан-дошки</Text>}
        centered
        radius="md"
      >
        <Stack gap="md">
          <TextInput
            label="Назва колонки"
            placeholder="Наприклад: Тестування"
            value={newColName}
            onChange={(e) => setNewColName(e.currentTarget.value)}
            required
          />

          <Checkbox
            checked={newColIsDone}
            onChange={(e) => setNewColIsDone(e.currentTarget.checked)}
            label={
              <div>
                <Text fw={600} size="sm">Позначити як Виконано (isDone)</Text>
                <Text size="xs" c="dimmed">
                  Карточки, перенесені в цю колонку, будуть вважатися виконаними та просунуть прогрес-бар проєкту.
                </Text>
              </div>
            }
          />

          <Group justify="flex-end" gap="xs" mt="md">
            <Button variant="subtle" color="gray" onClick={() => setNewColumnModalOpened(false)}>
              Скасувати
            </Button>
            <Button
              color="indigo"
              onClick={() => {
                if (newColName.trim()) {
                  onAddColumn(newColName.trim(), newColIsDone);
                  setNewColumnModalOpened(false);
                }
              }}
            >
              Створити
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* 2. Modal: Column Editing */}
      <Modal
        opened={editColumnModalOpened}
        onClose={() => setEditColumnModalOpened(false)}
        title={<Text fw={800} size="md">Редагувати колонку</Text>}
        centered
        radius="md"
      >
        <Stack gap="md">
          <TextInput
            label="Назва колонки"
            value={newColName}
            onChange={(e) => setNewColName(e.currentTarget.value)}
            required
          />

          <Checkbox
            checked={newColIsDone}
            onChange={(e) => setNewColIsDone(e.currentTarget.checked)}
            label={
              <div>
                <Text fw={600} size="sm">Позначити як Виконано (isDone)</Text>
                <Text size="xs" c="dimmed">
                  Карточки в цій колонці є завершеними задачами проєкту.
                </Text>
              </div>
            }
          />

          <Group justify="flex-end" gap="xs" mt="md">
            <Button variant="subtle" color="gray" onClick={() => setEditColumnModalOpened(false)}>
              Скасувати
            </Button>
            <Button
              color="indigo"
              onClick={() => {
                if (editingColumn && newColName.trim()) {
                  onUpdateColumn(editingColumn.id, {
                    name: newColName.trim(),
                    isDone: newColIsDone
                  });
                  setEditColumnModalOpened(false);
                }
              }}
            >
              Зберегти
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* 3. Modal: Task details (Edit card) */}
      <Modal
        opened={taskModalOpened}
        onClose={() => {
          setTaskModalOpened(false);
          setSelectedTask(null);
        }}
        title={<TextInput variant="unstyled" fw={800} size="md" value={draftTitle} onChange={(e) => setDraftTitle(e.currentTarget.value)} styles={{ input: { fontSize: '18px', fontWeight: 800, padding: 0 } }} />}
        centered
        size="lg"
        radius="md"
      >
        {selectedTask && (
          <Stack gap="md" style={{ overflow: 'visible' }}>
            <Group grow gap="md">
              <Select
                label="Проєкт"
                data={activeProjects.map((p) => ({ value: p.id, label: p.name }))}
                value={draftProjectId}
                onChange={(val) => {
                  if (val) {
                    setDraftProjectId(val);
                    // Reset designer if they are not in the new project
                    const proj = projects.find((p) => p.id === val);
                    if (proj && draftDesignerId && !proj.memberIds.includes(draftDesignerId)) {
                      setDraftDesignerId(null);
                    }
                  }
                }}
                required
              />

              <Select
                label="Виконавець (Дизайнер)"
                data={[
                  { value: '', label: 'Не призначено' },
                  ...users
                    .filter((u) => {
                      const proj = projects.find((p) => p.id === draftProjectId);
                      return proj ? proj.memberIds.includes(u.id) : false;
                    })
                    .map((d) => ({
                      value: d.id,
                      label: `${d.name} ${getDesignerHoursInfo(d.id, draftProjectId)}`
                    }))
                ]}
                value={draftDesignerId || ''}
                onChange={(val) => setDraftDesignerId(val || null)}
                placeholder="Виберіть виконавця"
              />
            </Group>

            {/* Inline Project creation helper */}
            <Group justify="flex-start">
              <Button
                variant="subtle"
                color="indigo"
                size="xs"
                leftSection={<IconFolderPlus size={14} />}
                onClick={() => setNewProjectModalOpened(true)}
              >
                Створити новий проєкт
              </Button>
            </Group>

            {/* Description HTML contenteditable visual editor */}
            <Text fw={700} size="xs" c="dimmed" mt="xs">ОПИС ЗАДАЧІ (MICRO FORMATTING)</Text>
            <Stack gap="2px">
              <Group gap="xs" style={{ border: '1px solid var(--border-color)', borderBottom: 0, padding: '6px 12px', borderTopLeftRadius: '8px', borderTopRightRadius: '8px', backgroundColor: '#f8fafc' }}>
                <Button
                  size="xs"
                  variant="subtle"
                  color="indigo"
                  onClick={() => {
                    const el = descriptionEditorRef.current;
                    if (el) {
                      document.execCommand('bold', false);
                      setDraftDesc(el.innerHTML);
                    }
                  }}
                  style={{ height: '24px', padding: '0 6px' }}
                >
                  <strong>B</strong>
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  color="indigo"
                  onClick={() => {
                    const el = descriptionEditorRef.current;
                    if (el) {
                      document.execCommand('italic', false);
                      setDraftDesc(el.innerHTML);
                    }
                  }}
                  style={{ height: '24px', padding: '0 6px' }}
                >
                  <em>I</em>
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  color="indigo"
                  onClick={() => {
                    const el = descriptionEditorRef.current;
                    if (el) {
                      document.execCommand('insertUnorderedList', false);
                      setDraftDesc(el.innerHTML);
                    }
                  }}
                  style={{ height: '24px', padding: '0 6px' }}
                >
                  • Список
                </Button>
              </Group>
              <div
                ref={descriptionEditorRef}
                contentEditable
                onBlur={(e) => setDraftDesc(e.currentTarget.innerHTML)}
                dangerouslySetInnerHTML={{ __html: selectedTask.description || '' }}
                style={{
                  minHeight: '120px',
                  border: '1px solid var(--border-color)',
                  borderBottomLeftRadius: '8px',
                  borderBottomRightRadius: '8px',
                  padding: '12px',
                  outline: 'none',
                  backgroundColor: '#ffffff',
                  fontSize: '14px',
                  lineHeight: 1.5
                }}
              />
            </Stack>

            <Divider my="sm" />

            {/* Attachments Section */}
            <Group justify="space-between" align="center">
              <Text fw={700} size="sm" c="dimmed">ФАЙЛИ ТА ВКЛАДЕННЯ</Text>
              <FileButton
                onChange={(file) => {
                  if (file) {
                    // Simulating a dummy link to make it work offline or in SQLite
                    const fileUrl = URL.createObjectURL(file);
                    onAddAttachment(selectedTask.id, file.name, fileUrl);
                  }
                }}
              >
                {(props) => (
                  <Button {...props} size="xs" variant="light" color="indigo" leftSection={<IconPaperclip size={14} />}>
                    Додати файл
                  </Button>
                )}
              </FileButton>
            </Group>

            <Stack gap="xs">
              {attachments
                .filter((a) => a.taskId === selectedTask.id)
                .map((attach) => (
                  <Group key={attach.id} justify="space-between" wrap="nowrap" style={{ padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <Group gap="sm" wrap="nowrap">
                      <IconFile size={16} color="var(--primary-color)" />
                      <Text size="xs" fw={600} style={{ wordBreak: 'break-all' }}>{attach.fileName}</Text>
                    </Group>
                    <Group gap="xs" style={{ flexShrink: 0 }}>
                      <Anchor href={attach.fileUrl} target="_blank" download>
                        <ActionIcon size="sm" variant="subtle" color="indigo">
                          <IconExternalLink size={14} />
                        </ActionIcon>
                      </Anchor>
                      <ActionIcon size="sm" variant="subtle" color="red" onClick={() => onDeleteAttachment(attach.id)}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  </Group>
                ))}
              {attachments.filter((a) => a.taskId === selectedTask.id).length === 0 && (
                <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>Немає доданих файлів</Text>
              )}
            </Stack>

            <Divider my="sm" />

            {/* External Links Section */}
            <Text fw={700} size="sm" c="dimmed">ВНЕШНІ ПОСИЛАННЯ</Text>
            <Group grow gap="xs" align="flex-end">
              <TextInput
                placeholder="Назва (напр., Макет Figma)"
                value={newLinkTitle}
                onChange={(e) => setNewLinkTitle(e.currentTarget.value)}
                size="xs"
              />
              <TextInput
                placeholder="URL посилання"
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.currentTarget.value)}
                size="xs"
              />
              <Button
                size="xs"
                color="indigo"
                onClick={() => {
                  if (newLinkUrl.trim()) {
                    onAddLink(
                      selectedTask.id,
                      newLinkUrl.trim(),
                      newLinkTitle.trim() || newLinkUrl.trim()
                    );
                    setNewLinkUrl('');
                    setNewLinkTitle('');
                  }
                }}
                style={{ flexGrow: 0 }}
              >
                Додати
              </Button>
            </Group>

            <Stack gap="xs" mt="xs">
              {links
                .filter((l) => l.taskId === selectedTask.id)
                .map((link) => (
                  <Group key={link.id} justify="space-between" wrap="nowrap" style={{ padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <Group gap="sm" wrap="nowrap">
                      <IconLink size={16} color="var(--primary-color)" />
                      <Anchor href={link.url} target="_blank" size="xs" fw={600} style={{ wordBreak: 'break-all' }}>
                        {link.title}
                      </Anchor>
                    </Group>
                    <ActionIcon size="sm" variant="subtle" color="red" onClick={() => onDeleteLink(link.id)} style={{ flexShrink: 0 }}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                ))}
              {links.filter((l) => l.taskId === selectedTask.id).length === 0 && (
                <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>Немає доданих посилань</Text>
              )}
            </Stack>

            <Divider my="sm" />

            {/* Actions bottom */}
            <Group justify="space-between">
              <Button
                color="red"
                variant="light"
                leftSection={<IconTrash size={14} />}
                onClick={() => {
                  onDeleteCard(selectedTask.id);
                  setTaskModalOpened(false);
                  setSelectedTask(null);
                }}
              >
                Видалити задачу
              </Button>

              <Group gap="xs">
                <Button
                  variant="subtle"
                  color="gray"
                  onClick={() => {
                    setTaskModalOpened(false);
                    setSelectedTask(null);
                  }}
                >
                  Скасувати
                </Button>
                <Button color="indigo" onClick={handleSaveTaskDetails}>
                  Зберегти зміни
                </Button>
              </Group>
            </Group>
          </Stack>
        )}
      </Modal>

      {/* 4. Modal: Project Creation from Kanban Details */}
      <Modal
        opened={newProjectModalOpened}
        onClose={() => setNewProjectModalOpened(false)}
        title={
          <Group gap="xs">
            <IconNotebook size={20} color="var(--primary-color)" />
            <Text fw={800} size="md">
              Створення нового проєкту
            </Text>
          </Group>
        }
        centered
        radius="md"
      >
        <form onSubmit={handleCreateProjectSubmit}>
          <Stack gap="md">
            <TextInput
              label="Назва проєкту"
              placeholder="Наприклад: Редизайн сайту"
              value={newProjName}
              onChange={(e) => setNewProjName(e.currentTarget.value)}
              required
            />

            <ColorInput
              label="Колір проєкту"
              value={newProjColor}
              onChange={setNewProjColor}
              swatches={['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#8b5cf6']}
              required
            />

            <Divider my="xs" label="УЧАСНИКИ ПРОЄКТУ" labelPosition="center" />
            <Text size="xs" c="dimmed">
              Виберіть дизайнерів, які будуть задіяні на цьому проєкті:
            </Text>

            <Stack gap="xs" style={{ maxHeight: '180px', overflowY: 'auto' }}>
              {activeDesigners.map((user) => {
                const isSelected = newProjMembers.includes(user.id);
                return (
                  <Checkbox
                    key={user.id}
                    label={user.name}
                    checked={isSelected}
                    onChange={(e) => {
                      if (e.currentTarget.checked) {
                        setNewProjMembers((prev) => [...prev, user.id]);
                      } else {
                        setNewProjMembers((prev) => prev.filter((id) => id !== user.id));
                      }
                    }}
                  />
                );
              })}
            </Stack>

            <Group justify="flex-end" gap="xs" mt="md">
              <Button variant="subtle" color="gray" onClick={() => setNewProjectModalOpened(false)}>
                Скасувати
              </Button>
              <Button type="submit" color="indigo">
                Створити проєкт
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </div>
  );
};

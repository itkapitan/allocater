import React, { useState, useRef, useEffect } from 'react';
import EditorJS from '@editorjs/editorjs';
// @ts-ignore
import List from '@editorjs/list';
// @ts-ignore
import ImageTool from '@editorjs/image';
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
  Divider,
  ColorInput
} from '@mantine/core';
import {
  IconPlus,
  IconTrash,
  IconPencil,
  IconNotebook,
  IconLink,
  IconPaperclip
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
  weekDays: Date[];
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
  weekDays,
  onAddColumn,
  onUpdateColumn,
  onDeleteColumn,
  onAddCard,
  onUpdateCard,
  onDeleteCard,
  onAddAttachment: _onAddAttachment,
  onDeleteAttachment: _onDeleteAttachment,
  onAddLink: _onAddLink,
  onDeleteLink: _onDeleteLink,
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

  // Edit mode flags for modal fields
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState(false);
  const [editingDesignerId, setEditingDesignerId] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);

  // Autosave handler
  const handleAutosave = (overrideFields?: any) => {
    if (!selectedTask) return;
    const updatedFields = {
      title: draftTitle,
      description: draftDesc,
      projectId: draftProjectId,
      designerId: draftDesignerId || null,
      ...overrideFields
    };

    onUpdateCard(selectedTask.id, updatedFields);
    setSelectedTask((prev: any) => prev ? { ...prev, ...updatedFields } : null);
  };

  // Client-side image WebP converter and compressor (zero dependencies, works on any platform)
  const compressAndConvertToWebp = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          const maxDimension = 1920;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const webpDataUrl = canvas.toDataURL('image/webp', 0.8);
            resolve(webpDataUrl);
          } else {
            resolve(e.target?.result as string);
          }
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  };

  // Convert File object to raw base64 string (fallback if Canvas compression fails)
  const getRawBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  };

  // Convert HTML or plain text descriptions into Editor.js blocks
  const parseDescriptionToEditorData = (desc: string) => {
    if (!desc) {
      return { blocks: [] };
    }
    const trimmed = desc.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        return JSON.parse(trimmed);
      } catch (e) {
        // Fallback
      }
    }
    return {
      blocks: [
        {
          type: 'paragraph',
          data: {
            text: desc
          }
        }
      ]
    };
  };

  // Extract clean plain text summary for task preview cards
  const getPlainTextFromDescription = (desc: string): string => {
    if (!desc) return '';
    const trimmed = desc.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const data = JSON.parse(trimmed);
        if (data && data.blocks) {
          const textParts: string[] = [];
          data.blocks.forEach((block: any) => {
            if (block.type === 'paragraph' || block.type === 'header') {
              textParts.push(block.data?.text || '');
            } else if (block.type === 'list') {
              const items = block.data?.items || [];
              items.forEach((item: any) => {
                if (typeof item === 'string') {
                  textParts.push(item);
                } else if (item && typeof item === 'object') {
                  textParts.push(item.content || '');
                }
              });
            }
          });
          const combined = textParts.join(' ');
          return combined.replace(/<[^>]*>/g, '');
        }
      } catch (e) {
        // Fallback
      }
    }
    return trimmed.replace(/<[^>]*>/g, '');
  };

  // Render Editor.js JSON data in View Mode (handles standard and nested lists recursively)
  const renderEditorJSData = (jsonStr: string) => {
    if (!jsonStr) {
      return (
        <Text c="dimmed" style={{ fontStyle: 'italic' }}>
          Немає опису. Натисніть тут, щоб додати деталі...
        </Text>
      );
    }
    
    let data;
    const trimmed = jsonStr.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        data = JSON.parse(trimmed);
      } catch (e) {
        // Fallback
      }
    }

    if (!data || !data.blocks || data.blocks.length === 0) {
      return (
        <div 
          dangerouslySetInnerHTML={{ __html: jsonStr }} 
          style={{ wordBreak: 'break-word', color: 'var(--text-main)', fontSize: '14px', lineHeight: 1.6 }} 
        />
      );
    }

    return (
      <div className="editorjs-content" style={{ color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {data.blocks.map((block: any, idx: number) => {
          switch (block.type) {
            case 'paragraph':
              return (
                <Text 
                  key={idx} 
                  size="sm" 
                  style={{ lineHeight: 1.6, wordBreak: 'break-word' }}
                  dangerouslySetInnerHTML={{ __html: block.data.text }}
                />
              );
            case 'header':
              const level = block.data.level || 2;
              const fontSize = level === 1 ? '22px' : level === 2 ? '18px' : '16px';
              return (
                <Text 
                  key={idx} 
                  fw={700} 
                  style={{ fontSize, marginTop: '8px', marginBottom: '4px' }}
                  dangerouslySetInnerHTML={{ __html: block.data.text }}
                />
              );
            case 'list': {
              const isNumbered = block.data.style === 'ordered';
              const ListTag = isNumbered ? 'ol' : 'ul';
              
              const renderListItems = (items: any[]) => {
                return items.map((item: any, itemIdx: number) => {
                  if (typeof item === 'string') {
                    return (
                      <li key={itemIdx} dangerouslySetInnerHTML={{ __html: item }} style={{ marginBottom: '4px' }} />
                    );
                  } else if (item && typeof item === 'object') {
                    const content = item.content || '';
                    const subItems = item.items || [];
                    return (
                      <li key={itemIdx} style={{ marginBottom: '4px' }}>
                        <span dangerouslySetInnerHTML={{ __html: content }} />
                        {subItems.length > 0 && (
                          <ListTag style={{ paddingLeft: '20px', marginTop: '4px', listStyleType: isNumbered ? 'decimal' : 'disc' }}>
                            {renderListItems(subItems)}
                          </ListTag>
                        )}
                      </li>
                    );
                  }
                  return null;
                });
              };

              return (
                <ListTag 
                  key={idx} 
                  style={{ 
                    paddingLeft: '24px', 
                    margin: '4px 0', 
                    listStyleType: isNumbered ? 'decimal' : 'disc',
                    lineHeight: 1.6,
                    fontSize: '14px'
                  }}
                >
                  {renderListItems(block.data.items || [])}
                </ListTag>
              );
            }
            case 'image':
              const imgUrl = block.data.file?.url || '';
              const caption = block.data.caption || '';
              return (
                <div key={idx} style={{ margin: '12px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <img 
                    src={imgUrl} 
                    alt={caption} 
                    style={{ 
                      maxWidth: '100%', 
                      borderRadius: '8px', 
                      boxShadow: 'var(--shadow-sm)',
                      display: 'block',
                      height: 'auto'
                    }} 
                  />
                  {caption && (
                    <Text size="xs" c="dimmed" mt="xs" style={{ fontStyle: 'italic', textAlign: 'center' }}>
                      {caption}
                    </Text>
                  )}
                </div>
              );
            default:
              return null;
          }
        })}
      </div>
    );
  };

  const editorInstanceRef = useRef<EditorJS | null>(null);

  useEffect(() => {
    if (editingDesc) {
      const timer = setTimeout(() => {
        const container = document.getElementById('editorjs-container');
        if (!container) return;

        const editor = new EditorJS({
          holder: 'editorjs-container',
          data: parseDescriptionToEditorData(draftDesc),
          tools: {
            list: {
              class: List,
              inlineToolbar: true,
              config: {
                defaultStyle: 'unordered'
              }
            },
            image: {
              class: ImageTool,
              config: {
                uploader: {
                  uploadByFile(file: File) {
                    return compressAndConvertToWebp(file)
                      .catch((err) => {
                        console.warn('WebP compression failed, uploading raw file instead:', err);
                        return getRawBase64(file);
                      })
                      .then((base64) => {
                        return fetch('/api/upload', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ image: base64 })
                        });
                      })
                      .then((res) => {
                        if (!res.ok) {
                          throw new Error(`Upload server error: ${res.status}`);
                        }
                        return res.json();
                      })
                      .then((data) => {
                        if (data && data.url) {
                          return {
                            success: 1,
                            file: {
                              url: data.url
                            }
                          };
                        }
                        throw new Error('No URL returned from upload server');
                      })
                      .catch((err) => {
                        console.error('Image upload failed:', err);
                        return { success: 0 };
                      });
                  }
                }
              }
            }
          },
          placeholder: 'Введіть опис задачі тут...',
          minHeight: 120
        });

        editorInstanceRef.current = editor;
      }, 50);

      return () => {
        clearTimeout(timer);
        if (editorInstanceRef.current) {
          try {
            editorInstanceRef.current.destroy();
          } catch (e) {
            console.error('Error destroying EditorJS:', e);
          }
          editorInstanceRef.current = null;
        }
      };
    }
  }, [editingDesc]);

  const handleSaveDescription = async () => {
    if (editorInstanceRef.current) {
      try {
        const savedData = await editorInstanceRef.current.save();
        const jsonStr = JSON.stringify(savedData);
        setDraftDesc(jsonStr);
        handleAutosave({ description: jsonStr });
        setEditingDesc(false);
      } catch (error) {
        console.error('Saving editor data failed: ', error);
      }
    }
  };

  // Open Task details modal
  const handleOpenTask = (task: any) => {
    setSelectedTask(task);
    setDraftTitle(task.title);
    setDraftDesc(task.description || '');
    setDraftProjectId(task.projectId);
    setDraftDesignerId(task.designerId);

    const isNew = task.title === 'Нова задача';
    setEditingTitle(isNew);
    setEditingProjectId(isNew);
    setEditingDesignerId(isNew);
    setEditingDesc(false);

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

  // Format total hours allocated to designer for a project this week (sprint)
  const getDesignerHoursInfo = (designerId: string | null, projectId: string) => {
    if (!designerId) return '';
    
    const workingDays = weekDays.slice(0, 5); // Monday to Friday
    let totalSprintHours = 0;

    workingDays.forEach((day) => {
      const year = day.getFullYear();
      const month = String(day.getMonth() + 1).padStart(2, '0');
      const date = String(day.getDate()).padStart(2, '0');
      const dayStr = `${year}-${month}-${date}`;

      allocations
        .filter((a) => a.designerId === designerId && a.projectId === projectId)
        .forEach((alloc) => {
          const start = new Date(alloc.startDate);
          start.setHours(0,0,0,0);
          const end = new Date(alloc.endDate);
          end.setHours(0,0,0,0);
          const current = new Date(dayStr);
          current.setHours(0,0,0,0);
          
          if (current >= start && current <= end) {
            const durationDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            totalSprintHours += alloc.hours / durationDays;
          }
        });
    });

    const hours = Math.round(totalSprintHours * 10) / 10;
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
                                              {getPlainTextFromDescription(task.description)}
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
          handleSaveTaskDetails();
        }}
        title={
          editingTitle ? (
            <TextInput
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.currentTarget.value)}
              onBlur={() => {
                setEditingTitle(false);
                handleAutosave({ title: draftTitle });
              }}
              autoFocus
              variant="unstyled"
              styles={{ input: { fontSize: '18px', fontWeight: 800, padding: 0, borderBottom: '1px solid var(--primary-color)' } }}
              style={{ width: '350px' }}
            />
          ) : (
            <Text
              fw={800}
              size="lg"
              style={{
                fontSize: '18px',
                fontFamily: 'var(--font-family)',
                color: 'var(--text-main)',
                cursor: 'pointer',
                padding: '2px 4px',
                borderRadius: '4px',
                border: '1px dashed transparent',
              }}
              onClick={() => setEditingTitle(true)}
              title="Натисніть для редагування заголовка"
            >
              {draftTitle || 'Нова задача'}
            </Text>
          )
        }
        centered
        size="lg"
        radius="md"
      >
        {selectedTask && (() => {
          const currentProject = projects.find((p) => p.id === draftProjectId);
          const currentProjectName = currentProject ? currentProject.name : 'Не обрано';
          const currentProjectColor = currentProject ? currentProject.color : 'indigo';
          const currentDesigner = users.find((u) => u.id === draftDesignerId);

          return (
            <Stack gap="md" style={{ overflow: 'visible' }}>
              <Group grow gap="md">
                {/* Project Field (View / Edit inside the same box to prevent layout shift) */}
                <div 
                  onClick={() => setEditingProjectId(true)} 
                  style={{ 
                    cursor: 'pointer', 
                    padding: '8px 12px', 
                    borderRadius: '8px', 
                    border: '1px solid var(--border-color)', 
                    backgroundColor: '#ffffff',
                    height: '62px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    transition: 'border-color 0.2s'
                  }}
                  title="Натисніть, щоб змінити проєкт"
                >
                  <Text size="xs" fw={700} c="dimmed" mb="2px">ПРОЄКТ</Text>
                  {editingProjectId ? (
                    <Select
                      data={[
                        { value: 'CREATE_NEW', label: '+ Створити новий проєкт' },
                        ...activeProjects.map((p) => ({ value: p.id, label: p.name }))
                      ]}
                      value={draftProjectId}
                      onChange={(val) => {
                        if (val === 'CREATE_NEW') {
                          setNewProjectModalOpened(true);
                          setEditingProjectId(false);
                          return;
                        }
                        if (val) {
                          setDraftProjectId(val);
                          const proj = projects.find((p) => p.id === val);
                          let nextDesignerId = draftDesignerId;
                          if (proj && draftDesignerId && !proj.memberIds.includes(draftDesignerId)) {
                            nextDesignerId = null;
                            setDraftDesignerId(null);
                          }
                          handleAutosave({ projectId: val, designerId: nextDesignerId });
                          setEditingProjectId(false);
                        }
                      }}
                      onBlur={() => setEditingProjectId(false)}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      searchable
                      placeholder="Пошук проєкту..."
                      variant="unstyled"
                      styles={{ 
                        input: { height: '24px', minHeight: '24px', padding: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' },
                        dropdown: { zIndex: 1000 }
                      }}
                    />
                  ) : (
                    <Group gap="xs" style={{ height: '24px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: currentProjectColor || 'indigo' }} />
                      <Text size="sm" fw={600} truncate>{currentProjectName}</Text>
                    </Group>
                  )}
                </div>

                {/* Assignee Field (View / Edit inside the same box to prevent layout shift) */}
                <div 
                  onClick={() => setEditingDesignerId(true)} 
                  style={{ 
                    cursor: 'pointer', 
                    padding: '8px 12px', 
                    borderRadius: '8px', 
                    border: '1px solid var(--border-color)', 
                    backgroundColor: '#ffffff',
                    height: '62px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    transition: 'border-color 0.2s'
                  }}
                  title="Натисніть, щоб змінити виконавця"
                >
                  <Text size="xs" fw={700} c="dimmed" mb="2px">ВИКОНАВЕЦЬ</Text>
                  {editingDesignerId ? (
                    <Select
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
                      onChange={(val) => {
                        const designerId = val || null;
                        setDraftDesignerId(designerId);
                        handleAutosave({ designerId });
                        setEditingDesignerId(false);
                      }}
                      onBlur={() => setEditingDesignerId(false)}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      variant="unstyled"
                      styles={{ 
                        input: { height: '24px', minHeight: '24px', padding: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' },
                        dropdown: { zIndex: 1000 }
                      }}
                      renderOption={({ option }) => {
                        if (!option.value) {
                          return <Text size="sm">{option.label}</Text>;
                        }
                        const designer = users.find((u) => u.id === option.value);
                        if (!designer) {
                          return <Text size="sm">{option.label}</Text>;
                        }
                        const isBase64 = designer.avatar && (designer.avatar.startsWith('data:image/') || designer.avatar.startsWith('http') || designer.avatar.startsWith('/'));
                        return (
                          <Group gap="xs" wrap="nowrap">
                            <Avatar size="xs" src={isBase64 ? designer.avatar : undefined} color="indigo" radius="xl">
                              {!isBase64 && designer.avatar}
                            </Avatar>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <Text size="sm" fw={600} truncate>{designer.name}</Text>
                              <Text size="10px" c="dimmed" truncate>{designer.role} {getDesignerHoursInfo(designer.id, draftProjectId)}</Text>
                            </div>
                          </Group>
                        );
                      }}
                    />
                  ) : (
                    <div style={{ height: '24px', display: 'flex', alignItems: 'center' }}>
                      {currentDesigner ? (
                        <Group gap="xs" wrap="nowrap">
                          {(() => {
                            const isBase64 = currentDesigner.avatar && (currentDesigner.avatar.startsWith('data:image/') || currentDesigner.avatar.startsWith('http') || currentDesigner.avatar.startsWith('/'));
                            return (
                              <Avatar size="xs" src={isBase64 ? currentDesigner.avatar : undefined} color="indigo" radius="xl">
                                {!isBase64 && currentDesigner.avatar}
                              </Avatar>
                            );
                          })()}
                          <Text size="sm" fw={600} truncate>{currentDesigner.name}</Text>
                          <Text size="10px" c="dimmed" style={{ flexShrink: 0 }}>
                            ({getDesignerHoursInfo(currentDesigner.id, draftProjectId).split(' ').shift()} год)
                          </Text>
                        </Group>
                      ) : (
                        <Text size="sm" fw={600} c="dimmed">Не призначено</Text>
                      )}
                    </div>
                  )}
                </div>
              </Group>

              {/* Description HTML contenteditable visual editor (View / Edit) */}
              <Text fw={700} size="xs" c="dimmed" mt="xs">ОПИС ЗАДАЧІ</Text>
              
              {editingDesc ? (
                <Stack gap="xs">
                  <div 
                    id="editorjs-container" 
                    style={{ 
                      borderRadius: '8px', 
                      border: '1px solid var(--border-color)', 
                      padding: '12px 16px',
                      backgroundColor: '#ffffff',
                      minHeight: '160px',
                      maxHeight: '400px',
                      overflowY: 'auto'
                    }} 
                  />

                  <Group justify="flex-end" gap="xs">
                    <Button
                      size="xs"
                      variant="subtle"
                      color="gray"
                      onClick={() => {
                        setEditingDesc(false);
                      }}
                    >
                      Скасувати
                    </Button>
                    <Button
                      size="xs"
                      color="indigo"
                      onClick={handleSaveDescription}
                    >
                      Зберегти опис
                    </Button>
                  </Group>
                </Stack>
              ) : (
                <div 
                  onClick={() => setEditingDesc(true)}
                  style={{
                    minHeight: '120px',
                    cursor: 'pointer',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: '#fafbfc',
                    transition: 'background-color 0.2s'
                  }}
                  className="hover-editable-desc"
                  title="Натисніть для редагування опису"
                >
                  {renderEditorJSData(draftDesc)}
                </div>
              )}

              <Divider my="xs" />

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
                  Виделити задачу
                </Button>

                <Button 
                  color="indigo" 
                  onClick={handleSaveTaskDetails}
                >
                  Закрити
                </Button>
              </Group>
            </Stack>
          );
        })()}
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

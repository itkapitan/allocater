import React, { useState } from 'react';
import { Group, TextInput, Button, Text, Stack, ActionIcon, Select, ColorInput } from '@mantine/core';
import { IconPlus, IconX, IconFolder } from '@tabler/icons-react';
import type { User, Project } from '../types';

interface AddProjectRowProps {
  users: User[];
  projects: Project[];
  onAddProject: (
    name: string,
    color: string,
    memberIds: string[],
    existingProjectId?: string,
    taskNumber?: string,
    figmaLink?: string
  ) => void;
}

const resolveProjectColor = (color: string | undefined): string => {
  if (!color) return '#6366f1';
  const mapping: Record<string, string> = {
    indigo: '#6366f1',
    blue: '#3b82f6',
    teal: '#0d9488',
    emerald: '#10b981',
    orange: '#f59e0b',
    rose: '#f43f5e',
  };
  return mapping[color.toLowerCase()] || color;
};

export const AddProjectRow: React.FC<AddProjectRowProps> = ({ users, projects, onAddProject }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('new');
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [taskNumber, setTaskNumber] = useState('');
  const [figmaLink, setFigmaLink] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const handleMemberToggle = (userId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleProjectSelectChange = (val: string | null) => {
    const value = val || 'new';
    setSelectedProjectId(value);
    if (value === 'new') {
      setName('');
      setSelectedMembers([]);
      setColor('#6366f1');
      setTaskNumber('');
      setFigmaLink('');
    } else {
      const existingProject = projects.find((p) => p.id === value);
      if (existingProject) {
        setName(existingProject.name);
        setSelectedMembers(existingProject.memberIds || []);
        setColor(resolveProjectColor(existingProject.color));
        setTaskNumber(existingProject.taskNumber || '');
        setFigmaLink(existingProject.figmaLink || '');
      }
    }
  };

  const handleSave = () => {
    if (!name.trim()) return;
    if (selectedProjectId === 'new') {
      onAddProject(name.trim(), color, selectedMembers, undefined, taskNumber.trim(), figmaLink.trim());
    } else {
      onAddProject(name.trim(), color, selectedMembers, selectedProjectId, taskNumber.trim(), figmaLink.trim());
    }
    setName('');
    setSelectedMembers([]);
    setColor('#6366f1');
    setTaskNumber('');
    setFigmaLink('');
    setSelectedProjectId('new');
    setIsExpanded(false);
  };

  const getAvatarColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 60%, 45%)`;
  };

  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleExpand = () => {
    setIsExpanded(true);
    setTimeout(() => {
      inputRef.current?.focus();
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
      });
    }, 50);
  };

  if (!isExpanded) {
    return (
      <div className="add-project-bar" onClick={handleExpand}>
        <IconPlus size={20} />
        <span>Додати новий проєкт</span>
      </div>
    );
  }

  // Build the list of projects for Select dropdown
  const selectData = [
    { value: 'new', label: '+ Створити новий проєкт' },
    ...projects.map((p) => ({
      value: p.id,
      label: `${p.name}${p.isArchived ? ' (в архіві)' : ''}`,
    })),
  ];

  return (
    <div className="add-project-form-container">
      <Group justify="space-between" mb="md">
        <Text fw={800} size="lg" style={{ fontFamily: 'var(--font-family)' }}>Створення нового проєкту</Text>
        <ActionIcon variant="subtle" color="gray" onClick={() => setIsExpanded(false)}>
          <IconX size={20} />
        </ActionIcon>
      </Group>

      <Stack gap="md">
        <Select
          label="Оберіть проєкт"
          placeholder="Оберіть зі списку або створіть новий"
          value={selectedProjectId}
          onChange={handleProjectSelectChange}
          data={selectData}
          searchable
          clearable={false}
          radius="md"
          leftSection={<IconFolder size={16} color="var(--primary-color)" />}
        />

        {selectedProjectId === 'new' ? (
          <TextInput
            ref={inputRef}
            label="Назва проєкту"
            placeholder="Введіть назву (наприклад: Master ЛК)"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            required
            radius="md"
          />
        ) : (
          <TextInput
            label="Редагувати назву проєкту"
            placeholder="Введіть назву"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            required
            radius="md"
          />
        )}

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', minWidth: '150px' }}>
            <ColorInput
              label="Колір проєкту"
              value={color}
              onChange={setColor}
              swatches={['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#8b5cf6']}
              required
              radius="md"
            />
          </div>
          <div style={{ flex: '1 1 200px', minWidth: '150px' }}>
            <TextInput
              label="Номер задачі"
              placeholder="Наприклад: 12345"
              value={taskNumber}
              onChange={(e) => setTaskNumber(e.currentTarget.value)}
              radius="md"
            />
          </div>
          <div style={{ flex: '1 1 200px', minWidth: '150px' }}>
            <TextInput
              label="Посилання на макет"
              placeholder="Посилання на Figma"
              value={figmaLink}
              onChange={(e) => setFigmaLink(e.currentTarget.value)}
              radius="md"
            />
          </div>
        </div>

        <div>
          <Text fw={600} size="sm" mb="xs" style={{ fontFamily: 'var(--font-family)' }}>Команда проєкту</Text>
          <div className="user-checkbox-grid">
            {users.map((user) => {
              const isSelected = selectedMembers.includes(user.id);
              return (
                <div
                  key={user.id}
                  className={`user-checkbox-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleMemberToggle(user.id)}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}} // Controlled by card click
                    style={{ cursor: 'pointer' }}
                  />
                  {(() => {
                    const isBase64Image = user.avatar && (user.avatar.startsWith('data:image/') || user.avatar.startsWith('http') || user.avatar.startsWith('/'));
                    return (
                      <div
                        className="project-member-avatar"
                        style={{
                          backgroundColor: isBase64Image ? 'transparent' : getAvatarColor(user.name),
                          backgroundImage: isBase64Image ? `url(${user.avatar})` : undefined,
                          width: '28px',
                          height: '28px',
                          fontSize: '11px',
                        }}
                      >
                        {!isBase64Image && user.avatar}
                      </div>
                    );
                  })()}
                  <div style={{ flexGrow: 1, minWidth: 0 }}>
                    <Text fw={600} size="xs" truncate style={{ color: 'var(--text-main)' }}>
                      {user.name}
                    </Text>
                    <Text size="10px" c="dimmed" truncate>
                      {user.role}
                    </Text>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Group justify="flex-end" mt="md">
          <Button variant="subtle" color="gray" onClick={() => setIsExpanded(false)}>
            Скасувати
          </Button>
          <Button 
            color="indigo" 
            onClick={handleSave} 
            disabled={selectedProjectId === 'new' ? !name.trim() : false}
          >
            {selectedProjectId === 'new' ? 'Створити проєкт' : 'Додати/Розархівувати проєкт'}
          </Button>
        </Group>
      </Stack>
    </div>
  );
};

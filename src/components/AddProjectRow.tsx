import React, { useState } from 'react';
import { Group, TextInput, Button, Text, Stack, ActionIcon } from '@mantine/core';
import { IconPlus, IconX } from '@tabler/icons-react';
import type { User } from '../types';

interface AddProjectRowProps {
  users: User[];
  onAddProject: (name: string, color: string, memberIds: string[]) => void;
}

export const AddProjectRow: React.FC<AddProjectRowProps> = ({ users, onAddProject }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [name, setName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const handleMemberToggle = (userId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onAddProject(name.trim(), 'indigo', selectedMembers);
    setName('');
    setSelectedMembers([]);
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

  if (!isExpanded) {
    return (
      <div className="add-project-bar" onClick={() => setIsExpanded(true)}>
        <IconPlus size={20} />
        <span>Додати новий проєкт</span>
      </div>
    );
  }

  return (
    <div className="add-project-form-container">
      <Group justify="space-between" mb="md">
        <Text fw={800} size="lg" style={{ fontFamily: 'var(--font-family)' }}>Створення нового проєкту</Text>
        <ActionIcon variant="subtle" color="gray" onClick={() => setIsExpanded(false)}>
          <IconX size={20} />
        </ActionIcon>
      </Group>

      <Stack gap="md">
        <TextInput
          label="Назва проєкту"
          placeholder="Введіть назву (наприклад: Master ЛК)"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
        />

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
                    const isBase64Image = user.avatar && (user.avatar.startsWith('data:image/') || user.avatar.startsWith('http'));
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
          <Button color="indigo" onClick={handleSave} disabled={!name.trim()}>
            Створити проєкт
          </Button>
        </Group>
      </Stack>
    </div>
  );
};

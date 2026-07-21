import React, { useState } from "react";
import {
  Drawer,
  Button,
  TextInput,
  Checkbox,
  Group,
  Stack,
  Text,
  Card,
  ActionIcon,
  Divider,
  Badge,
  FileInput,
} from "@mantine/core";
import {
  IconTrash,
  IconUserPlus,
  IconLock,
  IconUpload,
  IconPencil,
  IconX,
} from "@tabler/icons-react";
import type { User } from "../types";

interface ManageUsersDrawerProps {
  opened: boolean;
  onClose: () => void;
  users: User[];
  onAddUser: (user: Omit<User, "id">) => void;
  onEditUser: (user: User) => void;
  onDeleteUser: (id: string) => void;
  isAdmin: boolean;
}

export const ManageUsersDrawer: React.FC<ManageUsersDrawerProps> = ({
  opened,
  onClose,
  users,
  onAddUser,
  onEditUser,
  onDeleteUser,
  isAdmin,
}) => {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [isDesigner, setIsDesigner] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState("indigo");

  const colorOptions = [
    { value: 'indigo', label: 'Indigo', hex: '#6366f1' },
    { value: 'blue', label: 'Blue', hex: '#3b82f6' },
    { value: 'teal', label: 'Teal', hex: '#0d9488' },
    { value: 'emerald', label: 'Green', hex: '#10b981' },
    { value: 'orange', label: 'Orange', hex: '#f59e0b' },
    { value: 'rose', label: 'Pink', hex: '#f43f5e' },
  ];

  // Edit mode state
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Core designers that should not be deleted to keep system calculations stable
  const coreDesignerIds = ["1", "2", "3"];

  const handleFileChange = (file: File | null) => {
    setAvatarFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setAvatarBase64(null);
    }
  };

  const handleStartEdit = (user: User) => {
    if (!isAdmin) return;
    setEditingUser(user);
    setName(user.name);
    setRole(user.role);
    setIsDesigner(user.isDesigner);
    setSelectedColor(user.color || "indigo");
    setAvatarFile(null);

    const isBase64 =
      user.avatar &&
      (user.avatar.startsWith("data:image/") || user.avatar.startsWith("http"));
    setAvatarBase64(isBase64 ? user.avatar : null);
  };

  const handleCancelEdit = () => {
    setEditingUser(null);
    setName("");
    setRole("");
    setIsDesigner(false);
    setSelectedColor("indigo");
    setAvatarFile(null);
    setAvatarBase64(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!name.trim() || !role.trim()) return;

    // Generate initials for avatar if no image is uploaded
    const words = name.trim().split(" ");
    let initials = words[0]?.[0] || "";
    if (words.length > 1 && words[1]) {
      initials += words[1][0];
    } else if (words[0]?.[1]) {
      initials += words[0][1];
    }
    initials = initials.toUpperCase();

    let finalAvatar = avatarBase64;
    if (!finalAvatar) {
      if (editingUser) {
        const oldIsImage =
          editingUser.avatar &&
          (editingUser.avatar.startsWith("data:image/") ||
            editingUser.avatar.startsWith("http"));
        finalAvatar = oldIsImage ? initials : editingUser.avatar;
      } else {
        finalAvatar = initials;
      }
    }

    if (editingUser) {
      onEditUser({
        id: editingUser.id,
        name: name.trim(),
        role: role.trim(),
        avatar: finalAvatar,
        isDesigner,
        color: isDesigner ? selectedColor : undefined,
      });
    } else {
      onAddUser({
        name: name.trim(),
        role: role.trim(),
        avatar: finalAvatar,
        isDesigner,
        color: isDesigner ? selectedColor : undefined,
      });
    }

    handleCancelEdit();
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
    <Drawer
      opened={opened}
      onClose={onClose}
      title={
        <Text fw={800} size="lg" style={{ fontFamily: "var(--font-family)" }}>
          Команда / Користувачі
        </Text>
      }
      position="right"
      size="md"
      styles={{
        header: {
          borderBottom: "1px solid var(--border-color)",
          paddingBottom: "16px",
        },
      }}
    >
      <Stack gap="md" mt="md">
        {isAdmin && (
          <>
            <Text fw={700} size="sm" c="dimmed">
              {editingUser
                ? "РЕДАГУВАТИ СПІВРОБІТНИКА"
                : "ДОДАТИ НОВОГО СПІВРОБІТНИКА"}
            </Text>
            <form onSubmit={handleSubmit}>
              <Stack gap="sm">
                <TextInput
                  label="Ім'я та Прізвище"
                  placeholder="Наприклад: Родіон Бичковяк"
                  value={name}
                  onChange={(e) => setName(e.currentTarget.value)}
                  required
                />
                <TextInput
                  label="Посада"
                  placeholder="Наприклад: UI/UX Designer або System Analyst"
                  value={role}
                  onChange={(e) => setRole(e.currentTarget.value)}
                  required
                />
                <FileInput
                  label="Фото профілю (Аватарка)"
                  placeholder={
                    editingUser
                      ? "Залишити поточну або вибрати нову"
                      : "Виберіть фотографію"
                  }
                  leftSection={<IconUpload size={14} />}
                  value={avatarFile}
                  onChange={handleFileChange}
                  accept="image/*"
                />
                <Checkbox
                  label="Це дизайнер (буде враховуватися в розподілі годин)"
                  checked={isDesigner}
                  onChange={(e) => setIsDesigner(e.currentTarget.checked)}
                  mt="xs"
                />
                {isDesigner && (
                  <div>
                    <Text fw={600} size="sm" mb="xs" style={{ fontFamily: 'var(--font-family)' }}>Колір дизайнера (для таймлайну)</Text>
                    <Group gap="xs">
                      {colorOptions.map((opt) => (
                        <div
                          key={opt.value}
                          className={`color-swatch-btn ${selectedColor === opt.value ? 'selected' : ''}`}
                          style={{ backgroundColor: opt.hex }}
                          onClick={() => setSelectedColor(opt.value)}
                          title={opt.label}
                        />
                      ))}
                    </Group>
                  </div>
                )}
                <Group mt="xs" style={{ width: "100%" }} wrap="nowrap">
                  {editingUser && (
                    <Button
                      variant="subtle"
                      color="gray"
                      leftSection={<IconX size={16} />}
                      onClick={handleCancelEdit}
                      style={{ flexGrow: 1 }}
                    >
                      Скасувать
                    </Button>
                  )}
                  <Button
                    type="submit"
                    leftSection={
                      editingUser ? (
                        <IconPencil size={16} />
                      ) : (
                        <IconUserPlus size={16} />
                      )
                    }
                    color="indigo"
                    style={{ flexGrow: 2 }}
                  >
                    {editingUser ? "Зберегти зміни" : "Додати в команду"}
                  </Button>
                </Group>
              </Stack>
            </form>
            <Divider my="md" label="СПИСОК КОМАНДИ" labelPosition="center" />
          </>
        )}

        {!isAdmin && (
          <Text fw={700} size="sm" c="dimmed" mb="xs">
            СПИСОК КОМАНДИ
          </Text>
        )}

        <Stack
          gap="sm"
          style={{
            maxHeight: isAdmin ? "calc(100vh - 440px)" : "calc(100vh - 160px)",
            overflowY: "auto",
            paddingRight: "4px",
          }}
        >
          {users.map((user) => {
            const isCore = coreDesignerIds.includes(user.id);
            const isBase64Image =
              user.avatar &&
              (user.avatar.startsWith("data:image/") ||
                user.avatar.startsWith("http") ||
                user.avatar.startsWith("/"));

            return (
              <Card
                key={user.id}
                withBorder
                padding="sm"
                radius="md"
                style={{ overflow: "visible" }}
              >
                <Group
                  justify="space-between"
                  wrap="nowrap"
                  style={{ width: "100%" }}
                >
                  <Group
                    gap="sm"
                    wrap="nowrap"
                    style={{ flexGrow: 1, minWidth: 0 }}
                  >
                    <div
                      className="project-member-avatar"
                      style={{
                        backgroundColor: isBase64Image
                          ? "transparent"
                          : getAvatarColor(user.name),
                        backgroundImage: isBase64Image
                          ? `url(${user.avatar})`
                          : undefined,
                        width: "38px",
                        height: "38px",
                        fontSize: "13px",
                        flexShrink: 0,
                      }}
                    >
                      {!isBase64Image && user.avatar}
                    </div>
                    <div style={{ flexGrow: 1, minWidth: 0 }}>
                      <Text
                        fw={700}
                        size="sm"
                        style={{ lineHeight: "1.2" }}
                        truncate
                      >
                        {user.name}
                      </Text>
                      <Text
                        size="xs"
                        c="dimmed"
                        style={{ lineHeight: "1.2", marginTop: "2px" }}
                        truncate
                      >
                        {user.role}
                      </Text>
                    </div>
                  </Group>

                  <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                    {user.isDesigner && (
                      <Badge color={user.color || "indigo"} variant="light" size="sm">
                        Дизайнер
                      </Badge>
                    )}

                    {isAdmin && (
                      <>
                        <ActionIcon
                          variant="light"
                          color="indigo"
                          onClick={() => handleStartEdit(user)}
                          title="Редагувати співробітника"
                        >
                          <IconPencil size={16} />
                        </ActionIcon>

                        {isCore ? (
                          <ActionIcon
                            variant="light"
                            color="gray"
                            disabled
                            title="Ключовий дизайнер (не можна видалити)"
                          >
                            <IconLock size={16} />
                          </ActionIcon>
                        ) : (
                          <ActionIcon
                            variant="light"
                            color="red"
                            onClick={() => onDeleteUser(user.id)}
                            title="Видалити з команди"
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        )}
                      </>
                    )}
                  </Group>
                </Group>
              </Card>
            );
          })}
        </Stack>
      </Stack>
    </Drawer>
  );
};

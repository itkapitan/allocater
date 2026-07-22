import React, { useState, useEffect } from "react";
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
  Modal,
  Avatar,
  ScrollArea,
} from "@mantine/core";
import {
  IconTrash,
  IconFolderPlus,
  IconPencil,
  IconX,
  IconSearch,
  IconCheck,
} from "@tabler/icons-react";
import type { User, Space } from "../types";

interface ManageSpacesDrawerProps {
  opened: boolean;
  onClose: () => void;
  users: User[];
  spaces: Space[];
  activeSpaceId: string;
  onSelectSpace: (id: string) => void;
  onAddSpace: (space: Omit<Space, "id">) => void;
  onEditSpace: (space: Space) => void;
  onDeleteSpace: (id: string) => void;
  isAdmin: boolean;
}

export const ManageSpacesDrawer: React.FC<ManageSpacesDrawerProps> = ({
  opened,
  onClose,
  users,
  spaces,
  activeSpaceId,
  onSelectSpace,
  onAddSpace,
  onEditSpace,
  onDeleteSpace,
  isAdmin,
}) => {
  // Mode states: 'list' | 'create' | 'edit'
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editingSpace, setEditingSpace] = useState<Space | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Deletion state
  const [spaceToDelete, setSpaceToDelete] = useState<Space | null>(null);

  // Reset form when changing mode
  useEffect(() => {
    if (mode === "create") {
      setName("");
      setSelectedUserIds(users.map((u) => u.id)); // Default: select all
      setSearchQuery("");
    } else if (mode === "edit" && editingSpace) {
      setName(editingSpace.name);
      setSelectedUserIds(editingSpace.memberIds);
      setSearchQuery("");
    }
  }, [mode, editingSpace, users]);

  // Clean form when closing drawer
  const handleClose = () => {
    setMode("list");
    setEditingSpace(null);
    onClose();
  };

  // Filter users by search query
  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  // Check if all visible users are selected
  const allVisibleSelected =
    filteredUsers.length > 0 &&
    filteredUsers.every((u) => selectedUserIds.includes(u.id));

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      // Add all visible users
      const toAdd = filteredUsers.map((u) => u.id);
      setSelectedUserIds((prev) => Array.from(new Set([...prev, ...toAdd])));
    } else {
      // Remove all visible users
      const toRemove = filteredUsers.map((u) => u.id);
      setSelectedUserIds((prev) => prev.filter((id) => !toRemove.includes(id)));
    }
  };

  const handleToggleUser = (userId: string, checked: boolean) => {
    if (checked) {
      setSelectedUserIds((prev) => [...prev, userId]);
    } else {
      setSelectedUserIds((prev) => prev.filter((id) => id !== userId));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!name.trim()) return;

    if (mode === "create") {
      onAddSpace({
        name: name.trim(),
        memberIds: selectedUserIds,
      });
    } else if (mode === "edit" && editingSpace) {
      onEditSpace({
        id: editingSpace.id,
        name: name.trim(),
        memberIds: selectedUserIds,
      });
    }

    setMode("list");
    setEditingSpace(null);
  };

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
      onClose={handleClose}
      title={
        <Text fw={800} size="lg" style={{ fontFamily: "var(--font-family)" }}>
          {mode === "list" && "Простори проектів"}
          {mode === "create" && "Створення простору"}
          {mode === "edit" && "Редагування простору"}
        </Text>
      }
      position="right"
      size="md"
      styles={{
        header: {
          borderBottom: "1px solid var(--border-color)",
          paddingBottom: "16px",
        },
        body: {
          height: "calc(100vh - 70px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          padding: "16px 20px",
        },
      }}
    >
      <Stack gap="md" mt="md" style={{ flexGrow: 1, height: "100%", overflow: "hidden" }}>
        {mode === "list" ? (
          <>
            {isAdmin && (
              <Button
                leftSection={<IconFolderPlus size={18} />}
                color="indigo"
                fullWidth
                onClick={() => setMode("create")}
                radius="md"
              >
                Створити новий простір
              </Button>
            )}

            <Divider my="xs" label="НАЯВНІ ПРОСТОРИ" labelPosition="center" />

            <Stack
              gap="sm"
              style={{
                flexGrow: 1,
                overflowY: "auto",
                paddingRight: "4px",
              }}
            >
              {spaces.map((space) => {
                const spaceUsers = users.filter((u) =>
                  space.memberIds.includes(u.id)
                );
                const isActive = space.id === activeSpaceId;

                return (
                  <Card
                    key={space.id}
                    withBorder
                    padding="md"
                    radius="md"
                    onClick={() => {
                      onSelectSpace(space.id);
                      handleClose();
                    }}
                    style={{
                      cursor: "pointer",
                      borderColor: isActive ? "var(--mantine-color-indigo-5)" : undefined,
                      borderWidth: isActive ? "2px" : "1px",
                      backgroundColor: isActive ? "var(--mantine-color-indigo-0)" : undefined,
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Stack gap="xs" style={{ flexGrow: 1, minWidth: 0 }}>
                        <Group gap="xs">
                          <Text fw={isActive ? 800 : 700} size="md" truncate>
                            {space.name}
                          </Text>
                          {isActive && (
                            <IconCheck
                              size={16}
                              color="var(--mantine-color-indigo-6)"
                              style={{ flexShrink: 0 }}
                            />
                          )}
                        </Group>

                        {/* Avatars Overlay Group */}
                        <Avatar.Group spacing="sm" style={{ marginTop: "4px" }}>
                          {spaceUsers.slice(0, 5).map((u) => {
                            const isBase64Image =
                              u.avatar &&
                              (u.avatar.startsWith("data:image/") ||
                                u.avatar.startsWith("http") ||
                                u.avatar.startsWith("/"));
                            return (
                              <Avatar
                                key={u.id}
                                src={isBase64Image ? u.avatar : undefined}
                                radius="xl"
                                size="md"
                                title={`${u.name} - ${u.role}`}
                                styles={{
                                  placeholder: {
                                    backgroundColor: isBase64Image
                                      ? "transparent"
                                      : getAvatarColor(u.name),
                                    color: "#fff",
                                    fontSize: "11px",
                                    fontWeight: 700,
                                  },
                                }}
                              >
                                {!isBase64Image && u.avatar}
                              </Avatar>
                            );
                          })}
                          {spaceUsers.length > 5 && (
                            <Avatar
                              radius="xl"
                              size="md"
                              color="indigo"
                              styles={{
                                placeholder: { fontSize: "11px", fontWeight: 700 },
                              }}
                            >
                              +{spaceUsers.length - 5}
                            </Avatar>
                          )}
                        </Avatar.Group>
                      </Stack>

                      {isAdmin && (
                        <Group gap="xs" style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                          <ActionIcon
                            variant="light"
                            color="indigo"
                            onClick={() => {
                              setEditingSpace(space);
                              setMode("edit");
                            }}
                            title="Редагувати простір"
                          >
                            <IconPencil size={16} />
                          </ActionIcon>

                          <ActionIcon
                            variant="light"
                            color="red"
                            disabled={spaces.length <= 1} // Cannot delete last space
                            onClick={() => setSpaceToDelete(space)}
                            title={spaces.length <= 1 ? "Неможливо видалити єдиний простір" : "Видалити простір"}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Group>
                      )}
                    </Group>
                  </Card>
                );
              })}
            </Stack>
          </>
        ) : (
          /* Create / Edit Form */
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
            <Stack gap="sm" style={{ flexGrow: 1, overflow: "hidden" }}>
              <TextInput
                label="Назва простору"
                placeholder="Наприклад: Розробники або Аналітики"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                required
              />

              <Divider my="xs" label="УЧАСНИКИ ПРОСТОРУ" labelPosition="center" />

              <TextInput
                placeholder="Пошук за ім'ям або посадою..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
                leftSection={<IconSearch size={16} />}
                radius="md"
              />

              {/* Select All Checkbox */}
              <Checkbox
                label={<strong>Вибрати всіх</strong>}
                checked={allVisibleSelected}
                onChange={(e) => handleToggleSelectAll(e.currentTarget.checked)}
                mt="xs"
              />

              {/* Scrollable list of members */}
              <ScrollArea style={{ flexGrow: 1, border: "1px solid var(--border-color)", borderRadius: "8px", padding: "8px" }} offsetScrollbars>
                <Stack gap="xs">
                  {filteredUsers.map((user) => {
                    const isBase64Image =
                      user.avatar &&
                      (user.avatar.startsWith("data:image/") ||
                        user.avatar.startsWith("http") ||
                        user.avatar.startsWith("/"));
                    const isSelected = selectedUserIds.includes(user.id);

                    return (
                      <Card
                        key={user.id}
                        withBorder
                        padding="xs"
                        radius="md"
                        style={{ cursor: "pointer" }}
                        onClick={() => handleToggleUser(user.id, !isSelected)}
                      >
                        <Group justify="space-between" wrap="nowrap">
                          <Group gap="sm" wrap="nowrap">
                            <Checkbox
                              checked={isSelected}
                              onChange={() => {
                                // Event bubble handled by card onClick
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div
                              className="project-member-avatar"
                              style={{
                                backgroundColor: isBase64Image
                                  ? "transparent"
                                  : getAvatarColor(user.name),
                                backgroundImage: isBase64Image
                                  ? `url(${user.avatar})`
                                  : undefined,
                                width: "32px",
                                height: "32px",
                                fontSize: "11px",
                                flexShrink: 0,
                              }}
                            >
                              {!isBase64Image && user.avatar}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <Text fw={600} size="sm" style={{ lineHeight: 1.2 }} truncate>
                                {user.name}
                              </Text>
                              <Text size="xs" c="dimmed" style={{ lineHeight: 1.2 }} truncate>
                                {user.role}
                              </Text>
                            </div>
                          </Group>
                        </Group>
                      </Card>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <Text size="sm" c="dimmed" ta="center" py="xl">
                      Співробітників не знайдено
                    </Text>
                  )}
                </Stack>
              </ScrollArea>

              <Group mt="md" wrap="nowrap">
                <Button
                  variant="subtle"
                  color="gray"
                  leftSection={<IconX size={16} />}
                  onClick={() => setMode("list")}
                  style={{ flexGrow: 1 }}
                >
                  Скасувати
                </Button>
                <Button
                  type="submit"
                  leftSection={<IconCheck size={16} />}
                  color="indigo"
                  style={{ flexGrow: 2 }}
                >
                  {mode === "create" ? "Створити" : "Зберегти"}
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Stack>

      {/* Confirm Space Delete Modal */}
      <Modal
        opened={spaceToDelete !== null}
        onClose={() => setSpaceToDelete(null)}
        title={
          <Text fw={800} size="md" style={{ fontFamily: "var(--font-family)" }}>
            Видалити простір
          </Text>
        }
        centered
        radius="md"
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            Ви впевнені, що хочете видалити простір{" "}
            <strong>{spaceToDelete?.name}</strong>? Це призведе до безповоротного
            видалення всіх його проектів та зарезервованих годин!
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="subtle" color="gray" onClick={() => setSpaceToDelete(null)}>
              Скасувати
            </Button>
            <Button
              color="red"
              onClick={() => {
                if (spaceToDelete) {
                  onDeleteSpace(spaceToDelete.id);
                  setSpaceToDelete(null);
                }
              }}
            >
              Видалити
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Drawer>
  );
};

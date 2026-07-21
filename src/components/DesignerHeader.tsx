import React, { useState } from 'react';
import { Group, Text, Button, ActionIcon, Progress, HoverCard, Table, Modal, TextInput, PasswordInput, Stack } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconUsers, IconLogin, IconLogout, IconShield } from '@tabler/icons-react';
import type { User, Allocation } from '../types';

interface DesignerHeaderProps {
  users: User[];
  allocations: Allocation[];
  days: Date[];
  designerCapacities: Record<string, number>;
  onCapacityChange: (designerId: string, capacity: number) => void;
  currentMonthYear: string;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onOpenManageUsers: () => void;
  isAdmin: boolean;
  onLogin: (email: string, pass: string) => Promise<boolean>;
  onLogout: () => void;
  isSticky?: boolean;
}

export const DesignerHeader: React.FC<DesignerHeaderProps> = ({
  users,
  allocations,
  days,
  designerCapacities,
  onCapacityChange,
  currentMonthYear,
  onPrevWeek,
  onNextWeek,
  onOpenManageUsers,
  isAdmin,
  onLogin,
  onLogout,
  isSticky = false,
}) => {
  const designers = users.filter((u) => u.isDesigner);

  // Authentication form states
  const [loginOpened, setLoginOpened] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helper to format Date to YYYY-MM-DD local string
  const formatDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getAvatarColor = (name: string) => {
    if (name.includes("Rodion")) return '#6366f1';
    if (name.includes("Yevhen")) return '#10b981';
    if (name.includes("Anton")) return '#f59e0b';
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 60%, 45%)`;
  };

  // Helper to get day name in Ukrainian
  const getDayNameUa = (dayIndex: number) => {
    const names = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    return names[dayIndex];
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsSubmitting(true);

    const success = await onLogin(email, password);
    setIsSubmitting(false);

    if (success) {
      setLoginOpened(false);
      setEmail('');
      setPassword('');
    } else {
      setLoginError('Невірний email або пароль');
    }
  };

  if (isSticky) {
    return (
      <div className="compact-header-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        {/* Left Side: Month name + week arrows */}
        <Group gap="md">
          <Text fw={800} style={{ fontSize: '20px', fontFamily: 'var(--font-family)', color: 'var(--text-main)', margin: 0, padding: 0 }}>
            {currentMonthYear}
          </Text>
          <Group gap={4}>
            <ActionIcon variant="light" color="indigo" size="md" onClick={onPrevWeek} radius="md" title="Попередній тиждень">
              <IconChevronLeft size={14} />
            </ActionIcon>
            <ActionIcon variant="light" color="indigo" size="md" onClick={onNextWeek} radius="md" title="Наступний тиждень">
              <IconChevronRight size={14} />
            </ActionIcon>
          </Group>
        </Group>

        {/* Right Side: Designers list (compact) */}
        <Group gap="lg">
          {designers.map((designer) => {
            const dailyCap = designerCapacities[designer.id] || 8;
            const weeklyDaysCount = 5;
            const totalWeeklyCap = dailyCap * weeklyDaysCount;

            // Compute allocated hours
            const dailyAllocations = days.map((day) => {
              const dayStr = formatDateString(day);
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              
              let hoursForDay = 0;
              allocations
                .filter((a) => a.designerId === designer.id)
                .forEach((alloc) => {
                  const start = new Date(alloc.startDate);
                  const end = new Date(alloc.endDate);
                  const current = new Date(dayStr);
                  
                  if (current >= start && current <= end) {
                    const durationDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    hoursForDay += alloc.hours / durationDays;
                  }
                });

              return {
                hours: Math.round(hoursForDay * 10) / 10,
                isWeekend,
              };
            });

            const totalAllocated = dailyAllocations.reduce((sum, item) => sum + (item.isWeekend ? 0 : item.hours), 0);
            const roundedAllocated = Math.round(totalAllocated * 10) / 10;
            const percentLoad = totalWeeklyCap > 0 ? (totalAllocated / totalWeeklyCap) * 100 : 0;

            // Color classification
            let statusColor = 'teal';
            if (percentLoad > 100) {
              statusColor = 'red';
            } else if (percentLoad > 85) {
              statusColor = 'orange';
            } else if (percentLoad > 50) {
              statusColor = 'indigo';
            }

            const isBase64Image = designer.avatar && (designer.avatar.startsWith('data:image/') || designer.avatar.startsWith('http') || designer.avatar.startsWith('/'));

            return (
              <HoverCard key={designer.id} width={320} shadow="md" withArrow openDelay={200}>
                <HoverCard.Target>
                  <div className="compact-designer-badge" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <div
                      className="designer-avatar"
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        backgroundColor: isBase64Image ? 'transparent' : getAvatarColor(designer.name),
                        backgroundImage: isBase64Image ? `url(${designer.avatar})` : undefined,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        color: '#fff',
                        fontWeight: 700
                      }}
                    >
                      {!isBase64Image && designer.avatar}
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      <Text size="xs" fw={700} style={{ color: 'var(--text-main)', lineHeight: 1.1 }}>
                        {designer.name.split(' ')[0]}
                      </Text>
                      <Text size="9px" c="dimmed" style={{ lineHeight: 1.1 }}>
                        {designer.role}
                      </Text>
                    </div>

                    <div style={{ width: '60px', marginLeft: '4px' }}>
                      <Progress
                        value={Math.min(100, percentLoad)}
                        color={statusColor}
                        size="xs"
                        radius="xl"
                        striped={percentLoad > 100}
                        animated={percentLoad > 100}
                      />
                      <Text size="9px" fw={600} color={statusColor} style={{ textAlign: 'center', marginTop: '1px' }}>
                        {roundedAllocated}/{totalWeeklyCap} год
                      </Text>
                    </div>
                  </div>
                </HoverCard.Target>

                <HoverCard.Dropdown>
                  <Stack gap="xs">
                    <Text size="xs" fw={700} c="dimmed">
                      ДЕТАЛЬНИЙ РОЗПОДІЛ (ПН-ПТ)
                    </Text>
                    <Table verticalSpacing="xs">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>День</Table.Th>
                          <Table.Th>Години</Table.Th>
                          <Table.Th>Статус</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {days.map((day) => {
                          const dayStr = formatDateString(day);
                          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                          
                          let hoursForDay = 0;
                          allocations
                            .filter((a) => a.designerId === designer.id)
                            .forEach((alloc) => {
                              const start = new Date(alloc.startDate);
                              const end = new Date(alloc.endDate);
                              const current = new Date(dayStr);
                              
                              if (current >= start && current <= end) {
                                const durationDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                                hoursForDay += alloc.hours / durationDays;
                              }
                            });
                          const hrs = Math.round(hoursForDay * 10) / 10;
                          const cap = isWeekend ? 0 : dailyCap;

                          return (
                            <Table.Tr key={dayStr}>
                              <Table.Td>{getDayNameUa(day.getDay())} ({day.getDate()})</Table.Td>
                              <Table.Td>{hrs} / {cap} год</Table.Td>
                              <Table.Td>
                                {isWeekend ? (
                                  <Text size="10px" c="dimmed">Вихідний</Text>
                                ) : hrs > cap ? (
                                  <Text size="10px" c="red" fw={700}>Перевантаження</Text>
                                ) : hrs === cap ? (
                                  <Text size="10px" c="teal" fw={700}>Заповнено</Text>
                                ) : (
                                  <Text size="10px" c="indigo">Вільний</Text>
                                )}
                              </Table.Td>
                            </Table.Tr>
                          );
                        })}
                      </Table.Tbody>
                    </Table>
                  </Stack>
                </HoverCard.Dropdown>
              </HoverCard>
            );
          })}
        </Group>

        {/* Modal for login inside compact header as well */}
        <Modal
          opened={loginOpened}
          onClose={() => {
            setLoginOpened(false);
            setLoginError('');
            setEmail('');
            setPassword('');
          }}
          title={
            <Group gap="xs">
              <IconShield size={20} color="var(--primary-color)" />
              <Text fw={800} size="md" style={{ fontFamily: 'var(--font-family)' }}>
                Авторизація адміністратора
              </Text>
            </Group>
          }
          centered
          radius="md"
        >
          <form onSubmit={handleLoginSubmit}>
            <Stack gap="md">
              <TextInput
                label="Email"
                placeholder="Введіть email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                required
              />
              <PasswordInput
                label="Пароль"
                placeholder="Введіть пароль"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                required
              />

              {loginError && (
                <Text size="xs" c="red" fw={600}>
                  {loginError}
                </Text>
              )}

              <Button
                type="submit"
                color="indigo"
                fullWidth
                loading={isSubmitting}
                leftSection={<IconLogin size={16} />}
                mt="xs"
              >
                Увійти
              </Button>
            </Stack>
          </form>
        </Modal>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '24px' }}>
      {/* Top Title & Navigation Row */}
      <Group justify="space-between" mb="xl">
        <Group gap="md">
          <Text fw={800} size="xl" style={{ fontSize: '28px', fontFamily: 'var(--font-family)', color: 'var(--text-main)' }}>
            {currentMonthYear}
          </Text>
        </Group>

        <Group gap="sm">
          {/* Chevron Navigation Buttons with a 4px gap */}
          <Group gap={4}>
            <ActionIcon variant="light" color="indigo" size="lg" onClick={onPrevWeek} radius="md" title="Попередній тиждень">
              <IconChevronLeft size={18} />
            </ActionIcon>
            <ActionIcon variant="light" color="indigo" size="lg" onClick={onNextWeek} radius="md" title="Наступний тиждень">
              <IconChevronRight size={18} />
            </ActionIcon>
          </Group>

          <Button
            leftSection={<IconUsers size={16} />}
            color="indigo"
            variant="outline"
            radius="md"
            onClick={onOpenManageUsers}
          >
            Команда
          </Button>

          {isAdmin ? (
            <Button
              leftSection={<IconLogout size={16} />}
              color="red"
              variant="light"
              radius="md"
              onClick={onLogout}
            >
              Вийти
            </Button>
          ) : (
            <Button
              leftSection={<IconLogin size={16} />}
              color="indigo"
              variant="filled"
              radius="md"
              onClick={() => setLoginOpened(true)}
            >
              Вхід для Адміна
            </Button>
          )}
        </Group>
      </Group>

      {/* Designers Capacity Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {designers.map((designer) => {
          const dailyCap = designerCapacities[designer.id] || 8;
          const weeklyDaysCount = 5; // Monday to Friday working days
          const totalWeeklyCap = dailyCap * weeklyDaysCount;

          // Compute hours allocated to this designer for each day of the current week
          const dailyAllocations = days.map((day) => {
            const dayStr = formatDateString(day);
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
            
            let hoursForDay = 0;
            allocations
              .filter((a) => a.designerId === designer.id)
              .forEach((alloc) => {
                const start = new Date(alloc.startDate);
                const end = new Date(alloc.endDate);
                const current = new Date(dayStr);
                
                if (current >= start && current <= end) {
                  const durationDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                  hoursForDay += alloc.hours / durationDays;
                }
              });

            return {
              date: day,
              dateStr: dayStr,
              hours: Math.round(hoursForDay * 10) / 10,
              isWeekend,
              capacity: isWeekend ? 0 : dailyCap,
            };
          });

          const totalAllocated = dailyAllocations.reduce((sum, item) => sum + (item.isWeekend ? 0 : item.hours), 0);
          const roundedAllocated = Math.round(totalAllocated * 10) / 10;
          const percentLoad = totalWeeklyCap > 0 ? (totalAllocated / totalWeeklyCap) * 100 : 0;

          // Color classification
          let statusColor = 'teal';
          if (percentLoad > 100) {
            statusColor = 'red';
          } else if (percentLoad > 85) {
            statusColor = 'orange';
          } else if (percentLoad > 50) {
            statusColor = 'indigo';
          }

          const cardClass = designer.name.toLowerCase().includes('rodion')
            ? 'designer-card rodion'
            : designer.name.toLowerCase().includes('yevhen')
            ? 'designer-card yevhen'
            : 'designer-card anton';

          return (
            <div key={designer.id}>
              <HoverCard width={320} shadow="md" withArrow openDelay={200}>
                <HoverCard.Target>
                  <div className={cardClass}>
                    <div className="designer-header">
                      {(() => {
                        const isBase64Image = designer.avatar && (designer.avatar.startsWith('data:image/') || designer.avatar.startsWith('http') || designer.avatar.startsWith('/'));
                        return (
                          <div
                            className="designer-avatar"
                            style={{
                              backgroundColor: isBase64Image ? 'transparent' : getAvatarColor(designer.name),
                              backgroundImage: isBase64Image ? `url(${designer.avatar})` : undefined,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                            }}
                          >
                            {!isBase64Image && designer.avatar}
                          </div>
                        );
                      })()}
                      <div className="designer-details">
                        <Text className="designer-name">{designer.name}</Text>
                        <Text className="designer-role">{designer.role}</Text>
                      </div>
                    </div>

                    <div className="designer-capacity-control" onClick={(e) => e.stopPropagation()}>
                      <label htmlFor={`cap-${designer.id}`}>Годин на дизайн:</label>
                      <input
                        id={`cap-${designer.id}`}
                        type="number"
                        className="designer-capacity-input"
                        min="0"
                        max="24"
                        value={dailyCap}
                        disabled={!isAdmin}
                        onChange={(e) => onCapacityChange(designer.id, parseFloat(e.target.value) || 0)}
                        style={{ cursor: isAdmin ? 'text' : 'not-allowed' }}
                      />
                    </div>

                    <div>
                      <Group justify="space-between" mb="xs">
                        <Text size="xs" c="dimmed" fw={600}>Тижневе завантаження:</Text>
                        <Text size="xs" fw={700} color={statusColor}>
                          {roundedAllocated} / {totalWeeklyCap} год ({Math.round(percentLoad)}%)
                        </Text>
                      </Group>
                      <Progress
                        value={Math.min(100, percentLoad)}
                        color={statusColor}
                        size="md"
                        radius="xl"
                        striped={percentLoad > 100}
                        animated={percentLoad > 100}
                      />
                    </div>
                  </div>
                </HoverCard.Target>

                <HoverCard.Dropdown>
                  <Stack gap="xs">
                    <Text size="xs" fw={700} c="dimmed">
                      ДЕТАЛЬНИЙ РОЗПОДІЛ (ПН-ПТ)
                    </Text>
                    <Table verticalSpacing="xs">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>День</Table.Th>
                          <Table.Th>Години</Table.Th>
                          <Table.Th>Статус</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {dailyAllocations.map((item) => (
                          <Table.Tr key={item.dateStr}>
                            <Table.Td>{getDayNameUa(item.date.getDay())} ({item.date.getDate()})</Table.Td>
                            <Table.Td>{item.hours} / {item.capacity} год</Table.Td>
                            <Table.Td>
                              {item.isWeekend ? (
                                <Text size="10px" c="dimmed">Вихідний</Text>
                              ) : item.hours > item.capacity ? (
                                <Text size="10px" c="red" fw={700}>Перевантаження</Text>
                              ) : item.hours === item.capacity ? (
                                <Text size="10px" c="teal" fw={700}>Заповнено</Text>
                              ) : (
                                <Text size="10px" c="indigo">Вільний</Text>
                              )}
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Stack>
                </HoverCard.Dropdown>
              </HoverCard>
            </div>
          );
        })}
      </div>

      {/* Admin Login Modal */}
      <Modal
        opened={loginOpened}
        onClose={() => {
          setLoginOpened(false);
          setLoginError('');
          setEmail('');
          setPassword('');
        }}
        title={
          <Group gap="xs">
            <IconShield size={20} color="var(--primary-color)" />
            <Text fw={800} size="md" style={{ fontFamily: 'var(--font-family)' }}>
              Авторизація адміністратора
            </Text>
          </Group>
        }
        centered
        radius="md"
      >
        <form onSubmit={handleLoginSubmit}>
          <Stack gap="md">
            <TextInput
              label="Email"
              placeholder="Введіть email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              required
            />
            <PasswordInput
              label="Пароль"
              placeholder="Введіть пароль"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
            />

            {loginError && (
              <Text size="xs" c="red" fw={600}>
                {loginError}
              </Text>
            )}

            <Button
              type="submit"
              color="indigo"
              fullWidth
              loading={isSubmitting}
              leftSection={<IconLogin size={16} />}
              mt="xs"
            >
              Увійти
            </Button>
          </Stack>
        </form>
      </Modal>
    </div>
  );
};

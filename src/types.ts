export interface User {
  id: string;
  name: string;
  role: string;
  avatar: string; // URL or initials or emoji placeholder
  isDesigner: boolean;
  color?: string; // CSS or Mantine theme color for timeline
}

export interface Project {
  id: string;
  name: string;
  color: string; // css color or mantine theme color (e.g. violet, blue, teal, orange, pink, cyan)
  memberIds: string[]; // list of user ids in this project
}

export interface Allocation {
  id: string;
  projectId: string;
  designerId: string; // The designer who is assigned these hours
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  hours: number; // total hours allocated for the duration
}

export interface DesignerCapacity {
  designerId: string;
  dailyCapacity: number; // e.g. 4 for Rodion, 8 for others
}

export interface WeekData {
  startOfWeek: Date; // Monday of the week
  days: Date[]; // Monday to Sunday (7 Date objects)
}

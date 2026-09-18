export interface ProfileUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  emailVerified: boolean;
}

export interface MemoryEntry {
  id: string;
  fact: string;
  category: string;
  createdAt: string;
}

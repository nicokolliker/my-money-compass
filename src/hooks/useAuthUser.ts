import { useAuth } from '@/hooks/useAuth';

/** Returns user.id or undefined. Use in query keys to scope them per user. */
export function useUserId() {
  const { user } = useAuth();
  return user?.id;
}

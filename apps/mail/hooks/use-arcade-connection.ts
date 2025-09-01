import { useQuery, useMutation } from '@tanstack/react-query';
import { useTRPC } from '../providers/query-provider';
import { useMemo } from 'react';

export interface ArcadeConnection {
  id: string;
  userId: string;
  toolkit: string;
  status: 'connected' | 'error';
  authorizedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ArcadeToolkit {
  name: string;
  description: string;
  toolCount: number;
  icon?: string;
}

export function useArcadeConnections() {
  const trpc = useTRPC();

  const { data: toolkitsData, isLoading: toolkitsLoading } = useQuery(
    trpc.arcadeConnections.toolkits.queryOptions(),
  );

  const toolkits = useMemo(() => {
    return (toolkitsData?.toolkits || []).map((toolkit) => ({
      ...toolkit,
      icon: getToolkitIcon(toolkit.name),
    }));
  }, [toolkitsData]);

  const {
    data: connections,
    isLoading: connectionsLoading,
    refetch,
  } = useQuery(trpc.arcadeConnections.list.queryOptions());

  const { mutateAsync: getAuthUrl } = useMutation(
    trpc.arcadeConnections.getAuthUrl.mutationOptions(),
  );

  const { mutateAsync: authorizeToolkit } = useMutation({
    mutationFn: async (toolkit: string) => {
      const result = await getAuthUrl({ toolkit });
      return result;
    },
  });

  const { mutateAsync: revokeAuthorization } = useMutation(
    trpc.arcadeConnections.revoke.mutationOptions(),
  );

  return {
    toolkits,
    connections: connections?.connections || [],
    isLoading: connectionsLoading || toolkitsLoading,
    refetch,
    authorizeToolkit,
    revokeAuthorization,
  };
}

function getToolkitIcon(toolkit: string): string {
  const icons: Record<string, string> = {
    github: 'github',
  };

  return icons[toolkit.toLowerCase()] || 'default';
}

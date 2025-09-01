import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { useArcadeConnections } from '@/hooks/use-arcade-connections';
import { Gmail, GitHub, Slack, Linear, Stripe } from '../icons/icons';
import { Loader2, CheckCircle2, Sparkles } from 'lucide-react';
import { useTRPC } from '@/providers/query-provider';
import { useMutation } from '@tanstack/react-query';
import { Button } from '../ui/button';
import { useState } from 'react';
import { toast } from 'sonner';

// Arcade toolkit icons mapping
const toolkitIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  gmail: Gmail,
  github: GitHub,
  slack: Slack,
  notion: Sparkles, // Notion icon not available, using Sparkles as fallback
  linear: Linear,
  stripe: Stripe,
};

export const AddArcadeConnectionDialog = ({
  children,
  // onSuccess,
}: {
  children?: React.ReactNode;
  onSuccess?: () => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [connectingToolkit, setConnectingToolkit] = useState<string | null>(null);
  const { toolkits, connections, isLoading, authorizeToolkit } = useArcadeConnections();
  const trpc = useTRPC();
  const { mutateAsync: createConnection } = useMutation(
    trpc.arcadeConnections.createConnection.mutationOptions(),
  );

  const handleConnect = async (toolkit: string) => {
    setConnectingToolkit(toolkit);
    try {
      const authResult = await authorizeToolkit(toolkit);
      if (authResult?.authUrl && authResult?.authId) {
        // Open the authorization URL in a new window
        // window.location.href = authResult.authUrl;
        const authWindow = window.open(authResult.authUrl, '_blank', 'width=600,height=600');

        // Poll to check if the window is closed and authorization is complete
        const checkInterval = setInterval(async () => {
          if (authWindow?.closed) {
            clearInterval(checkInterval);

            // Try to create the connection
            try {
              await createConnection({
                toolkit,
                authId: authResult.authId,
              });

              toast.success(`Successfully connected ${toolkit}`);
              setConnectingToolkit(null);
              // onSuccess?.();
            } catch {
              // Authorization might not be complete yet
              console.log('Authorization not complete or failed');
              setConnectingToolkit(null);
            }
          }
        }, 1000);

        // Also set a timeout to stop checking after 5 minutes
        setTimeout(
          () => {
            clearInterval(checkInterval);
            setConnectingToolkit(null);
          },
          5 * 60 * 1000,
        );
      }
    } catch (error) {
      console.error('Failed to connect toolkit:', error);
      toast.error(`Failed to connect ${toolkit}`);
      setConnectingToolkit(null);
    }
  };

  const isConnected = (toolkit: string) => {
    return connections.some((c) => c.toolkit === toolkit);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent showOverlay={true} className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Arcade Integration</DialogTitle>
          <DialogDescription>
            Connect to external services through Arcade to enhance Zero Mail with AI-powered tools
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : toolkits.length === 0 ? (
          <div className="text-muted-foreground py-8 text-center">
            <Sparkles className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p className="text-sm">No integrations available</p>
            <p className="mt-1 text-xs">Please check your Arcade API key configuration</p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {toolkits.map((toolkit) => {
              const Icon = toolkitIcons[toolkit.name] || Sparkles;
              const connected = isConnected(toolkit.name);

              return (
                <div
                  key={toolkit.name}
                  className={`relative rounded-lg border p-4 transition-colors ${
                    connected
                      ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                      : 'hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium capitalize">{toolkit.name}</h3>
                      <p className="text-muted-foreground mt-1 text-sm">{toolkit.description}</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {toolkit.toolCount} tools available
                      </p>
                    </div>
                    {connected ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleConnect(toolkit.name)}
                        disabled={connectingToolkit === toolkit.name}
                        className="shrink-0"
                      >
                        {connectingToolkit === toolkit.name ? (
                          <>
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                            Connecting
                          </>
                        ) : (
                          'Connect'
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

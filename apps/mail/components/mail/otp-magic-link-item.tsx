import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type OTPEmail } from '@/hooks/use-otp-emails';
import { useTRPC } from '@/providers/query-provider';
import { useMutation } from '@tanstack/react-query';
import { Copy, ExternalLink } from '../icons/icons';
import { Button } from '@/components/ui/button';
import { BimiAvatar } from '../ui/bimi-avatar';
import { cn, formatDate } from '@/lib/utils';
import { useCallback } from 'react';
import { toast } from 'sonner';

export function AuthItem({ item }: { item: OTPEmail }) {
  const trpc = useTRPC();

  const markConsumed = useMutation({
    ...trpc.authItems.markConsumed.mutationOptions(),
  });

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!item.code) return;
      try {
        await navigator.clipboard.writeText(item.code);
        toast.success('Copied!', { description: `${item.service} code copied` });
        if (!item.isCopied) markConsumed.mutate({ id: item.id });
      } catch {
        toast.error('Copy failed', { description: 'Could not copy the code.' });
      }
    },
    [item.code, item.id, item.isCopied, item.service, markConsumed],
  );

  const handleOpen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!item.url) return;
      try {
        window.open(item.url, '_blank', 'noopener,noreferrer');
        toast.success('Opening link', { description: item.service });
        if (!item.isCopied) markConsumed.mutate({ id: item.id });
      } catch {
        toast.error('Open failed', { description: 'Could not open the link.' });
      }
    },
    [item.url, item.id, item.isCopied, item.service, markConsumed],
  );

  return (
    <div className={cn('select-none border-b md:my-1 md:border-none')}>
      <div
        className={cn(
          'hover:bg-offsetLight dark:hover:bg-primary/5 group relative mx-1 flex flex-col items-start rounded-lg py-2 text-left text-sm transition-all hover:opacity-100',
        )}
      >
        <div className={`relative flex w-full items-center justify-between gap-4 px-4`}>
          <div>
            <BimiAvatar email={item.from} name={item.from} className={cn('h-8 w-8 rounded-full')} />
          </div>

          <div className="flex w-full justify-between">
            <div className="w-full">
              <div className="flex w-full flex-row items-center justify-between">
                <div className="flex flex-row items-center gap-[4px]">
                  <span
                    className={cn(
                      'font-bold',
                      'text-md flex items-baseline gap-1 group-hover:opacity-100',
                    )}
                  >
                    <span className={cn('line-clamp-1 max-w-2xl overflow-hidden text-sm')}>
                      {item.type === 'otp'
                        ? `Your one time passcode for ${item.service} - ${item.code}`
                        : `Your magic link for ${item.service}`}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {item.type === 'otp' && item.code ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="h-7 px-2"
                          onClick={handleCopy}
                          aria-label="Copy code"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          <span className="sr-only">Copy</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="p-1 text-xs">Copy code</TooltipContent>
                    </Tooltip>
                  ) : null}
                  {item.type === 'ml' && item.url ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="h-7 px-2"
                          onClick={handleOpen}
                          aria-label="Open link"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span className="sr-only">Open</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="p-1 text-xs">Open link</TooltipContent>
                    </Tooltip>
                  ) : null}
                  {item.receivedAt ? (
                    <p
                      className={cn(
                        'text-muted-foreground text-nowrap text-xs font-normal opacity-70 transition-opacity group-hover:opacity-100 dark:text-[#8C8C8C]',
                      )}
                    >
                      {formatDate(item.receivedAt)}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

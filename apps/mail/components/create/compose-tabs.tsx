import {
  activeComposeTabIdAtom,
  composeTabsAtom,
  fullscreenTabIdAtom,
  isMobileAtom,
  removeComposeTabAtom,
  switchMobileTabAtom,
  toggleFullscreenTabAtom,
  toggleMinimizeTabAtom,
  updateComposeTabAtom,
} from '@/store/composeTabsStore';
import { useActiveConnection } from '@/hooks/use-connections';
import { Maximize2, Minimize2, Minus, X } from 'lucide-react';
import { useEmailAliases } from '@/hooks/use-email-aliases';
import { AnimatePresence, motion } from 'motion/react';
import { useTRPC } from '@/providers/query-provider';
import { SidebarToggle } from '../ui/sidebar-toggle';
import { useMutation } from '@tanstack/react-query';
import { useSettings } from '@/hooks/use-settings';
import { useIsMobile } from '@/hooks/use-mobile';
import { EmailComposer } from './email-composer';
import { Button } from '@/components/ui/button';
import { useAISidebar } from '../ui/ai-sidebar';
import { useSession } from '@/lib/auth-client';
import { serializeFiles } from '@/lib/schemas';
import { useDraft } from '@/hooks/use-drafts';
import { useAtom, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function ComposeTabContent({
  tab,
  tabId,
  onSendEmail,
  onChange,
  updateTab,
  settingsLoading,
  isFullscreen = false,
}: {
  tab: any;
  tabId: string;
  onSendEmail: (tabId: string, data: any) => void;
  onChange: (updates: any) => void;
  updateTab: (updates: { id: string; updates: any }) => void;
  settingsLoading: boolean;
  isFullscreen?: boolean;
}) {
  const { data: draft, isLoading: isDraftLoading } = useDraft(tab.draftId || null);

  if (isDraftLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"></div>
          <p>Loading draft...</p>
        </div>
      </div>
    );
  }

  const initialTo = draft?.to?.map((e: string) => e.replace(/[<>]/g, '')) || tab.to || [];
  const initialCc = draft?.cc?.map((e: string) => e.replace(/[<>]/g, '')) || tab.cc || [];
  const initialBcc = draft?.bcc?.map((e: string) => e.replace(/[<>]/g, '')) || tab.bcc || [];
  const initialSubject = draft?.subject || tab.subject || '';
  const initialMessage = draft?.content || tab.body || '';

  return (
    <EmailComposer
      inATab={true}
      initialTo={initialTo}
      initialCc={initialCc}
      initialBcc={initialBcc}
      initialSubject={initialSubject}
      initialMessage={initialMessage}
      initialAttachments={tab.attachments || []}
      draftId={tab.draftId}
      onSendEmail={async (data) => await onSendEmail(tabId, data)}
      onClose={() => {
        /* handled by parent */
      }}
      onChange={onChange}
      onDraftCreated={(newDraftId) => {
        updateTab({ id: tabId, updates: { draftId: newDraftId } });
      }}
      className="h-full overflow-hidden rounded-none border-[1px] border-[#313131] bg-[#313131]"
      autofocus={true}
      settingsLoading={settingsLoading}
      isFullscreen={isFullscreen}
    />
  );
}

export function ComposeTabs() {
  const [composeTabs] = useAtom(composeTabsAtom);
  const [activeTabId, setActiveTabId] = useAtom(activeComposeTabIdAtom);
  const [fullscreenTabId] = useAtom(fullscreenTabIdAtom);
  const removeTab = useSetAtom(removeComposeTabAtom);
  const updateTab = useSetAtom(updateComposeTabAtom);
  const toggleMinimize = useSetAtom(toggleMinimizeTabAtom);
  const toggleFullscreen = useSetAtom(toggleFullscreenTabAtom);
  const switchMobileTab = useSetAtom(switchMobileTabAtom);
  const setIsMobile = useSetAtom(isMobileAtom);
  const isMobile = useIsMobile();

  useEffect(() => {
    setIsMobile(isMobile);
  }, [isMobile, setIsMobile]);

  useEffect(() => {
    if (isMobile && fullscreenTabId) {
      toggleFullscreen(null);
    }
  }, [isMobile, fullscreenTabId, toggleFullscreen]);
  const {
    open: isSidebarOpen,
    isFullScreen: isAIFullScreen,
    isSidebar: isAISidebar,
    viewMode,
  } = useAISidebar();

  const { data: session } = useSession();
  const { data: activeConnection } = useActiveConnection();
  const { data: aliases } = useEmailAliases();
  const { data: settings, isLoading: settingsLoading } = useSettings();

  const trpc = useTRPC();
  const { mutateAsync: sendEmail } = useMutation(trpc.mail.send.mutationOptions());

  const userEmail = activeConnection?.email || session?.user?.email || '';

  const handleSendEmail = async (
    tabId: string,
    data: {
      to: string[];
      cc?: string[];
      bcc?: string[];
      subject: string;
      message: string;
      attachments: File[];
      fromEmail?: string;
    },
  ) => {
    const fromEmail = data.fromEmail || aliases?.[0]?.email || userEmail;

    if (!fromEmail) {
      toast.error('No email address available to send from');
      return;
    }

    const zeroSignature = settings?.settings.zeroSignature
      ? '<p style="color: #666; font-size: 12px;">Sent via <a href="https://0.email/" style="color: #0066cc; text-decoration: none;">Zero</a></p>'
      : '';

    try {
      await sendEmail({
        to: data.to.map((email) => ({ email, name: email?.split('@')[0] || email })),
        cc: data.cc?.map((email) => ({ email, name: email?.split('@')[0] || email })),
        bcc: data.bcc?.map((email) => ({ email, name: email?.split('@')[0] || email })),
        subject: data.subject,
        message: data.message + zeroSignature,
        threadId: undefined,
        attachments: data.attachments.length > 0 ? await serializeFiles(data.attachments) : [],
        fromEmail: fromEmail,
      });

      toast.success('Email sent successfully');
      removeTab(tabId);
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error('Failed to send email');
    }
  };

  const tabs = Array.from(composeTabs.entries());

  if (tabs.length === 0) {
    return null;
  }

  const isFullscreen = !!fullscreenTabId;
  const fullscreenTab = fullscreenTabId ? composeTabs.get(fullscreenTabId) : null;

  if (isMobile && tabs.length > 0) {
    const activeTabData = activeTabId ? composeTabs.get(activeTabId) : null;
    const showBottomSheet = activeTabData && !activeTabData.isMinimized;

    if (!showBottomSheet) {
      return (
        <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2">
          {tabs.map(([tabId, tab]) => (
            <motion.div
              key={tabId}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <motion.button
                onClick={() => switchMobileTab(tabId)}
                className="bg-background flex h-12 items-center gap-2 rounded-full border px-4 shadow-lg dark:bg-[#313131]"
                whileTap={{ scale: 0.95 }}
              >
                <span className="text-sm font-medium">
                  {tab.subject || (tab.to?.length ? `To: ${tab.to[0]}` : 'New Email')}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTab(tabId);
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </motion.button>
            </motion.div>
          ))}
        </div>
      );
    }

    if (!activeTabId || !activeTabData) {
      return null;
    }

    return (
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.2}
        onDragEnd={(e, { velocity }) => {
          if (velocity.y > 500) {
            toggleMinimize(activeTabId);
          }
        }}
        className="bg-background fixed inset-x-0 bottom-0 z-40 h-[85vh] rounded-t-2xl border-t shadow-2xl dark:bg-[#313131]"
      >
        <div className="flex h-full flex-col">
          <div className="flex justify-center py-2">
            <div className="h-1 w-12 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>

          <div className="flex items-center justify-between border-b p-3">
            <h3 className="text-lg font-semibold">{activeTabData.subject || 'New Email'}</h3>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => toggleMinimize(activeTabId)}
                className="h-8 w-8"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeTab(activeTabId)}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            <ComposeTabContent
              tab={activeTabData}
              tabId={activeTabId}
              onSendEmail={handleSendEmail}
              onChange={(updates) => updateTab({ id: activeTabId, updates })}
              updateTab={updateTab}
              settingsLoading={settingsLoading}
            />
          </div>

          {tabs.length > 1 && (
            <div className="bg-background border-t p-2 dark:bg-[#313131]">
              <div className="scrollbar-none flex gap-2 overflow-x-auto">
                {tabs.map(([id, t]) => (
                  <motion.button
                    key={id}
                    onClick={() => {
                      if (id !== activeTabId) {
                        switchMobileTab(id);
                      }
                    }}
                    className={cn(
                      'flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition-colors',
                      id === activeTabId
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80',
                    )}
                    whileTap={{ scale: 0.95 }}
                  >
                    <span className="max-w-[120px] truncate">
                      {t.subject || (t.to?.[0] ? `To: ${t.to[0]}` : 'New Email')}
                    </span>
                    <X
                      className="h-3 w-3 opacity-60 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTab(id);
                        if (id === activeTabId && tabs.length > 1) {
                          const otherTabId = tabs.find(([tabId]) => tabId !== id)?.[0];
                          if (otherTabId) {
                            switchMobileTab(otherTabId);
                          }
                        }
                      }}
                    />
                  </motion.button>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  if (isFullscreen && fullscreenTab) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-50 bg-[#FAFAFA] dark:bg-[#141414]"
      >
        <div className="flex h-full flex-col overflow-hidden rounded-2xl border">
          <div className="flex items-center justify-between border-b bg-[#FAFAFA] p-2 pl-4 pr-1.5 dark:bg-[#313131]">
            <div className="flex items-center gap-2">
              <SidebarToggle />
              <h2 className="text-lg font-semibold">{fullscreenTab.subject || 'New Email'}</h2>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => toggleFullscreen(null)}
                className="h-8 w-8"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeTab(fullscreenTabId)}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <ComposeTabContent
              tab={fullscreenTab}
              tabId={fullscreenTabId}
              onSendEmail={handleSendEmail}
              onChange={(updates) => updateTab({ id: fullscreenTabId, updates })}
              updateTab={updateTab}
              settingsLoading={settingsLoading}
              isFullscreen={true}
            />
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <>
      <div
        className={cn(
          'pointer-events-none absolute left-0 z-40 overflow-hidden',
          'bottom-[70px] md:bottom-4',
          'w-[calc(100%_-_52px)] px-3',
          {
            'w-[calc(100%_-_(400px_+_32px))]': isSidebarOpen && !isAIFullScreen && !isAISidebar,
            'w-[calc(100%_-_32px)]': isSidebarOpen && !isAIFullScreen && isAISidebar,
            'w-[calc(100%)]': isSidebarOpen && viewMode === 'sidebar',
          },
        )}
      >
        <div className="pointer-events-none flex w-full flex-row-reverse items-end gap-4 overflow-x-scroll">
          <AnimatePresence>
            {Array.from(composeTabs.values()).map((tab) => {
              const index = Array.from(composeTabs.values()).indexOf(tab);

              return (
                <motion.div
                  key={tab.id}
                  layout
                  layoutId={`compose-tab-${tab.id}`}
                  initial={{ opacity: 0, scale: 0.8, y: 20 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    y: 0,
                    width: tab.isMinimized ? 'auto' : '500px',
                    height: tab.isMinimized ? 'auto' : '600px',
                  }}
                  exit={{ opacity: 0, scale: 0.8, y: 20 }}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 30,
                    opacity: { duration: 0.2 },
                  }}
                  style={{
                    originX: 1,
                    originY: 1,
                    zIndex: activeTabId === tab.id ? 10 : index,
                  }}
                  className={
                    tab.isMinimized
                      ? 'cursor-pointer'
                      : 'bg-background pointer-events-auto min-w-96 overflow-hidden rounded-2xl border shadow-2xl dark:bg-[#313131]'
                  }
                >
                  <AnimatePresence mode="wait">
                    {tab.isMinimized ? (
                      <motion.div
                        key={`${tab.id}-minimized`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="hover:bg-accent pointer-events-auto flex h-10 min-w-40 items-center justify-between gap-2 rounded-2xl border bg-[#FFFFFF] py-2 pl-4 pr-2.5 shadow-lg dark:bg-[#313131]"
                        onClick={() => toggleMinimize(tab.id)}
                      >
                        <span className="line-clamp-1 max-w-[100px] truncate text-sm font-medium">
                          {tab.subject ||
                            (tab.to?.length
                              ? `To: ${tab.to[0]}${tab.to.length > 1 ? ` +${tab.to.length - 1}` : ''}`
                              : 'New Email')}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="hover:bg-destructive/10 h-5 w-5 rounded-lg"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeTab(tab.id);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </motion.div>
                    ) : (
                      <motion.div
                        key={`${tab.id}-expanded`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex h-full flex-col"
                        onClick={() => setActiveTabId(tab.id)}
                      >
                        <div className="pointer-events-auto flex items-center justify-between border-b px-3 pb-2 pr-1.5 pt-3 dark:bg-[#313131]">
                          <h3 className="text-sm font-medium">{tab.subject || 'New Email'}</h3>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => toggleMinimize(tab.id)}
                            >
                              <Minus className="h-3 w-3 text-[#909090]" />
                            </Button>
                            {!isMobile && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => toggleFullscreen(tab.id)}
                              >
                                <Maximize2 className="h-3 w-3 text-[#909090]" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeTab(tab.id);
                              }}
                            >
                              <X className="h-3 w-3 text-[#909090]" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto dark:bg-[#313131]">
                          <ComposeTabContent
                            tab={tab}
                            tabId={tab.id}
                            onSendEmail={handleSendEmail}
                            onChange={(updates) => updateTab({ id: tab.id, updates })}
                            updateTab={updateTab}
                            settingsLoading={settingsLoading}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {/*
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-lg border bg-[#FFFFFF] dark:bg-[#202020]"
              onClick={handleAddTab}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </motion.div>
        */}
        </div>
      </div>
    </>
  );
}

import { useCopiedOtpCodes } from '@/hooks/use-copied-otp-codes';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useCopyToClipboard } from './use-copy-to-clipboard';
import { useTRPC } from '@/providers/query-provider';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

export interface OTPEmail {
  id: string;
  threadId: string;
  messageId: string;
  code?: string;
  service: string;
  from: string;
  subject: string;
  isCopied: boolean;
  receivedAt: string | Date;
  expiresAt?: string | Date | null;
  type: 'otp' | 'ml';
  url?: string;
}

export function useOTPEmails(connectionId: string) {
  const trpc = useTRPC();
  const { markAsCopied, isCodeCopied } = useCopiedOtpCodes();
  const { copyToClipboard } = useCopyToClipboard();
  const [copiedCodes, setCopiedCodes] = useState<Set<string>>(new Set());

  console.log(connectionId);

  const { data, isLoading, error, refetch } = useQuery(
    trpc.authItems.list.queryOptions(
      {
        connectionId,
        // includeExpired: false,
        limit: 20,
      },
      {
        refetchInterval: 30000,
        staleTime: 10000,
      },
    ),
  );

  const markAsCopiedMutation = useMutation({
    ...trpc.authItems.markConsumed.mutationOptions(),
    onSuccess: () => {
      refetch();
    },
  });

  const deleteMutation = useMutation({
    ...trpc.authItems.delete.mutationOptions(),
    onSuccess: () => {
      refetch();
      toast.success('OTP removed', {
        description: 'The OTP code has been removed from your list.',
      });
    },
    onError: () => {
      toast.error('Error', {
        description: 'Failed to remove OTP code.',
      });
    },
  });

  const deleteExpiredMutation = useMutation({
    ...trpc.authItems.delete.mutationOptions(),
    onSuccess: () => {
      refetch();
      toast.success('Expired OTPs cleared', {
        description: 'All expired OTP codes have been removed.',
      });
    },
  });

  const handleCopyCode = useCallback(
    async (otp: OTPEmail) => {
      await copyToClipboard(otp?.code || '', otp.id);
      markAsCopied(otp.id);
      setCopiedCodes((prev) => new Set([...prev, otp.id]));

      if (!otp.isCopied) {
        markAsCopiedMutation.mutate({ id: otp.id });
      }

      toast.success('Copied!', {
        description: `${otp.service} code copied to clipboard`,
      });
    },
    [copyToClipboard, markAsCopied, markAsCopiedMutation],
  );

  const handleDeleteOTP = useCallback(
    (otpId: string) => {
      deleteMutation.mutate({ id: otpId });
    },
    [deleteMutation],
  );

  const handleClearExpired = useCallback(
    (id: string) => {
      deleteExpiredMutation.mutate({ id });
    },
    [deleteExpiredMutation],
  );

  console.log(data);

  const otpEmails = data?.items || [];

  const activeOTPs = otpEmails.filter((otp) => {
    const isExpired = otp.expiresAt && new Date(otp.expiresAt) < new Date();
    return !isExpired;
  });

  const hasExpiredOTPs = otpEmails.length > activeOTPs.length;

  console.log(otpEmails);

  return {
    otpEmails: activeOTPs,
    isLoading,
    error,
    refetch,
    handleCopyCode,
    handleDeleteOTP,
    handleClearExpired,
    hasExpiredOTPs,
    isCodeCopied: (otpId: string) => copiedCodes.has(otpId) || isCodeCopied(otpId),
    isDeletingOTP: deleteMutation.isPending,
    isClearingExpired: deleteExpiredMutation.isPending,
  };
}

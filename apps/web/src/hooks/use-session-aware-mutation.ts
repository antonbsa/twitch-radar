import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query"
import { useAuth } from "@/context/auth-context"
import { ApiRequestError } from "@/lib/errors"

export function useSessionAwareMutation<
  TData,
  TVariables = void,
  TContext = unknown,
>(
  options: UseMutationOptions<TData, Error, TVariables, TContext>,
): UseMutationResult<TData, Error, TVariables, TContext> {
  const { markReconnectRequired } = useAuth()

  return useMutation({
    ...options,
    onError: (error, variables, onMutateResult, context) => {
      if (error instanceof ApiRequestError && error.status === 401) {
        markReconnectRequired()
      }
      options.onError?.(error, variables, onMutateResult, context)
    },
  })
}

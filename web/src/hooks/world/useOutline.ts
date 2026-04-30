import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { worldApi } from '@/services/api'
import { worldKeys } from './keys'
import type { OutlineApproveRequest } from '@/types/api'

export function useOutlineState(novelId: number, enabled: boolean = true) {
  return useQuery({
    queryKey: worldKeys.outlineState(novelId),
    queryFn: () => worldApi.getOutlineState(novelId),
    enabled: enabled && Number.isFinite(novelId) && novelId > 0,
  })
}

export function useApproveOutline(novelId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: OutlineApproveRequest) => worldApi.approveOutline(novelId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: worldKeys.outlineState(novelId) })
      qc.invalidateQueries({ queryKey: worldKeys.systems(novelId) })
      qc.invalidateQueries({ queryKey: worldKeys.all(novelId) })
    },
  })
}

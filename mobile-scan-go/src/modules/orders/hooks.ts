import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'; import { ordersApi } from './api';
export const useOrders=()=>useQuery({queryKey:['orders'],queryFn:ordersApi.list});
export const useOrder=(id:string)=>useQuery({queryKey:['orders',id],queryFn:()=>ordersApi.detail(id),enabled:!!id});
export const usePendingSubstitutions=(id:string)=>useQuery({queryKey:['orders',id,'substitutions'],queryFn:()=>ordersApi.pendingSubstitutions(id),enabled:!!id,refetchInterval:15000});
export const useRespondSubstitution=()=>{const qc=useQueryClient();return useMutation({mutationFn:({orderId,productId,decision}:{orderId:string;productId:string;decision:'APPROVED'|'REJECTED'})=>ordersApi.respondToSubstitution(orderId,productId,decision),onSuccess:(_,v)=>{qc.invalidateQueries({queryKey:['orders']});qc.invalidateQueries({queryKey:['orders',v.orderId,'substitutions']});}});};

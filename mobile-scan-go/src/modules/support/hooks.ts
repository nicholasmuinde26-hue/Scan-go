import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'; import { supportApi } from './api';
export const useSupportTickets=()=>useQuery({queryKey:['support','tickets'],queryFn:supportApi.list});
export const useCreateTicket=()=>{const qc=useQueryClient();return useMutation({mutationFn:supportApi.create,onSuccess:()=>qc.invalidateQueries({queryKey:['support','tickets']})});};
export const useSendTicketMessage=()=>{const qc=useQueryClient();return useMutation({mutationFn:({ticketId,message}:{ticketId:string;message:string})=>supportApi.sendMessage(ticketId,message),onSuccess:()=>qc.invalidateQueries({queryKey:['support','tickets']})});};

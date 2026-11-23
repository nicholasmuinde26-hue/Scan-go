import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'; import { presenceApi } from './api';
export const usePresence=(storeId?:string)=>useQuery({queryKey:['presence','session',storeId],queryFn:()=>presenceApi.session(storeId),enabled:!!storeId});
export const useCheckIn=()=>{const qc=useQueryClient();return useMutation({mutationFn:({code,gps}:{code:string;gps?:{latitude:number;longitude:number}})=>presenceApi.enter(code,gps),onSuccess:(_,v)=>qc.invalidateQueries({queryKey:['presence','session']})});};
